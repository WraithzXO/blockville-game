// Real SOL upgrade-payment tests (upgrade-transactions chunk).
// Unit level: the on-chain verifier (injected fetch — NO real network), the
// treasury routing of verified upgrade SOL, dev-mode equivalence and the
// plot-scoring weight the payout engine consumes. End-to-end WS flows (dev +
// strict modes) live in upgradepay-ws.spec.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runTests } from './harness.mjs';
import { createUpgradePaymentVerifier } from '../server/payments.mjs';
import { createTreasury } from '../server/treasury.mjs';
import { UPGRADE_SOL, FEES, ONCHAIN, BUILD_BLOCKS, UPGRADE_MULT, plotScore } from '../server/tokenomics.mjs';
import { base58Encode } from '../server/auth.mjs';

const TREASURY = ONCHAIN.treasuryWalletAddress;
const LAMPORTS = 1e9;
// A random 64-byte signature, base58-encoded — the wire format the client submits.
const sig64 = () => base58Encode(crypto.randomBytes(64));

// Fabricate a getTransaction RPC response. `delta` lamports arrive at the
// treasury (index `tIdx` of accountKeys); everything else is window dressing.
const txJson = (delta, { tIdx = 1, keys = 3, err = null, includeTreasury = true } = {}) => {
  const pre = Array.from({ length: keys }, () => 1_000_000_000);
  const post = [...pre];
  if (includeTreasury) post[tIdx] += delta;
  else post[0] += delta; // paid someone else entirely
  return {
    jsonrpc: '2.0',
    result: {
      meta: { err, preBalances: pre, postBalances: post },
      transaction: {
        message: {
          accountKeys: Array.from({ length: keys }, (_, i) => (includeTreasury && i === tIdx ? TREASURY : `Acc${i}${'x'.repeat(40)}`)),
        },
      },
    },
  };
};

const fetchOk = (body) => async () => ({ ok: true, json: async () => body });
const fetchErr = () => async () => { throw new Error('unreachable'); };

const tmpStore = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-pay-')), 'signatures.json');

const tests = [
  // ── quote correctness per level (the server always quotes its own table) ──
  ['upgrade fee quotes per level: 0.1 / 0.25 / 0.5 SOL from the server table', () => {
    if (UPGRADE_SOL[0] !== 0.1 || UPGRADE_SOL[1] !== 0.25 || UPGRADE_SOL[2] !== 0.5) throw new Error(`table changed: ${UPGRADE_SOL}`);
    // the handler indexes UPGRADE_SOL[next - 2] for next = 2..4
    const quote = (next) => UPGRADE_SOL[next - 2];
    if (quote(2) !== 0.1 || quote(3) !== 0.25 || quote(4) !== 0.5) throw new Error('quote mapping wrong');
    if (quote(5) !== undefined) throw new Error('quote(5) must not be reachable (max level 4 enforced by the handler)');
  }],

  // ── verifier: happy path + idempotency ──
  ['verified payment: exact lamports to the treasury wallet → applied exactly once', async () => {
    const store = tmpStore();
    const v = createUpgradePaymentVerifier({ fetchImpl: fetchOk(txJson(0.1 * LAMPORTS)), storePath: store });
    const sig = sig64();
    const r = await v.verify({ signature: sig, expectedSol: 0.1, plot: 300, level: 2 });
    if (!r.ok || r.receivedLamports !== 0.1 * LAMPORTS) throw new Error(`verify: ${JSON.stringify(r)}`);
    if (v.appliedCount() !== 1) throw new Error('signature not recorded');
    const replay = await v.verify({ signature: sig, expectedSol: 0.1, plot: 300, level: 2 });
    if (replay.ok !== false || replay.reason !== 'already_applied') throw new Error(`replay: ${JSON.stringify(replay)}`);
    if (v.appliedCount() !== 1) throw new Error('replay grew the ledger');
    // a RESTART must not let one paid transaction buy a second upgrade
    const v2 = createUpgradePaymentVerifier({ fetchImpl: fetchOk(txJson(0.1 * LAMPORTS)), storePath: store });
    const afterRestart = await v2.verify({ signature: sig, expectedSol: 0.1, plot: 300, level: 2 });
    if (afterRestart.ok !== false || afterRestart.reason !== 'already_applied') throw new Error(`restart replay: ${JSON.stringify(afterRestart)}`);
  }],

  ['wrong amount rejected and NOT consumed (the signature stays unusable)', async () => {
    const v = createUpgradePaymentVerifier({ fetchImpl: fetchOk(txJson(0.2 * LAMPORTS)) });
    const sig = sig64();
    const r = await v.verify({ signature: sig, expectedSol: 0.1, plot: 300, level: 2 });
    if (r.ok !== false || r.reason !== 'wrong_amount') throw new Error(`wrong amount: ${JSON.stringify(r)}`);
    if (v.appliedCount() !== 0) throw new Error('rejected signature was recorded');
    // one lamport off is still wrong
    const v2 = createUpgradePaymentVerifier({ fetchImpl: fetchOk(txJson(0.1 * LAMPORTS + 1)) });
    const r3 = await v2.verify({ signature: sig64(), expectedSol: 0.1, plot: 300, level: 2 });
    if (r3.ok !== false || r3.reason !== 'wrong_amount') throw new Error(`off-by-one lamport: ${JSON.stringify(r3)}`);
  }],

  ['wrong recipient rejected (treasury not paid / not present in the transaction)', async () => {
    const v = createUpgradePaymentVerifier({ fetchImpl: fetchOk(txJson(0.1 * LAMPORTS, { includeTreasury: false })) });
    const r = await v.verify({ signature: sig64(), expectedSol: 0.1, plot: 300, level: 2 });
    if (r.ok !== false || r.reason !== 'wrong_recipient') throw new Error(`recipient: ${JSON.stringify(r)}`);
    // treasury in the keys but received 0 (e.g. it only paid rent back) → also wrong recipient
    const v2 = createUpgradePaymentVerifier({ fetchImpl: fetchOk(txJson(0)) });
    const r2 = await v2.verify({ signature: sig64(), expectedSol: 0.1, plot: 300, level: 2 });
    if (r2.ok !== false || r2.reason !== 'wrong_recipient') throw new Error(`zero delta: ${JSON.stringify(r2)}`);
  }],

  ['unconfirmed / failed / RPC-broken transactions are rejected without consuming anything', async () => {
    const unconfirmed = createUpgradePaymentVerifier({ fetchImpl: fetchOk({ jsonrpc: '2.0', result: null }) });
    if ((await unconfirmed.verify({ signature: sig64(), expectedSol: 0.1, plot: 1, level: 2 })).reason !== 'unconfirmed') throw new Error('null result not handled');
    const failed = createUpgradePaymentVerifier({ fetchImpl: fetchOk(txJson(0.1 * LAMPORTS, { err: { InstructionError: [0, 0] } })) });
    if ((await failed.verify({ signature: sig64(), expectedSol: 0.1, plot: 1, level: 2 })).reason !== 'failed_onchain') throw new Error('failed tx not handled');
    const broken = createUpgradePaymentVerifier({ fetchImpl: fetchErr() });
    if ((await broken.verify({ signature: sig64(), expectedSol: 0.1, plot: 1, level: 2 })).reason !== 'rpc_unavailable') throw new Error('rpc failure not handled');
    for (const v of [unconfirmed, failed, broken]) if (v.appliedCount() !== 0) throw new Error('a rejected path recorded a signature');
  }],

  ['malformed signatures rejected before any RPC call', async () => {
    let calls = 0;
    const counting = async () => { calls++; return { ok: true, json: async () => txJson(0.1 * LAMPORTS) }; };
    const v = createUpgradePaymentVerifier({ fetchImpl: counting });
    for (const bad of ['', 'not-base58!!', 'iii', base58Encode(crypto.randomBytes(32)), base58Encode(crypto.randomBytes(65))]) {
      const r = await v.verify({ signature: bad, expectedSol: 0.1, plot: 1, level: 2 });
      if (r.ok !== false || r.reason !== 'malformed_signature') throw new Error(`bad sig accepted: ${JSON.stringify(bad)}`);
    }
    if (calls !== 0) throw new Error('malformed signature reached the RPC');
  }],

  // ── treasury routing of verified upgrade SOL ──
  ['verified on-chain upgrade SOL follows the received-funds split (80% buyback / 20% gas)', () => {
    const t = createTreasury();
    const r = t.receiveUpgradeSol('Payer', 0.5);
    if (!r.ok || r.settled !== 'onchain') throw new Error(`receive: ${JSON.stringify(r)}`);
    if (t.pendingBuyback !== 0.4 || t.gasReserve !== 0.1) throw new Error(`split: buyback ${t.pendingBuyback} gas ${t.gasReserve}`);
    if (t.balance !== 0) throw new Error('SOL must not mint tokens before the swap');
    const ev = t.ledger().find((e) => e.kind === 'upgrade_in');
    if (!ev || ev.sol !== 0.5 || ev.buyback !== 0.4 || ev.gas !== 0.1 || ev.settled !== 'onchain') throw new Error(`ledger: ${JSON.stringify(ev)}`);
  }],

  ['dev mode produces the SAME server-side state changes without on-chain verification', () => {
    const dev = createTreasury();
    // exactly what the server handler passes in dev mode: the client paid its
    // own demo wallet (reported), the settled label marks the dev shortcut
    const rd = dev.payUpgrade('Dev', 0.25, { reported: true, settled: 'dev' });
    if (!rd.ok || rd.settled !== 'dev') throw new Error(`dev: ${JSON.stringify(rd)}`);
    const live = createTreasury();
    const rl = live.receiveUpgradeSol('Live', 0.25);
    if (dev.pendingBuyback !== live.pendingBuyback || dev.gasReserve !== live.gasReserve) {
      throw new Error(`dev ${dev.pendingBuyback}/${dev.gasReserve} != strict ${live.pendingBuyback}/${live.gasReserve}`);
    }
    const kd = dev.ledger().find((e) => e.kind === 'upgrade_in');
    const kl = live.ledger().find((e) => e.kind === 'upgrade_in');
    if (kd.sol !== kl.sol || kd.buyback !== kl.buyback || kd.gas !== kl.gas) throw new Error('ledger shapes differ');
    if (kd.settled !== 'dev' || kl.settled !== 'onchain') throw new Error('settled labels wrong');
  }],

  // ── the payout weight the upgrade proceeds feed ──
  ['upgrade level raises the plot-scoring weight the payout engine uses', () => {
    const base = { owner: 'Alice', type: 'shop', progress: 30, done: true, garden: false };
    const s1 = plotScore({ ...base, level: 1 });
    const s2 = plotScore({ ...base, level: 2 });
    const s4 = plotScore({ ...base, level: 4 });
    if (s1 !== (20 + BUILD_BLOCKS.shop) * UPGRADE_MULT[0]) throw new Error(`L1 score ${s1}`);
    if (s2 !== (20 + BUILD_BLOCKS.shop) * UPGRADE_MULT[1]) throw new Error(`L2 score ${s2}`);
    if (s4 !== (20 + BUILD_BLOCKS.shop) * UPGRADE_MULT[3]) throw new Error(`L4 score ${s4}`);
    if (!(s1 < s2 && s2 < s4)) throw new Error('score must rise with upgrade level');
  }],
];

runTests(tests);
