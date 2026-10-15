// ── Treasury wallet holdings (Chunk 5) ─────────────────────────────────────
// READ-ONLY: resolves the treasury wallet's real $BLOCKVILLE token balance
// from a Solana RPC (public endpoint by default; TREASURY_RPC_URL to pick a
// reliable provider). Nothing here signs, sends, or touches key material —
// the only inputs are the PUBLIC treasury address and the mint address.
//
// Behaviour contract (Chunk 5 spec):
//   • BLOCKVILLE_MINT unset → configured:false, balance 0, zero RPC calls
//     (the system idles safely until the operator sets the mint).
//   • Successful read → { balance, decimals, updatedAt, stale:false }.
//   • RPC failure → the LAST VALID balance is served with stale:true; the
//     next successful read recovers automatically (stale back to false).
//   • The server re-reads on-chain at most once per holdingsMinRefetchMs so
//     a 10s client poll (or many clients) cannot hammer the public RPC.
import { ONCHAIN } from './tokenomics.mjs';

function envStr(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

// Resolved at call time (never cached at import) so tests and the operator
// can flip env vars without a restart race — same pattern as treasuryLiveState.
export function resolveHoldingsConfig() {
  const mint = envStr(ONCHAIN.mintEnv);
  const rpcUrl = envStr(ONCHAIN.rpcUrlEnv) || ONCHAIN.defaultRpcUrl;
  return { wallet: ONCHAIN.treasuryWalletAddress, mint, rpcUrl, configured: !!mint };
}

export function createHoldingsTracker({ fetchImpl = globalThis.fetch, minRefetchMs = ONCHAIN.holdingsMinRefetchMs, now = () => Date.now() } = {}) {
  let last = null;        // last valid read: { balance, decimals, updatedAt }
  let lastAttempt = 0;    // clock time of the last RPC attempt (success or failure)
  let lastStale = false;  // true once a read has failed since the last valid one
  let calls = 0;          // RPC attempts made (test observability only)

  async function rpcBalance(mint, rpcUrl) {
    calls++;
    const res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        // PUBLIC address only — the request can never carry key material.
        params: [ONCHAIN.treasuryWalletAddress, { mint }, { encoding: 'jsonParsed' }],
      }),
    });
    if (!res.ok) throw new Error(`RPC responded ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(`RPC error ${j.error?.code ?? 'unknown'}`);
    let balance = 0;
    let decimals = null;
    for (const acc of j.result?.value ?? []) {
      const ta = acc?.account?.data?.parsed?.info?.tokenAmount;
      if (!ta) continue;
      balance += Number(ta.uiAmount ?? 0);
      if (decimals === null && Number.isFinite(ta.decimals)) decimals = ta.decimals;
    }
    return { balance, decimals };
  }

  function snapshot() {
    return last
      ? { ...last, stale: lastStale }
      : { balance: null, decimals: null, updatedAt: null, stale: true };
  }

  // Returns the current holdings state, refreshing from RPC when the cache is
  // empty or older than minRefetchMs. Awaited so the first response carries a
  // real value; later calls inside the window are pure cache reads.
  async function get() {
    const cfg = resolveHoldingsConfig();
    if (!cfg.configured) {
      return { configured: false, wallet: cfg.wallet, balance: 0, decimals: null, updatedAt: null, stale: false };
    }
    const t = now();
    if (!last || t - lastAttempt >= minRefetchMs) {
      lastAttempt = t;
      try {
        const { balance, decimals } = await rpcBalance(cfg.mint, cfg.rpcUrl);
        last = { balance, decimals, updatedAt: t };
        lastStale = false;
      } catch {
        // Keep the last valid value and flag it stale; recovery is automatic
        // on the next successful read. With no prior valid read the snapshot
        // stays null/stale rather than inventing a balance.
        if (last) lastStale = true;
      }
    }
    return { configured: true, wallet: cfg.wallet, ...snapshot() };
  }

  return {
    get,
    peek: () => ({ configured: resolveHoldingsConfig().configured, wallet: ONCHAIN.treasuryWalletAddress, ...snapshot() }),
    rpcCalls: () => calls,
  };
}
