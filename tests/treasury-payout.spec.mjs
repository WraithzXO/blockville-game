// Chunk T3 tests — weighted payout engine: point formula, weights, round-down
// remainder retention, NPC exclusion, cycle idempotency/replay, claim gating
// and treasury restart coherence. Pure in-process; no real transactions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTests } from './harness.mjs';
import { createTreasury } from '../server/treasury.mjs';
import { createDistributor } from '../server/distribute.mjs';
import {
  CYCLE, BUILD_BLOCKS, UPGRADE_MULT, GARDEN_MULT, BASE_PLOT_POINTS,
  plotScore, playerWeights,
} from '../server/tokenomics.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bv-payout-'));
const mkPlot = (owner, type, level = 1, garden = false) => ({
  owner, type, progress: BUILD_BLOCKS[type], done: true, level, garden,
});

// Jacob: one Bank (20+75=95) · Sasha: two Shops (50 each) → Σ 195
const twoPlayerPlots = () => [
  mkPlot('Jacob', 'bank'),
  mkPlot('Sasha', 'shop'),
  mkPlot('Sasha', 'shop'),
];

// fund a treasury with an exact token balance via the recycling path
const fund = (t, tokens) => {
  const r = t.payShop('seed', tokens, { reported: true });
  if (!r.ok) throw new Error(`fund failed: ${JSON.stringify(r)}`);
};

const tests = [
  ['point formula: every building × every level, with and without Garden Kit', () => {
    for (const [, B] of Object.entries(BUILD_BLOCKS)) {
      for (let level = 1; level <= 4; level++) {
        for (const garden of [false, true]) {
          const expected = (BASE_PLOT_POINTS + B) * UPGRADE_MULT[level - 1] * (garden ? GARDEN_MULT : 1);
          const got = plotScore({ owner: 'Jacob', type: Object.keys(BUILD_BLOCKS).find((k) => BUILD_BLOCKS[k] === B), progress: B, done: true, level, garden });
          if (Math.abs(got - expected) > 1e-9) throw new Error(`formula wrong: B=${B} L=${level} garden=${garden} → ${got} ≠ ${expected}`);
        }
      }
    }
  }],

  ['the 399-point Level 4 Bank + Garden example', () => {
    const got = plotScore({ owner: 'Jacob', type: 'bank', progress: 75, done: true, level: 4, garden: true });
    if (got !== 399) throw new Error(`L4 bank+garden = ${got}, expected 399`);
  }],

  ['player weights sum per owner across plots', () => {
    const w = playerWeights(twoPlayerPlots());
    if (w.size !== 2) throw new Error(`wrong owners: ${w.size}`);
    const jacob = 95, sasha = 100; // bank 95; two shops 100
    if (w.get('Jacob') !== jacob || w.get('Sasha') !== sasha) throw new Error(`weights ${JSON.stringify([...w])}`);
    if (jacob + sasha !== 195) throw new Error('fixture drift');
  }],

  ['round DOWN per player; the remainder stays in the treasury', () => {
    const t = createTreasury({});
    fund(t, 1000);                       // 20% → D = 200
    const d = createDistributor({ treasury: t, getPlots: () => twoPlayerPlots() });
    const res = d.runCycle(5_000_000);   // a fixed, deterministic cycle id
    if (!res.ok) throw new Error(`cycle failed: ${JSON.stringify(res)}`);
    if (res.distributable !== 200) throw new Error(`distributable ${res.distributable}`);
    const expectedJacob = Math.floor(200 * 95 / 195);  // 97
    const expectedSasha = Math.floor(200 * 100 / 195); // 102
    if (res.paid !== expectedJacob + expectedSasha) throw new Error(`paid ${res.paid}`);
    if (res.remainder !== 200 - res.paid || res.remainder !== 1) throw new Error(`remainder ${res.remainder}`);
    if (t.balance !== 1000 - res.paid) throw new Error(`treasury not debited exactly: ${t.balance}`);
    if (d.claimableOf('Jacob') !== expectedJacob || d.claimableOf('Sasha') !== expectedSasha) throw new Error('claimable split wrong');
    const payoutEvents = d.ledger().filter((e) => e.kind === 'payout');
    if (payoutEvents.length !== 2) throw new Error(`payout events ${payoutEvents.length}`);
    if (payoutEvents.some((e) => e.cycle !== res.cycle)) throw new Error('payout not keyed by cycle');
  }],

  ['NPC-owned and Town Council plots appear in state, score 0, receive NOTHING', () => {
    const plots = [
      ...twoPlayerPlots(),
      mkPlot('Nova', 'bank', 4, true),      // NPC — would be the biggest earner
      mkPlot('Resident F', 'shop', 3),      // generated NPC
      mkPlot('Town Council', 'casino', 4),  // community building
    ];
    const t = createTreasury({});
    fund(t, 1000);
    const d = createDistributor({ treasury: t, getPlots: () => plots });
    const res = d.runCycle(6_000_000);
    if (!res.ok) throw new Error(`cycle failed: ${JSON.stringify(res)}`);
    if (res.totalPoints !== 195) throw new Error(`totalPoints ${res.totalPoints} — NPC/Town points leaked`);
    for (const npc of ['Nova', 'Resident F', 'Town Council']) {
      if (d.claimableOf(npc) !== 0) throw new Error(`${npc} was paid`);
    }
  }],

  ['zero eligible plots → cycle skipped, treasury untouched', () => {
    const t = createTreasury({});
    fund(t, 1000);
    const d = createDistributor({
      treasury: t,
      getPlots: () => [
        { owner: '', type: 'bank', done: true, level: 1 },        // unowned
        { owner: 'Jacob', type: 'bank', progress: 10, done: false }, // unfinished
        mkPlot('Nova', 'shop'),                                    // NPC only
      ],
    });
    const res = d.runCycle(7_000_000);
    if (res.skipped !== true || res.reason !== 'no_eligible_plots') throw new Error(`wrong skip: ${JSON.stringify(res)}`);
    if (t.balance !== 1000) throw new Error('treasury mutated on a skipped cycle');
    if (d.ledger().some((e) => e.kind === 'payout')) throw new Error('payout on a skipped cycle');
  }],

  ['treasury below one distributable token → cycle skipped and logged', () => {
    const t = createTreasury({});
    fund(t, 3); // 20% → 0.6 → floors to 0
    const d = createDistributor({ treasury: t, getPlots: () => twoPlayerPlots() });
    const res = d.runCycle(8_000_000);
    if (res.skipped !== true || res.reason !== 'treasury_below_one_token') throw new Error(`wrong skip: ${JSON.stringify(res)}`);
  }],

  ['a crash mid-cycle replays EXACTLY once on restart', () => {
    const dir = tmp();
    const ledgerPath = path.join(dir, 'cycles.jsonl');
    const claimablePath = path.join(dir, 'claimable.json');
    const t = createTreasury({});
    fund(t, 1000);
    const d1 = createDistributor({ treasury: t, getPlots: () => twoPlayerPlots(), ledgerPath, claimablePath });
    // simulate a crash between the first and second payout
    const orig = t.distributeDebit.bind(t);
    let calls = 0;
    t.distributeDebit = (...args) => { if (++calls >= 2) throw new Error('simulated crash'); return orig(...args); };
    let threw = false;
    try { d1.runCycle(9_000_000); } catch { threw = true; }
    t.distributeDebit = orig;
    if (!threw) throw new Error('crash simulation did not trigger');
    if (d1.claimableOf('Jacob') === 0) throw new Error('first payout should have landed before the crash');

    // restart: a fresh distributor on the same ledger completes the cycle once
    const d2 = createDistributor({ treasury: t, getPlots: () => twoPlayerPlots(), ledgerPath, claimablePath });
    if (!d2.replay || d2.replay.replayed.length !== 1 || d2.replay.replayed[0] !== 'Sasha') {
      throw new Error(`replay wrong: ${JSON.stringify(d2.replay)}`);
    }
    // read the PERSISTED ledger file: d2's in-memory mirror only holds its
    // own replay events, while the file holds both runs
    const fileRows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const paidEvents = fileRows.filter((e) => e.kind === 'payout');
    const names = paidEvents.map((e) => e.name).sort();
    if (names.join(',') !== 'Jacob,Sasha') throw new Error(`payout replay duplication: ${names}`);
    if (d2.claimableOf('Jacob') !== 97 || d2.claimableOf('Sasha') !== 102) {
      throw new Error(`claimables after replay: ${d2.claimableOf('Jacob')}/${d2.claimableOf('Sasha')}`);
    }
    if (t.balance !== 1000 - 199) throw new Error(`treasury after replay ${t.balance}`);
  }],

  ['the same cycle id never distributes twice', () => {
    const t = createTreasury({});
    fund(t, 1000);
    const d = createDistributor({ treasury: t, getPlots: () => twoPlayerPlots() });
    const first = d.runCycle(10_000_000);
    const second = d.runCycle(10_000_000 + CYCLE.intervalMs / 2); // still the same 5-min window
    if (!first.ok || second.skipped !== true || second.reason !== 'stale_or_repeat_cycle') {
      throw new Error(`double run: ${JSON.stringify(second)}`);
    }
    if (t.balance !== 1000 - first.paid) throw new Error('double debit');
  }],

  ['claims are refused while the kill switch is off (dry-run accrual only)', async () => {
    const t = createTreasury({});
    fund(t, 1000);
    const d = createDistributor({ treasury: t, getPlots: () => twoPlayerPlots() });
    d.runCycle(11_000_000);
    const before = d.claimableOf('Jacob');
    const res = await d.claim('Jacob');
    if (res.ok !== false || res.reason !== 'not_live') throw new Error(`claim allowed while idle: ${JSON.stringify(res)}`);
    if (d.claimableOf('Jacob') !== before) throw new Error('claimable mutated by a refused claim');
    if ((await d.claim('Stranger')).ok !== false) throw new Error('unknown claimant paid');
  }],

  ['treasury counters survive a restart (replay coherence)', () => {
    const dir = tmp();
    const statePath = path.join(dir, 'state.json');
    const t1 = createTreasury({ statePath });
    fund(t1, 500);
    t1.recordFees(1.0);
    const t2 = createTreasury({ statePath });
    if (t2.balance !== 500 || t2.gasReserve !== 0.2 || t2.pendingBuyback !== 0.8) {
      throw new Error(`state not restored: ${JSON.stringify({ b: t2.balance, g: t2.gasReserve, p: t2.pendingBuyback })}`);
    }
  }],
];

await runTests(tests);
