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

export interface NetHandlers {
  onWelcome: (selfId: string, peers: NetPeer[], plots: Array<[number, NetPlotRecord]>, houses: Array<[number, FurniturePlacement[]]>, arcadeScores: ArcadeScore[], listings: NetListing[]) => void;
  onJoin: (peer: NetPeer) => void;
  onPos: (id: string, x: number, z: number, ry: number) => void;
  onLook: (id: string, look: PlayerLook) => void;
  onName: (id: string, name: string) => void;
  onLeave: (id: string) => void;
  onClaim: (plot: number, rec: NetPlotRecord, prev?: string, price?: number) => void;
  onBuild: (plot: number, progress: number, done: boolean) => void;
  onUpgrade: (plot: number, level: number) => void;
  onStatus: (online: boolean) => void;
  onHouseState: (plot: number, placements: FurniturePlacement[]) => void;
  onArcadeScores: (scores: ArcadeScore[]) => void;
  onSimClaim: (plot: number, type: string, name: string) => void;
  onSimList: (listing: NetListing) => void;
  onUnlist: (id: number) => void;
  onSimBuy: (id: number, plot: number, ownerName: string, sellerName: string, price: number) => void;
}

const MAX_NAME = 12;

export class NetClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sendTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
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

    // wss when the page itself is served over https, so a deployed site
    // does not get blocked as mixed content
    const wsProto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss' : 'ws';
    const url =
      typeof location !== 'undefined' && location.port === '8787'
        ? `${wsProto}://${location.host}/ws`
        : `${wsProto}://${location.hostname}:8787/ws`;

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.handlers.onStatus(true);
      this.send({ t: 'join', name: this.name, look: this.look, ...getPos(), plotIds: this.world.plotIds, community: this.world.community });
      this.lastX = NaN; // force a position send on the next tick
      if (this.sendTimer) clearInterval(this.sendTimer);
      this.sendTimer = setInterval(() => this.tickPos(getPos), 100);
    };

    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      switch (msg.t) {
        case 'welcome':
          this.handlers.onWelcome(String(msg.id), (msg.peers as NetPeer[]) ?? [], (msg.plots as Array<[number, NetPlotRecord]>) ?? [], (msg.houses as Array<[number, FurniturePlacement[]]>) ?? [], (msg.arcadeScores as ArcadeScore[]) ?? [], (msg.listings as NetListing[]) ?? []);
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
        case 'claim':
          this.handlers.onClaim(Number(msg.plot), { ownerName: String(msg.ownerName), type: (msg.type as string) ?? null, progress: Number(msg.progress) || 0, done: msg.done === true, level: Math.max(1, Number(msg.level) || 1) }, typeof msg.prev === 'string' ? msg.prev : undefined, Number.isFinite(Number(msg.price)) ? Number(msg.price) : undefined);
          break;
        case 'build':
          this.handlers.onBuild(Number(msg.plot), Number(msg.progress) || 0, msg.done === true);
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
        case 'houseState':
          this.handlers.onHouseState(Number(msg.plot), (msg.placements as FurniturePlacement[]) ?? []);
          break;
        case 'arcadeScores':
          this.handlers.onArcadeScores((msg.scores as ArcadeScore[]) ?? []);
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
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
    if (!this.disposed) this.connect(this.name, this.look ?? ({} as PlayerLook), this.getPos);
    }, 2000);
  }

  private tickPos(getPos: () => { x: number; z: number; ry: number }) {
    const p = getPos();
    const moved =
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

  // prev: the owner this plot is being transferred from (marketplace sale)
  sendClaim(plot: number, ownerName: string, type: string | null, prev?: string) {
    this.send({ t: 'claim', plot, ownerName, type, ...(prev ? { prev } : {}) });
  }

  sendBuild(plot: number, progress: number, done: boolean) {
    this.send({ t: 'build', plot, progress, done });
  }

  sendUpgrade(plot: number, level: number) {
    this.send({ t: 'upgrade', plot, level });
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