// One character per wallet — tab-duplication protection, enforced server-side.
//
// Every test here runs against the REAL WS server with REAL Ed25519
// verification: a wallet identity exists only after the auth endpoint verified
// a signature, and the lock is keyed by that verified wallet (never by tab,
// window, browser session id or client-reported identity).
//
//   • a duplicate tab of an ACTIVE wallet is refused (`sessionTaken`) and
//     spawns no second character — other players never see two;
//   • two DIFFERENT wallets play simultaneously with no interference;
//   • a refresh/reconnect inside the grace window re-adopts the SAME
//     character (same id) with no leave/join flicker and no duplicate;
//   • a clean disconnect with no reconnect departs visibly after the grace
//     window;
//   • an UNCLEAN drop (network death without a close frame — simulated with a
//     local TCP proxy that keeps the server leg open while the client leg
//     dies) holds the session until the heartbeat timeout, then it is
//     reclaimable — never before the timeout;
//   • an active session stays held: protocol pongs and app messages both keep
//     the heartbeat fresh.
//
// No transactions, no keys beyond throwaway test keypairs.
import { startServer, Client, runTests, PORT } from './harness.mjs';
import crypto from 'node:crypto';
import net from 'node:net';
import { base58Encode } from '../server/auth.mjs';

const tests = [];
const API = () => `http://localhost:${process.env.PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Test-shortened timings (env-tunable server knobs): the production defaults
// are 45 s heartbeat / 8 s grace / 5 s sweep — stated in the WORKLOG.
const HEARTBEAT_MS = 1500;
const GRACE_MS = 1200;
const SWEEP_MS = 200;

const makeWallet = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { privateKey, wallet: base58Encode(raw) };
};
const signMessage = (privateKey, message) =>
  base58Encode(crypto.sign(null, Buffer.from(message, 'utf8'), privateKey));

async function post(path, body) {
  const r = await fetch(`${API()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function signIn({ privateKey, wallet }) {
  const n = await post('/api/auth/nonce', { wallet });
  if (n.status !== 200) throw new Error(`nonce failed: ${JSON.stringify(n)}`);
  return post('/api/auth/verify', { wallet, nonce: n.json.nonce, signature: signMessage(privateKey, n.json.message) });
}

let stop;
const wallets = {};
const tokens = {};
const mintToken = async (key) => {
  wallets[key] = makeWallet();
  const r = await signIn(wallets[key]);
  if (r.status !== 200 || !r.json.token) throw new Error(`sign-in failed for ${key}: ${JSON.stringify(r)}`);
  tokens[key] = r.json.token;
};

tests.push(['setup: spawn the server with shortened lock timings', async () => {
  process.env.BV_SESSION_HEARTBEAT_MS = String(HEARTBEAT_MS);
  process.env.BV_SESSION_GRACE_MS = String(GRACE_MS);
  process.env.BV_SESSION_SWEEP_MS = String(SWEEP_MS);
  process.env.BV_MARKET_TICK_MS = '3600000'; // NPC sim idle
  stop = await startServer();
  for (const key of ['ada', 'bob', 'cara', 'solo', 'ghost', 'lively', 'idler']) await mintToken(key);
}]);

tests.push(['duplicate tab: same wallet (fresh token) is refused and spawns NO second character', async () => {
  const obs = new Client(); await obs.join('Watcher');
  const a = new Client(); const w = await a.join('Ada', 2, 3, null, tokens.ada);
  const adaId = w.id;
  // a second tab signs in separately — a NEW token for the SAME wallet. The
  // lock must key on the WALLET, not on the token.
  const again = await signIn(wallets.ada);
  if (again.json.token === tokens.ada) throw new Error('expected a fresh token for the second tab');
  const dup = new Client(); await dup.opened;
  dup.send({ t: 'join', name: 'Ada', look: null, x: 9, z: 9, session: again.json.token });
  const taken = await dup.waitFor((m) => m.t === 'sessionTaken', 'sessionTaken');
  if (typeof taken.reason !== 'string' || !taken.reason) throw new Error(`no reason: ${JSON.stringify(taken)}`);
  if (!(Number(taken.retryAfterMs) >= 0)) throw new Error(`no retryAfterMs: ${JSON.stringify(taken)}`);
  await dup.closed; // the server closes the refused connection after the notice
  // the watcher never sees a second Ada, and never loses the original
  await obs.expectNone((m) => m.t === 'join' && m.player?.name === 'Ada' && m.player?.id !== adaId, 'second Ada join');
  await obs.expectNone((m) => m.t === 'leave' && m.id === adaId, 'unexpected Ada leave');
  obs.close(); a.close();
}]);

tests.push(['two different wallets play simultaneously with no interference', async () => {
  const b = new Client(); const wb = await b.join('Bob', 0, 0, null, tokens.bob);
  const c = new Client(); const wc = await c.join('Cara', 5, 5, null, tokens.cara);
  if (!wc.peers.some((p) => p.id === wb.id)) throw new Error('Cara does not see Bob');
  const bj = await b.waitFor((m) => m.t === 'join' && m.player?.id === wc.id, 'Bob sees Cara join');
  if (bj.player.name !== 'Cara') throw new Error('wrong name on join');
  // both wallets keep their own locks: a duplicate of either is still refused
  const dupB = new Client(); await dupB.opened;
  dupB.send({ t: 'join', name: 'Bob', look: null, x: 0, z: 0, session: tokens.bob });
  await dupB.waitFor((m) => m.t === 'sessionTaken', 'Bob duplicate refused');
  dupB.close();
  b.close(); c.close();
}]);

tests.push(['refresh: reconnect inside the grace window re-adopts the SAME character', async () => {
  const obs = new Client(); await obs.join('Watcher2');
  const a = new Client(); const w = await a.join('Ada', 4, 4, null, tokens.ada);
  const id1 = w.id;
  a.close(); // clean close → grace window opens, no leave broadcast yet
  const a2 = new Client();
  const w2 = await a2.join('Ada', 4, 4, null, tokens.ada);
  if (w2.id !== id1) throw new Error(`character identity changed on refresh: ${id1} → ${w2.id}`);
  // the watcher never saw the character vanish, and never saw a duplicate
  await obs.expectNone((m) => m.t === 'leave' && m.id === id1, 'leave during grace');
  await obs.expectNone((m) => m.t === 'join' && m.player?.id === id1, 're-join broadcast for an already-visible character');
  // the returning session is fully live: its traffic flows under the same id
  a2.send({ t: 'pos', x: 7, z: 8, ry: 0.5 });
  await obs.waitFor((m) => m.t === 'pos' && m.id === id1 && m.x === 7 && m.z === 8, 'pos after re-adoption');
  obs.close(); a2.close();
}]);

tests.push(['clean disconnect with no reconnect: the character leaves after the grace window', async () => {
  const obs = new Client(); await obs.join('Watcher3');
  const a = new Client(); const w = await a.join('Solo', 0, 0, null, tokens.solo);
  a.close();
  await obs.waitFor((m) => m.t === 'leave' && m.id === w.id, 'leave after grace expiry', 5000);
  // and the wallet is free again immediately afterwards
  const back = new Client(); const w2 = await back.join('Solo', 0, 0, null, tokens.solo);
  if (w2.id === w.id) throw new Error('a finalized session was re-adopted after grace expiry');
  back.close(); obs.close();
}]);

tests.push(['unclean drop: session held past quick retries, reclaimable only after the heartbeat timeout', async () => {
  // A local TCP proxy stands in for a dead network: the client leg dies
  // without any close frame reaching the server, so the server-side socket
  // stays OPEN and silent (exactly a crashed tab / lost connection).
  const upstreams = new Set();
  const proxy = net.createServer((sock) => {
    const up = net.connect(PORT, '127.0.0.1', () => {});
    // end:false on BOTH legs — a real network black hole never relays the
    // client's EOF to the server, so the server-side socket stays open and
    // silent (a graceful close would take the grace path instead).
    sock.pipe(up, { end: false }); up.pipe(sock, { end: false });
    sock.on('error', () => {});
    up.on('error', () => {});
    sock.on('close', () => { upstreams.add(up); }); // deliberately keep the server leg open
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const proxyPort = proxy.address().port;
  try {
    const obs = new Client(); await obs.join('Watcher4');
    const a = new Client(`ws://localhost:${proxyPort}/ws`);
    const w = await a.join('Ghost', 1, 1, null, tokens.ghost);
    // kill the client leg abruptly — no WS close frame, no TCP FIN relayed
    a.ws._socket.destroy();
    // BEFORE the timeout: a reconnect attempt is refused — no instant grab
    const early = new Client(); await early.opened;
    early.send({ t: 'join', name: 'Ghost', look: null, x: 0, z: 0, session: tokens.ghost });
    await early.waitFor((m) => m.t === 'sessionTaken', 'sessionTaken before the timeout');
    early.close();
    // ...and the absence holds up to (but not into) the timeout window
    await obs.expectNone((m) => m.t === 'leave' && m.id === w.id, 'early leave before the heartbeat timeout', 900);
    // AT/AFTER the timeout: the stale holder is finalized and reclaimed
    const lv = await obs.waitFor((m) => m.t === 'leave' && m.id === w.id, 'leave after the heartbeat timeout', 5000);
    const again = new Client(); const w2 = await again.join('Ghost', 0, 0, null, tokens.ghost);
    if (!w2.id) throw new Error('wallet could not reclaim after the timeout');
    obs.close(); again.close();
  } finally {
    proxy.close();
    for (const up of upstreams) { try { up.destroy(); } catch { /* already gone */ } }
  }
}]);

tests.push(['active session stays held: messages keep the heartbeat fresh across timeout windows', async () => {
  const obs = new Client(); await obs.join('Watcher5');
  const a = new Client(); const w = await a.join('Lively', 0, 0, null, tokens.lively);
  // stay alive well past one heartbeat timeout using app traffic only
  for (let i = 0; i < 3; i++) {
    await sleep(800);
    a.send({ t: 'pos', x: i, z: 0, ry: 0 });
  }
  const dup = new Client(); await dup.opened;
  dup.send({ t: 'join', name: 'Lively', look: null, x: 0, z: 0, session: tokens.lively });
  await dup.waitFor((m) => m.t === 'sessionTaken', 'sessionTaken while active');
  dup.close();
  // the original session was never disturbed
  a.send({ t: 'pos', x: 9, z: 9, ry: 0 });
  await obs.waitFor((m) => m.t === 'pos' && m.id === w.id && m.x === 9, 'active session still relays');
  obs.close(); a.close();
}]);

tests.push(['connected-but-idle client stays fresh: protocol pongs count as heartbeat', async () => {
  const a = new Client(); const w = await a.join('Idler', 0, 0, null, tokens.idler);
  // zero app messages for longer than the heartbeat timeout — the server's
  // own pings (sweep-driven) and the client's automatic pongs keep it alive
  await sleep(HEARTBEAT_MS + SWEEP_MS * 3 + 400);
  const dup = new Client(); await dup.opened;
  dup.send({ t: 'join', name: 'Idler', look: null, x: 0, z: 0, session: tokens.idler });
  await dup.waitFor((m) => m.t === 'sessionTaken', 'sessionTaken for an idle-but-live holder');
  dup.close();
  a.close();
}]);

tests.push(['teardown: stop the server and clear the timing overrides', async () => {
  stop();
  delete process.env.BV_SESSION_HEARTBEAT_MS;
  delete process.env.BV_SESSION_GRACE_MS;
  delete process.env.BV_SESSION_SWEEP_MS;
  delete process.env.BV_MARKET_TICK_MS;
}]);

runTests(tests);
