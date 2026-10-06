import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import {
  BUILDING_DEFS,
  COMMUNITY_PLOTS,
  CONFIG,
  PLOT_POSITIONS,
  RESIDENT_BUILDERS,
  START_LISTINGS,
  TOTAL_PLOTS,
  DEFAULT_LOOK,
  HATS,
  STORE_ITEMS,
  plotAllowance,
  type BuildingType,
  type PlayerLook,
} from './config';

export interface Plot {
  id: number;
  type: BuildingType | null;
  progress: number;   // blocks placed so far
  done: boolean;
  level: number;      // foundation for future upgrades
  owner: 'you' | 'other' | null;   // who holds the plot (null = free land)
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

export interface Toast {
  id: number;
  text: string;
}

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
  unlockedHats: string[];      // hat ids purchased from the Store
  storeOpen: boolean;
  customiseOpen: boolean;
  treasury: { balance: number; ledger: FeedItem[] };
  treasuryOpen: boolean;
  stakeMoreOpen: boolean;
  stakeDockClosed: boolean;    // pre-stake store dock hidden by the player
  lastDistribution: { total: number; yourShare: number } | null;
  nearPlot: number | null;     // plot the resident is standing next to
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
  | { t: 'simClaim'; plot: number; type: BuildingType }
  | { t: 'simList'; plot: number; price: number; seller: string }
  | { t: 'simBuy'; id: number }
  | { t: 'buyItem'; item: string }
  | { t: 'upgrade'; plot: number }
  | { t: 'setTreasuryOpen'; open: boolean }
  | { t: 'setStakeMoreOpen'; open: boolean }
  | { t: 'setStakeDockClosed'; closed: boolean }
  | { t: 'treasuryIn'; amount: number; label: string; detail: string }
  | { t: 'treasuryDistribute'; total: number; yourShare: number }
  | { t: 'setLook'; look: PlayerLook }
  | { t: 'setStoreOpen'; open: boolean }
  | { t: 'setCustomiseOpen'; open: boolean }
  | { t: 'setNearPlot'; plot: number | null }
  | { t: 'npcReward'; building: BuildingType; amount: number }
  | { t: 'npcRewardDirect'; amount: number }
  | { t: 'feed'; icon: string; text: string; detail: string }
  | { t: 'toast'; text: string }
  | { t: 'toastGone'; id: number };

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
      };
    }
    return { id: p.id, type: null, progress: 0, done: false, level: 1, owner: null };
  });

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
  balance: 60000, // demo wallet balance so the 20K stake is testable
  sol: CONFIG.demoSol,
  staked: 0,
  blocks: 0,
  builder: false,
  plots: emptyPlots(),
  listings: initialListings(),
  marketOpen: false,
  feed: [],
  toasts: [],
  selectedPlot: null,
  look: { ...DEFAULT_LOOK },
  unlockedHats: [],
  storeOpen: false,
  customiseOpen: false,
  treasury: { balance: 0, ledger: [] },
  treasuryOpen: false,
  stakeMoreOpen: false,
  stakeDockClosed: false,
  lastDistribution: null,
  nearPlot: null,
};

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'setMode':
      return { ...s, mode: a.mode };
    case 'stake': {
      if (s.builder || a.amount < CONFIG.stakeMin || a.amount > s.balance) return s;
      const feed: FeedItem[] = [
        {
          id: nextId(),
          icon: '🏗️',
          text: 'You are now a Blockville Builder',
          detail: `Staked ${a.amount.toLocaleString()} $BLOCKVILLE`,
        },
        ...s.feed,
      ].slice(0, 8);
      return {
        ...s,
        builder: true,
        staked: a.amount,
        balance: s.balance - a.amount,
        blocks: s.blocks + CONFIG.starterBlocks,
        feed,
        toasts: [
          ...s.toasts,
          { id: nextId(), text: `🏗️ Builder unlocked — +${CONFIG.starterBlocks} starter blocks` },
        ],
        customiseOpen: true,   // first visit: pick your resident's look
      };
    }
    case 'stakeMore': {
      if (!s.builder || a.amount <= 0 || a.amount > s.balance) return s;
      const before = plotAllowance(s.staked);
      const staked = s.staked + a.amount;
      const after = plotAllowance(staked);
      return {
        ...s,
        balance: s.balance - a.amount,
        staked,
        feed: [
          {
            id: nextId(),
            icon: '🔒',
            text: `Staked ${a.amount.toLocaleString()} $BLOCKVILLE`,
            detail: after > before
              ? `You can now claim ${after} block${after === 1 ? '' : 's'} of land`
              : `Total staked: ${staked.toLocaleString()}`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: after > before
          ? [...s.toasts, { id: nextId(), text: `🗺️ Block of land unlocked — ${after}/${CONFIG.maxPlots}` }]
          : s.toasts,
      };
    }
    case 'claim': {
      const def = BUILDING_DEFS[a.type];
      if (s.blocks < def.cost) return s;
      const target = s.plots.find((p) => p.id === a.plot)!;
      if (target.owner) return s;                          // plot already taken
      const claimed = s.plots.filter((p) => p.owner === 'you').length;
      if (claimed >= plotAllowance(s.staked)) return s;   // need more stake to claim
      return {
        ...s,
        blocks: s.blocks - def.cost,
        selectedPlot: null,
        plots: s.plots.map((p) =>
          p.id === a.plot ? { ...p, type: a.type, progress: 0, done: false, owner: 'you' as const } : p,
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
      const plots = s.plots.map((p) => {
        if (p.id !== a.plot || !p.type || p.done || s.blocks <= 0) return p;
        const def = BUILDING_DEFS[p.type];
        const progress = p.progress + 1;
        const done = progress >= def.cost;
        return { ...p, progress, done };
      });
      if (plots.every((p, i) => p === s.plots[i])) return s; // nothing consumed
      const finished = plots.find((p, i) => p.done && !s.plots[i].done);
      const completed = finished?.type ?? null;
      const base: State = { ...s, blocks: s.blocks - 1, plots };
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
    case 'setNearPlot':
      if (s.nearPlot === a.plot) return s;
      return { ...s, nearPlot: a.plot };
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
        plots: s.plots.map((p) => (p.id === l.plot ? { ...p, owner: 'you' as const } : p)),
        feed: [
          { id: nextId(), icon: '🗺️', text: `You bought plot ${l.plot + 1}`, detail: `For ${l.price.toLocaleString()} $BLOCKVILLE${what}` },
          ...s.feed,
        ].slice(0, 8),
        toasts: [...s.toasts, { id: nextId(), text: `🗺️ Plot ${l.plot + 1} is yours!` }],
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
            ? { ...p, type: a.type, progress: def.cost, done: true, owner: 'other' as const }
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
          ? s.plots.map((p) => (p.id === l.plot ? { ...p, owner: 'other' as const } : p))
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
      if (item.kind === 'blocks') {
        return {
          ...base,
          blocks: s.blocks + (item.blocks ?? 0),
          toasts: [...s.toasts, { id: nextId(), text: `🛒 ${item.name} — +${item.blocks} blocks` }],
          feed: [
            { id: nextId(), icon: item.icon, text: `${item.name} purchased`, detail: `+${item.blocks} blocks for ${item.price.toLocaleString()} $BLOCKVILLE` },
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
    case 'setLook':
      return { ...s, look: a.look };
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
    case 'toastGone':
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
  }
}

// ── Engine bridge ──────────────────────────────────────────────────────────
export interface EngineApi {
  sync: (plots: Plot[], npcTarget: number) => void;
  setLook: (look: PlayerLook) => void;
  setInputEnabled: (v: boolean) => void;
  playerPos: () => { x: number; z: number };
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

  // Marketplace heartbeat: residents slowly claim free Wave-1 land, list
  // their own plots for sale, and buy listings — occasionally yours.
  useEffect(() => {
    const RESIDENTS = ['Nova', 'Rex', 'Momo', 'Vega', 'Juno', 'Pixel'];
    const TYPES = Object.keys(BUILDING_DEFS) as BuildingType[];
    const m = CONFIG.market;
    const iv = setInterval(() => {
      const s = stateRef.current;
      if (Math.random() < m.simClaimChance) {
        const free = s.plots.filter((p) => !p.owner);
        if (free.length) {
          const pick = free[Math.floor(Math.random() * free.length)];
          const type = TYPES[Math.floor(Math.random() * TYPES.length)];
          dispatch({ t: 'simClaim', plot: pick.id, type });
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
      requestReward: (building: BuildingType, level: number) => {
        if (Math.random() < CONFIG.feeChance) {
          // upgrades multiply the fee yield of the building that earned them
          const base = CONFIG.feeMin + Math.random() * (CONFIG.feeMax - CONFIG.feeMin);
          const amt = base * CONFIG.upgrades.yieldMult[Math.max(0, Math.min(CONFIG.upgrades.maxLevel, level) - 1)];
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
  rewardBridge: () => { requestReward: (b: BuildingType, level: number) => void };
} | null>(null);

export function useEngineBridge() {
  const v = useContext(engineBridgeContext);
  if (!v) throw new Error('engine bridge outside provider');
  return v;
}

export function useToastTimer() {
  const { state, dispatch } = useGame();
  useEffect(() => {
    if (state.toasts.length === 0) return;
    const id = setTimeout(() => dispatch({ t: 'toastGone', id: state.toasts[0].id }), 3200);
    return () => clearTimeout(id);
  }, [state.toasts, dispatch]);
}
