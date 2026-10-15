// Chunk T4 tests — ledger, audit and cycle reporting: per-cycle report fields
// (exact balance before/after, inflow attribution, per-player weights and
// payouts), the near-zero skip rule, report persistence across restarts and
// the read-only admin endpoint. Pure in-process + one real-server REST check.
// No real transactions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTests, startServer, PORT } from './harness.mjs';
import { createTreasury, createMockVenue } from '../server/treasury.mjs';
import { createDistributor } from '../server/distribute.mjs';
import { CYCLE, ONCHAIN, BUILD_BLOCKS, SWAP } from '../server/tokenomics.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bv-report-'));
const mkPlot = (owner, type, level = 1, garden = false) => ({
  owner, type, progress: BUILD_BLOCKS[type], done: true, level, garden,
});

// Jacob: one Bank (20+75=95) · Sasha: two Shops (50 each) → Σ 195
const plots = () => [mkPlot('Jacob', 'bank'), mkPlot('Sasha', 'shop'), mkPlot('Sasha', 'shop')];

// A timestamp guaranteed to sit inside the CURRENT 5-minute cycle, 60s after
// its start, so intake events and runCycle share one cycle id.
const inCycleTs = () => Math.floor(Date.now() / CYCLE.intervalMs) * CYCLE.intervalMs + 60_000;

const mkSetup = () => {
  const dir = tmp();
  const treasury = createTreasury({});
  const dist = createDistributor({
    treasury,
    getPlots: plots,
    ledgerPath: path.join(dir, 'cycles.jsonl'),
    claimablePath: path.join(dir, 'claimable.json'),
  });
  return { dir, treasury, dist };
};

// Fund the treasury through the real intake path: 1 SOL received → 0.8 SOL
// buyback → mock swap at the default price → tokens; plus 500 shop tokens.
const feed = async (treasury, ts) => {
  treasury.recordFees(1, { ts });
  const price = SWAP.mockTokensPerSol;
  const swapTokens = 0.8 * price;
  const venue = createMockVenue(price);
  await treasury.runBuyback(venue, { ts }); // dynamic-guard startup gate: baseline only, rolls
  const swap = await treasury.runBuyback(venue, { ts });
  if (!swap.tokensOut || swap.tokensOut !== swapTokens) throw new Error(`swap: ${JSON.stringify(swap)}`);
  const shop = treasury.payShop('seed', 500, { reported: true, ts });
  if (!shop.ok) throw new Error(`shop: ${JSON.stringify(shop)}`);
  const up = treasury.payUpgrade('seed', 0.1, { reported: true, ts });
  if (!up.ok) throw new Error(`upgrade: ${JSON.stringify(up)}`);
};
const BALANCE_BEFORE = swapTokens() + 500;
function swapTokens() { return 0.8 * SWAP.mockTokensPerSol; }

const tests = [
  ['full cycle report: exact balances, inflows, weights and payouts', async () => {
    const { treasury, dist } = mkSetup();
    const ts = inCycleTs();
    await feed(treasury, ts);
    const res = dist.runCycle(ts);
    if (!res.ok) throw new Error(`cycle failed: ${JSON.stringify(res)}`);
    const [r] = dist.cycleReports(1);
    const distributable = Math.floor(BALANCE_BEFORE * CYCLE.distributePct);
    const jacobAmt = Math.floor(distributable * 95 / 195);
    const sashaAmt = Math.floor(distributable * 100 / 195);
    const want = {
      cycle: r.cycle, balanceBefore: BALANCE_BEFORE, buybackAdded: swapTokens(), shopIn: 500,
      upgradeSolIn: 0.1, balanceUsedForDistribution: distributable, totalPoints: 195,
      paid: jacobAmt + sashaAmt, remainder: distributable - (jacobAmt + sashaAmt), balanceAfter: BALANCE_BEFORE - (jacobAmt + sashaAmt),
    };
    for (const [k, v] of Object.entries(want)) {
      if (r[k] !== v) throw new Error(`report.${k} = ${r[k]}, want ${v}`);
    }
    // balanceAfter must equal balanceBefore − paid, exactly.
    if (r.balanceBefore - r.paid !== r.balanceAfter) throw new Error('balance after does not reconcile');
    // per-player weight and payout, round-DOWN
    const jacob = r.payouts.find((p) => p.name === 'Jacob');
    const sasha = r.payouts.find((p) => p.name === 'Sasha');
    if (!jacob || !sasha) throw new Error(`missing payouts: ${JSON.stringify(r.payouts)}`);
    if (jacob.weight !== 95 || sasha.weight !== 100) throw new Error('weights wrong');
    if (jacob.amount !== jacobAmt || sasha.amount !== sashaAmt) throw new Error(`payout amounts wrong: ${jacob.amount}/${sasha.amount}`);
    if (r.payouts.length !== 2) throw new Error('unexpected extra payouts');
  }],

  ['report is persisted as one authoritative cycle_report event', () => {
    const { dist } = mkSetup();
    const ts = inCycleTs();
    dist.runCycle(ts); // no treasury funding → skip path
    const evs = dist.ledger();
    const rep = evs.filter((e) => e.kind === 'cycle_report');
    if (rep.length !== 1) throw new Error(`expected 1 cycle_report, got ${rep.length}`);
    if (rep[0].skipped !== true || rep[0].skipReason !== 'treasury_below_one_token') throw new Error(`skip report wrong: ${JSON.stringify(rep[0])}`);
    if (rep[0].balanceBefore !== 0 || rep[0].balanceAfter !== 0) throw new Error('skip balances wrong');
  }],

  ['near-zero treasury: cycle skipped and logged, balance untouched', () => {
    const { treasury, dist } = mkSetup();
    treasury.payShop('seed', 0, { reported: true }); // no-op guard
    const res = dist.runCycle(inCycleTs());
    if (res.skipped !== true || res.reason !== 'treasury_below_one_token') throw new Error(`wrong skip: ${JSON.stringify(res)}`);
    if (treasury.balance !== 0) throw new Error('near-zero skip moved funds');
    const [r] = dist.cycleReports(1);
    if (!r.skipped) throw new Error('skip not in the admin view');
  }],

  ['no eligible plots: skipped and logged, treasury intact', () => {
    const dir = tmp();
    const treasury = createTreasury({});
    treasury.payShop('seed', 1000, { reported: true });
    const dist = createDistributor({ treasury, getPlots: () => [], ledgerPath: path.join(dir, 'c.jsonl') });
    const res = dist.runCycle(inCycleTs());
    if (res.skipped !== true || res.reason !== 'no_eligible_plots') throw new Error(`wrong skip: ${JSON.stringify(res)}`);
    if (treasury.balance !== 1000) throw new Error('no-plot skip moved funds');
    const [r] = dist.cycleReports(1);
    if (r.skipReason !== 'no_eligible_plots' || r.balanceAfter !== 1000) throw new Error(`report wrong: ${JSON.stringify(r)}`);
  }],

  ['cycleReports(n): newest first, honours the limit', () => {
    const { dist } = mkSetup();
    // three distinct cycles: use the NEXT cycles' windows explicitly
    const base = Math.floor(Date.now() / CYCLE.intervalMs) * CYCLE.intervalMs;
    const t1 = base + CYCLE.intervalMs + 60_000;      // next cycle
    const t2 = base + 2 * CYCLE.intervalMs + 60_000;  // cycle after that
    const t3 = base + 3 * CYCLE.intervalMs + 60_000;
    dist.runCycle(t1); dist.runCycle(t2); dist.runCycle(t3); // all skips (empty treasury)
    const all = dist.cycleReports(10);
    if (all.length !== 3) throw new Error(`expected 3 reports, got ${all.length}`);
    if (!(all[0].cycle > all[1].cycle && all[1].cycle > all[2].cycle)) throw new Error('not newest-first');
    if (all[0].cycle !== Math.floor(t3 / CYCLE.intervalMs)) throw new Error('wrong newest cycle');
    const one = dist.cycleReports(1);
    if (one.length !== 1 || one[0].cycle !== all[0].cycle) throw new Error('limit not honoured');
  }],

  ['reports survive a restart (rebuilt from the persisted ledger)', async () => {
    const { dir, treasury, dist } = mkSetup();
    const ts = inCycleTs();
    await feed(treasury, ts);
    dist.runCycle(ts);
    const before = dist.cycleReports(1)[0];
    // second distributor over the SAME ledger file — a restarted server
    const dist2 = createDistributor({
      treasury, getPlots: plots,
      ledgerPath: path.join(dir, 'cycles.jsonl'),
      claimablePath: path.join(dir, 'claimable.json'),
    });
    const after = dist2.cycleReports(1)[0];
    for (const k of ['balanceBefore', 'buybackAdded', 'shopIn', 'balanceUsedForDistribution', 'totalPoints', 'paid', 'remainder', 'balanceAfter']) {
      if (after[k] !== before[k]) throw new Error(`restart lost ${k}: ${after[k]} ≠ ${before[k]}`);
    }
    if (after.payouts.length !== 2) throw new Error('restart lost payouts');
  }],

  ['structured console output carries the exact before/after balances', async () => {
    const lines = [];
    const fakeLog = { log: (s) => lines.push(String(s)) };
    const dir = tmp();
    const treasury = createTreasury({});
    const dist = createDistributor({ treasury, getPlots: plots, ledgerPath: path.join(dir, 'c.jsonl'), log: fakeLog });
    const ts = inCycleTs();
    await feed(treasury, ts);
    dist.runCycle(ts);
    const balAfter = BALANCE_BEFORE - (Math.floor(Math.floor(BALANCE_BEFORE * CYCLE.distributePct) * 95 / 195) + Math.floor(Math.floor(BALANCE_BEFORE * CYCLE.distributePct) * 100 / 195));
    const done = lines.find((l) => l.includes(`balance ${BALANCE_BEFORE} → ${balAfter}`));
    if (!done) throw new Error(`console line wrong; got: ${JSON.stringify(lines)}`);
    const skipLines = [];
    const dist2 = createDistributor({ treasury: createTreasury({}), getPlots: plots, ledgerPath: path.join(dir, 'c2.jsonl'), log: { log: (s) => skipLines.push(String(s)) } });
    dist2.runCycle(inCycleTs());
    if (!skipLines.some((l) => l.includes('SKIPPED (treasury_below_one_token)'))) throw new Error(`skip line missing: ${JSON.stringify(skipLines)}`);
  }],

  ['admin endpoint serves cycle reports and live treasury counters', async () => {
    const stop = await startServer();
    try {
      const res = await fetch(`http://localhost:${PORT}/api/treasury/cycles?limit=5`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body.cycles)) throw new Error('cycles not an array');
      if (body.cycles.length > 5) throw new Error('limit not honoured');
      const t = body.treasury;
      if (t.wallet !== ONCHAIN.treasuryWalletAddress) throw new Error(`wallet mismatch: ${t.wallet}`);
      if (t.live !== false) throw new Error('kill switch should be off in dry-run');
      if (typeof t.tokenBalance !== 'number' || typeof t.gasReserveSol !== 'number' || typeof t.pendingBuybackSol !== 'number') throw new Error('counters missing');
      const health = await fetch(`http://localhost:${PORT}/api/health`);
      if (!health.ok) throw new Error('health broken by the new route');
    } finally { stop(); }
  }],
];

runTests(tests);
