// Chunk T2 tests — fee intake, shop/upgrade recycling, gas reserve, buyback.
// Module-level flows use a mock venue (no real transactions, per the brief).
// The price/upgrade tables are cross-checked against the client config so the
// server mirror cannot drift. A live WS pass proves the server wiring.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, Client, runTests } from './harness.mjs';
import { createTreasury, createMockVenue, cycleIdFor } from '../server/treasury.mjs';
import { UPGRADE_SOL, SHOP_PRICES, FURNITURE_PRICES, SWAP, FEES, DEPOSIT_CAPS, CYCLE } from '../server/tokenomics.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The spawned server's ledger is redirected to a tmp file (final-audit test
// isolation: the suite used to read and write the repo's PRODUCTION
// data/treasury-ledger.jsonl, dirtying it on every test run). The harness
// injects the tmp path; readLedger follows the same env var.
process.env.BV_TREASURY_LEDGER = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-fees-')), 'treasury-ledger.jsonl');
const LEDGER = process.env.BV_TREASURY_LEDGER;
const readLedger = () => fs.existsSync(LEDGER)
  ? fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const ledgerCountBefore = readLedger().length;

// Production-readiness chunk: the walletDeposit faucet (a client message that
// claims server-side balance) is refused unless the dev/test env gate is set.
// This suite exercises the funded-debit path, so its spawned server runs with
// the gate explicitly ON — production starts never set it.
process.env.BV_ALLOW_DEMO_DEPOSITS = '1';

const stop = await startServer();

const tmpLedger = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-t-')), 'ledger.jsonl');

const tests = [
  // ── cross-checks: the server mirror cannot drift from the client config ──
  ['UPGRADE_SOL matches client upgrades.solCosts', () => {
    const ts = fs.readFileSync(path.join(ROOT, 'src/game/config.ts'), 'utf8');
    const m = ts.match(/solCosts:\s*\[([^\]]+)\]/);
    if (!m) throw new Error('solCosts not found in config.ts');
    const client = m[1].split(',').map((x) => Number(x.trim()));
    if (client.length !== UPGRADE_SOL.length || client.some((v, i) => v !== UPGRADE_SOL[i])) {
      throw new Error(`UPGRADE_SOL ${UPGRADE_SOL} != client ${client}`);
    }
  }],

  ['SHOP_PRICES match client STORE_ITEMS exactly', () => {
    const ts = fs.readFileSync(path.join(ROOT, 'src/game/config.ts'), 'utf8');
    const slice = ts.slice(ts.indexOf('export const STORE_ITEMS'), ts.indexOf('export const FURNITURE_DEFS'));
    const found = new Map();
    for (const m of slice.matchAll(/\{\s*id:\s*'([a-z-]+)',[\s\S]*?price:\s*([0-9_]+)/g)) {
      found.set(m[1], Number(m[2].replace(/_/g, '')));
    }
    const garden = ts.match(/garden:\s*\{\s*price:\s*([0-9_]+)/);
    if (!garden) throw new Error('CONFIG.garden.price not found');
    found.set('garden', Number(garden[1].replace(/_/g, '')));
    const ids = [...found.keys()].sort();
    const mine = Object.keys(SHOP_PRICES).sort();
    if (ids.join(',') !== mine.join(',')) throw new Error(`item drift:\nclient: ${ids}\nserver: ${mine}`);
    for (const [id, price] of found) if (SHOP_PRICES[id] !== price) throw new Error(`${id}: server ${SHOP_PRICES[id]} != client ${price}`);
  }],

  ['FURNITURE_PRICES match client FURNITURE_DEFS exactly', () => {
    const ts = fs.readFileSync(path.join(ROOT, 'src/game/config.ts'), 'utf8');
    const start = ts.indexOf('export const FURNITURE_DEFS');
    const slice = ts.slice(start, ts.indexOf('\nexport ', start + 10) === -1 ? ts.length : ts.indexOf('\nexport ', start + 10));
    const found = new Map();
    for (const m of slice.matchAll(/id:\s*'([a-z-]+)',\s*name:\s*'[^']*',\s*category:\s*'[^']+',\s*icon:\s*'[^']+',\s*price:\s*([0-9_]+)/g)) {
      found.set(m[1], Number(m[2].replace(/_/g, '')));
    }
    const ids = [...found.keys()].sort();
    const mine = Object.keys(FURNITURE_PRICES).sort();
    if (ids.join(',') !== mine.join(',')) throw new Error(`furniture drift:\nclient: ${ids}\nserver: ${mine}`);
    for (const [id, price] of found) if (FURNITURE_PRICES[id] !== price) throw new Error(`${id}: server ${FURNITURE_PRICES[id]} != client ${price}`);
  }],

  // ── fee intake split ──
  ['fee intake splits 80/20 of RECEIVED sol and ledgers fee_in + gas_reserved', () => {
    const t = createTreasury({ ledgerPath: tmpLedger() });
    const r = t.recordFees(1.0);
    if (!r.ok || r.received !== 1 || r.gas !== 0.2 || r.buyback !== 0.8) throw new Error(`bad split ${JSON.stringify(r)}`);
    if (t.gasReserve !== 0.2 || t.pendingBuyback !== 0.8) throw new Error('state not updated');
    const kinds = t.ledger().map((e) => e.kind);
    if (kinds[0] !== 'fee_in' || kinds[1] !== 'gas_reserved') throw new Error(`ledger order ${kinds}`);
  }],

  ['fee intake rejects zero/negative/non-finite', () => {
    const t = createTreasury();
    for (const bad of [0, -1, NaN, Infinity, 'x']) {
      if (t.recordFees(bad).ok !== false) throw new Error(`accepted ${bad}`);
    }
    if (t.balance !== 0 || t.pendingBuyback !== 0) throw new Error('state mutated by bad intake');
  }],

  // ── gas sweep ──
  ['gas reserve sweeps exactly half once it reaches 0.5 SOL', () => {
    const t = createTreasury();
    t.recordFees(2.0); // gas +0.40 → below threshold
    if (t.maybeSweepGas() !== null) throw new Error('swept below threshold');
    t.recordFees(2.0); // gas +0.40 → 0.80 ≥ 0.5
    const sweep = t.maybeSweepGas();
    if (!sweep || sweep.swept !== 0.4) throw new Error(`bad sweep ${JSON.stringify(sweep)}`);
    if (t.gasReserve !== 0.4) throw new Error(`reserve after sweep ${t.gasReserve}`);
    if (t.pendingBuyback !== 3.6) throw new Error(`pending after sweep ${t.pendingBuyback}`); // 1.6+1.6+0.4
    if (t.ledger().some((e) => e.kind === 'gas_sweep' && e.sweep !== 0.4)) throw new Error('gas_sweep not ledgered');
  }],

  // ── buyback swap ──
  ['buyback swaps pending SOL and ledgers swap_out + tokens_in', async () => {
    const t = createTreasury();
    t.recordFees(1.0); // pending 0.8
    // Dynamic-guard chunk: a fresh venue's first swap only sets the live
    // price baseline (startup safety) — the second attempt executes.
    const warm = createMockVenue(2_000_000);
    const w = await t.runBuyback(warm);
    if (!w.rolled || w.reason !== 'stale_quote') throw new Error(`startup gate not armed: ${JSON.stringify(w)}`);
    const r = await t.runBuyback(warm);
    if (r.swapped !== 0.8 || r.tokensOut !== 1_600_000) throw new Error(`bad swap ${JSON.stringify(r)}`);
    if (t.balance !== 1_600_000 || t.pendingBuyback !== 0) throw new Error('swap state wrong');
    const kinds = t.ledger().map((e) => e.kind);
    if (!kinds.includes('swap_out') || !kinds.includes('tokens_in')) throw new Error(`kinds ${kinds}`);
  }],

  ['slippage-cap breach rolls the FULL amount (including the sweep) to the next cycle', async () => {
    const t = createTreasury();
    t.recordFees(1.0);                                  // pending 0.8, gas 0.2
    t.recordFees(2.0); t.recordFees(2.0);               // gas 0.2+0.4+0.4 = 1.0 → sweep 0.5
    t.maybeSweepGas();
    const badVenue = { swap: (solIn) => ({ tokensOut: solIn * 1_800_000, spotTokensPerSol: 2_000_000 }) }; // 10% slippage
    const r = await t.runBuyback(badVenue);
    if (!r.rolled || r.reason !== 'slippage_cap' || r.sol !== 4.5) throw new Error(`bad roll ${JSON.stringify(r)}`);
    if (t.pendingBuyback !== 4.5) throw new Error('rolled amount lost');
    if (t.balance !== 0) throw new Error('treasury credited despite breach');
    // next cycle: a healthy venue swaps the whole accumulated amount
    const warm = createMockVenue(2_000_000);
    await t.runBuyback(warm); // startup gate: baseline only
    const ok = await t.runBuyback(warm);
    if (ok.swapped !== 4.5 || ok.tokensOut !== 9_000_000 || t.pendingBuyback !== 0) throw new Error(`recovery ${JSON.stringify(ok)}`);
  }],

  ['dynamic minimum-out (from the LIVE spot) breach rolls the swap; venue errors roll too', async () => {
    const t = createTreasury();
    t.recordFees(1.0); // pending 0.8
    // Tighten the dynamic min-out below the hard slippage cap so the min_out
    // branch (not slippage_cap) is the one that fires. Restored after.
    const prevBps = SWAP.slippageBps;
    SWAP.slippageBps = 100; // 1%: minOut = spot × 0.99
    try {
      const lowVenue = { swap: (solIn) => ({ tokensOut: solIn * 1_960_000, spotTokensPerSol: 2_000_000 }) }; // 2% below spot
      const r = await t.runBuyback(lowVenue);
      if (r.reason !== 'min_out') throw new Error(`dynamic min_out not enforced: ${JSON.stringify(r)}`);
    } finally { SWAP.slippageBps = prevBps; }
    if (t.pendingBuyback !== 0.8) throw new Error('min_out roll lost funds');
    const thrower = { swap: () => { throw new Error('rpc down'); } };
    if ((await t.runBuyback(thrower)).reason !== 'venue_error') throw new Error('venue error not handled');
    if (t.pendingBuyback !== 0.8) throw new Error('venue-error roll lost funds');
  }],

  // ── shop recycling ──
  ['token shop purchase credits treasury directly when server-funded (debit server-side)', () => {
    const t = createTreasury({ ledgerPath: tmpLedger() });
    const dep = t.deposit('Alice', { tokens: 5000 });
    if (!dep.ok) throw new Error(`deposit rejected: ${dep.reason}`);
    const r = t.payShop('Alice', 2500);
    if (!r.ok || r.settled !== 'server') throw new Error(`bad payShop ${JSON.stringify(r)}`);
    if (t.balanceOf('Alice').tokens !== 2500) throw new Error('player not debited server-side');
    if (t.balance !== 2500) throw new Error(`treasury ${t.balance}`);
    const ev = t.ledger().find((e) => e.kind === 'shop_in');
    if (!ev || ev.settled !== 'server' || ev.tokens !== 2500) throw new Error('shop_in ledger wrong');
  }],

  ['token shop purchase with no server balance still recycles, marked client-settled', () => {
    const t = createTreasury();
    const r = t.payShop('Bob', 900, { reported: true });
    if (!r.ok || r.settled !== 'client') throw new Error(`bad ${JSON.stringify(r)}`);
    if (t.balance !== 900) throw new Error('treasury not credited');
    const r2 = t.payShop('Bob', 900); // not reported + unfunded must be REJECTED
    if (r2.ok !== false || r2.reason !== 'insufficient_balance') throw new Error(`unreported accepted ${JSON.stringify(r2)}`);
    if (t.balance !== 900) throw new Error('treasury credited on rejection');
  }],

  // ── upgrade recycling ──
  ['SOL upgrade payment follows the received-funds split: 80% buyback / 20% gas (server-settled when funded)', () => {
    const t = createTreasury({ ledgerPath: tmpLedger() });
    t.deposit('Alice', { sol: 1.0 });
    const r = t.payUpgrade('Alice', 0.25);
    if (!r.ok || r.settled !== 'server') throw new Error(`bad ${JSON.stringify(r)}`);
    if (t.balanceOf('Alice').sol !== 0.75) throw new Error('player sol not debited');
    if (t.pendingBuyback !== 0.2 || t.gasReserve !== 0.05) throw new Error(`split wrong: buyback ${t.pendingBuyback} gas ${t.gasReserve}`);
    if (t.balance !== 0) throw new Error('SOL must not credit tokens before the swap');
    const cl = t.payUpgrade('Carol', 0.1, { reported: true });
    if (!cl.ok || cl.settled !== 'client') throw new Error(`client-settled ${JSON.stringify(cl)}`);
    if (t.pendingBuyback !== 0.28 || t.gasReserve !== 0.07) throw new Error(`client split wrong: buyback ${t.pendingBuyback} gas ${t.gasReserve}`);
    const re = t.payUpgrade('Dave', 0.1); // unfunded + unreported → rejected
    if (re.ok !== false) throw new Error('unreported unfunded upgrade accepted');
    if (t.pendingBuyback !== 0.28 || t.gasReserve !== 0.07) throw new Error('rejected upgrade changed state');
  }],

  // ── deposit caps ──
  ['deposits are capped per transaction and per lifetime', () => {
    const t = createTreasury();
    if (!t.deposit('A', { tokens: DEPOSIT_CAPS.maxTokensPerDeposit }).ok) throw new Error('cap-sized deposit rejected');
    if (t.deposit('A', { tokens: DEPOSIT_CAPS.maxTokensPerDeposit + 1 }).reason !== 'per_deposit_cap') throw new Error('per-tx cap not enforced');
    for (let i = 0; i < 3; i++) t.deposit('A', { tokens: DEPOSIT_CAPS.maxTokensPerDeposit });
    if (t.deposit('A', { tokens: 1 }).reason !== 'lifetime_cap') throw new Error('lifetime cap not enforced');
    if (t.deposit('B', { sol: DEPOSIT_CAPS.maxSolPerDeposit + 0.1 }).reason !== 'per_deposit_cap') throw new Error('sol per-tx cap not enforced');
    if (t.deposit('C', { tokens: -5 }).reason !== 'negative') throw new Error('negative accepted');
    if (t.deposit('C', {}).reason !== 'empty') throw new Error('empty accepted');
  }],

  // ── cycle keying + ledger persistence ──
  ['every ledger event is keyed by its 5-minute cycle id and persists to JSONL', async () => {
    const p = tmpLedger();
    const t = createTreasury({ ledgerPath: p });
    t.recordFees(1.0); t.recordFees(1.0); t.recordFees(1.0); t.recordFees(1.0); // gas 0.8 ≥ 0.5
    t.maybeSweepGas();
    const warm = createMockVenue();
    await t.runBuyback(warm); // startup gate: baseline only
    await t.runBuyback(warm);
    const file = fs.readFileSync(p, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    if (file.length < 4) throw new Error(`ledger short: ${file.length}`);
    const cycles = new Set(file.map((e) => e.cycle));
    if (cycles.size !== 1) throw new Error(`events split across cycles: ${[...cycles]}`);
    if (file.some((e) => e.cycle !== cycleIdFor(e.ts))) throw new Error('cycle id does not match its timestamp');
    for (const k of ['fee_in', 'gas_reserved', 'gas_sweep', 'swap_out', 'tokens_in']) {
      if (!file.some((e) => e.kind === k)) throw new Error(`missing ${k} in file ledger`);
    }
    if (cycleIdFor(0) !== 0 || cycleIdFor(CYCLE.intervalMs) !== 1) throw new Error('cycleIdFor math wrong');
  }],
];

// ── live WS wiring ───────────────────────────────────────────────────────────
tests.push(
  ['WS: upgrade ledgers upgrade_in; reported shop purchase ledgers shop_in', async () => {
    const before = readLedger().length;
    const a = new Client();
    await a.join('UpA', 0, 0, { plotIds: [300], community: [[300, 'casino']] });
    const b = new Client();
    await b.join('WatchB');
    a.send({ t: 'upgrade', plot: 300, level: 2 });
    await b.waitFor((m) => m.t === 'upgrade' && m.plot === 300 && m.level === 2, 'upgrade broadcast');
    a.send({ t: 'shopPurchase', item: 'boots' });
    a.send({ t: 'shopPurchase', item: 'not-a-real-item' });
    a.send({ t: 'walletDeposit', tokens: 1000 });
    a.send({ t: 'shopPurchase', item: 'party' }); // 400 — now server-settled
    await new Promise((r) => setTimeout(r, 250));
    const ev = readLedger().slice(before);
    const up = ev.find((e) => e.kind === 'upgrade_in');
    if (!up || up.name !== 'UpA' || up.sol !== 0.1 || up.settled !== 'client') throw new Error(`upgrade_in wrong: ${JSON.stringify(up)}`);
    const boots = ev.filter((e) => e.kind === 'shop_in' && e.tokens === 2500);
    if (boots.length !== 1 || boots[0].settled !== 'client' || boots[0].name !== 'UpA') throw new Error(`shop_in boots wrong: ${JSON.stringify(boots)}`);
    if (ev.some((e) => e.kind === 'shop_in' && ![900, 750, 1200, 1500, 2200, 3000, 2500, 400, 100000].includes(e.tokens))) throw new Error('unpriced item accepted');
    const party = ev.filter((e) => e.kind === 'shop_in' && e.tokens === 400);
    if (party.length !== 1 || party[0].settled !== 'server') throw new Error(`deposit path wrong: ${JSON.stringify(party)}`);
    const dep = ev.find((e) => e.kind === 'deposit');
    if (!dep || dep.tokens !== 1000 || dep.name !== 'UpA') throw new Error(`deposit wrong: ${JSON.stringify(dep)}`);
    a.close();
    b.close();
  }],
);

await runTests(tests);
stop();
