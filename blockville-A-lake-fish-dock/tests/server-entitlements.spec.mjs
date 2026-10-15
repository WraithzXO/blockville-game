// Chunk 6 — server-side entitlement integration through the real WS server.
// Runs a spawned server with env-tuned timings (fast sweep/guard) and the
// env-gated demo-holdings route so a real LIFO revocation can be driven
// end-to-end: engine → plotOwners cleared → plotRevoked broadcast → the plot
// is claimable by a second player. Plot ids are the spec's own synthetic
// block (200+) seeded into the world by the first joiner, like market.spec.
import { startServer, Client, runTests } from './harness.mjs';

const tests = [];

// Env is read by the spawned server at boot — set before startServer().
process.env.BV_DEMO_SEED_TOKENS = '40000';        // tier 2 per player
process.env.BV_ENTITLEMENT_VERIFY_MS = '250';     // fast sweep
process.env.BV_ENTITLEMENT_GUARD_MS = '500';      // fast guard gap
process.env.BV_ALLOW_DEMO_HOLDINGS_SET = '1';     // dev/test route ON
process.env.BV_MARKET_TICK_MS = '3600000';        // NPC sim effectively idle

const WORLD = { plotIds: Array.from({ length: 60 }, (_, i) => 200 + i), community: [] };

let stop;
tests.push(['setup: spawn the tuned server', async () => { stop = await startServer(); }]);

tests.push(['entitlement snapshot arrives on join (server-computed, verified)', async () => {
  const c = new Client();
  await c.join('TierTwo', 0, 0, WORLD); // first joiner seeds the world
  const e = await c.waitFor((m) => m.t === 'entitlement', 'entitlement');
  if (e.tokens !== 40000 || e.entitlement !== 2 || e.claimed !== 0 || !e.verified) throw new Error(`bad snapshot: ${JSON.stringify(e)}`);
  c.close();
}]);

tests.push(['claims inside the tier are accepted and counted', async () => {
  const c = new Client();
  await c.join('Builder');
  // The claim relay never echoes to the claimer's own socket (the local
  // client already applied it), so acceptance is confirmed via the
  // server-computed entitlement counter instead.
  for (const [plot, n] of [[201, 1], [202, 2]]) {
    c.send({ t: 'claim', plot, ownerName: 'Builder', type: 'house' });
    await c.waitFor((m) => m.t === 'entitlement' && m.claimed === n, `claim ${plot} counted`);
  }
  const e = await c.waitFor((m) => m.t === 'entitlement' && m.claimed === 2, 'entitlement after claims');
  if (e.entitlement !== 2) throw new Error(`tier wrong: ${JSON.stringify(e)}`);
  c.close();
}]);

tests.push(['SERVER: claim beyond the entitlement is rejected by the server', async () => {
  const c = new Client();
  await c.join('Over');
  for (const [plot, n] of [[210, 1], [211, 2]]) {
    c.send({ t: 'claim', plot, ownerName: 'Over', type: 'house' });
    await c.waitFor((m) => m.t === 'entitlement' && m.claimed === n, `claim ${plot} counted`);
  }
  // third claim: tier is 2 → the server must refuse, and nobody else hears a claim
  c.send({ t: 'claim', plot: 212, ownerName: 'Over', type: 'house' });
  const denied = await c.waitFor((m) => m.t === 'claimDenied' && m.plot === 212, 'claimDenied');
  if (denied.reason !== 'entitlement_full') throw new Error(`reason: ${denied.reason}`);
  const w = new Client();
  await w.join('Witness');
  await w.expectNone((m) => m.t === 'claim' && m.plot === 212 && m.ownerName === 'Over', 'relayed over-claim');
  // and the refused plot stays free: a second player can take it
  w.send({ t: 'claim', plot: 212, ownerName: 'Witness', type: 'cafe' });
  await w.waitFor((m) => m.t === 'entitlement' && m.claimed === 1, 'witness claim counted');
  w.close();
  c.close();
}]);

tests.push(['Claim Permit adds a real server-side slot', async () => {
  const c = new Client();
  await c.join('Permitted');
  // tier 2 + one permit = 3 slots; the permit is counted SERVER-side from the
  // authoritative shop-purchase report (the client balance is irrelevant here)
  c.send({ t: 'shopPurchase', item: 'permit' });
  await c.waitFor((m) => m.t === 'entitlement' && m.claimed === 0, 'entitlement baseline');
  const plots = [230, 231, 232];
  for (const [i, plot] of plots.entries()) {
    c.send({ t: 'claim', plot, ownerName: 'Permitted', type: 'house' });
    await c.waitFor((m) => m.t === 'entitlement' && m.claimed === i + 1, `permit claim ${i + 1}`);
  }
  c.send({ t: 'claim', plot: 233, ownerName: 'Permitted', type: 'house' });
  const denied = await c.waitFor((m) => m.t === 'claimDenied' && m.plot === 233, '4th claim denied');
  if (denied.reason !== 'entitlement_full') throw new Error(`reason: ${denied.reason}`);
  c.close();
}]);

tests.push(['LIFO revocation: below-tier holdings revoke the most recent plot, server-side', async () => {
  const a = new Client();
  await a.join('Seller');
  const older = 220, newer = 221;
  a.send({ t: 'claim', plot: older, ownerName: 'Seller', type: 'house' });
  await a.waitFor((m) => m.t === 'entitlement' && m.claimed === 1, 'claim older counted');
  a.send({ t: 'claim', plot: newer, ownerName: 'Seller', type: 'cafe' });
  await a.waitFor((m) => m.t === 'entitlement' && m.claimed === 2, 'claim newer counted');

  // drive the simulated holding below the two-plot tier via the gated route
  const res = await fetch(`http://localhost:${process.env.PORT}/api/dev/demo-holdings`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Seller', tokens: 20000 }),
  });
  if (!res.ok) throw new Error(`demo-holdings route failed: ${res.status}`);

  // sweeps ≥500ms apart later: the NEWER plot is revoked, the older kept
  const rev = await a.waitFor((m) => m.t === 'plotRevoked' && m.plot === newer, 'plotRevoked', 8000);
  if (rev.prevOwner !== 'Seller' || rev.reason !== 'below_tier') throw new Error(`bad revoke: ${JSON.stringify(rev)}`);
  await a.expectNone((m) => m.t === 'plotRevoked' && m.plot === older, 'older plot revoked', 1500);
  const e = await a.waitFor((m) => m.t === 'entitlement' && m.claimed === 1, 'entitlement after revoke');
  if (e.entitlement !== 1) throw new Error(`tier after revoke: ${JSON.stringify(e)}`);

  // the revoked plot is immediately claimable by a second player (and the
  // engine records it, proving the slot is really free server-side)
  const b = new Client();
  await b.join('NextIn');
  b.send({ t: 'claim', plot: newer, ownerName: 'NextIn', type: 'shop' });
  await b.waitFor((m) => m.t === 'entitlement' && m.claimed === 1, 're-claim by second player counted');
  b.close();
  a.close();
}]);

tests.push(['cleanup: stop the server', async () => { stop?.(); }]);

runTests(tests);
