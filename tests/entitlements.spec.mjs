// Chunk 6 — holding-based plot entitlement with strict tier enforcement.
// Engine-level tests drive the pure engine with injected readers and a fake
// clock (deterministic, no RPC). Server-level tests exercise the real claim
// gate and the plotRevoked broadcast through the WS harness with env-tuned
// guard timings (see tests/server-entitlements.spec.mjs).

import {
  createEntitlementEngine, createDemoHoldings, createRpcHoldingsReader, entitlementFor,
} from '../server/entitlements.mjs';
import { ENTITLEMENT } from '../server/tokenomics.mjs';
import { runTests } from './harness.mjs';

// Engine with an injectable holdings store + controllable clock.
function makeEngine(initialTokens = 100_000) {
  let t = 1_000_000; // fake epoch ms
  const holdings = new Map(); // key -> tokens
  const h = (k) => (holdings.has(k) ? holdings.get(k) : initialTokens);
  const failures = new Set(); // keys currently failing their RPC read
  const engine = createEntitlementEngine({
    now: () => t,
    ledgerPath: null,
    onRevoke: (key, plot, info) => engine.__revoked.push({ key, plot, info, at: t }),
    readHoldings: async (key) => (failures.has(key)
      ? { ok: false, reason: 'rpc_down' }
      : { ok: true, tokens: h(key) }),
  });
  engine.__revoked = [];
  return {
    engine,
    time: () => t,
    tick: (ms) => { t += ms; },
    setHoldings: (k, v) => holdings.set(k, v),
    fail: (k) => failures.add(k),
    unfail: (k) => failures.delete(k),
  };
}

const tests = [

  // ── tier math ────────────────────────────────────────────────────────────
  ['entitlement at each tier and above 100,000 (cap)', () => {
    const rows = [[0, 0], [19_999, 0], [20_000, 1], [39_999, 1], [40_000, 2], [59_999, 2],
      [99_999, 4], [100_000, 5], [150_000, 5], [10_000_000, 5]];
    for (const [tokens, want] of rows) {
      if (entitlementFor(tokens) !== want) throw new Error(`${tokens} → ${entitlementFor(tokens)}, want ${want}`);
    }
  }],

  ['config values: 20k per plot, cap 5, guard of two reads ≥30s apart', () => {
    if (ENTITLEMENT.tokensPerPlot !== 20_000) throw new Error('tokensPerPlot moved');
    if (ENTITLEMENT.maxPlots !== 5) throw new Error('maxPlots moved');
    if (ENTITLEMENT.guardReads !== 2) throw new Error('guardReads must be 2');
    if (ENTITLEMENT.guardGapMs < 30_000) throw new Error('guardGapMs below 30s');
    if (ENTITLEMENT.readCacheMs < 30_000 || ENTITLEMENT.readCacheMs > 60_000) throw new Error('cache outside 30–60s');
  }],

  // ── claiming ─────────────────────────────────────────────────────────────
  ['claims up to the entitlement are allowed, beyond rejected', async () => {
    const env = makeEngine(60_000); // tier 3
    for (let plot = 1; plot <= 3; plot++) {
      const d = await env.engine.canClaim('alice');
      if (!d.allowed) throw new Error(`claim ${plot} of 3 denied: ${d.reason}`);
      env.engine.recordClaim('alice', plot);
    }
    const d = await env.engine.canClaim('alice');
    if (d.allowed) throw new Error('claim 4 of 3 was allowed');
    if (d.reason !== 'entitlement_full') throw new Error(`reason ${d.reason}`);
  }],

  ['claim-time holdings lookups use the brief cache', async () => {
    const env = makeEngine(40_000); // tier 2
    if (!(await env.engine.canClaim('a')).allowed) throw new Error('first claim should pass');
    env.engine.recordClaim('a', 1); env.engine.recordClaim('a', 2);
    env.setHoldings('a', 10_000); // tier drops NOW, but the cached read is fresh
    env.tick(5_000);
    const d = await env.engine.canClaim('a'); // served from cache → still tier 2 → full
    if (d.allowed || d.reason !== 'entitlement_full') throw new Error(`cached tier not used: ${JSON.stringify(d)}`);
    env.tick(ENTITLEMENT.readCacheMs + 1);
    const d2 = await env.engine.canClaim('a'); // fresh read → tier 0 → denied for tier, not fullness
    if (d2.allowed) throw new Error('stale cache let a 0-tier player claim');
    if (d2.reason !== 'entitlement_full') throw new Error(`expected entitlement_full on 0 tier, got ${d2.reason}`);
  }],

  // ── LIFO revocation ──────────────────────────────────────────────────────
  ['40,000 held with 2 claims; sell 10,000 → most recent plot revoked, older kept', async () => {
    const env = makeEngine(40_000); // tier 2
    await env.engine.verify('bob');
    env.engine.recordClaim('bob', 11); env.engine.recordClaim('bob', 12);
    env.setHoldings('bob', 30_000); // sold 10,000 → tier 1
    // pass 1: below-tier read logged, nothing revoked yet (guard)
    const v1 = await env.engine.verify('bob');
    if (!v1.ok || v1.revoked !== null) throw new Error(`first below read revoked: ${JSON.stringify(v1)}`);
    if (env.engine.claimsOf('bob').length !== 2) throw new Error('claims changed during guard');
    env.tick(ENTITLEMENT.guardGapMs + 1);
    // pass 2: second consecutive below read, ≥30s later → LIFO revoke
    const v2 = await env.engine.verify('bob');
    if (!v2.ok || v2.revoked !== 12) throw new Error(`expected plot 12 revoked, got ${JSON.stringify(v2)}`);
    const claims = env.engine.claimsOf('bob');
    if (claims.length !== 1 || claims[0] !== 11) throw new Error(`older plot not kept: ${claims}`);
    if (env.engine.__revoked.length !== 1 || env.engine.__revoked[0].plot !== 12) throw new Error('revoke event missing');
    if (env.engine.__revoked[0].info.count !== 2) throw new Error('ledger info missing read count');
  }],

  ['multi-tier drop removes plots one at a time, most recent first', async () => {
    const env = makeEngine(120_000); // tier 5
    await env.engine.verify('carl');
    for (const p of [1, 2, 3, 4, 5]) env.engine.recordClaim('carl', p);
    env.setHoldings('carl', 25_000); // tier drops to 1 → three revocations needed
    for (let i = 0; i < 3; i++) {
      const v1 = await env.engine.verify('carl');
      if (v1.revoked !== null) throw new Error(`pass ${i}: revoked during guard (${v1.revoked})`);
      env.tick(ENTITLEMENT.guardGapMs + 1);
      const v2 = await env.engine.verify('carl');
      if (v2.revoked !== 5 - i) throw new Error(`expected LIFO plot ${5 - i}, got ${v2.revoked}`);
    }
    if (JSON.stringify(env.engine.claimsOf('carl')) !== '[1,2]') throw new Error(`claims after multi-tier drop: ${env.engine.claimsOf('carl')}`);
    // a fourth below-tier pass has nothing left to revoke (claims ≤ tier)
    env.tick(ENTITLEMENT.guardGapMs + 1);
    const v = await env.engine.verify('carl');
    if (v.revoked !== null) throw new Error('revoked below the tier');
  }],

  ['re-claim after recovery: holdings rise back, streak clears, claim allowed', async () => {
    const env = makeEngine(40_000); // tier 2
    await env.engine.verify('dora');
    env.engine.recordClaim('dora', 7); env.engine.recordClaim('dora', 8);
    env.setHoldings('dora', 15_000); // tier 0
    const v1 = await env.engine.verify('dora');
    if (v1.revoked !== null) throw new Error('revoked during guard');
    env.setHoldings('dora', 80_000); // recovers before the second read
    env.tick(ENTITLEMENT.guardGapMs + 1);
    const v2 = await env.engine.verify('dora');
    if (v2.revoked !== null) throw new Error('revoked after recovery');
    if (env.engine.claimsOf('dora').length !== 2) throw new Error('recovery lost claims');
    const d = await env.engine.canClaim('dora'); // tier 4, claimed 2 → free
    if (!d.allowed) throw new Error(`recovery did not re-open claiming: ${d.reason}`);
  }],

  ['revoked plot leaves the claims list (so it is excluded from scoring)', async () => {
    const env = makeEngine(20_000); // tier 1
    await env.engine.verify('eve');
    env.engine.recordClaim('eve', 42);
    env.setHoldings('eve', 5_000);
    await env.engine.verify('eve');
    env.tick(ENTITLEMENT.guardGapMs + 1);
    const v = await env.engine.verify('eve');
    if (v.revoked !== 42) throw new Error(`expected 42 revoked, got ${v.revoked}`);
    // The payout engine reads the server's plot records; the server deletes the
    // record on revocation, so the plot contributes no weight. Engine-side the
    // equivalent guarantee: the plot is no longer in the claims list.
    if (env.engine.claimsOf('eve').includes(42)) throw new Error('revoked plot still claimed');
    if (env.engine.snapshot('eve').claimed !== 0) throw new Error('snapshot still counts the revoked plot');
  }],

  // ── safety: never revoke on unknown data ─────────────────────────────────
  ['no revocation during RPC failure (and the streak resets)', async () => {
    const env = makeEngine(40_000);
    await env.engine.verify('finn');
    env.engine.recordClaim('finn', 21); env.engine.recordClaim('finn', 22);
    env.setHoldings('finn', 10_000);
    await env.engine.verify('finn'); // below read #1
    env.fail('finn');                // RPC dies before read #2
    env.tick(ENTITLEMENT.guardGapMs + 1);
    const v = await env.engine.verify('finn');
    if (v.ok) throw new Error('failed read reported ok');
    if (env.engine.claimsOf('finn').length !== 2) throw new Error('revoked on failed RPC');
    env.unfail('finn');              // RPC back — the streak restarts from zero
    const v2 = await env.engine.verify('finn');
    if (v2.revoked !== null) throw new Error('revoked on the first read after an outage');
    env.tick(ENTITLEMENT.guardGapMs + 1);
    const v3 = await env.engine.verify('finn');
    if (v3.revoked !== 22) throw new Error('two clean below-reads after the outage should revoke');
  }],

  ['two-read guard: reads closer than 30s apart never revoke', async () => {
    const env = makeEngine(40_000);
    await env.engine.verify('gail');
    env.engine.recordClaim('gail', 31); env.engine.recordClaim('gail', 32);
    env.setHoldings('gail', 10_000);
    await env.engine.verify('gail');
    env.tick(ENTITLEMENT.guardGapMs - 1_000); // just under the gap
    const v = await env.engine.verify('gail');
    if (v.revoked !== null || !v.guarded) throw new Error(`revoked inside the guard gap: ${JSON.stringify(v)}`);
    if (env.engine.claimsOf('gail').length !== 2) throw new Error('claims changed inside the guard');
  }],

  ['one successful below read alone never revokes', async () => {
    const env = makeEngine(40_000);
    await env.engine.verify('hal');
    env.engine.recordClaim('hal', 51); env.engine.recordClaim('hal', 52);
    env.setHoldings('hal', 1_000);
    env.tick(ENTITLEMENT.guardGapMs * 10); // plenty of time — but only ONE below read
    const v = await env.engine.verify('hal');
    if (v.revoked !== null) throw new Error('single below read revoked');
  }],

  // ── demo store + RPC reader shape ────────────────────────────────────────
  ['demo holdings are server-side and seed every player at the configured tier', () => {
    const demo = createDemoHoldings({ seedTokens: 100_000 });
    if (demo.reader('anyone').tokens !== 100_000) throw new Error('demo seed wrong');
    if (demo.reader('anyone').ok !== true) throw new Error('demo reader must succeed');
    demo.set('anyone', 15_000);
    if (demo.reader('anyone').tokens !== 15_000) throw new Error('demo set ignored');
    demo.seed('fresh');
    if (demo.reader('fresh').tokens !== 100_000) throw new Error('demo seed(new) wrong');
  }],

  ['RPC reader: sums token accounts, reports failures honestly', async () => {
    const calls = [];
    const fakeFetch = async (url, opts) => {
      calls.push({ url, body: JSON.parse(opts.body) });
      if (calls.length === 1) return { ok: true, json: async () => ({ result: { accounts: [
        { account: { data: { parsed: { info: { tokenAmount: { uiAmount: 30_000 } } } } } },
        { account: { data: { parsed: { info: { tokenAmount: { uiAmount: 12_345 } } } } } },
      ] } }) };
      return { ok: false, status: 503 };
    };
    const read = createRpcHoldingsReader({ rpcUrl: 'https://rpc.test', mint: 'MINT1111', fetchImpl: fakeFetch });
    const good = await read('WALLET1');
    if (!good.ok || good.tokens !== 42_345) throw new Error(`rpc sum wrong: ${JSON.stringify(good)}`);
    const bad = await read('WALLET1');
    if (bad.ok || bad.reason !== 'rpc_status_503') throw new Error(`rpc failure not honest: ${JSON.stringify(bad)}`);
    if (calls[0].body.method !== 'getTokenAccountsByOwner') throw new Error('wrong RPC method');
    if (JSON.stringify(calls[0].body).includes('secret') || calls[0].body.params[0] !== 'WALLET1') throw new Error('request must carry only the public wallet + mint');
  }],

  ['ledger records claims, releases and revocations with owner and tiers', async () => {
    const { writeFileSync, readFileSync, mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(`${tmpdir()}/ent-`);
    const ledgerPath = `${dir}/entitlements.jsonl`;
    let t = 5_000_000;
    let ivyTokens = 20_000;
    const engine = createEntitlementEngine({
      ledgerPath,
      now: () => t,
      readHoldings: async () => ({ ok: true, tokens: ivyTokens }),
    });
    await engine.verify('ivy');
    engine.recordClaim('ivy', 9);
    engine.release('ivy', 9);
    engine.recordClaim('ivy', 10);
    ivyTokens = 0; // holdings drop below the one-plot tier
    await engine.verify('ivy');
    t += ENTITLEMENT.guardGapMs + 1;
    await engine.verify('ivy');
    const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const kinds = lines.map((e) => e.kind);
    if (!kinds.includes('plot_claimed') || !kinds.includes('plot_released') || !kinds.includes('plot_revoked')) throw new Error(`ledger kinds: ${kinds}`);
    const rev = lines.find((e) => e.kind === 'plot_revoked');
    if (rev.owner !== 'ivy' || rev.plot !== 10 || rev.claims !== 0) throw new Error(`revocation record incomplete: ${JSON.stringify(rev)}`);
    if (!rev.reads || rev.reads.count < 2) throw new Error('revocation record missing the triggering reads');
    writeFileSync(`${dir}/ignore`, 'x'); // keep tmpdir import used
  }],
];

runTests(tests);
