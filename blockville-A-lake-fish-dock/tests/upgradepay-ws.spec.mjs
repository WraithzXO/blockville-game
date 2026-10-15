// End-to-end upgrade-payment flows through the REAL WS server.
//   Phase 1 — dev mode (BLOCKVILLE_DEV_TX_MODE=1): upgrades complete without
//             any on-chain verification, ledgered 'dev'.
//   Phase 2 — strict mode (BLOCKVILLE_MINT set, mock RPC): a client claim
//             alone applies NOTHING (the server answers with a quote); a
//             verified SOL transaction applies it exactly once; a replayed
//             signature applies nothing. The RPC is a local mock — no real
//             network, no real transactions, no keys.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, Client, runTests } from './harness.mjs';
import { base58Encode } from '../server/auth.mjs';
import { ONCHAIN, UPGRADE_SOL } from '../server/tokenomics.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The spawned servers' ledger is redirected to a tmp file (final-audit test
// isolation — the suite used to read/write the repo's PRODUCTION
// data/treasury-ledger.jsonl); readLedger follows the same env var.
process.env.BV_TREASURY_LEDGER = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-uppay-')), 'treasury-ledger.jsonl');
const LEDGER = process.env.BV_TREASURY_LEDGER;
const readLedger = () => fs.existsSync(LEDGER)
  ? fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

const WORLD = { plotIds: [300, 301], community: [[300, 'casino'], [301, 'bank']] };
const TREASURY = ONCHAIN.treasuryWalletAddress;
const LAMPORTS = 1e9;


// (guest-mode chunk) a live/strict server refuses economy to any connection
// without a session-verified wallet, so the payers sign in with a throwaway
// Ed25519 key through the real auth endpoints.
async function walletToken() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const wallet = base58Encode(publicKey.export({ type: 'spki', format: 'der' }).subarray(-32));
  const api = `http://localhost:${process.env.PORT}`;
  const post = (path, body) => fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const n = await post('/api/auth/nonce', { wallet });
  const sig = base58Encode(crypto.sign(null, Buffer.from(n.message, 'utf8'), privateKey));
  const v = await post('/api/auth/verify', { wallet, nonce: n.nonce, signature: sig });
  if (!v.token) throw new Error('test sign-in failed');
  return v.token;
}

const tests = [];

// ── Phase 1: dev mode ────────────────────────────────────────────────────────
process.env.BLOCKVILLE_DEV_TX_MODE = '1';
process.env.BV_MARKET_TICK_MS = '3600000'; // NPC sim idle
let stopDev = null;
tests.push(['setup: spawn the DEV-mode server', async () => { stopDev = await startServer(); }]);

tests.push(['DEV: upgrade and upgradePay both apply WITHOUT on-chain verification', async () => {
  const a = new Client();
  await a.join('DevA', 0, 0, WORLD);
  const b = new Client();
  await b.join('WatchDev');
  const before = readLedger().length;
  a.send({ t: 'upgrade', plot: 300, level: 2 });
  await b.waitFor((m) => m.t === 'upgrade' && m.plot === 300 && m.level === 2, 'dev upgrade broadcast');
  // even a garbage signature completes in dev mode — no on-chain check exists
  a.send({ t: 'upgradePay', plot: 301, level: 2, signature: 'garbage-signature' });
  await b.waitFor((m) => m.t === 'upgrade' && m.plot === 301 && m.level === 2, 'dev upgradePay broadcast');
  await new Promise((r) => setTimeout(r, 250));
  const ev = readLedger().slice(before).filter((e) => e.kind === 'upgrade_in');
  if (ev.length !== 2 || ev.some((e) => e.settled !== 'dev')) throw new Error(`dev ledger: ${JSON.stringify(ev)}`);
  if (ev.some((e) => e.sol !== UPGRADE_SOL[0])) throw new Error(`dev fee wrong: ${JSON.stringify(ev)}`);
  a.close();
  b.close();
}]);

tests.push(['teardown: stop the DEV server, clear the dev flag', async () => {
  stopDev();
  stopDev = null;
  delete process.env.BLOCKVILLE_DEV_TX_MODE;
}]);

// ── Phase 2: strict mode behind a mock RPC ──────────────────────────────────
let rpcServer = null;
let rpcUrl = '';
let goodTx = null; // getTransaction result for the "paid" signature
let rpcTxLookups = 0;

tests.push(['setup: start the mock RPC and the STRICT-mode server', async () => {
  rpcServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let j = {};
      try { j = JSON.parse(body || '{}'); } catch { /* ignored */ }
      let result = null;
      if (j.method === 'getTransaction') {
        rpcTxLookups++;
        result = goodTx;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id ?? 1, result }));
    });
  });
  await new Promise((resolve) => rpcServer.listen(0, '127.0.0.1', resolve));
  rpcUrl = `http://127.0.0.1:${rpcServer.address().port}`;
  process.env.BLOCKVILLE_MINT = 'BvTestMintPlaceholder11111111111111';
  process.env.TREASURY_RPC_URL = rpcUrl;
  stopDev = await startServer(); // reuse the same holder variable: one server at a time
}]);

tests.push(['STRICT: an upgrade claim alone applies NOTHING — the server quotes instead', async () => {
  const a = new Client();
  await a.join('PayA', 0, 0, WORLD, await walletToken());
  const b = new Client();
  await b.join('WatchStrict');
  a.send({ t: 'upgrade', plot: 300, level: 2 });
  const q = await a.waitFor((m) => m.t === 'upgradeQuote' && m.plot === 300, 'upgradeQuote');
  if (q.level !== 2 || q.sol !== UPGRADE_SOL[0] || q.treasury !== TREASURY) throw new Error(`quote wrong: ${JSON.stringify(q)}`);
  await b.expectNone((m) => m.t === 'upgrade' && m.plot === 300, 'unpaid upgrade broadcast');
  a.close();
  b.close();
}]);

tests.push(['STRICT: a payment that cannot be verified is rejected generically', async () => {
  const a = new Client();
  await a.join('PayB', 0, 0, WORLD, await walletToken());
  a.send({ t: 'upgradePay', plot: 300, level: 2, signature: 'bad' });
  const r = await a.waitFor((m) => m.t === 'upgradeRejected' && m.plot === 300, 'upgradeRejected');
  if (r.reason !== 'payment_unverified') throw new Error(`leaky reason: ${r.reason}`);
  const w = new Client();
  await w.join('WitnessB');
  await w.expectNone((m) => m.t === 'upgrade' && m.plot === 300, 'broadcast after rejected payment');
  a.close();
  w.close();
}]);

tests.push(['STRICT: a verified on-chain payment applies the upgrade EXACTLY once', async () => {
  const a = new Client();
  await a.join('PayC', 0, 0, WORLD, await walletToken());
  const b = new Client();
  await b.join('WatchC');
  const sig = base58Encode(crypto.randomBytes(64));
  // 0.1 SOL (100_000_000 lamports) lands on the treasury, confirmed, no error
  const pre = [2_000_000_000, 1_000_000_000, 1_000_000_000];
  const post = [pre[0] - 100_000_000, pre[1] + 100_000_000, pre[2]];
  goodTx = {
    meta: { err: null, preBalances: pre, postBalances: post },
    transaction: { message: { accountKeys: ['Payer11111111111111111111111111111111', TREASURY, 'Bystander1111111111111111111111111111'] } },
  };
  const before = readLedger().length;
  a.send({ t: 'upgradePay', plot: 300, level: 2, signature: sig });
  // the PAYER receives the broadcast too — in strict mode it applied nothing optimistically
  await a.waitFor((m) => m.t === 'upgrade' && m.plot === 300 && m.level === 2, 'payer-side upgrade');
  await b.waitFor((m) => m.t === 'upgrade' && m.plot === 300 && m.level === 2, 'witness-side upgrade');
  await new Promise((r) => setTimeout(r, 250));
  const ev = readLedger().slice(before).filter((e) => e.kind === 'upgrade_in');
  if (ev.length !== 1) throw new Error(`expected exactly one upgrade_in: ${JSON.stringify(ev)}`);
  if (ev[0].settled !== 'onchain' || ev[0].sol !== 0.1 || ev[0].buyback !== 0.08 || ev[0].gas !== 0.02) {
    throw new Error(`onchain ledger wrong: ${JSON.stringify(ev[0])}`);
  }
  if (rpcTxLookups < 1) throw new Error('the server never consulted the RPC');

  // ── replay: the SAME signature against a still-upgradable plot buys nothing ──
  a.send({ t: 'upgradePay', plot: 301, level: 2, signature: sig });
  const r = await a.waitFor((m) => m.t === 'upgradeRejected' && m.plot === 301, 'replay rejected');
  if (r.reason !== 'payment_unverified') throw new Error(`replay reason: ${r.reason}`);
  await b.expectNone((m) => m.t === 'upgrade' && m.plot === 301, 'replayed upgrade broadcast');
  const after = readLedger().slice(before).filter((e) => e.kind === 'upgrade_in');
  if (after.length !== 1) throw new Error('a replayed signature ledgered a second upgrade_in');
  a.close();
  b.close();
}]);

tests.push(['teardown: stop the STRICT server and the mock RPC, clear env', async () => {
  stopDev();
  stopDev = null;
  rpcServer.close();
  rpcServer = null;
  delete process.env.BLOCKVILLE_MINT;
  delete process.env.TREASURY_RPC_URL;
}]);

runTests(tests);
