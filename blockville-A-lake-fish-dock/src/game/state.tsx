import  React, { createContext, useContext, useEffect, useMemo, useReducer, useRef }  from 'react';
import { setVolumes as setAudioVolumes, sfx, type AudioVolumes } from './audio';
import { allocateSlot, type PlacedFeature, type PlotFeatureKind, DECOR_LABEL } from '../plots/PlotLayout';
import  { BUILDING_DEFS, COMMUNITY_PLOTS, CONFIG, PLOT_POSITIONS, RESIDENT_BUILDERS, START_LISTINGS, TOTAL_PLOTS, DEFAULT_LOOK, STORE_ITEMS, plotAllowance, type BuildingType, type PlayerLook, FURNITURE_DEFS }  from './config';
import { RETIRED_PLOT_IDS } from './config';
import { DEMO_FUNDING } from './demoFunding';
import type { BlackjackState } from './net';

const RESIDENTS = ['Nova', 'Rex', 'Momo', 'Vega', 'Juno', 'Pixel'];

export interface Plot {
  id: number;
  type: BuildingType | null;
  progress: number;   // blocks placed so far
  done: boolean;
  level: number;      // foundation for future upgrades
  owner: 'you' | 'other' | null;   // who holds the plot (null = free land)
  ownerName: string | null;        // display name for the "Plot owned by" label
  housePaint?: string;              // owner-selected interior wall colour
}

export interface Listing {
  id: number;
  plot: number;       // plot id
  seller: string;     // display name ("You" or a resident name)
  price: number;      // $BLOCKVILLE
  mine: boolean;
}

export interface FeedItem {
  id: number;
  icon: string;
  text: string;
  detail: string;
}

export interface ArcadeScore { gameId: string; name: string; score: number; }

export interface Toast { id: number; text: string; icon?: string; detail?: string; }
// Lifetime fees earned — one server-authoritative snapshot (the payout
// engine's ledger records for this player). Never client-computed.
export interface FeesEntry { cycle: number; amount: number; ts: number | null; }
export interface FurniturePlacement { id: string; itemId: string; x: number; z: number; rotation: number; locked?: boolean; }

interface State {
  mode: 'demo' | 'wallet' | null;
  onboarded: boolean;      // staking modal dismissed
  balance: number;         // demo $BLOCKVILLE wallet balance
  sol: number;             // demo SOL balance for building upgrades
  blocks: number;
  // Server-computed plot entitlement (Chunk 6): verified holdings → claimable
  // plots. The client renders it; the SERVER enforces it. Null until the
  // first server snapshot arrives.
  entitlement: { tokens: number | null; entitlement: number; claimed: number; verified: boolean; source: string } | null;
  feesEarned: { total: number; entries: FeesEntry[] } | null; // server snapshot, null until the first one arrives
  plots: Plot[];
  listings: Listing[];
  marketOpen: boolean;
  feed: FeedItem[];
  toasts: Toast[];
  selectedPlot: number | null;
  look: PlayerLook;
  name: string;                // the resident's display name (multiplayer identity)
  unlockedHats: string[];      // hat ids purchased from the Store
  unlockedGlasses: string[];   // glasses ids purchased from the Store
  unlockedDesigns: string[];   // shirt-design ids purchased from the Store
  townDecorInventory: Record<string, number>;
  boots: boolean;              // Speed Boots — walk faster
  toolkit: boolean;            // Builder's Toolkit — 2 blocks per build click
  permit: boolean;             // Claim Permit — one extra plot claim
  gardenKits: number;          // Garden Kits bought, waiting to be placed
  gardens: number[];           // plot ids with a garden placed
  plotDecor: Record<number, PlacedFeature[]>;   // everything placed in a plot's yard (garden, statue, fence…) with its reserved slot
  storeOpen: boolean;
  customiseOpen: boolean;
  treasury: { balance: number; ledger: FeedItem[] };
  treasuryOpen: boolean;
  tokenomicsOpen: boolean;
  whitepaperOpen: boolean;     // Whitepaper document panel (opened from Settings)
  lastDistribution: { total: number; yourShare: number } | null;
  nearPlot: number | null;     // plot the resident is standing next to
  promptText: string | null;   // world-object interact prompt (E — …)
  noticeOpen: boolean;         // town noticeboard panel
  logOpen: boolean;            // bottom-left activity log expanded
  logTab: 'town' | 'personal'; // which activity log section is selected
  logUnread: boolean;          // something new in PERSONAL while viewing TOWN
  settingsOpen: boolean;       // Settings menu (audio volumes, report a bug)
  volumes: AudioVolumes;       // persisted audio volumes
  furnitureInventory: Record<string, number>;
  houseFurniture: Record<number, FurniturePlacement[]>;
  interiorPlot: number | null;
  furnitureStoreOpen: boolean;
  arcadeOpen: boolean;
  arcadeScores: ArcadeScore[];
  blackjackOpen: boolean;   // casino blackjack modal
  blackjack: BlackjackState | null; // last authoritative table state from the server
}

type Action =
  | { t: 'setMode'; mode: 'demo' | 'wallet' }
  | { t: 'claim'; plot: number; type: BuildingType }
  | { t: 'buildClick'; plot: number }
  | { t: 'selectPlot'; plot: number | null }
  | { t: 'setMarketOpen'; open: boolean }
  | { t: 'listPlot'; plot: number; price: number }
  | { t: 'cancelListing'; id: number }
  | { t: 'buyListing'; id: number }
  | { t: 'remoteClaim'; plot: number; ownerName: string; type?: BuildingType | null; progress?: number; done?: boolean; level?: number; prev?: string; price?: number }
  | { t: 'remoteBuild'; plot: number; progress: number; done: boolean; type?: string }
  | { t: 'remoteUpgrade'; plot: number; level: number }
  | { t: 'simClaim'; plot: number; type: BuildingType; name: string }
  | { t: 'simList'; id: number; plot: number; price: number; seller: string }
  | { t: 'simBuy'; id: number; plot?: number; ownerName?: string; sellerName?: string; price?: number }
  | { t: 'remoteUnlist'; id: number }
  | { t: 'syncListings'; listings: Listing[] }
  | { t: 'buyItem'; item: string }
  | { t: 'placeGarden'; plot: number }
  | { t: 'placeDecor'; plot: number; kind: Exclude<PlotFeatureKind, 'garden'> }
  | { t: 'removeDecor'; plot: number; id: string }
  | { t: 'upgrade'; plot: number }
  | { t: 'upgradeRevert'; plot: number; note: string }
  | { t: 'setTreasuryOpen'; open: boolean }
  | { t: 'setTokenomicsOpen'; open: boolean }
  | { t: 'setWhitepaperOpen'; open: boolean }
  | { t: 'entitlement'; tokens: number | null; entitlement: number; claimed: number; verified: boolean; source: string }
  | { t: 'plotRevoked'; plot: number; prevOwner: string }
  | { t: 'treasuryIn'; amount: number; label: string; detail: string }
  | { t: 'treasuryPayout'; cycle: number; amount: number; weight: number; totalPoints: number; accrued: number; paidTotal: number; ts: number }
  | { t: 'treasuryCycle'; cycle: number; balanceBefore: number; balanceAfter: number; distributable: number; paid: number; remainder: number; totalPoints: number }
  | { t: 'setLook'; look: PlayerLook }
  | { t: 'setName'; name: string }
  | { t: 'setStoreOpen'; open: boolean }
  | { t: 'setCustomiseOpen'; open: boolean }
  | { t: 'enterHouse'; plot: number }
  | { t: 'exitHouse' }
  | { t: 'paintHouse'; plot: number; color: string }
  | { t: 'setFurnitureStoreOpen'; open: boolean }
  | { t: 'setArcadeOpen'; open: boolean }
  | { t: 'setArcadeScores'; scores: ArcadeScore[] }
  | { t: 'setBlackjackOpen'; open: boolean }
  | { t: 'setBlackjack'; s: BlackjackState | null }
  | { t: 'buyFurniture'; itemId: string }
  | { t: 'placeFurniture'; plot: number; itemId: string }
  | { t: 'removeFurniture'; plot: number; placementId: string }
  | { t: 'rotateFurniture'; plot: number; placementId: string }
  | { t: 'moveFurniture'; plot: number; placementId: string; dx: number; dz: number }
  | { t: 'toggleFurnitureLock'; plot: number; placementId: string }
  | { t: 'remoteHouseState'; plot: number; placements: FurniturePlacement[] }
  | { t: 'setNearPlot'; plot: number | null }
  | { t: 'setPrompt'; text: string | null }
  | { t: 'setNoticeOpen'; open: boolean }
  | { t: 'setLogOpen'; open: boolean }
  | { t: 'setLogTab'; tab: 'town' | 'personal' }
  | { t: 'logUnread' }
  | { t: 'setSettingsOpen'; open: boolean }
  | { t: 'setVolumes'; master: number; sfx: number }
  | { t: 'foundCoins'; amount: number; source: string }
  | { t: 'npcReward'; building: BuildingType; amount: number }
  | { t: 'npcRewardDirect'; amount: number }
  | { t: 'feed'; icon: string; text: string; detail: string }
  | { t: 'toast'; text: string; icon?: string; detail?: string }
  | { t: 'feesEarned'; total: number; entries: FeesEntry[] };

let uid = 1;
const nextId = () => uid++;

const emptyPlots = (): Plot[] =>
  PLOT_POSITIONS.map((p) => {
    const community = COMMUNITY_PLOTS.find((c) => c.id === p.id);
    if (community) {
      const def = BUILDING_DEFS[community.type];
      return {
        id: p.id, type: community.type, progress: def.cost, done: true, level: 1,
        owner: 'other' as const,
        ownerName: 'Town Council', housePaint: '#ead8b8',
      };
    }
    return { id: p.id, type: null, progress: 0, done: false, level: 1, owner: null, ownerName: null, housePaint: '#ead8b8' };
  });

// persistent multiplayer identity — survives reloads, unique-ish by default
const loadArcadeScores = (): ArcadeScore[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem('blockville.arcadeScores') || '[]');
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.name === 'string' && Number.isFinite(x.score)).slice(0, 10) : [];
  } catch { return []; }
};

const loadName = (): string => {
  try {
    // DEV-ONLY (stripped from production builds): ?autoname=... skips the name gate for visual checks.
    if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('autoname')) {
      return (new URLSearchParams(window.location.search).get('autoname') || '').slice(0, 12);
    }
    const saved = localStorage.getItem('blockville_name');
    if (saved && saved.trim()) return saved.trim().slice(0, 12);
  } catch { /* private mode */ }
  return '';
};

const loadWallet = () => {
  // Chunk 6 migration: staking is gone. Any previously staked amount is
  // unstaked back into the balance under the current accounting, so an
  // existing player's demo wallet loses nothing in the switch.
  const fallback = { balance: 60000, blocks: 0 };
  try {
    const raw = localStorage.getItem('blockville_staking');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const finite = (value: unknown, fallbackValue: number) => Number.isFinite(Number(value)) ? Number(value) : fallbackValue;
    return {
      // previously staked tokens return to the balance (unstake)
      balance: Math.max(0, finite(parsed.balance, fallback.balance) + Math.max(0, finite(parsed.staked, 0))),
      blocks: Math.max(0, finite(parsed.blocks, 0)),
    };
  } catch { return fallback; }
};

const loadStoreProgress = () => {
  try {
    const raw = JSON.parse(localStorage.getItem('blockville_store_progress') || '{}') as Record<string, unknown>;
    return {
      unlockedHats: Array.isArray(raw.unlockedHats) ? raw.unlockedHats.filter((x): x is string => typeof x === 'string') : [],
      unlockedGlasses: Array.isArray(raw.unlockedGlasses) ? raw.unlockedGlasses.filter((x): x is string => typeof x === 'string') : [],
      unlockedDesigns: Array.isArray(raw.unlockedDesigns) ? raw.unlockedDesigns.filter((x): x is string => typeof x === 'string') : [],
      townDecorInventory: raw.townDecorInventory && typeof raw.townDecorInventory === 'object' ? raw.townDecorInventory as Record<string, number> : {},
      permit: raw.permit === true,
      furnitureInventory: raw.furnitureInventory && typeof raw.furnitureInventory === 'object' ? raw.furnitureInventory as Record<string, number> : {},
      volumes: {
        master: raw.volumes && typeof raw.volumes === 'object' && Number.isFinite((raw.volumes as AudioVolumes).master)
          ? Math.min(1, Math.max(0, (raw.volumes as AudioVolumes).master)) : 0.7,
        sfx: raw.volumes && typeof raw.volumes === 'object' && Number.isFinite((raw.volumes as AudioVolumes).sfx)
          ? Math.min(1, Math.max(0, (raw.volumes as AudioVolumes).sfx)) : 0.8,
      },
    };
  } catch { return { unlockedHats: [], unlockedGlasses: [], unlockedDesigns: [], townDecorInventory: {}, permit: false, furnitureInventory: {}, volumes: { master: 0.7, sfx: 0.8 } }; }
};
const persistedWallet = loadWallet();
const persistedStore = loadStoreProgress();

const initialListings = (): Listing[] =>
  START_LISTINGS.map((l, i) => ({
    id: i + 1,
    plot: l.plot,
    seller: `Resident ${String.fromCharCode(65 + i)}`,
    price: l.price,
    mine: false,
  }));

export const initial: State = {
  mode: null,
  onboarded: false,
  balance: DEMO_FUNDING.enabled ? DEMO_FUNDING.balance : persistedWallet.balance, // demo wallet balance
  sol: DEMO_FUNDING.enabled ? DEMO_FUNDING.sol : CONFIG.demoSol,
  blocks: DEMO_FUNDING.enabled ? DEMO_FUNDING.blocks : persistedWallet.blocks,
  entitlement: null,
  feesEarned: null,
  plots: emptyPlots(),
  listings: initialListings(),
  marketOpen: false,
  feed: [],
  toasts: [],
  selectedPlot: null,
  look: { ...DEFAULT_LOOK },
  name: loadName(),
  unlockedHats: persistedStore.unlockedHats,
  unlockedGlasses: persistedStore.unlockedGlasses,
  unlockedDesigns: persistedStore.unlockedDesigns,
  townDecorInventory: persistedStore.townDecorInventory,
  furnitureInventory: persistedStore.furnitureInventory,
  volumes: persistedStore.volumes,
  boots: false,
  toolkit: false,
  permit: persistedStore.permit,
  gardenKits: 0,
  gardens: [],
  plotDecor: {},
  storeOpen: false,
  customiseOpen: false,
  treasury: { balance: 0, ledger: [] },
  treasuryOpen: false,
  tokenomicsOpen: false,
  whitepaperOpen: false,
  lastDistribution: null,
  nearPlot: null,
  promptText: null,
  noticeOpen: false,
  logOpen: false,
  logTab: 'town',
  logUnread: false,
  settingsOpen: false,
  houseFurniture: {},
  interiorPlot: null,
  furnitureStoreOpen: false,
  arcadeOpen: false,
  arcadeScores: loadArcadeScores(),
  blackjackOpen: false,
  blackjack: null,
};

function baseReducer(s: State, a: Action): State {
  switch (a.t) {
    case 'setMode':
      return { ...s, mode: a.mode };
    case 'claim': {
      const def = BUILDING_DEFS[a.type];
      if (s.blocks < def.cost) return s;
      const target = s.plots.find((p) => p.id === a.plot)!;
      if (RETIRED_PLOT_IDS.includes(a.plot)) return s;     // removed front-row plot
      if (target.owner) return s;                          // plot already taken
      const claimed = s.plots.filter((p) => p.owner === 'you').length;
      // Chunk 6: the claim allowance is the SERVER's entitlement snapshot
      // (verified holdings → plots, permit included server-side). The client
      // check is a courtesy; the server rejects anything beyond it anyway.
      const allowance = s.entitlement
        ? Math.min(CONFIG.maxPlots, s.entitlement.entitlement + (s.permit ? CONFIG.items.permitExtraPlots : 0))
        : CONFIG.maxPlots;
      if (claimed >= allowance) return s;
      return {
        ...s,
        blocks: s.blocks - def.cost,
        selectedPlot: null,
        plots: s.plots.map((p) =>
          p.id === a.plot ? { ...p, type: a.type, progress: 0, done: false, owner: 'you' as const, ownerName: s.name } : p,
        ),
        feed: [
          {
            id: nextId(),
            icon: def.icon,
            text: `${def.name} claimed on plot ${a.plot + 1}`,
            detail: `Site cleared — ${def.cost} blocks to build`,
          },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'buildClick': {
      // Never spend more blocks than we own: the step is clamped to the
      // balance (floored, since progress is whole blocks) so the balance
      // cannot go negative even if clicks land with 0 blocks left.
      const step = Math.max(0, Math.min(s.toolkit ? CONFIG.items.toolkitPerClick : 1, Math.floor(s.blocks)));
      const plots = s.plots.map((p) => {
        if (p.id !== a.plot || !p.type || p.done || step <= 0) return p;
        const def = BUILDING_DEFS[p.type];
        const progress = p.progress + step;
        const done = progress >= def.cost;
        return { ...p, progress, done };
      });
      if (plots.every((p, i) => p === s.plots[i])) return s; // nothing consumed
      const finished = plots.find((p, i) => p.done && !s.plots[i].done);
      const completed = finished?.type ?? null;
      const base: State = { ...s, blocks: s.blocks - step, plots };
      if (completed) {
        const def = BUILDING_DEFS[completed];
        return {
          ...base,
          feed: [
            {
              id: nextId(),
              icon: '✅',
              text: `${def.name} is now open for business`,
              detail: 'Residents are already on their way',
            },
            ...base.feed,
          ].slice(0, 8),
          toasts: [...base.toasts, { id: nextId(), text: `✅ ${def.name} complete! NPCs incoming` }],
        };
      }
      return base;
    }
    case 'selectPlot':
      return { ...s, selectedPlot: a.plot, storeOpen: a.plot === null ? s.storeOpen : false };
    case 'enterHouse': {
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || plot.type !== 'house' || !plot.done || !plot.ownerName) return s;
      return { ...s, interiorPlot: a.plot, selectedPlot: null, storeOpen: false, furnitureStoreOpen: false,
        feed: [{ id: nextId(), icon: '🏠', text: `Entered ${plot.ownerName}'s House`, detail: plot.owner === 'you' ? 'Owner editing enabled' : 'Visitor mode — read only' }, ...s.feed].slice(0, 8) };
    }
    case 'exitHouse': return { ...s, interiorPlot: null };
    case 'paintHouse': {
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || plot.type !== 'house' || plot.owner !== 'you') return s;
      const color = /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#ead8b8';
      return { ...s, plots: s.plots.map((p) => p.id === a.plot ? { ...p, housePaint: color } : p) };
    }
    case 'setFurnitureStoreOpen': return { ...s, furnitureStoreOpen: a.open };
    case 'setArcadeOpen': return { ...s, arcadeOpen: a.open, furnitureStoreOpen: a.open ? false : s.furnitureStoreOpen };
    case 'setBlackjackOpen': return { ...s, blackjackOpen: a.open, arcadeOpen: a.open ? false : s.arcadeOpen, furnitureStoreOpen: a.open ? false : s.furnitureStoreOpen };
    case 'setBlackjack': return { ...s, blackjack: a.s };
    case 'setArcadeScores': {
      const scores = a.scores.filter((x) => x && Number.isFinite(x.score)).slice(0, 10);
      try { localStorage.setItem('blockville.arcadeScores', JSON.stringify(scores)); } catch {}
      return { ...s, arcadeScores: scores };
    }
    case 'buyFurniture': {
      const item = FURNITURE_DEFS.find((x) => x.id === a.itemId);
      if (!item) return s;
      if (s.balance < item.price) return { ...s, toasts: [...s.toasts, { id: nextId(), text: `Not enough $BLOCKVILLE for ${item.name}` }] };
      // Furniture proceeds recycle into the Treasury like every other shop
      // purchase (RECYCLING.shopPct = 100).
      const routedFurniture = item.price * (CONFIG.treasury.storeRoutePct / 100);
      return { ...s, balance: s.balance - item.price, furnitureInventory: { ...s.furnitureInventory, [item.id]: (s.furnitureInventory[item.id] || 0) + 1 }, furnitureStoreOpen: false,
        treasury: { ...s.treasury, balance: s.treasury.balance + routedFurniture, ledger: [{ id: nextId(), icon: '🛋️', text: `${item.name} purchased`, detail: `${routedFurniture.toLocaleString()} $BLOCKVILLE routed to the Treasury (${CONFIG.treasury.storeRoutePct}%)` }, ...s.treasury.ledger].slice(0, 8) },
        feed: [{ id: nextId(), icon: item.icon, text: `${item.name} added to your furniture inventory`, detail: `${item.price.toLocaleString()} $BLOCKVILLE` }, ...s.feed].slice(0, 8) };
    }
    case 'placeFurniture': {
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || plot.type !== 'house' || plot.owner !== 'you' || (s.furnitureInventory[a.itemId] || 0) < 1) return s;
      const id = `${a.plot}-${a.itemId}-${nextId()}`;
      const current = s.houseFurniture[a.plot] || [];
      return { ...s, furnitureInventory: { ...s.furnitureInventory, [a.itemId]: (s.furnitureInventory[a.itemId] || 0) - 1 }, houseFurniture: { ...s.houseFurniture, [a.plot]: [...current, { id, itemId: a.itemId, x: (current.length % 4) * 1.7 - 2.55, z: (Math.floor(current.length / 4) % 5) * 1.6 - 3.2, rotation: 0, locked: false }] } };
    }
    case 'removeFurniture': {
      const plot = s.plots.find((p) => p.id === a.plot); if (!plot || plot.owner !== 'you') return s;
      const current = s.houseFurniture[a.plot] || []; const found = current.find((x) => x.id === a.placementId); if (!found) return s;
      return { ...s, houseFurniture: { ...s.houseFurniture, [a.plot]: current.filter((x) => x.id !== a.placementId) }, furnitureInventory: { ...s.furnitureInventory, [found.itemId]: (s.furnitureInventory[found.itemId] || 0) + 1 } };
    }
    case 'rotateFurniture': {
      const plot = s.plots.find((p) => p.id === a.plot); if (!plot || plot.owner !== 'you') return s;
      return { ...s, houseFurniture: { ...s.houseFurniture, [a.plot]: (s.houseFurniture[a.plot] || []).map((x) => x.id === a.placementId ? { ...x, rotation: x.rotation + Math.PI / 2 } : x) } };
    }
    case 'moveFurniture': {
      const plot = s.plots.find((p) => p.id === a.plot); if (!plot || plot.owner !== 'you') return s;
      return { ...s, houseFurniture: { ...s.houseFurniture, [a.plot]: (s.houseFurniture[a.plot] || []).map((x) => x.id === a.placementId && !x.locked ? { ...x, x: Math.max(-5.8, Math.min(5.8, x.x + a.dx)), z: Math.max(-4.4, Math.min(4.4, x.z + a.dz)) } : x) } };
    }
    case 'toggleFurnitureLock': {
      const plot = s.plots.find((p) => p.id === a.plot); if (!plot || plot.owner !== 'you') return s;
      return { ...s, houseFurniture: { ...s.houseFurniture, [a.plot]: (s.houseFurniture[a.plot] || []).map((x) => x.id === a.placementId ? { ...x, locked: !x.locked } : x) } };
    }
    case 'remoteHouseState': {
      const ownerPlot = s.plots.find((p) => p.id === a.plot);
      if (ownerPlot?.owner === 'you') {
        // Echo race guard: a server echo captured BEFORE our newest local edit
        // must not delete that edit. Keep any local placements the echo lacks;
        // the send loop re-relays the merged list right after.
        const local = s.houseFurniture[a.plot] || [];
        const ids = new Set(a.placements.map((x) => x.id));
        const missing = local.filter((x) => !ids.has(x.id));
        if (missing.length) return { ...s, houseFurniture: { ...s.houseFurniture, [a.plot]: [...a.placements, ...missing] } };
      }
      return { ...s, houseFurniture: { ...s.houseFurniture, [a.plot]: a.placements } };
    }
    case 'setNearPlot':
      if (s.nearPlot === a.plot) return s;
      return { ...s, nearPlot: a.plot };
    case 'setPrompt':
      if (s.promptText === a.text) return s;
      return { ...s, promptText: a.text };
    case 'setNoticeOpen':
      return { ...s, noticeOpen: a.open };
    case 'setLogOpen':
      return { ...s, logOpen: a.open, logUnread: a.open && s.logTab === 'personal' ? false : s.logUnread };
    case 'setLogTab':
      return { ...s, logTab: a.tab, logUnread: a.tab === 'personal' ? false : s.logUnread };
    case 'logUnread':
      return { ...s, logUnread: true };
    case 'setSettingsOpen':
      return { ...s, settingsOpen: a.open };
    case 'setVolumes': {
      const volumes: AudioVolumes = {
        master: Number.isFinite(a.master) ? Math.min(1, Math.max(0, a.master)) : s.volumes.master,
        sfx: Number.isFinite(a.sfx) ? Math.min(1, Math.max(0, a.sfx)) : s.volumes.sfx,
      };
      setAudioVolumes(volumes);
      return { ...s, volumes };
    }
    case 'foundCoins': {
      // tiny, rare pocket-change finds — deliberately NOT an income stream
      return {
        ...s,
        balance: s.balance + a.amount,
        toasts: [...s.toasts, { id: nextId(), text: `💡 You found ${a.amount} $BLOCKVILLE (${a.source})` }],
      };
    }
    case 'upgrade': {
      const plot = s.plots.find((p) => p.id === a.plot);
      // the Town Park and the other Town Council community buildings are
      // upgradeable by any resident who pays the fee — their upkeep is a
      // town-wide good (demo)
      if (!plot || !plot.done || !plot.type) return s;
      if (plot.owner !== 'you' && plot.ownerName !== 'Town Council') return s;
      if (plot.level >= CONFIG.upgrades.maxLevel) return s;
      const cost = CONFIG.upgrades.solCosts[plot.level - 1];
      if (s.sol < cost) return s;
      const level = plot.level + 1;
      const mult = CONFIG.upgrades.yieldMult[level - 1];
      const def = BUILDING_DEFS[plot.type];
      return {
        ...s,
        sol: Math.round((s.sol - cost) * 100) / 100,
        plots: s.plots.map((p) => (p.id === a.plot ? { ...p, level } : p)),
        treasury: {
          ...s.treasury,
          ledger: [
            {
              id: nextId(),
              icon: '⬆️',
              text: `${def.name} upgraded to Level ${level}`,
              detail: `${cost} SOL upgrade fee received (demo) — funds fee distributions`,
            },
            ...s.treasury.ledger,
          ].slice(0, 8),
        },
        feed: [
          {
            id: nextId(),
            icon: '⬆️',
            text: `${def.name} is now Level ${level}`,
            detail: `Fee yield ×${mult} — paid with ${cost} SOL (demo)`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: [...s.toasts, { id: nextId(), text: `⬆️ ${def.name} → Level ${level} · fees ×${mult}` }],
      };
    }
    case 'upgradeRevert': {
      // Live/strict servers apply an upgrade only after verifying a REAL SOL
      // payment on-chain. When the server answers the optimistic local
      // application with a quote/rejection, undo it honestly: level back,
      // demo SOL refunded, and a feed entry saying what actually happened.
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || plot.level <= 1) return s;
      const refund = CONFIG.upgrades.solCosts[plot.level - 2] ?? 0;
      const def = plot.type ? BUILDING_DEFS[plot.type] : null;
      return {
        ...s,
        sol: Math.round((s.sol + refund) * 100) / 100,
        plots: s.plots.map((p) => (p.id === a.plot ? { ...p, level: p.level - 1 } : p)),
        feed: [
          { id: nextId(), icon: '⬆️', text: `${def ? def.name : 'Building'} upgrade needs a real payment`, detail: a.note },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'setMarketOpen':
      return { ...s, marketOpen: a.open, selectedPlot: a.open ? null : s.selectedPlot };
    case 'listPlot': {
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || plot.owner !== 'you' || a.price <= 0) return s;
      if (s.listings.some((l) => l.plot === a.plot)) return s;
      return {
        ...s,
        listings: [...s.listings, { id: nextId(), plot: a.plot, seller: 'You', price: a.price, mine: true }],
        feed: [
          { id: nextId(), icon: '🏷️', text: `Plot ${a.plot + 1} listed`, detail: `Asking ${a.price.toLocaleString()} $BLOCKVILLE` },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'cancelListing': {
      const l = s.listings.find((x) => x.id === a.id);
      if (!l || !l.mine) return s;
      return { ...s, listings: s.listings.filter((x) => x.id !== a.id) };
    }
    case 'buyListing': {
      const l = s.listings.find((x) => x.id === a.id);
      if (!l || l.mine || s.balance < l.price) return s;
      const plot = s.plots.find((p) => p.id === l.plot);
      if (!plot || plot.owner !== 'other') return s;
      const what = plot.done && plot.type ? ` — includes the ${BUILDING_DEFS[plot.type].name}` : '';
      return {
        ...s,
        balance: s.balance - l.price,
        listings: s.listings.filter((x) => x.id !== a.id),
        plots: s.plots.map((p) => (p.id === l.plot ? { ...p, owner: 'you' as const, ownerName: s.name } : p)),
        feed: [
          { id: nextId(), icon: '🗺️', text: `You bought plot ${l.plot + 1}`, detail: `For ${l.price.toLocaleString()} $BLOCKVILLE${what}` },
          ...s.feed,
        ].slice(0, 8),
        toasts: [...s.toasts, { id: nextId(), text: `🗺️ Plot ${l.plot + 1} is yours!` }],
      };
    }
    case 'remoteClaim': {
      // ownership change relayed by the server (another connected player, an
      // NPC sim claim, or the welcome snapshot). Keeps the "Plot owned by"
      // label AND the building visuals identical for everyone.
      const target = s.plots.find((p) => p.id === a.plot);
      if (!target) return s;
      const type = a.type !== undefined ? a.type : target.type;
      const progress = a.progress !== undefined ? a.progress : target.progress;
      const done = a.done !== undefined ? a.done : target.done;
      const level = a.level !== undefined ? a.level : target.level;
      if (target.ownerName === a.ownerName && target.type === type && target.progress === progress && target.done === done && target.level === level) return s;
      // our own claim was refused: the server says someone else got there
      // first. Reset the plot and refund the blocks we spent claiming it.
      if (!a.prev && target.owner === 'you' && a.ownerName !== s.name) {
        // Exact refund: the claim cost plus every block we spent building
        // (1 block of balance per 1 block of progress, toolkit included).
        const refund = target.type ? BUILDING_DEFS[target.type].cost + target.progress : 0;
        return {
          ...s,
          blocks: s.blocks + refund,
          plots: s.plots.map((p) => (p.id === a.plot ? { ...p, type: null, progress: 0, done: false, owner: null, ownerName: null } : p)),
          toasts: [...s.toasts, { id: nextId(), text: `⚠️ Plot ${a.plot + 1} was already claimed${refund ? ` — ${refund} blocks refunded` : ''}` }],
        };
      }
      // one of our listings sold (the server relayed the buyer's claim)
      if (a.prev === s.name && a.ownerName !== s.name) {
        const price = a.price ?? 0;
        return {
          ...s,
          balance: s.balance + price,
          listings: s.listings.filter((l) => l.plot !== a.plot),
          plots: s.plots.map((p) => (p.id === a.plot ? { ...p, owner: 'other' as const, ownerName: a.ownerName, type, progress, done } : p)),
          feed: price ? [{ id: nextId(), icon: '💰', text: `Your plot ${a.plot + 1} sold`, detail: `A resident paid ${price.toLocaleString()} $BLOCKVILLE` }, ...s.feed].slice(0, 8) : s.feed,
          toasts: price ? [...s.toasts, { id: nextId(), text: `💰 Plot sold — +${price.toLocaleString()} $BLOCKVILLE` }] : s.toasts,
        };
      }
      const mine = a.ownerName === s.name;
      return {
        ...s,
        plots: s.plots.map((p) =>
          p.id === a.plot
            ? { ...p, owner: mine ? ('you' as const) : ('other' as const), ownerName: a.ownerName, type, progress, done, level }
            : p,
        ),
      };
    }
    case 'remoteBuild': {
      // construction progress on someone else's plot; our own build state is
      // authoritative locally (the server validates and relays it for us)
      const target = s.plots.find((p) => p.id === a.plot);
      if (!target || target.owner === 'you') return s;
      // the type can arrive with the first build update when it was chosen after the claim
      const type = (a.type && !target.type ? a.type : target.type) as typeof target.type;
      if (target.progress === a.progress && target.done === a.done && type === target.type) return s;
      return { ...s, plots: s.plots.map((p) => (p.id === a.plot ? { ...p, progress: a.progress, done: a.done, type } : p)) };
    }
    case 'remoteUpgrade': {
      // another session (or the welcome snapshot) upgraded a building —
      // remote level is authoritative, never regress below it
      const target = s.plots.find((p) => p.id === a.plot);
      if (!target || a.level <= target.level) return s;
      return { ...s, plots: s.plots.map((p) => (p.id === a.plot ? { ...p, level: a.level } : p)) };
    }
    case 'remoteUnlist':
      return { ...s, listings: s.listings.filter((l) => l.id !== a.id) };
    case 'syncListings':
      return {
        ...s,
        listings: a.listings.map((l) => {
          const mine = l.mine || l.seller === s.name;
          return { ...l, mine, seller: mine ? 'You' : l.seller };
        }),
      };
    case 'simClaim': {
      const target = s.plots.find((p) => p.id === a.plot);
      if (!target || target.owner) return s;
      const def = BUILDING_DEFS[a.type];
      return {
        ...s,
        plots: s.plots.map((p) =>
          p.id === a.plot
            ? { ...p, type: a.type, progress: def.cost, done: true, owner: 'other' as const, ownerName: a.name }
            : p,
        ),
        feed: [
          { id: nextId(), icon: '🏡', text: `A resident claimed plot ${a.plot + 1}`, detail: `${def.name} — Wave-1 supply: ${s.plots.filter((p) => !p.owner).length - 1}/${TOTAL_PLOTS} left` },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'simList': {
      // a listing created on the server (NPC sim, or our own listPlot echoed
      // back with its server id). Reconcile by plot so the seller's local
      // listing adopts the server id everyone else uses.
      if (s.listings.some((l) => l.id === a.id)) return s;
      const mine = a.seller === s.name;
      const listing: Listing = { id: a.id, plot: a.plot, seller: mine ? 'You' : a.seller, price: a.price, mine };
      return {
        ...s,
        listings: s.listings.some((l) => l.plot === a.plot)
          ? s.listings.map((l) => (l.plot === a.plot ? listing : l))
          : [...s.listings, listing],
      };
    }
    case 'simBuy': {
      const l = s.listings.find((x) => x.id === a.id);
      if (!l) return s;
      const mine = l.mine;
      const newOwner = a.ownerName ?? RESIDENTS.filter((r) => r !== s.name)[a.id % Math.max(1, RESIDENTS.filter((r) => r !== s.name).length)];
      const soldFeed = l.mine
        ? [{
            id: nextId(),
            icon: '💰',
            text: `Your plot ${l.plot + 1} sold`,
            detail: `A resident paid ${l.price.toLocaleString()} $BLOCKVILLE`,
          }]
        : [{
            id: nextId(),
            icon: '🏷️',
            text: `Plot ${l.plot + 1} sold`,
            detail: `${l.seller} found a buyer`,
          }];
      return {
        ...s,
        balance: mine ? s.balance + l.price : s.balance,
        listings: s.listings.filter((x) => x.id !== a.id),
        plots: mine
          ? s.plots.map((p) => (p.id === l.plot ? { ...p, owner: 'other' as const, ownerName: newOwner } : p))
          : s.plots,
        feed: [soldFeed[0], ...s.feed].slice(0, 8),
        toasts: l.mine ? [...s.toasts, { id: nextId(), text: `💰 Plot sold — +${l.price.toLocaleString()} $BLOCKVILLE` }] : s.toasts,
      };
    }
    case 'buyItem': {
      const item = STORE_ITEMS.find((i) => i.id === a.item);
      if (!item || s.balance < item.price) return s;
      // Every Store purchase is routed straight to the Treasury (CONFIG.treasury.storeRoutePct).
      const routed = item.price * (CONFIG.treasury.storeRoutePct / 100);
      const base: State = {
        ...s,
        balance: s.balance - item.price,
        treasury: {
          ...s.treasury,
          balance: s.treasury.balance + routed,
          ledger: [
            { id: nextId(), icon: '🏪', text: `${item.name} purchased`, detail: `${routed.toLocaleString()} $BLOCKVILLE routed to the Treasury (${CONFIG.treasury.storeRoutePct}%)` },
            ...s.treasury.ledger,
          ].slice(0, 8),
        },
      };
      if (item.kind === 'useful') {
        const flag = item.useful!;
        if ((flag === 'boots' && s.boots) || (flag === 'toolkit' && s.toolkit) || (flag === 'permit' && s.permit)) return s;
        const patch = flag === 'boots' ? { boots: true } : flag === 'toolkit' ? { toolkit: true } : { permit: true };
        return {
          ...base,
          ...patch,
          toasts: [...s.toasts, { id: nextId(), text: `${item.icon} ${item.name} — ${item.blurb}` }],
          feed: [
            { id: nextId(), icon: item.icon, text: `${item.name} purchased`, detail: item.blurb },
            ...s.feed,
          ].slice(0, 8),
        };
      }
      if (item.townDecor) {
        return {
          ...base,
          townDecorInventory: { ...s.townDecorInventory, [item.townDecor]: (s.townDecorInventory[item.townDecor] || 0) + 1 },
          toasts: [...s.toasts, { id: nextId(), text: `${item.icon} ${item.name} added to your Town Details inventory` }],
          feed: [{ id: nextId(), icon: item.icon, text: `${item.name} purchased`, detail: 'Stored in your Town Details inventory' }, ...s.feed].slice(0, 8),
        };
      }
      if (item.kind === 'garden') {
        return {
          ...base,
          gardenKits: s.gardenKits + 1,
          toasts: [...s.toasts, { id: nextId(), text: `🌷 Garden Kit — walk to one of your buildings and open it to place` }],
          feed: [
            { id: nextId(), icon: '🌷', text: 'Garden Kit purchased', detail: `Open one of your finished buildings to place it (×${CONFIG.garden.boost} fee yield)` },
            ...s.feed,
          ].slice(0, 8),
        };
      }
      if (item.glasses) {
        if (s.unlockedGlasses.includes(item.glasses)) return s;
        return {
          ...base,
          unlockedGlasses: [...s.unlockedGlasses, item.glasses],
          toasts: [...s.toasts, { id: nextId(), text: `${item.icon} ${item.name} unlocked — customise your resident!` }],
          feed: [
            { id: nextId(), icon: item.icon, text: `${item.name} unlocked`, detail: `Equip it in the character customiser` },
            ...s.feed,
          ].slice(0, 8),
        };
      }
      if (item.design) {
        if (s.unlockedDesigns.includes(item.design)) return s;
        return {
          ...base,
          unlockedDesigns: [...s.unlockedDesigns, item.design],
          toasts: [...s.toasts, { id: nextId(), text: `${item.icon} ${item.name} unlocked — customise your resident!` }],
          feed: [
            { id: nextId(), icon: item.icon, text: `${item.name} unlocked`, detail: `Equip it in the character customiser` },
            ...s.feed,
          ].slice(0, 8),
        };
      }
      const hat = item.cosmetic!;
      if (s.unlockedHats.includes(hat)) return s;
      return {
        ...base,
        unlockedHats: [...s.unlockedHats, hat],
        toasts: [...s.toasts, { id: nextId(), text: `${item.icon} ${item.name} unlocked — customise your resident!` }],
        feed: [
          { id: nextId(), icon: item.icon, text: `${item.name} unlocked`, detail: `Equip it in the character customiser` },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'placeGarden': {
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || !plot.done || plot.owner !== 'you') return s;
      if (s.gardens.includes(a.plot) || s.gardenKits <= 0) return s;
      const placedHere = s.plotDecor[a.plot] || [];
      const slot = allocateSlot(plot.type, placedHere, 'garden');
      if (!slot) return { ...s, toasts: [...s.toasts, { id: nextId(), text: 'No room left in this yard for a garden bed' }] };
      return {
        ...s,
        gardenKits: s.gardenKits - 1,
        gardens: [...s.gardens, a.plot],
        plotDecor: { ...s.plotDecor, [a.plot]: [...placedHere, { id: `${a.plot}-garden-${nextId()}`, kind: 'garden', ...slot }] },
        toasts: [...s.toasts, { id: nextId(), text: `🌷 Garden placed — ×${CONFIG.garden.boost} fee yield on Plot ${a.plot + 1}` }],
        feed: [
          { id: nextId(), icon: '🌷', text: 'Garden placed', detail: `Plot ${a.plot + 1} now earns ×${CONFIG.garden.boost} fees` },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'placeDecor': {
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || !plot.done || plot.owner !== 'you' || (s.townDecorInventory[a.kind] || 0) < 1) return s;
      const placedHere = s.plotDecor[a.plot] || [];
      const slot = allocateSlot(plot.type, placedHere, a.kind);
      if (!slot) return { ...s, toasts: [...s.toasts, { id: nextId(), text: `No room left in this yard for a ${DECOR_LABEL[a.kind].toLowerCase()}` }] };
      return {
        ...s,
        townDecorInventory: { ...s.townDecorInventory, [a.kind]: (s.townDecorInventory[a.kind] || 0) - 1 },
        plotDecor: { ...s.plotDecor, [a.plot]: [...placedHere, { id: `${a.plot}-${a.kind}-${nextId()}`, kind: a.kind, ...slot }] },
        toasts: [...s.toasts, { id: nextId(), text: `${DECOR_LABEL[a.kind]} placed on Plot ${a.plot + 1}` }],
      };
    }
    case 'removeDecor': {
      const plot = s.plots.find((p) => p.id === a.plot);
      const found = (s.plotDecor[a.plot] || []).find((f) => f.id === a.id);
      if (!plot || plot.owner !== 'you' || !found || found.kind === 'garden') return s;
      return {
        ...s,
        townDecorInventory: { ...s.townDecorInventory, [found.kind]: (s.townDecorInventory[found.kind] || 0) + 1 },
        plotDecor: { ...s.plotDecor, [a.plot]: s.plotDecor[a.plot].filter((f) => f.id !== a.id) },
      };
    }
    case 'setLook':
      return { ...s, look: a.look };
    case 'setName': {
      // multiplayer identity — trimmed, capped at 12 chars, persisted
      const clean = a.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
      try { localStorage.setItem('blockville_name', clean); } catch { /* private mode */ }
      // first entry into town: pick your resident's look (was previously tied
      // to the removed stake step — Chunk 6 moves it to naming)
      return { ...s, name: clean, customiseOpen: true };
    }
    case 'setStoreOpen':
      return { ...s, storeOpen: a.open, selectedPlot: a.open ? null : s.selectedPlot };
    case 'setCustomiseOpen':
      return { ...s, customiseOpen: a.open };
    case 'setTreasuryOpen':
      return { ...s, treasuryOpen: a.open, selectedPlot: a.open ? null : s.selectedPlot };
    case 'setTokenomicsOpen':
      return { ...s, tokenomicsOpen: a.open, selectedPlot: a.open ? null : s.selectedPlot };
    case 'setWhitepaperOpen':
      return { ...s, whitepaperOpen: a.open, selectedPlot: a.open ? null : s.selectedPlot };
    // Chunk 6: the server's verified-holdings entitlement snapshot drives the
    // claim allowance display; the server stays the only enforcement point.
    case 'entitlement':
      return { ...s, entitlement: { tokens: a.tokens, entitlement: a.entitlement, claimed: a.claimed, verified: a.verified, source: a.source } };
    // Chunk 6: the server revoked one of this player's plots (holdings fell
    // below the claimed tier, two-read guard passed). The plot is free again
    // immediately; the building does NOT remain (documented simpler option) —
    // spent blocks are not refunded, matching the server-side record removal.
    case 'plotRevoked': {
      const target = s.plots.find((p) => p.id === a.plot);
      if (!target || target.owner !== 'you') return s;
      return {
        ...s,
        plots: s.plots.map((p) => (p.id === a.plot ? { ...p, type: null, progress: 0, done: false, level: 1, owner: null, ownerName: null } : p)),
        gardens: s.gardens.filter((g) => g !== a.plot),
        toasts: [...s.toasts, { id: nextId(), text: `🔒 Plot ${a.plot + 1} revoked — your $BLOCKVILLE holdings fell below the tier` }],
      };
    }
    case 'treasuryIn': {
      return {
        ...s,
        treasury: {
          ...s.treasury,
          balance: s.treasury.balance + a.amount,
          ledger: [
            { id: nextId(), icon: a.label.slice(0, 2), text: a.label, detail: a.detail },
            ...s.treasury.ledger,
          ].slice(0, 8),
        },
      };
    }
    case 'treasuryPayout': {
      // Server-computed payout (Chunk T3): the amount accrued to this
      // player's claimable server-side balance this cycle. The client NEVER
      // credits its own wallet from it — the server is the authority.
      if (!(a.amount > 0)) return s;
      // the PERSONAL log entry carries the cycle id and the server timestamp
      // (earnings-card chunk) — every field arrives in the server message.
      const at = new Date(a.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return {
        ...s,
        toasts: [...s.toasts, { id: nextId(), icon: '💸', text: `Treasury payout — +${a.amount.toLocaleString()} $BLOCKVILLE accrued`, detail: `Cycle #${a.cycle} · ${at}` }],
        feed: [
          { id: nextId(), icon: '💸', text: 'Treasury payout', detail: `+${a.amount.toLocaleString()} $BLOCKVILLE paid automatically · your weight ${a.weight.toLocaleString()} of ${a.totalPoints.toLocaleString()} points` },
          ...s.feed,
        ].slice(0, 8),
        lastDistribution: { total: a.paidTotal, yourShare: a.amount },
      };
    }
    case 'feesEarned':
      // one authoritative snapshot per player, refreshed by the server on
      // welcome and after every cycle. Replace wholesale — never merge with
      // client-side maths.
      return { ...s, feesEarned: { total: a.total, entries: a.entries } };
    case 'treasuryCycle': {
      // The displayed treasury pot shrinks by exactly what the server paid
      // out this cycle; round-down dust stays in.
      if (!(a.paid > 0)) return s;
      return {
        ...s,
        treasury: {
          ...s.treasury,
          balance: Math.max(0, s.treasury.balance - a.paid),
          ledger: [
            { id: nextId(), icon: '💸', text: 'Fee distribution paid', detail: `Treasury ${a.balanceBefore.toLocaleString()} → ${a.balanceAfter.toLocaleString()} $BLOCKVILLE — ${a.paid.toLocaleString()} distributed by plot weight (${a.remainder.toLocaleString()} round-down dust stays in)` },
            ...s.treasury.ledger,
          ].slice(0, 8),
        },
      };
    }
    case 'npcRewardDirect': {
      return {
        ...s,
        balance: s.balance + a.amount,
        feed: [
          {
            id: nextId(),
            icon: '💸',
            text: 'Fee distribution received',
            detail: `Your plot-weighted share of the Treasury payout: +${a.amount.toFixed(2)} $BLOCKVILLE`,
          },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'npcReward': {
      const def = BUILDING_DEFS[a.building];
      // Fee split: CONFIG.treasury.pumpfunSharePct% of every fee goes to the
      // Treasury; the remainder is the building owner's share.
      const toTreasury = a.amount * (CONFIG.treasury.pumpfunSharePct / 100);
      const toOwner = a.amount - toTreasury;
      return {
        ...s,
        balance: s.balance + toOwner,
        treasury: {
          ...s.treasury,
          balance: s.treasury.balance + toTreasury,
        },
        feed: [
          {
            id: nextId(),
            icon: '💰',
            text: `${def.name} fee event — ${a.amount.toFixed(2)} $BLOCKVILLE`,
            detail: `${CONFIG.treasury.pumpfunSharePct}% (${toTreasury.toFixed(2)}) → Treasury · you earned +${toOwner.toFixed(2)}`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: [...s.toasts, { id: nextId(), text: `💰 +${toOwner.toFixed(2)} $BLOCKVILLE` }],
      };
    }
    case 'feed':
      return { ...s, feed: [{ id: nextId(), icon: a.icon, text: a.text, detail: a.detail }, ...s.feed].slice(0, 8) };
    case 'toast':
      // a personal message raises the log badge unless PERSONAL is on screen;
      // the badge is cleared by setLogOpen/setLogTab (see below)
      return {
        ...s,
        toasts: [...s.toasts, { id: nextId(), text: a.text, icon: a.icon, detail: a.detail }],
        logUnread: s.logOpen && s.logTab === 'personal' ? s.logUnread : true,
      };
  }
}

// Personal messages accumulate for the whole session, so the list is capped:
// the log keeps the most recent entries and a long session cannot grow the
// array without bound. The unread badge tracks toast ids, not length.
const TOAST_CAP = 60;
export function reducer(s: State, a: Action): State {
  const n = baseReducer(s, a);
  return n.toasts.length > TOAST_CAP ? { ...n, toasts: n.toasts.slice(-TOAST_CAP) } : n;
}

// ── Engine bridge ──────────────────────────────────────────────────────────
export interface EngineApi {
  sync: (plots: Plot[], npcTarget: number) => void;
  setLook: (look: PlayerLook) => void;
  setInputEnabled: (v: boolean) => void;
  playerPos: () => { x: number; z: number; ry: number };
  setInterior: (plot: number | null, paint: string, placements: Array<{ id: string; itemId: string; x: number; z: number; rotation: number }>) => void;
  setPlotDecor: (plotId: number, features: PlacedFeature[]) => void;
  dispose: () => void;
}

const Ctx = createContext<{ state: State; dispatch: React.Dispatch<Action> } | null>(null);

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame outside provider');
  return v;
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const engineRef = useRef<EngineApi | null>(null);

  // Settings sliders → the real WebAudio gains. Applied on mount too, so
  // persisted volumes take effect before any sound plays.
  useEffect(() => {
    setAudioVolumes(state.volumes);
  }, [state.volumes]);

  // A short blip whenever a personal message lands in the log. Tracked by
  // toast id (the list is length-capped, so length alone can plateau).
  const lastToastId = useRef(0);
  useEffect(() => {
    const top = state.toasts[state.toasts.length - 1];
    if (top && top.id > lastToastId.current) {
      lastToastId.current = top.id;
      sfx('toast');
    }
  }, [state.toasts]);

  // Latest state for the simulation heartbeat (avoids stale closures).
  const stateRef = useRef(state);
  stateRef.current = state;
  // debug mirror for automated playtests (dev only)
  if (import.meta.env.DEV) (window as any).__bvState = state;
  if (import.meta.env.DEV) (window as any).__bvDispatch = dispatch;

  // Persist the demo wallet so normal reloads do not reset balance or blocks.
  useEffect(() => {
    try {
      localStorage.setItem('blockville_staking', JSON.stringify({
        balance: state.balance,
        blocks: state.blocks,
      }));
    } catch { /* private mode or unavailable storage */ }
    try {
      localStorage.setItem('blockville_store_progress', JSON.stringify({
        unlockedHats: state.unlockedHats, unlockedGlasses: state.unlockedGlasses,
        unlockedDesigns: state.unlockedDesigns, townDecorInventory: state.townDecorInventory,
        permit: state.permit, furnitureInventory: state.furnitureInventory,
        volumes: state.volumes,
      }));
    } catch { /* private mode or unavailable storage */ }
  }, [state.balance, state.blocks, state.unlockedHats, state.unlockedGlasses, state.unlockedDesigns, state.townDecorInventory, state.permit, state.furnitureInventory, state.volumes]);

  // Simulated PumpFun fee drip: 75% of every fee lands in the Treasury
  // (CONFIG.treasury.pumpfunSharePct). Runs on the same heartbeat as the
  // market so the cadence stays in one place.
  useEffect(() => {
    const t = CONFIG.treasury;
    const iv = setInterval(() => {
      if (Math.random() >= t.pumpfunTick.chance) return;
      const gross = t.pumpfunTick.min + Math.random() * (t.pumpfunTick.max - t.pumpfunTick.min);
      const routed = gross * (t.pumpfunSharePct / 100);
      const notable = gross >= t.pumpfunTick.min + (t.pumpfunTick.max - t.pumpfunTick.min) * 0.7;
      dispatch({
        t: 'treasuryIn',
        amount: Math.round(routed * 100) / 100,
        label: notable ? 'PumpFun fees collected' : 'pumpfun fee drip',
        detail: `${gross.toFixed(2)} $BLOCKVILLE collected · ${t.pumpfunSharePct}% (${routed.toFixed(2)}) → Treasury`,
      });
    }, CONFIG.market.tickMs);
    return () => clearInterval(iv);
  }, []);

  // Treasury fee distribution moved SERVER-SIDE (Chunk T3): the backend runs
  // the real 5-minute, 20%-of-holdings, plot-weighted engine and pushes
  // `treasuryPayout` / `treasuryCycle` messages. The old client-side demo
  // distribution (stake-weighted, jittered timer) is gone — two competing
  // engines would double-pay.

  // The engine lives in App via a ref set by GameCanvas; feed reward events through here.
  const api = useMemo(
    () => ({
      requestReward: (building: BuildingType, level: number, plotId: number) => {
        if (Math.random() < CONFIG.feeChance) {
          // upgrades multiply the fee yield of the building that earned them,
          // and a placed garden boosts it further (×1.2)
          const base = CONFIG.feeMin + Math.random() * (CONFIG.feeMax - CONFIG.feeMin);
          const gardenBoost = stateRef.current.gardens.includes(plotId) ? CONFIG.garden.boost : 1;
          const amt =
            base * CONFIG.upgrades.yieldMult[Math.max(0, Math.min(CONFIG.upgrades.maxLevel, level) - 1)] * gardenBoost;
          dispatch({ t: 'npcReward', building, amount: Math.round(amt * 100) / 100 });
        }
      },
    }),
    [],
  );
  const apiRef = useRef(api);
  apiRef.current = api;

  // Engine is constructed lazily by GameCanvas through this hook:
  const setEngine = (e: EngineApi | null) => {
    engineRef.current = e;
  };
  const getEngine = () => engineRef.current;
  const rewardBridge = () => apiRef.current;

  return (
    <Ctx.Provider value={{ state, dispatch }}>
      <engineBridgeContext.Provider value={{ setEngine, getEngine, rewardBridge }}>
        {children}
      </engineBridgeContext.Provider>
    </Ctx.Provider>
  );
}

const engineBridgeContext = createContext<{
  setEngine: (e: EngineApi | null) => void;
  getEngine: () => EngineApi | null;
  rewardBridge: () => { requestReward: (b: BuildingType, level: number, plotId: number) => void };
} | null>(null);

export function useEngineBridge() {
  const v = useContext(engineBridgeContext);
  if (!v) throw new Error('engine bridge outside provider');
  return v;
}

// Personal messages now persist in the bottom-left log — nothing auto-expires.
// This hook only raises the unread badge when a personal message arrives while
// the user isn't looking at the PERSONAL tab.
export function usePersonalUnread() {
  const { state, dispatch } = useGame();
  const prevId = useRef(0);
  useEffect(() => {
    const top = state.toasts[state.toasts.length - 1];
    if (top && top.id > prevId.current && !(state.logOpen && state.logTab === 'personal')) {
      dispatch({ t: 'logUnread' });
    }
    prevId.current = top ? top.id : prevId.current;
  }, [state.toasts, state.logOpen, state.logTab, dispatch]);
}
