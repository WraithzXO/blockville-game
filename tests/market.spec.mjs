// Server-run NPC market simulation tests. Each test gets a FRESH server
// (fast tick via BV_MARKET_TICK_MS) so world state never leaks between cases,
// and every assertion stays event-driven.
process.env.BV_MARKET_TICK_MS = '100';
import { startServer, Client, runTests } from './harness.mjs';

async function withServer(fn) {
  const stop = await startServer();
  try { await fn(); } finally { stop(); }
}

const tests = [
  ['welcome carries the seeded starter listings', () => withServer(async () => {
    const a = new Client();
    const w = await a.join('A', 0, 0, { plotIds: [100, 101, 102], community: [] });
    if (!Array.isArray(w.listings) || w.listings.length !== 3) throw new Error(`starter listings missing: ${JSON.stringify(w.listings)}`);
    const ids = w.listings.map((l) => l.id).sort((x, y) => x - y);
    if (ids[0] !== 1 || ids[1] !== 2 || ids[2] !== 3) throw new Error(`unexpected listing ids: ${ids}`);
    a.close();
  })],

  ['NPC sim claims are identical for every connected client', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, { plotIds: [110, 111, 112, 113], community: [] });
    const b = new Client(); await b.join('B');
    // the NPC does one random market action per tick, so claims need a long window
    const claim = await a.waitFor((m) => m.t === 'simClaim', 'sim claim', 20_000);
    if (![110, 111, 112, 113].includes(claim.plot)) throw new Error(`claim outside seeded plots: ${claim.plot}`);
    const same = await b.waitFor((m) => m.t === 'simClaim' && m.plot === claim.plot && m.type === claim.type && m.name === claim.name, 'identical sim claim on B', 20_000);
    if (!same.name) throw new Error('sim claim missing resident name');
    const c = new Client();
    const w = await c.join('C');
    const rec = w.plots.find(([p]) => Number(p) === claim.plot)?.[1];
    if (!rec || rec.owner !== claim.name || rec.type !== claim.type || rec.done !== true) throw new Error(`newcomer missing NPC claim: ${JSON.stringify(rec)}`);
    a.close(); b.close(); c.close();
  })],

  ['NPC sim never claims a connected player\'s plot', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, { plotIds: [120, 121], community: [] });
    a.send({ t: 'claim', plot: 120, ownerName: 'A', type: 'house' });
    // once 121 is taken by the sim, no free plots remain — 120 must never appear
    // the NPC picks one random free plot per tick, so a specific plot needs a long window
    await a.waitFor((m) => m.t === 'simClaim' && m.plot === 121, 'sim claims the free plot', 20_000);
    await a.expectNone((m) => m.t === 'simClaim' && m.plot === 120, 'sim claim on player plot', 1500);
    a.close();
  })],

  ['NPC sim can buy a real player\'s listing and pays them', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, { plotIds: [130, 131, 132, 133, 134, 135], community: [] });
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 130, ownerName: 'A', type: 'house' });
    await b.waitFor((m) => m.t === 'claim' && m.plot === 130, 'claim seen by B');
    a.send({ t: 'list', plot: 130, price: 7700 });
    const listing = await b.waitFor((m) => m.t === 'simList' && m.plot === 130 && m.seller === 'A', 'player listing broadcast');
    // The NPC buys ONE random listing per tick, so ours competes with the
    // seeded/NPC listings (up to 7). A long window keeps this deterministic
    // in practice: ~200 ticks at a 15%/tick buy chance.
    const sale = await a.waitFor((m) => m.t === 'simBuy' && m.id === listing.id, 'NPC buys the listing', 20_000);
    if (sale.sellerName !== 'A' || sale.price !== 7700) throw new Error(`bad sale: ${JSON.stringify(sale)}`);
    const bsale = await b.waitFor((m) => m.t === 'simBuy' && m.id === listing.id, 'same sale seen by B', 20_000);
    if (bsale.ownerName !== sale.ownerName) throw new Error('sale owner differs between clients');
    a.close(); b.close();
  })],
];

const failed = await runTests(tests);
process.exit(failed ? 1 : 0);
