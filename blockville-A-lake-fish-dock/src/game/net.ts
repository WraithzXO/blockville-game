// ── multiplayer net client ─────────────────────────────────────────────────
// Connects the local player to the Blockville presence hub (server/index.mjs,
// path /ws). Reliably delivers: who is in town, where they are, when they go.
// Movement is throttled to ~10 updates/sec and only sent when actually moving.

import type { PlayerLook } from './config';
import type { FurniturePlacement, ArcadeScore } from './state';

export interface NetPeer {
  id: string;
  name: string;
  look: PlayerLook | null;
  x: number;
  z: number;
  ry: number;
}

// authoritative plot record relayed by the server
export interface NetPlotRecord {
  ownerName: string;
  type: string | null;
  progress: number;
  done: boolean;
  level: number;
}

export interface NetListing {
  id: number;
  plot: number;
  seller: string;
  price: number;
}

// Server-computed treasury payout (Chunk T3): the amount ACCRUED to this
// player's claimable balance this cycle, with the weight that earned it.
export interface TreasuryPayout {
  cycle: number;
  amount: number;
  weight: number;
  totalPoints: number;
  accrued: number;
  paidTotal: number;
  ts: number; // server timestamp for this payout (ms epoch)
}

// Lifetime fees earned (earnings-card chunk): one authoritative snapshot of
// this player's payout ledger records — the total and the per-cycle entries
// behind it. Never client-computed.
export interface FeesEntry {
  cycle: number;
  amount: number;
  ts: number | null;
}

export interface FeesEarned {
  total: number;
  entries: FeesEntry[];
}

// Cycle summary broadcast to everyone after a distribution completes.
export interface TreasuryCycle {
  cycle: number;
  balanceBefore: number;
  balanceAfter: number;
  distributable: number;
  paid: number;
  remainder: number;
  totalPoints: number;
}

// Casino blackjack table state — rendered by the client, never computed here.
// Cards, results and balances all come from the server; the client is a view.
export interface BlackjackState {
  phase: string; // 'betting' | 'player' | 'done'
  ok: boolean;
  balance: number; // server-side ledger balance — the ONLY balance shown
  bet: number;
  treasury: number;
  you: string[]; // compact cards, e.g. 'AS', '10H'
  dealer: string[];
  holeHidden: boolean;
  result: { outcome: string; bet: number; payout: number } | null;
}

export interface NetHandlers {
  onWelcome: (selfId: string, peers: NetPeer[], plots: Array<[number, NetPlotRecord]>, houses: Array<[number, FurniturePlacement[]]>, arcadeScores: ArcadeScore[], listings: NetListing[]) => void;
  onJoin: (peer: NetPeer) => void;
  onPos: (id: string, x: number, z: number, ry: number) => void;
  onLook: (id: string, look: PlayerLook) => void;
  onName: (id: string, name: string) => void;
  onLeave: (id: string) => void;
  onClaim: (plot: number, rec: NetPlotRecord, prev?: string, price?: number) => void;
  onBuild: (plot: number, progress: number, done: boolean, type?: string) => void;
  onUpgrade: (plot: number, level: number) => void;
  onStatus: (online: boolean) => void;
  onHouseState: (plot: number, placements: FurniturePlacement[]) => void;
  onArcadeScores: (scores: ArcadeScore[]) => void;
  onBlackjack?: (s: BlackjackState) => void;
  onSimClaim: (plot: number, type: string, name: string) => void;
  onSimList: (listing: NetListing) => void;
  onUnlist: (id: number) => void;
  onSimBuy: (id: number, plot: number, ownerName: string, sellerName: string, price: number) => void;
  onTreasuryPayout: (p: TreasuryPayout) => void;
  onTreasuryCycle: (c: TreasuryCycle) => void;
  onFeesEarned: (f: FeesEarned) => void;
  // Chunk 6: server-computed plot entitlement, revocations and claim refusals
  onEntitlement: (e: { tokens: number | null; entitlement: number; claimed: number; verified: boolean; source: string }) => void;
  onPlotRevoked: (plot: number, prevOwner: string) => void;
  onClaimDenied: (plot: number, reason: string) => void;
  // Real SOL upgrade payments: in live/strict mode the server demands an
  // on-chain payment before applying an upgrade. A quote means "not applied
  // yet — pay first"; a rejection means the submitted payment signature
  // could not be verified on-chain.
  onUpgradeQuote: (q: { plot: number; level: number; sol: number; treasury: string }) => void;
  onUpgradeRejected: (plot: number, level: number, reason: string) => void;
  // One character per wallet: the server refused this connection because the
  // VERIFIED wallet already holds an active character elsewhere (another tab
  // or window). retryAfterMs is the earliest the session becomes reclaimable.
  onSessionTaken: (info: { reason: string; retryAfterMs: number }) => void;
  // Guest-mode chunk: the server's verdict on who this connection IS, and its
  // refusal of any economic message from a connection without a verified wallet.
  onIdentity?: (info: { wallet: string | null; guest: boolean; guestSession: string | null }) => void;
  onEconomyDenied?: (info: { action: string; message: string }) => void;
}

const MAX_NAME = 12;

// Same origin by default: the socket lives at <ws|wss>://<page host>/ws, with the
// scheme following the page (wss on https). VITE_WS_URL overrides this only for a
// genuinely separate backend. Returns null when neither applies.
export function resolveSocketUrl(override: string | undefined, loc: Location | undefined = typeof location !== 'undefined' ? location : undefined): string | null {
  if (override) return override;
  if (!loc) return null;
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/ws`;
}

export class NetClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sendTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private session: string | null = null;
  private guest = false;
  private guestSession: string | null = null;
  private blockedUntil = 0;
  private name = 'Resident';
  private look: PlayerLook | null = null;
  private lastX = NaN;
  private lastZ = NaN;
  private lastRy = NaN;
  private getPos: () => { x: number; z: number; ry: number } = () => ({ x: 0, z: 0, ry: 0 });
  // world shape sent once with the join so the server can seed its market sim
  private world: { plotIds: number[]; community: Array<[number, string]> } = { plotIds: [], community: [] };

  constructor(private handlers: NetHandlers) {}

  connect(name: string, look: PlayerLook, getPos: () => { x: number; z: number; ry: number }, world?: { plotIds: number[]; community: Array<[number, string]> }) {
    this.name = name.slice(0, MAX_NAME) || 'Resident';
    this.look = look;
    this.getPos = getPos;
    if (world) this.world = world;
    if (this.disposed) return;

    const url = resolveSocketUrl(import.meta.env.VITE_WS_URL as string | undefined);
    if (!url) {
      // no guessing a port: a missing URL is a configuration error, shown loudly
      console.error('[blockville] no multiplayer socket URL: set VITE_WS_URL or load the game from its own origin');
      this.handlers.onStatus(false);
      return;
    }

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.handlers.onStatus(true);
      // The session token (when the wallet-auth flow provided one) is the ONLY
      // way a connection binds to a verified wallet — the server keys the
      // one-character-per-wallet lock on that verified identity alone.
      this.send({ t: 'join', name: this.name, look: this.look, ...getPos(), plotIds: this.world.plotIds, community: this.world.community, ...(this.session ? { session: this.session } : {}), ...(this.guest && !this.session ? { guest: true, ...(this.guestSession ? { guestSession: this.guestSession } : {}) } : {}) });
      this.lastX = NaN; // force a position send on the next tick
      if (this.sendTimer) clearInterval(this.sendTimer);
      this.sendTimer = setInterval(() => this.tickPos(getPos), 100);
    };

    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      switch (msg.t) {
        case 'welcome':
          this.handlers.onIdentity?.({ wallet: typeof msg.wallet === 'string' ? msg.wallet : null, guest: msg.guest === true, guestSession: typeof msg.guestSession === 'string' ? msg.guestSession : null });
          this.handlers.onWelcome(String(msg.id), (msg.peers as NetPeer[]) ?? [], (msg.plots as Array<[number, NetPlotRecord]>) ?? [], (msg.houses as Array<[number, FurniturePlacement[]]>) ?? [], (msg.arcadeScores as ArcadeScore[]) ?? [], (msg.listings as NetListing[]) ?? []);
          if (msg.bj) this.handlers.onBlackjack?.(msg.bj as BlackjackState);
          break;
        case 'bj':
          this.handlers.onBlackjack?.({
            phase: String(msg.phase ?? 'betting'),
            ok: msg.ok === true,
            balance: Number(msg.balance) || 0,
            bet: Number(msg.bet) || 0,
            treasury: Number(msg.treasury) || 0,
            you: (msg.you as string[]) ?? [],
            dealer: (msg.dealer as string[]) ?? [],
            holeHidden: msg.holeHidden === true,
            result: (msg.result as BlackjackState['result']) ?? null,
          });
          break;
        case 'join':
          this.handlers.onJoin(msg.player as NetPeer);
          break;
        case 'pos':
          this.handlers.onPos(String(msg.id), Number(msg.x), Number(msg.z), Number(msg.ry));
          break;
        case 'look':
          this.handlers.onLook(String(msg.id), msg.look as PlayerLook);
          break;
        case 'name':
          this.handlers.onName(String(msg.id), String(msg.name));
          break;
        case 'leave':
          this.handlers.onLeave(String(msg.id));
          break;
        case 'economyDenied':
          this.handlers.onEconomyDenied?.({ action: String(msg.action ?? ''), message: String(msg.message ?? 'Connect a wallet to play.') });
          break;
        case 'sessionTaken': {
          const retryAfterMs = Math.min(60_000, Math.max(1_000, Number(msg.retryAfterMs) || 45_000));
          // Stop reconnect-spamming until the session becomes reclaimable;
          // then resume automatically so the player always gets back in.
          this.blockedUntil = Date.now() + retryAfterMs;
          try { this.ws?.close(); } catch { /* already closing */ }
          this.handlers.onSessionTaken({ reason: String(msg.reason ?? 'This wallet already has an active character in another tab or window.'), retryAfterMs });
          break;
        }
        case 'claim':
          this.handlers.onClaim(Number(msg.plot), { ownerName: String(msg.ownerName), type: (msg.type as string) ?? null, progress: Number(msg.progress) || 0, done: msg.done === true, level: Math.max(1, Number(msg.level) || 1) }, typeof msg.prev === 'string' ? msg.prev : undefined, Number.isFinite(Number(msg.price)) ? Number(msg.price) : undefined);
          break;
        case 'build':
          this.handlers.onBuild(Number(msg.plot), Number(msg.progress) || 0, msg.done === true, typeof msg.type === 'string' ? msg.type : undefined);
          break;
        case 'upgrade':
          this.handlers.onUpgrade(Number(msg.plot), Math.max(1, Number(msg.level) || 1));
          break;
        case 'simClaim':
          this.handlers.onSimClaim(Number(msg.plot), String(msg.type ?? ''), String(msg.name ?? ''));
          break;
        case 'simList':
          this.handlers.onSimList({ id: Number(msg.id), plot: Number(msg.plot), seller: String(msg.seller ?? ''), price: Number(msg.price) || 0 });
          break;
        case 'unlist':
          this.handlers.onUnlist(Number(msg.id));
          break;
        case 'simBuy':
          this.handlers.onSimBuy(Number(msg.id), Number(msg.plot), String(msg.ownerName ?? ''), String(msg.sellerName ?? ''), Number(msg.price) || 0);
          break;
        case 'treasuryPayout':
          this.handlers.onTreasuryPayout({
            cycle: Number(msg.cycle) || 0,
            amount: Number(msg.amount) || 0,
            weight: Number(msg.weight) || 0,
            totalPoints: Number(msg.totalPoints) || 0,
            accrued: Number(msg.accrued) || 0,
            paidTotal: Number(msg.paidTotal) || 0,
            ts: Number.isFinite(Number(msg.ts)) ? Number(msg.ts) : Date.now(),
          });
          break;
        case 'feesEarned': {
          const entries = Array.isArray(msg.entries) ? msg.entries : [];
          this.handlers.onFeesEarned({
            total: Math.max(0, Math.floor(Number(msg.total) || 0)),
            entries: entries.map((e: Record<string, unknown>) => ({
              cycle: Math.max(0, Math.floor(Number((e as { cycle?: unknown }).cycle) || 0)),
              amount: Math.max(0, Math.floor(Number((e as { amount?: unknown }).amount) || 0)),
              ts: Number.isFinite(Number((e as { ts?: unknown }).ts)) ? Number((e as { ts?: unknown }).ts) : null,
            })),
          });
          break;
        }
        case 'treasuryCycle':
          this.handlers.onTreasuryCycle({
            cycle: Number(msg.cycle) || 0,
            balanceBefore: Number(msg.balanceBefore) || 0,
            balanceAfter: Number(msg.balanceAfter) || 0,
            distributable: Number(msg.distributable) || 0,
            paid: Number(msg.paid) || 0,
            remainder: Number(msg.remainder) || 0,
            totalPoints: Number(msg.totalPoints) || 0,
          });
          break;
        case 'houseState':
          this.handlers.onHouseState(Number(msg.plot), (msg.placements as FurniturePlacement[]) ?? []);
          break;
        case 'arcadeScores':
          this.handlers.onArcadeScores((msg.scores as ArcadeScore[]) ?? []);
          break;
        case 'entitlement':
          this.handlers.onEntitlement({
            tokens: Number.isFinite(Number(msg.tokens)) ? Number(msg.tokens) : null,
            entitlement: Math.max(0, Number(msg.entitlement) || 0),
            claimed: Math.max(0, Number(msg.claimed) || 0),
            verified: msg.verified === true,
            source: String(msg.source ?? 'demo'),
          });
          break;
        case 'plotRevoked':
          this.handlers.onPlotRevoked(Number(msg.plot), String(msg.prevOwner ?? ''));
          break;
        case 'claimDenied':
          this.handlers.onClaimDenied(Number(msg.plot), String(msg.reason ?? 'denied'));
          break;
        case 'upgradeQuote':
          this.handlers.onUpgradeQuote({ plot: Number(msg.plot), level: Math.max(1, Number(msg.level) || 1), sol: Number(msg.sol) || 0, treasury: String(msg.treasury ?? '') });
          break;
        case 'upgradeRejected':
          this.handlers.onUpgradeRejected(Number(msg.plot), Math.max(1, Number(msg.level) || 1), String(msg.reason ?? 'payment'));
          break;
      }
    };

    this.ws.onclose = () => {
      this.handlers.onStatus(false);
      if (this.sendTimer) { clearInterval(this.sendTimer); this.sendTimer = null; }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      try { this.ws?.close(); } catch { /* already closing */ }
    };
  }

  private scheduleReconnect() {
    if (this.disposed || this.reconnectTimer) return;
    // A refused duplicate waits out the server's reclaim window instead of
    // knocking every 2 seconds against a lock it cannot take yet.
    const waitMs = Math.max(2000, this.blockedUntil - Date.now());
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
    if (!this.disposed) this.connect(this.name, this.look ?? ({} as PlayerLook), this.getPos);
    }, waitMs);
  }

  private tickPos(getPos: () => { x: number; z: number; ry: number }) {
    const p = getPos();
    const moved =
      !Number.isFinite(this.lastX) ||
      Math.abs(p.x - this.lastX) > 0.05 ||
      Math.abs(p.z - this.lastZ) > 0.05 ||
      Math.abs(p.ry - this.lastRy) > 0.05;
    if (!moved || !Number.isFinite(p.x)) return;
    this.lastX = p.x;
    this.lastZ = p.z;
    this.lastRy = p.ry;
    this.send({ t: 'pos', x: p.x, z: p.z, ry: p.ry });
  }

  setName(name: string) {
    this.name = name.slice(0, MAX_NAME) || 'Resident';
    this.send({ t: 'name', name: this.name });
  }

  setLook(look: PlayerLook) {
    this.look = look;
    this.send({ t: 'look', look });
  }

  // Session token minted by POST /api/auth/verify (wallet-auth chunk). Pure
  // wiring: the client sends it with the join when it has one; the server
  // binds the connection to the VERIFIED wallet only after real verification.
  // Guest identity (server-assigned token echoed back on welcome so a refresh
  // re-adopts the same guest character). Never carries a wallet.
  setGuest(on: boolean, guestSession: string | null = null) {
    this.guest = on;
    this.guestSession = guestSession;
  }

  setSession(token: string | null) {
    this.session = typeof token === 'string' && token ? token : null;
  }

  // prev: the owner this plot is being transferred from (marketplace sale)
  sendClaim(plot: number, ownerName: string, type: string | null, prev?: string) {
    this.send({ t: 'claim', plot, ownerName, type, ...(prev ? { prev } : {}) });
  }

  sendBuild(plot: number, progress: number, done: boolean, type?: string) {
    this.send({ t: 'build', plot, progress, done, ...(type ? { type } : {}) });
  }

  sendUpgrade(plot: number, level: number) {
    this.send({ t: 'upgrade', plot, level });
  }

  sendUpgradePay(plot: number, level: number, signature: string) {
    this.send({ t: 'upgradePay', plot, level, signature });
  }

  sendList(plot: number, price: number) {
    this.send({ t: 'list', plot, price });
  }

  sendUnlist(plot: number) {
    this.send({ t: 'unlist', plot });
  }

  sendArcadeStart(gameId: string) {
    this.send({ t: 'arcadeStart', gameId });
  }

  sendArcadeScore(gameId: string, score: number) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !Number.isFinite(score)) return;
    this.send({ t: 'arcadeScore', gameId, score: Math.floor(score) });
  }

  sendBlackjackBet(amount: number) {
    if (!Number.isFinite(amount)) return;
    this.send({ t: 'bjBet', bet: Math.floor(amount) });
  }

  sendBlackjackHit() {
    this.send({ t: 'bjHit' });
  }

  sendBlackjackStand() {
    this.send({ t: 'bjStand' });
  }

  sendShopPurchase(item: string) {
    if (typeof item === 'string' && item) this.send({ t: 'shopPurchase', item });
  }

  sendFurniturePurchase(item: string) {
    if (typeof item === 'string' && item) this.send({ t: 'furniturePurchase', item });
  }

  sendGardenPlace(plot: number) {
    if (Number.isFinite(plot)) this.send({ t: 'gardenPlace', plot });
  }

  sendGardenUnplace(plot: number) {
    if (Number.isFinite(plot)) this.send({ t: 'gardenUnplace', plot });
  }

  sendHouseState(plot: number, placements: FurniturePlacement[]) {
    this.send({ t: 'houseState', plot, placements });
  }

  private send(msg: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.sendTimer) clearInterval(this.sendTimer);
    try { this.ws?.close(); } catch { /* nothing to close */ }
    this.ws = null;
  }
}

// Module-level handle so React components outside the canvas (the earnings
// card) can trigger a fee claim without prop-drilling the client.
let activeNet: NetClient | null = null;
export function registerActiveNet(client: NetClient | null) {
  activeNet = client;
}
export function blackjackBet(amount: number) {
  activeNet?.sendBlackjackBet(amount);
}
export function blackjackHit() {
  activeNet?.sendBlackjackHit();
}
export function blackjackStand() {
  activeNet?.sendBlackjackStand();
}