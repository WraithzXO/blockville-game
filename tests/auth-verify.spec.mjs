// Auth chunk — real Ed25519 verification in POST /api/auth/verify.
//
// Exercises the REAL crypto path end-to-end against a spawned server:
//   • a valid Ed25519 signature over the server-issued message is accepted and
//     a session token is minted (node:crypto-generated keys, base58 encoding —
//     exactly what a Solana wallet does);
//   • tampered message / wrong keypair / reused or expired challenge /
//     malformed payload are all rejected with the SAME generic failure;
//   • the session token binds a WS connection to the VERIFIED wallet, and in
//     live mode (BLOCKVILLE_MINT set) the holdings RPC lookup is keyed on that
//     verified wallet only — an unverified connection has no claim path.
//
// No transactions, no keys beyond throwaway test keypairs.
import { startServer, Client, runTests } from './harness.mjs';
import crypto from 'node:crypto';
import http from 'node:http';
import { base58Encode } from '../server/auth.mjs';

const tests = [];
const API = () => `http://localhost:${process.env.PORT}`;
const GENERIC = 'Verification failed. Request a new nonce and sign again.';

// A fresh Solana-style identity: Ed25519 keypair whose public key is the
// base58 wallet address, plus a signer over the canonical message.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Each spawned server gets a FRESH port: the previous one was SIGKILLed and
// its port may still be in teardown when the next spawn starts.
const spawnServer = async () => { delete process.env.PORT; return startServer(); };

// Full sign-in flow against the live server: nonce → sign → verify → token.
async function signIn({ privateKey, wallet }) {
  const n = await post('/api/auth/nonce', { wallet });
  if (n.status !== 200) throw new Error(`nonce failed: ${JSON.stringify(n)}`);
  const sig = signMessage(privateKey, n.json.message);
  return post('/api/auth/verify', { wallet, nonce: n.json.nonce, signature: sig });
}

let stop;
tests.push(['setup: spawn the server', async () => { stop = await spawnServer(); }]);

tests.push(['valid signature is accepted and a session token is issued', async () => {
  const w = makeWallet();
  const r = await signIn(w);
  if (r.status !== 200 || r.json.verified !== true) throw new Error(`verify: ${JSON.stringify(r)}`);
  if (r.json.wallet !== w.wallet) throw new Error('verified wallet mismatch');
  if (typeof r.json.token !== 'string' || r.json.token.length < 32) throw new Error('no session token');
}]);

tests.push(['tampered message is rejected with the generic failure', async () => {
  const w = makeWallet();
  const n = await post('/api/auth/nonce', { wallet: w.wallet });
  // sign a DIFFERENT message than the one the server issued
  const sig = signMessage(w.privateKey, `${n.json.message}  `);
  const r = await post('/api/auth/verify', { wallet: w.wallet, nonce: n.json.nonce, signature: sig });
  if (r.status !== 400 || r.json.verified !== false || r.json.error !== GENERIC) {
    throw new Error(`tampered accepted or leaky: ${JSON.stringify(r)}`);
  }
}]);

tests.push(['signature by a different keypair is rejected', async () => {
  const w = makeWallet();
  const impostor = makeWallet();
  const n = await post('/api/auth/nonce', { wallet: w.wallet });
  const sig = signMessage(impostor.privateKey, n.json.message);
  const r = await post('/api/auth/verify', { wallet: w.wallet, nonce: n.json.nonce, signature: sig });
  if (r.status !== 400 || r.json.verified !== false || r.json.error !== GENERIC) {
    throw new Error(`impostor accepted or leaky: ${JSON.stringify(r)}`);
  }
}]);

tests.push(['a challenge is single-use: no replay after success, and a failed attempt burns it', async () => {
  // replay after success
  const w = makeWallet();
  const ok = await signIn(w);
  if (ok.status !== 200) throw new Error(`first verify failed: ${JSON.stringify(ok)}`);
  const n2 = await post('/api/auth/nonce', { wallet: w.wallet });
  const sig2 = signMessage(w.privateKey, n2.json.message);
  const fail = await post('/api/auth/verify', { wallet: w.wallet, nonce: n2.json.nonce, signature: signMessage(w.privateKey, 'wrong message') });
  if (fail.status !== 400) throw new Error('wrong-message attempt was accepted');
  // the burned nonce cannot then be satisfied even by a VALID signature
  const replay = await post('/api/auth/verify', { wallet: w.wallet, nonce: n2.json.nonce, signature: sig2 });
  if (replay.status !== 400 || replay.json.verified !== false) throw new Error(`replay accepted: ${JSON.stringify(replay)}`);
}]);

tests.push(['malformed payloads are rejected with the generic failure', async () => {
  const w = makeWallet();
  const n = await post('/api/auth/nonce', { wallet: w.wallet });
  const sig = signMessage(w.privateKey, n.json.message);
  const cases = [
    {}, // nothing at all
    { wallet: w.wallet, nonce: n.json.nonce }, // missing signature
    { wallet: w.wallet, nonce: 12345, signature: sig }, // nonce wrong type
    { wallet: w.wallet, nonce: n.json.nonce, signature: 42 }, // signature wrong type
    { wallet: 'not-a-base58!!', nonce: n.json.nonce, signature: sig }, // undecodable key
    { wallet: w.wallet, nonce: 'no-such-nonce', signature: sig }, // unknown challenge
    { wallet: w.wallet, nonce: n.json.nonce, signature: '2' }, // decodes to a 0-byte signature
    { wallet: w.wallet, nonce: n.json.nonce, signature: base58Encode(Buffer.alloc(63)) }, // wrong signature length
  ];
  for (const body of cases) {
    const r = await post('/api/auth/verify', body);
    if (r.status !== 400 || r.json.verified !== false || r.json.error !== GENERIC) {
      throw new Error(`malformed case accepted or leaky: ${JSON.stringify({ body, r })}`);
    }
    // a fresh nonce for the next sub-case (the previous one may have burned it)
    if (body.nonce === n.json.nonce) {
      const fresh = await post('/api/auth/nonce', { wallet: w.wallet });
      n.json.nonce = fresh.json.nonce;
      n.json.message = fresh.json.message;
    }
  }
}]);

tests.push(['cleanup: stop the default server', async () => { stop(); }]);

tests.push(['expired challenge is rejected', async () => {
  process.env.BV_AUTH_NONCE_MS = '50'; // 50ms nonce lifetime for this server
  stop = await spawnServer();
  const w = makeWallet();
  const n = await post('/api/auth/nonce', { wallet: w.wallet });
  const sig = signMessage(w.privateKey, n.json.message);
  await sleep(250); // real-time wait past the (test-shortened) expiry
  const r = await post('/api/auth/verify', { wallet: w.wallet, nonce: n.json.nonce, signature: sig });
  if (r.status !== 400 || r.json.verified !== false || r.json.error !== GENERIC) {
    throw new Error(`expired nonce accepted or leaky: ${JSON.stringify(r)}`);
  }
  // control: a FRESH nonce still verifies on the same server
  const ok = await signIn(w);
  if (ok.status !== 200 || ok.json.verified !== true) throw new Error('fresh nonce broken by expiry logic');
  stop();
  delete process.env.BV_AUTH_NONCE_MS;
}]);

tests.push(['the session token binds a WS connection to the verified wallet', async () => {
  stop = await spawnServer();
  const w = makeWallet();
  const ok = await signIn(w);
  const token = ok.json.token;
  // bound connection: join carries the session token
  const c = new Client();
  await c.opened;
  c.send({ t: 'join', name: 'WalletGuy', look: null, x: 0, z: 0, session: token });
  await c.waitFor((m) => m.t === 'welcome', 'welcome');
  const e = await c.waitFor((m) => m.t === 'entitlement' && m.wallet === w.wallet, 'bound entitlement');
  if (!e.verified || e.tokens === null) throw new Error(`bound snapshot wrong: ${JSON.stringify(e)}`);
  // unbound connection: no session, wallet stays null
  const u = new Client();
  await u.join('Anon');
  const e2 = await u.waitFor((m) => m.t === 'entitlement' && m.wallet === null, 'unbound entitlement');
  if (e2.verified !== true) throw new Error(`demo snapshot changed: ${JSON.stringify(e2)}`);
  // an invalid session token is ignored, never honoured
  const v = new Client();
  await v.opened;
  v.send({ t: 'join', name: 'FakeToken', look: null, x: 0, z: 0, session: 'deadbeef' });
  await v.waitFor((m) => m.t === 'welcome', 'welcome2');
  const e3 = await v.waitFor((m) => m.t === 'entitlement' && m.wallet === null, 'invalid-token entitlement');
  if (e3.wallet !== null) throw new Error('invalid token was honoured');
  c.close(); u.close(); v.close();
  stop();
}]);

tests.push(['LIVE MODE: holdings RPC keys off the verified wallet; unverified connections cannot claim', async () => {
  // A minimal mock JSON-RPC endpoint standing in for the public Solana RPC —
  // it records every owner it was asked about and answers a fixed balance.
  const rpcSeen = [];
  const mockRpc = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        rpcSeen.push(parsed.params?.[0]);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0', id: parsed.id,
          result: { accounts: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 60000 } } } } } }] },
        }));
      } catch { res.writeHead(400); res.end(); }
    });
  });
  await new Promise((r) => mockRpc.listen(0, '127.0.0.1', r));
  const mockPort = mockRpc.address().port;

  process.env.BLOCKVILLE_MINT = 'So11111111111111111111111111111111111111112';
  process.env.TREASURY_RPC_URL = `http://127.0.0.1:${mockPort}`;
  process.env.BV_MARKET_TICK_MS = '3600000'; // NPC sim idle
  stop = await spawnServer();

  const WORLD = { plotIds: Array.from({ length: 40 }, (_, i) => 300 + i), community: [] };
  // witness joins first and seeds the world — WITHOUT any wallet
  const w = new Client();
  await w.join('Witness', 0, 0, WORLD);

  // unverified connection attempts a claim → denied server-side
  const u = new Client();
  await u.join('NoWallet');
  u.send({ t: 'claim', plot: 300, ownerName: 'NoWallet', type: 'house' });
  // (guest-mode chunk) the wallet gate now refuses this BEFORE the entitlement
  // path: an explicit connect_wallet denial instead of the old claimDenied
  const denied = await u.waitFor((m) => m.t === 'economyDenied' && m.action === 'claim', 'unverified economyDenied');
  if (denied.reason !== 'connect_wallet') throw new Error(`reason: ${denied.reason}`);

  // verified wallet signs in, binds, and CAN claim — and the RPC was asked
  // about THAT wallet (never about a display name)
  const w1 = makeWallet();
  const ok = await signIn(w1);
  const a = new Client();
  await a.opened;
  a.send({ t: 'join', name: 'AuthGuy', look: null, x: 0, z: 0, session: ok.json.token });
  await a.waitFor((m) => m.t === 'welcome', 'welcome');
  await a.waitFor((m) => m.t === 'entitlement' && m.wallet === w1.wallet, 'live entitlement');
  if (a.queue.some((m) => m.t === 'entitlement' && !m.verified)) throw new Error('verified wallet reported unverified');
  a.send({ t: 'claim', plot: 301, ownerName: 'AuthGuy', type: 'house' });
  const e = await a.waitFor((m) => m.t === 'entitlement' && m.claimed === 1, 'live claim accepted');
  if (e.wallet !== w1.wallet) throw new Error('claim not keyed to the verified wallet');

  // the RPC only ever saw full-length wallet addresses — never a player name
  for (const owner of rpcSeen) {
    if (typeof owner !== 'string' || owner.length < 32) throw new Error(`RPC consulted with a non-wallet key: ${owner}`);
  }
  if (!rpcSeen.includes(w1.wallet)) throw new Error('verified wallet never looked up');

  w.close(); u.close(); a.close();
  stop();
  mockRpc.close();
  delete process.env.BLOCKVILLE_MINT;
  delete process.env.TREASURY_RPC_URL;
}]);

tests.push(['messages before join are still ignored (protected flows stay unauthenticated)', async () => {
  stop = await spawnServer();
  // a client that sends protected messages BEFORE joining
  const ghost = new Client();
  await ghost.opened;
  ghost.send({ t: 'claim', plot: 400, ownerName: 'Ghost', type: 'house' });
  ghost.send({ t: 'build', plot: 400, progress: 99, done: true, type: 'house' });
  ghost.send({ t: 'shopPurchase', item: 'crown' });
  ghost.send({ t: 'pos', x: 10, z: 10 });
  // a witness joins and must see NO trace of the ghost's activity
  const w = new Client();
  await w.join('Witness2', 0, 0, { plotIds: Array.from({ length: 10 }, (_, i) => 400 + i), community: [] });
  await w.expectNone((m) => (m.t === 'claim' || m.t === 'build' || m.t === 'simClaim') && m.plot === 400, 'ghost activity');
  if (w.queue.some((m) => m.t === 'welcome' && (m.plots ?? []).some(([p]) => p === 400))) {
    throw new Error('pre-join claim was recorded server-side');
  }
  ghost.close(); w.close();
  stop();
}]);

runTests(tests);
