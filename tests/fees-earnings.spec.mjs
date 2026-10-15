// Fee payouts in the Personal tab + lifetime fees earned (earnings-card
// chunk): the SERVER snapshot every figure is built from. Pure in-process,
// same pattern as treasury-payout.spec.mjs — no real transactions.
//
// What is verified here:
//   • a completed payout cycle produces a ledger-backed entry per recipient
//     (amount, cycle id, cycle timestamp) in distributor.feesSnapshot()
//   • non-recipients get NO entry and a zero total
//   • the lifetime total accumulates across cycles
//   • a NEW distributor (server restart) rebuilds the lifetime totals from
//     the persisted cycles ledger — the figure never lives in memory only
//   • skipped cycles contribute nothing
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTests } from './harness.mjs';
import { createTreasury } from '../server/treasury.mjs';
import { createDistributor } from '../server/distribute.mjs';
import { CYCLE } from '../server/tokenomics.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bv-fees-'));
const mkPlot = (owner, type, level = 1, garden = false) => ({
  owner, type, progress: 75, done: true, level, garden,
});
const fund = (t, tokens) => {
  const r = t.payShop('seed', tokens, { reported: true });
  if (!r.ok) throw new Error(`fund failed: ${JSON.stringify(r)}`);
};

// Jacob: one Bank (95) · Sasha: two Shops (50 each) → Σ 195, same fixture
// as treasury-payout.spec.mjs
const twoPlayerPlots = () => [
  mkPlot('Jacob', 'bank'),
  mkPlot('Sasha', 'shop'),
  mkPlot('Sasha', 'shop'),
];

const tests = [
  ['a completed cycle produces a Personal-log-backed entry per recipient: amount, cycle id, timestamp', () => {
    const dir = tmp();
    const t = createTreasury({});
    fund(t, 1000); // 20% → D = 200
    const d = createDistributor({
      treasury: t,
      getPlots: () => twoPlayerPlots(),
      ledgerPath: path.join(dir, 'cycles.jsonl'),
      claimablePath: path.join(dir, 'claimable.json'),
    });
    const res = d.runCycle(5_000_000);
    if (!res.ok) throw new Error(`cycle failed: ${JSON.stringify(res)}`);
    const expectedJacob = Math.floor(200 * 95 / 195);  // 97
    const expectedSasha = Math.floor(200 * 100 / 195); // 102
    for (const [name, expected] of [['Jacob', expectedJacob], ['Sasha', expectedSasha]]) {
      const snap = d.feesSnapshot(name);
      if (snap.total !== expected) throw new Error(`${name} total ${snap.total} ≠ ${expected}`);
      if (snap.entries.length !== 1) throw new Error(`${name} entries ${snap.entries.length}`);
      const e = snap.entries[0];
      if (e.amount !== expected) throw new Error(`${name} entry amount ${e.amount}`);
      if (e.cycle !== res.cycle) throw new Error(`${name} entry cycle ${e.cycle} ≠ ${res.cycle}`);
      if (!Number.isFinite(e.ts) || !(e.ts > 0)) throw new Error(`${name} entry has no usable timestamp: ${e.ts}`);
    }
  }],

  ['non-recipients get NO entry and a zero total', () => {
    const dir = tmp();
    const t = createTreasury({});
    fund(t, 1000);
    const d = createDistributor({
      treasury: t,
      getPlots: () => twoPlayerPlots(),
      ledgerPath: path.join(dir, 'cycles.jsonl'),
      claimablePath: path.join(dir, 'claimable.json'),
    });
    const res = d.runCycle(5_000_000);
    if (!res.ok) throw new Error(`cycle failed: ${JSON.stringify(res)}`);
    for (const name of ['Carol', 'Nova', 'Town Council']) {
      const snap = d.feesSnapshot(name);
      if (snap.total !== 0) throw new Error(`${name} got total ${snap.total}`);
      if (snap.entries.length !== 0) throw new Error(`${name} got entries: ${JSON.stringify(snap.entries)}`);
    }
  }],

  ['the lifetime total accumulates across cycles', () => {
    const dir = tmp();
    const t = createTreasury({});
    fund(t, 2000);
    const d = createDistributor({
      treasury: t,
      getPlots: () => twoPlayerPlots(),
      ledgerPath: path.join(dir, 'cycles.jsonl'),
      claimablePath: path.join(dir, 'claimable.json'),
    });
    const c1 = d.runCycle(5_000_000);
    if (!c1.ok) throw new Error(`cycle 1 failed`);
    // cycle 2: Sasha sold out — only Jacob's plot remains
    d.runCycle(5_000_000 + CYCLE.intervalMs);
    const snap = d.feesSnapshot('Jacob');
    if (snap.entries.length !== 2) throw new Error(`Jacob entries ${snap.entries.length}, expected 2`);
    if (snap.entries[0].cycle <= snap.entries[1].cycle) throw new Error('entries not newest-first');
    const totalFromEntries = snap.entries.reduce((s, e) => s + e.amount, 0);
    if (snap.total !== totalFromEntries) throw new Error(`total ${snap.total} ≠ Σ entries ${totalFromEntries}`);
  }],

  ['restart: a NEW distributor rebuilds lifetime totals from the persisted ledger', () => {
    const dir = tmp();
    const ledgerPath = path.join(dir, 'cycles.jsonl');
    const claimablePath = path.join(dir, 'claimable.json');
    const t1 = createTreasury({});
    fund(t1, 1000);
    const d1 = createDistributor({ treasury: t1, getPlots: () => twoPlayerPlots(), ledgerPath, claimablePath });
    const res = d1.runCycle(5_000_000);
    if (!res.ok) throw new Error('cycle failed');
    const expectedJacob = Math.floor(200 * 95 / 195);
    const before = d1.feesSnapshot('Jacob');
    // a fresh process would read the same ledger files — simulate exactly that
    const t2 = createTreasury({});
    const d2 = createDistributor({ treasury: t2, getPlots: () => [], ledgerPath, claimablePath });
    const after = d2.feesSnapshot('Jacob');
    if (after.total !== before.total || after.total !== expectedJacob) {
      throw new Error(`rebuilt total ${after.total} ≠ ${before.total} (expected ${expectedJacob})`);
    }
    if (JSON.stringify(after.entries) !== JSON.stringify(before.entries)) {
      throw new Error(`rebuilt entries differ: ${JSON.stringify(after.entries)} vs ${JSON.stringify(before.entries)}`);
    }
  }],

  ['skipped cycles contribute nothing to fees earned', () => {
    const dir = tmp();
    const t = createTreasury({});
    fund(t, 1000);
    const d = createDistributor({
      treasury: t,
      getPlots: () => [mkPlot('Nova', 'bank')], // NPC only → skip
      ledgerPath: path.join(dir, 'cycles.jsonl'),
      claimablePath: path.join(dir, 'claimable.json'),
    });
    const res = d.runCycle(5_000_000);
    if (res.skipped !== true) throw new Error(`expected skip: ${JSON.stringify(res)}`);
    const snap = d.feesSnapshot('Nova');
    if (snap.total !== 0 || snap.entries.length !== 0) throw new Error(`skipped cycle paid: ${JSON.stringify(snap)}`);
  }],
];

runTests(tests);
