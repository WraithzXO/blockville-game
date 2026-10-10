import  React, { createContext, useContext, useEffect, useMemo, useReducer, useRef }  from 'react';
import { allocateSlot, type PlacedFeature, type PlotFeatureKind, DECOR_LABEL } from '../plots/PlotLayout';
import  { BUILDING_DEFS, COMMUNITY_PLOTS, CONFIG, PLOT_POSITIONS, RESIDENT_BUILDERS, START_LISTINGS, TOTAL_PLOTS, DEFAULT_LOOK, STORE_ITEMS, plotAllowance, type BuildingType, type PlayerLook, FURNITURE_DEFS, stakingRewardFor }  from './config';

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

export interface Toast { id: number; text: string; }
export interface FurniturePlacement { id: string; itemId: string; x: number; z: number; rotation: number; locked?: boolean; }

interface State {
  mode: 'demo' | 'wallet' | null;
  onboarded: boolean;      // staking modal dismissed
  balance: number;         // demo $BLOCKVILLE wallet balance
  sol: number;             // demo SOL balance for building upgrades
  staked: number;
  blocks: number;
  builder: boolean;
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
  stakeMoreOpen: boolean;
  stakeDockClosed: boolean;    // pre-stake store dock hidden by the player
  lastDistribution: { total: number; yourShare: number } | null;
  nearPlot: number | null;     // plot the resident is standing next to
  promptText: string | null;   // world-object interact prompt (E — …)
  noticeOpen: boolean;         // town noticeboard panel
  logOpen: boolean;            // bottom-left activity log expanded
  logTab: 'town' | 'personal'; // which activity log section is selected
  logUnread: boolean;          // something new in PERSONAL while viewing TOWN
  furnitureInventory: Record<string, number>;
  houseFurniture: Record<number, FurniturePlacement[]>;
  interiorPlot: number | null;
  furnitureStoreOpen: boolean;
  arcadeOpen: boolean;
  arcadeScores: ArcadeScore[];
}

type Action =
  | { t: 'setMode'; mode: 'demo' | 'wallet' }
  | { t: 'stake'; amount: number }
  | { t: 'stakeMore'; amount: number }
  | { t: 'claim'; plot: number; type: BuildingType }
  | { t: 'buildClick'; plot: number }
  | { t: 'selectPlot'; plot: number | null }
  | { t: 'setMarketOpen'; open: boolean }
  | { t: 'listPlot'; plot: number; price: number }
  | { t: 'cancelListing'; id: number }
  | { t: 'buyListing'; id: number }
  | { t: 'remoteClaim'; plot: number; ownerName: string }
  | { t: 'simClaim'; plot: number; type: BuildingType; name: string }
  | { t: 'simList'; plot: number; price: number; seller: string }
  | { t: 'simBuy'; id: number }
  | { t: 'buyItem'; item: string }
  | { t: 'placeGarden'; plot: number }
  | { t: 'placeDecor'; plot: number; kind: Exclude<PlotFeatureKind, 'garden'> }
  | { t: 'removeDecor'; plot: number; id: string }
  | { t: 'upgrade'; plot: number }
  | { t: 'setTreasuryOpen'; open: boolean }
  | { t: 'setStakeMoreOpen'; open: boolean }
  | { t: 'setStakeDockClosed'; closed: boolean }
  | { t: 'treasuryIn'; amount: number; label: string; detail: string }
  | { t: 'treasuryDistribute'; total: number; yourShare: number }
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
  | { t: 'foundCoins'; amount: number; source: string }
  | { t: 'npcReward'; building: BuildingType; amount: number }
  | { t: 'npcRewardDirect'; amount: number }
  | { t: 'feed'; icon: string; text: string; detail: string }
  | { t: 'toast'; text: string };

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

const loadStaking = () => {
  const fallback = { builder: false, balance: 60000, staked: 0, blocks: 0 };
  try {
    const raw = localStorage.getItem('blockville_staking');
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const finite = (value: unknown, fallbackValue: number) => Number.isFinite(Number(value)) ? Number(value) : fallbackValue;
    return {
      builder: parsed.builder === true,
      balance: Math.max(0, finite(parsed.balance, fallback.balance)),
      staked: Math.max(0, finite(parsed.staked, 0)),
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
    };
  } catch { return { unlockedHats: [], unlockedGlasses: [], unlockedDesigns: [], townDecorInventory: {}, permit: false }; }
};
const persistedStaking = loadStaking();
const persistedStore = loadStoreProgress();

const initialListings = (): Listing[] =>
  START_LISTINGS.map((l, i) => ({
    id: i + 1,
    plot: l.plot,
    seller: `Resident ${String.fromCharCode(65 + i)}`,
    price: l.price,
    mine: false,
  }));

const initial: State = {
  mode: null,
  onboarded: false,
  balance: persistedStaking.balance, // persisted demo wallet balance
  sol: CONFIG.demoSol,
  staked: persistedStaking.staked,
  blocks: persistedStaking.blocks,
  builder: persistedStaking.builder,
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
  stakeMoreOpen: false,
  stakeDockClosed: false,
  lastDistribution: null,
  nearPlot: null,
  promptText: null,
  noticeOpen: false,
  logOpen: false,
  logTab: 'town',
  logUnread: false,
  furnitureInventory: {},
  houseFurniture: {},
  interiorPlot: null,
  furnitureStoreOpen: false,
  arcadeOpen: false,
  arcadeScores: loadArcadeScores(),
};

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'setMode':
      return { ...s, mode: a.mode };
    case 'stake': {
      const amount = Number.isFinite(a.amount) ? a.amount : 0;
      if (s.builder || amount < CONFIG.stakeMin || amount > s.balance) return s;
      const blocksAwarded = stakingRewardFor(amount);
      const feed: FeedItem[] = [
        {
          id: nextId(),
          icon: '🏗️',
          text: 'You are now a Blockville Builder',
          detail: `Staked ${amount.toLocaleString()} $BLOCKVILLE · +${blocksAwarded.toFixed(4)} instant Blocks`,
        },
        ...s.feed,
      ].slice(0, 8);
      return {
        ...s,
        builder: true,
        staked: amount,
        balance: s.balance - amount,
        blocks: s.blocks + blocksAwarded,
        feed,
        toasts: [
          ...s.toasts,
          { id: nextId(), text: `🏗️ Builder unlocked — +${blocksAwarded.toFixed(4)} instant Blocks` },
        ],
        customiseOpen: true,   // first visit: pick your resident's look
      };
    }
    case 'stakeMore': {
      const amount = Number.isFinite(a.amount) ? a.amount : 0;
      if (!s.builder || amount <= 0 || amount > s.balance) return s;
      const blocksAwarded = stakingRewardFor(amount);
      const before = plotAllowance(s.staked, s.permit ? CONFIG.items.permitExtraPlots : 0);
      const staked = s.staked + amount;
      const after = plotAllowance(staked, s.permit ? CONFIG.items.permitExtraPlots : 0);
      return {
        ...s,
        balance: s.balance - amount,
        staked,
        blocks: s.blocks + blocksAwarded,
        feed: [
          {
            id: nextId(),
            icon: '🔒',
            text: `Staked ${amount.toLocaleString()} $BLOCKVILLE`,
            detail: `${after > before ? `You can now claim ${after} block${after === 1 ? '' : 's'} of land · ` : ''}+${blocksAwarded.toFixed(4)} instant Blocks · total staked: ${staked.toLocaleString()}`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: [
          ...s.toasts,
          { id: nextId(), text: `🧱 +${blocksAwarded.toFixed(4)} instant Blocks · ${after}/${CONFIG.maxPlots} land blocks unlocked` },
        ],
      };
    }
    case 'claim': {
      const def = BUILDING_DEFS[a.type];
      if (s.blocks < def.cost) return s;
      const target = s.plots.find((p) => p.id === a.plot)!;
      if (target.owner) return s;                          // plot already taken
      const claimed = s.plots.filter((p) => p.owner === 'you').length;
      if (claimed >= plotAllowance(s.staked, s.permit ? CONFIG.items.permitExtraPlots : 0)) return s;
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
      const step = s.toolkit ? Math.min(CONFIG.items.toolkitPerClick, s.blocks) : 1;
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
    case 'setArcadeScores': {
      const scores = a.scores.filter((x) => x && Number.isFinite(x.score)).slice(0, 10);
      try { localStorage.setItem('blockville.arcadeScores', JSON.stringify(scores)); } catch {}
      return { ...s, arcadeScores: scores };
    }
    case 'buyFurniture': {
      const item = FURNITURE_DEFS.find((x) => x.id === a.itemId);
      if (!item) return s;
      if (s.balance < item.price) return { ...s, toasts: [...s.toasts, { id: nextId(), text: `Not enough $BLOCKVILLE for ${item.name}` }] };
      return { ...s, balance: s.balance - item.price, furnitureInventory: { ...s.furnitureInventory, [item.id]: (s.furnitureInventory[item.id] || 0) + 1 }, furnitureStoreOpen: false,
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
    case 'remoteHouseState':
      return { ...s, houseFurniture: { ...s.houseFurniture, [a.plot]: a.placements } };
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
    case 'foundCoins': {
      // tiny, rare pocket-change finds — deliberately NOT an income stream
      return {
        ...s,
        balance: s.balance + a.amount,
        toasts: [...s.toasts, { id: nextId(), text: `💡 You found ${a.amount} $BLOCKVILLE (${a.source})` }],
      };
    }
    case 'setStakeMoreOpen':
      return { ...s, stakeMoreOpen: a.open };
    case 'setStakeDockClosed':
      return { ...s, stakeDockClosed: a.closed };
    case 'upgrade': {
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || plot.owner !== 'you' || !plot.done || !plot.type) return s;
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
      // ownership change relayed by the server (another connected player, or the
      // welcome snapshot). Keeps the "Plot owned by" label identical for everyone.
      if (s.plots.some((p) => p.id === a.plot && p.ownerName === a.ownerName)) return s;
      const mine = a.ownerName === s.name;
      return {
        ...s,
        plots: s.plots.map((p) =>
          p.id === a.plot
            ? { ...p, owner: mine ? ('you' as const) : ('other' as const), ownerName: a.ownerName }
            : p,
        ),
      };
    }
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
      const plot = s.plots.find((p) => p.id === a.plot);
      if (!plot || plot.owner !== 'other') return s;
      if (s.listings.some((l) => l.plot === a.plot)) return s;
      if (s.listings.length >= CONFIG.market.maxOpenListings) return s;
      return {
        ...s,
        listings: [...s.listings, { id: nextId(), plot: a.plot, seller: a.seller, price: a.price, mine: false }],
      };
    }
    case 'simBuy': {
      const l = s.listings.find((x) => x.id === a.id);
      if (!l) return s;
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
        balance: l.mine ? s.balance + l.price : s.balance,
        listings: s.listings.filter((x) => x.id !== a.id),
        plots: l.mine
          ? s.plots.map((p) => (p.id === l.plot ? { ...p, owner: 'other' as const, ownerName: RESIDENTS.filter((r) => r !== s.name)[l.id % Math.max(1, RESIDENTS.filter((r) => r !== s.name).length)] } : p))
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
      return { ...s, name: clean };
    }
    case 'setStoreOpen':
      return { ...s, storeOpen: a.open, selectedPlot: a.open ? null : s.selectedPlot };
    case 'setCustomiseOpen':
      return { ...s, customiseOpen: a.open };
    case 'setTreasuryOpen':
      return { ...s, treasuryOpen: a.open, selectedPlot: a.open ? null : s.selectedPlot };
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
    case 'treasuryDistribute': {
      const payout = Math.min(a.total, s.treasury.balance);
      if (payout <= 0) return s;
      return {
        ...s,
        treasury: {
          ...s.treasury,
          balance: s.treasury.balance - payout,
          ledger: [
            { id: nextId(), icon: '💸', text: 'Fee distribution paid out', detail: `${payout.toLocaleString(undefined, { maximumFractionDigits: 2 })} $BLOCKVILLE split across Builders by stake` },
            ...s.treasury.ledger,
          ].slice(0, 8),
        },
        lastDistribution: { total: payout, yourShare: a.yourShare },
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
            detail: `Your stake share of the Treasury payout: +${a.amount.toFixed(2)} $BLOCKVILLE`,
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
      return { ...s, toasts: [...s.toasts, { id: nextId(), text: a.text }] };
  }
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

  // Latest state for the simulation heartbeat (avoids stale closures).
  const stateRef = useRef(state);
  stateRef.current = state;
  // debug mirror for automated playtests (dev only)
  if (import.meta.env.DEV) (window as any).__bvState = state;
  if (import.meta.env.DEV) (window as any).__bvDispatch = dispatch;

  // Persist the demo staking ledger so normal reloads do not reset stake or instant rewards already credited.
  useEffect(() => {
    try {
      localStorage.setItem('blockville_staking', JSON.stringify({
        builder: state.builder,
        balance: state.balance,
        staked: state.staked,
        blocks: state.blocks,
      }));
    } catch { /* private mode or unavailable storage */ }
    try {
      localStorage.setItem('blockville_store_progress', JSON.stringify({
        unlockedHats: state.unlockedHats, unlockedGlasses: state.unlockedGlasses,
        unlockedDesigns: state.unlockedDesigns, townDecorInventory: state.townDecorInventory,
        permit: state.permit,
      }));
    } catch { /* private mode or unavailable storage */ }
  }, [state.builder, state.balance, state.staked, state.blocks, state.unlockedHats, state.unlockedGlasses, state.unlockedDesigns, state.townDecorInventory, state.permit]);

  // Marketplace heartbeat: residents slowly claim free Wave-1 land, list
  // their own plots for sale, and buy listings — occasionally yours.
  useEffect(() => {
    const TYPES = Object.keys(BUILDING_DEFS) as BuildingType[];
    const m = CONFIG.market;
    const iv = setInterval(() => {
      const s = stateRef.current;
      if (Math.random() < m.simClaimChance) {
        const free = s.plots.filter((p) => !p.owner);
        if (free.length) {
          const pick = free[Math.floor(Math.random() * free.length)];
          const type = TYPES[Math.floor(Math.random() * TYPES.length)];
          dispatch({ t: 'simClaim', plot: pick.id, type, name: RESIDENTS[Math.floor(Math.random() * RESIDENTS.length)] });
        }
      }
      if (Math.random() < m.simListChance && s.listings.length < m.maxOpenListings) {
        const owned = s.plots.filter(
          (p) => p.owner === 'other' && !s.listings.some((l) => l.plot === p.id),
        );
        if (owned.length) {
          const pick = owned[Math.floor(Math.random() * owned.length)];
          const price = Math.round(
            (m.listPriceMin + Math.random() * (m.listPriceMax - m.listPriceMin)) / 100,
          ) * 100;
          const seller = RESIDENTS[Math.floor(Math.random() * RESIDENTS.length)];
          dispatch({ t: 'simList', plot: pick.id, price, seller });
        }
      }
      if (Math.random() < m.simBuyChance && s.listings.length) {
        const l = s.listings[Math.floor(Math.random() * s.listings.length)];
        dispatch({ t: 'simBuy', id: l.id });
      }
    }, m.tickMs);
    return () => clearInterval(iv);
  }, []);

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

  // Treasury fee distribution: on a jittered interval, a slice of the Treasury
  // is split across all Builders proportionally to their stake. The player's
  // share uses their real staked amount vs the resident Builders in CONFIG.
  useEffect(() => {
    const t = CONFIG.treasury;
    let handle: ReturnType<typeof setTimeout>;
    const run = () => {
      const s = stateRef.current;
      if (s.treasury.balance > 0) {
        const total = s.treasury.balance * (t.distributePct / 100);
        const residentStake = RESIDENT_BUILDERS.reduce((n, r) => n + r.stake, 0);
        const pool = s.staked + residentStake;
        const yourShare = pool > 0 && s.builder ? (s.staked / pool) * total : 0;
        dispatch({
          t: 'treasuryDistribute',
          total: Math.round(total * 100) / 100,
          yourShare: Math.round(yourShare * 100) / 100,
        });
        if (yourShare > 0) {
          dispatch({
            t: 'toast',
            text: `💸 Fee distribution — +${yourShare.toFixed(2)} $BLOCKVILLE`,
          });
          dispatch({
            t: 'npcRewardDirect',
            amount: Math.round(yourShare * 100) / 100,
          });
        }
      }
      handle = setTimeout(run, t.distributeEveryMs + Math.random() * t.distributeEveryMs * 0.5);
    };
    handle = setTimeout(run, t.distributeEveryMs);
    return () => clearTimeout(handle);
  }, []);

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
  const prev = useRef(state.toasts.length);
  useEffect(() => {
    if (state.toasts.length > prev.current && !(state.logOpen && state.logTab === 'personal')) {
      dispatch({ t: 'logUnread' });
    }
    prev.current = state.toasts.length;
  }, [state.toasts.length, state.logOpen, state.logTab, dispatch]);
}
