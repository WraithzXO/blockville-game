// Casino blackjack — end-to-end through the REAL WS server (headless).
// Covers the operator harness list: enter casino (the welcome snapshot),
// bet, hit, stand, win, push, natural 3:2, bet over max rejected,
// insufficient balance rejected, second hand while one is active rejected,
// disconnect mid-hand leaves no orphaned hand, treasury ledger updates
// after settlement, and the displayed balance refreshing from the server.
//
// The shoe is FORCED through BV_BLACKJACK_DECK — that hook only activates
// when BV_ALLOW_DEMO_DEPOSITS=1, i.e. the dev/test faucet path; production
// never sets either, so the live table always shuffles with the secure RNG.
// Every run spawns a FRESH server (fresh treasury state), so each run seeds
// the treasury pool through the REAL shop-recycling path the game uses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, Client, runTests } from './harness.mjs';

// Ledger isolation FIRST — the harness leaves spec-set paths alone, and the
// ledger assertions below read exactly this file.
const LEDGER = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-bj-')), 'treasury-ledger.jsonl');
process.env.BV_TREASURY_LEDGER = LEDGER;
const readLedger = () => fs.existsSync(LEDGER)
  ? fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
// Wait until the ledger contains an entry matching pred (bounded poll).
async function waitForLedger(pred, label, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = readLedger().find(pred);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`ledger never recorded ${label}; entries: ${JSON.stringify(readLedger().slice(-8))}`);
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fund = async (c, tokens) => { c.send({ t: 'walletDeposit', tokens }); await sleep(150); };

// Wait for the next table reply and dump it whole on any mismatch — a bare
// "phase never arrived" timeout tells an operator nothing.
async function nextBj(c, label) {
  const m = await c.waitFor((x) => x.t === 'bj', `bj (${label})`);
  return m;
}

// The treasury POOL starts empty in fresh server state. Fund it through the
// REAL recycling path the game already uses: a funded player buys a shop item
// and the purchase proceeds land in treasury holdings (payShop, settled
// 'server'). No new funding mechanism is invented for tests.
async function seedTreasury() {
  const c = new Client();
  await c.join('Banker');
  for (let i = 0; i < 3; i++) { c.send({ t: 'walletDeposit', tokens: 50_000 }); await sleep(120); }
  c.send({ t: 'shopPurchase', item: 'crown' }); // 100,000 $BLOCKVILLE → treasury
  await sleep(200);
  c.close();
}

// Every player name below is UNIQUE across the whole spec — demo-mode ledger
// balances persist per name for the lifetime of a server, and a shared name
// would silently accumulate deposits across cases.

// ── Run 1: win + hit + rejections ────────────────────────────────────────────
// Hand 1: MaxWin 20 (10H 10S) v dealer 18 (9D 9C) → stand wins 1:1.
// Hand 2: Hitter 18 (9S 9H) v dealer 19 (9D 10C) → HIT 2D → 20 → stand wins.
process.env.BV_ALLOW_DEMO_DEPOSITS = '1';
process.env.BV_MARKET_TICK_MS = '3600000';
let stop1 = null;
test('setup: spawn server (win-deck) and seed the treasury', async () => {
  // the deck MUST be assigned at spawn time — top-level assignments all run
  // before the first test, and the last one would win for every spawn
  process.env.BV_BLACKJACK_DECK = '10H,10S,9D,9C,9S,9H,9D,10C,2D,2H,2S,2C';
  stop1 = await startServer();
  await seedTreasury();
});

test('enter casino: the welcome snapshot carries the authoritative table state', async () => {
  const a = new Client();
  const w = await a.join('Observer');
  if (!w.bj) throw new Error('welcome has no bj table state');
  if (w.bj.phase !== 'betting' || w.bj.ok !== true) throw new Error(`welcome bj: ${JSON.stringify(w.bj)}`);
  if (typeof w.bj.balance !== 'number') throw new Error(`welcome bj balance is not a number: ${typeof w.bj.balance}`);
  if (!(w.bj.treasury >= 100_000)) throw new Error(`treasury not seeded: ${w.bj.treasury}`);
  a.close();
});

test('bet over table max rejected without moving money', async () => {
  const a = new Client();
  await a.join('MaxBet');
  await fund(a, 10_000);
  a.send({ t: 'bjBet', bet: 5001 });
  const m = await nextBj(a, 'over-max');
  if (m.ok || m.reason !== 'bet_too_large') throw new Error(`expected bet_too_large: ${JSON.stringify(m)}`);
  if (m.balance !== 10_000) throw new Error(`rejected bet moved money: ${m.balance}`);
  a.close();
});

test('bet beyond server-side balance rejected', async () => {
  const a = new Client();
  await a.join('BrokeBob'); // no deposit at all
  a.send({ t: 'bjBet', bet: 100 });
  const m = await nextBj(a, 'no-funds');
  if (m.ok || m.reason !== 'insufficient_balance') throw new Error(`expected insufficient_balance: ${JSON.stringify(m)}`);
  a.close();
});

test('bet, second hand rejected while active, stand, win; balance refreshes from server', async () => {
  const a = new Client();
  await a.join('MaxWin');
  await fund(a, 10_000);
  a.send({ t: 'bjBet', bet: 100 });
  const open = await nextBj(a, 'open');
  if (!open.ok || open.phase !== 'player') throw new Error(`hand not open: ${JSON.stringify(open)}`);
  if (open.balance !== 9900) throw new Error(`stake not escrowed server-side: ${open.balance}`);
  if (open.dealer[1] !== '??') throw new Error('hole card must be hidden while in play');
  // second hand while one is active — rejected by the server
  a.send({ t: 'bjBet', bet: 100 });
  const second = await nextBj(a, 'second-hand');
  if (second.ok || second.reason !== 'hand_in_progress') throw new Error(`expected hand_in_progress: ${JSON.stringify(second)}`);
  // stand → dealer plays → 20 beats 18 → win, paid by the treasury
  a.send({ t: 'bjStand' });
  const done = await nextBj(a, 'settled');
  if (done.phase !== 'done' || done.result?.outcome !== 'win' || done.result.payout !== 100) throw new Error(`expected win 100: ${JSON.stringify(done)}`);
  if (done.balance !== 10_100) throw new Error(`balance after win: ${done.balance}`); // 10000 - 100 + 200
  a.close();
  await waitForLedger((e) => e.kind === 'blackjack_payout' && e.tokens === 100, 'blackjack_payout 100');
});

test('hit then stand wins', async () => {
  const a = new Client();
  await a.join('Hitter');
  await fund(a, 10_000);
  a.send({ t: 'bjBet', bet: 100 }); // 18 v 19 in the shoe order
  const open = await nextBj(a, 'open');
  if (!open.ok || open.phase !== 'player') throw new Error(`hand not open: ${JSON.stringify(open)}`);
  a.send({ t: 'bjHit' });
  const hit = await nextBj(a, 'hit');
  if (!hit.ok || hit.you.length !== 3) throw new Error(`hit rejected or no card: ${JSON.stringify(hit)}`);
  if (hit.you[2] !== '2D') throw new Error(`hit drew the wrong card: ${JSON.stringify(hit.you)}`);
  a.send({ t: 'bjStand' });
  const done = await nextBj(a, 'settled');
  if (done.result?.outcome !== 'win') throw new Error(`20 v 19 must win: ${JSON.stringify(done)}`);
  if (done.balance !== 10_100) throw new Error(`balance after hit-win: ${done.balance}`);
  a.close();
});

test('teardown: stop run 1', async () => { stop1?.(); });

// ── Run 2: natural 3:2 ───────────────────────────────────────────────────────
let stop2 = null;
test('setup: spawn server (natural-deck) and seed the treasury', async () => {
  process.env.BV_BLACKJACK_DECK = 'AS,KS,9D,10C';
  stop2 = await startServer();
  await seedTreasury();
});

test('natural blackjack settles immediately and pays 3:2 from the treasury', async () => {
  const a = new Client();
  await a.join('LuckyJim');
  await fund(a, 10_000);
  a.send({ t: 'bjBet', bet: 100 });
  const m = await nextBj(a, 'natural');
  if (m.phase !== 'done' || m.result?.outcome !== 'natural') throw new Error(`expected natural: ${JSON.stringify(m)}`);
  if (m.result.payout !== 150) throw new Error(`3:2 on 100 is 150: ${m.result.payout}`);
  if (m.balance !== 10_150) throw new Error(`balance after natural: ${m.balance}`); // 10000 - 100 + 250
  a.close();
  await waitForLedger((e) => e.kind === 'blackjack_payout' && e.tokens === 150 && e.natural === true, 'natural blackjack_payout 150');
});

test('teardown: stop run 2', async () => { stop2?.(); });

// ── Run 3: push ──────────────────────────────────────────────────────────────
let stop3 = null;
test('setup: spawn server (push-deck) and seed the treasury', async () => {
  process.env.BV_BLACKJACK_DECK = '10H,10S,10D,10C';
  stop3 = await startServer();
  await seedTreasury();
});

test('push returns the stake exactly', async () => {
  const a = new Client();
  await a.join('EvenSteven');
  await fund(a, 10_000);
  a.send({ t: 'bjBet', bet: 100 });
  const open = await nextBj(a, 'open');
  if (!open.ok || open.phase !== 'player') throw new Error(`hand not open: ${JSON.stringify(open)}`);
  a.send({ t: 'bjStand' });
  const m = await nextBj(a, 'push');
  if (m.phase !== 'done' || m.result?.outcome !== 'push') throw new Error(`expected push: ${JSON.stringify(m)}`);
  if (m.balance !== 10_000) throw new Error(`push must return the stake: ${m.balance}`);
  a.close();
});

test('teardown: stop run 3', async () => { stop3?.(); });

// ── Run 4: disconnect mid-hand → no orphaned hand ────────────────────────────
// Deck: Runner 18 v dealer 19 → the auto-stand settles as a loss to the
// treasury. Demo names carry no wallet lock, so a closed socket settles
// immediately (no grace path).
let stop4 = null;
test('setup: spawn server (disconnect-deck) and seed the treasury', async () => {
  process.env.BV_BLACKJACK_DECK = '9S,9H,9D,10C,2D,2H,2S,2C';
  stop4 = await startServer();
  await seedTreasury();
});

test('disconnect mid-hand: stake settles to the treasury, rejoin shows the result, no orphan', async () => {
  const a = new Client();
  await a.join('Runner');
  await fund(a, 5_000);
  a.send({ t: 'bjBet', bet: 100 });
  const open = await nextBj(a, 'open');
  if (!open.ok || open.phase !== 'player') throw new Error(`hand not open: ${JSON.stringify(open)}`);
  a.close(); // walk away mid-hand
  // the stake must reach the treasury exactly once
  const entry = await waitForLedger((e) => e.kind === 'blackjack_in' && e.tokens === 100 && e.name === 'Runner', 'blackjack_in 100');
  if (entry.name !== 'Runner') throw new Error(`wrong name on settled stake: ${JSON.stringify(entry)}`);
  // rejoin: the settled hand is the visible snapshot, balance refreshed server-side
  const b = new Client();
  const w = await b.join('Runner');
  if (!w.bj || w.bj.result?.outcome !== 'lose') throw new Error(`rejoin snapshot: ${JSON.stringify(w.bj)}`);
  if (w.bj.balance !== 4900) throw new Error(`rejoin balance: ${w.bj.balance}`);
  // and the table is free again: a NEW bet is accepted (proves no orphan)
  b.send({ t: 'bjBet', bet: 100 });
  const m = await nextBj(b, 're-bet');
  if (!m.ok || m.phase !== 'player') throw new Error(`re-bet after rejoin: ${JSON.stringify(m)}`);
  b.send({ t: 'bjStand' });
  const done = await nextBj(b, 'settled');
  if (done.phase !== 'done') throw new Error(`re-bet never settled: ${JSON.stringify(done)}`);
  b.close();
});

test('teardown: stop run 4', async () => { stop4?.(); });

await runTests(tests);
