// ── Blockville backend scaffold ────────────────────────────────────────────
// A small, dependency-free Node server that starts the real backend layer.
//
// What is REAL already:
//   • Wallet sign-in: nonce issuance → REAL Ed25519 signature verification
//     (node:crypto, server/auth.mjs) → single-use challenge binding →
//     in-memory session ledger keyed by the VERIFIED wallet public key
//   • Holding-based plot entitlement (Chunk 6) with server-side claim gating
//
// What is still a PLACEHOLDER (clearly marked):
//   • Anything on-chain. No transactions are faked or simulated here.
//
// Run with:  npm run server     (listens on http://localhost:8787)

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import { createTreasury, createMockVenue } from './treasury.mjs';
import { createDistributor } from './distribute.mjs';
import { createJupiterVenue } from './jupiter.mjs';
import { createPayoutSender } from './payouts.mjs';
import { createFeeListener } from './fees.mjs';
import { loadKeypairFile } from './solana.mjs';
import { UPGRADE_SOL, SHOP_PRICES, FURNITURE_PRICES, CYCLE, INTAKE, ENTITLEMENT, ONCHAIN, assertLiveConfig, treasuryLiveState,
         BASE_PLOT_POINTS, BUILD_BLOCKS, UPGRADE_MULT, MAX_LEVEL, GARDEN_MULT, FEES, SWAP, treasuryWalletAddress } from './tokenomics.mjs';
import { createHoldingsTracker } from './holdings.mjs';
import { createEntitlementEngine, createDemoHoldings, createRpcHoldingsReader } from './entitlements.mjs';
import { verifyWalletSignature } from './auth.mjs';
import { createUpgradePaymentVerifier } from './payments.mjs';
import { createBlackjackTable } from './blackjack.mjs';
import { BLACKJACK } from './tokenomics.mjs';

const PORT = Number(process.env.PORT) || 8787;

// Built client (npm run build). Served from this same process and port, so the
// page and the /ws socket share one origin in production.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
function serveDist(res, pathname) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) return false;
  let rel;
  try { rel = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch { return false; }
  let file = path.resolve(DIST, rel || 'index.html');
  if (file !== DIST && !file.startsWith(DIST + path.sep)) return false;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
  return true;
}

// in-memory stores — swap for a real database when this leaves the sandbox
const nonces = new Map();     // nonce -> { wallet, issuedAt }
const guestSessions = new Map(); // guest token -> { id, createdAt } (server-assigned, NO wallet, NO economy)
const sessions = new Map();   // token -> { wallet, createdAt, lastSeenAt }

// Wallet sign-in configuration (auth chunk). Nonces are single-use and
// expire; sessions are the server-side identity ledger. Env-tunable so the
// test suite can exercise expiry without real-time waits.
const AUTH_NONCE_MS = () => Number(process.env.BV_AUTH_NONCE_MS) || 300_000;
const AUTH_SESSION_MS = () => Number(process.env.BV_AUTH_SESSION_MS) || 24 * 3_600_000;

// One character per wallet (tab-duplication protection). The lock is keyed
// ONLY by the session-verified wallet — never by tab, window, browser session
// id or client-reported identity. Env-tunable so the test suite can exercise
// the timing without real-time waits.
const SESSION_HEARTBEAT_MS = () => Number(process.env.BV_SESSION_HEARTBEAT_MS) || 45_000; // silence before a holder counts as stale (unclean drop)
const SESSION_GRACE_MS = () => Number(process.env.BV_SESSION_GRACE_MS) || 8_000;   // clean-close window in which a refresh re-adopts the SAME character
const SESSION_SWEEP_MS = () => Number(process.env.BV_SESSION_SWEEP_MS) || 5_000;   // sweep cadence: pings holders, finalizes stale/grace locks

// The one canonical sign-in message. The client signs EXACTLY this string —
// the server reconstructs it at verify time from its own nonce record, so a
// client can never choose (or substitute) what was signed.
const authMessage = (wallet, nonce) => `Sign in to Blockville\nWallet: ${wallet}\nNonce: ${nonce}`;

// Entitlement identity: in demo mode (no mint configured) holdings are keyed
// by the player's server-side name exactly as before. When BLOCKVILLE_MINT is
// set, holdings are on-chain and keyed ONLY by the session-verified wallet —
// a connection that never completed wallet verification has no key and
// therefore no claim path (the gate denies, nothing is guessed).
const liveEntitlements = () => Boolean(process.env[ONCHAIN.mintEnv]);
const claimKeyOf = (rec) => (liveEntitlements() ? rec.wallet : rec.name);
// ── wallet gate (guest-mode chunk) ──────────────────────────────────────────
// Economic actions require an authenticated wallet session. A GUEST (joined
// with guest:true and no verified wallet) is never allowed; in live mode any
// connection without a session-verified wallet is refused too. Demo/dev
// servers (no mint configured) keep the existing name-keyed demo wallet for
// non-guest connections, exactly as before.
const economyBlocked = (rec) => !rec.wallet && (rec.guest === true || liveEntitlements());
// one-character lock key: the verified wallet, or the server-assigned guest id
// ('guest:' prefix — can never equal a base58 wallet address)
const lockKeyOf = (rec) => rec.wallet || rec.guestId || null;
const ECONOMY_MSGS = new Set(['claim', 'feesClaim', 'build', 'upgrade', 'upgradePay', 'shopPurchase', 'furniturePurchase', 'gardenPlace', 'gardenUnplace', 'walletDeposit', 'list', 'unlist', 'houseState', 'bjBet', 'bjHit', 'bjStand']);

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
  if (req.method === 'GET' && !url.pathname.startsWith('/api/') && serveDist(res, url.pathname)) return;

  if (route === 'GET /api/health') {
    return json(res, 200, { ok: true, service: 'blockville-backend', time: Date.now(), liveEconomy: liveEntitlements() });
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
    // expire spent nonces to keep the map bounded
    for (const [k, v] of nonces) if (Date.now() - v.issuedAt > AUTH_NONCE_MS()) nonces.delete(k);
    return json(res, 200, {
      nonce,
      message: authMessage(wallet, nonce),
    });
  }

  // Step 2: verify the signed nonce with REAL Ed25519 verification.
  if (route === 'POST /api/auth/verify') {
    const { wallet, nonce, signature } = await readBody(req);
    // One generic failure for every reject path: malformed payload, unknown
    // or expired challenge, reused challenge, wrong message, wrong keypair,
    // bad signature encoding. Nothing about WHY it failed leaks; the only
    // actionable hint a legitimate client needs is to start over with a
    // fresh nonce.
    const fail = () => json(res, 400, { verified: false, error: 'Verification failed. Request a new nonce and sign again.' });
    if (typeof wallet !== 'string' || typeof nonce !== 'string' || typeof signature !== 'string') return fail();
    const record = nonces.get(nonce);
    if (!record || record.wallet !== wallet) { nonces.delete(nonce); return fail(); }
    // Single-use binding: the challenge is burned on the FIRST verify
    // attempt, whatever the outcome, so it can never be replayed.
    nonces.delete(nonce);
    if (Date.now() - record.issuedAt > AUTH_NONCE_MS()) return fail();
    // The message is reconstructed server-side from the issued record —
    // never taken from the request — so a signature over any other message
    // cannot verify.
    const ok = verifyWalletSignature({ wallet, message: authMessage(wallet, nonce), signature });
    if (!ok) return fail();
    // The VERIFIED wallet public key (the base58 address IS the Ed25519
    // public key) becomes the server-side identity anchor: the session token
    // proves this wallet completed verification, and is the ONLY way a
    // client can bind a connection to that wallet.
    const token = crypto.randomBytes(32).toString('hex');
    const nowMs = Date.now();
    sessions.set(token, { wallet, createdAt: nowMs, lastSeenAt: nowMs });
    for (const [k, s] of sessions) if (nowMs - s.createdAt > AUTH_SESSION_MS()) sessions.delete(k);
    return json(res, 200, { verified: true, wallet, token, expiresInMs: AUTH_SESSION_MS() });
  }

  // ── dev/test-only demo holdings set (Chunk 6 test support) ────────────────
  // Strictly env-gated (BV_ALLOW_DEMO_HOLDINGS_SET=1) so production can never
  // reach it; the production-readiness chunk audits this gate. Lets the
  // entitlement test suite drive a demo player's simulated holding down to
  // exercise real LIFO revocation through the live server.
  if (route === 'POST /api/dev/demo-holdings') {
    if (process.env.BV_ALLOW_DEMO_HOLDINGS_SET !== '1') return json(res, 404, { error: 'No route: POST /api/dev/demo-holdings' });
    const { name, tokens } = await readBody(req);
    if (!name || typeof name !== 'string' || !Number.isFinite(Number(tokens))) {
      return json(res, 400, { error: 'name and numeric tokens are required.' });
    }
    demoHoldings.set(name, Number(tokens));
    return json(res, 200, { ok: true, name, tokens: demoHoldings.get(name) });
  }

  // ── treasury admin view (Chunk T4) ──────────────────────────────────────
  // Read-only cycle reporting for the operator: the last N cycles (exact
  // balance before/after, inflows, per-player weights and payouts) plus the
  // live treasury counters. Exposes nothing secret (public wallet address
  // and balances only).
  if (route === 'GET /api/treasury/cycles') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 500);
    return json(res, 200, {
      cycles: distributor.cycleReports(limit),
      treasury: {
        wallet: ONCHAIN.treasuryWalletAddress,
        live: treasuryLiveState().live,
        tokenBalance: treasury.balance,
        gasReserveSol: treasury.gasReserve,
        pendingBuybackSol: treasury.pendingBuyback,
      },
    });
  }

  // ── treasury holdings display (Chunk 5) ─────────────────────────────────
  // Read-only: the treasury wallet's current $BLOCKVILLE holdings straight
  // from Solana RPC (server-side cache, last-valid on RPC errors). The kill
  // switch is irrelevant here — this is a public-address read, not a
  // transaction, so it works identically in dry-run and live modes.
  if (route === 'GET /api/treasury/holdings') {
    return json(res, 200, await holdings.get());
  }

  // Public, read-only tokenomics configuration for the HUD Tokenomics panel.
  // Every value comes straight from server/tokenomics.mjs — the single source
  // of truth — so the panel cannot drift from the values the payout engine
  // actually enforces. Pure config: no keys, no secrets, no ledger data.
  if (route === 'GET /api/tokenomics') {
    return json(res, 200, {
      ok: true,
      tokenomics: {
        plotScore: {
          formula: '(20 + construction blocks) × upgrade × garden',
          basePlotPoints: BASE_PLOT_POINTS,
          buildBlocks: BUILD_BLOCKS,
          upgradeMultipliers: UPGRADE_MULT,
          maxLevel: MAX_LEVEL,
          gardenMultiplier: GARDEN_MULT,
        },
        cycle: {
          intervalMinutes: CYCLE.intervalMs / 60_000,
          distributePct: CYCLE.distributePct,
          minDistributableTokens: CYCLE.minDistributableTokens,
        },
        fees: {
          buybackPct: FEES.buybackPct,
          gasReservePct: FEES.gasReservePct,
          gasSweepThresholdSol: FEES.gasSweepThresholdSol,
          gasSweepFraction: FEES.gasSweepFraction,
        },
        payoutRules: { roundDownPerPlayer: true, remainderRetained: true, npcExcluded: true },
        entitlement: { tokensPerPlot: ENTITLEMENT.tokensPerPlot, maxPlots: ENTITLEMENT.maxPlots },
      },
    });
  }

  return json(res, 404, { error: `No route: ${route}` });
});

// ── multiplayer presence hub (real players, real positions) ────────────────
// A connected player sees every other connected player. The hub is a relay:
// it stores the latest name/look/position per player and fans messages out.
const wss = new WebSocketServer({ server, path: '/ws' });
const players = new Map(); // ws -> { id, name, look, x, z, ry, alive }
let nextPlayerId = 1;
// VERIFIED wallet -> { ws, rec, closedAt } — the ONE active character per
// wallet. `closedAt` is set when the active socket closes cleanly and marks
// the grace window during which a refresh re-adopts the same character.
const walletLocks = new Map();

// plot id -> { owner, type, progress, done } — the authoritative world record.
// Every client derives its "Plot owned by" label and building visuals from this.
const plotOwners = new Map();
// wire shape for a plot record: the client protocol speaks `ownerName`, the
// storage above speaks `owner` — every send path funnels through this
const record = (r) => ({ ownerName: r.owner, type: r.type, progress: r.progress, done: r.done, level: r.level || 1 });
const houseStates = new Map(); // plot id -> validated furniture placement list
const arcadeScores = new Map(); // gameId -> name -> personal best
const arcadeRuns = new Map(); // ws -> { gameId, startedAt, submitted }
// Server-run market simulation (NPC claims/listings/sales). One source of
// truth broadcast to every client — no client-side random market anymore.
const BUILD_COSTS = { house: 48, casino: 60, mine: 45, shop: 30, bank: 75, cafe: 35, arcade: 55, bakery: 40, park: 25 };
const RESIDENTS = ['Nova', 'Rex', 'Momo', 'Vega', 'Juno', 'Pixel'];
// every simulated resident: the named NPCs plus the starter-listing sellers ("Resident A"...). All of them share one cap.
const isNpcName = (n) => RESIDENTS.includes(n) || /^Resident [A-Z]$/.test(String(n));
const MARKET = {
  listPriceMin: 4_000, listPriceMax: 14_000,
  simListChance: 0.12, simBuyChance: 0.15, simClaimChance: 0.10,
  tickMs: Number(process.env.BV_MARKET_TICK_MS) || 8_000,
  maxOpenListings: 7,
  maxNpcPlots: 11, // all NPC residents combined can own at most this many plots
};
const plotIds = new Set();   // every plot id in town (from the first joiner)
const listings = new Map();  // listing id -> { id, plot, seller, price }
let nextListingId = 1;
let worldSeeded = false;

// ── treasury intake / recycling / buyback (Chunk T2) ───────────────────────
// Ledger: append-only JSONL (data/treasury-ledger.jsonl by default, env
// BV_TREASURY_LEDGER). MOCK swap venue: deterministic price, zero slippage,
// no real transactions — replace with a real router client once an RPC URL
// and the $BLOCKVILLE mint address are configured (T0 audit: nothing
// on-chain exists yet). Slippage/minimum-out guards stay either way.
const treasury = createTreasury({
  ledgerPath: process.env.BV_TREASURY_LEDGER ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'treasury-ledger.jsonl'),
  statePath: process.env.BV_TREASURY_STATE ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'treasury-state.json'),
});

// ── casino blackjack table (casino chunk) ──────────────────────────────────
// Fully server-authoritative: cards, results and settlements exist only in
// server/blackjack.mjs. Money moves through the treasury module's audited
// player ledger — bets come from the SERVER-side balance (deposits), never a
// client-reported wallet. TEST HOOK (dev only): when the demo-deposit faucet
// is enabled AND BV_BLACKJACK_DECK is set, the shoe is forced to that draw
// order (comma-separated cards). Production never sets either, so the live
// table always shuffles with the secure RNG.
const blackjackTable = createBlackjackTable({
  limits: BLACKJACK,
  treasury,
  ...(process.env.BV_ALLOW_DEMO_DEPOSITS === '1' && process.env.BV_BLACKJACK_DECK
    ? { deck: process.env.BV_BLACKJACK_DECK.split(',').map((c) => c.trim()) }
    : {}),
  audit: (kind, info) => { console.log(JSON.stringify({ t: `blackjack_${kind}`, ...info })); },
});
let swapVenue = createMockVenue();
let payoutSender = null;
let feeListener = null;

// Real-path construction: when the kill switch is ON and the operator setup
// is complete (mint + 0600 keypair), the mock venue is REPLACED by the real
// Jupiter client, the claim sender is wired, and the incoming-SOL fee
// listener starts polling public RPC. A keypair problem REFUSES TO START
// (fail-loud) rather than silently falling back to the mock.
if (treasuryLiveState().live) {
  try {
    const payer = loadKeypairFile(process.env[ONCHAIN.keypairPathEnv]);
    if (payer.publicKeyBase58 !== treasuryWalletAddress()) {
      console.error(JSON.stringify({ t: 'treasury_keypair_mismatch', detail: `${ONCHAIN.keypairPathEnv} does not belong to the treasury wallet address` }));
      process.exit(1);
    }
    const rpcUrl = treasuryLiveState().rpcUrl || ONCHAIN.defaultRpcUrl;
    swapVenue = createJupiterVenue({
      rpcUrl,
      mint: treasuryLiveState().mint,
      payer,
      apiUrl: process.env[SWAP.jupiterApiEnv] || SWAP.defaultJupiterApiUrl,
      statePath: process.env[SWAP.swapStatePathEnv] ||
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'treasury-swap-state.json'),
      treasuryAddress: treasuryWalletAddress(),
    });
    payoutSender = createPayoutSender({
      rpcUrl,
      mint: treasuryLiveState().mint,
      payer,
      treasuryTokenAccount: process.env.BV_TREASURY_TOKEN_ACCOUNT || null,
    });
    feeListener = createFeeListener({
      rpcUrl,
      treasuryAddress: treasuryWalletAddress(),
      treasury,
      cursorPath: process.env[INTAKE.cursorPathEnv] ||
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'fee-intake-cursor.json'),
      pollMs: Number(process.env[INTAKE.pollMsEnv]) || INTAKE.defaultPollMs,
    });
    console.log(JSON.stringify({ t: 'treasury_real_path', venue: 'jupiter', intake: 'rpc_polling', claims: 'spl_transfer' }));
    feeListener.start();
  } catch (e) {
    console.error(`[treasury] REFUSING TO START LIVE: keypair load failed (${e?.message ?? e}). Fix the environment and restart.`);
    process.exit(1);
  }
}

// ── treasury wallet holdings (Chunk 5) ─────────────────────────────────────
// READ-ONLY on-chain balance of the PUBLIC treasury wallet, served to the
// client at /api/treasury/holdings. The client receives the value only — no
// key material and no balance logic ever cross the wire.
const holdings = createHoldingsTracker();

// ── real SOL upgrade payments (upgrade-transactions chunk) ─────────────────
// Mode resolution (evaluated per message, never cached):
//   'dev'    — BLOCKVILLE_DEV_TX_MODE=1: upgrades complete WITHOUT on-chain
//              verification (same server-side state changes). Off by default;
//              never set it on a production deployment.
//   'strict' — dev flag off AND BLOCKVILLE_MINT set (the live-treasury
//              configuration): every upgrade must be backed by a REAL SOL
//              transaction the server verifies on-chain. A client claim
//              alone never applies an upgrade.
//   'demo'   — everything else (the current demo deployment): the client's
//              demo-wallet relay settles as before, ledgered 'client'.
const devTxMode = () => process.env.BLOCKVILLE_DEV_TX_MODE === '1';
const paymentMode = () => (devTxMode() ? 'dev' : liveEntitlements() ? 'strict' : 'demo');
if (devTxMode()) {
  console.log(JSON.stringify({ t: 'upgrade_payments_mode', mode: 'dev', note: 'BLOCKVILLE_DEV_TX_MODE=1 — upgrades complete without on-chain verification. DEV/TEST ONLY.' }));
}

// Signature verifier (read-only RPC + persisted applied-signature ledger, so
// a restart can never let one paid transaction buy two upgrades).
const upgradePayments = createUpgradePaymentVerifier({
  storePath: process.env.BV_UPGRADE_SIGNATURES ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'upgrade-signatures.json'),
});

// ── Garden Kit server truth (Chunk T3 eligibility) ──────────────────────────
// Kits bought in the shop increment a per-name inventory (server-ledgered);
// placing one on an owned plot moves it into `gardenPlots`. Only PLACED kits
// on owned plots earn the ×1.2 multiplier — and only the server's own record
// feeds the payout engine, never the client's local garden list.
const gardenKits = new Map();  // player name -> unplaced kits
const gardenPlots = new Map(); // plot id -> garden placed (owned plots only)
const permits = new Map();     // player name -> Claim Permits purchased (server-tracked)

// ── weighted payout engine (Chunk T3) ──────────────────────────────────────
const distributor = createDistributor({
  treasury,
  getPlots: () => [...plotOwners.entries()].map(([id, r]) => ({ ...r, garden: gardenPlots.get(id) === true })),
  ledgerPath: process.env.BV_DIST_LEDGER ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'treasury-cycles.jsonl'),
  claimablePath: process.env.BV_CLAIMABLE_PATH ||
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'claimable-balances.json'),
  log: console, // structured per-cycle console report (Chunk T4)
  // per-player payouts and the cycle summary are broadcast AFTER the cycle
  // completes (see the boundary interval below) so each message can carry
  // the final cycle totals; the engine's own onPayout stays for replays.
});

// ── holding-based plot entitlement (Chunk 6) ───────────────────────────────
// Staking is gone. A player may hold plots up to entitlement =
// floor(verified holdings / ENTITLEMENT.tokensPerPlot), capped at maxPlots.
//
// Live mode (BLOCKVILLE_MINT set): holdings are the player's VERIFIED wallet
// balance read via public RPC — never client-reported. Until Ed25519 wallet
// verification lands (open item), a live-mode player cannot claim: the gate
// reports holdings_unverified rather than guessing.
// Demo mode (no mint, current state): each player gets the seeded simulated
// holding — server-side, never client input — so the demo plays exactly as
// before (up to the full 5-plot tier) while the gate itself is real.
const demoHoldings = createDemoHoldings();
const entitlementLedgerPath = process.env.BV_ENTITLEMENTS_LEDGER ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'entitlements-ledger.jsonl');

// ── plot persistence (final-audit fix) ─────────────────────────────────────
// plotOwners / gardenPlots are the authoritative plot + building records the
// payout engine scores. They previously lived in memory only, so every server
// restart (each deploy!) wiped every player's claimed plot and paid-for
// construction while their claimable fee balances survived on disk. They now
// snapshot to data/plots.json (BV_PLOTS_PATH overrides; the test harness
// points it at tmp). Save is change-detected on a short interval plus on
// graceful shutdown, so a hard kill loses at most a few seconds of state.
const plotsPath = process.env.BV_PLOTS_PATH ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'plots.json');
let plotsOnDisk = null;
try {
  if (fs.existsSync(plotsPath)) {
    const raw = JSON.parse(fs.readFileSync(plotsPath, 'utf8'));
    if (raw && Array.isArray(raw.plots)) {
      for (const [pid, rec] of raw.plots) {
        const id = Number(pid);
        if (Number.isInteger(id) && rec && rec.owner) {
          plotOwners.set(id, {
            ...rec,
            progress: Math.max(0, Number(rec.progress) || 0),
            level: Math.min(4, Math.max(1, Number(rec.level) || 1)),
          });
        }
      }
      for (const [pid, g] of (Array.isArray(raw.gardens) ? raw.gardens : [])) {
        const id = Number(pid);
        if (Number.isInteger(id) && plotOwners.has(id) && g === true) gardenPlots.set(id, true);
      }
      plotsOnDisk = JSON.stringify({ plots: [...plotOwners], gardens: [...gardenPlots] });
      console.log(JSON.stringify({ t: 'plots_restored', count: plotOwners.size }));
    }
  }
} catch (e) {
  console.log(JSON.stringify({ t: 'plots_restore_failed', error: String(e?.message ?? e) }));
}
const persistPlots = () => {
  const snap = JSON.stringify({ plots: [...plotOwners], gardens: [...gardenPlots] });
  if (snap === plotsOnDisk) return;
  plotsOnDisk = snap;
  try {
    fs.mkdirSync(path.dirname(plotsPath), { recursive: true });
    fs.writeFileSync(plotsPath, snap);
  } catch { /* a persistence failure must never break the game loop */ }
};
setInterval(persistPlots, 5000).unref();
process.on('SIGTERM', persistPlots);
process.on('SIGINT', persistPlots);

// Live holdings reader (public RPC, read-only) — the reader choice is made per
// read so tests and operators can flip the mint env without a code change.
const rpcHoldings = createRpcHoldingsReader({});

const entitlements = createEntitlementEngine({
  // Demo mode (no mint): holdings are server-side per player name, exactly as
  // before. Live mode (mint set): keys are always session-verified wallet
  // addresses (see claimKeyOf), so the RPC read is keyed on the VERIFIED
  // wallet — never on a client-claimed address.
  readHoldings: (key) => (liveEntitlements() ? rpcHoldings(key) : demoHoldings.reader(key)),
  ledgerPath: entitlementLedgerPath,
  // Claim Permits add server-side slots on top of the verified tier (capped at
  // maxPlots in total). The permit count lives HERE, from the authoritative
  // shop-purchase report — never from the client's own inventory flag.
  extraFor: (key) => Math.min(ENTITLEMENT.maxPlots, permits.get(key) ?? 0),
  // Server-side revocation: clear the plot record (the simpler documented
  // option — the building does NOT visually remain), drop its house state and
  // garden, pull any listing of it, and tell every client at once so the plot
  // is immediately claimable again. The revoked plot drops out of scoring at
  // the same instant because scoring reads plotOwners.
  onRevoke(key, plot, info) {
    const rec = plotOwners.get(plot);
    if (rec && (rec.ownerKey ?? rec.owner) === key) {
      plotOwners.delete(plot);
      houseStates.delete(plot);
      gardenPlots.delete(plot);
      for (const [id, l] of [...listings.entries()]) {
        if (l.plot === plot) {
          listings.delete(id);
          for (const peer of wss.clients) sendTo(peer, { t: 'unlist', id });
        }
      }
    }
    persistPlots();
    for (const peer of wss.clients) sendTo(peer, { t: 'plotRevoked', plot, prevOwner: key, reason: 'below_tier' });
    console.log(JSON.stringify({ t: 'plot_revoked', plot, owner: key, tier: info }));
  },
});

// Send one player their current server-computed entitlement snapshot.
const pushEntitlement = (ws, rec) => {
  // In live mode the entitlement identity is the session-verified wallet; a
  // connection without one has no key and reports unverified (tokens null).
  const key = claimKeyOf(rec);
  const s = key ? entitlements.snapshot(key) : { tokens: null, entitlement: 0, claimed: 0, verified: false };
  sendTo(ws, { t: 'entitlement', tokens: s.tokens, entitlement: s.entitlement, claimed: s.claimed, verified: s.verified, source: liveEntitlements() ? 'rpc' : demoHoldings.mode, wallet: rec.wallet || null });
};
const pushEntitlementByName = (name) => {
  // Matches by name (demo key) or wallet (live key). A display name is capped
  // at 12 chars and a Solana address is ~44, so the two cannot collide.
  for (const [peer, other] of players) if (!other.guest && (other.name === name || other.wallet === name)) pushEntitlement(peer, other);
};

// Lifetime fees earned (earnings-card chunk): one server-authoritative
// snapshot per player — the sum of their payout ledger records plus the
// per-cycle entries behind it. Delivered like the entitlement snapshot: on
// welcome and refreshed after every completed cycle. Payouts that happened
// before this feature are NOT backfilled into the Personal log (log entries
// start recording from this build onward), but the lifetime TOTAL is built
// from the full ledger the engine already persists.
const pushFeesEarned = (ws, rec) => {
  if (rec.guest) return; // guests have no earnings, and a name match must never leak a resident's ledger
  const snap = distributor.feesSnapshot(rec.name);
  sendTo(ws, { t: 'feesEarned', total: snap.total, entries: snap.entries, claimable: distributor.claimableOf(rec.name) });
};

// Payout claim (real-path chunk): async — in live mode the final step is a
// real on-chain SPL transfer (see server/payouts.mjs). The reply always
// carries the authoritative accrued balance either way.
async function handlePayoutClaim(ws, rec) {
  const res = await distributor.claim(rec.name, {
    sender: payoutSender,
    wallet: rec.wallet ?? null,
  });
  sendTo(ws, {
    t: 'payoutClaimResult',
    ok: res.ok === true,
    reason: res.reason ?? null,
    amount: res.amount ?? null,
    accrued: distributor.claimableOf(rec.name),
    signature: res.signature ?? null,
    ts: Date.now(),
  });
  pushFeesEarned(ws, rec); // refresh the card after any state change
}

// ── strict-mode upgrade payment (real SOL transaction verification) ────────
// The client submits the transaction signature of its SOL transfer to the
// treasury; the server verifies ON-CHAIN (correct recipient, exact amount,
// confirmed) and only then applies the upgrade. Idempotent by signature — a
// replayed or duplicate signature applies nothing. Every failure returns one
// generic rejection; the real reason is logged server-side only.
async function handleUpgradePay(ws, rec, msg) {
  const up = validateUpgradeRequest(rec, msg);
  if (!up) return;
  const mode = paymentMode();
  if (mode !== 'strict') {
    // dev/demo: complete without real transactions — the same server-side
    // state changes, no on-chain verification.
    // reported: the demo/dev client pays from its own demo wallet; the
    // settled label records the trust level ('dev' vs 'client').
    if (up.cost > 0) treasury.payUpgrade(rec.name, up.cost, { reported: true, settled: mode === 'dev' ? 'dev' : 'client' });
    up.plotRec.level = up.next;
    for (const peer of wss.clients) sendTo(peer, { t: 'upgrade', plot: up.plot, level: up.next });
    return;
  }
  const verdict = await upgradePayments.verify({ signature: msg.signature, expectedSol: up.cost, plot: up.plot, level: up.next });
  if (!verdict.ok) {
    console.log(JSON.stringify({ t: 'upgrade_payment_rejected', plot: up.plot, level: up.next, reason: verdict.reason }));
    sendTo(ws, { t: 'upgradeRejected', plot: up.plot, level: up.next, reason: 'payment_unverified' });
    return;
  }
  if (up.cost > 0) treasury.receiveUpgradeSol(rec.name, up.cost);
  up.plotRec.level = up.next;
  // broadcast to EVERYONE including the payer — in strict mode the payer
  // did not apply optimistically, so its client learns the upgrade here.
  for (const peer of wss.clients) sendTo(peer, { t: 'upgrade', plot: up.plot, level: up.next });
  console.log(JSON.stringify({ t: 'upgrade_paid', plot: up.plot, level: up.next, sol: up.cost, settled: 'onchain' }));
}

// ── plot claim (Chunk 6: server-side entitlement gate) ─────────────────────
// The claim relay now consults the entitlement engine BEFORE accepting a new
// claim or a market purchase: the buyer must be inside their verified tier.
// Conflict corrections and re-claims of one's own plot are not new claims and
// pass without a gate. Accepted claims are recorded server-side (LIFO order).
async function handleClaim(ws, rec, msg) {
  const plot = Number(msg.plot);
  if (!Number.isInteger(plot)) return;
  const name = String(msg.ownerName || 'Resident').slice(0, 12);
  const key = claimKeyOf(rec); // demo: the name; live: the session-verified wallet (null when unverified)
  const existing = plotOwners.get(plot);
  const prev = typeof msg.prev === 'string' ? String(msg.prev).slice(0, 12) : undefined;
  const type = BUILD_COSTS[msg.type] ? String(msg.type) : null;
  if (existing && existing.owner !== name) {
    const sale = [...listings.values()].find((l) => l.plot === plot && l.seller === existing.owner);
    if (prev && sale && prev === existing.owner) {
      // A purchase consumes one slot of the BUYER's entitlement.
      if (!key) {
        sendTo(ws, { t: 'claimDenied', plot, reason: 'holdings_unverified:wallet_required' });
        return;
      }
      const decision = await entitlements.canClaim(key);
      if (!decision.allowed) {
        sendTo(ws, { t: 'claimDenied', plot, reason: decision.reason, entitlement: decision.entitlement, claimed: decision.claimed });
        return;
      }
      entitlements.release(existing.ownerKey ?? existing.owner, plot); // the seller's slot frees up
      const price = sale.price;
      listings.delete(sale.id);
      existing.owner = name;
      existing.ownerKey = key; // the buyer's entitlement identity rides on the record
      houseStates.delete(plot); // the furniture left with the previous resident
      gardenPlots.delete(plot); // the garden left with the previous resident
      if (type) existing.type = type;
      entitlements.recordClaim(key, plot);
      persistPlots();
      for (const peer of wss.clients) {
        if (peer !== ws) sendTo(peer, { t: 'claim', plot, ...record(existing), prev, price });
      }
      // confirm to the buyer and drop the consumed listing everywhere
      sendTo(ws, { t: 'claim', plot, ...record(existing) });
      pushEntitlement(ws, rec);
      for (const peer of wss.clients) sendTo(peer, { t: 'unlist', id: sale.id });
      return;
    }
    // conflict: the first claim holds — correct the sender, never relay
    sendTo(ws, { t: 'claim', plot, ...record(existing) });
    return;
  }
  if (!existing) {
    // Fresh claim: gate it on the buyer's verified entitlement.
    if (!key) {
      sendTo(ws, { t: 'claimDenied', plot, reason: 'holdings_unverified:wallet_required' });
      return;
    }
    const decision = await entitlements.canClaim(key);
    if (!decision.allowed) {
      sendTo(ws, { t: 'claimDenied', plot, reason: decision.reason, entitlement: decision.entitlement, claimed: decision.claimed });
      return;
    }
    plotOwners.set(plot, { owner: name, ownerKey: key, type, progress: 0, done: false });
    houseStates.delete(plot);
    entitlements.recordClaim(key, plot);
    persistPlots();
  } else if (type && !existing.type) existing.type = type;
  broadcastExcept(ws, { t: 'claim', plot, ...record(plotOwners.get(plot)) });
  pushEntitlementByName(name);
}

// Verification sweep: on the configured cadence every player holding plots is
// re-verified against their holdings source. Below-tier holdings revoke the
// most recent plot ONLY after the two-successful-reads ≥30s guard (engine);
// a failed read revokes nothing. Each player's UI is updated right after.
setInterval(() => {
  (async () => {
    for (const key of entitlements.claimKeys()) {
      try {
        await entitlements.verify(key);
        pushEntitlementByName(key);
      } catch { /* one player's read failure must never break the sweep */ }
    }
  })();
}, ENTITLEMENT.verifyIntervalMs);

// Configuration prelude: kill switch / keypair / mint startup guard. Fails
// loudly (exits) when TREASURY_ENABLED=true but the operator setup is
// incomplete; logs the idle notice otherwise. Never logs key contents.
assertLiveConfig(console);

const sendTo = (ws, msg) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
};
const broadcastExcept = (ws, msg) => {
  for (const peer of wss.clients) if (peer !== ws) sendTo(peer, msg);
};
const topArcadeScores = () => [...arcadeScores.entries()].flatMap(([gameId, names]) => [...names.entries()].map(([name, score]) => ({ gameId, name, score }))).sort((a, b) => b.score - a.score).slice(0, 10);

// Shared server-side validation for both upgrade messages: the plot must be
// finished, owned by the sender or the Town Council, and the level step must
// be exactly +1 (max 4). The fee is ALWAYS quoted from the server's own table
// (UPGRADE_SOL) — the client never sends an amount.
function validateUpgradeRequest(rec, msg) {
  const plot = Number(msg.plot);
  const plotRec = plotOwners.get(plot);
  if (!plotRec || !plotRec.done) return null;
  if (plotRec.owner !== rec.name && plotRec.owner !== 'Town Council') return null;
  const next = Number(msg.level);
  if (!Number.isInteger(next) || next !== (plotRec.level || 1) + 1 || next > 4) return null;
  return { plot, plotRec, next, cost: UPGRADE_SOL[next - 2] };
}

wss.on('connection', (ws) => {
  // wallet is set ONLY through a session token issued by POST /api/auth/verify
  // after real Ed25519 verification — there is no other write path.
  const rec = { id: null, name: '', look: null, x: 0, z: 0, ry: 0, alive: true, wallet: null, guest: false, guestId: null, lastSeenAt: 0 };
  players.set(ws, rec);
  // heartbeat freshness is tracked on the CURRENT record of this socket, so
  // protocol pongs always land on the character actually holding the session
  ws.on('pong', () => { const r = players.get(ws); if (r) { r.alive = true; r.lastSeenAt = Date.now(); } });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const cur = players.get(ws);
    if (cur) cur.lastSeenAt = Date.now();

    if (msg.t === 'join') {
      if (rec.id) return; // a joined connection cannot re-join into a second identity
      // Wallet session binding (auth chunk) FIRST — the character lock keys on
      // the VERIFIED wallet identity, so binding must precede the lock check.
      if (typeof msg.session === 'string' && msg.session) {
        const session = sessions.get(msg.session);
        if (session && Date.now() - session.createdAt <= AUTH_SESSION_MS()) {
          rec.wallet = session.wallet;
          session.lastSeenAt = Date.now();
        }
      }
      // Guest binding: ONLY when no verified wallet bound. The id is server-
      // assigned; a returning guest (refresh) presents its token to re-adopt.
      let guestToken = null;
      if (!rec.wallet && msg.guest === true) {
        rec.guest = true;
        const known = typeof msg.guestSession === 'string' ? guestSessions.get(msg.guestSession) : null;
        if (known) { guestToken = msg.guestSession; rec.guestId = known.id; }
        else {
          guestToken = crypto.randomBytes(16).toString('hex');
          rec.guestId = `guest:${guestToken.slice(0, 16)}`;
          guestSessions.set(guestToken, { id: rec.guestId, createdAt: Date.now() });
          for (const [k, g] of guestSessions) if (Date.now() - g.createdAt > AUTH_SESSION_MS()) guestSessions.delete(k);
        }
      }
      const lockKey = lockKeyOf(rec);
      // One character per wallet. The lock keys ONLY on the session-verified
      // wallet: a duplicate tab of an ACTIVE session is refused with a clear
      // message; a refresh inside the grace window re-adopts the SAME
      // character; a holder silent beyond the heartbeat timeout is reclaimed
      // (never before the timeout).
      let adoptedFrom = null;
      if (lockKey) {
        const nowMs = Date.now();
        const existing = walletLocks.get(lockKey);
        if (existing && existing.ws !== ws) {
          if (existing.closedAt != null) {
            adoptedFrom = existing; // reconnect inside the grace window
          } else {
            const holderStale = existing.ws.readyState !== 1 || nowMs - (existing.rec.lastSeenAt || 0) > SESSION_HEARTBEAT_MS();
            if (!holderStale) {
              sendTo(ws, { t: 'sessionTaken', reason: (rec.wallet ? 'This wallet already has an active character in another tab or window.' : 'This guest session already has an active character in another tab or window.'), retryAfterMs: Math.max(0, SESSION_HEARTBEAT_MS() - (nowMs - (existing.rec.lastSeenAt || 0))) });
              setTimeout(() => { try { ws.close(); } catch { /* already closing */ } }, 100);
              return;
            }
            // Stale holder (crash, lost network): finalize the old session
            // now — after the heartbeat timeout, never before — then join.
            players.delete(existing.ws);
            arcadeRuns.delete(existing.ws);
            // A hand left open by the stale holder settles NOW (auto-stand,
            // dealer plays, audited) — never orphaned, never free-abandoned.
            blackjackTable.settleDisconnected(claimKeyOf(existing.rec), existing.rec.name);
            if (existing.rec.id) broadcastExcept(ws, { t: 'leave', id: existing.rec.id });
            walletLocks.delete(lockKey);
            try { existing.ws.terminate(); } catch { /* already gone */ }
          }
        }
      }
      if (adoptedFrom) {
        players.delete(adoptedFrom.ws);
        arcadeRuns.delete(adoptedFrom.ws);
        rec.id = adoptedFrom.rec.id; // same character, same identity — peers never saw it leave
      } else {
        rec.id = `p${nextPlayerId++}`;
      }
      rec.name = (typeof msg.name === 'string' ? msg.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12) : '') || (adoptedFrom ? adoptedFrom.rec.name : 'Resident');
      rec.look = msg.look ?? (adoptedFrom ? adoptedFrom.rec.look : null);
      rec.x = Number(msg.x) || (adoptedFrom ? adoptedFrom.rec.x : 0);
      rec.z = Number(msg.z) || (adoptedFrom ? adoptedFrom.rec.z : 0);
      if (adoptedFrom && Number.isFinite(Number(msg.ry))) rec.ry = Number(msg.ry);
      rec.lastSeenAt = Date.now();
      if (lockKey) walletLocks.set(lockKey, { ws, rec, closedAt: null });
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
              // never stomp a restored/owned plot (plot persistence fix)
              if (!plotOwners.has(Number(pid))) {
                plotOwners.set(Number(pid), { owner: 'Town Council', type: String(ctype), progress: cost, done: true, level: 1 });
              }
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
        persistPlots();
      }
      // tell the newcomer about everyone already here…
      const peers = [];
      for (const [, other] of players) {
        if (other !== rec && other.id) peers.push({ id: other.id, name: other.name, look: other.look, x: other.x, z: other.z, ry: other.ry });
      }
      // Plot records on the wire use the broadcast shape (ownerName), not the
      // raw storage shape (owner) — late joiners would otherwise lose the
      // owner name and show plots without their "Plot owned by X" label.
      if (!rec.guest) demoHoldings.seed(rec.name);
      // Chunk 6: the newcomer's demo holdings are seeded server-side and the
      // first verification pass lands their entitlement snapshot (claims gate
      // + UI) right after the welcome — verified, never a placeholder.
      const jk = claimKeyOf(rec);
      if (rec.guest) { /* guests carry no entitlement, fees or economy snapshot */ }
      else if (jk) entitlements.verify(jk).catch(() => { /* never block the welcome */ }).then(() => pushEntitlementByName(rec.name));
      else pushEntitlement(ws, rec); // live mode, unverified: report the unverified snapshot immediately
      if (!rec.guest) pushFeesEarned(ws, rec); // lifetime fees snapshot rides the welcome, like the entitlement
      sendTo(ws, { t: 'welcome', id: rec.id, wallet: rec.wallet || null, guest: rec.guest === true, ...(guestToken ? { guestSession: guestToken } : {}), peers, plots: [...plotOwners.entries()].map(([pid, r]) => [pid, record(r)]), listings: Array.from(listings.values()), houses: Array.from(houseStates.entries()), arcadeScores: topArcadeScores(), bj: blackjackTable.stateFor(claimKeyOf(rec), rec.name) });
      // …and everyone else about the newcomer. A re-adopted character is NOT
      // re-announced: every other client still holds that exact character id
      // (no leave was ever broadcast), so a second join would duplicate it.
      if (!adoptedFrom) broadcastExcept(ws, { t: 'join', player: { id: rec.id, name: rec.name, look: rec.look, x: rec.x, z: rec.z, ry: rec.ry } });
      return;
    }

    if (!rec.id) return; // ignore anything until the player has joined

    // Server-side wallet gate: every economic message needs an authenticated
    // wallet session. Rejected BEFORE any handler can read a name, balance or
    // plot record, with an explicit reason the client shows to the player.
    if (ECONOMY_MSGS.has(msg.t) && economyBlocked(rec)) {
      sendTo(ws, { t: 'economyDenied', action: msg.t, reason: 'connect_wallet', message: 'Connect a wallet to play — guests can walk, fish and explore only.' });
      return;
    }

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

    // ── casino blackjack (casino chunk) ─────────────────────────────────────
    // The client sends only intent (bet amount / hit / stand). Cards, values,
    // results, balances and settlements are computed and held HERE; every
    // reply carries the authoritative table state. A rejected action still
    // returns the current state so the client can never diverge.
    if (msg.t === 'bjBet' || msg.t === 'bjHit' || msg.t === 'bjStand') {
      const key = claimKeyOf(rec);
      const res = msg.t === 'bjBet'
        ? blackjackTable.bet(key, rec.name, Number(msg.bet))
        : msg.t === 'bjHit'
          ? blackjackTable.hit(key, rec.name)
          : blackjackTable.stand(key, rec.name);
      const state = res.state ?? blackjackTable.stateFor(key, rec.name);
      // state is spread FIRST: its blanket ok:true must never mask the
      // action's own acceptance flag or rejection reason.
      sendTo(ws, { t: 'bj', ...state, ok: res.ok === true, reason: res.reason ?? null });
      return;
    }

    // plot ownership — first claim wins; a transfer (prev) is honoured only
    // when the current owner has this exact plot listed for sale on this server.
    // (Chunk 6: the handler lives above — it gates every new claim and every
    // market purchase on the player's verified entitlement before relaying,
    // and records accepted claims server-side in LIFO claim order.)
    if (msg.t === 'claim') {
      // remember the in-flight gate check: a build update that follows the
      // claim immediately (one-step presets) must wait for the record to exist
      const pending = handleClaim(ws, rec, msg).catch(() => { /* a failed gate check never crashes the socket */ });
      rec.claimPending = pending;
      pending.finally(() => { if (rec.claimPending === pending) rec.claimPending = null; });
      return;
    }

    // fee-payout claim (real-path chunk): an async on-chain transfer in live
    // mode; always replies with the authoritative balance either way
    if (msg.t === 'feesClaim') {
      handlePayoutClaim(ws, rec).catch(() => { /* a failed claim never crashes the socket */ });
      return;
    }

    // construction progress on the sender's own plot — validated and relayed
    if (msg.t === 'build') {
      const apply = () => {
        const plot = Number(msg.plot);
        const plotRec = plotOwners.get(plot);
        if (!plotRec || plotRec.owner !== rec.name) return;
        // the building type may be chosen after the claim, so the first build
        // update that names one fills it in for everyone
        if (!plotRec.type && typeof msg.type === 'string' && BUILD_COSTS[msg.type]) plotRec.type = String(msg.type);
        const cost = plotRec.type ? BUILD_COSTS[plotRec.type] : 0;
        const progress = Math.max(0, Math.min(cost || 9_999, Math.floor(Number(msg.progress) || 0)));
        plotRec.progress = progress;
        plotRec.done = cost > 0 ? progress >= cost : msg.done === true;
        persistPlots();
        broadcastExcept(ws, { t: 'build', plot, progress: plotRec.progress, done: plotRec.done, type: plotRec.type });
      };
      // a build update sent right behind its claim waits for the claim gate
      if (rec.claimPending) rec.claimPending.then(apply); else apply();
      return;
    }

    // building upgrades on the sender's own plot or a Town Council community
    // building. The server validates the level step and quotes the fee itself;
    // how the payment settles depends on the payment mode (see paymentMode):
    //   dev/demo — the client's relay settles the demo fee, exactly as before
    //              (ledgered 'dev' / 'client').
    //   strict   — a client claim alone applies NOTHING. The server returns a
    //              quote (exact fee + treasury address); only `upgradePay`
    //              with an on-chain-verified SOL transaction applies it.
    if (msg.t === 'upgrade') {
      const up = validateUpgradeRequest(rec, msg);
      if (!up) {
        // Production-readiness: the client applies its own upgrade optimistically,
        // so a silent server rejection would leave its displayed level diverged
        // from the server's authoritative record. The sender always gets an
        // explicit rejection (the client reverts its local level and demo SOL).
        sendTo(ws, { t: 'upgradeRejected', plot: Number(msg.plot) || 0, level: Math.max(1, Number(msg.level) || 1), reason: 'invalid' });
        return;
      }
      const mode = paymentMode();
      if (mode === 'strict') {
        sendTo(ws, { t: 'upgradeQuote', plot: up.plot, level: up.next, sol: up.cost, treasury: ONCHAIN.treasuryWalletAddress });
        return;
      }
      // reported: the demo/dev client pays from its own demo wallet; the
      // settled label records the trust level ('dev' vs 'client').
      if (up.cost > 0) treasury.payUpgrade(rec.name, up.cost, { reported: true, settled: mode === 'dev' ? 'dev' : 'client' });
      up.plotRec.level = up.next;
      persistPlots();
      broadcastExcept(ws, { t: 'upgrade', plot: up.plot, level: up.next });
      return;
    }

    // The strict-mode payment step (async — an RPC read): see handleUpgradePay.
    if (msg.t === 'upgradePay') {
      handleUpgradePay(ws, rec, msg).catch(() => { /* a failed verification never crashes the socket */ });
      return;
    }

    // Shop / furniture purchase recycling (Chunk T2): the client reports the
    // purchased item ID after debiting its own demo wallet; the server
    // re-prices it against the authoritative table (never trusting a
    // client-sent amount) and routes the proceeds to the treasury.
    if (msg.t === 'shopPurchase' || msg.t === 'furniturePurchase') {
      const table = msg.t === 'shopPurchase' ? SHOP_PRICES : FURNITURE_PRICES;
      const amount = table[String(msg.item || '')];
      if (Number.isFinite(amount) && amount > 0) {
        const res = treasury.payShop(rec.name, amount, { reported: true });
        // Garden Kits become server-tracked inventory on purchase; they only
        // earn the ×1.2 weight once PLACED on an owned plot (gardenPlace).
        if (res.ok && msg.t === 'shopPurchase' && String(msg.item) === 'garden') {
          gardenKits.set(rec.name, (gardenKits.get(rec.name) ?? 0) + 1);
        }
        if (res.ok && msg.t === 'shopPurchase' && String(msg.item) === 'permit') {
          permits.set(rec.name, Math.min(ENTITLEMENT.maxPlots, (permits.get(rec.name) ?? 0) + 1));
        }
      }
      return;
    }

    // place one of my unplaced Garden Kits on one of my plots — the SERVER
    // decides eligibility for the ×1.2 weight, not the client's garden list
    if (msg.t === 'gardenPlace') {
      const plot = Number(msg.plot);
      const plotRec = plotOwners.get(plot);
      if (!plotRec || plotRec.owner !== rec.name) return;
      if ((gardenKits.get(rec.name) ?? 0) <= 0 || gardenPlots.get(plot)) return;
      gardenKits.set(rec.name, (gardenKits.get(rec.name) ?? 0) - 1);
      gardenPlots.set(plot, true);
      persistPlots();
      sendTo(ws, { t: 'gardenAck', plot, placed: true });
      return;
    }

    // pick a placed kit back up (returns it to inventory; weight ends at once)
    if (msg.t === 'gardenUnplace') {
      const plot = Number(msg.plot);
      const plotRec = plotOwners.get(plot);
      if (!plotRec || plotRec.owner !== rec.name || !gardenPlots.get(plot)) return;
      gardenPlots.delete(plot);
      gardenKits.set(rec.name, (gardenKits.get(rec.name) ?? 0) + 1);
      persistPlots();
      sendTo(ws, { t: 'gardenAck', plot, placed: false });
      return;
    }

    // Capped server-side balance deposits: lets a name fund its server-side
    // ledger so purchases/upgrades can be debited server-side when funded.
    if (msg.t === 'walletDeposit') {
      // Production-readiness gate: a client message that CLAIMS a balance is
      // never accepted in production. This faucet exists only for the dev/test
      // suites (which spawn the server with BV_ALLOW_DEMO_DEPOSITS=1); any
      // other start — including the production deployment — drops the message
      // before it can touch a balance, so no client can mint server-side credit.
      if (process.env.BV_ALLOW_DEMO_DEPOSITS !== '1') return;
      const tokens = Math.floor(Number(msg.tokens)) || 0;
      const sol = Number(msg.sol) || 0;
      if (tokens > 0 || sol > 0) treasury.deposit(rec.name, { tokens, sol });
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
    if (players.get(ws) !== rec) return; // the character was re-adopted by a newer session — not ours to remove
    const lock = lockKeyOf(rec) ? walletLocks.get(lockKeyOf(rec)) : null;
    if (lock && lock.ws === ws && lock.closedAt == null) {
      // Clean close of the ACTIVE session: hold the character in grace for a
      // short window so a refresh re-adopts the same character with no
      // leave/join flicker and no duplicate. The sweep finalizes if nobody
      // returns inside the window.
      lock.closedAt = Date.now();
      arcadeRuns.delete(ws);
      // An open blackjack hand SURVIVES the grace window — a refresh re-adopts
      // the same character and continues the same hand (same claim key). The
      // sweep settles it if nobody returns before the window closes.
      return;
    }
    players.delete(ws);
    arcadeRuns.delete(ws);
    blackjackTable.settleDisconnected(claimKeyOf(rec), rec.name); // no grace path: settle immediately
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
  const npcPlotCount = () => [...plotOwners.values()].filter((r) => isNpcName(r.owner)).length;

  // NPC claims a free plot, fully built (as the old client-side sim did)
  if (Math.random() < MARKET.simClaimChance && npcPlotCount() < MARKET.maxNpcPlots) {
    const free = [...plotIds].filter((id) => !plotOwners.has(id));
    if (free.length) {
      const plot = pick(free);
      const type = pick(Object.keys(BUILD_COSTS));
      const pool = npcNames();
      const name = pick(pool.length ? pool : RESIDENTS);
      plotOwners.set(plot, { owner: name, type, progress: BUILD_COSTS[type], done: true });
      persistPlots();
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
    // NPC buyers never push the combined NPC total past the cap: at the cap
    // they only buy from other NPCs (ownership just moves between them).
    const atCap = npcPlotCount() >= MARKET.maxNpcPlots;
    const eligible = [...listings.values()].filter((x) => !atCap || isNpcName(plotOwners.get(x.plot)?.owner));
    if (!eligible.length) return;
    const l = pick(eligible);
    listings.delete(l.id);
    const rec = plotOwners.get(l.plot);
    const pool = RESIDENTS.filter((n) => n !== l.seller && !connected.has(n));
    const newOwner = pick(pool.length ? pool : RESIDENTS.filter((n) => n !== l.seller));
    // starter listings are fake "Resident X" sellers over Town Council plots: the buyer really takes the plot, and it counts toward the NPC cap
    const starter = rec && rec.owner === 'Town Council' && /^Resident [A-Z]$/.test(l.seller);
    // when the seller was a real player, their entitlement slot frees up for the NPC purchase too (Chunk 6)
    if (rec && rec.owner === l.seller) entitlements.release(l.seller, l.plot);
    if (rec && (rec.owner === l.seller || starter)) { rec.owner = newOwner; houseStates.delete(l.plot); }
    if (rec && (rec.owner === l.seller || starter)) gardenPlots.delete(l.plot);
    persistPlots();
    for (const peer of wss.clients) sendTo(peer, { t: 'simBuy', id: l.id, plot: l.plot, ownerName: newOwner, sellerName: l.seller, price: l.price });
  }
}, MARKET.tickMs).unref();

// ── treasury cycle boundary (Chunk T2) ─────────────────────────────────────
// Every 5 minutes: ledger fee intake, then — ONLY when the kill switch is on
// and the operator setup is complete — sweep the gas reserve and run the
// buyback swap. The weighted payout engine (Chunk T3) joins this boundary:
// it runs every cycle (its payouts are claimable INTERNAL balances, not
// on-chain transactions), so the engine stays exercised in dry-run mode.
// Real-path chunk: the live intake is the RPC-polling fee listener; the
// SIMULATED drip stays default-off (BV_FEE_SIM_SOL=positive) and NEVER runs
// while the treasury is live. The cycle boundary is awaited — the real swap
// client is asynchronous (the mock's sync return awaits transparently).
setInterval(async () => {
  if (INTAKE.simFeeSolPerTick > 0 && !treasuryLiveState().live) treasury.recordFees(INTAKE.simFeeSolPerTick);
  if (treasuryLiveState().live) await treasury.onCycleBoundary(swapVenue);
  else treasury.logIdle();
  const res = distributor.runCycle(Date.now());
  if (res.ok && Array.isArray(res.recipients)) {
    for (const r of res.recipients) {
      for (const [peer, pr] of players) {
        if (!pr.guest && pr.name === r.name) {
          sendTo(peer, { t: 'treasuryPayout', cycle: res.cycle, amount: r.amount, weight: r.weight, totalPoints: res.totalPoints, accrued: distributor.claimableOf(r.name), paidTotal: res.paid, ts: Date.now() });
        }
      }
    }
    // every connected player gets their OWN authoritative fees snapshot
    // refreshed after the cycle — recipients and non-recipients alike, so the
    // earnings card always mirrors the ledger exactly.
    for (const [peer, pr] of players) pushFeesEarned(peer, pr);
    for (const peer of wss.clients) {
      sendTo(peer, { t: 'treasuryCycle', cycle: res.cycle, balanceBefore: res.balance, balanceAfter: res.balance - res.paid, distributable: res.distributable, paid: res.paid, remainder: res.remainder, totalPoints: res.totalPoints });
    }
  }
}, CYCLE.intervalMs).unref();

// heartbeat — drop dead sockets so no ghost players linger
setInterval(() => {
  for (const ws of wss.clients) {
    const rec = players.get(ws);
    if (rec && !rec.alive) { ws.terminate(); continue; }
    if (rec) rec.alive = false;
    try { ws.ping(); } catch { /* socket died between ping and terminate */ }
  }
}, 30_000).unref();

// character-lock sweep — pings every active holder (so a live connection
// stays fresh even when idle) and finalizes: (a) grace expiries after a clean
// close, and (b) holders silent beyond the heartbeat timeout (unclean drop,
// crash, lost network). Reclaim happens AFTER the timeout, never before.
setInterval(() => {
  const nowMs = Date.now();
  for (const [wallet, lock] of walletLocks) {
    if (lock.closedAt == null && lock.ws.readyState === 1) {
      try { lock.ws.ping(); } catch { /* socket died between ping and terminate */ }
    }
    const expired = lock.closedAt != null
      ? nowMs - lock.closedAt > SESSION_GRACE_MS()
      : lock.ws.readyState !== 1 || (lock.rec.id && nowMs - (lock.rec.lastSeenAt || 0) > SESSION_HEARTBEAT_MS());
    if (!expired) continue;
    if (players.get(lock.ws) === lock.rec) {
      players.delete(lock.ws);
      blackjackTable.settleDisconnected(claimKeyOf(lock.rec), lock.rec.name);
      if (lock.rec.id) broadcastExcept(lock.ws, { t: 'leave', id: lock.rec.id });
    }
    walletLocks.delete(wallet);
    try { lock.ws.terminate(); } catch { /* already gone */ }
  }
}, SESSION_SWEEP_MS()).unref();

server.listen(PORT, () => {
  console.log(`Blockville backend scaffold listening on http://localhost:${PORT}`);
});
