// Production-readiness chunk — full economic round trip against ONE live
// server, asserting the AUTHORITATIVE server store (never client-reported
// numbers) after every step, and the world as a second connected player sees
// it:
//   1. claim → build (progress is server-clamped to BUILD_COSTS)
//   2. upgrade (server quotes/ledger the fee itself; invalid steps rejected
//      EXPLICITLY to the sender so the client's optimistic level reverts)
//   3. shop purchase (server re-prices from its own table; junk items ignored)
//   4. a real payout cycle: the only recipient is the real player; a
//      bystander receives nothing; the amount matches the cycle report
//   5. refresh: a NEW connection for the same player receives the same
//      server-side earned total (feesEarned) and entitlement — nothing stale
// All ledger/state paths are pointed at tmp files, so the repo's clean
// production data/ directory is untouched by the test run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, Client, runTests } from './harness.mjs';
import { BUILD_BLOCKS, UPGRADE_SOL, SHOP_PRICES } from '../server/tokenomics.mjs';

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-rt-')), 'x');
process.env.BV_TREASURY_LEDGER = tmp();
process.env.BV_TREASURY_STATE = tmp();
process.env.BV_DIST_LEDGER = tmp();
process.env.BV_CLAIMABLE_PATH = tmp();
process.env.BV_ENTITLEMENTS_LEDGER = tmp();
process.env.BV_UPGRADE_SIGNATURES = tmp();
process.env.BV_CYCLE_MS = '1500';   // shortened cycles: a real payout in seconds
process.env.BV_FEE_SIM_SOL = '0';   // fee intake is driven by real purchases here

const stop = await startServer();

const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const ledger = () => readJsonl(process.env.BV_TREASURY_LEDGER);
const cyclesLedger = () => readJsonl(process.env.BV_DIST_LEDGER);

const WORLD = { plotIds: [10, 11, 12], community: [] };
const PLOT = 10;
const SHOP_BLOCKS = BUILD_BLOCKS.shop;

const step = {}; // shared across the sequential tests below

const tests = [
  ['round trip: claim → build → upgrade → shop → payout → refresh', async () => {
    const a = new Client();
    await a.join('RtAlice', 0, 0, WORLD);
    const b = new Client();
    await b.join('RtBob');

    // ── 1. claim + build: the server clamps progress to BUILD_COSTS ──
    a.send({ t: 'claim', plot: PLOT, ownerName: 'RtAlice', type: 'shop' });
    await b.waitFor((m) => m.t === 'claim' && m.plot === PLOT && m.ownerName === 'RtAlice', 'claim relay');
    a.send({ t: 'build', plot: PLOT, progress: 999, done: true }); // over-claim: server clamps
    await b.waitFor((m) => m.t === 'build' && m.plot === PLOT, 'build relay');
    a.send({ t: 'build', plot: PLOT, progress: SHOP_BLOCKS, done: true });
    await b.waitFor((m) => m.t === 'build' && m.plot === PLOT && m.done === true, 'build completion');
    step.donePlot = PLOT;

    // ── 2. upgrade: server applies the level step and ledgers its own fee ──
    const upBefore = ledger().filter((e) => e.kind === 'upgrade_in').length;
    a.send({ t: 'upgrade', plot: PLOT, level: 2 });
    await b.waitFor((m) => m.t === 'upgrade' && m.plot === PLOT && m.level === 2, 'upgrade relay');
    const up = ledger().filter((e) => e.kind === 'upgrade_in');
    if (up.length !== upBefore + 1) throw new Error('upgrade_in not ledgered exactly once');
    if (up[up.length - 1].sol !== UPGRADE_SOL[0]) throw new Error(`upgrade fee ${up[up.length - 1].sol} != server table ${UPGRADE_SOL[0]}`);
    step.level = 2;

    // an invalid level step is REJECTED TO THE SENDER (no silent divergence)
    a.send({ t: 'upgrade', plot: PLOT, level: 4 }); // skips level 3
    await a.waitFor((m) => m.t === 'upgradeRejected' && m.plot === PLOT, 'upgrade rejection reaches the sender');
    // ...and the authoritative record is unchanged: a fresh joiner sees level 2
    const w = await (new Client()).join('RtCheck', 0, 0, WORLD);
    const rec = (w.plots || []).find(([id]) => id === PLOT);
    if (!rec || rec[1].level !== 2 || rec[1].done !== true || rec[1].progress !== SHOP_BLOCKS) {
      throw new Error(`authoritative plot record wrong after rejected upgrade: ${JSON.stringify(rec)}`);
    }

    // ── 3. shop purchase: server re-prices; junk item IDs are ignored ──
    const before = ledger().filter((e) => e.kind === 'shop_in').length;
    a.send({ t: 'shopPurchase', item: 'boots' });
    a.send({ t: 'shopPurchase', item: 'not-a-real-item' });
    await new Promise((r) => setTimeout(r, 250));
    const boots = ledger().filter((e) => e.kind === 'shop_in').slice(before);
    if (boots.length !== 1 || boots[0].tokens !== SHOP_PRICES.boots) {
      throw new Error(`shop_in wrong: ${JSON.stringify(boots)}`);
    }

    // ── 4. a real payout cycle: the real player is the only recipient ──
    const payout = await a.waitFor((m) => m.t === 'treasuryPayout' && m.amount > 0, 'treasury payout', 8000);
    if (payout.weight <= 0) throw new Error('payout weight not positive');
    const report = cyclesLedger().filter((e) => e.kind === 'cycle_report' && e.cycle === payout.cycle).pop();
    if (!report || report.skipped) throw new Error(`cycle report missing for ${payout.cycle}`);
    if (report.payouts.length !== 1 || report.payouts[0].name !== 'RtAlice') {
      throw new Error(`recipient list not exactly the real player: ${JSON.stringify(report.payouts)}`);
    }
    if (report.payouts[0].amount !== payout.amount) throw new Error('client payout amount != ledger report');
    const npcCheck = report.payouts.some((r) => /^(Nova|Rex|Momo|Vega|Juno|Pixel|Town Council|Resident [A-Z])$/.test(r.name));
    if (npcCheck) throw new Error('an NPC appeared in the payout recipient list');

    // ── 5. refresh: a NEW connection for the same player gets the same truth ──
    const fresh = new Client();
    const freshWelcome = await fresh.join('RtAlice', 0, 0, WORLD);
    const fees = await fresh.waitFor((m) => m.t === 'feesEarned', 'feesEarned on refresh');
    if (!(fees.total > 0)) throw new Error('refreshed feesEarned total not positive');
    const ent = await fresh.waitFor((m) => m.t === 'entitlement', 'entitlement on refresh');
    if (!(ent.claimed >= 1)) throw new Error('refreshed entitlement lost the claimed plot');
    const w2 = freshWelcome.plots || [];
    const rec2 = w2.find(([id]) => id === PLOT);
    if (!rec2 || rec2[1].level !== 2 || rec2[1].done !== true) {
      throw new Error(`refreshed plot record wrong: ${JSON.stringify(rec2)}`);
    }

    a.close(); b.close(); fresh.close();
  }],
];

await runTests(tests);
stop();
