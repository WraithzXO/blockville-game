// ── Dynamic live-price swap guard (shared by the Jupiter venue and the mock) ─
// One guard implementation, two venues — so the mock path in tests exercises
// EXACTLY the guard logic the real path runs.
//
// The guard replaces the old static `minOutTokensPerSol` constant (tuned for
// the mock's fixed price and stale the moment the real token's price moved).
// Every swap now works off the LIVE spot quote fetched at swap time:
//
//   1. OBSERVE   the venue fetches the live spot quote for the EXACT SOL
//                amount to be spent; the guard sanity-checks it.
//   2. GATE      until the first successful live quote is observed after a
//                (re)start, NO swap executes — the first read only becomes
//                the baseline, so a bad first read can never fire a trade.
//   3. FLOOR     the observed spot is compared against the previous
//                successful swap's spot; a deviation beyond
//                SWAP.staleQuoteMaxDeviation (default 10x either way) means
//                the data feed is broken, not the price — refuse.
//   4. MINOUT    minOut = spotOut × (1 − SWAP.slippageBps / 10000), enforced
//                by the venue before signing (Jupiter enforces it on-chain
//                via the same slippageBps) and re-checked by the engine.
//   5. RECORD    a successful swap's spot becomes the new baseline.
//
// Refusals surface as VenueError with reason 'stale_quote' (data feed
// broken / no baseline yet) — the engine ledgers those distinctly as
// `swap_stale_quote` so the operator can tell "price moved" apart from
// "data feed broken". Price moves WITHIN tolerance are not refusals: they
// breach minOut at execution and roll the cycle as `swap_rolled` (slippage).

import { SWAP } from './tokenomics.mjs';

export class VenueError extends Error {
  constructor(reason, cause) {
    super(`venue: ${reason}`);
    this.name = 'VenueError';
    this.reason = reason;
    this.cause = cause;
  }
}

export function createSwapGuard(opts = {}) {
  const slippageBps = Number.isFinite(opts.slippageBps) ? opts.slippageBps : SWAP.slippageBps;
  const maxDeviation = Number.isFinite(opts.maxDeviation) && opts.maxDeviation > 1
    ? opts.maxDeviation
    : SWAP.staleQuoteMaxDeviation;

  // Per-SOL spot of the previous successful swap — null until the first
  // successful live quote after a (re)start (the startup gate).
  let baselineSpot = null;

  return {
    get baselineSpot() { return baselineSpot; },

    // Phase 1+2+3: validate the LIVE spot (per SOL) for this swap attempt.
    // Returns the validated spot. Throws VenueError('stale_quote', detail)
    // when the quote is unusable, no baseline exists yet, or the price
    // deviates absurdly from the previous successful swap.
    observeSpot(spotPerSol) {
      if (!Number.isFinite(spotPerSol) || spotPerSol <= 0) {
        throw new VenueError('stale_quote', 'bad_quote');
      }
      if (baselineSpot == null) {
        // Startup safety: the first successful live quote after a (re)start
        // is recorded as the baseline and NO trade fires on it.
        baselineSpot = spotPerSol;
        throw new VenueError('stale_quote', 'no_baseline');
      }
      const deviation = Math.max(spotPerSol / baselineSpot, baselineSpot / spotPerSol);
      if (!(deviation <= maxDeviation)) {
        // Garbage data never becomes the baseline.
        throw new VenueError('stale_quote', 'deviation');
      }
      return spotPerSol;
    },

    // Phase 4: minimum acceptable token output for this swap, derived from
    // the LIVE expected out — never from a stored price constant.
    minOutFor(spotOutTokens) {
      return spotOutTokens * (1 - slippageBps / 10_000);
    },

    // Phase 4 (execution check): the delivered output must meet minOut.
    // A breach means the price moved beyond tolerance between quote and
    // execution — the engine rolls the FULL amount (`swap_rolled`).
    checkDelivered(tokensOut, minOut) {
      if (!Number.isFinite(tokensOut) || tokensOut < minOut) {
        throw new VenueError('slippage_cap');
      }
    },

    // Phase 5: a successful swap's spot is the new deviation baseline.
    recordSuccess(spotPerSol) {
      if (Number.isFinite(spotPerSol) && spotPerSol > 0) baselineSpot = spotPerSol;
    },
  };
}
