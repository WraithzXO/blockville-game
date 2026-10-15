// ── Solana primitives for the treasury's real on-chain paths ────────────────
// Zero-dependency Ed25519 signing, legacy/v0 transaction serialization, PDA
// derivation and JSON-RPC calls over plain public RPC (no API keys, no new
// services). Key material only ever arrives through the runtime-loaded
// keypair handle — nothing here reads, stores or logs secrets.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { base58Encode, base58Decode } from './auth.mjs';

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

// ── compact-u16 (sleb128-style unsigned) ─────────────────────────────────────
export function encodeCompactU16(n) {
  const out = [];
  let v = Number(n);
  if (!Number.isInteger(v) || v < 0) throw new Error('bad_compact_value');
  while (true) {
    let byte = v & 0x7f;
    v >>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
    if (v === 0) break;
  }
  return Buffer.from(out);
}

export function decodeCompactU16(buf, offset) {
  let value = 0n, shift = 0n, pos = offset;
  while (true) {
    if (pos >= buf.length) throw new Error('truncated_compact');
    const byte = buf[pos++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
    if (shift > 28n) throw new Error('compact_too_long');
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num)) throw new Error('compact_overflow');
  return { value: num, end: pos };
}

// ── Ed25519 keys (node:crypto, no dependencies) ──────────────────────────────
const PKCS8_SEED_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PUB_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

// Solana keypair files are [seed(32), publicKey(32)] — the same 64-byte
// layout `solana-keygen new` writes.
export function loadKeypairFile(keypairPath) {
  const raw = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  if (!Array.isArray(raw) || raw.length !== 64 || raw.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
    throw new Error('bad_keypair_file');
  }
  const seed = Buffer.from(raw.slice(0, 32));
  const pub = Buffer.from(raw.slice(32));
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_SEED_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  // the file's own public half must actually match the seed — refuse drift
  const derived = publicKeyFromSeed(seed);
  if (!derived.equals(pub)) throw new Error('keypair_pubkey_mismatch');
  return {
    path: keypairPath,
    publicKey: pub,
    publicKeyBase58: base58Encode(pub),
    sign: (message) => crypto.sign(null, message, priv),
  };
}

export function publicKeyFromSeed(seed) {
  const priv = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_SEED_PREFIX, seed]), format: 'der', type: 'pkcs8' });
  return Buffer.from(crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32));
}

export function verifySignature(pubBytes, msgBytes, sigBytes) {
  try {
    const pub = crypto.createPublicKey({ key: Buffer.concat([SPKI_PUB_PREFIX, pubBytes]), format: 'der', type: 'spki' });
    return crypto.verify(null, msgBytes, pub, sigBytes);
  } catch { return false; }
}

// ── on-curve check (Edwards25519 point membership, Euler-criterion form) ────
// Used by PDA derivation: a valid program address is OFF the ed25519 curve.
const modPow = (b, e, m) => {
  let r = 1n;
  b %= m;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
};

export function isOnCurve(pubBytes) {
  if (!Buffer.isBuffer(pubBytes) || pubBytes.length !== 32) return false;
  const P = (1n << 255n) - 19n;
  const inv121666 = modPow(121666n, P - 2n, P);
  const D = ((-121665n % P) * inv121666) % P;
  let y = 0n;
  for (let i = 31; i >= 0; i--) y = (y << 8n) | BigInt(pubBytes[i]); // little-endian
  y &= (1n << 255n) - 1n; // clear the sign bit
  if (y >= P) return false;
  const y2 = (y * y) % P;
  const u = (y2 - 1n + P) % P;
  const v = (D * y2 + 1n) % P;
  if (v === 0n) return u === 0n; // degenerate: only the identity maps here
  // Euler's criterion: x² = u/v is solvable iff (u·v)^((p−1)/2) ≡ 1 (mod p).
  // (This is the COMPLETE test — the ref10 candidate-recovery shortcut needs
  // an extra ±√−1 correction step that this check must not skip.)
  let pow = 1n, b = (u * v) % P, e = (P - 1n) / 2n;
  while (e > 0n) {
    if (e & 1n) pow = (pow * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return pow === 1n;
}

// ── PDA / ATA derivation ─────────────────────────────────────────────────────
// canonical findProgramAddress: sha256(seeds ‖ bump ‖ programId ‖ "ProgramDerivedAddress"),
// bump starting at 255 and descending, first OFF-curve result wins.
export function findProgramAddress(seeds, programIdBytes) {
  for (let bump = 255; bump >= 0; bump--) {
    const hash = crypto.createHash('sha256')
      .update(Buffer.concat([...seeds, Buffer.from([bump]), programIdBytes, Buffer.from('ProgramDerivedAddress')]))
      .digest();
    if (!isOnCurve(hash)) return { address: hash, bump };
  }
  throw new Error('no_valid_bump');
}

export function findAssociatedTokenAccount(ownerBase58, mintBase58) {
  const owner = base58Decode(ownerBase58);
  const mint = base58Decode(mintBase58);
  const ataProgram = base58Decode(ATA_PROGRAM_ID);
  const tokenProgram = base58Decode(TOKEN_PROGRAM_ID);
  if (owner.length !== 32 || mint.length !== 32) throw new Error('bad_pubkey_length');
  const { address } = findProgramAddress([owner, tokenProgram, mint], ataProgram);
  return base58Encode(address);
}

// ── message / transaction serialization ──────────────────────────────────────
// Legacy message: header(3) ‖ compact(keys) ‖ keys ‖ blockhash(32) ‖ compact(ixs) ‖ ixs
// Instruction: programIndex(1) ‖ compact(accounts) ‖ indexes ‖ compact(data) ‖ data
export function buildLegacyMessage({ payer, keys, instructions, recentBlockhash }) {
  // keys: array of { pubkey: Buffer, signer?, writable? } — [0] is the payer.
  const numRequiredSignatures = keys.filter((k) => k.signer).length;
  const signedKeys = keys.slice(0, numRequiredSignatures); // signers must come first
  const unsigned = keys.slice(numRequiredSignatures);
  const numReadonlySigned = signedKeys.filter((k) => !k.writable).length;
  const numReadonlyUnsigned = unsigned.filter((k) => !k.writable).length;
  if (numRequiredSignatures < 1 || !signedKeys[0].pubkey.equals(payer)) throw new Error('payer_not_first_signer');

  const header = Buffer.from([numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned]);
  const body = Buffer.concat([
    header,
    encodeCompactU16(keys.length),
    Buffer.concat(keys.map((k) => k.pubkey)),
    Buffer.from(recentBlockhash), // 32 raw bytes
    encodeCompactU16(instructions.length),
    Buffer.concat(instructions.map((ix) => Buffer.concat([
      Buffer.from([ix.programIndex]),
      encodeCompactU16(ix.accounts.length),
      Buffer.from(ix.accounts),
      encodeCompactU16(ix.data.length),
      ix.data,
    ]))),
  ]);
  return body;
}

// Convenience used by payouts.mjs: resolves account indices by pubkey buffer.
export function accountIndexLookup(keys) {
  const map = new Map();
  keys.forEach((k, i) => { const hex = k.pubkey.toString('hex'); if (!map.has(hex)) map.set(hex, i); });
  return (pub) => {
    const i = map.get(pub.toString('hex'));
    if (i === undefined) throw new Error('instruction_key_missing');
    return i;
  };
}

export function serializeSignedTransaction(messageBytes, signatures) {
  return Buffer.concat([encodeCompactU16(signatures.length), Buffer.concat(signatures), messageBytes]);
}

// Parses legacy or versioned v0 transactions. Returns { version, signatures,
// messageBytes, staticAccountKeys } — enough to (a) assert the fee payer is
// the first static key and (b) sign position 0 without understanding ALTs.
export function parseTransaction(buf) {
  let pos = 0;
  let version = 'legacy';
  let versionByte = null;
  if (buf[0] & 0x80) {
    version = buf[0] & 0x7f;
    pos = 1;
    versionByte = buf[0];
    if (version > 0) throw new Error('unsupported_tx_version');
  }
  const sigCount = decodeCompactU16(buf, pos);
  pos = sigCount.end;
  const signatures = [];
  for (let i = 0; i < sigCount.value; i++) {
    signatures.push(buf.subarray(pos, pos + 64));
    pos += 64;
  }
  const messageBytes = buf.subarray(pos);
  const header = messageBytes[0]; // numRequiredSignatures
  let cursor = 1 + 2; // skip the other two header bytes
  const keyCount = decodeCompactU16(messageBytes, cursor);
  cursor = keyCount.end;
  const staticAccountKeys = [];
  for (let i = 0; i < keyCount.value; i++) {
    staticAccountKeys.push(messageBytes.subarray(cursor, cursor + 32));
    cursor += 32;
  }
  if (header < 1) throw new Error('no_required_signatures');
  return { version, versionByte, signatures, messageBytes, staticAccountKeys, numRequiredSignatures: header };
}

// Signs position 0 (the fee payer) of an already-built transaction. The
// message bytes are signed VERBATIM — nothing about the transaction is
// modified. Returns the fully serialized tx ready for sendTransaction.
export function signTransactionPosition0(rawTx, keypair) {
  const parsed = parseTransaction(Buffer.isBuffer(rawTx) ? rawTx : Buffer.from(rawTx));
  if (parsed.numRequiredSignatures !== 1) throw new Error('multi_signer_refused');
  if (!parsed.staticAccountKeys[0].equals(keypair.publicKey)) throw new Error('payer_mismatch');
  const sig = keypair.sign(parsed.messageBytes);
  if (!verifySignature(keypair.publicKey, parsed.messageBytes, sig)) throw new Error('self_verify_failed');
  const sigs = [...parsed.signatures];
  sigs[0] = sig;
  return Buffer.concat([
    ...(parsed.versionByte != null ? [Buffer.from([parsed.versionByte])] : []),
    encodeCompactU16(sigs.length),
    Buffer.concat(sigs),
    parsed.messageBytes,
  ]);
}

// ── JSON-RPC over a public endpoint ──────────────────────────────────────────
// Returns the `result` member directly; throws on transport/HTTP/RPC errors
// so callers can retry with backoff. Never sends or logs key material.
export async function rpcCall(url, method, params, fetchImpl, { timeoutMs = 30_000 } = {}) {
  const f = fetchImpl ?? fetch;
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'bv', method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`rpc ${method} http_${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`rpc ${method}: ${json.error.message ?? 'rpc_error'}`);
  return json.result;
}

// ── balance deltas from a getTransaction meta ────────────────────────────────
// SOL lamport delta for `address` (positive = received). The fee is already
// reflected in the balances, so a plain transfer shows the exact amount.
export function solDeltaFromMeta(meta, accountKeys, address) {
  const keys = (accountKeys ?? []).map((k) => (typeof k === 'string' ? k : k?.pubkey));
  const idx = keys.indexOf(address);
  if (idx < 0) return 0;
  const pre = meta?.preBalances?.[idx];
  const post = meta?.postBalances?.[idx];
  if (!Number.isFinite(pre) || !Number.isFinite(post)) return 0;
  return post - pre;
}

// SPL token raw-unit delta for `ownerAddress`'s token account of `mint`
// (positive = received). Reads the pre/post token balances by account index.
export function tokenDeltaFromMeta(meta, accountKeys, ownerAddress, mint) {
  const keys = (accountKeys ?? []).map((k) => (typeof k === 'string' ? k : k?.pubkey));
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== ownerAddress) continue;
    const pre = meta?.preTokenBalances?.find((b) => b.accountIndex === i && (!mint || b.mint === mint));
    const post = meta?.postTokenBalances?.find((b) => b.accountIndex === i && (!mint || b.mint === mint));
    if (!pre && !post) continue;
    return Number(post?.uiTokenAmount?.amount ?? 0) - Number(pre?.uiTokenAmount?.amount ?? 0);
  }
  return 0;
}
