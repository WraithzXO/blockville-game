// Furniture purchase / placement / house-entry tests.
// Phase 1: reducer unit tests (bundled from the real state.tsx via esbuild).
// Phase 2: server protocol tests — houseState validation and echo behaviour.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { startServer, Client, runTests } from './harness.mjs';

// ── phase 1: reducer ────────────────────────────────────────────────────────
const outfile = 'tests/.furniture-bundle.mjs';
await build({
  entryPoints: ['tests/furniture-reducer.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
  jsx: 'automatic',
});
const reducerProbe = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });
if (reducerProbe.REDUCER_FAILURES) throw new Error(`${reducerProbe.REDUCER_FAILURES} reducer test(s) failed — see PASS/FAIL lines above`);

// ── phase 2: protocol ───────────────────────────────────────────────────────
async function withServer(fn) {
  const stop = await startServer();
  try { await fn(); } finally { stop(); }
}

const WORLD = {
  plotIds: Array.from({ length: 111 }, (_, i) => i),
  community: [[94, 'park'], [17, 'shop']],
};

// claim plot 50 as A, confirmed via a peer (the server does not echo a claim
// back to the claimant), and wait until the houseState is registered.
async function claimHouse(a, b) {
  a.send({ t: 'claim', plot: 50, ownerName: 'A', type: 'house' });
  await b.waitFor((m) => m.t === 'claim' && m.plot === 50 && m.ownerName === 'A', 'claim broadcast');
}

const tests = [
  ['houseState from the owner is relayed to peers', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    await claimHouse(a, b);
    const placements = [{ id: 'p1', itemId: 'bed', x: 1, z: 2, rotation: 0, locked: false }];
    a.send({ t: 'houseState', plot: 50, placements });
    const hs = await b.waitFor((m) => m.t === 'houseState' && m.plot === 50, 'houseState relay');
    if (hs.placements.length !== 1 || hs.placements[0].itemId !== 'bed') throw new Error(JSON.stringify(hs));
    a.close(); b.close();
  })],

  ['houseState from a non-owner is rejected', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    b.send({ t: 'claim', plot: 60, ownerName: 'B', type: 'house' });
    await a.waitFor((m) => m.t === 'claim' && m.plot === 60 && m.ownerName === 'B', 'claim broadcast');
    a.send({ t: 'houseState', plot: 60, placements: [{ id: 'x', itemId: 'y', x: 0, z: 0, rotation: 0 }] });
    const err = await a.waitFor((m) => m.t === 'error', 'rejection');
    if (!/owner/i.test(err.reason)) throw new Error(`unexpected reason: ${err.reason}`);
    a.close(); b.close();
  })],

  ['houseState clamps out-of-bounds placements server-side', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    await claimHouse(a, b);
    a.send({ t: 'houseState', plot: 50, placements: [{ id: 'p1', itemId: 'bed', x: 99, z: -99, rotation: 0 }] });
    await b.waitFor((m) => m.t === 'houseState' && m.plot === 50, 'peer relay'); // ensure applied
    // fetch the stored state via a late joiner (the sender gets its own relay too)
    const c = new Client();
    const w = await c.join('C');
    const house = (w.houses || []).find(([id]) => id === 50);
    const p = house && house[1][0];
    if (p.x !== 5.8 || p.z !== -4.4) throw new Error(`not clamped: ${JSON.stringify(p)}`);
    a.close(); b.close(); c.close();
  })],

  ['a late joiner receives existing house states in the welcome snapshot', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    await claimHouse(a, b);
    a.send({ t: 'houseState', plot: 50, placements: [{ id: 'p1', itemId: 'rug', x: 0, z: 0, rotation: 0 }] });
    await b.waitFor((m) => m.t === 'houseState' && m.plot === 50, 'relay applied');
    const c = new Client();
    const w = await c.join('C');
    const house = (w.houses || []).find(([id]) => id === 50);
    if (!house || house[1].length !== 1) throw new Error(`welcome houses: ${JSON.stringify(w.houses)}`);
    a.close(); b.close(); c.close();
  })],

  ['house furniture is cleared when the plot changes owner', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    await claimHouse(a, b);
    a.send({ t: 'houseState', plot: 50, placements: [{ id: 'p1', itemId: 'rug', x: 0, z: 0, rotation: 0 }] });
    await b.waitFor((m) => m.t === 'houseState' && m.plot === 50, 'relay applied');
    a.send({ t: 'list', plot: 50, price: 500 });
    // B buys the plot with prev — ownership transfer must drop the old furniture
    b.send({ t: 'claim', plot: 50, ownerName: 'B', type: 'house', prev: 'A' });
    await a.waitFor((m) => m.t === 'claim' && m.plot === 50 && m.ownerName === 'B', 'transfer');
    const c = new Client();
    const w = await c.join('C');
    const house = (w.houses || []).find(([id]) => id === 50);
    if (house && house[1].length !== 0) throw new Error(`stale furniture survived transfer: ${JSON.stringify(house)}`);
    a.close(); b.close(); c.close();
  })],
];

const failed = await runTests(tests);
process.exit(failed ? 1 : 0);
