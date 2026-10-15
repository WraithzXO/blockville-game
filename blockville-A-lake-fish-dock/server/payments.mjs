// ── Real SOL upgrade-payment verification (Chunk: upgrade transactions) ─────
// READ-ONLY on-chain verification of a Solana transaction the CLIENT claims
// to have sent to the treasury wallet. Nothing here signs, sends, or holds
// key material — the only inputs are a transaction signature the client
// submitted and the server's own quoted fee. The backend is the final
// authority: an upgrade is applied ONLY after this verifier confirms, from
// the chain itself, that
//   • the transaction is confirmed (commitment: 'confirmed'),
//   • it succeeded on-chain (no error in its status metadata),
//   • the PUBLIC treasury wallet received EXACTLY the quoted lamports.
//
// Idempotency by transaction signature: every signature this server has ever
// APPLIED is recorded (in memory + a small JSON file that survives restarts,
// because a restart must never let one paid transaction buy two upgrades).
// A replayed signature applies nothing. A signature that verifies for a wrong
// amount or wrong recipient is rejected and logged by the caller.
//
// RPC commitment choice: 'confirmed' — the standard Solana confirmation level
// (a supermajority of stake has voted; ~a couple of seconds). 'finalized'
// would add latency for no security gain here, since the payment is never
// reversed by a client and the upgrade applies exactly once per signature.

import fs from 'node:fs';
import path from 'node:path';
import { ONCHAIN } from './tokenomics.mjs';
import { base58Decode } from './auth.mjs';

const LAMPORTS_PER_SOL = 1e9;
const exactLamports = (sol) => Math.round(Number(sol) * LAMPORTS_PER_SOL);

function envStr(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

export function createUpgradePaymentVerifier({ fetchImpl = globalThis.fetch, storePath = null } = {}) {
  // signature -> { plot, level, sol, appliedAt } — signatures already used
  const seen = new Map();

  const load = () => {
    if (!storePath) return;
    try {
      const arr = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (Array.isArray(arr)) for (const e of arr) if (e && typeof e.signature === 'string') seen.set(e.signature, e);
    } catch { /* first boot or unreadable file: start empty (never fake a record) */ }
  };
  const persist = () => {
    if (!storePath) return;
    try {
      fs.mkdirSync(path.dirname(storePath), { recursive: true });
      const tmp = `${storePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...seen.values()]));
      fs.renameSync(tmp, storePath);
    } catch { /* best-effort persistence; in-memory record still guards this process */ }
  };
  load();

  // One on-chain read of the submitted signature. Returns a reason object on
  // every failure path — the CALLER decides what (little) the client learns.
  async function verify({ signature, expectedSol, plot, level }) {
    const expected = exactLamports(expectedSol);
    if (!Number.isFinite(expected) || expected <= 0) return { ok: false, reason: 'invalid_quote' };
    if (typeof signature !== 'string' || signature.length === 0 || signature.length > 128) {
      return { ok: false, reason: 'malformed_signature' };
    }
    const raw = base58Decode(signature);
    if (!raw || raw.length !== 64) return { ok: false, reason: 'malformed_signature' };
    if (seen.has(signature)) return { ok: false, reason: 'already_applied', applied: seen.get(signature) };

    const rpcUrl = envStr(ONCHAIN.rpcUrlEnv) || ONCHAIN.defaultRpcUrl;
    let j;
    try {
      const res = await fetchImpl(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }],
        }),
      });
      if (!res.ok) return { ok: false, reason: 'rpc_unavailable' };
      j = await res.json();
    } catch {
      return { ok: false, reason: 'rpc_unavailable' };
    }
    if (j?.error) return { ok: false, reason: 'rpc_unavailable' };
    if (j?.result == null) return { ok: false, reason: 'unconfirmed' }; // not seen on-chain yet — a legit client retries
    const meta = j.result?.meta;
    if (!meta || meta.err) return { ok: false, reason: 'failed_onchain' };

    // Balance delta of the PUBLIC treasury wallet within THIS transaction:
    // post − pre at the treasury's account index. This is the authoritative
    // "how much did the treasury actually receive" — no instruction parsing,
    // no trust in the client's description of the transfer.
    const keys = j.result?.transaction?.message?.accountKeys ?? [];
    const pubOf = (k) => (typeof k === 'string' ? k : k?.pubkey);
    const idx = keys.findIndex((k) => pubOf(k) === ONCHAIN.treasuryWalletAddress);
    if (idx === -1) return { ok: false, reason: 'wrong_recipient' };
    const pre = Number(meta.preBalances?.[idx]);
    const post = Number(meta.postBalances?.[idx]);
    if (!Number.isFinite(pre) || !Number.isFinite(post)) return { ok: false, reason: 'rpc_unavailable' };
    const received = post - pre;
    if (received !== expected) return { ok: false, reason: received > 0 ? 'wrong_amount' : 'wrong_recipient' };

    // Confirmed, succeeded, exact amount to the exact recipient: burn the
    // signature into the applied-ledger BEFORE the caller applies anything,
    // so a concurrent duplicate can never slip between verify and apply.
    const rec = { signature, plot, level, sol: Number(expectedSol), appliedAt: Date.now() };
    seen.set(signature, rec);
    persist();
    return { ok: true, receivedLamports: received, applied: rec };
  }

  return {
    verify,
    // Test/operator observability: how many signatures this process has applied.
    appliedCount: () => seen.size,
    seenSignature: (sig) => seen.get(sig) ?? null,
  };
}
