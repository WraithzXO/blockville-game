// ── Real fee intake: incoming-SOL listener via public RPC polling ────────────
// Replaces the simulated drip as the LIVE intake source (webhooks are NOT
// permitted — no new services, no API keys; plain public-RPC polling only).
// The simulated drip (BV_FEE_SIM_SOL) stays available for dev, default-off,
// and is never active while the treasury runs live.
//
// Poll flow, per poll tick:
//   1. getSignaturesForAddress(TREASURY wallet, { until: cursor }) — every
//      transfer NEW since the last processed signature, oldest first.
//   2. For each: getTransaction → treasury's lamport delta (post − pre).
//      Positive delta = SOL RECEIVED → `treasury.recordFees(delta)` runs the
//      EXISTING pipeline untouched (80% pending buyback, 20% gas reserve,
//      `fee_in` ledger event), followed by the gas-sweep check.
//   3. The cursor (last processed signature + a recent-signature ring) is
//      persisted after EVERY processed signature, so a restart mid-batch
//      reprocesses nothing (idempotent by transaction signature).
//   4. RPC failure → the tick throws, backoff widens the interval, the cursor
//      never advances: no processing, no loss.
//
// Failed on-chain transactions deliver no funds and are skipped (cursor still
// advances — the signature is processed, its delta simply pays nothing).
// A treasury SELF-transfer pays its own fee, so its lamport delta is ≤ 0 and
// is never counted as a fee.

import fs from 'node:fs';
import path from 'node:path';
import { rpcCall, solDeltaFromMeta } from './solana.mjs';

export function createFeeListener(opts = {}) {
  const rpcUrl = opts.rpcUrl;
  const treasuryAddress = opts.treasuryAddress;
  const cursorPath = opts.cursorPath ?? null;
  const treasury = opts.treasury;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const basePollMs = opts.pollMs ?? 30_000;
  const maxPollMs = opts.maxPollMs ?? 300_000;
  const log = opts.log ?? console;

  let timer = null;
  let stopped = true;
  let currentInterval = basePollMs;
  let consecutiveFailures = 0;

  const readCursor = () => {
    try {
      const c = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
      if (typeof c.lastSignature === 'string' && Array.isArray(c.recent)) return c;
    } catch { /* first boot */ }
    return { lastSignature: null, recent: [] };
  };
  const writeCursor = (c) => {
    if (!cursorPath) return;
    try {
      fs.mkdirSync(path.dirname(cursorPath), { recursive: true });
      fs.writeFileSync(cursorPath, JSON.stringify(c));
    } catch { /* best-effort; worst case re-reads from an older signature but the recent ring still guards */ }
  };

  const call = (method, params) => rpcCall(rpcUrl, method, params, fetchImpl);

  // Treasury lamport delta for one confirmed transaction.
  const receivedInTx = async (signature) => {
    const tx = await call('getTransaction', [signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]);
    if (!tx || tx.meta?.err) return 0; // failed tx: nothing delivered
    const keys = tx.transaction?.message?.accountKeys ?? [];
    const delta = solDeltaFromMeta(tx.meta, keys, treasuryAddress);
    return delta && delta > 0 ? delta : 0;
  };

  const pollOnce = async () => {
    const cursor = readCursor();
    // First boot with no cursor: establish a BASELINE at the newest signature
    // and process nothing — historical transfers are not new fees.
    if (!cursor.lastSignature) {
      const res0 = await call('getSignaturesForAddress', [treasuryAddress, { limit: 1 }]);
      const latest = Array.isArray(res0) && res0.length ? (typeof res0[0] === 'string' ? res0[0] : res0[0]?.signature) : null;
      if (latest) {
        cursor.lastSignature = latest;
        cursor.recent.push(latest);
        writeCursor(cursor);
      }
      return { processed: 0, received: 0, baseline: true };
    }
    const params = cursor.lastSignature
      ? { until: cursor.lastSignature, limit: 100 }
      : { limit: 100 };
    const res = await call('getSignaturesForAddress', [treasuryAddress, params]);
    const sigs = Array.isArray(res) ? res : [];
    // RPC returns newest-first; process oldest → newest
    const oldestFirst = sigs.slice().reverse();
    let processed = 0, received = 0;
    for (const entry of oldestFirst) {
      const sig = typeof entry === 'string' ? entry : entry?.signature;
      if (!sig || cursor.recent.includes(sig)) continue;
      const lamports = entry.err ? 0 : await receivedInTx(sig);
      if (lamports > 0) {
        const sol = lamports / 1e9;
        treasury.recordFees(sol);
        treasury.maybeSweepGas(); // sweep check right after the deposit
        received++;
        log.log?.(`[treasury] fee intake: +${sol} SOL received (${sig.slice(0, 12)}…) — routed ${(sol * 0.8).toFixed(9)} buyback / ${(sol * 0.2).toFixed(9)} gas`);
      }
      cursor.lastSignature = sig;
      cursor.recent.push(sig);
      if (cursor.recent.length > 100) cursor.recent.splice(0, cursor.recent.length - 100);
      writeCursor(cursor); // after EVERY signature: a mid-batch crash reprocesses nothing
      processed++;
    }
    return { processed, received };
  };

  const tick = async () => {
    try {
      await pollOnce();
      consecutiveFailures = 0;
      currentInterval = basePollMs;
    } catch (e) {
      consecutiveFailures++;
      currentInterval = Math.min(maxPollMs, basePollMs * 2 ** Math.min(consecutiveFailures, 6));
      log.error?.(`[treasury] fee intake poll failed (${consecutiveFailures} consecutive): ${e?.message ?? e} — next poll in ${Math.round(currentInterval / 1000)}s`);
    }
    if (!stopped) schedule();
  };

  const schedule = () => {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, currentInterval);
    timer.unref?.();
  };

  const start = () => {
    if (!stopped) return;
    stopped = false;
    schedule();
    log.log?.(`[treasury] fee intake: polling ${treasuryAddress.slice(0, 8)}… every ${Math.round(currentInterval / 1000)}s (public RPC)`);
  };
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return {
    name: 'fee-listener',
    pollOnce,
    start,
    stop,
    get intervalMs() { return currentInterval; },
  };
}
