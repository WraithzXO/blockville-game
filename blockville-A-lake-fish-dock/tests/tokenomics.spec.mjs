// Tokenomics config spec: the single backend source of truth must carry the
// real repo values, and the plot-score formula must behave exactly as spec'd.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BUILD_BLOCKS, BASE_PLOT_POINTS, UPGRADE_MULT, MAX_LEVEL, GARDEN_MULT,
  CYCLE, FEES, RECYCLING, isNpcOwner, plotScore, playerWeights,
} from '../server/tokenomics.mjs';

let pass = 0;
const ok = (name) => { pass++; console.log(`  PASS ${name}`); };

// ── 1. Construction blocks match the server's authoritative BUILD_COSTS ──
const src = readFileSync('server/index.mjs', 'utf8');
const m = src.match(/const BUILD_COSTS = \{([^}]*)\}/);
assert.ok(m, 'BUILD_COSTS found in server/index.mjs');
const serverCosts = Object.fromEntries([...m[1].matchAll(/(\w+):\s*(\d+)/g)].map(([_, k, v]) => [k, Number(v)]));
assert.deepEqual(BUILD_BLOCKS, serverCosts);
ok(`BUILD_BLOCKS matches server BUILD_COSTS (${Object.keys(serverCosts).length} types)`);

// 1b. The client's BUILDING_DEFS construction costs must match the same
// server values — what the build UI charges is what scoring, the tokenomics
// panel and the whitepaper all read from the single config.
{
  const cfg = readFileSync('src/game/config.ts', 'utf8');
  const defs = cfg.slice(cfg.indexOf('export const BUILDING_DEFS'), cfg.indexOf('export const RESIDENT_BUILDERS'));
  const clientCosts = {};
  let current = null;
  for (const line of defs.split('\n')) {
    const key = line.match(/^  (\w+): \{/);
    if (key) current = key[1];
    const cost = current && line.match(/cost:\s*([0-9_]+)/);
    if (cost && current) clientCosts[current] = Number(cost[1]);
  }
  assert.ok(Object.keys(clientCosts).length > 0, 'BUILDING_DEFS costs found in client config');
  assert.deepEqual(clientCosts, BUILD_BLOCKS);
  ok(`client BUILDING_DEFS costs match BUILD_BLOCKS (${Object.keys(clientCosts).length} types)`);
  // the client's DISPLAY-side mirrors of the holding tier and SOL upgrade
  // costs must mirror the backend values exactly (final-audit hardening:
  // the server still owns the real gates, but a drifted preview would lie)
  const stake = cfg.match(/plotStakeCost:\s*([0-9_]+)/);
  assert.ok(stake, 'plotStakeCost found in client config');
  assert.equal(Number(stake[1].replace(/_/g, '')), 20_000, 'client plotStakeCost mirrors ENTITLEMENT.tokensPerPlot');
  const sol = cfg.match(/solCosts:\s*\[([^\]]*)\]/);
  assert.ok(sol, 'solCosts found in client config');
  assert.deepEqual(sol[1].split(',').map((x) => Number(x.trim())), [0.1, 0.25, 0.5], 'client solCosts mirror UPGRADE_SOL');
  ok('client plotStakeCost + solCosts mirror the backend config');
}

// Expected values from the brief (read from the repo, not approximations)
assert.deepEqual(BUILD_BLOCKS, { park: 25, shop: 30, cafe: 35, bakery: 40, mine: 45, house: 48, arcade: 55, casino: 60, bank: 75 });
ok('block values: park 25 … bank 75');

// ── 2. Multipliers and boosts ──
assert.deepEqual(UPGRADE_MULT, [1, 1.5, 2.25, 3.5]);
assert.equal(MAX_LEVEL, 4);
assert.equal(GARDEN_MULT, 1.2);
assert.equal(BASE_PLOT_POINTS, 20);
ok('upgrade mult [1, 1.5, 2.25, 3.5], garden ×1.2, base 20');

// ── 3. Cycle and fee parameters ──
assert.equal(CYCLE.intervalMs, 300000);
assert.equal(CYCLE.distributePct, 0.20);
assert.equal(FEES.buybackPct, 0.80);
assert.equal(FEES.gasReservePct, 0.20);
assert.equal(FEES.gasSweepThresholdSol, 0.5);
assert.equal(FEES.gasSweepFraction, 0.5);
assert.equal(RECYCLING.shopPct, 100);
assert.equal(RECYCLING.upgradePct, 100);
ok('cycle 5min/20%, fees 75/60/15, sweep ≥0.5 SOL→half, recycling 100%');

// ── 4. NPC exclusion is unconditional ──
for (const n of ['Nova', 'Rex', 'Momo', 'Vega', 'Juno', 'Pixel', 'Resident A', 'Resident Z', 'Town Council']) assert.ok(isNpcOwner(n), `NPC ${n}`);
for (const n of ['jacob', 'Sasha', 'Resident 1', 'resident a', 'Nova2']) assert.ok(!isNpcOwner(n), `player ${n}`);
assert.equal(plotScore({ owner: 'Nova', type: 'bank', done: true, level: 4, garden: true }), 0);
ok('NPC-owned plots score 0 and never enter the recipient list');

// ── 5. Plot score formula P = (20 + B) × U × G ──
assert.equal(plotScore({ owner: 'p', type: 'house', done: true }), (20 + 48) * 1 * 1);          // L1, no garden
assert.equal(plotScore({ owner: 'p', type: 'bank', done: true, level: 4, garden: true }), (20 + 75) * 3.5 * 1.2); // the 399-point example
assert.equal(plotScore({ owner: 'p', type: 'bank', done: true, level: 4, garden: true }), 399);
assert.equal(plotScore({ owner: 'p', type: 'cafe', done: true, level: 2 }), (20 + 35) * 1.5);
assert.equal(plotScore({ owner: 'p', type: 'arcade', done: true, level: 3 }), (20 + 55) * 2.25);
ok('score formula incl. 399-point L4 Bank + Garden');

// ── 6. Eligibility gates ──
assert.equal(plotScore(null), 0);
assert.equal(plotScore({}), 0);                                                    // unowned
assert.equal(plotScore({ owner: 'p' }), 0);                                        // no building type
assert.equal(plotScore({ owner: 'p', type: 'house', done: false }), 0);            // unfinished
assert.equal(plotScore({ owner: 'p', type: 'unknown-thing', done: true }), 0);     // unknown type
assert.equal(plotScore({ owner: 'p', type: 'mine', done: true, level: 9 }), (20 + 45) * 3.5); // level clamped to max
assert.equal(plotScore({ owner: 'p', type: 'mine', done: true, level: 0 }), (20 + 45) * 1);   // level clamped to min
// Non-plot economy items are not plot records — the weight engine only sums
// plot records, so boots/toolkit/permits/cosmetics/furniture can never earn.
const junk = [
  { item: 'speed_boots' }, { item: 'builders_toolkit' }, { item: 'claim_permit' },
  { cosmetic: 'hat' }, { furniture: 'sofa' },
].map((x) => plotScore(x));
assert.deepEqual(junk, [0, 0, 0, 0, 0]);
ok('eligibility: unowned/untyped/unfinished/unknown/non-plot all score 0');

// ── 7. Weights: summing, zero-eligible edge, NPC exclusion ──
const plots = [
  { owner: 'p', type: 'bank', done: true, level: 4, garden: true },   // 399
  { owner: 'p', type: 'house', done: true },                          // 68
  { owner: 'q', type: 'cafe', done: true, level: 2 },                 // 82.5
  { owner: 'Nova', type: 'shop', done: true },                        // NPC → dropped
  { owner: 'r', type: 'park', done: false },                          // unfinished → 0
];
const w = playerWeights(plots);
assert.equal(w.get('p'), 399 + 68);
assert.equal(w.get('q'), 82.5);
assert.equal(w.size, 2);
assert.ok(!w.has('Nova'));
// zero-eligible: every plot ineligible → empty weight map (engine must skip)
assert.equal(playerWeights([{ owner: 's', type: 'bank', done: false }]).size, 0);
assert.equal(playerWeights([]).size, 0);
ok('player weights sum per owner; NPCs dropped; zero-eligible → empty');

console.log(`\nTOKENOMICS CONFIG: ${pass} groups passed`);
