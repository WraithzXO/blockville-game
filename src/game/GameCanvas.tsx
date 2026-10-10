import { useEffect, useRef } from 'react';
import { Engine } from './engine';
import { BUILDING_DEFS, COMMUNITY_PLOTS, CONFIG } from './config';
import { NetClient } from './net';
import { useEngineBridge, useGame, type EngineApi, type Plot } from './state';

export default function GameCanvas({ inputEnabled = true }: { inputEnabled?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useGame();
  const bridge = useEngineBridge();
  const engineRef = useRef<Engine | null>(null);
  const netRef = useRef<NetClient | null>(null);
  // ownership already announced to the server (plot id -> owner name)
  const ownerSeenRef = useRef(new Map<number, string>());
  const sentOwnerRef = useRef<Map<number, string>>(new Map());
  // last furniture payload sent per plot — prevents an echo loop where the
  // server's broadcast of our own state comes back and is re-sent forever
  const sentHouseRef = useRef<Map<number, string>>(new Map());
  // last furniture payload the server echoed back per plot — a payload is only
  // "settled" once the server has confirmed it, so a local edit made while a
  // send is in flight is always re-sent instead of being swallowed
  const ackedHouseRef = useRef<Map<number, string>>(new Map());
  // last construction progress announced per plot
  const sentBuildRef = useRef<Map<number, { progress: number; done: boolean }>>(new Map());
  // listings already announced to the server (plot -> asking price)
  const sentListRef = useRef<Map<number, number>>(new Map());
  // building levels: what we last announced vs. what arrived from the network
  // (a remote upgrade must never be re-relayed back to the server)
  const sentLevelRef = useRef<Map<number, number>>(new Map());
  const remoteLevelsRef = useRef<Map<number, number>>(new Map());

  // latest-state refs for engine callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new Engine(containerRef.current, {
      onPlotClick: (id) => {
        const p = stateRef.current.plots.find((q) => q.id === id);
        // claim empty land, or open your own building's info/upgrade panel
        if (p && (!p.type || p.owner === 'you')) dispatch({ t: 'selectPlot', plot: id });
      },
      onBuildClick: (id) => dispatch({ t: 'buildClick', plot: id }),
      onStoreClick: () => dispatch({ t: 'setStoreOpen', open: true }),
      onFurnitureStoreClick: () => dispatch({ t: 'setFurnitureStoreOpen', open: true }),
      onArcadeOpen: () => dispatch({ t: 'setArcadeOpen', open: true }),
      requestReward: (b, level, plotId) => bridge.rewardBridge().requestReward(b, level, plotId),
      // the engine only fires these when the value changes
      onNearby: (id) => dispatch({ t: 'setNearPlot', plot: id }),
      onTooFar: () => dispatch({ t: 'toast', text: '🚶 Walk up to a plot to interact with it' }),
      onPrompt: (text) => dispatch({ t: 'setPrompt', text }),
      onToast: (text) => dispatch({ t: 'toast', text }),
      onFound: (amount, source) => dispatch({ t: 'foundCoins', amount, source }),
      onNoticeOpen: () => dispatch({ t: 'setNoticeOpen', open: true }),
      onHouseEnter: (plot) => dispatch({ t: 'enterHouse', plot }),
      onHouseExit: () => dispatch({ t: 'exitHouse' }),
    }, stateRef.current.look);
    engineRef.current = engine;
    bridge.setEngine(engine as EngineApi);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__bv = {
        eng: engine,
        screenPos: (x: number, z: number) => engine.screenPos(x, z),
        camDist: (d: number) => engine.setCamDist(d),
        camDistance: () => engine.camDistance(),
        shellOpacity: () => engine.shellOpacity(),
        insideStore: () => engine.insideStoreNow(),
        speedMult: () => engine.currentSpeedMult,
        playerPos: () => engine.playerPos(),
        captureScreenshot: () => engine.captureScreenshot(),
        teleport: (x: number, z: number) => engine.teleport(x, z),
        showcase: (x: number, z: number) => engine.devShowcase(x, z),
        devRemotes: () => engine.devRemotes(),
        devMeasure: () => engine.devMeasure(),
        npcs: () => engine.devNpcs(),
        devView: (x: number, z: number, a: number, d: number, e: number) => engine.devView(x, z, a, d, e),
        plots: () => Array.from((engine as unknown as { plotPos: Map<number, { x: number; z: number }> }).plotPos.entries()),
        plotInfo: (id: number) => (engine as unknown as { devPlotInfo: (id: number) => unknown }).devPlotInfo(id),
      };
    }
    return () => {
      engine.dispose();
      netRef.current?.dispose();
      netRef.current = null;
      bridge.setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // multiplayer presence — real connected players, real positions, real names
  useEffect(() => {
    if (!engineRef.current || netRef.current) return;
    const engine = engineRef.current;
    const myName = stateRef.current.name;
    const myLook = stateRef.current.look;

    const joinFeed = (name: string, joined: boolean) => {
      const text = joined ? `🧍 ${name} joined the town` : `👋 ${name} left the town`;
      dispatch({ t: 'feed', icon: joined ? '🧍' : '👋', text, detail: joined ? 'Connected player' : 'Disconnected' });
    };

    const knownType = (t: string | null): t is keyof typeof BUILDING_DEFS => !!t && t in BUILDING_DEFS;
    const net = new NetClient({
      onWelcome: (selfId, peers, plots, houses = [], arcadeScores = [], listings = []) => {
        engine.setSelfName(myName);
        for (const p of peers) {
          if (p.id !== selfId) engine.upsertRemote(p.id, p.name, p.look, p.x, p.z, p.ry);
        }
        // late joiners get the ownership + building snapshot so everyone sees
        // the same owners and the same buildings under construction
        for (const [plot, rec] of plots) {
          remoteLevelsRef.current.set(plot, rec.level || 1);
          dispatch({ t: 'remoteClaim', plot, ownerName: rec.ownerName, type: knownType(rec.type) ? rec.type : null, progress: rec.progress, done: rec.done, level: rec.level || 1 });
        }
        if (listings.length) dispatch({ t: 'syncListings', listings: listings.map((l) => ({ id: l.id, plot: l.plot, seller: l.seller, price: l.price, mine: false })) });
        for (const [plot, placements] of houses) { ackedHouseRef.current.set(plot, JSON.stringify(placements)); dispatch({ t: 'remoteHouseState', plot, placements }); }
        if (arcadeScores.length) dispatch({ t: 'setArcadeScores', scores: arcadeScores });
      },
      onJoin: (p) => {
        engine.upsertRemote(p.id, p.name, p.look, p.x, p.z, p.ry);
        joinFeed(p.name, true);
      },
      onPos: (id, x, z, ry) => engine.moveRemote(id, x, z, ry),
      onLook: (id, look) => engine.updateRemoteLook(id, look),
      onName: (id, name) => engine.renameRemote(id, name),
      onLeave: (id) => {
        const name = engine.remoteName(id);
        engine.removeRemote(id);
        if (name) joinFeed(name, false);
      },
      // another player claimed/bought a plot — same owner shows for everyone
      onClaim: (plot, rec, prev, price) => {
        if (rec.ownerName === stateRef.current.name) return; // our own echo — state is already applied
        remoteLevelsRef.current.set(plot, rec.level || 1);
        dispatch({ t: 'remoteClaim', plot, ownerName: rec.ownerName, type: knownType(rec.type) ? rec.type : null, progress: rec.progress, done: rec.done, level: rec.level || 1, prev, price });
        dispatch({ t: 'feed', icon: '🏗️', text: `${rec.ownerName} claimed a plot`, detail: 'Connected player' });
      },
      onBuild: (plot, progress, done) => dispatch({ t: 'remoteBuild', plot, progress, done }),
      onUpgrade: (plot, level) => {
        remoteLevelsRef.current.set(plot, level);
        dispatch({ t: 'remoteUpgrade', plot, level });
      },
      onHouseState: (plot, placements) => { ackedHouseRef.current.set(plot, JSON.stringify(placements)); dispatch({ t: 'remoteHouseState', plot, placements }); },
      onArcadeScores: (scores) => dispatch({ t: 'setArcadeScores', scores }),
      onStatus: (online) => {
        // after a reconnect, re-announce our plots, buildings and listings
        // (covers a backend restart too)
        if (online) {
          sentOwnerRef.current.clear();
          sentBuildRef.current.clear();
          sentListRef.current.clear();
          sentLevelRef.current.clear();
          remoteLevelsRef.current.clear();
        }
      },
      onSimClaim: (plot, type, name) => {
        if (!knownType(type)) return;
        dispatch({ t: 'simClaim', plot, type, name });
      },
      onSimList: (listing) => dispatch({ t: 'simList', id: listing.id, plot: listing.plot, price: listing.price, seller: listing.seller }),
      onUnlist: (id) => dispatch({ t: 'remoteUnlist', id }),
      onSimBuy: (id, _plot, ownerName, sellerName, price) => dispatch({ t: 'simBuy', id, ownerName, sellerName, price }),
    });
    netRef.current = net;
    net.connect(myName, myLook, () => engine.playerPos(), {
      plotIds: stateRef.current.plots.map((p) => p.id),
      community: COMMUNITY_PLOTS.map((c) => [c.id, c.type] as [number, string]),
    });
    const scoreListener = (event: Event) => { const detail = (event as CustomEvent<{ gameId: string; score: number }>).detail; if (detail) net.sendArcadeScore(detail.gameId, detail.score); };
    const startListener = (event: Event) => { const detail = (event as CustomEvent<{ gameId: string }>).detail; if (detail) net.sendArcadeStart(detail.gameId); };
    window.addEventListener('blockville:arcade-score', scoreListener);
    window.addEventListener('blockville:arcade-start', startListener);

    return () => {
      window.removeEventListener('blockville:arcade-score', scoreListener);
      window.removeEventListener('blockville:arcade-start', startListener);
      net.dispose();
      netRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // identity changes propagate to everyone (rename + look swap)
  useEffect(() => {
    netRef.current?.setName(state.name);
    engineRef.current?.setSelfName(state.name);
  }, [state.name]);
  useEffect(() => {
    netRef.current?.setLook(state.look);
  }, [state.look]);

  // broadcast local plot ownership so every connected player sees the same owner
  useEffect(() => {
    const net = netRef.current;
    if (!net) return;
    for (const p of state.plots) {
      const sent = sentOwnerRef.current.get(p.id);
      if (p.owner === 'you' && p.ownerName) {
        if (sent === p.ownerName) continue;
        const prev = ownerSeenRef.current.get(p.id);
        sentOwnerRef.current.set(p.id, p.ownerName);
        net.sendClaim(p.id, p.ownerName, p.type ?? null, prev && prev !== p.ownerName ? prev : undefined);
      } else if (sent && p.ownerName && p.ownerName !== sent) {
        // we sold this plot: tell everyone who owns it now
        sentOwnerRef.current.delete(p.id);
        net.sendClaim(p.id, p.ownerName, p.type ?? null, sent);
      } else if (sent && !p.ownerName) {
        // our claim was refunded/reset (server correction) — forget the
        // announcement so a future claim on this plot re-announces
        sentOwnerRef.current.delete(p.id);
      }
      if (p.ownerName) ownerSeenRef.current.set(p.id, p.ownerName);
      // construction progress on our own plot — relayed so everyone watches
      // the same building rise
      if (p.owner === 'you' && p.type) {
        const last = sentBuildRef.current.get(p.id);
        if (!last || last.progress !== p.progress || last.done !== p.done) {
          sentBuildRef.current.set(p.id, { progress: p.progress, done: p.done });
          net.sendBuild(p.id, p.progress, p.done);
        }
      }
      // building upgrades on our own plots and Town Council buildings —
      // announced once per local change; network-applied levels are skipped
      if (p.done && p.type && (p.owner === 'you' || p.ownerName === 'Town Council')) {
        if (remoteLevelsRef.current.get(p.id) === p.level) {
          sentLevelRef.current.set(p.id, p.level);
        } else if (sentLevelRef.current.get(p.id) !== p.level && p.level > 1) {
          sentLevelRef.current.set(p.id, p.level);
          net.sendUpgrade(p.id, p.level);
        }
      }
    }
  }, [state.plots]);

  // keep our marketplace listings in sync with the server so NPC buyers can
  // purchase them and every player sees the same board
  useEffect(() => {
    const net = netRef.current;
    if (!net) return;
    const mine = state.listings.filter((l) => l.mine);
    for (const l of mine) {
      if (sentListRef.current.get(l.plot) !== l.price) {
        sentListRef.current.set(l.plot, l.price);
        net.sendList(l.plot, l.price);
      }
    }
    for (const [plot, price] of [...sentListRef.current.entries()]) {
      if (!mine.some((l) => l.plot === plot && l.price === price)) {
        sentListRef.current.delete(plot);
        net.sendUnlist(plot);
      }
    }
  }, [state.listings]);

  useEffect(() => {
    const net = netRef.current;
    if (!net) return;
    for (const [plot, placements] of Object.entries(state.houseFurniture)) {
      const owner = state.plots.find((p) => p.id === Number(plot));
      if (owner?.owner !== 'you') continue;
      const id = Number(plot);
      const payload = JSON.stringify(placements);
      if (ackedHouseRef.current.get(id) === payload) { sentHouseRef.current.delete(id); continue; } // server confirmed current
      if (sentHouseRef.current.get(id) === payload) continue; // already in flight
      sentHouseRef.current.set(id, payload);
      net.sendHouseState(id, placements);
    }
  }, [state.houseFurniture, state.plots]);

  // render the actual House as a Three.js interior scene; the React layer only supplies controls
  useEffect(() => {
    const plotId = state.interiorPlot;
    const plot = plotId === null ? null : state.plots.find((p) => p.id === plotId);
    engineRef.current?.setInterior(plotId, plot?.housePaint ?? '#ead8b8', plotId === null ? [] : (state.houseFurniture[plotId] || []));
  }, [state.interiorPlot, state.houseFurniture, state.plots]);

  // push state into the engine whenever plots change
  useEffect(() => {
    const built = state.plots.filter((p) => p.done).length;
    const target = built === 0 ? CONFIG.baseNpcs : Math.round(CONFIG.baseNpcs + built * CONFIG.npcPerBuilding);
    engineRef.current?.sync(state.plots, Math.min(CONFIG.maxNpcs, target));
  }, [state.plots]);

  // push look changes into the engine
  useEffect(() => {
    engineRef.current?.setLook(state.look);
  }, [state.look]);

  // Speed Boots — walk speed multiplier
  useEffect(() => {
    engineRef.current?.setSpeedMult(state.boots ? CONFIG.items.bootsSpeed : 1);
  }, [state.boots]);

  // mirror every plot's placed yard features (garden, statue, fence …) into the 3D world
  useEffect(() => {
    for (const [id, list] of Object.entries(state.plotDecor)) engineRef.current?.setPlotDecor(Number(id), list);
  }, [state.plotDecor]);

  // pause walking while any modal is open
  useEffect(() => {
    engineRef.current?.setInputEnabled(inputEnabled || stateRef.current.interiorPlot !== null);
  }, [inputEnabled, state.interiorPlot]);

  return <div className="game-canvas" ref={containerRef} data-testid="game-canvas" />;
}

export type { Plot };
