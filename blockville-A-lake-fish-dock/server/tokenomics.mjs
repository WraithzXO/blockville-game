// ── Blockville tokenomics — the single backend source of truth ──────────────
// Every treasury / fee-distribution value lives here. Nothing below may be
// hardcoded elsewhere; the payout engine (Chunk T3) and the intake/recycling
// path (Chunk T2) read this file and nothing else.
//
// Plot score: P = (20 + B) × U × G
//   B = construction blocks required for the building (from BUILD_BLOCKS)
//   U = upgrade multiplier for the plot's level (1..4)
//   G = Garden Kit multiplier (1.0, or 1.2 when a kit is actually placed)
// Only owned plots with a COMPLETED building earn points. NPCs earn nothing,
// ever — no flag, no share, no config switch.

// Construction blocks per building type. Must match the canonical costs the
// server enforces for construction (server/index.mjs BUILD_COSTS); a unit test
// cross-checks the two so they cannot drift apart.
export const BUILD_BLOCKS = {
  park: 25, shop: 30, cafe: 35, bakery: 40, mine: 45,
  house: 48, arcade: 55, casino: 60, bank: 75,
};

// Points for the plot itself, before building blocks.
export const BASE_PLOT_POINTS = 20;

// Upgrade multiplier by level (index = level - 1). Level 4 is the max.
export const UPGRADE_MULT = [1, 1.5, 2.25, 3.5];
export const MAX_LEVEL = 4;

// Garden Kit: ×1.20 — and only when the kit is actually placed on the plot.
// A purchased-but-unplaced kit earns nothing.
export const GARDEN_MULT = 1.2;

// ── Cycle parameters ──
export const CYCLE = {
  // distribution every 5 minutes. BV_CYCLE_MS is an operator/test hook that
  // shortens the interval ONLY (floored at 1s); production stays on 5 minutes.
  intervalMs: Math.max(1_000, Number(process.env.BV_CYCLE_MS) || 5 * 60 * 1000),
  distributePct: 0.20,         // 20% of treasury token holdings per cycle
  // Near-zero rule (Chunk T4): when the distributable amount falls below
  // this many whole tokens the cycle is SKIPPED and logged — moving dust
  // around serves nobody and burns cycle ids. Config, not hardcoded.
  minDistributableTokens: 1,
};

// ── Fee intake split (AMENDED: of SOL actually RECEIVED per cycle) ──
// All fee-share percentages are relative to the SOL the treasury wallet
// actually RECEIVES per cycle, not to global Pump.fun fees. Of received
// funds: 80% to buyback, 20% to the gas reserve. (Equivalent to 60%/15% of
// total fees when Pump.fun routes 75% to the treasury — the 25% remainder
// simply never arrives here, so it is never accounted.)
export const FEES = {
  buybackPct: 0.80,            // 80% of RECEIVED SOL → buyback
  gasReservePct: 0.20,         // 20% of RECEIVED SOL → SOL gas reserve
  gasSweepThresholdSol: 0.5,   // when the reserve ≥ 0.5 SOL…
  gasSweepFraction: 0.5,       // …sweep exactly half into that cycle's buyback
};

// ── Eligibility ──
// A plot earns points only when ALL of these hold:
//   - it has an owner (server-authoritative record),
//   - a building type is set,
//   - construction is complete (done),
//   - the owner is a real player, not an NPC.
// Anything else in the economy — Speed Boots, Builder's Toolkit, Claim
// Permits, cosmetics and furniture — is not a plot and earns nothing by
// construction: the weight engine only ever sums eligible plot records.
export const ELIGIBILITY = {
  requireOwner: true,
  requireBuildingType: true,
  requireComplete: true,
};

// NPCs are placeholders only. Excluded from payouts UNCONDITIONALLY — no
// config flag, no share, ever. 100% of every distribution goes to real
// player plots. Mirrors the server's resident/market-sim identity rules
// (named residents + "Resident A".."Resident Z"); cross-checked by test.
export const NPCS = {
  excluded: true, // documentation flag only — the predicate below is absolute
};

import fsSync from 'node:fs';

const NPC_NAMES = ['Nova', 'Rex', 'Momo', 'Vega', 'Juno', 'Pixel', 'Town Council'];
export const isNpcOwner = (name) =>
  NPC_NAMES.includes(String(name)) || /^Resident [A-Z]$/.test(String(name));

// ── Treasury recycling rules ──
// Everything players pay in the shops and for building upgrades flows back
// into the treasury to be redistributed. $BLOCKVILLE-denominated payments
// credit treasury token holdings directly (next cycle); SOL-denominated
// payments route through the buyback swap first (Chunk T2).
export const RECYCLING = {
  shopPct: 100,      // % of every shop purchase → treasury
  upgradePct: 100,   // % of every building upgrade payment → treasury
};

// ── Pure scoring helpers (used by the T3 payout engine) ──

// Score for one plot record: { owner, type, progress, done, level, garden }.
// Returns 0 for anything ineligible — unowned, unbuilt, unfinished,
// unknown type, or NPC-owned.
export function plotScore(plot) {
  if (!plot || typeof plot !== 'object') return 0;
  if (ELIGIBILITY.requireOwner && !plot.owner) return 0;
  if (isNpcOwner(plot.owner)) return 0; // unconditional, checked first-hand
  const blocks = BUILD_BLOCKS[plot.type];
  if (ELIGIBILITY.requireBuildingType && blocks == null) return 0;
  if (ELIGIBILITY.requireComplete && !plot.done) return 0;
  const level = Math.min(Math.max(plot.level ?? 1, 1), MAX_LEVEL);
  const U = UPGRADE_MULT[level - 1] ?? UPGRADE_MULT[0];
  const G = plot.garden === true ? GARDEN_MULT : 1;
  return (BASE_PLOT_POINTS + blocks) * U * G;
}

// Weights per player: sum of their eligible plot scores. NPCs never appear —
// their plots score 0 and are dropped from the recipient list entirely.
export function playerWeights(plots) {
  const weights = new Map();
  for (const plot of plots) {
    const p = plotScore(plot);
    if (p <= 0) continue;
    weights.set(plot.owner, (weights.get(plot.owner) ?? 0) + p);
  }
  return weights;
}

// ── Chunk T2 — upgrade payments, swap, intake and wallet parameters ─────────

// SOL cost per upgrade tier (L1→L2, L2→L3, L3→L4). Must match
// src/game/config.ts `upgrades.solCosts`; a unit test cross-checks the two.
export const UPGRADE_SOL = [0.1, 0.25, 0.5];

// Buyback swap guards. The venue is MOCKED while the treasury is idle and
// becomes the REAL Jupiter client when the treasury runs live. The minimum
// out is DYNAMIC: computed at swap time from the LIVE spot quote as
//   minOut = spotOut × (1 − slippageBps / 10_000)
// There is NO static token-price constant in the swap path — nothing here
// goes stale when the market moves. A breach rolls the FULL pending amount
// (including any gas sweep) into the next cycle; a broken DATA FEED
// (unreachable venue, absurd deviation vs the previous successful swap)
// is ledgered distinctly as `swap_stale_quote`.
export const SWAP = {
  maxSlippagePct: 0.03,            // existing hard slippage cap: 3% vs spot (unchanged)
  // Slippage tolerance for the DYNAMIC minimum-out, in basis points
  // (300 bps = 3%). Env override: BV_SLIPPAGE_BPS.
  slippageBps: Math.max(1, Number(process.env.BV_SLIPPAGE_BPS) || 300),
  // Sanity floor: refuse a live quote that deviates from the previous
  // successful swap's spot by more than this factor either way — that is a
  // broken data feed, not a price move. Env override: BV_SWAP_QUOTE_MAX_DEVIATION.
  staleQuoteMaxDeviation: Math.max(1, Number(process.env.BV_SWAP_QUOTE_MAX_DEVIATION) || 10),
  staleQuoteLedgerKind: 'swap_stale_quote', // distinct ledger kind for feed breakage
  mockTokensPerSol: Number(process.env.BV_SWAP_MOCK_PRICE) || 2_000_000,
  // Real-path chunk — venue selection. 'auto' (the default): Jupiter when the
  // treasury runs live, mock otherwise. Explicit values override: 'jupiter'
  // forces the real client, 'mock' keeps tests/dev on the mock venue.
  venueEnv: 'BV_SWAP_VENUE',        // auto | jupiter | mock
  jupiterApiEnv: 'BV_JUPITER_API_URL', // public quote-api.jup.ag/v6 — no key, no account
  defaultJupiterApiUrl: 'https://quote-api.jup.ag/v6',
  swapStatePathEnv: 'BV_TREASURY_SWAP_STATE', // pending-swap signature state (double-spend guard)
};

// Fee intake. Real-path chunk: the live treasury is fed by the incoming-SOL
// listener (server/fees.mjs, public-RPC polling — webhooks are not permitted).
// The SIMULATED drip is now DEFAULT-OFF and only runs in dev when explicitly
// enabled (BV_FEE_SIM_SOL=0.02 or any positive value); it never runs while
// the treasury is live.
export const INTAKE = {
  simFeeSolPerTick: process.env.BV_FEE_SIM_SOL !== undefined
    ? Number(process.env.BV_FEE_SIM_SOL) || 0
    : 0,
  // Real intake listener knobs.
  pollMsEnv: 'BV_FEE_POLL_MS',       // poll interval (backoff widens on RPC failure)
  defaultPollMs: 30_000,
  cursorPathEnv: 'BV_FEE_CURSOR_PATH', // persisted last-processed-signature cursor
  walletAddressEnv: 'TREASURY_WALLET_ADDRESS', // overrides ONCHAIN.treasuryWalletAddress
};

// Server-side balance deposits. The demo wallet still lives client-side
// (T0 audit), so these caps bound how much a name can fund its server-side
// ledger for — the debit path for purchases/upgrades when funded. Raise the
// caps (or replace deposits entirely) when real wallets land.
export const DEPOSIT_CAPS = {
  maxTokensPerDeposit: Number(process.env.BV_DEPOSIT_MAX_TOKENS) || 50_000,
  maxTokensLifetime: Number(process.env.BV_DEPOSIT_LIFETIME_TOKENS) || 200_000,
  maxSolPerDeposit: Number(process.env.BV_DEPOSIT_MAX_SOL) || 5,
  maxSolLifetime: Number(process.env.BV_DEPOSIT_LIFETIME_SOL) || 20,
};

// ── Casino blackjack (casino chunk) ─────────────────────────────────────────
// The table is server-authoritative: cards, results and settlements live only
// here. Bets are denominated in $BLOCKVILLE and drawn from the player's
// SERVER-SIDE ledger balance (never a client-reported wallet). Before a bet
// is accepted the treasury must be able to cover the LARGEST possible payout
// (a natural's 3:2 = 1.5× the bet) on top of every already-open hand.
export const BLACKJACK = {
  minBet: 1,
  maxBet: 5_000,
  decks: 6,
  reshuffleBelow: 60,        // cards left in the shoe before a fresh shuffle
  naturalPayout: 1.5,        // 3:2 for a natural blackjack
  winPayout: 1,              // 1:1 for an ordinary win
  treasuryReserveMult: 1.5,  // worst-case treasury payout per open bet
};

// ── Plot entitlement (Chunk 6: holding-based eligibility) ──────────────────
// Staking is gone. A player's plot entitlement is floor(verified holdings /
// tokensPerPlot), capped at maxPlots — holdings, not staked amounts. The
// server is the only authority on holdings: in live mode they are read from
// the player's verified Solana wallet via public RPC (token balance of
// BLOCKVILLE_MINT); until the mint is configured the DEMO reader hands every
// player the seeded demo holding below (simulated, server-side, documented —
// it keeps the demo playable exactly as the old demo staking did, without
// trusting any client-reported balance).
export const ENTITLEMENT = {
  tokensPerPlot: Number(process.env.BV_TOKENS_PER_PLOT) || 20_000,   // $BLOCKVILLE HELD per claimable plot
  maxPlots: Number(process.env.BV_MAX_PLOTS) || 5,                   // hard cap
  readCacheMs: Number(process.env.BV_HOLDINGS_CACHE_MS) || 45_000,   // brief holdings cache (30–60s allowed)
  verifyIntervalMs: Number(process.env.BV_ENTITLEMENT_VERIFY_MS) || 30_000, // server verification sweep cadence
  guardReads: 2,                                                     // consecutive successful below-tier reads…
  guardGapMs: Number(process.env.BV_ENTITLEMENT_GUARD_MS) || 30_000, // …separated by at least this before a revoke
  demoSeedTokens: Number(process.env.BV_DEMO_SEED_TOKENS) || 100_000, // demo-mode holding per player (full 5-plot tier)
};

// Authoritative shop pricing (server mirror of the client Store). The client
// reports an item ID after its own purchase; the server re-prices it against
// this table and never trusts a client-sent amount. Cross-checked by test
// against src/game/config.ts STORE_ITEMS (incl. the Garden Kit at
// CONFIG.garden.price) so the two cannot drift.
export const SHOP_PRICES = {
  boots: 2500, toolkit: 3500, permit: 150_000,
  tophat: 750, crown: 100_000, party: 400, headphones: 900, horns: 1200,
  halo: 1500, cowboy: 2200, wizard: 3000, shades: 900, visor: 1500,
  moonshirt: 1200, whaleshirt: 1800, apeshirt: 1800, brickshirt: 2100,
  sunsetshirt: 2400, bench: 850, lamp: 1250, planter: 650, mailbox: 700,
  statue: 2200, fence: 500, garden: 1500,
};

// Authoritative furniture pricing (mirror of FURNITURE_DEFS; cross-checked
// by test). Furniture proceeds recycle into the treasury like every other
// shop purchase.
export const FURNITURE_PRICES = {
  'oak-bed': 3200, 'sky-bed': 5200, 'block-chair': 900, 'velvet-chair': 1500,
  worktable: 1800, 'neon-table': 2600, 'sun-rug': 1100, 'berry-rug': 1300,
  'town-painting': 1400, 'sunset-painting': 1900, plant: 700, trophy: 2400,
};

// Wallet separation (documentation + env names; no on-chain code exists yet).
// HOT: dedicated wallet the server would use for swaps, gas and payouts —
// holds only the current cycle's gas reserve and pending buyback float.
// COLD: the treasury's primary wallet — long-term holdings are swept here
// periodically and its key must NEVER live on the server or in chat.
export const WALLET = {
  hotWalletEnv: 'BV_HOT_WALLET',
  coldWalletEnv: 'BV_COLD_WALLET',
};

// ── Configuration prelude — treasury wallet & kill switch ──────────────────
// ONE wallet is fee receiver, gas-reserve holder, buyback executor and
// payout source. Its PUBLIC address lives here; the private key NEVER enters
// chat, code, the repo or git — the operator places the keypair file on the
// VPS out-of-band (see README note in the T3 report). Until
// TREASURY_ENABLED=true AND BLOCKVILLE_MINT is set AND the keypair file
// exists with restrictive permissions, the system idles safely: fee
// detection is ledgered, zero on-chain transactions are executed.
export const ONCHAIN = {
  treasuryWalletAddress: '7LdsU9GwPgTpK3u8t5LDkGoQtHNSB4JohDTeto6DdBQu',
  enabledEnv: 'TREASURY_ENABLED',
  keypairPathEnv: 'TREASURY_KEYPAIR_PATH',
  mintEnv: 'BLOCKVILLE_MINT',
  rpcUrlEnv: 'TREASURY_RPC_URL',        // read-only public RPC only — no API keys, no signing
  maxKeypairMode: 0o600,                // file must be owner-read/write only (or stricter)
  // Read-only Solana RPC (Chunk 5 treasury holdings display). Public endpoint
  // fallback — override with TREASURY_RPC_URL for a reliable provider. Both
  // are pure READS of the public treasury address: no keys, no signing.
  defaultRpcUrl: 'https://api.mainnet-beta.solana.com',
  tokenProgramId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  holdingsMinRefetchMs: 5000,           // server caps on-chain reads at 1 per 5s; clients poll at 10s
};

function envStr(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

// The address the fee listener watches and the swap/claim paths operate on:
// operator override wins, otherwise the canonical treasury wallet.
export function treasuryWalletAddress() {
  return envStr(INTAKE.walletAddressEnv) || ONCHAIN.treasuryWalletAddress;
}

// Kill switch + readiness, evaluated at call time (never cached at import,
// so tests and the operator can flip env vars without a restart race).
export function treasuryLiveState(now = Date.now()) {
  const enabled = process.env[ONCHAIN.enabledEnv] === 'true';
  const keypairPath = envStr(ONCHAIN.keypairPathEnv);
  const mint = envStr(ONCHAIN.mintEnv);
  const rpcUrl = envStr(ONCHAIN.rpcUrlEnv);
  let keypair = null;
  if (keypairPath) {
    try {
      const st = fsSync.statSync(keypairPath);
      keypair = { path: keypairPath, mode: st.mode & 0o777, ok: st.isFile() && (st.mode & 0o777) <= ONCHAIN.maxKeypairMode };
    } catch { keypair = { path: keypairPath, mode: null, ok: false }; }
  }
  return { enabled, keypairPath, mint, rpcUrl, keypair, live: enabled && !!mint && !!keypair?.ok };
}

// Startup guard: fail LOUDLY (process exit) when the kill switch is on but
// the operator setup is incomplete — while never logging key contents or any
// secret beyond the public treasury address and the configured paths.
// `exit` is injectable so tests can prove the loud failure without dying.
export function assertLiveConfig(log = console, { exit = (code) => process.exit(code) } = {}) {
  const st = treasuryLiveState();
  if (!st.enabled) {
    log.log(`[treasury] KILL SWITCH OFF (${ONCHAIN.enabledEnv}!=true) — fee detection will be ledgered, ZERO on-chain transactions will execute. Treasury wallet ${ONCHAIN.treasuryWalletAddress}.`);
    return st;
  }
  const problems = [];
  if (!st.mint) problems.push(`${ONCHAIN.mintEnv} is not set`);
  if (!st.keypairPath) problems.push(`${ONCHAIN.keypairPathEnv} is not set`);
  else if (!st.keypair?.ok) {
    if (st.keypair.mode == null) problems.push(`keypair file not found at ${st.keypairPath}`);
    else problems.push(`keypair file ${st.keypairPath} has mode ${st.keypair.mode.toString(8)} — must be ${ONCHAIN.maxKeypairMode.toString(8)} or stricter`);
  }
  if (problems.length) {
    log.error(`[treasury] REFUSING TO START LIVE: ${problems.join('; ')}. Fix the environment and restart. Treasury wallet ${ONCHAIN.treasuryWalletAddress}.`);
    exit(1);
  }
  log.log(`[treasury] LIVE. Treasury wallet ${st.mint ? st.mint : ''} configured; keypair accepted at ${st.keypairPath} (mode ${st.keypair.mode.toString(8)}).`);
  return st;
}
