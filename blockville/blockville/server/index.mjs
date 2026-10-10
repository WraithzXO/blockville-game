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
import { WebSocketServer } from 'ws';

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

// ── multiplayer presence hub (real players, real positions) ────────────────
// A connected player sees every other connected player. The hub is a relay:
// it stores the latest name/look/position per player and fans messages out.
const wss = new WebSocketServer({ server, path: '/ws' });
const players = new Map(); // ws -> { id, name, look, x, z, ry, alive }
let nextPlayerId = 1;

const plotOwners = new Map(); // plot id -> owner name (first claim wins, kept across joins/leaves)
const houseStates = new Map(); // plot id -> validated furniture placement list
const arcadeScores = new Map(); // gameId -> name -> personal best
const arcadeRuns = new Map(); // ws -> { gameId, startedAt, submitted }

const sendTo = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};
const broadcastExcept = (ws, msg) => {
  for (const peer of wss.clients) if (peer !== ws) sendTo(peer, msg);
};
const topArcadeScores = () => [...arcadeScores.entries()].flatMap(([gameId, names]) => [...names.entries()].map(([name, score]) => ({ gameId, name, score }))).sort((a, b) => b.score - a.score).slice(0, 10);

wss.on('connection', (ws) => {
  const rec = { id: null, name: '', look: null, x: 0, z: 0, ry: 0, alive: true };
  players.set(ws, rec);
  ws.on('pong', () => { rec.alive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }

    if (msg.t === 'join') {
      rec.id = `p${nextPlayerId++}`;
      rec.name = typeof msg.name === 'string' ? msg.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12) : 'Resident';
      rec.look = msg.look ?? null;
      rec.x = Number(msg.x) || 0;
      rec.z = Number(msg.z) || 0;
      // tell the newcomer about everyone already here…
      const peers = [];
      for (const [, other] of players) {
        if (other !== rec && other.id) peers.push({ id: other.id, name: other.name, look: other.look, x: other.x, z: other.z, ry: other.ry });
      }
      sendTo(ws, { t: 'welcome', id: rec.id, peers, plots: Array.from(plotOwners.entries()), houses: Array.from(houseStates.entries()), arcadeScores: topArcadeScores() });
      // …and everyone else about the newcomer.
      broadcastExcept(ws, { t: 'join', player: { id: rec.id, name: rec.name, look: rec.look, x: rec.x, z: rec.z, ry: rec.ry } });
      return;
    }

    if (!rec.id) return; // ignore anything until the player has joined

    if (msg.t === 'pos') {
      // Number.isFinite, not truthiness — x/z/ry of exactly 0 are valid
      if (Number.isFinite(Number(msg.x))) rec.x = Number(msg.x);
      if (Number.isFinite(Number(msg.z))) rec.z = Number(msg.z);
      if (Number.isFinite(Number(msg.ry))) rec.ry = Number(msg.ry);
      broadcastExcept(ws, { t: 'pos', id: rec.id, x: rec.x, z: rec.z, ry: rec.ry });
      return;
    }

    if (msg.t === 'look') {
      rec.look = msg.look ?? rec.look;
      broadcastExcept(ws, { t: 'look', id: rec.id, look: rec.look });
      return;
    }

    // rename — keep identity in sync without a rejoin (no id churn)
    if (msg.t === 'name') {
      rec.name = typeof msg.name === 'string' && msg.name.trim() ? msg.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12) : rec.name;
      broadcastExcept(ws, { t: 'name', id: rec.id, name: rec.name });
      return;
    }

    // plot ownership relay — first claim wins; every connected player sees the same owner
    if (msg.t === 'houseState') {
      const plot = Number(msg.plot);
      const ownerName = plotOwners.get(plot);
      if (!ownerName || ownerName !== rec.name) { sendTo(ws, { t: 'error', reason: 'Only the plot owner may edit a House.' }); return; }
      const placements = Array.isArray(msg.placements) ? msg.placements.slice(0, 64).map((p) => ({
        id: String(p.id).slice(0, 64), itemId: String(p.itemId).slice(0, 64),
        // match the client's interior bounds exactly so no placement desyncs
        x: Math.max(-5.8, Math.min(5.8, Number.isFinite(Number(p.x)) ? Number(p.x) : 0)),
        z: Math.max(-4.4, Math.min(4.4, Number.isFinite(Number(p.z)) ? Number(p.z) : 0)),
        rotation: Number(p.rotation) || 0, locked: Boolean(p.locked),
      })) : [];
      houseStates.set(plot, placements);
      for (const peer of players.keys()) if (peer.readyState === 1) sendTo(peer, { t: 'houseState', plot, placements });
      return;
    }

    if (msg.t === 'arcadeStart') {
      const gameId = typeof msg.gameId === 'string' ? msg.gameId.slice(0, 32) : '';
      if (gameId !== 'reaction') return;
      arcadeRuns.set(ws, { gameId, startedAt: Date.now(), submitted: false });
      return;
    }

    if (msg.t === 'arcadeScore') {
      const gameId = typeof msg.gameId === 'string' ? msg.gameId.slice(0, 32) : '';
      const score = Number(msg.score);
      const run = arcadeRuns.get(ws);
      // Scores are accepted only after a declared run, once per run, and within
      // the deterministic five-round game's theoretical 5 * 900 maximum.
      if (!run || run.gameId !== gameId || run.submitted || !Number.isFinite(score) || score < 0 || score > 4500) return;
      run.submitted = true;
      if (!arcadeScores.has(gameId)) arcadeScores.set(gameId, new Map());
      const board = arcadeScores.get(gameId);
      if (score > (board.get(rec.name) || 0)) board.set(rec.name, Math.floor(score));
      const scores = topArcadeScores();
      for (const peer of wss.clients) sendTo(peer, { t: 'arcadeScores', scores });
      return;
    }

    if (msg.t === 'claim') {
      const plot = Number(msg.plot);
      const name = String(msg.ownerName || 'Resident').slice(0, 12);
      const existing = plotOwners.get(plot);
      if (existing && existing !== name && String(msg.prev || '').slice(0, 12) !== existing) {
        // conflict: the first claim holds — correct the sender instead of relaying
        sendTo(ws, { t: 'claim', plot, ownerName: existing });
        return;
      }
      plotOwners.set(plot, name);
      broadcastExcept(ws, { t: 'claim', plot, ownerName: name });
      return;
    }
  });

  ws.on('close', () => {
    players.delete(ws);
    arcadeRuns.delete(ws);
    if (rec.id) broadcastExcept(ws, { t: 'leave', id: rec.id });
  });
});

// heartbeat — drop dead sockets so no ghost players linger
setInterval(() => {
  for (const ws of wss.clients) {
    const rec = players.get(ws);
    if (rec && !rec.alive) { ws.terminate(); continue; }
    if (rec) rec.alive = false;
    try { ws.ping(); } catch { /* socket died between ping and terminate */ }
  }
}, 30_000).unref();

server.listen(PORT, () => {
  console.log(`Blockville backend scaffold listening on http://localhost:${PORT}`);
});
