// ── Real claim/payout transfers (real-path chunk) ────────────────────────────
// Executes the FINAL on-chain step of a player's fee claim: an SPL token
// transfer from the treasury's $BLOCKVILLE token account to the player's
// session-verified wallet. The wallet address arrives resolved from server
// records only (Ed25519-verified sessions); never from client input.
//
//   - If the recipient's associated token account does not exist it is
//     created in the same transaction, funded from the treasury's SOL
//     balance — which IS the gas reserve in the one-wallet design (~0.002
//     SOL rent). The ATA creation is ledgered separately by the caller.
//   - The claimable-balance ACCRUAL is untouched; only this final step is new.
//   - Idempotent by transaction signature: the caller persists the pending
//     signature; if it is ever lost, findRecentPayout() recovers the transfer
//     from the treasury token account's recent on-chain history so a claim
//     can never pay twice.
//
// Failure semantics: a send that never reached chain returns
// { ok:false, reason:'send_failed' } with NO signature — the claimable
// balance stays intact for retry. A transaction sent but not confirmed
// returns { ok:false, reason:'unconfirmed', signature } — the caller keeps
// it pending and resolves the SAME signature later (success → finalize once;
// failure → free to retry fresh). No path spends the SOL twice.

import {
  SYSTEM_PROGRAM_ID, TOKEN_PROGRAM_ID, ATA_PROGRAM_ID,
  rpcCall, buildLegacyMessage, accountIndexLookup, signTransactionPosition0,
  findAssociatedTokenAccount,
} from './solana.mjs';
import { base58Decode } from './auth.mjs';

const TRANSFER_IX_TAG = 3; // SPL Token program: TransferChecked is 12; plain Transfer is 3
const ATA_CREATE_IX_TAG = 0;

export function createPayoutSender(opts = {}) {
  const rpcUrl = opts.rpcUrl;
  const mint = opts.mint;
  const payer = opts.payer; // treasury keypair handle { publicKey, publicKeyBase58, sign }
  let configuredTokenAccount = opts.treasuryTokenAccount || null;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const confirmTimeoutMs = opts.confirmTimeoutMs ?? 20_000;
  let cachedTokenAccount = null;

  // The treasury's $BLOCKVILLE token account: a configured address wins,
  // otherwise the funded account is resolved once via public RPC.
  const tokenAccount = async () => {
    if (configuredTokenAccount) return configuredTokenAccount;
    if (cachedTokenAccount) return cachedTokenAccount;
    const res = await rpcCall(rpcUrl, 'getTokenAccountsByOwner', [payer.publicKeyBase58, { mint, encoding: 'jsonParsed' }], fetchImpl);
    const list = res?.value ?? [];
    if (!list.length) throw new Error('no_treasury_token_account');
    list.sort((a, b) => Number(b?.account?.data?.parsed?.info?.tokenAmount?.amount ?? 0) - Number(a?.account?.data?.parsed?.info?.tokenAmount?.amount ?? 0));
    cachedTokenAccount = list[0].pubkey;
    return cachedTokenAccount;
  };

  const call = (method, params) => rpcCall(rpcUrl, method, params, fetchImpl);

  // Build + sign one claim transaction. `createAta` prepends the idempotent
  // Create-ATA instruction funded by the payer (the gas reserve).
  const buildClaimTx = async ({ wallet, tokens, createAta }) => {
    const blockhashRes = await call('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    const blockhash = blockhashRes?.value?.blockhash;
    if (!blockhash) throw new Error('no_blockhash');
    const blockhashBytes = base58Decode(blockhash);
    // Resolve the treasury's $BLOCKVILLE token account HERE — this scope does
    // not see sendPayout's local binding (spec-caught ReferenceError).
    const treasuryTokenAccount = await tokenAccount();

    const payerPub = payer.publicKey;
    const ata = findAssociatedTokenAccount(wallet, mint);
    const ro = (b58) => ({ pubkey: base58Decode(b58), writable: false, signer: false });
    const wr = (b58) => ({ pubkey: base58Decode(b58), writable: true, signer: false });

    // Keys order: signers first, then writable unsigned, then readonly unsigned.
    const keys = createAta ? [
      { pubkey: payerPub, signer: true, writable: true },  // 0 payer (gas reserve funds fee + rent)
      wr(ata),                                             // 1 recipient ATA (created)
      wr(treasuryTokenAccount),                            // 2 source token account
      ro(mint),                                            // 3 mint
      ro(TOKEN_PROGRAM_ID),                                // 4
      ro(ATA_PROGRAM_ID),                                  // 5
      ro(SYSTEM_PROGRAM_ID),                               // 6
    ] : [
      { pubkey: payerPub, signer: true, writable: true },  // 0 payer
      wr(ata),                                             // 1 recipient ATA (exists)
      wr(treasuryTokenAccount),                            // 2 source token account
      ro(TOKEN_PROGRAM_ID),                                // 3
    ];
    const ix = accountIndexLookup(keys);
    const instructions = [];
    if (createAta) {
      instructions.push({
        programIndex: ix(base58Decode(ATA_PROGRAM_ID)),
        accounts: [ix(payerPub), ix(base58Decode(ata)), ix(payerPub), ix(base58Decode(mint)), ix(base58Decode(SYSTEM_PROGRAM_ID)), ix(base58Decode(TOKEN_PROGRAM_ID))],
        data: Buffer.from([ATA_CREATE_IX_TAG]),
      });
    }
    const amountBytes = Buffer.alloc(8);
    amountBytes.writeBigUInt64LE(BigInt(Math.floor(tokens)));
    instructions.push({
      programIndex: ix(base58Decode(TOKEN_PROGRAM_ID)),
      accounts: [ix(base58Decode(treasuryTokenAccount)), ix(base58Decode(ata)), ix(payerPub)],
      data: Buffer.concat([Buffer.from([TRANSFER_IX_TAG]), amountBytes]),
    });
    const message = buildLegacyMessage({ payer: payerPub, keys, instructions, recentBlockhash: blockhashBytes });
    const signed = signTransactionPosition0(wrapLegacy(message), payer);
    return { signed, ata, createAta };
  };

  // NOTE on the wrapping above: signTransactionPosition0 expects a full
  // serialized transaction (signature section + message). We prepend a legacy
  // header (version byte absent for legacy; signature count 1, empty 64-byte
  // placeholder) — parseTransaction reads count=1, skips 64 bytes, and the
  // remaining bytes are exactly our message.
  const wrapLegacy = (message) => Buffer.concat([
    Buffer.from([1]), // compact-u16 signature count = 1
    Buffer.alloc(64), // empty signature placeholder, replaced when signing
    message,
  ]);

  const checkSignature = async (sig) => {
    const res = await call('getSignatureStatuses', [[sig], { searchHistory: false }]);
    const st = res?.value?.[0] ?? null;
    if (!st) return 'unknown';
    if (st.err) return 'failed';
    if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized' || (st.confirmations ?? 0) > 0) return 'success';
    return 'unknown';
  };

  const sendAndConfirm = async (signed) => {
    let signature;
    try {
      signature = await call('sendTransaction', [
        signed.toString('base64'),
        { encoding: 'base64', skipPreflight: false, maxRetries: 2, preflightCommitment: 'confirmed' },
      ]);
    } catch (e) {
      return { ok: false, reason: 'send_failed', cause: String(e?.message ?? e) };
    }
    if (typeof signature !== 'string' || !signature) return { ok: false, reason: 'send_failed' };
    const deadline = Date.now() + confirmTimeoutMs;
    while (Date.now() < deadline) {
      const st = await checkSignature(signature);
      if (st === 'success') return { ok: true, signature };
      if (st === 'failed') return { ok: false, reason: 'tx_failed', signature };
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { ok: false, reason: 'unconfirmed', signature };
  };

  // Sends one payout. Returns:
  //   { ok:true, signature, feeSol, createdAta }
  //   { ok:false, reason:'send_failed'|'tx_failed' }          — nothing on chain / failed on chain
  //   { ok:false, reason:'unconfirmed', signature }           — caller keeps it pending
  //   { ok:false, reason:'rpc_unavailable'|'build_failed' }   — retriable, nothing sent
  const sendPayout = async ({ wallet, tokens }) => {
    if (!wallet || !Number.isFinite(tokens) || tokens <= 0) return { ok: false, reason: 'invalid_payout' };
    const treasuryTokenAccount = await tokenAccount();
    let meta;
    try {
      const acct = await call('getAccountInfo', [findAssociatedTokenAccount(wallet, mint), { encoding: 'base64' }]);
      meta = { exists: acct?.value != null };
    } catch (e) {
      return { ok: false, reason: 'rpc_unavailable', cause: String(e?.message ?? e) };
    }
    let built;
    try {
      built = await buildClaimTx({ wallet, tokens, createAta: !meta.exists });
    } catch (e) {
      return { ok: false, reason: 'build_failed', cause: String(e?.message ?? e) };
    }
    const res = await sendAndConfirm(built.signed);
    if (res.ok) {
      // Actual lamport fee from the chain (bounded read; bookkeeping only).
      let feeSol = null;
      try {
        const tx = await call('getTransaction', [res.signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]);
        if (Number.isFinite(tx?.meta?.fee)) feeSol = tx.meta.fee / 1e9;
      } catch { /* fee read is best-effort bookkeeping */ }
      return { ok: true, signature: res.signature, feeSol, createdAta: built.createAta };
    }
    return res;
  };

  // On-chain recovery: scan the treasury token account's recent signatures
  // for a transfer of EXACTLY `tokens` tokens TO `wallet` (recipient token
  // balance delta). Used when a pending claim exists without a recorded
  // signature (crash between send and persist). Bounded scan.
  const findRecentPayout = async ({ wallet, tokens, limit = 20 }) => {
    const ata = findAssociatedTokenAccount(wallet, mint);
    try {
      const res = await call('getSignaturesForAddress', [await tokenAccount(), { limit }]);
      const sigs = (Array.isArray(res) ? res : []).map((e) => (typeof e === 'string' ? e : e?.signature)).filter(Boolean);
      for (const sig of sigs) {
        const tx = await call('getTransaction', [sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]);
        if (!tx || tx.meta?.err) continue;
        const keys = tx.transaction?.message?.accountKeys ?? [];
        const idx = keys.findIndex((k) => (typeof k === 'string' ? k : k?.pubkey) === ata);
        if (idx < 0) continue;
        const pre = tx.meta?.preTokenBalances?.find((b) => b.accountIndex === idx);
        const post = tx.meta?.postTokenBalances?.find((b) => b.accountIndex === idx);
        const delta = Number(post?.uiTokenAmount?.amount ?? 0) - Number(pre?.uiTokenAmount?.amount ?? 0);
        if (delta === Math.floor(tokens)) return { found: true, signature: sig };
      }
    } catch { /* RPC trouble: caller stays pending */ }
    return { found: false };
  };

  return {
    name: 'payout-sender',
    sendPayout,
    checkSignature,
    findRecentPayout,
    buildClaimTx, // exposed for tests (asserting the ATA-create path)
  };
}
