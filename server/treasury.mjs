// ── Blockville treasury intake, recycling and buyback (Chunk T2) ────────────
// Fee intake → gas reserve → buyback swap → treasury token holdings, plus
// the shop/upgrade recycling ledger. The weighted payout engine (Chunk T3)
// reads `balance` — the treasury's $BLOCKVILLE token holdings — each cycle.
//
// Every value comes from server/tokenomics.mjs; nothing is hardcoded here.
// The swap venue is MOCKED in this chunk (no dependencies, no real
// transactions). The real venue replaces `createMockVenue`'s swap site once
// an RPC URL and the $BLOCKVILLE mint address exist (T0 audit finding).
//
// Ledger: append-only JSONL, one event per line, every event tagged with the
// 5-minute cycle it belongs to (`cycle` = floor(ts / interval)) so a crash
// mid-cycle can be replayed exactly once (Chunk T3 wires the replay).

import fs from 'node:fs';
import path from 'node:path';
import { CYCLE, FEES, SWAP, DEPOSIT_CAPS } from './tokenomics.mjs';
import { VenueError, createSwapGuard } from './swap-guard.mjs';

const SOL_UNIT = 1e9; // lamport precision for SOL bookkeeping
const round9 = (x) => Math.round(x * SOL_UNIT) / SOL_UNIT;

// Stable cycle id for a timestamp — the snapshot key every ledger event and
// (in T3) every payout set is keyed by.
export function cycleIdFor(ts) {
  return Math.floor(ts / CYCLE.intervalMs);
}

// Mock swap venue — emulates the REAL venue's dynamic live-price guard
// behaviour so tests exercise the shared swap-guard logic (server/
// swap-guard.mjs), not a shortcut. Like the real venue it:
//   - quotes a LIVE spot for the exact SOL amount (the configurable mock
//     price IS the live feed — BV_SWAP_MOCK_PRICE),
//   - arms the startup gate: a fresh venue's first swap only sets the
//     baseline and rolls over (stale_quote 'no_baseline'),
//   - refuses quotes deviating beyond SWAP.staleQuoteMaxDeviation from the
//     previous successful swap (stale_quote 'deviation'),
//   - computes minOut = spotOut × (1 − SWAP.slippageBps/10_000) and refuses
//     execution below it (slippage_cap → swap_rolled),
//   - records a successful swap's spot as the new baseline.
// opts.executionPricePerSol simulates the price MOVING between quote and
// execution (defaults to pricePerSol); opts.unreachable simulates a dead
// quote endpoint (stale_quote 'quote_unavailable').
export function createMockVenue(pricePerSol = SWAP.mockTokensPerSol, opts = {}) {
  const execPricePerSol = Number.isFinite(opts.executionPricePerSol) ? opts.executionPricePerSol : pricePerSol;
  const guard = createSwapGuard({ maxDeviation: opts.maxDeviation });
  const venue = {
    name: 'mock',
    pricePerSol,
    swap(solIn) {
      const sol = Number(solIn);
      if (!Number.isFinite(sol) || sol <= 0) throw new VenueError('invalid_amount');
      if (opts.unreachable) throw new VenueError('stale_quote', 'quote_unavailable');
      // Quote phase: the live spot for the exact amount.
      const spotOut = sol * pricePerSol;
      guard.observeSpot(pricePerSol); // startup gate + sanity floor
      const minOut = guard.minOutFor(spotOut);
      // Execution phase: the price may have moved since the quote.
      const tokensOut = sol * execPricePerSol;
      guard.checkDelivered(tokensOut, minOut);
      guard.recordSuccess(pricePerSol);
      return { tokensOut, spotTokensPerSol: pricePerSol, minOut };
    },
  };
  return venue;
}

export function createTreasury(opts = {}) {
  const ledgerPath = opts.ledgerPath ?? null;
  const statePath = opts.statePath ?? null; // JSON snapshot of treasury counters (restart coherence)
  const balances = new Map(); // player name -> { tokens, sol } (server-side)
  const lifetime = new Map(); // player name -> { tokens, sol } ever deposited
  const events = [];          // in-memory mirror of the ledger

  let treasuryTokens = 0;     // $BLOCKVILLE holdings — what distributions pay from
  let gasReserveSol = 0;      // SOL gas reserve (15% of fees)
  let pendingBuybackSol = 0;  // SOL waiting for the next buyback swap

  const log = (kind, extra = {}, ts = Date.now()) => {
    const event = { ts, cycle: cycleIdFor(ts), kind, ...extra };
    events.push(event);
    if (ledgerPath) {
      try {
        fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
        fs.appendFileSync(ledgerPath, JSON.stringify(event) + '\n');
      } catch { /* a ledger write failure must never break the game loop */ }
    }
    persistState();
    return event;
  };

  // The treasury's own counters must survive a restart so a mid-cycle crash
  // can be replayed against the SAME numbers (Chunk T3 idempotency).
  const persistState = () => {
    if (!statePath) return;
    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify({ treasuryTokens, gasReserveSol, pendingBuybackSol }));
    } catch { /* best-effort */ }
  };
  const restoreState = () => {
    if (!statePath) return;
    try {
      const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (Number.isFinite(s.treasuryTokens)) treasuryTokens = Math.max(0, Math.floor(s.treasuryTokens));
      if (Number.isFinite(s.gasReserveSol)) gasReserveSol = Math.max(0, s.gasReserveSol);
      if (Number.isFinite(s.pendingBuybackSol)) pendingBuybackSol = Math.max(0, s.pendingBuybackSol);
    } catch { /* first boot or corrupt file: start at zero */ }
  };
  restoreState();

  const bal = (name) => {
    let b = balances.get(name);
    if (!b) { b = { tokens: 0, sol: 0 }; balances.set(name, b); }
    return b;
  };

  const api = {
    // ── fee intake ─────────────────────────────────────────────────────────
    // AMENDED: the argument is the SOL actually RECEIVED by the treasury
    // wallet this cycle (not global Pump.fun fees). Of received funds: 80%
    // becomes pending buyback SOL, 20% tops up the gas reserve. The full
    // received amount is ledgered as `fee_in` (detection record).
    recordFees(receivedSol, { ts } = {}) {
      const received = Number(receivedSol);
      if (!Number.isFinite(received) || received <= 0) return { ok: false, reason: 'invalid_amount' };
      const gas = round9(received * FEES.gasReservePct);
      const buyback = round9(received * FEES.buybackPct);
      gasReserveSol = round9(gasReserveSol + gas);
      pendingBuybackSol = round9(pendingBuybackSol + buyback);
      log('fee_in', { received: round9(received), buyback, gas }, ts);
      log('gas_reserved', { amount: gas }, ts);
      return { ok: true, received: round9(received), gas, buyback };
    },

    // ── server-side deposits (capped) ──────────────────────────────────────
    // Funds a name's server-side ledger so purchases/upgrades can be debited
    // server-side when funded. Capped per-transaction and per-lifetime.
    deposit(name, { tokens = 0, sol = 0 } = {}) {
      const t = Math.floor(Number(tokens)) || 0;
      const s = round9(Number(sol)) || 0;
      if (t < 0 || s < 0) return { ok: false, reason: 'negative' };
      if (t === 0 && s === 0) return { ok: false, reason: 'empty' };
      if (t > DEPOSIT_CAPS.maxTokensPerDeposit) return { ok: false, reason: 'per_deposit_cap' };
      if (s > DEPOSIT_CAPS.maxSolPerDeposit) return { ok: false, reason: 'per_deposit_cap' };
      const life = lifetime.get(name) ?? { tokens: 0, sol: 0 };
      if (life.tokens + t > DEPOSIT_CAPS.maxTokensLifetime) return { ok: false, reason: 'lifetime_cap' };
      if (life.sol + s > DEPOSIT_CAPS.maxSolLifetime) return { ok: false, reason: 'lifetime_cap' };
      const b = bal(name);
      b.tokens += t;
      b.sol = round9(b.sol + s);
      lifetime.set(name, { tokens: life.tokens + t, sol: round9(life.sol + s) });
      log('deposit', { name, tokens: t, sol: s });
      return { ok: true };
    },

    // ── shop recycling ─────────────────────────────────────────────────────
    // One shop/furniture purchase (already denominated in $BLOCKVILLE).
    // Credits treasury token holdings DIRECTLY — included in the next
    // cycle's distribution. When the payer has a funded server-side balance
    // the debit happens here (settled: 'server'); otherwise, if the client
    // reported the purchase (it debited its own demo wallet), the value still
    // routes to the treasury but is marked settled: 'client' until real
    // wallets exist.
    payShop(name, amountTokens, { reported = false, ts } = {}) {
      const amount = Math.floor(Number(amountTokens));
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
      const b = balances.get(name);
      if (b && b.tokens >= amount) {
        b.tokens -= amount;
        treasuryTokens += amount;
        log('shop_in', { name, tokens: amount, settled: 'server' }, ts);
        return { ok: true, settled: 'server' };
      }
      if (reported) {
        treasuryTokens += amount;
        log('shop_in', { name, tokens: amount, settled: 'client' }, ts);
        return { ok: true, settled: 'client' };
      }
      return { ok: false, reason: 'insufficient_balance' };
    },

    // ── upgrade recycling ──────────────────────────────────────────────────
    // One building upgrade payment, SOL-denominated. Upgrade SOL is SOL the
    // treasury actually RECEIVES, so it follows the configured received-funds
    // split exactly like fee intake: FEES.buybackPct (80%) becomes pending
    // buyback SOL, FEES.gasReservePct (20%) tops up the gas reserve. One
    // `upgrade_in` ledger event carries the whole routing. `settled` labels
    // the trust level: 'server' (funded balance debit), 'client' (demo
    // client-reported), 'dev' (BLOCKVILLE_DEV_TX_MODE, no on-chain check) or
    // 'onchain' (real SOL transaction verified on-chain by the server).
    payUpgrade(name, solAmount, { reported = false, settled, ts } = {}) {
      const amount = round9(Number(solAmount));
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
      const buyback = round9(amount * FEES.buybackPct);
      const gas = round9(amount * FEES.gasReservePct);
      const b = balances.get(name);
      if (b && b.sol >= amount) {
        b.sol = round9(b.sol - amount);
        pendingBuybackSol = round9(pendingBuybackSol + buyback);
        gasReserveSol = round9(gasReserveSol + gas);
        log('upgrade_in', { name, sol: amount, buyback, gas, settled: settled ?? 'server' }, ts);
        return { ok: true, settled: settled ?? 'server' };
      }
      if (reported) {
        pendingBuybackSol = round9(pendingBuybackSol + buyback);
        gasReserveSol = round9(gasReserveSol + gas);
        log('upgrade_in', { name, sol: amount, buyback, gas, settled: settled ?? 'client' }, ts);
        return { ok: true, settled: settled ?? 'client' };
      }
      return { ok: false, reason: 'insufficient_balance' };
    },

    // ── verified on-chain upgrade income ───────────────────────────────────
    // SOL the server has PROVEN arrived at the treasury wallet on-chain
    // (server/payments.mjs: confirmed transaction, exact recipient, exact
    // lamports). No player balance is involved — the payment already happened
    // on-chain. Routes through the same received-funds split and the same
    // `upgrade_in` ledger kind as every other upgrade payment.
    receiveUpgradeSol(name, solAmount, { settled = 'onchain', ts } = {}) {
      const amount = round9(Number(solAmount));
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
      const buyback = round9(amount * FEES.buybackPct);
      const gas = round9(amount * FEES.gasReservePct);
      pendingBuybackSol = round9(pendingBuybackSol + buyback);
      gasReserveSol = round9(gasReserveSol + gas);
      log('upgrade_in', { name: name ?? null, sol: amount, buyback, gas, settled }, ts);
      return { ok: true, settled, buyback, gas };
    },

    // ── gas sweep ──────────────────────────────────────────────────────────
    // When the reserve reaches the threshold, sweep exactly half into the
    // current cycle's buyback (`gas_sweep`).
    maybeSweepGas({ ts } = {}) {
      if (gasReserveSol < FEES.gasSweepThresholdSol) return null;
      const sweep = round9(gasReserveSol * FEES.gasSweepFraction);
      gasReserveSol = round9(gasReserveSol - sweep);
      pendingBuybackSol = round9(pendingBuybackSol + sweep);
      log('gas_sweep', { sweep, reserveAfter: gasReserveSol }, ts);
      return { swept: sweep };
    },

    // ── generic audited player-ledger moves (casino chunk) ─────────────────
    // The casino debits/credits the SAME server-side ledger every other
    // server-settled flow uses (deposits, funded shop purchases). Every move
    // is a ledger event: nothing changes without an audit line.
    balanceOf(name) {
      const b = balances.get(String(name || '').slice(0, 12));
      return b ? b.tokens : 0;
    },
    debitPlayer(name, amountTokens, kind, extra = {}, ts = Date.now()) {
      const amount = Math.floor(Number(amountTokens));
      const key = String(name || '').slice(0, 12);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
      const b = bal(key);
      if (b.tokens < amount) return { ok: false, reason: 'insufficient_balance' };
      b.tokens -= amount;
      log(kind, { name: key, tokens: amount, ...extra }, ts);
      return { ok: true };
    },
    creditPlayer(name, amountTokens, kind, extra = {}, ts = Date.now()) {
      const amount = Math.floor(Number(amountTokens));
      const key = String(name || '').slice(0, 12);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
      bal(key).tokens += amount;
      log(kind, { name: key, tokens: amount, ...extra }, ts);
      return { ok: true };
    },
    // Move treasury token holdings directly, always with a ledger event.
    // spendTreasury refuses to go negative — an underfunded payout is the
    // caller's problem, never a silent deficit.
    addTreasury(amountTokens, kind, extra = {}, ts = Date.now()) {
      const amount = Math.floor(Number(amountTokens));
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
      treasuryTokens += amount;
      log(kind, { tokens: amount, ...extra }, ts);
      return { ok: true };
    },
    spendTreasury(amountTokens, kind, extra = {}, ts = Date.now()) {
      const amount = Math.floor(Number(amountTokens));
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid_amount' };
      if (treasuryTokens < amount) return { ok: false, reason: 'insufficient_treasury' };
      treasuryTokens -= amount;
      log(kind, { tokens: amount, ...extra }, ts);
      return { ok: true };
    },

    // ── buyback swap ───────────────────────────────────────────────────────
    // Swaps ALL pending buyback SOL into $BLOCKVILLE. A hard slippage cap or
    // dynamic minimum-out breach rolls the FULL amount — including any
    // sweep — into the next cycle untouched (`swap_rolled`); success
    // ledgers `swap_out` and `tokens_in`. A broken DATA FEED (unreachable
    // venue / absurd deviation vs the previous successful swap / startup
    // gate not yet satisfied) rolls too but is ledgered distinctly as
    // `swap_stale_quote` so the operator can tell "price moved" apart from
    // "data feed broken". Fees keep accruing either way.
    // Real-path chunk: the venue may be the async Jupiter client — the swap
    // is awaited (the mock venue's synchronous return value awaits as-is).
    async runBuyback(venue, { ts } = {}) {
      const solIn = pendingBuybackSol;
      if (!(solIn > 0)) return { swapped: 0, tokensOut: 0 };
      let quote;
      try { quote = await venue.swap(solIn); } catch (e) {
        if (e?.name === 'VenueError' && e.reason === 'stale_quote') {
          log(SWAP.staleQuoteLedgerKind, { sol: solIn, reason: e.cause ? String(e.cause) : 'stale_quote' }, ts);
          return { rolled: true, reason: 'stale_quote', sol: solIn };
        }
        if (e?.name === 'VenueError' && (e.reason === 'slippage_cap' || e.reason === 'min_out')) {
          // The venue refused execution below the live minOut before
          // anything reached the chain — same hard cap, venue-enforced.
          log('swap_rolled', { sol: solIn, reason: e.reason }, ts);
          return { rolled: true, reason: e.reason, sol: solIn };
        }
        log('swap_rolled', { sol: solIn, reason: 'venue_error' }, ts);
        return { rolled: true, reason: 'venue_error', sol: solIn };
      }
      const tokensOut = Number(quote?.tokensOut);
      const spot = Number(quote?.spotTokensPerSol);
      if (!Number.isFinite(tokensOut) || tokensOut <= 0 || !Number.isFinite(spot) || spot <= 0) {
        log('swap_rolled', { sol: solIn, reason: 'bad_quote' }, ts);
        return { rolled: true, reason: 'bad_quote', sol: solIn };
      }
      const effective = tokensOut / solIn;
      const slippage = (spot - effective) / spot;
      if (slippage > SWAP.maxSlippagePct) {
        log('swap_rolled', { sol: solIn, reason: 'slippage_cap', slippagePct: Math.round(slippage * 10000) / 100 }, ts);
        return { rolled: true, reason: 'slippage_cap', sol: solIn };
      }
      // Dynamic minimum-out: derived from the LIVE spot the venue reported
      // for this exact swap — never from a stored price constant.
      const minOut = spot * (1 - SWAP.slippageBps / 10_000) * solIn;
      if (tokensOut < minOut) {
        log('swap_rolled', { sol: solIn, reason: 'min_out', effective: Math.floor(effective), minOut: Math.floor(minOut) }, ts);
        return { rolled: true, reason: 'min_out', sol: solIn };
      }
      pendingBuybackSol = 0;
      treasuryTokens += tokensOut;
      log('swap_out', { sol: solIn, effectiveTokensPerSol: Math.round(effective) }, ts);
      log('tokens_in', { tokens: tokensOut, source: 'buyback' }, ts);
      return { swapped: solIn, tokensOut };
    },

    // One 5-minute boundary: sweep the gas reserve, then run the buyback.
    // The weighted payout joins this boundary in Chunk T3.
    async onCycleBoundary(venue) {
      const sweep = this.maybeSweepGas();
      const swap = await this.runBuyback(venue);
      return { sweep, swap };
    },

    // ── distribution debit (Chunk T3) ──────────────────────────────────────
    // Debits the treasury's token holdings by an EXACT amount the payout
    // engine already rounded down per player. Refuses to overdraw — the
    // sum of payouts can never exceed what the engine planned from the
    // snapshot, so this only guards against a corrupt caller.
    distributeDebit(tokens, extra = {}, ts = Date.now()) {
      const amount = Math.floor(Number(tokens));
      if (!Number.isFinite(amount) || amount < 0) return { ok: false, reason: 'invalid_amount' };
      if (amount === 0) return { ok: true, paid: 0 };
      if (amount > treasuryTokens) return { ok: false, reason: 'overdraw', available: treasuryTokens };
      treasuryTokens -= amount;
      log('distributed', { tokens: amount, ...extra }, ts);
      return { ok: true, paid: amount };
    },

    balanceOf(name) {
      const b = balances.get(name);
      return { tokens: b?.tokens ?? 0, sol: b?.sol ?? 0 };
    },

    // ── cycle inflow attribution (Chunk T4) ────────────────────────────────
    // Sums what ARRIVED during one cycle id, by kind: `tokens_in` (buyback
    // output credited to treasury holdings), `shop_in` (token-denominated
    // shop/furniture recycling) and `upgrade_in` (SOL routed to pending
    // buyback — its tokens only count once the swap lands, as tokens_in).
    // The payout engine embeds this in each cycle's report so the admin view
    // shows exactly what the distribution balance was built from.
    cycleInflows(cycle) {
      let buybackTokens = 0, shopTokens = 0, upgradeSol = 0;
      for (const e of events) {
        if (e.cycle !== cycle) continue;
        if (e.kind === 'tokens_in') buybackTokens += Number(e.tokens) || 0;
        else if (e.kind === 'shop_in') shopTokens += Number(e.tokens) || 0;
        else if (e.kind === 'upgrade_in') upgradeSol += Number(e.sol) || 0;
      }
      return {
        buybackTokens: Math.round(buybackTokens),
        shopTokens: Math.round(shopTokens),
        upgradeSol: Math.round(upgradeSol * SOL_UNIT) / SOL_UNIT,
      };
    },
    // Same sums, but for everything that ARRIVED after timestamp `ts` — what
    // the payout engine uses for "what built THIS cycle's balance": arrivals
    // during the previous window (shop purchases, fee drips) carry the
    // PREVIOUS cycle id, so cycle-id attribution missed them entirely
    // (final-audit fix). The boundary-time swap events land after `ts`, so
    // the buyback output of THIS boundary is still included.
    cycleInflowsSince(ts) {
      let buybackTokens = 0, shopTokens = 0, upgradeSol = 0;
      for (const e of events) {
        if (!(Number(e.ts) > ts)) continue;
        if (e.kind === 'tokens_in') buybackTokens += Number(e.tokens) || 0;
        else if (e.kind === 'shop_in') shopTokens += Number(e.tokens) || 0;
        else if (e.kind === 'upgrade_in') upgradeSol += Number(e.sol) || 0;
      }
      return {
        buybackTokens: Math.round(buybackTokens),
        shopTokens: Math.round(shopTokens),
        upgradeSol: Math.round(upgradeSol * SOL_UNIT) / SOL_UNIT,
      };
    },
    // Kill-switch-off boundary: ledger that we detected the cycle and are
    // idling (no sweep, no swap, no on-chain anything).
    logIdle() {
      log('idle', { reason: 'kill_switch_off', pendingBuybackSol, gasReserveSol });
      return { idle: true };
    },
    get balance() { return treasuryTokens; },
    get gasReserve() { return gasReserveSol; },
    get pendingBuyback() { return pendingBuybackSol; },
    ledger() { return events.slice(); },
  };
  return api;
}
