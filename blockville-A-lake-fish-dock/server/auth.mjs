// ── Ed25519 wallet-signature verification (auth chunk) ──────────────────────
// Built entirely on Node's built-in `node:crypto` — no new dependency was
// added. Solana wallet addresses are the base58 encoding of a 32-byte Ed25519
// public key, and wallet sign-ins sign a UTF-8 message; Phantom and the other
// common wallets return the 64-byte signature base58-encoded, so that is the
// canonical wire format here.
//
// The raw 32-byte public key is wrapped in the standard SPKI DER prefix for
// Ed25519 (RFC 8410: 302a300506032b6570032100) so `crypto.createPublicKey`
// accepts it, then `crypto.verify(null, message, key, signature)` performs the
// real Ed25519 check (`null` algorithm is REQUIRED for Ed25519 — the curve
// hashes internally; passing e.g. 'sha512' would throw or misbehave).

import crypto from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE = BigInt(ALPHABET.length);

// Standard base58 (Bitcoin alphabet, as used by Solana). Leading zero bytes
// map to leading '1' characters, per the canonical spec.
export function base58Decode(str) {
  if (typeof str !== 'string' || str.length === 0 || str.length > 128) return null;
  for (const ch of str) if (!ALPHABET.includes(ch)) return null;
  let num = 0n;
  for (const ch of str) num = num * BASE + BigInt(ALPHABET.indexOf(ch));
  const bytes = [];
  while (num > 0n) { bytes.unshift(Number(num % 256n)); num /= 256n; }
  for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.unshift(0);
  return Buffer.from(bytes);
}

export function base58Encode(buf) {
  let num = 0n;
  for (const b of buf) num = num * 256n + BigInt(b);
  let out = '';
  while (num > 0n) { out = ALPHABET[Number(num % BASE)] + out; num /= BASE; }
  for (const b of buf) { if (b !== 0) break; out = '1' + out; }
  return out;
}

// RFC 8410 SPKI DER wrapper around a raw 32-byte Ed25519 public key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export function ed25519PublicKeyFromRaw(raw) {
  if (!Buffer.isBuffer(raw) || raw.length !== 32) return null;
  try {
    return crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
      format: 'der',
      type: 'spki',
    });
  } catch { return null; }
}

// Real Ed25519 verification of `message` (UTF-8) against the wallet address
// (base58 public key) with a base58-encoded 64-byte signature.
// Returns true ONLY on a cryptographically valid signature over exactly this
// message by exactly this key — every other input is false, never a throw.
export function verifyWalletSignature({ wallet, message, signature }) {
  const pub = base58Decode(wallet);
  const sig = base58Decode(signature);
  if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return false;
  const key = ed25519PublicKeyFromRaw(pub);
  if (!key) return false;
  try {
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, sig);
  } catch { return false; }
}
