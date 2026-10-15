// ── Blockville casino: authoritative blackjack table (casino chunk) ─────────
// All game math lives here, on the server. The client only renders state —
// no client-side card generation or result logic exists anywhere.
//
// Rules (per the chunk brief):
//   • Max bet 5,000 $BLOCKVILLE (BLACKJACK.maxBet), hit or stand only.
//   • Dealer stands on 17 — all 17s, soft included.
//   • Aces count 1 or 11 (handValue downgrades 11s as needed).
//   • Push returns the stake.
//   • A natural blackjack pays 3:2 — only while the treasury can actually
//     cover the payout. If the treasury was drained between bet and settle
//     (e.g. a payout cycle ran mid-hand), the hand falls back to a PUSH
//     instead of underpaying or going negative; the shortfall is audited.
//   • Losing stakes go to the treasury; winning payouts come out of it.
//   • Funds are reserved BEFORE the bet is accepted: the treasury must hold
//     1.5× the bet — the largest possible payout — on top of every
//     already-open hand's reservation, and the player's server-side ledger
//     must cover the stake, which is escrowed (debited) immediately.
//
// Money model: the player's wagerable balance is the treasury module's
// server-side ledger (funded by the existing capped deposit system — never
// by a client-reported wallet). The stake sits in this engine's escrow
// between bet and settlement, OUTSIDE treasury holdings, so a mid-hand
// payout cycle can never spend money a settled hand is owed.
//
// Randomness: Fisher–Yates over a 6-deck shoe with crypto.randomInt. No
// client input ever touches the deck. (Test hooks, clearly marked: opts.deck
// forces the draw order and opts.rng replaces the RNG — used only by
// tests/blackjack.spec.mjs; production never passes them.)
//
// Identity: hands are keyed by the caller's player key (the server wires
// claimKeyOf: the verified wallet in live mode, the joined name in demo).
// One active hand per key, enforced here.

import crypto from 'node:crypto';

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// rank from a compact card string like 'AS', '10H'
const rankOf = (card) => card.slice(0, card.length - 1);
const valueOf = (card) => {
  const r = rankOf(card);
  if (r === 'A') return 11;
  if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10;
  return Number(r);
};

// Total with aces as 11 downgraded to 1 as needed. soft = an ace still counts 11.
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += valueOf(c);
    if (rankOf(c) === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

export const isNatural = (cards) => cards.length === 2 && handValue(cards).total === 21;

export function createBlackjackTable(opts = {}) {
  const limits = opts.limits; // BLACKJACK from server/tokenomics.mjs
  const treasury = opts.treasury; // treasury API: balanceOf/debitPlayer/creditPlayer/addTreasury/spendTreasury/balance
  const audit = typeof opts.audit === 'function' ? opts.audit : () => {};
  const rng = opts.rng || ((n) => crypto.randomInt(n)); // secure by default; tests may inject

  // treasury.balanceOf returns a number OR a {tokens, sol} envelope depending
  // on which revision of the module shadows the other — normalize to a token
  // number here so bets and displayed balances are always numeric.
  const tokensOf = (name) => {
    const b = treasury.balanceOf(name);
    return typeof b === 'number' ? b : Math.floor(Number(b?.tokens) || 0);
  };

  const hands = new Map(); // playerKey -> open hand record
  const escrow = new Map(); // playerKey -> escrowed stake (leaves the player at bet, never reaches treasuryTokens before settlement)
  const lastHands = new Map(); // playerKey -> settled hand snapshot (result display only, no money attached)

  const freshShoe = () => {
    const shoe = [];
    for (let d = 0; d < limits.decks; d++)
      for (const s of SUITS) for (const r of RANKS) shoe.push(r + s);
    for (let i = shoe.length - 1; i > 0; i--) { // Fisher–Yates, secure RNG
      const j = rng(i + 1);
      const t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t;
    }
    return shoe;
  };

  // Test hook: when opts.deck is provided, the shoe IS this array in draw order.
  let shoe = Array.isArray(opts.deck) && opts.deck.length ? opts.deck.map(String) : freshShoe();
  const draw = () => {
    if (shoe.length < limits.reshuffleBelow && !Array.isArray(opts.deck)) shoe = freshShoe();
    if (!shoe.length) shoe = freshShoe(); // a forced test deck may run dry — refill safely
    return shoe.shift();
  };

  // Outstanding treasury payout reservation across all OPEN hands.
  const reservedPayouts = () => {
    let sum = 0;
    for (const h of hands.values()) sum += h.bet * limits.treasuryReserveMult;
    return sum;
  };

  // Settlement: the one place money moves after a bet. Exactly one call per
  // hand — settle() removes the hand before anything else happens.
  const settle = (key, name, outcome) => {
    const hand = hands.get(key);
    if (!hand) return null;
    hands.delete(key);
    escrow.delete(key); // the escrowed stake is resolved exactly once, here
    const bet = hand.bet;

    if (outcome === 'lose') {
      // The escrowed stake goes to the treasury.
      treasury.addTreasury(bet, 'blackjack_in', { name, bet });
    } else if (outcome === 'push') {
      // The stake returns to the player; nobody wins or loses.
      treasury.creditPlayer(name, bet, 'blackjack_push', { bet });
    } else {
      // Win (1:1) or natural (3:2): stake back + winnings from the treasury.
      const winnings = Math.floor(bet * (outcome === 'natural' ? limits.naturalPayout : limits.winPayout));
      const paid = treasury.spendTreasury(winnings, 'blackjack_payout', { name, bet, natural: outcome === 'natural' });
      if (paid.ok) {
        treasury.creditPlayer(name, bet + winnings, 'blackjack_return', { bet, winnings });
      } else {
        // Treasury drained mid-hand (reserved funds were distributed): the
        // hand degrades to a PUSH — the player keeps the stake, nothing is
        // underpaid, the treasury never goes negative. Audited loudly.
        treasury.creditPlayer(name, bet, 'blackjack_push', { bet, shortfall: winnings, drained: true });
        audit('settlement_shortfall', { name, bet, wanted: winnings, outcome });
        outcome = 'push';
      }
    }
    const result = { outcome, bet, payout: outcome === 'natural' ? Math.floor(bet * limits.naturalPayout) : outcome === 'win' ? bet : 0 };
    audit('settled', { name, bet, outcome, payout: result.payout });
    hand.result = result;
    hand.phase = 'done';
    hand.holeHidden = false;
    lastHands.set(key, hand); // result stays visible until this player's next bet
    return hand;
  };

  // Dealer plays: reveal the hole card, draw while under 17 (all 17s stand,
  // soft included). Bust or compare — 2-card dealer 21 is just 21.
  const dealerPlay = (hand) => {
    hand.holeHidden = false;
    while (handValue(hand.dealer).total < 17) hand.dealer.push(draw());
    return handValue(hand.dealer).total;
  };

  const compare = (key, name, hand, playerTotal, dealerTotal) => {
    if (dealerTotal > 21 || playerTotal > dealerTotal) settle(key, name, 'win');
    else if (playerTotal === dealerTotal) settle(key, name, 'push');
    else settle(key, name, 'lose');
    return ok(key, name);
  };

  // Snapshot of an OPEN hand (hole card hidden) or the idle betting state.
  // The balance shown is ALWAYS the server-side ledger balance.
  const openState = (key, name) => {
    const hand = hands.get(key) ?? lastHands.get(key);
    const balance = tokensOf(name);
    if (!hand) {
      return { phase: 'betting', ok: true, balance, bet: 0, treasury: Math.floor(treasury.balance), you: [], dealer: [], holeHidden: false, result: null };
    }
    return {
      phase: hand.phase,
      ok: true,
      balance,
      bet: hand.bet,
      treasury: Math.floor(treasury.balance),
      you: hand.you,
      dealer: hand.holeHidden ? [hand.dealer[0], '??'] : hand.dealer,
      holeHidden: hand.holeHidden,
      result: hand.result ?? null,
    };
  };

  const ok = (key, name) => ({ ok: true, state: openState(key, name) });
  const fail = (reason, key, name) => ({ ok: false, reason, state: openState(key, name) });

  const api = {
    // Place a bet. Validates the amount against the table limits and the
    // player's SERVER-SIDE balance, reserves the treasury payout capacity,
    // escrows the stake, then deals.
    bet(key, name, amount) {
      const bet = Math.floor(Number(amount));
      if (!Number.isFinite(bet) || bet < limits.minBet) return fail('bet_too_small', key, name);
      if (bet > limits.maxBet) return fail('bet_too_large', key, name);
      if (hands.has(key)) return fail('hand_in_progress', key, name);
      if (tokensOf(name) < bet) return fail('insufficient_balance', key, name);
      // Reservation BEFORE acceptance: the treasury must cover the largest
      // possible payout for this bet on top of every open hand's reservation.
      if (treasury.balance - reservedPayouts() < bet * limits.treasuryReserveMult) return fail('treasury_cannot_cover', key, name);
      const debited = treasury.debitPlayer(name, bet, 'blackjack_bet', { bet });
      if (!debited.ok) return fail(debited.reason ?? 'insufficient_balance', key, name);
      escrow.set(key, bet);
      lastHands.delete(key); // a new bet clears the previous hand's result display

      const hand = { bet, you: [], dealer: [], phase: 'player', holeHidden: true, result: null };
      hands.set(key, hand);
      hand.you.push(draw(), draw());
      hand.dealer.push(draw(), draw());
      audit('bet', { name, bet, balanceAfter: treasury.balanceOf(name) });

      // Player natural: settle immediately (peek — a dealer natural pushes).
      if (isNatural(hand.you)) {
        hand.holeHidden = false;
        if (isNatural(hand.dealer)) {
          audit('natural_both', { name, bet });
          settle(key, name, 'push');
        } else {
          settle(key, name, 'natural');
        }
      } else if (isNatural(hand.dealer)) {
        // Dealer natural: revealed and settled at once (peek rule).
        audit('dealer_natural', { name, bet });
        settle(key, name, 'lose');
      }
      return ok(key, name);
    },

    hit(key, name) {
      const hand = hands.get(key);
      if (!hand || hand.phase !== 'player') return fail('no_active_hand', key, name);
      hand.you.push(draw());
      const { total } = handValue(hand.you);
      audit('hit', { name, total });
      if (total > 21) { dealerPlay(hand); settle(key, name, 'lose'); return ok(key, name); } // bust: dealer reveals
      if (total === 21) { const d = dealerPlay(hand); return compare(key, name, hand, 21, d); }
      return ok(key, name);
    },

    stand(key, name) {
      const hand = hands.get(key);
      if (!hand || hand.phase !== 'player') return fail('no_active_hand', key, name);
      const playerTotal = handValue(hand.you).total;
      const dealerTotal = dealerPlay(hand);
      audit('stand', { name, playerTotal, dealerTotal });
      return compare(key, name, hand, playerTotal, dealerTotal);
    },

    // Disconnect mid-hand: auto-stand, let the dealer play, settle. No
    // orphaned hand, no free abandon — the stake is settled one way or the
    // other, exactly as if the player had stood.
    settleDisconnected(key, name) {
      const hand = hands.get(key);
      if (!hand) return false;
      audit('disconnect_settle', { name, bet: hand.bet });
      const playerTotal = handValue(hand.you).total;
      if (hand.phase === 'player') {
        const dealerTotal = dealerPlay(hand);
        compare(key, name, hand, playerTotal, dealerTotal);
      } else {
        settle(key, name, 'lose'); // unreachable phase guard — settle anyway, never orphan
      }
      return true;
    },

    // True while this player still has an UNSETTLED hand (used by the
    // session-takeover paths, which must also settle before stealing identity).
    hasOpenHand(key) { return hands.has(key); },

    stateFor(key, name) { return openState(key, name); },
  };
  return api;
}
