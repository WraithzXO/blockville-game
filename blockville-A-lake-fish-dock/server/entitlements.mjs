// ── Chunk 6: holding-based plot entitlement with strict tier enforcement ───
// Staking is gone. A player may hold plots up to
//   entitlement = floor(verified holdings / ENTITLEMENT.tokensPerPlot),
// capped at ENTITLEMENT.maxPlots — HELD tokens, never client-reported ones.
//
// Holdings sources (injectable `readHoldings(key)`):
//   • Live: createRpcHoldingsReader() — the player's VERIFIED wallet address,
//     token balance of BLOCKVILLE_MINT via public RPC (read-only, no keys).
//   • Demo (no mint configured): createDemoHoldings() — a server-side
//     simulated holding per player (seeded, never client-reported).
//
// Strict tier enforcement: when verified holdings drop below the claimed
// tier, the MOST RECENTLY claimed plot (LIFO) is revoked server-side and
// becomes claimable again immediately. Multi-tier drops revoke one plot per
// verification pass, most recent first. Revocation NEVER runs on unknown
// data: it requires ENTITLEMENT.guardReads consecutive SUCCESSFUL below-tier
// reads separated by at least ENTITLEMENT.guardGapMs. A failed RPC read
// resets the streak (the safest reading of "never revoke on unknown data")
// and leaves every plot in place. Every claim, release and revocation is
// ledgered to a JSONL file with plot, owner, tier state and triggering reads.
//
// The engine is pure and injectable (clock, reader, ledger) so the full test
// matrix in tests/entitlements.spec.mjs runs deterministically without RPC.

import fs from 'node:fs';
import path from 'node:path';
import { ENTITLEMENT, ONCHAIN } from './tokenomics.mjs';

const roundToken = (x) => Math.max(0, Math.floor(Number(x) || 0));

export function entitlementFor(tokens) {
  return Math.min(ENTITLEMENT.maxPlots, Math.floor(roundToken(tokens) / ENTITLEMENT.tokensPerPlot));
}

// ── Demo holdings (server-side, simulated) ─────────────────────────────────
// While BLOCKVILLE_MINT is unset there is no on-chain balance to verify, so
// the demo hands each player the seeded holding — server-side state, the same
// honesty the old demo staking had. Nothing here ever reads client input.
export function createDemoHoldings({ seedTokens = ENTITLEMENT.demoSeedTokens } = {}) {
  const map = new Map();
  return {
    mode: 'demo',
    seed(name) { if (!map.has(name)) map.set(name, roundToken(seedTokens)); },
    get(name) { return map.get(name) ?? roundToken(seedTokens); },
    set(name, tokens) { map.set(name, roundToken(tokens)); },
    reader: (name) => ({ ok: true, tokens: map.get(name) ?? roundToken(seedTokens) }),
  };
}

// ── Live holdings reader (public RPC, read-only) ───────────────────────────
// Same public-address read shape as the treasury holdings tracker (Chunk 5):
// getTokenAccountsByOwner over the SPL token program, summing token accounts.
// The key is the player's VERIFIED wallet address. No keys, no signing — a
// failed read returns { ok:false } and the engine simply does nothing.
export function createRpcHoldingsReader({ rpcUrl, mint, fetchImpl = fetch } = {}) {
  const url = rpcUrl || process.env[ONCHAIN.rpcUrlEnv] || ONCHAIN.defaultRpcUrl;
  return async (wallet) => {
    try {
      const r = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'getTokenAccountsByOwner',
          params: [wallet, { mint }, { encoding: 'jsonParsed' }],
        }),
      });
      if (!r.ok) return { ok: false, reason: `rpc_status_${r.status}` };
      const body = await r.json();
      const accounts = body?.result?.accounts;
      if (!Array.isArray(accounts)) return { ok: false, reason: 'rpc_bad_response' };
      let tokens = 0;
      for (const a of accounts) {
        const info = a?.account?.data?.parsed?.info;
        const raw = info?.tokenAmount;
        if (raw) tokens += Number(raw.uiAmount ?? 0);
      }
      return { ok: true, tokens };
    } catch (e) {
      return { ok: false, reason: e?.name === 'AbortError' ? 'rpc_timeout' : 'rpc_error' };
    }
  };
}

// ── JSONL ledger ───────────────────────────────────────────────────────────
function createLedger(ledgerPath) {
  if (!ledgerPath) return (kind, extra = {}) => ({ kind, ...extra });
  const dir = path.dirname(ledgerPath);
  return (kind, extra = {}, ts = Date.now()) => {
    const event = { ts, kind, ...extra };
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(ledgerPath, JSON.stringify(event) + '\n');
    } catch { /* a ledger write failure must never break the game loop */ }
    return event;
  };
}

export function createEntitlementEngine({
  readHoldings,            // async (key) => { ok, tokens? , reason? }
  ledgerPath = null,
  now = () => Date.now(),
  onRevoke = null,         // (key, plot, info) => void — server wires plot clearing
  extraFor = () => 0,      // server-side extras (e.g. Claim Permits) on top of the tier
} = {}) {
  const log = createLedger(ledgerPath);
  const players = new Map(); // key -> { key, tokens, tokensAt, claims:[], below:null, walletVerified:false }

  const playerOf = (key) => {
    let p = players.get(key);
    if (!p) { p = { key, tokens: null, tokensAt: 0, claims: [], below: null, lastError: null }; players.set(key, p); }
    return p;
  };

  // Claim-time holdings lookup: uses the brief cache. The verification sweep
  // forces real reads, so the guard gap is measured between real reads.
  let lastRead = new Map(); // key -> { ts, result }
  async function readCached(key, { force = false } = {}) {
    const t = now();
    const hit = lastRead.get(key);
    if (!force && hit && t - hit.ts < ENTITLEMENT.readCacheMs) return hit.result;
    const result = await readHoldings(key);
    if (result && result.ok) lastRead.set(key, { ts: t, result });
    return result ?? { ok: false, reason: 'no_reader' };
  }

  const revokeLifo = (p, info) => {
    const plot = p.claims[p.claims.length - 1];
    p.claims.pop();
    p.below = null; // one revocation per pass; the next pass re-evaluates the tier
    log('plot_revoked', { owner: p.key, plot, claims: p.claims.length, entitlement: info.entitlement, tokens: p.tokens, reads: { count: info.count, firstAt: info.firstAt, gapMs: info.gapMs } });
    if (onRevoke) onRevoke(p.key, plot, info);
    return plot;
  };

  const api = {
    ENTITLEMENT,
    entitlementFor,

    // Server-side entitlement snapshot (verified tokens or null when unverified).
    snapshot(key) {
      const p = players.get(key);
      if (!p || p.tokens === null) return { key, tokens: null, entitlement: 0, claimed: p ? p.claims.length : 0, verified: false };
      return { key, tokens: p.tokens, entitlement: entitlementFor(p.tokens), claimed: p.claims.length, verified: true };
    },

    claimsOf(key) { return [...(players.get(key)?.claims ?? [])]; },
    claimKeys() { return [...players.keys()].filter((k) => players.get(k).claims.length > 0); },

    // Force a verification pass for one player. Returns what happened:
    //   { ok:false, reason }                → RPC failure: nothing changes
    //   { ok:true, revoked: null, ... }     → tier holds (or below-tier read logged)
    //   { ok:true, revoked: plot, ... }     → LIFO plot revoked this pass
    async verify(key) {
      const p = playerOf(key);
      const r = await readCached(key, { force: true });
      if (!r.ok) {
        // Unknown data → never revoke, never change the tier. A failed read
        // also breaks the consecutive-read streak (documented choice).
        p.below = null;
        p.lastError = r.reason;
        return { ok: false, reason: r.reason ?? 'read_failed' };
      }
      p.lastError = null;
      p.tokens = roundToken(r.tokens);
      p.tokensAt = now();
      const ent = Math.min(ENTITLEMENT.maxPlots, entitlementFor(p.tokens) + extraFor(key));
      if (p.claims.length <= ent) { p.below = null; return { ok: true, revoked: null, entitlement: ent, claimed: p.claims.length, tokens: p.tokens }; }
      // Claims exceed the verified tier.
      const t = now();
      if (!p.below) p.below = { count: 1, firstAt: t };
      else {
        p.below = { count: p.below.count + 1, firstAt: p.below.firstAt };
      }
      if (p.below.count >= ENTITLEMENT.guardReads && t - p.below.firstAt >= ENTITLEMENT.guardGapMs) {
        const plot = revokeLifo(p, { entitlement: ent, count: p.below.count, firstAt: p.below.firstAt, gapMs: t - p.below.firstAt });
        return { ok: true, revoked: plot, entitlement: ent, claimed: p.claims.length, tokens: p.tokens };
      }
      return { ok: true, revoked: null, entitlement: ent, claimed: p.claims.length, tokens: p.tokens, guarded: true };
    },

    // Claim gate. Fresh, server-side: refresh (cache OK) then compare counts.
    // RPC failure blocks claiming gracefully — never a silent pass.
    async canClaim(key) {
      const v = await api.verify(key);
      const p = playerOf(key);
      const ent = v.ok ? v.entitlement : Math.min(ENTITLEMENT.maxPlots, entitlementFor(p.tokens ?? 0) + extraFor(key));
      if (!v.ok) return { allowed: false, reason: `holdings_unverified:${v.reason}`, entitlement: ent, claimed: p.claims.length };
      if (p.claims.length >= ent) return { allowed: false, reason: 'entitlement_full', entitlement: ent, claimed: p.claims.length };
      return { allowed: true, entitlement: ent, claimed: p.claims.length };
    },

    // Record an accepted claim (server call after its own first-wins logic).
    recordClaim(key, plot) {
      const p = playerOf(key);
      p.claims.push(plot);
      log('plot_claimed', { owner: p.key, plot, claims: p.claims.length });
      return p.claims.length;
    },

    // A plot leaves a player's hands (market sale) — frees the allowance.
    release(key, plot) {
      const p = players.get(key);
      if (!p) return;
      const i = p.claims.indexOf(plot);
      if (i !== -1) {
        p.claims.splice(i, 1);
        log('plot_released', { owner: key, plot, claims: p.claims.length });
      }
    },

    // Demo-only helper (tests + demo store mutation); never client input.
    _setHoldings(key, tokens) {
      const p = playerOf(key);
      p.tokens = roundToken(tokens);
      p.tokensAt = now();
    },
  };
  return api;
}
