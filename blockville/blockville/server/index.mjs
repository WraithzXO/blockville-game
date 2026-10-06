// ── Blockville backend scaffold ────────────────────────────────────────────
// A small, dependency-free Node server that starts the real backend layer.
//
// What is REAL already:
//   • Nonce issuance + in-memory session ledger for wallet sign-in flow
//   • Staking *intents* recorded server-side (the shape the game will use)
//
// What is still a PLACEHOLDER (clearly marked):
//   • Ed25519 signature verification — the crypto check is not implemented
//   • Anything on-chain. No transactions are faked or simulated here.
//
// Run with:  npm run server     (listens on http://localhost:8787)

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = 8787;

// in-memory stores — swap for a real database when this leaves the sandbox
const nonces = new Map();     // nonce -> { wallet, issuedAt }
const stakeIntents = [];      // { wallet, amount, at }

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  if (req.method === 'OPTIONS') return json(res, 204, {});

  if (route === 'GET /api/health') {
    return json(res, 200, { ok: true, service: 'blockville-backend', time: Date.now() });
  }

  // Step 1 of sign-in-with-wallet: hand the client a nonce to sign.
  if (route === 'POST /api/auth/nonce') {
    const { wallet } = await readBody(req);
    if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
      return json(res, 400, { error: 'A valid Solana wallet address is required.' });
    }
    const nonce = crypto.randomBytes(16).toString('hex');
    nonces.set(nonce, { wallet, issuedAt: Date.now() });
    // expire nonces after 5 minutes to keep the map bounded
    for (const [k, v] of nonces) if (Date.now() - v.issuedAt > 300_000) nonces.delete(k);
    return json(res, 200, {
      nonce,
      message: `Sign in to Blockville\nWallet: ${wallet}\nNonce: ${nonce}`,
    });
  }

  // Step 2: verify the signed nonce.
  // PLACEHOLDER: real Ed25519 verification is the next backend task.
  if (route === 'POST /api/auth/verify') {
    const { wallet, nonce, signature } = await readBody(req);
    const record = nonces.get(nonce);
    if (!record || record.wallet !== wallet) {
      return json(res, 400, { verified: false, reason: 'Unknown or expired nonce.' });
    }
    if (!signature) {
      return json(res, 400, { verified: false, reason: 'Missing signature.' });
    }
    nonces.delete(nonce);
    // TODO: verify `signature` against `wallet` with Ed25519 (tweetnacl / @noble/ed25519).
    // Until that lands we report honestly that verification is pending.
    return json(res, 200, {
      verified: false,
      reason: 'Signature verification is not implemented yet — scaffold only.',
      nextStep: 'Add Ed25519 verification in server/index.mjs (POST /api/auth/verify).',
    });
  }

  // Record a staking intent. This is a server-side ledger entry only —
  // the actual on-chain stake transaction is a later milestone.
  if (route === 'POST /api/stake') {
    const { wallet, amount } = await readBody(req);
    if (!wallet || !Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { error: 'wallet and positive amount are required.' });
    }
    const intent = { wallet, amount, at: Date.now() };
    stakeIntents.push(intent);
    return json(res, 200, {
      status: 'recorded',
      note: 'Demo ledger — no on-chain interaction has occurred.',
      intent,
      totalIntents: stakeIntents.length,
    });
  }

  if (route === 'GET /api/stakes') {
    return json(res, 200, { stakes: stakeIntents });
  }

  return json(res, 404, { error: `No route: ${route}` });
});

server.listen(PORT, () => {
  console.log(`Blockville backend scaffold listening on http://localhost:${PORT}`);
});
