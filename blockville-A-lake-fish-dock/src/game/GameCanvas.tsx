import { useEffect, useRef } from 'react';
import { Engine } from './engine';
import { BUILDING_DEFS, COMMUNITY_PLOTS, CONFIG } from './config';
import { NetClient, registerActiveNet } from './net';
import { getAccess, setAccess } from './access';
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
  // plots already reverted locally after a strict-server upgradeQuote — the
  // later upgradeRejected (if any) must not revert them a second time
  const quoteRevertedRef = useRef<Set<number>>(new Set());

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
      onBlackjackOpen: () => dispatch({ t: 'setBlackjackOpen', open: true }),
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
      // DEV-ONLY debug/test bridge — compiled out of production builds. The
      // hooks it calls are assigned in the Engine constructor's own DEV block,
      // so no dev-tool code or identifier ships to the browser.
      const devEng = engine as unknown as {
        teleport: (x: number, z: number) => void;
        devShowcase: (x: number, z: number) => void;
        devMeasure: () => string[];
        devView: (x: number, z: number, a: number, d: number, e: number) => void;
        devNpcs: () => unknown[];
        devRemotes: () => unknown[];
        devPlotInfo: (id: number) => unknown;
        plotPos: Map<number, { x: number; z: number }>;
      };
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
        teleport: (x: number, z: number) => devEng.teleport(x, z),
        showcase: (x: number, z: number) => devEng.devShowcase(x, z),
        devRemotes: () => devEng.devRemotes(),
        devMeasure: () => devEng.devMeasure(),
        npcs: () => devEng.devNpcs(),
        devView: (x: number, z: number, a: number, d: number, e: number) => devEng.devView(x, z, a, d, e),
        plots: () => Array.from(devEng.plotPos.entries()),
        plotInfo: (id: number) => devEng.devPlotInfo(id),
      };
    }
    return () => {
      engine.dispose();
      netRef.current?.dispose();
      netRef.current = null;
      registerActiveNet(null);
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
          // our own plot whose server record is behind our local state (a build
          // update was dropped by a disconnect): keep ours and re-send it, the
          // server validates and relays it to everyone
          const mine = stateRef.current.plots.find((q) => q.id === plot);
          if (mine && mine.owner === 'you' && mine.type && rec.ownerName === stateRef.current.name && (mine.progress > rec.progress || (mine.done && !rec.done))) {
            sentBuildRef.current.set(plot, { progress: mine.progress, done: mine.done });
            netRef.current?.sendBuild(plot, mine.progress, mine.done, mine.type);
            continue;
          }
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
      onBuild: (plot, progress, done, type) => dispatch({ t: 'remoteBuild', plot, progress, done, type: type && knownType(type) ? type : undefined }),
      onUpgrade: (plot, level) => {
        remoteLevelsRef.current.set(plot, level);
        dispatch({ t: 'remoteUpgrade', plot, level });
      },
      onHouseState: (plot, placements) => { ackedHouseRef.current.set(plot, JSON.stringify(placements)); dispatch({ t: 'remoteHouseState', plot, placements }); },
      onArcadeScores: (scores) => dispatch({ t: 'setArcadeScores', scores }),
      onBlackjack: (s) => dispatch({ t: 'setBlackjack', s }),
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
      onTreasuryPayout: (p) => dispatch({ t: 'treasuryPayout', cycle: p.cycle, amount: p.amount, weight: p.weight, totalPoints: p.totalPoints, accrued: p.accrued, paidTotal: p.paidTotal, ts: p.ts }),
      onTreasuryCycle: (c) => dispatch({ t: 'treasuryCycle', cycle: c.cycle, balanceBefore: c.balanceBefore, balanceAfter: c.balanceAfter, distributable: c.distributable, paid: c.paid, remainder: c.remainder, totalPoints: c.totalPoints }),
      onFeesEarned: (f) => dispatch({ t: 'feesEarned', total: f.total, entries: f.entries }),
      // Chunk 6: server-computed entitlement, revocations and refusals
      onEntitlement: (e) => dispatch({ t: 'entitlement', tokens: e.tokens, entitlement: e.entitlement, claimed: e.claimed, verified: e.verified, source: e.source }),
      onPlotRevoked: (plot) => dispatch({ t: 'plotRevoked', plot, prevOwner: stateRef.current.name }),
      onClaimDenied: (plot, reason) => dispatch({ t: 'toast', text: `🔒 Plot claim rejected (${reason === 'entitlement_full' ? 'holdings below the tier' : reason})` }),
      // Real SOL upgrade payments (live server): the upgrade was applied
      // optimistically — undo it locally and say so. A quote means the server
      // demands an on-chain payment first; a rejection means the submitted
      // payment signature could not be verified. Both revert the same way.
      onUpgradeQuote: (q) => {
        remoteLevelsRef.current.set(q.plot, q.level - 1);
        quoteRevertedRef.current.add(q.plot);
        dispatch({ t: 'upgradeRevert', plot: q.plot, note: `This server requires a real payment of ${q.sol} SOL to the treasury before the upgrade applies.` });
        dispatch({ t: 'toast', text: '⬆️ Upgrade needs a real SOL payment to the treasury' });
      },
      onUpgradeRejected: (plot, _level, reason) => {
        if (!quoteRevertedRef.current.delete(plot)) {
          dispatch({
            t: 'upgradeRevert',
            plot,
            note: reason === 'invalid'
              ? 'The town server rejected this upgrade (not your plot, wrong level step, or already at the cap), so it was not applied.'
              : 'The payment could not be verified on-chain, so the upgrade was not applied.',
          });
        }
        dispatch({ t: 'toast', text: reason === 'invalid' ? '⚠️ Upgrade rejected by the town server' : '⚠️ Upgrade payment could not be verified' });
      },
      // One character per wallet: this tab was refused because the same
      // verified wallet already plays in another tab or window.
      onSessionTaken: (info) => dispatch({ t: 'toast', text: `👥 ${info.reason}` }),
      // The server decides who this connection is. A wallet session it no
      // longer recognises (expired / server restart) sends the player back to
      // the entry choice rather than letting the UI pretend to be verified.
      onIdentity: (info) => {
        const a = getAccess();
        if (a?.kind === 'wallet' && info.wallet !== a.wallet) { setAccess(null); window.location.reload(); return; }
        if (a?.kind === 'guest' && info.guestSession && info.guestSession !== a.guestSession) setAccess({ kind: 'guest', guestSession: info.guestSession });
      },
      onEconomyDenied: (info) => dispatch({ t: 'toast', text: `🔒 ${info.message}` }),
    });
    netRef.current = net;
    registerActiveNet(net);
    const access = getAccess();
    if (access?.kind === 'wallet') net.setSession(access.session);
    else if (access?.kind === 'guest') net.setGuest(true, access.guestSession);
    net.connect(myName, myLook, () => engine.playerPos(), {
      plotIds: stateRef.current.plots.map((p) => p.id),
      community: COMMUNITY_PLOTS.map((c) => [c.id, c.type] as [number, string]),
    });
    const scoreListener = (event: Event) => { const detail = (event as CustomEvent<{ gameId: string; score: number }>).detail; if (detail) net.sendArcadeScore(detail.gameId, detail.score); };
    const startListener = (event: Event) => { const detail = (event as CustomEvent<{ gameId: string }>).detail; if (detail) net.sendArcadeStart(detail.gameId); };
    const shopListener = (event: Event) => { const detail = (event as CustomEvent<{ item: string }>).detail; if (detail?.item) net.sendShopPurchase(detail.item); };
    const furnitureListener = (event: Event) => { const detail = (event as CustomEvent<{ item: string }>).detail; if (detail?.item) net.sendFurniturePurchase(detail.item); };
    const gardenListener = (event: Event) => { const detail = (event as CustomEvent<{ plot: number; removed?: boolean }>).detail; if (detail && Number.isFinite(detail.plot)) { if (detail.removed) net.sendGardenUnplace(detail.plot); else net.sendGardenPlace(detail.plot); } };
    window.addEventListener('blockville:arcade-score', scoreListener);
    window.addEventListener('blockville:arcade-start', startListener);
    window.addEventListener('blockville:shop-purchase', shopListener);
    window.addEventListener('blockville:furniture-purchase', furnitureListener);
    window.addEventListener('blockville:garden-place', gardenListener);

    return () => {
      window.removeEventListener('blockville:arcade-score', scoreListener);
      window.removeEventListener('blockville:arcade-start', startListener);
      window.removeEventListener('blockville:shop-purchase', shopListener);
      window.removeEventListener('blockville:furniture-purchase', furnitureListener);
      window.removeEventListener('blockville:garden-place', gardenListener);
      net.dispose();
      netRef.current = null;
      registerActiveNet(null);
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
          net.sendBuild(p.id, p.progress, p.done, p.type ?? undefined);
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
