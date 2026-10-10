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

export interface NetHandlers {
  onWelcome: (selfId: string, peers: NetPeer[], plots: Array<[number, string]>, houses?: Array<[number, FurniturePlacement[]]>, arcadeScores?: ArcadeScore[]) => void;
  onJoin: (peer: NetPeer) => void;
  onPos: (id: string, x: number, z: number, ry: number) => void;
  onLook: (id: string, look: PlayerLook) => void;
  onName: (id: string, name: string) => void;
  onLeave: (id: string) => void;
  onClaim: (plot: number, ownerName: string) => void;
  onStatus: (online: boolean) => void;
  onHouseState: (plot: number, placements: FurniturePlacement[]) => void;
  onArcadeScores: (scores: ArcadeScore[]) => void;
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

  constructor(private handlers: NetHandlers) {}

  connect(name: string, look: PlayerLook, getPos: () => { x: number; z: number; ry: number }) {
    this.name = name.slice(0, MAX_NAME) || 'Resident';
    this.look = look;
    this.getPos = getPos;
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
      this.send({ t: 'join', name: this.name, look: this.look, ...getPos() });
      this.lastX = NaN; // force a position send on the next tick
      if (this.sendTimer) clearInterval(this.sendTimer);
      this.sendTimer = setInterval(() => this.tickPos(getPos), 100);
    };

    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      switch (msg.t) {
        case 'welcome':
          this.handlers.onWelcome(String(msg.id), (msg.peers as NetPeer[]) ?? [], (msg.plots as Array<[number, string]>) ?? [], (msg.houses as Array<[number, FurniturePlacement[]]>) ?? [], (msg.arcadeScores as ArcadeScore[]) ?? []);
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
          this.handlers.onClaim(Number(msg.plot), String(msg.ownerName));
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
  sendClaim(plot: number, ownerName: string, prev?: string) {
    this.send({ t: 'claim', plot, ownerName, ...(prev ? { prev } : {}) });
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