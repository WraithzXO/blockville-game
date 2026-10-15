// ── Real swap venue: Jupiter v6 public aggregator (no API key, no account) ──
// Buys $BLOCKVILLE with the treasury's SOL at each cycle boundary via the
// PUBLIC quote-api.jup.ag routes. Chosen because it is the standard Solana
// aggregator: best-route pricing across all major pools, a stable public
// REST API that needs no account or key, and versioned swap transactions
// that can be validated and signed locally before anything is sent.
//
// GUARDS (dynamic live-price guard — server/swap-guard.mjs, shared with the
// mock venue so tests exercise the real logic; the engine's hard guards stay
// the second authority — server/treasury.mjs runBuyback re-checks after this
// client returns):
//   - the LIVE spot quote is fetched for the EXACT SOL amount to be spent;
//     minOut = spotOut × (1 − SWAP.slippageBps/10_000) — no static price
//     constant exists anywhere in the swap path.
//   - STARTUP SAFETY: until the first successful live quote is observed
//     after a (re)start, no swap executes (it only sets the baseline) — a
//     bad first read can never fire a real trade.
//   - SANITY FLOOR: a quote deviating more than SWAP.staleQuoteMaxDeviation
//     (default 10x) from the previous successful swap's spot, or an
//     unreachable venue, is a broken feed — VenueError('stale_quote') →
//     runBuyback ledgers `swap_stale_quote` and rolls over.
//   - execution below minOut is refused on-chain by Jupiter's slippageBps
//     and re-checked by the engine → `swap_rolled` — nothing is credited.
//
// DOUBLE-SPEND GUARD (state file, one JSON object):
//   - an intent { sig: null, ... } is persisted BEFORE sending; a crash
//     between send and persist is recovered by scanning the treasury's
//     recent lamport deltas for the exact SOL amount.
//   - the signature is persisted the moment sendTransaction returns it; a
//     crash before confirmation is resolved on the NEXT call by checking
//     that SAME signature (success → credited exactly once; failed →
//     cleared; unknown → stays pending, nothing is re-sent).
//
// Env: BV_SWAP_VENUE = auto | jupiter | mock (see tokenomics SWAP),
//      BV_JUPITER_API_URL overrides the default public endpoint.

import fs from 'node:fs';
import path from 'node:path';
import { SOL_MINT, rpcCall, parseTransaction, signTransactionPosition0, solDeltaFromMeta } from './solana.mjs';
import { SWAP } from './tokenomics.mjs';
import { VenueError, createSwapGuard } from './swap-guard.mjs';

export { VenueError };

const LAMPORTS_PER_SOL = 1e9;

export function createJupiterVenue(opts = {}) {
  const rpcUrl = opts.rpcUrl;
  const mint = opts.mint;
  const payer = opts.payer; // keypair handle from solana.loadKeypairFile
  const apiUrl = (opts.apiUrl || SWAP.defaultJupiterApiUrl).replace(/\/$/, '');
  const treasuryAddress = opts.treasuryAddress;
  const statePath = opts.statePath ?? null;
  const confirmTimeoutMs = opts.confirmTimeoutMs ?? 30_000;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // Shared live-price guard (same semantics as the mock venue: cold at
  // construction — the startup gate is armed until the first successful
  // live quote is observed).
  const guard = createSwapGuard({});

  if (!rpcUrl || !mint || !payer?.publicKey || !treasuryAddress) throw new Error('jupiter_venue_missing_config');

  const readState = () => {
    if (!statePath) return null;
    try {
      const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (!st || typeof st !== 'object' || !Number.isFinite(st.solIn) || st.solIn <= 0) return null;
      if (st.sig != null && typeof st.sig !== 'string') return null;
      return st;
    } catch { return null; }
  };
  const writeState = (st) => {
    if (!statePath) return;
    try {
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(st));
    } catch { /* best-effort: worst case is a bounded on-chain re-scan */ }
  };
  const clearState = () => writeState(null);

  const call = (method, params) => rpcCall(rpcUrl, method, params, fetchImpl);

  const checkSignature = async (sig) => {
    const res = await call('getSignatureStatuses', [[sig], { searchHistory: false }]);
    const st = res?.value?.[0] ?? null;
    if (!st) return 'unknown';
    if (st.err) return 'failed';
    if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized' || (st.confirmations ?? 0) > 0) return 'success';
    return 'unknown';
  };

  let decimalsCache = null;
  const mintDecimals = async () => {
    if (decimalsCache != null) return decimalsCache;
    const res = await call('getTokenSupply', [mint]);
    const d = Number(res?.value?.decimals);
    if (!Number.isInteger(d) || d < 0 || d > 18) throw new VenueError('bad_decimals');
    decimalsCache = d;
    return d;
  };

  // Public quote endpoint — GET /quote. Returns the raw quoteResponse.
  const fetchQuote = async (lamports) => {
    const url = `${apiUrl}/quote?inputMint=${SOL_MINT}&outputMint=${encodeURIComponent(mint)}` +
      `&amount=${lamports}&slippageBps=${Math.max(1, Math.floor(SWAP.slippageBps))}` +
      `&onlyDirectRoutes=false&restrictIntermediateTokens=true`;
    const res = await fetchImpl(url, { method: 'GET' });
    if (!res.ok) throw new VenueError('quote_http_error', `http_${res.status}`);
    const q = await res.json();
    if (!q || typeof q !== 'object') throw new VenueError('bad_quote');
    const inAmount = Number(q.inAmount);
    const outAmount = Number(q.outAmount);
    if (!Number.isFinite(inAmount) || inAmount !== lamports || !Number.isFinite(outAmount) || outAmount <= 0) {
      throw new VenueError('bad_quote');
    }
    return q;
  };

  // Recovery for an intent persisted without a signature (crash between
  // send and persist): the treasury PAYING exactly `solIn` lamports net of
  // its own received side — i.e. its lamport delta ≈ −(solIn + fee) — marks
  // the swap as landed. Bounded scan, on-chain truth only.
  const scanForSwap = async (solIn) => {
    const target = -Math.floor(solIn * LAMPORTS_PER_SOL);
    const res = await call('getSignaturesForAddress', [treasuryAddress, { limit: 20 }]);
    const sigs = (Array.isArray(res) ? res : []).map((e) => (typeof e === 'string' ? e : e?.signature)).filter(Boolean);
    for (const sig of sigs) {
      try {
        const tx = await call('getTransaction', [sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]);
        if (!tx || tx.meta?.err) continue;
        const keys = tx.transaction?.message?.accountKeys ?? [];
        const delta = solDeltaFromMeta(tx.meta, keys, treasuryAddress);
        if (delta <= target) return sig; // paid at least the intended SOL
      } catch { /* keep scanning; on-chain truth only */ }
    }
    return null;
  };

  // Resolve any in-flight swap BEFORE doing anything new. Returns
  // { resolved: {tokensOut, spot} } | 'pending' | null (fresh path).
  const resolvePending = async () => {
    const st = readState();
    if (!st) return null;
    if (st.sig) {
      const status = await checkSignature(st.sig);
      if (status === 'success') return { tokensOut: st.tokensOut, spot: st.spot, signature: st.sig };
      if (status === 'unknown') return 'pending';
      clearState(); // failed on chain → safe to retry FRESH
      return null;
    }
    const found = st.sig === null ? await scanForSwap(st.solIn) : null;
    if (found) return { tokensOut: st.tokensOut, spot: st.spot, signature: found };
    clearState(); // nothing ever reached the chain
    return null;
  };

  // The engine-facing interface: identical shape to the mock venue's
  // swap(solIn) → { tokensOut, spotTokensPerSol } — async under the hood;
  // treasury.runBuyback awaits it (the mock's synchronous return value is
  // awaited transparently).
  const swap = async (solIn) => {
    const sol = Number(solIn);
    if (!Number.isFinite(sol) || sol <= 0) throw new VenueError('invalid_amount');
    const lamports = Math.floor(sol * LAMPORTS_PER_SOL);

    const pending = await resolvePending();
    if (pending === 'pending') throw new VenueError('pending_unconfirmed');
    if (pending) {
      return { tokensOut: pending.tokensOut, spotTokensPerSol: pending.spot, recovered: true, signature: pending.signature };
    }

    // ── OBSERVE: live spot quote for the EXACT SOL amount ──
    // Everything up to and including the guard's sanity checks is the
    // quote phase: any failure there (unreachable venue, malformed data,
    // absurd deviation vs the previous successful swap, startup gate) is a
    // DATA-FEED refusal → VenueError('stale_quote') → the engine ledgers
    // `swap_stale_quote`. Execution-phase failures below stay distinct.
    let q, spot, spotOut, tokensOut, minOut;
    try {
      const decimals = await mintDecimals();
      const scale = 10 ** decimals;
      q = await fetchQuote(lamports);
      tokensOut = spotOut = Number(q.outAmount) / scale;
      spot = spotOut / sol;
      guard.observeSpot(spot); // throws stale_quote: no_baseline | deviation
      minOut = guard.minOutFor(spotOut);
      if (!Number.isFinite(minOut) || minOut <= 0) throw new VenueError('stale_quote', 'bad_minout');
    } catch (e) {
      if (e instanceof VenueError && e.reason === 'stale_quote') throw e;
      throw new VenueError('stale_quote', e?.reason ?? String(e?.message ?? e));
    }

    // Persist the INTENT before anything is sent (crash-safety).
    writeState({ sig: null, solIn: sol, tokensOut, spot, minOut, ts: Date.now() });

    // Build the swap transaction. Jupiter returns a versioned (v0) tx whose
    // fee payer is userPublicKey — validate it BEFORE signing.
    let res;
    try {
      res = await fetchImpl(`${apiUrl}/swap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quoteResponse: q, userPublicKey: treasuryAddress, wrapAndUnwrapSol: true }),
      });
    } catch (e) {
      clearState();
      throw new VenueError('swap_http_error', String(e?.message ?? e));
    }
    if (!res.ok) {
      clearState();
      throw new VenueError('swap_http_error', `http_${res.status}`);
    }
    const built = await res.json().catch(() => null);
    const swapTransaction = built?.swapTransaction;
    if (typeof swapTransaction !== 'string' || !swapTransaction) {
      clearState();
      throw new VenueError('bad_swap_response');
    }
    let raw;
    try {
      raw = Buffer.from(swapTransaction, 'base64');
      parseTransaction(raw); // throws on unsupported versions
    } catch (e) {
      clearState();
      throw new VenueError('unparsable_swap_tx', String(e?.message ?? e));
    }
    let signed;
    try {
      signed = signTransactionPosition0(raw, payer); // refuses foreign payer / multi-signer
    } catch (e) {
      clearState();
      throw new VenueError(String(e?.message === 'multi_signer_refused' ? 'multi_signer' : 'foreign_payer'), String(e?.message ?? e));
    }

    let signature;
    try {
      signature = await call('sendTransaction', [
        signed.toString('base64'),
        { encoding: 'base64', skipPreflight: false, maxRetries: 2, preflightCommitment: 'confirmed' },
      ]);
    } catch (e) {
      // sendTransaction failing means NOTHING was accepted by the chain —
      // clear the intent; the next boundary retries fresh. No double-spend.
      clearState();
      throw new VenueError('send_failed', String(e?.message ?? e));
    }
    if (typeof signature !== 'string' || !signature) {
      clearState();
      throw new VenueError('send_failed');
    }
    writeState({ sig: signature, solIn: sol, tokensOut, spot, minOut, ts: Date.now() });

    const deadline = Date.now() + confirmTimeoutMs;
    while (Date.now() < deadline) {
      const status = await checkSignature(signature);
      if (status === 'success') {
        clearState(); // engine credits tokensOut from THIS return value
        guard.recordSuccess(spot); // this swap's spot is the new baseline
        return { tokensOut, spotTokensPerSol: spot, signature };
      }
      if (status === 'failed') {
        clearState();
        throw new VenueError('tx_failed');
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new VenueError('unconfirmed'); // signature stays persisted; next call resolves it
  };

  return {
    name: 'jupiter',
    swap,
    checkSignature,
    // exposed for tests/operator: read the persisted guard without side effects
    readPending: readState,
  };
}
