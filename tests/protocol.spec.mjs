// Protocol-level determinism tests for the Blockville multiplayer server.
// Each test runs against a fresh server instance so ordering can never leak
// between cases. Covers join/world-state, position sync, plot claims
// (first-wins + conflict correction + newcomer visibility), house-state
// ownership guard, arcade scoring guards, and leave broadcast.
import { startServer, Client, runTests } from './harness.mjs';

const stop = await startServer();

const tests = [
  ['welcome gives id + world state arrays', async () => {
    const a = new Client();
    const w = await a.join('Alice');
    if (!w.id) throw new Error('welcome has no id');
    if (!Array.isArray(w.plots) || !Array.isArray(w.houses) || !Array.isArray(w.arcadeScores) || !Array.isArray(w.listings)) throw new Error('welcome missing world-state arrays');
    a.close();
  }],

  ['position sync broadcasts exact values including zero', async () => {
    const a = new Client(); await a.join('A');
    const b = new Client(); await b.join('B');
    a.send({ t: 'pos', x: 12.5, z: -3.25, ry: 1.5 });
    const p = await b.waitFor((m) => m.t === 'pos' && m.x === 12.5, 'pos for B');
    if (p.z !== -3.25 || p.ry !== 1.5) throw new Error(`bad payload: ${JSON.stringify(p)}`);
    a.send({ t: 'pos', x: 0, z: 0, ry: 0 });
    const z = await b.waitFor((m) => m.t === 'pos' && m.x === 0 && m.z === 0, 'zero pos');
    if (z.ry !== 0) throw new Error('zero ry lost (truthiness bug)');
    a.close(); b.close();
  }],

  ['first claim wins; conflicting claim is corrected, not relayed', async () => {
    const a = new Client(); await a.join('A');
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 1, ownerName: 'A' });
    await b.waitFor((m) => m.t === 'claim' && m.plot === 1 && m.ownerName === 'A', 'claim broadcast');
    b.send({ t: 'claim', plot: 1, ownerName: 'B', prev: 'A' });
    // B must be told the plot still belongs to A — and no conflicting
    // 'claim owner B' broadcast may reach A.
    const corr = await b.waitFor((m) => m.t === 'claim' && m.plot === 1, 'correction');
    if (corr.ownerName !== 'A') throw new Error(`B was told owner is ${corr.ownerName}`);
    await a.expectNone((m) => m.t === 'claim' && m.plot === 1 && m.ownerName === 'B', 'conflicting claim broadcast');
    a.close(); b.close();
  }],

  ['same-name re-claim is idempotent, no duplicate correction', async () => {
    const a = new Client(); await a.join('A');
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 2, ownerName: 'A' });
    await b.waitFor((m) => m.t === 'claim' && m.plot === 2, 'first claim');
    a.send({ t: 'claim', plot: 2, ownerName: 'A' });
    await a.expectNone((m) => m.t === 'claim' && m.plot === 2, 'echo of own re-claim');
    a.close(); b.close();
  }],

  ['new joiner receives existing plot ownership', async () => {
    const a = new Client(); await a.join('A');
    // Use a second client to deterministically confirm the claim was
    // processed before the newcomer joins (cross-socket ordering).
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 3, ownerName: 'A' });
    await b.waitFor((m) => m.t === 'claim' && m.plot === 3, 'claim confirmed');
    b.close();
    const c = new Client();
    const w = await c.join('C');
    const entry = w.plots.find(([p]) => Number(p) === 3);
    if (!entry || entry[1].owner !== 'A') throw new Error(`welcome plots missing claim: ${JSON.stringify(w.plots)}`);
    a.close(); c.close();
  }],

  ['claim carries the building type and everyone sees it', async () => {
    const a = new Client(); await a.join('A');
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 5, ownerName: 'A', type: 'cafe' });
    const seen = await b.waitFor((m) => m.t === 'claim' && m.plot === 5, 'claim with type');
    if (seen.type !== 'cafe' || seen.done !== false || seen.progress !== 0) throw new Error(`bad record: ${JSON.stringify(seen)}`);
    const c = new Client();
    const w = await c.join('C');
    const rec = w.plots.find(([p]) => Number(p) === 5)?.[1];
    if (!rec || rec.owner !== 'A' || rec.type !== 'cafe') throw new Error(`newcomer missing building: ${JSON.stringify(rec)}`);
    a.close(); b.close(); c.close();
  }],

  ['build progress is validated, relayed, and flips done at the cost', async () => {
    const a = new Client(); await a.join('A');
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 6, ownerName: 'A', type: 'park' }); // park costs 25
    await b.waitFor((m) => m.t === 'claim' && m.plot === 6, 'claim');
    b.send({ t: 'build', plot: 6, progress: 10, done: false }); // non-owner build
    await b.expectNone((m) => m.t === 'build' && m.plot === 6, 'non-owner build relay');
    a.send({ t: 'build', plot: 6, progress: 10, done: false });
    const s1 = await b.waitFor((m) => m.t === 'build' && m.plot === 6, 'progress relay');
    if (s1.progress !== 10 || s1.done !== false) throw new Error(`bad progress: ${JSON.stringify(s1)}`);
    a.send({ t: 'build', plot: 6, progress: 99, done: false }); // clamped to cost
    const s2 = await b.waitFor((m) => m.t === 'build' && m.plot === 6 && m.progress === 25, 'clamped progress');
    if (s2.done !== true) throw new Error('done not flipped at cost');
    a.close(); b.close();
  }],

  ['listed plot transfers to the buyer; seller sees the sale with price', async () => {
    const a = new Client(); await a.join('A');
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 7, ownerName: 'A', type: 'house' });
    await b.waitFor((m) => m.t === 'claim' && m.plot === 7, 'claim');
    // without a listing, a prev-claim is still a conflict
    b.send({ t: 'claim', plot: 7, ownerName: 'B', prev: 'A' });
    const corr = await b.waitFor((m) => m.t === 'claim' && m.plot === 7, 'correction');
    if (corr.ownerName !== 'A') throw new Error(`transfer without listing allowed (owner ${corr.ownerName})`);
    // A lists, then B buys with prev
    a.send({ t: 'list', plot: 7, price: 5000 });
    const listing = await b.waitFor((m) => m.t === 'simList' && m.plot === 7, 'listing broadcast');
    if (listing.seller !== 'A' || listing.price !== 5000) throw new Error(`bad listing: ${JSON.stringify(listing)}`);
    b.send({ t: 'claim', plot: 7, ownerName: 'B', prev: 'A' });
    const sold = await a.waitFor((m) => m.t === 'claim' && m.plot === 7 && m.prev === 'A', 'sale relay to seller');
    if (sold.ownerName !== 'B' || sold.price !== 5000) throw new Error(`bad sale: ${JSON.stringify(sold)}`);
    await b.waitFor((m) => m.t === 'unlist', 'listing consumed');
    // the buyer gets a clean confirmation too
    await b.waitFor((m) => m.t === 'claim' && m.plot === 7 && m.ownerName === 'B' && !m.prev, 'buyer confirmation');
    a.close(); b.close();
  }],

  ['leave is broadcast with the departed id', async () => {
    const a = new Client(); const wa = await a.join('A');
    const b = new Client(); const w = await b.join('B');
    a.close();
    await b.waitFor((m) => m.t === 'leave' && m.id === wa.id, 'leave');
    b.close();
  }],

  ['only the plot owner may set house state', async () => {
    const a = new Client(); await a.join('A');
    const b = new Client(); await b.join('B');
    a.send({ t: 'claim', plot: 4, ownerName: 'A' });
    await b.waitFor((m) => m.t === 'claim' && m.plot === 4, 'claim');
    b.send({ t: 'houseState', plot: 4, placements: [{ id: 'x', itemId: 'rug', x: 0, z: 0, rotation: 0, locked: false }] });
    const err = await b.waitFor((m) => m.t === 'error', 'error for non-owner');
    if (!/owner/i.test(err.reason)) throw new Error(`unexpected reason: ${err.reason}`);
    a.send({ t: 'houseState', plot: 4, placements: [{ id: 'x', itemId: 'rug', x: 9, z: 0, rotation: 0, locked: false }] });
    const ack = await a.waitFor((m) => m.t === 'houseState' && m.plot === 4, 'owner broadcast');
    const placed = ack.placements[0];
    if (placed.x !== 5.8) throw new Error(`server did not clamp placement x (got ${placed.x})`);
    a.close(); b.close();
  }],

  ['arcade scores are guarded: no run, out of range, then valid', async () => {
    const a = new Client(); await a.join('A');
    a.send({ t: 'arcadeScore', gameId: 'reaction', score: 100 });
    await a.expectNone((m) => m.t === 'arcadeScores', 'score without declared run');
    a.send({ t: 'arcadeStart', gameId: 'reaction' });
    a.send({ t: 'arcadeScore', gameId: 'reaction', score: 5000 });
    await a.expectNone((m) => m.t === 'arcadeScores', 'out-of-range score');
    a.send({ t: 'arcadeScore', gameId: 'reaction', score: 1200 });
    const board = await a.waitFor((m) => m.t === 'arcadeScores', 'valid score board');
    if (!board.scores.some((s) => s.name === 'A' && s.score === 1200)) throw new Error(`valid score missing: ${JSON.stringify(board.scores)}`);
    a.send({ t: 'arcadeScore', gameId: 'reaction', score: 1300 });
    await a.expectNone((m) => m.t === 'arcadeScores' && board.scores.length < 99, 'double submission');
    a.close();
  }],
];

const failed = await runTests(tests);
stop();
process.exit(failed ? 1 : 0);
