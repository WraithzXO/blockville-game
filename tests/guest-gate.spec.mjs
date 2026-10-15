// Guest-mode / wallet-gate chunk — enforced SERVER-side, through the real WS
// server with real Ed25519 sign-in (throwaway keypairs only, no transactions).
//
//   guest: walks, looks, sees others, appears once; EVERY economic message is
//          refused with reason connect_wallet and changes nothing
//   wallet: full loop still works; one-character-per-wallet lock still holds
//   guest ↔ wallet: namespaces never collide; guest → wallet is a fresh join
//          (guest character leaves, one character remains)
//   live-economy server (mint set): a connection with NO verified wallet is
//          refused economy even without ever saying "guest"
import { startServer, Client, runTests } from './harness.mjs';
import crypto from 'node:crypto';
import { base58Encode } from '../server/auth.mjs';

const tests = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const API = () => `http://localhost:${process.env.PORT}`;

const makeWallet = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { privateKey, wallet: base58Encode(raw) };
};
async function post(path, body) {
  const r = await fetch(`${API()}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function signIn(w) {
  const n = await post('/api/auth/nonce', { wallet: w.wallet });
  const sig = base58Encode(crypto.sign(null, Buffer.from(n.json.message, 'utf8'), w.privateKey));
  const v = await post('/api/auth/verify', { wallet: w.wallet, nonce: n.json.nonce, signature: sig });
  if (!v.json.token) throw new Error('sign-in failed ' + JSON.stringify(v));
  return v.json.token;
}
async function joinGuest(name, guestSession) {
  const c = new Client(); await c.opened;
  c.send({ t: 'join', name, look: null, x: 0, z: 0, guest: true, ...(guestSession ? { guestSession } : {}) });
  const w = await c.waitFor((m) => m.t === 'welcome', 'welcome');
  return { c, w };
}
const denied = (action) => (m) => m.t === 'economyDenied' && m.action === action && m.reason === 'connect_wallet';

process.env.BV_SESSION_GRACE_MS = '600';
process.env.BV_SESSION_SWEEP_MS = '150';
process.env.BV_MARKET_TICK_MS = '3600000';
process.env.BV_ALLOW_DEMO_DEPOSITS = '1';
let stop = await startServer();
const wal = { a: makeWallet(), b: makeWallet(), c: makeWallet() };

tests.push(['guest: welcome identifies a server-assigned guest id, no wallet; others see the character once', async () => {
  const obs = new Client(); await obs.join('Watcher');
  const { c, w } = await joinGuest('Gus');
  if (w.guest !== true || w.wallet !== null || typeof w.guestSession !== 'string' || w.guestSession.length < 16) throw new Error(JSON.stringify({ g: w.guest, w: w.wallet, s: w.guestSession }));
  const j = await obs.waitFor((m) => m.t === 'join' && m.player?.name === 'Gus', 'guest join');
  c.send({ t: 'pos', x: 4, z: 5, ry: 0 });
  await obs.waitFor((m) => m.t === 'pos' && m.id === j.player.id && m.x === 4, 'guest walks');
  await obs.expectNone((m) => m.t === 'join' && m.player?.name === 'Gus' && m.player.id !== j.player.id, 'duplicate Gus');
  const seen = await new Promise(async (res) => { const o2 = new Client(); const ww = await o2.join('Peer'); o2.close(); res(ww.peers.filter((p) => p.name === 'Gus').length); });
  if (seen !== 1) throw new Error('late joiner sees ' + seen + ' Gus');
  // no entitlement / fees snapshot is ever sent to a guest
  await c.expectNone((m) => m.t === 'entitlement' || m.t === 'feesEarned', 'economy snapshot to guest', 600);
  obs.close(); c.close();
}]);

tests.push(['guest: EVERY economic message is rejected server-side with connect_wallet and changes nothing', async () => {
  const owner = new Client(); await owner.join('Owner');
  owner.send({ t: 'claim', plot: 11, ownerName: 'Owner', type: 'shop' });
  owner.send({ t: 'build', plot: 11, progress: 30, done: true, type: 'shop' });
  await sleep(300);
  const { c: g } = await joinGuest('Owner'); // same display name as a real owner: must gain nothing
  const msgs = [
    { t: 'claim', plot: 12, ownerName: 'Owner', type: 'cafe' },
    { t: 'build', plot: 11, progress: 5, done: false, type: 'shop' },
    { t: 'upgrade', plot: 11, level: 2 },
    { t: 'upgradePay', plot: 11, level: 2, signature: 'x' },
    { t: 'shopPurchase', item: 'crown' },
    { t: 'furniturePurchase', item: 'rug' },
    { t: 'bjBet', bet: 100 },
    { t: 'bjHit' },
    { t: 'bjStand' },
    { t: 'feesClaim' },
    { t: 'walletDeposit', tokens: 1_000_000, sol: 5 },
    { t: 'list', plot: 11, price: 1 },
    { t: 'unlist', plot: 11 },
    { t: 'gardenPlace', plot: 11 },
    { t: 'houseState', plot: 11, placements: [] },
  ];
  for (const m of msgs) {
    g.send(m);
    await g.waitFor(denied(m.t), `denied(${m.t})`);
  }
  await g.expectNone((m) => ['claim', 'bj', 'payoutClaimResult', 'upgradeQuote', 'simList', 'purchase'].includes(m.t), 'economy reply to guest', 500);
  // nothing changed: plot 11 is untouched, plot 12 never claimed, no listing
  const late = new Client(); const w = await late.join('Late');
  const recs = new Map(w.plots);
  if (!recs.get(11)?.done || recs.get(11).level > 1) throw new Error('plot 11 mutated ' + JSON.stringify(recs.get(11)));
  if (recs.has(12)) throw new Error('guest claimed plot 12');
  if ((w.listings || []).some((l) => l.plot === 11)) throw new Error('guest listed owner plot');
  // the guest is not an ownership proof for the Owner entitlement either
  await g.expectNone((m) => m.t === 'entitlement', 'entitlement leak by name', 400);
  owner.close(); g.close(); late.close();
}]);

tests.push(['guest: refresh re-adopts the SAME guest character; two guests never collide; duplicate tab refused', async () => {
  const { c: g1, w: w1 } = await joinGuest('Gia');
  const { c: g2, w: w2 } = await joinGuest('Gib');
  if (w1.id === w2.id || w1.guestSession === w2.guestSession) throw new Error('guests collided');
  const dup = new Client(); await dup.opened;
  dup.send({ t: 'join', name: 'Gia', look: null, x: 0, z: 0, guest: true, guestSession: w1.guestSession });
  await dup.waitFor((m) => m.t === 'sessionTaken', 'duplicate guest tab refused');
  g1.close();
  const { c: g1b, w: w1b } = await joinGuest('Gia', w1.guestSession);
  if (w1b.id !== w1.id) throw new Error(`guest identity changed on refresh ${w1.id} → ${w1b.id}`);
  g1b.close(); g2.close();
}]);

tests.push(['wallet user: full loop works (claim, build, bj, shop); guest:true is ignored for a verified wallet', async () => {
  const token = await signIn(wal.a);
  const c = new Client(); await c.opened;
  c.send({ t: 'join', name: 'Wally', look: null, x: 0, z: 0, session: token, guest: true }); // lying guest flag must not downgrade or confuse
  const w = await c.waitFor((m) => m.t === 'welcome', 'welcome');
  if (w.guest !== false || w.wallet !== wal.a.wallet || w.guestSession) throw new Error(JSON.stringify({ g: w.guest, w: w.wallet, s: w.guestSession }));
  const obs = new Client(); await obs.join('Obs2');
  c.send({ t: 'claim', plot: 21, ownerName: 'Wally', type: 'cafe' });
  await obs.waitFor((m) => m.t === 'claim' && m.plot === 21, 'claim relayed');
  c.send({ t: 'bjBet', bet: 100 });
  const bj = await c.waitFor((m) => m.t === 'bj', 'bj reply');
  c.send({ t: 'shopPurchase', item: 'crown' });
  await c.expectNone((m) => m.t === 'economyDenied', 'economyDenied for wallet user', 500);
  await c.waitFor((m) => m.t === 'entitlement', 'entitlement snapshot');
  await c.waitFor((m) => m.t === 'feesEarned', 'fees snapshot');
  if (!bj) throw new Error('no bj');
  obs.close(); c.close();
}]);

tests.push(['guest cannot collide with a wallet session; one-character-per-wallet lock still enforced', async () => {
  const tb = await signIn(wal.b);
  const c1 = new Client(); const w1 = await c1.join('Bella', 0, 0, null, tb);
  const tb2 = await signIn(wal.b);
  const dup = new Client(); await dup.opened;
  dup.send({ t: 'join', name: 'Bella', look: null, x: 0, z: 0, session: tb2 });
  await dup.waitFor((m) => m.t === 'sessionTaken', 'wallet duplicate refused');
  const { c: g, w: gw } = await joinGuest('Bella'); // same name, different namespace: coexists, not refused
  if (gw.id === w1.id) throw new Error('guest adopted the wallet character');
  g.close(); c1.close();
}]);

tests.push(['guest → connect wallet mid-session: guest character leaves, ONE wallet character remains (no duplicate)', async () => {
  const obs = new Client(); await obs.join('Obs3');
  const { c: g, w: gw } = await joinGuest('Morph');
  const gj = await obs.waitFor((m) => m.t === 'join' && m.player?.name === 'Morph', 'guest join');
  // the client signs in, then reloads: the guest socket closes, a wallet join follows
  const token = await signIn(wal.c);
  g.close();
  const wc = new Client(); const ww = await wc.join('Morph', 0, 0, null, token);
  if (ww.guest !== false || ww.wallet !== wal.c.wallet) throw new Error('not upgraded to wallet');
  await obs.waitFor((m) => m.t === 'leave' && m.id === gj.player.id, 'guest character left');
  const peers = new Client(); const pw = await peers.join('Peer2');
  const morphs = pw.peers.filter((p) => p.name === 'Morph');
  if (morphs.length !== 1 || morphs[0].id !== ww.id) throw new Error('duplicate/ghost Morph: ' + JSON.stringify(morphs));
  wc.send({ t: 'claim', plot: 31, ownerName: 'Morph', type: 'house' });
  await obs.waitFor((m) => m.t === 'claim' && m.plot === 31, 'upgraded session can claim');
  obs.close(); wc.close(); peers.close();
}]);

tests.push(['setup: restart as a LIVE-economy server (mint set) — no session, no economy, even without saying guest', async () => {
  stop();
  await sleep(300);
  process.env.BLOCKVILLE_MINT = 'So11111111111111111111111111111111111111112';
  process.env.BV_RPC_URL = 'http://127.0.0.1:9'; // unreachable: no network is ever needed
  stop = await startServer();
  const bare = new Client(); await bare.join('Anon'); // no session, no guest flag
  for (const m of [{ t: 'claim', plot: 41, ownerName: 'Anon', type: 'shop' }, { t: 'bjBet', bet: 10 }, { t: 'shopPurchase', item: 'crown' }, { t: 'feesClaim' }]) {
    bare.send(m);
    await bare.waitFor(denied(m.t), `live denied(${m.t})`);
  }
  const token = await signIn(wal.a);
  const w = new Client(); await w.join('Wally', 0, 0, null, token);
  w.send({ t: 'claim', plot: 42, ownerName: 'Wally', type: 'shop' });
  await w.expectNone((m) => m.t === 'economyDenied', 'economyDenied for verified wallet on live server', 800);
  bare.close(); w.close();
}]);

await runTests(tests);
stop();
process.exit(process.exitCode || 0);
