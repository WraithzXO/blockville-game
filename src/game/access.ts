// Entry access (guest-mode chunk): how this tab is playing.
//  - 'wallet': Phantom connected AND the server Ed25519-verified a signed
//    nonce (POST /api/auth/nonce + /api/auth/verify). The session token is the
//    ONLY way a connection binds to a wallet; the server never trusts an
//    address the client merely claims.
//  - 'guest': walk / fish / look only. Every economic message is refused by
//    the server (not just hidden here).
//  - 'demo': dev/demo servers only (no mint configured) — the existing
//    name-keyed demo wallet. A live server refuses economy for it anyway.
// Stored in sessionStorage so a refresh keeps the choice but a new tab asks again.
import { useSyncExternalStore } from 'react';

export type Access = { kind: 'wallet'; wallet: string; session: string } | { kind: 'guest'; guestSession: string | null } | { kind: 'demo' };
const KEY = 'blockville_access';
const listeners = new Set<() => void>();

const load = (): Access | null => {
  try {
    // DEV-ONLY (stripped from production builds): ?autoname=... also skips the entry gate.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      if (q.get('autoguest')) return { kind: 'guest', guestSession: null };
      if (q.get('autoname')) return { kind: 'demo' };
    }
    const raw = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (raw?.kind === 'wallet' && typeof raw.wallet === 'string' && typeof raw.session === 'string') return raw;
    if (raw?.kind === 'guest') return { kind: 'guest', guestSession: typeof raw.guestSession === 'string' ? raw.guestSession : null };
    if (raw?.kind === 'demo') return { kind: 'demo' };
  } catch { /* private mode */ }
  return null;
};
let current: Access | null = load();

export const getAccess = () => current;
export function setAccess(a: Access | null) {
  current = a;
  try { if (a) sessionStorage.setItem(KEY, JSON.stringify(a)); else sessionStorage.removeItem(KEY); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
export const useAccess = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getAccess, getAccess);
// A server-verified economy identity (what the gate lets through on a live server).
export const hasWallet = (a: Access | null): a is Extract<Access, { kind: 'wallet' }> => a?.kind === 'wallet';

const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58Encode(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);
  let out = '';
  while (num > 0n) { out = ALPHA[Number(num % 58n)] + out; num /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}

// Phantom sign-in against the EXISTING backend flow. No wallet library added:
// this talks to the injected Phantom provider directly (as WalletPanel does).
export async function signInWithPhantom(): Promise<Extract<Access, { kind: 'wallet' }>> {
  const w = window as any;
  const provider = w.phantom?.solana ?? w.solana;
  if (!provider?.isPhantom) throw new Error('No Phantom wallet detected in this browser.');
  const res = await provider.connect();
  const wallet = String(res.publicKey?.toString?.() ?? res.publicKey);
  const nres = await fetch('/api/auth/nonce', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet }) });
  if (!nres.ok) throw new Error('The server refused the sign-in request.');
  const { nonce, message } = await nres.json();
  const signed = await provider.signMessage(new TextEncoder().encode(String(message)), 'utf8');
  const sig: Uint8Array = signed.signature ?? signed;
  const vres = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet, nonce, signature: base58Encode(sig) }) });
  const v = await vres.json().catch(() => ({}));
  if (!vres.ok || !v.verified || typeof v.token !== 'string') throw new Error('Wallet verification failed. Please try again.');
  return { kind: 'wallet', wallet, session: v.token };
}
