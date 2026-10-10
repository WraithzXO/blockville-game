// Reducer-level tests for the Town Park / community building upgrade.
// Bundled by tests/upgrade.spec.mjs so it runs against the REAL state.tsx.
import { reducer, initial, type State } from '../src/game/state';

const st = initial;
// make the Town Council park (plot 94) upgradable and give the tester SOL
const withPark = (s: State, sol = 10) => ({
  ...s,
  sol,
  plots: s.plots.map((p) => (p.id === 94 ? { ...p, done: true } : p)),
});

let fails = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`PASS  ${name}`);
  else { fails++; console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

// 1. a Town Council plot upgrades (this is the Town Park fix)
const after = reducer(withPark(st, 10), { t: 'upgrade', plot: 94 });
const park = after.plots.find((p) => p.id === 94)!;
check('Town Council park upgrades to level 2', park.level === 2, park.level);
check('SOL deducted for the upgrade fee', after.sol === 10 - 0.1, after.sol);

// 2. the level persists across unrelated actions (no regression)
const after2 = reducer(after, { t: 'setStoreOpen', open: true });
const park2 = after2.plots.find((p) => p.id === 94)!;
check('upgrade level persists', park2.level === 2, park2.level);

// 3. remote upgrade applies and never regresses
const s3 = withPark(st);
const r1 = reducer(s3, { t: 'remoteUpgrade', plot: 94, level: 3 });
check('remote upgrade raises the level', r1.plots.find((p) => p.id === 94)!.level === 3);
const r2 = reducer(r1, { t: 'remoteUpgrade', plot: 94, level: 2 });
check('stale remote upgrade does not regress', r2.plots.find((p) => p.id === 94)!.level === 3);

// 4. welcome snapshot with a level keeps it (remoteClaim carries level)
const s4 = withPark(st);
const r3 = reducer(s4, { t: 'remoteClaim', plot: 94, ownerName: 'Town Council', type: 'park', progress: 25, done: true, level: 4 });
check('remoteClaim carries the upgraded level', r3.plots.find((p) => p.id === 94)!.level === 4);

// 5. a foreign (NPC-resident) plot still cannot be upgraded locally
const s5 = withPark(st);
const s5b = { ...s5, plots: s5.plots.map((p) => (p.id === 50 ? { ...p, done: true, owner: 'other' as const, ownerName: 'Nova' } : p)) };
const r4 = reducer(s5b, { t: 'upgrade', plot: 50 });
check('NPC-resident plot is not upgradeable', r4.plots.find((p) => p.id === 50)!.level === 1);

export const REDUCER_FAILURES = fails;
