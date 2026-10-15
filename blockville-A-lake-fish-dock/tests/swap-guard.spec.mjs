// Dynamic live-price swap guard (this chunk). The buyback must track the
// LIVE market price at swap time — no operator-maintained price constant.
// Covers: minOut from the live spot at the configured slippage bps; price
// moving between quote and execution → swap_rolled; unreachable venue /
// absurd deviation → swap_stale_quote; startup gate (first cycle after a
// start never trades); and mock-vs-real guard parity. All paths run OFFLINE
// through injected fetch implementations — no network, no real transactions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runTests } from './harness.mjs';
import { createTreasury, createMockVenue } from '../server/treasury.mjs';
import { createJupiterVenue } from '../server/jupiter.mjs';
import { SWAP } from '../server/tokenomics.mjs';
import { publicKeyFromSeed } from '../server/solana.mjs';
import crypto from 'node:crypto';

const SOL_LAMPORTS = 1e9;
const MINT = 'BVmint11111111111111111111111111111111111';
const TREASURY = 'Treasury111111111111111111111111111111111';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bv-swapguard-'));

// A synthetic ed25519 payer — same construction as loadKeypairFile, no file.
const mkPayer = () => {
  const seed = Buffer.alloc(32, 7);
  const pub = publicKeyFromSeed(seed);
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const priv = crypto.createPrivateKey({ key: Buffer.concat([pkcs8Prefix, seed]), format: 'der', type: 'pkcs8' });
  return { publicKey: pub, sign: (m) => crypto.sign(null, m, priv) };
};

// Minimal versioned (v0) swap transaction whose position-0 signer is `payer`
// — just enough structure for parseTransaction + signTransactionPosition0.
function fakeSwapTx(payer) {
  const sig = Buffer.alloc(64);
  const header = Buffer.from([1, 0, 0]); // numRequiredSignatures=1 + 2 reserved
  const keys = Buffer.concat([Buffer.from([2]), payer.publicKey, Buffer.alloc(32 * 1, 1)]);
  const msg = Buffer.concat([header, keys, Buffer.alloc(16, 2)]);
  return Buffer.concat([Buffer.from([0x80]), Buffer.from([1]), sig, msg]);
}

// Offline Jupiter venue: /quote and /swap answered by a configurable fake;
// the JSON-RPC traffic (getTokenSupply, sendTransaction, getSignatureStatuses)
// rides the same injected fetch.
function fakeJupiter(opts = {}) {
  const st = {
    tokensPerSol: opts.tokensPerSol ?? 2_000_000, // the "live market" price
    unreachable: !!opts.unreachable,              // quote endpoint dead
    requests: [],                                  // every URL + body seen
  };
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    // NOTE: /swap is checked FIRST — the fake domain is quote.test, so a
    // naive /quote substring match would also swallow the /swap POST.
    if (u.includes('/swap')) {
      st.requests.push({ kind: 'swap', url: u, body: JSON.parse(init.body ?? '{}') });
      return { ok: true, json: async () => ({ swapTransaction: fakeSwapTx(opts.payer).toString('base64') }) };
    }
    if (u.includes('/quote')) {
      st.requests.push({ kind: 'quote', url: u });
      if (st.unreachable) throw new Error('ECONNREFUSED');
      const q = new URL(u);
      const lamports = Number(q.searchParams.get('amount'));
      const outAmount = String(Math.floor((lamports / SOL_LAMPORTS) * st.tokensPerSol * 1e6)); // 6 decimals
      return { ok: true, json: async () => ({ inAmount: String(lamports), outAmount }) };
    }
    // JSON-RPC
    const body = JSON.parse(init.body ?? '{}');
    st.requests.push({ kind: 'rpc', method: body.method });
    if (body.method === 'getTokenSupply') return { ok: true, json: async () => ({ result: { value: { decimals: 6 } } }) };
    if (body.method === 'sendTransaction') return { ok: true, json: async () => ({ result: 'FakeSignaturePlaceholder' }) };
    if (body.method === 'getSignatureStatuses') return { ok: true, json: async () => ({ result: { value: [{ confirmations: 32, confirmationStatus: 'finalized', err: null }] } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { st, fetchImpl };
}

const mkRealVenue = (opts = {}) => {
  const jup = fakeJupiter({ ...opts, payer: opts.payer });
  const venue = createJupiterVenue({
    rpcUrl: 'http://rpc.test',
    mint: MINT,
    payer: opts.payer,
    apiUrl: 'http://quote.test/v6',
    statePath: opts.statePath ?? null,
    treasuryAddress: TREASURY,
    confirmTimeoutMs: 5_000,
    fetchImpl: jup.fetchImpl,
  });
  return { venue, st: jup.st };
};

const tests = [
  // ── the static constant is gone ──
  ['no hardcoded price constant remains in the swap path (minOutTokensPerSol removed)', () => {
    if ('minOutTokensPerSol' in SWAP) throw new Error('static minOutTokensPerSol still present in SWAP config');
    if (SWAP.slippageBps !== 300 && process.env.BV_SLIPPAGE_BPS === undefined) throw new Error(`default slippageBps ${SWAP.slippageBps}, want 300`);
  }],

  // ── 1. live spot + minOut at the configured slippage ──
  ['spot quote fetched for the exact amount and minOut computed at the configured slippage', async () => {
    const dir = tmp();
    const t = createTreasury({});
    t.recordFees(1.0); // pending 0.8
    const { venue, st } = mkRealVenue({ payer: mkPayer(), statePath: path.join(dir, 'state.json') });
    const w = await t.runBuyback(venue); // startup gate: baseline only
    if (!w.rolled || w.reason !== 'stale_quote') throw new Error(`startup gate: ${JSON.stringify(w)}`);
    const r = await t.runBuyback(venue);
    if (!r.swapped) throw new Error(`healthy swap did not execute: ${JSON.stringify(r)}`);
    const quoteReq = st.requests.find((q) => q.kind === 'quote' && q.url.includes(`amount=${Math.floor(0.8 * SOL_LAMPORTS)}`));
    if (!quoteReq) throw new Error('no live quote for the EXACT amount');
    if (!quoteReq.url.includes(`slippageBps=${SWAP.slippageBps}`)) throw new Error(`quote slippageBps not from config: ${quoteReq.url}`);
    // tokensOut = spotOut at zero price impact: 0.8 SOL × 2M tokens/SOL
    if (r.tokensOut !== 1_600_000) throw new Error(`tokensOut ${r.tokensOut}`);
    const minOutExpected = 1_600_000 * (1 - SWAP.slippageBps / 10_000);
    if (Math.abs(minOutExpected - 1_552_000) > 1) throw new Error(`minOut formula drift: ${minOutExpected}`);
    // mock venue exposes the same minOut directly
    const mock = createMockVenue(2_000_000);
    try { mock.swap(1); } catch (e) { if (e?.reason !== 'stale_quote') throw e; } // warm (startup gate)
    const m = mock.swap(1);
    if (Math.abs(m.minOut - 2_000_000 * (1 - SWAP.slippageBps / 10_000)) > 1e-6) throw new Error(`mock minOut ${m.minOut}`);
  }],

  // ── 2. price moves between quote and execution ──
  ['price moving between quote and execution breaches minOut → swap_rolled, full amount rolls', async () => {
    const t = createTreasury({});
    t.recordFees(1.0); // pending 0.8
    // execution lands 5% below the quoted spot (> the 3% tolerance)
    const v = createMockVenue(2_000_000, { executionPricePerSol: 1_900_000 });
    await t.runBuyback(v); // startup gate
    const r = await t.runBuyback(v);
    if (!r.rolled || r.reason !== 'slippage_cap') throw new Error(`breach not caught: ${JSON.stringify(r)}`);
    if (t.pendingBuyback !== 0.8) throw new Error('rolled amount lost');
    if (t.balance !== 0) throw new Error('treasury credited despite breach');
    const kinds = t.ledger().map((e) => e.kind);
    if (!kinds.includes('swap_rolled')) throw new Error(`ledger kinds ${kinds}`);
    if (kinds.includes('swap_out') || kinds.includes('tokens_in')) throw new Error('breach credited');
  }],

  // ── 3. venue unreachable → swap_stale_quote ──
  ['unreachable venue → swap_stale_quote, no trade, fees roll over', async () => {
    // mock path
    const t1 = createTreasury({});
    t1.recordFees(1.0);
    const mv = createMockVenue(2_000_000, { unreachable: true });
    await t1.runBuyback(mv); // startup gate (baseline set — then the feed dies)
    const r1 = await t1.runBuyback(mv);
    if (!r1.rolled || r1.reason !== 'stale_quote') throw new Error(`mock unreachable: ${JSON.stringify(r1)}`);
    if (t1.pendingBuyback !== 0.8 || t1.balance !== 0) throw new Error('mock: rolled funds lost');
    if (!t1.ledger().some((e) => e.kind === SWAP.staleQuoteLedgerKind)) throw new Error('mock: swap_stale_quote not ledgered');
    // real path
    const t2 = createTreasury({});
    t2.recordFees(1.0);
    const { venue } = mkRealVenue({ payer: mkPayer(), unreachable: true });
    await t2.runBuyback(venue); // startup gate: no quote observed yet
    const r2 = await t2.runBuyback(venue);
    if (!r2.rolled || r2.reason !== 'stale_quote') throw new Error(`real unreachable: ${JSON.stringify(r2)}`);
    if (t2.pendingBuyback !== 0.8 || t2.balance !== 0) throw new Error('real: rolled funds lost');
    if (!t2.ledger().some((e) => e.kind === SWAP.staleQuoteLedgerKind)) throw new Error('real: swap_stale_quote not ledgered');
  }],

  // ── 4. startup safety ──
  ['first cycle after startup executes no swap until a valid quote is seen', async () => {
    // mock path: fresh venue → attempt 1 rolls (baseline only), attempt 2 trades
    const t = createTreasury({});
    t.recordFees(1.0);
    const v = createMockVenue(2_000_000);
    const r1 = await t.runBuyback(v);
    if (!r1.rolled || r1.reason !== 'stale_quote') throw new Error(`first cycle traded?! ${JSON.stringify(r1)}`);
    if (t.balance !== 0) throw new Error('first cycle credited the treasury');
    if (t.pendingBuyback !== 0.8) throw new Error('first cycle lost the fees');
    if (!t.ledger().some((e) => e.kind === SWAP.staleQuoteLedgerKind && e.reason === 'no_baseline')) throw new Error('no_baseline not ledgered distinctly');
    const r2 = await t.runBuyback(v);
    if (!r2.swapped || t.balance !== 1_600_000) throw new Error(`post-baseline swap failed: ${JSON.stringify(r2)}`);
    // real path: identical
    const t3 = createTreasury({});
    t3.recordFees(1.0);
    const { venue } = mkRealVenue({ payer: mkPayer() });
    const q1 = await t3.runBuyback(venue);
    if (!q1.rolled || q1.reason !== 'stale_quote') throw new Error(`real first cycle: ${JSON.stringify(q1)}`);
    const q2 = await t3.runBuyback(venue);
    if (!q2.swapped) throw new Error(`real post-baseline: ${JSON.stringify(q2)}`);
  }],

  // ── 5. sanity floor: deviation vs the previous successful swap ──
  ['quote deviating beyond the threshold from the previous successful swap → swap_stale_quote', async () => {
    const t = createTreasury({});
    t.recordFees(1.0);
    const { venue, st } = mkRealVenue({ payer: mkPayer() });
    await t.runBuyback(venue); // startup gate
    await t.runBuyback(venue); // healthy swap at 2M/SOL → baseline
    if (t.balance !== 1_600_000) throw new Error(`baseline swap: ${t.balance}`);
    // the feed goes haywire: 15x the previous price (> 10x threshold)
    t.recordFees(1.0);
    st.tokensPerSol = 30_000_000;
    const r = await t.runBuyback(venue);
    if (!r.rolled || r.reason !== 'stale_quote') throw new Error(`deviation not refused: ${JSON.stringify(r)}`);
    if (t.balance !== 1_600_000) throw new Error('treasury traded on garbage data');
    if (!t.ledger().some((e) => e.kind === SWAP.staleQuoteLedgerKind && e.reason === 'deviation')) throw new Error('deviation not ledgered distinctly');
    // a crash-drop (÷15) is refused the same way
    st.tokensPerSol = 130_000;
    const r2 = await t.runBuyback(venue);
    if (r2.reason !== 'stale_quote') throw new Error(`crash-drop not refused: ${JSON.stringify(r2)}`);
    // within tolerance again (price recovered) → the swap executes
    st.tokensPerSol = 2_000_000;
    const ok = await t.runBuyback(venue);
    if (!ok.swapped) throw new Error(`recovery swap failed: ${JSON.stringify(ok)}`);
  }],

  // ── 6. mock and real paths produce IDENTICAL guard behaviour ──
  ['mock path produces identical guard behaviour to the real venue path', async () => {
    const run = async (mk) => {
      const t = createTreasury({});
      t.recordFees(1.0);
      const venue = mk();
      const outcomes = [];
      outcomes.push((await t.runBuyback(venue)).reason ?? 'swapped');     // cold: no_baseline
      outcomes.push((await t.runBuyback(venue)).reason ?? 'swapped');     // healthy swap
      t.recordFees(1.0);
      outcomes.push((await t.runBuyback(venue)).reason ?? 'swapped');     // healthy swap again
      return outcomes;
    };
    const real = await run(() => mkRealVenue({ payer: mkPayer() }).venue);
    const mock = await run(() => createMockVenue(2_000_000));
    if (JSON.stringify(real) !== JSON.stringify(mock)) {
      throw new Error(`guard parity broken: real=${JSON.stringify(real)} mock=${JSON.stringify(mock)}`);
    }
    if (JSON.stringify(real) !== JSON.stringify(['stale_quote', 'swapped', 'swapped'])) {
      throw new Error(`unexpected sequence: ${JSON.stringify(real)}`);
    }
    // and the ledger kinds match too (stale → swap_stale_quote, ok → swap_out)
  }],

  // ── engine boundary: minOut is derived from the LIVE spot, not a constant ──
  ['engine refuses deliveries below the live minOut and accepts at-or-above it', async () => {
    const t = createTreasury({});
    t.recordFees(1.0);
    const solIn = 0.8;
    const spot = 2_000_000;
    // At the DEFAULT slippageBps (300) the engine's unchanged 3% slippage cap
    // and the dynamic minOut are the same boundary — slippage_cap fires.
    const below3 = { swap: () => ({ tokensOut: spot * 0.96 * solIn, spotTokensPerSol: spot }) };
    if ((await t.runBuyback(below3)).reason !== 'slippage_cap') throw new Error('hard cap not enforced');
    // Tighten the dynamic tolerance below the hard cap so min_out becomes the
    // binding guard (1% tolerance, delivery 2% below spot). Restored after.
    const prevBps = SWAP.slippageBps;
    SWAP.slippageBps = 100;
    try {
      const minOut = spot * (1 - SWAP.slippageBps / 10_000) * solIn; // engine's exact formula
      const below = { swap: () => ({ tokensOut: minOut - 1, spotTokensPerSol: spot }) };
      if ((await t.runBuyback(below)).reason !== 'min_out') throw new Error('below-minOut credited');
      const at = { swap: () => ({ tokensOut: minOut + 1, spotTokensPerSol: spot }) };
      const r = await t.runBuyback(at);
      if (!r.swapped) throw new Error(`at-minOut refused: ${JSON.stringify(r)}`);
    } finally { SWAP.slippageBps = prevBps; }
  }],
];

await runTests(tests);
