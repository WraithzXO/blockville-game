// Town Park / community building upgrade tests.
// Phase 1: reducer unit tests (bundled from the real state.tsx via esbuild).
// Phase 2: server protocol tests — the upgrade relay, its validation, and the
// welcome snapshot. Every wait is event-driven (no sleeps).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { startServer, Client, runTests } from './harness.mjs';

// ── phase 1: reducer ────────────────────────────────────────────────────────
const outfile = 'tests/.upgrade-bundle.mjs';
await build({
  entryPoints: ['tests/upgrade-reducer.ts'],
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

const tests = [
  ['upgrade relays to a connected peer and updates the record', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    a.send({ t: 'upgrade', plot: 94, level: 2 });
    const up = await b.waitFor((m) => m.t === 'upgrade' && m.plot === 94, 'upgrade relay');
    if (up.level !== 2) throw new Error(`wrong level relayed: ${up.level}`);
    a.close(); b.close();
  })],

  ['late joiner receives the upgraded level in the welcome snapshot', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    a.send({ t: 'upgrade', plot: 94, level: 2 });
    a.send({ t: 'upgrade', plot: 94, level: 3 });
    const c = new Client();
    const w = await c.join('C');
    const park = (w.plots || []).find(([id]) => id === 94);
    if (!park || park[1].level !== 3) throw new Error(`welcome park record: ${JSON.stringify(park)}`);
    a.close(); c.close();
  })],

  ['skip-level, downgrade and over-max upgrades are rejected', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    a.send({ t: 'upgrade', plot: 94, level: 3 });            // skip 2
    await b.expectNone((m) => m.t === 'upgrade' && m.plot === 94, 'skip-level upgrade');
    const w = await (new Client()).join('C');
    const park = (w.plots || []).find(([id]) => id === 94);
    if (!park || park[1].level !== 1) throw new Error(`level changed on skip: ${JSON.stringify(park)}`);
    a.send({ t: 'upgrade', plot: 94, level: 5 });            // over max
    a.send({ t: 'upgrade', plot: 94, level: 0 });            // nonsense
    await b.expectNone((m) => m.t === 'upgrade' && m.plot === 94, 'invalid upgrade');
    a.close(); b.close();
  })],

  ['valid sequential steps are accepted, then the cap stops further ones', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    for (const level of [2, 3, 4]) {
      a.send({ t: 'upgrade', plot: 94, level });
      await b.waitFor((m) => m.t === 'upgrade' && m.plot === 94 && m.level === level, `upgrade to ${level}`);
    }
    a.send({ t: 'upgrade', plot: 94, level: 5 });
    await b.expectNone((m) => m.t === 'upgrade' && m.plot === 94, '5th upgrade');
    a.close(); b.close();
  })],

  ['another resident’s plot cannot be upgraded by someone else', () => withServer(async () => {
    const a = new Client(); await a.join('A', 0, 0, WORLD);
    const b = new Client(); await b.join('B');
    // B claims plot 5
    b.send({ t: 'claim', plot: 5, ownerName: 'B', type: 'house', progress: 48, done: true });
    await a.waitFor((m) => m.t === 'claim' && m.plot === 5, 'claim relay');
    a.send({ t: 'upgrade', plot: 5, level: 2 });
    await b.expectNone((m) => m.t === 'upgrade' && m.plot === 5, 'foreign plot upgrade');
    a.close(); b.close();
  })],
];

const failed = await runTests(tests);
process.exit(failed ? 1 : 0);
