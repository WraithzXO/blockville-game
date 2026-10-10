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
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 8787;

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

  // Bug reports: stored to a local JSONL ledger (always real), and optionally
  // forwarded to an external destination when BUG_REPORT_WEBHOOK_URL is set.
  // The response states exactly what happened — success is never faked.
  if (route === 'POST /api/bug-report') {
    const { text, player, userAgent } = await readBody(req);
    const clean = typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    if (clean.length < 5 || clean.length > 4000) {
      return json(res, 400, { error: 'Describe the bug in 5–4000 characters.' });
    }
    const report = {
      at: new Date().toISOString(),
      player: typeof player === 'string' ? player.slice(0, 12) : null,
      userAgent: typeof userAgent === 'string' ? userAgent.slice(0, 200) : null,
      text: clean,
    };
    let stored = false;
    try {
      const dir = path.join(process.cwd(), 'bugreports');
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(path.join(dir, 'bugreports.jsonl'), `${JSON.stringify(report)}\n`);
      stored = true;
    } catch { /* disk error — reported honestly below */ }
    let forwarded = false;
    let forwardError = null;
    const webhook = process.env.BUG_REPORT_WEBHOOK_URL;
    if (webhook) {
      try {
        const r = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `🐞 Blockville bug report${report.player ? ` from ${report.player}` : ''}:\n${clean}` }),
        });
        forwarded = r.ok;
        if (!r.ok) forwardError = `webhook responded ${r.status}`;
      } catch (e) {
        forwardError = `webhook unreachable: ${e.message}`;
      }
    }
    if (!stored && !forwarded) {
      return json(res, 500, { error: 'The report could not be stored or forwarded. Nothing was faked — please try again.' });
    }
    return json(res, 200, { ok: true, stored, forwarded, forwardError });
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

// plot id -> { owner, type, progress, done } — the authoritative world record.
// Every client derives its "Plot owned by" label and building visuals from this.
const plotOwners = new Map();
const houseStates = new Map(); // plot id -> validated furniture placement list
const arcadeScores = new Map(); // gameId -> name -> personal best
const arcadeRuns = new Map(); // ws -> { gameId, startedAt, submitted }
// Server-run market simulation (NPC claims/listings/sales). One source of
// truth broadcast to every client — no client-side random market anymore.
const BUILD_COSTS = { house: 48, casino: 60, mine: 45, shop: 30, bank: 75, cafe: 35, arcade: 55, bakery: 40, park: 25 };
const RESIDENTS = ['Nova', 'Rex', 'Momo', 'Vega', 'Juno', 'Pixel'];
const MARKET = {
  listPriceMin: 4_000, listPriceMax: 14_000,
  simListChance: 0.12, simBuyChance: 0.15, simClaimChance: 0.10,
  tickMs: Number(process.env.BV_MARKET_TICK_MS) || 8_000,
  maxOpenListings: 7,
};
const plotIds = new Set();   // every plot id in town (from the first joiner)
const listings = new Map();  // listing id -> { id, plot, seller, price }
let nextListingId = 1;
let worldSeeded = false;

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
      // First joiner teaches the server the world shape: all plot ids and the
      // pre-seeded Town Council community plots. Later joiners are ignored.
      if (!worldSeeded && Array.isArray(msg.plotIds)) {
        for (const id of msg.plotIds.slice(0, 512)) {
          const pid = Number(id);
          if (Number.isInteger(pid)) plotIds.add(pid);
        }
        if (Array.isArray(msg.community)) {
          for (const entry of msg.community.slice(0, 64)) {
            const [pid, ctype] = Array.isArray(entry) ? entry : [];
            const cost = BUILD_COSTS[ctype];
            if (Number.isInteger(Number(pid)) && cost) {
              plotOwners.set(Number(pid), { owner: 'Town Council', type: String(ctype), progress: cost, done: true, level: 1 });
            }
          }
        }
        // the same starter listings every client seeds locally — seeded here
        // so listing ids match and the sim can sell them too
        for (const l of [{ plot: 28, price: 9_800 }, { plot: 61, price: 6_500 }, { plot: 94, price: 4_200 }]) {
          listings.set(nextListingId, { id: nextListingId, plot: l.plot, seller: `Resident ${String.fromCharCode(64 + nextListingId)}`, price: l.price });
          nextListingId++;
        }
        worldSeeded = true;
      }
      // tell the newcomer about everyone already here…
      const peers = [];
      for (const [, other] of players) {
        if (other !== rec && other.id) peers.push({ id: other.id, name: other.name, look: other.look, x: other.x, z: other.z, ry: other.ry });
      }
      sendTo(ws, { t: 'welcome', id: rec.id, peers, plots: Array.from(plotOwners.entries()), listings: Array.from(listings.values()), houses: Array.from(houseStates.entries()), arcadeScores: topArcadeScores() });
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
      const ownerName = plotOwners.get(plot)?.owner;
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

    // plot ownership — first claim wins; a transfer (prev) is honoured only
    // when the current owner has this exact plot listed for sale on this server.
    if (msg.t === 'claim') {
      const plot = Number(msg.plot);
      if (!Number.isInteger(plot)) return;
      const name = String(msg.ownerName || 'Resident').slice(0, 12);
      const existing = plotOwners.get(plot);
      const prev = typeof msg.prev === 'string' ? String(msg.prev).slice(0, 12) : undefined;
      const type = BUILD_COSTS[msg.type] ? String(msg.type) : null;
  const record = (r) => ({ ownerName: r.owner, type: r.type, progress: r.progress, done: r.done, level: r.level || 1 });
      if (existing && existing.owner !== name) {
        const sale = [...listings.values()].find((l) => l.plot === plot && l.seller === existing.owner);
        if (prev && sale && prev === existing.owner) {
          const price = sale.price;
          listings.delete(sale.id);
          existing.owner = name;
          houseStates.delete(plot); // the furniture left with the previous resident
          if (type) existing.type = type;
          for (const peer of wss.clients) {
            if (peer !== ws) sendTo(peer, { t: 'claim', plot, ...record(existing), prev, price });
          }
          // confirm to the buyer and drop the consumed listing everywhere
          sendTo(ws, { t: 'claim', plot, ...record(existing) });
          for (const peer of wss.clients) sendTo(peer, { t: 'unlist', id: sale.id });
          return;
        }
        // conflict: the first claim holds — correct the sender, never relay
        sendTo(ws, { t: 'claim', plot, ...record(existing) });
        return;
      }
      if (!existing) { plotOwners.set(plot, { owner: name, type, progress: 0, done: false }); houseStates.delete(plot); }
      else if (type && !existing.type) existing.type = type;
      broadcastExcept(ws, { t: 'claim', plot, ...record(plotOwners.get(plot)) });
      return;
    }

    // construction progress on the sender's own plot — validated and relayed
    if (msg.t === 'build') {
      const plot = Number(msg.plot);
      const plotRec = plotOwners.get(plot);
      if (!plotRec || plotRec.owner !== rec.name) return;
      const cost = plotRec.type ? BUILD_COSTS[plotRec.type] : 0;
      const progress = Math.max(0, Math.min(cost || 9_999, Math.floor(Number(msg.progress) || 0)));
      plotRec.progress = progress;
      plotRec.done = cost > 0 ? progress >= cost : msg.done === true;
      broadcastExcept(ws, { t: 'build', plot, progress: plotRec.progress, done: plotRec.done });
      return;
    }

    // building upgrades on the sender's own plot or a Town Council community
    // building — the server validates the level step and relays it, so every
    // session (and every late joiner) sees the same upgraded state
    if (msg.t === 'upgrade') {
      const plot = Number(msg.plot);
      const plotRec = plotOwners.get(plot);
      if (!plotRec || !plotRec.done) return;
      if (plotRec.owner !== rec.name && plotRec.owner !== 'Town Council') return;
      const next = Number(msg.level);
      if (next !== (plotRec.level || 1) + 1 || next > 4) return;
      plotRec.level = next;
      broadcastExcept(ws, { t: 'upgrade', plot, level: next });
      return;
    }

    // list one of MY plots for sale; everyone (including me) gets the server id
    if (msg.t === 'list') {
      const plot = Number(msg.plot);
      const price = Math.floor(Number(msg.price));
      const plotRec = plotOwners.get(plot);
      if (!plotRec || plotRec.owner !== rec.name || !Number.isFinite(price) || price <= 0) return;
      if ([...listings.values()].some((l) => l.plot === plot)) return;
      if (listings.size >= MARKET.maxOpenListings) return;
      const id = nextListingId++;
      listings.set(id, { id, plot, seller: rec.name, price });
      for (const peer of wss.clients) sendTo(peer, { t: 'simList', id, plot, price, seller: rec.name });
      return;
    }

    // cancel my listing
    if (msg.t === 'unlist') {
      const plot = Number(msg.plot);
      for (const [id, l] of [...listings.entries()]) {
        if (l.plot === plot && l.seller === rec.name) {
          listings.delete(id);
          for (const peer of wss.clients) sendTo(peer, { t: 'unlist', id });
        }
      }
      return;
    }
  });

  ws.on('close', () => {
    players.delete(ws);
    arcadeRuns.delete(ws);
    if (rec.id) broadcastExcept(ws, { t: 'leave', id: rec.id });
  });
});

// ── market simulation heartbeat (NPC residents) ────────────────────────────
// Runs on the SERVER so every connected client sees the same claims, listings
// and sales. Never touches plots owned by connected players or Town Council.
setInterval(() => {
  if (!worldSeeded) return;
  const connected = new Set();
  for (const [, r] of players) if (r.id && r.name) connected.add(r.name);
  const npcNames = () => RESIDENTS.filter((n) => !connected.has(n));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // NPC claims a free plot, fully built (as the old client-side sim did)
  if (Math.random() < MARKET.simClaimChance) {
    const free = [...plotIds].filter((id) => !plotOwners.has(id));
    if (free.length) {
      const plot = pick(free);
      const type = pick(Object.keys(BUILD_COSTS));
      const pool = npcNames();
      const name = pick(pool.length ? pool : RESIDENTS);
      plotOwners.set(plot, { owner: name, type, progress: BUILD_COSTS[type], done: true });
      for (const peer of wss.clients) sendTo(peer, { t: 'simClaim', plot, type, name });
    }
  }

  // an NPC resident lists one of their plots for sale
  if (Math.random() < MARKET.simListChance && listings.size < MARKET.maxOpenListings) {
    const listedPlots = new Set([...listings.values()].map((l) => l.plot));
    const owned = [...plotOwners.entries()].filter(([id, r]) =>
      r.owner !== 'Town Council' && !connected.has(r.owner) && !listedPlots.has(id));
    if (owned.length) {
      const [plot, r] = pick(owned);
      const price = Math.round((MARKET.listPriceMin + Math.random() * (MARKET.listPriceMax - MARKET.listPriceMin)) / 100) * 100;
      const id = nextListingId++;
      listings.set(id, { id, plot, seller: r.owner, price });
      for (const peer of wss.clients) sendTo(peer, { t: 'simList', id, plot, price, seller: r.owner });
    }
  }

  // a buyer purchases a listing — possibly one a real player listed
  if (Math.random() < MARKET.simBuyChance && listings.size) {
    const l = pick([...listings.values()]);
    listings.delete(l.id);
    const rec = plotOwners.get(l.plot);
    const pool = RESIDENTS.filter((n) => n !== l.seller && !connected.has(n));
    const newOwner = pick(pool.length ? pool : RESIDENTS.filter((n) => n !== l.seller));
    if (rec && rec.owner === l.seller) { rec.owner = newOwner; houseStates.delete(l.plot); }
    for (const peer of wss.clients) sendTo(peer, { t: 'simBuy', id: l.id, plot: l.plot, ownerName: newOwner, sellerName: l.seller, price: l.price });
  }
}, MARKET.tickMs).unref();

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
