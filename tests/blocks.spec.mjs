// Client block-balance regression tests: the reducer must never let the
// building-block balance go negative, and claim-conflict refunds must return
// exactly what was spent. The reducer is exercised via an esbuild bundle of
// the real src/game/state.tsx module.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// Bundle inside the project so external imports (react) resolve from
// node_modules; both scratch files are removed after the run.
const outfile = 'tests/.blocks-bundle.mjs';
const entry = 'tests/.blocks-entry.ts'; // inside the project so ../src resolves
writeFileSync(entry, "export { reducer } from '../src/game/state';\n");
await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  define: { 'import.meta.env.DEV': 'false' },
  external: ['react', 'react/jsx-runtime'],
});
const { reducer } = await import(pathToFileURL(outfile).href);
rmSync(entry, { force: true });
rmSync(outfile, { force: true });

const COST = 48; // house
const mkState = (blocks, extra = {}) => ({
  blocks,
  toolkit: false,
  balance: 0,
  staked: 20_000, // one plot unlocked, so claims are allowed
  permit: false,
  name: 'you',
  feed: [],
  toasts: [],
  listings: [],
  plots: Array.from({ length: 12 }, (_, i) => ({
    id: i,
    owner: null,
    ownerName: null,
    type: null,
    progress: 0,
    done: false,
  })),
  ...extra,
});
const plot = (s, id) => s.plots.find((p) => p.id === id);

const results = [];
const test = (name, fn) => {
  try {
    fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message}`);
    process.exitCode = 1;
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

test('buildClick with 0 blocks never goes negative', () => {
  let s = mkState(0);
  s = reducer(s, { t: 'claim', plot: 0, type: 'house' }); // should be refused (0 blocks)
  assert(s.blocks === 0, `claim should be refused, blocks=${s.blocks}`);
  s = reducer(s, { t: 'buildClick', plot: 0 });
  assert(s.blocks === 0, `blocks must not go negative, got ${s.blocks}`);
  assert(plot(s, 0).type === null, 'nothing should have been built');
});

test('buildClick with fractional balance (<1) does nothing', () => {
  let s = mkState(0.4);
  s = reducer(s, { t: 'buildClick', plot: 0 });
  assert(s.blocks === 0.4, `balance unchanged, got ${s.blocks}`);
});

test('repeated buildClicks drain to exactly 0, never below', () => {
  // 58 blocks: 48 for the claim, 10 left for progress — building cannot
  // finish, so 200 clicks must bottom out at exactly 0.
  let s = mkState(58);
  s = reducer(s, { t: 'claim', plot: 0, type: 'house' });
  assert(s.blocks === 10, `claim cost deducted, got ${s.blocks}`);
  for (let i = 0; i < 100; i++) {
    s = reducer(s, { t: 'buildClick', plot: 0 });
    assert(s.blocks >= 0, `negative balance after click ${i}: ${s.blocks}`);
  }
  assert(s.blocks === 0, `balance should drain to 0, got ${s.blocks}`);
  assert(plot(s, 0).done === false, 'progress must not exceed the blocks actually spent');
});

test('toolkit clicks also stop at 0', () => {
  // 49 blocks: 48 for the claim, 1 left — a 2-block toolkit click must
  // clamp to the 1 remaining block.
  let s = mkState(49, { toolkit: true });
  s = reducer(s, { t: 'claim', plot: 0, type: 'house' });
  for (let i = 0; i < 100; i++) {
    s = reducer(s, { t: 'buildClick', plot: 0 });
    assert(s.blocks >= 0, `negative balance after click ${i}: ${s.blocks}`);
  }
  assert(s.blocks === 0, `balance should drain to 0, got ${s.blocks}`);
  assert(plot(s, 0).progress === 1, `progress should equal blocks spent, got ${plot(s, 0).progress}`);
  assert(plot(s, 0).done === false, 'an unfinished build must not report done');
});

test('duplicate claim on the same tick does not double-spend', () => {
  let s = mkState(60);
  s = reducer(s, { t: 'claim', plot: 0, type: 'house' });
  const after = s.blocks;
  s = reducer(s, { t: 'claim', plot: 0, type: 'house' });
  assert(s.blocks === after, `second claim must be refused, blocks went ${after} -> ${s.blocks}`);
});

test('claim conflict refunds claim cost plus build progress', () => {
  let s = mkState(200);
  s = reducer(s, { t: 'claim', plot: 0, type: 'house' });
  for (let i = 0; i < 10; i++) s = reducer(s, { t: 'buildClick', plot: 0 });
  const spent = 200 - s.blocks; // cost + 10 progress blocks
  // Server refuses our claim: relay has no prev owner and someone else owns it.
  s = reducer(s, { t: 'remoteClaim', plot: 0, ownerName: 'rival', prev: null, type: 'house', progress: plot(s, 0).progress, done: false });
  assert(Math.abs(s.blocks - (200 - spent + spent)) < 1e-9, `full refund expected, got ${s.blocks}`);
  assert(plot(s, 0).owner === null && plot(s, 0).type === null, 'plot should be reset after conflict');
});

console.log(results.join('\n'));
if (process.exitCode) console.log('BLOCKS FAILED');
else console.log('ALL PASS');
