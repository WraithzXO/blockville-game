// ── Blockville weighted payout engine (Chunk T3) ────────────────────────────
// Every CYCLE.intervalMs: take ONE consistent snapshot of the treasury's
// $BLOCKVILLE token balance and every eligible plot score, then distribute
// exactly CYCLE.distributePct (20%) of the snapshot balance, weighted by
// plot score P = (20 + B) × U × G (server/tokenomics.mjs). Each player's
// payout is rounded DOWN to the whole-token unit; the sum of all round-down
// remainders NEVER leaves the treasury — it carries into the next cycle.
//
// NPC-owned and Town Council plots score 0 and are never in the recipient
// list (unconditional, see tokenomics.isNpcOwner). 100% of every
// distribution goes to real player plots.
//
// Token account creation choice (documented per the brief): payouts accrue
// to a CLAIMABLE INTERNAL BALANCE per player name, persisted to disk. We do
// NOT fund ATA rent from the gas reserve: while the kill switch is off the
// server holds no signing authority at all, and spending the gas reserve on
// ATA rent before going live would burn the very SOL the swap needs. When
// TREASURY_ENABLED flips live, `claim()` transfers a name's accrued balance
// on-chain (creating the ATA then, funded from the gas reserve if needed).
//
// Idempotent cycles: every event below is keyed by its cycle id. The plan
// (snapshot balance, recipients, weights, distributable amount) is persisted
// in `cycle_start` BEFORE any payout; a crash mid-cycle is replayed exactly
// once on restart from that persisted plan, skipping players already paid.

import fs from 'node:fs';
import path from 'node:path';
import { CYCLE, playerWeights } from './tokenomics.mjs';
import { cycleIdFor } from './treasury.mjs';
import { treasuryLiveState } from './tokenomics.mjs';

export function createDistributor(opts = {}) {
  const treasury = opts.treasury;
  const getPlots = opts.getPlots ?? (() => []);
  const onPayout = opts.onPayout ?? (() => {});
  const onCycle = opts.onCycle ?? (() => {});
  const ledgerPath = opts.ledgerPath ?? null;        // data/treasury-cycles.jsonl
  const claimablePath = opts.claimablePath ?? null;  // data/claimable-balances.json
  const out = opts.log ?? null;                      // structured console output (server passes console)

  const events = [];               // in-memory mirror of the cycles ledger
  const reports = new Map();       // cycle id -> per-cycle report (Chunk T4)
  const claimable = new Map();     // player name -> accrued whole tokens
  const pendingClaims = new Map(); // player name -> { sig|null, amount, wallet, ts } (real-path claims)
  let lastRunCycle = 0;
  let lastRunTs = 0;               // previous boundary ts (inflow attribution)

  // `ts` threads the cycle being operated on into every event so a cycle run
  // (or replay of a past cycle) is always tagged with ITS cycle id — never
  // wall-clock time, which can drift across a 5-minute boundary mid-run.
  const log = (kind, extra = {}, ts = Date.now()) => {
    const event = { ts, cycle: cycleIdFor(ts), kind, ...extra };
    events.push(event);
    applyEvent(event);
    if (ledgerPath) {
      try {
        fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
        fs.appendFileSync(ledgerPath, JSON.stringify(event) + '\n');
      } catch { /* a ledger write failure must never break the game loop */ }
    }
    return event;
  };

  // ── cycle reports (Chunk T4) ─────────────────────────────────────────────
  // One reconciled report per cycle id, built incrementally from the ledger
  // events and persisted as a single authoritative `cycle_report` event.
  // Reconstructed from the file on restart so the admin view survives boots.
  const applyEvent = (e) => {
    const r = reports.get(e.cycle) ?? { cycle: e.cycle, payouts: [] };
    switch (e.kind) {
      case 'cycle_start':
        Object.assign(r, {
          ts: e.ts, balanceBefore: e.balance,
          buybackAdded: e.inflows?.buybackTokens ?? 0,
          shopIn: e.inflows?.shopTokens ?? 0,
          upgradeSolIn: e.inflows?.upgradeSol ?? 0,
          balanceUsedForDistribution: e.distributable,
          totalPoints: e.totalPoints,
          recipients: e.recipients ?? [],
        });
        break;
      case 'payout':
        if (!r.payouts.some((p) => p.name === e.name)) r.payouts.push({ name: e.name, weight: e.weight, amount: e.amount });
        break;
      case 'cycle_complete':
        Object.assign(r, { paid: e.paid, remainder: e.remainder, balanceAfter: e.balanceAfter ?? r.balanceAfter, replayed: e.replayed != null ? e.replayed > 0 : r.replayed });
        break;
      case 'cycle_skip':
        Object.assign(r, { skipped: true, skipReason: e.reason, balanceBefore: r.balanceBefore ?? e.balance, balanceAfter: r.balanceAfter ?? e.balance, ts: r.ts ?? e.ts });
        break;
      case 'cycle_report': { // authoritative full record — replaces the partial
        reports.set(e.cycle, { ...r, ...e, payouts: e.payouts ?? r.payouts });
        return;
      }
      default: return; // other kinds don't shape reports
    }
    reports.set(e.cycle, r);
  };

  const persistClaimable = () => {
    if (!claimablePath) return;
    try {
      fs.mkdirSync(path.dirname(claimablePath), { recursive: true });
      fs.writeFileSync(claimablePath, JSON.stringify({ balances: Object.fromEntries(claimable), pendingClaims: Object.fromEntries(pendingClaims) }));
    } catch { /* best-effort persistence */ }
  };

  const loadClaimable = () => {
    if (!claimablePath) return;
    try {
      const raw = JSON.parse(fs.readFileSync(claimablePath, 'utf8'));
      const balances = raw?.balances && typeof raw.balances === 'object' ? raw.balances : raw;
      for (const [name, v] of Object.entries(balances)) {
        const n = Math.floor(Number(v));
        if (Number.isFinite(n) && n > 0) claimable.set(name, n);
      }
      if (raw?.pendingClaims && typeof raw.pendingClaims === 'object') {
        for (const [name, p] of Object.entries(raw.pendingClaims)) {
          if (p && (typeof p.sig === 'string' || p.sig === null) && Number.isFinite(p.amount) && p.amount > 0) {
            pendingClaims.set(name, { sig: p.sig, amount: p.amount, wallet: p.wallet ?? null, ts: Number(p.ts) || Date.now() });
          }
        }
      }
    } catch { /* first boot or corrupt file: start empty */ }
  };

  // ── replay bootstrap ───────────────────────────────────────────────────────
  // Scan the persisted cycle ledger. The LATEST cycle that has a `cycle_start`
  // but neither `cycle_complete` nor `cycle_skip` crashed mid-distribution:
  // re-execute its remaining payouts exactly once, from its OWN persisted
  // plan (never from current state), skipping players already paid.
  const replayUnfinished = () => {
    if (!ledgerPath) return null;
    let rows;
    try {
      rows = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    } catch { return null; }
    for (const e of rows) applyEvent(e); // feed the report builder first
    const byCycle = new Map();
    for (const e of rows) {
      const c = byCycle.get(e.cycle) ?? { started: null, paid: new Set(), done: false };
      if (e.kind === 'cycle_start') c.started = e;
      else if (e.kind === 'payout' && e.name) c.paid.add(e.name);
      else if (e.kind === 'cycle_complete' || e.kind === 'cycle_skip') c.done = true;
      byCycle.set(e.cycle, c);
    }
    const last = Math.max(...byCycle.keys());
    const c = byCycle.get(last);
    if (!c || c.done || !c.started) return null;
    const { cycle, distributable, recipients } = c.started;
    const total = (recipients ?? []).reduce((s, r) => s + r.weight, 0);
    if (!(distributable > 0) || total <= 0) return null;
    let paid = 0;
    const replayed = [];
    for (const r of recipients) {
      const amount = Math.floor(distributable * r.weight / total);
      if (amount <= 0) continue;
      paid += amount;
      if (c.paid.has(r.name)) continue; // already paid before the crash
      thisPay(r.name, amount, cycle, r.weight, total, true, c.started.ts);
      replayed.push(r.name);
    }
    const remainder = distributable - paid;
    const rr = reports.get(cycle) ?? {};
    log('cycle_complete', { cycle, paid, remainder, replayed: replayed.length, balanceAfter: Math.max(0, Math.floor(treasury.balance)) }, c.started.ts);
    log('cycle_report', {
      cycle, balanceBefore: rr.balanceBefore ?? null, buybackAdded: rr.buybackAdded ?? 0, shopIn: rr.shopIn ?? 0,
      upgradeSolIn: rr.upgradeSolIn ?? 0, balanceUsedForDistribution: distributable,
      totalPoints: (rr.recipients ?? c.started.recipients ?? []).reduce((s, x) => s + x.weight, 0),
      payouts: rr.payouts ?? [], paid, remainder, balanceAfter: Math.max(0, Math.floor(treasury.balance)), replayed: replayed.length,
    }, c.started.ts);
    out?.log(`[treasury] cycle ${cycle}: REPLAYED — balance ${rr.balanceBefore ?? '?'} → ${Math.max(0, Math.floor(treasury.balance))} $BLOCKVILLE (paid ${paid}, ${replayed.length} payouts recovered)`);
    return { cycle, replayed, paid, remainder };
  };

  const thisPay = (name, amount, cycle, weight, totalPoints, replayed = false, ts = Date.now()) => {
    const res = treasury.distributeDebit(amount, { cycle, to: name, ...(replayed ? { replay: true } : {}) }, ts);
    if (!res.ok) {
      log('payout_failed', { cycle, name, amount, reason: res.reason }, ts);
      return null;
    }
    claimable.set(name, (claimable.get(name) ?? 0) + amount);
    persistClaimable();
    const accrued = claimable.get(name);
    log('payout', { cycle, name, amount, weight, totalPoints, accrued }, ts);
    try { onPayout(name, { cycle, amount, weight, totalPoints, accrued }); } catch { /* listener errors never break a payout */ }
    return { name, amount };
  };

  loadClaimable();
  const replayResult = replayUnfinished();
  // Restart: the first post-restart cycle must NOT re-count the whole ledger
  // as "arrived this cycle" — anchor on the newest boundary already persisted.
  for (const e of events) {
    if (['cycle_start', 'cycle_complete', 'cycle_skip', 'cycle_report'].includes(e.kind) && Number(e.ts) > lastRunTs) {
      lastRunTs = Number(e.ts);
    }
  }

  const api = {
    // One 5-minute distribution cycle. `ts` pins the cycle id (snapshot key).
    runCycle(ts = Date.now()) {
      const cycle = cycleIdFor(ts);
      if (cycle <= lastRunCycle) return { skipped: true, reason: 'stale_or_repeat_cycle', cycle };
      lastRunCycle = cycle;
      const prevBoundaryTs = lastRunTs;
      lastRunTs = ts;

      // ONE consistent snapshot: balance + eligible plot scores for THIS cycle.
      const balance = Math.max(0, Math.floor(treasury.balance));
      const distributable = Math.floor(balance * CYCLE.distributePct);
      const plots = (getPlots() || []).map((p) => ({ ...p }));
      const weights = playerWeights(plots);
      const recipients = [...weights.entries()]
        .map(([name, weight]) => ({ name, weight }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)); // deterministic order
      const totalPoints = recipients.reduce((s, r) => s + r.weight, 0);

      if (totalPoints <= 0) {
        log('cycle_skip', { cycle, reason: 'no_eligible_plots', balance }, ts);
        log('cycle_report', { cycle, skipped: true, skipReason: 'no_eligible_plots', balanceBefore: balance, balanceAfter: balance, payouts: [] }, ts);
        out?.log(`[treasury] cycle ${cycle}: SKIPPED (no_eligible_plots) — balance ${balance} $BLOCKVILLE`);
        return { skipped: true, reason: 'no_eligible_plots', cycle, balance };
      }
      if (distributable < (CYCLE.minDistributableTokens ?? 1)) {
        log('cycle_skip', { cycle, reason: 'treasury_below_one_token', balance }, ts);
        log('cycle_report', { cycle, skipped: true, skipReason: 'treasury_below_one_token', balanceBefore: balance, balanceAfter: balance, payouts: [] }, ts);
        out?.log(`[treasury] cycle ${cycle}: SKIPPED (treasury_below_one_token) — balance ${balance} $BLOCKVILLE, nothing meaningful to distribute`);
        return { skipped: true, reason: 'treasury_below_one_token', cycle, balance };
      }

      // What ARRIVED since the previous boundary (buyback output, shop recycling,
      // upgrade SOL) — the report shows exactly what the balance is built of.
      const inflows = typeof treasury.cycleInflows === 'function'
        ? (typeof treasury.cycleInflowsSince === 'function'
            ? treasury.cycleInflowsSince(prevBoundaryTs)
            : treasury.cycleInflows(cycle))
        : { buybackTokens: 0, shopTokens: 0, upgradeSol: 0 };
      log('cycle_start', { cycle, balance, distributable, totalPoints, recipients, inflows }, ts);

      let paid = 0;
      const paidList = [];
      for (const r of recipients) {
        const amount = Math.floor(distributable * r.weight / totalPoints); // round DOWN per player
        if (amount <= 0) continue;
        const res = thisPay(r.name, amount, cycle, r.weight, totalPoints, false, ts);
        if (res) { paid += amount; paidList.push({ name: r.name, weight: r.weight, amount }); }
      }
      const remainder = distributable - paid; // round-down dust — stays in the treasury
      const balanceAfter = Math.max(0, Math.floor(treasury.balance));
      log('cycle_complete', { cycle, paid, remainder, balanceAfter }, ts);
      log('cycle_report', {
        cycle, balanceBefore: balance, buybackAdded: inflows.buybackTokens, shopIn: inflows.shopTokens,
        upgradeSolIn: inflows.upgradeSol, balanceUsedForDistribution: distributable, totalPoints,
        payouts: paidList, paid, remainder, balanceAfter,
      }, ts);
      out?.log(`[treasury] cycle ${cycle}: balance ${balance} → ${balanceAfter} $BLOCKVILLE (distributed ${paid} of ${distributable} across ${paidList.length} players, dust ${remainder}, ${totalPoints} pts)`);
      try { onCycle({ cycle, balance, distributable, paid, remainder, totalPoints }); } catch { /* listener errors never break the engine */ }
      return { ok: true, cycle, balance, distributable, paid, remainder, recipients: paidList, totalPoints };
    },

    // On-chain claim of a name's accrued balance. Refuses while the kill
    // switch is off or the operator setup is incomplete — accrual keeps
    // working either way (dry-run mode).
    async claim(name, { sender, wallet } = {}) {
      const key = String(name || '').slice(0, 12);
      const amount = claimable.get(key) ?? 0;
      if (amount <= 0) return { ok: false, reason: 'nothing_accrued' };
      if (!treasuryLiveState().live) return { ok: false, reason: 'not_live', accrued: amount };
      if (!sender) {
        // No payout sender wired (legacy live-but-unwired config): ledger-only.
        claimable.set(key, 0);
        persistClaimable();
        log('claim', { name: key, amount });
        return { ok: true, amount };
      }
      const walletAddress = wallet ?? this.walletFor?.(key) ?? null;
      if (!walletAddress) return { ok: false, reason: 'no_verified_wallet', accrued: amount };
      if (amount > treasury.balance) return { ok: false, reason: 'insufficient_treasury', accrued: amount };
      const finalize = (tokens, signature, recovered) => {
        // Only the TRANSFERRED amount is deducted — accrual that happened
        // while the claim was pending is never lost.
        claimable.set(key, Math.max(0, (claimable.get(key) ?? 0) - tokens));
        pendingClaims.delete(key);
        persistClaimable();
        log('payout_transfer', { name: key, tokens, wallet: walletAddress, signature, ...(recovered ? { recovered: true } : {}) });
        log('claim', { name: key, amount: tokens, signature, ...(recovered ? { recovered: true } : {}) });
        return { ok: true, amount: tokens, signature, ...(recovered ? { recovered: true } : {}) };
      };
      // Resolve any in-flight claim FIRST — a claim can never pay twice.
      const pending = pendingClaims.get(key) ?? null;
      if (pending?.sig) {
        const st = await sender.checkSignature(pending.sig);
        if (st === 'success') return finalize(pending.amount, pending.sig, true);
        if (st === 'unknown') return { ok: false, reason: 'claim_pending', accrued: amount, signature: pending.sig };
        pendingClaims.delete(key); // failed on-chain: fall through to a fresh send
        persistClaimable();
      } else if (pending) {
        // Intent persisted but signature lost (crash between send and persist):
        // recover by matching the on-chain history before ever sending again.
        const found = await sender.findRecentPayout?.({ wallet: pending.wallet, tokens: pending.amount });
        if (found?.found) return finalize(pending.amount, found.signature, true);
        pendingClaims.delete(key); // nothing reached chain
        persistClaimable();
      }
      // Persist the intent BEFORE sending (crash-safety), then send.
      pendingClaims.set(key, { sig: null, amount, wallet: walletAddress, ts: Date.now() });
      persistClaimable();
      const res = await sender.sendPayout({ wallet: walletAddress, tokens: amount });
      if (res.ok) {
        if (Number.isFinite(res.feeSol)) treasury.spendGas?.(res.feeSol);
        if (res.createdAta) log('payout_ata_created', { name: key, wallet: walletAddress, rentSol: 0.002 });
        return finalize(amount, res.signature, false);
      }
      if (res.signature) {
        // Sent but unconfirmed: keep the pending signature; the claimable
        // balance stays intact until the SAME signature resolves.
        pendingClaims.set(key, { sig: res.signature, amount, wallet: walletAddress, ts: Date.now() });
        persistClaimable();
        return { ok: false, reason: 'claim_pending', accrued: amount, signature: res.signature };
      }
      return { ok: false, reason: res.reason ?? 'transfer_failed', accrued: amount };
    },

    claimableOf(name) { return claimable.get(String(name || '').slice(0, 12)) ?? 0; },
    // ── lifetime fees earned (earnings-card chunk) ──────────────────────────
    // A player's total fees earned = the SUM of their `payout` records in the
    // engine's own cycle reports. The reports are rebuilt from the persisted
    // cycles ledger on every boot (replayUnfinished feeds applyEvent), so the
    // figure survives restarts and is always derived from the authoritative
    // ledger — never from a client counter and never from in-memory-only
    // state. Per-cycle entries carry the cycle id and the cycle timestamp.
    feesSnapshot(name, maxEntries = 12) {
      const key = String(name || '').slice(0, 12);
      let total = 0;
      const entries = [];
      for (const r of reports.values()) {
        if (r.skipped || !Array.isArray(r.payouts)) continue;
        for (const p of r.payouts) {
          if (p.name !== key) continue;
          total += p.amount;
          entries.push({ cycle: r.cycle, amount: p.amount, ts: Number.isFinite(r.ts) ? r.ts : null });
        }
      }
      entries.sort((a, b) => b.cycle - a.cycle);
      return { total, entries: entries.slice(0, Math.max(1, Math.floor(maxEntries))) };
    },
    // Last N cycle reports, newest first (Chunk T4 admin view).
    cycleReports(n = 50) {
      const limit = Math.min(Math.max(Math.floor(Number(n)) || 50, 1), 1000);
      return [...reports.values()].sort((a, b) => b.cycle - a.cycle).slice(0, limit);
    },
    ledger() { return events.slice(); },
    replay: replayResult,
  };
  return api;
}
