// Casino blackjack engine — unit tests over server/blackjack.mjs.
// The engine is driven with an injected draw order (opts.deck) and a fake
// treasury, so every settlement below is deterministic. These hooks exist
// only for tests; production always uses the secure RNG and the real
// treasury module. Each scenario checks the money trail (escrow → escrow
// resolution → treasury/player ledger) as well as the cards.
import { createBlackjackTable, handValue, isNatural } from '../server/blackjack.mjs';
import { runTests } from './harness.mjs';

const LIMITS = { minBet: 1, maxBet: 5000, decks: 6, reshuffleBelow: 60, naturalPayout: 1.5, winPayout: 1, treasuryReserveMult: 1.5 };

// Minimal treasury double matching the surface the engine calls.
function fakeTreasury(startTokens, startTreasury) {
  const rec = {
    balance: startTreasury,
    players: new Map(), // name -> ledger tokens
    log: [],            // every money event, in order
  };
  rec.balanceOf = (name) => rec.players.get(name) ?? 0;
  rec.debitPlayer = (name, amt, kind, extra = {}) => {
    const cur = rec.players.get(name) ?? 0;
    if (cur < amt) return { ok: false, reason: 'insufficient_balance' };
    rec.players.set(name, cur - amt);
    rec.log.push({ kind, name, amount: amt, ...extra });
    return { ok: true };
  };
  rec.creditPlayer = (name, amt, kind, extra = {}) => {
    rec.players.set(name, (rec.players.get(name) ?? 0) + amt);
    rec.log.push({ kind, name, amount: amt, ...extra });
    return { ok: true };
  };
  rec.addTreasury = (amt, kind, extra = {}) => {
    rec.balance += amt;
    rec.log.push({ kind, amount: amt, ...extra });
    return { ok: true };
  };
  rec.spendTreasury = (amt, kind, extra = {}) => {
    if (rec.balance < amt) return { ok: false };
    rec.balance -= amt;
    rec.log.push({ kind, amount: amt, ...extra });
    return { ok: true };
  };
  return rec;
}

// A table with a fixed draw order and a known player balance.
function riggedTable(deck, { playerTokens = 10_000, treasuryTokens = 1_000_000 } = {}) {
  const t = fakeTreasury(playerTokens, treasuryTokens);
  t.players.set('Alice', playerTokens);
  const audited = [];
  const table = createBlackjackTable({ limits: LIMITS, treasury: t, deck, audit: (kind, info) => audited.push({ kind, ...info }) });
  return { table, t, audited };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── hand value helpers ───────────────────────────────────────────────────────
test('handValue: aces count 11 then downgrade to 1 as needed', () => {
  if (handValue(['AS', 'KD']).total !== 21 || !handValue(['AS', 'KD']).soft) throw new Error('A+K should be soft 21');
  if (handValue(['AS', 'KD', '9H']).total !== 20 || handValue(['AS', 'KD', '9H']).soft) throw new Error('A+K+9 should be hard 20');
  if (handValue(['AS', 'AS', '9H']).total !== 21) throw new Error('A+A+9 should be 21');
});

test('isNatural: two cards totalling 21 only', () => {
  if (!isNatural(['AS', 'KS'])) throw new Error('A+K is a natural');
  if (isNatural(['AS', 'KS', 'QC'])) throw new Error('three-card 21 is NOT a natural');
  if (isNatural(['9H', 'QC'])) throw new Error('19 is not a natural');
});

// ── win path ─────────────────────────────────────────────────────────────────
test('win: 1:1 paid from the treasury, stake escrowed then returned with winnings', () => {
  const { table, t } = riggedTable(['10H', '10S', '9D', '9C']); // Alice 20, dealer 18
  const bet = table.bet('k1', 'Alice', 100);
  if (!bet.ok) throw new Error(`bet rejected: ${bet.reason}`);
  if (t.balanceOf('Alice') !== 9900) throw new Error(`stake not escrowed at bet: ${t.balanceOf('Alice')}`);
  const res = table.stand('k1', 'Alice');
  if (!res.ok || res.state.result.outcome !== 'win') throw new Error(`expected win: ${JSON.stringify(res.state?.result)}`);
  if (res.state.result.payout !== 100) throw new Error(`payout should be 100: ${res.state.result.payout}`);
  if (t.balanceOf('Alice') !== 10100) throw new Error(`balance after win: ${t.balanceOf('Alice')}`);
  // the escrowed stake leaves the PLAYER at bet and returns to the player on
  // a win; the treasury only ever pays the winnings (100)
  if (t.balance !== 999_900) throw new Error(`treasury after win: ${t.balance}`);
  if (!table.stateFor('k1', 'Alice').result) throw new Error('settled result should stay visible (snapshot)');
  if (table.hasOpenHand('k1')) throw new Error('hand still open after settle');
});

// ── lose path ────────────────────────────────────────────────────────────────
test('lose: escrowed stake goes to the treasury', () => {
  const { table, t } = riggedTable(['9S', '9H', '9D', '10C']); // Alice 18, dealer 19
  table.bet('k1', 'Alice', 100);
  const res = table.stand('k1', 'Alice');
  if (res.state.result.outcome !== 'lose') throw new Error(`expected lose: ${JSON.stringify(res.state.result)}`);
  if (t.balanceOf('Alice') !== 9900) throw new Error(`loser balance: ${t.balanceOf('Alice')}`);
  if (t.balance !== 1_000_100) throw new Error(`losing stake must land in treasury: ${t.balance}`);
});

// ── push path ────────────────────────────────────────────────────────────────
test('push: stake returned exactly, treasury untouched', () => {
  const { table, t } = riggedTable(['10H', '10S', '10D', '10C']); // 20 v 20
  table.bet('k1', 'Alice', 100);
  const res = table.stand('k1', 'Alice');
  if (res.state.result.outcome !== 'push') throw new Error(`expected push: ${JSON.stringify(res.state.result)}`);
  if (t.balanceOf('Alice') !== 10_000) throw new Error(`push must return the stake: ${t.balanceOf('Alice')}`);
  if (t.balance !== 1_000_000) throw new Error('treasury must be untouched on a push');
});

// ── dealer rules ─────────────────────────────────────────────────────────────
test('dealer stands on all 17s including soft 17', () => {
  const { table } = riggedTable(['9S', '9H', 'AS', '6D']); // Alice 18; dealer soft 17 must STAND
  if (!table.bet('k1', 'Alice', 100).ok) throw new Error('bet rejected');
  const res = table.stand('k1', 'Alice');
  if (res.state.result.outcome !== 'win') throw new Error('soft 17 must stand; 18 beats 17');
  if (res.state.dealer.length !== 2) throw new Error('dealer drew on 17');
});

// ── hit / bust ───────────────────────────────────────────────────────────────
test('hit: draw then bust settles immediately as a loss', () => {
  const { table, t } = riggedTable(['9H', '9S', '2D', '2H', '10C']); // Alice 18, hit 10 → 28
  table.bet('k1', 'Alice', 100);
  const res = table.hit('k1', 'Alice');
  if (!res.ok) throw new Error(`hit rejected: ${res.reason}`);
  if (res.state.result?.outcome !== 'lose') throw new Error('28 must bust to a loss');
  if (t.balanceOf('Alice') !== 9900) throw new Error('bust stake must reach the treasury');
  if (res.state.holeHidden) throw new Error('hole card must be revealed at settlement');
});

// ── naturals ─────────────────────────────────────────────────────────────────
test('natural blackjack pays 3:2 immediately', () => {
  const { table, t } = riggedTable(['AS', 'KS', '9D', '10C']);
  const res = table.bet('k1', 'Alice', 100);
  if (res.state.result?.outcome !== 'natural') throw new Error(`expected natural: ${JSON.stringify(res.state.result)}`);
  if (res.state.result.payout !== 150) throw new Error(`3:2 on 100 is 150: ${res.state.result.payout}`);
  if (t.balanceOf('Alice') !== 10_150) throw new Error(`natural balance: ${t.balanceOf('Alice')}`); // 10000 - 100 + 250
});

test('both natural: push, not 3:2', () => {
  const { table } = riggedTable(['AS', 'KS', 'AD', 'KD']);
  const res = table.bet('k1', 'Alice', 100);
  if (res.state.result?.outcome !== 'push') throw new Error('double natural must push');
});

test('dealer natural: revealed and settled immediately (peek rule)', () => {
  const { table } = riggedTable(['5H', '7S', 'AS', 'KD']);
  const res = table.bet('k1', 'Alice', 100);
  if (res.state.result?.outcome !== 'lose') throw new Error('dealer natural beats 12');
  if (res.state.holeHidden) throw new Error('dealer natural must be revealed');
});

// ── bet validation ───────────────────────────────────────────────────────────
test('bet over table max rejected', () => {
  const { table, t } = riggedTable([]);
  const res = table.bet('k1', 'Alice', 5001);
  if (res.ok || res.reason !== 'bet_too_large') throw new Error(`expected bet_too_large: ${JSON.stringify(res)}`);
  if (t.balanceOf('Alice') !== 10_000) throw new Error('rejected bet must not move money');
});

test('bet below table min rejected', () => {
  const { table } = riggedTable([]);
  const res = table.bet('k1', 'Alice', 0);
  if (res.ok || res.reason !== 'bet_too_small') throw new Error(`expected bet_too_small: ${JSON.stringify(res)}`);
});

test('bet beyond server-side balance rejected', () => {
  const { table, t } = riggedTable([], { playerTokens: 50 });
  const res = table.bet('k1', 'Alice', 100);
  if (res.ok || res.reason !== 'insufficient_balance') throw new Error(`expected insufficient_balance: ${JSON.stringify(res)}`);
  if (t.balanceOf('Alice') !== 50) throw new Error('rejected bet must not move money');
});

test('second hand while one is active rejected', () => {
  const { table } = riggedTable(['10H', '10S', '9D', '9C', '10H', '10S', '9D', '9C']);
  table.bet('k1', 'Alice', 100);
  const res = table.bet('k1', 'Alice', 100);
  if (res.ok || res.reason !== 'hand_in_progress') throw new Error(`expected hand_in_progress: ${JSON.stringify(res)}`);
});

test('hit/stand with no open hand rejected', () => {
  const { table } = riggedTable([]);
  if (table.hit('k1', 'Alice').ok) throw new Error('hit without a hand must fail');
  if (table.stand('k1', 'Alice').ok) throw new Error('stand without a hand must fail');
});

// ── treasury reservation ─────────────────────────────────────────────────────
test('treasury must cover 1.5x the bet BEFORE the bet is accepted', () => {
  const { table, t } = riggedTable(['10H', '10S', '9D', '9C'], { treasuryTokens: 100 });
  const res = table.bet('k1', 'Alice', 100); // needs 150 reserve, treasury holds 100
  if (res.ok || res.reason !== 'treasury_cannot_cover') throw new Error(`expected treasury_cannot_cover: ${JSON.stringify(res)}`);
  if (t.balanceOf('Alice') !== 10_000) throw new Error('rejected bet must not move money');
});

test('reservation counts open hands: the second bet may fit, the third may not', () => {
  const deck = ['10H', '10S', '9D', '9C', '10H', '10S', '9D', '9C', '10H', '10S', '9D', '9C'];
  const { table, t } = riggedTable(deck, { treasuryTokens: 300 }); // covers two 150-reserves, not three
  t.players.set('Bob', 10_000);
  const r1 = table.bet('k1', 'Alice', 100);
  if (!r1.ok) throw new Error(`first bet should fit: ${r1.reason}`);
  const r2 = table.bet('k2', 'Bob', 100);
  if (!r2.ok) throw new Error(`second bet should fit (300-150 >= 150): ${r2.reason}`);
  const r3 = table.bet('k3', 'Alice', 100);
  if (r3.ok || r3.reason !== 'treasury_cannot_cover') throw new Error(`third bet must be refused: ${JSON.stringify(r3)}`);
});

// ── treasury drained mid-hand → degrade to push, never underpay ─────────────
test('treasury drained mid-hand: win degrades to a push, stake returned in full', () => {
  const { table, t, audited } = riggedTable(['10H', '10S', '9D', '9C']);
  table.bet('k1', 'Alice', 100);
  t.balance = 50; // a payout cycle drained the reserve between bet and settle
  const res = table.stand('k1', 'Alice');
  if (res.state.result.outcome !== 'push') throw new Error(`expected degraded push: ${JSON.stringify(res.state.result)}`);
  if (t.balanceOf('Alice') !== 10_000) throw new Error('player must keep the whole stake');
  if (!audited.some((a) => a.kind === 'settlement_shortfall')) throw new Error('shortfall must be audited');
});

// ── disconnect ───────────────────────────────────────────────────────────────
test('disconnect mid-hand: auto-stand, dealer plays, no orphaned hand', () => {
  const { table, t } = riggedTable(['9S', '9H', '9D', '10C']); // 18 v 19 → lose
  table.bet('k1', 'Alice', 100);
  if (!table.settleDisconnected('k1', 'Alice')) throw new Error('settleDisconnected must settle an open hand');
  if (table.hasOpenHand('k1')) throw new Error('hand orphaned after disconnect');
  if (t.balanceOf('Alice') !== 9900) throw new Error(`stake settled on disconnect: ${t.balanceOf('Alice')}`);
  if (table.settleDisconnected('k1', 'Alice')) throw new Error('a settled hand must NOT settle twice');
});

// ── result display snapshot ──────────────────────────────────────────────────
test('settled result stays visible until the next bet clears it', () => {
  const deck = ['10H', '10S', '9D', '9C', '9S', '9H', '9D', '10C'];
  const { table } = riggedTable(deck);
  table.bet('k1', 'Alice', 100);
  table.stand('k1', 'Alice');
  const s1 = table.stateFor('k1', 'Alice');
  if (s1.phase !== 'done' || s1.result?.outcome !== 'win') throw new Error('snapshot missing after settle');
  if (s1.holeHidden) throw new Error('snapshot must show the full dealt hand');
  const res = table.bet('k1', 'Alice', 100);
  if (res.state.result !== null) throw new Error('a new bet must clear the previous result');
  if (!res.state.holeHidden) throw new Error('a fresh hand hides the hole card again');
  if (res.state.dealer[1] !== '??') throw new Error('hole card must render as ?? while in play');
});

// hole-hidden invariant: while a hand is open the client state never shows it
test('open hand state hides the hole card and shows the server balance', () => {
  const { table, t } = riggedTable(['10H', '10S', '9D', '9C']);
  const res = table.bet('k1', 'Alice', 100);
  if (res.state.dealer[1] !== '??') throw new Error('hole hidden during play');
  if (res.state.balance !== t.balanceOf('Alice')) throw new Error('state balance must BE the server ledger');
  if (res.state.phase !== 'player') throw new Error(`phase: ${res.state.phase}`);
});

await runTests(tests);
