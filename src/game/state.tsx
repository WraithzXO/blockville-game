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
  CONFIG,
  PLOT_POSITIONS,
  DEFAULT_LOOK,
  HATS,
  STORE_ITEMS,
  blocksForStake,
  feeMultFor,
  upgradeCost,
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
  staked: number;
  blocks: number;
  builder: boolean;
  plots: Plot[];
  feed: FeedItem[];
  toasts: Toast[];
  selectedPlot: number | null;
  look: PlayerLook;
  unlockedHats: string[];      // hat ids purchased from the Store
  storeOpen: boolean;
  customiseOpen: boolean;
  selectedBuilding: number | null;   // plot id of a finished building being inspected
}

type Action =
  | { t: 'setMode'; mode: 'demo' | 'wallet' }
  | { t: 'stake'; amount: number }
  | { t: 'stakeMore'; amount: number }
  | { t: 'claim'; plot: number; type: BuildingType }
  | { t: 'buildClick'; plot: number }
  | { t: 'upgrade'; plot: number }
  | { t: 'openBuilding'; plot: number | null }
  | { t: 'selectPlot'; plot: number | null }
  | { t: 'buyItem'; item: string }
  | { t: 'setLook'; look: PlayerLook }
  | { t: 'setStoreOpen'; open: boolean }
  | { t: 'setCustomiseOpen'; open: boolean }
  | { t: 'npcReward'; building: BuildingType; amount: number }
  | { t: 'feed'; icon: string; text: string; detail: string }
  | { t: 'toast'; text: string }
  | { t: 'toastGone'; id: number };

let uid = 1;
const nextId = () => uid++;

const emptyPlots = (): Plot[] =>
  PLOT_POSITIONS.map((p) => ({ id: p.id, type: null, progress: 0, done: false, level: 1 }));

const initial: State = {
  mode: null,
  onboarded: false,
  balance: 60_000, // demo faucet balance — enough to feel out stake scaling and multiple plots
  staked: 0,
  blocks: 0,
  builder: false,
  plots: emptyPlots(),
  feed: [],
  toasts: [],
  selectedPlot: null,
  look: { ...DEFAULT_LOOK },
  unlockedHats: [],
  storeOpen: false,
  customiseOpen: false,
  selectedBuilding: null,
};

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'setMode':
      return { ...s, mode: a.mode };
    case 'stake': {
      if (s.builder || a.amount < CONFIG.stakeMin || a.amount > s.balance) return s;
      const granted = blocksForStake(a.amount);
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
        blocks: s.blocks + granted,
        feed,
        toasts: [
          ...s.toasts,
          { id: nextId(), text: `🏗️ Builder unlocked — +${granted} blocks` },
        ],
        customiseOpen: true,   // first visit: pick your resident's look
      };
    }
    case 'stakeMore': {
      if (!s.builder || a.amount <= 0 || a.amount > s.balance) return s;
      const before = plotAllowance(s.staked);
      const staked = s.staked + a.amount;
      const after = plotAllowance(staked);
      const gained = blocksForStake(staked) - blocksForStake(s.staked);
      return {
        ...s,
        balance: s.balance - a.amount,
        staked,
        blocks: s.blocks + gained,
        feed: [
          {
            id: nextId(),
            icon: '🔒',
            text: `Staked ${a.amount.toLocaleString()} $BLOCKVILLE`,
            detail: [
              after > before ? `You can now claim ${after} block${after === 1 ? '' : 's'} of land` : null,
              gained > 0 ? `+${gained} blocks from your larger stake` : null,
            ].filter(Boolean).join(' · ') || `Total staked: ${staked.toLocaleString()}`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: [
          ...s.toasts,
          ...(after > before ? [{ id: nextId(), text: `🗺️ Block of land unlocked — ${after}/${CONFIG.maxPlots}` }] : []),
          ...(gained > 0 ? [{ id: nextId(), text: `🧱 +${gained} blocks from staking more` }] : []),
        ],
      };
    }
    case 'claim': {
      const def = BUILDING_DEFS[a.type];
      if (s.blocks < def.cost) return s;
      const claimed = s.plots.filter((p) => p.type).length;
      if (claimed >= plotAllowance(s.staked)) return s;   // need more stake to claim
      return {
        ...s,
        blocks: s.blocks - def.cost,
        selectedPlot: null,
        plots: s.plots.map((p) =>
          p.id === a.plot ? { ...p, type: a.type, progress: 0, done: false } : p,
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
        // blocks were paid in full when the plot was claimed; clicking places them
        if (p.id !== a.plot || !p.type || p.done) return p;
        const def = BUILDING_DEFS[p.type];
        const progress = p.progress + 1;
        const done = progress >= def.cost;
        return { ...p, progress, done };
      });
      if (plots.every((p, i) => p === s.plots[i])) return s; // nothing consumed
      const finished = plots.find((p, i) => p.done && !s.plots[i].done);
      const completed = finished?.type ?? null;
      const base: State = { ...s, plots };
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
      return { ...s, selectedPlot: a.plot };
    case 'upgrade': {
      const p = s.plots.find((q) => q.id === a.plot);
      if (!p || !p.type || !p.done || p.level >= CONFIG.maxLevel) return s;
      const cost = upgradeCost(p.type, p.level);
      if (s.blocks < cost) return s;
      const def = BUILDING_DEFS[p.type];
      return {
        ...s,
        blocks: s.blocks - cost,
        selectedBuilding: null,
        plots: s.plots.map((q) => (q.id === a.plot ? { ...q, level: q.level + 1 } : q)),
        feed: [
          {
            id: nextId(),
            icon: '⬆️',
            text: `${def.name} upgraded to level ${p.level + 1}`,
            detail: `${cost} blocks spent — fee share is now ×${feeMultFor(p.level + 1).toFixed(1)}`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: [...s.toasts, { id: nextId(), text: `⬆️ ${def.name} → Level ${p.level + 1} (fees ×${feeMultFor(p.level + 1).toFixed(1)})` }],
      };
    }
    case 'openBuilding':
      return { ...s, selectedBuilding: a.plot };
    case 'buyItem': {
      const item = STORE_ITEMS.find((i) => i.id === a.item);
      if (!item || s.balance < item.price) return s;
      const base: State = { ...s, balance: s.balance - item.price };
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
    case 'npcReward': {
      const def = BUILDING_DEFS[a.building];
      return {
        ...s,
        balance: s.balance + a.amount,
        feed: [
          {
            id: nextId(),
            icon: '💰',
            text: `${def.name} activity completed`,
            detail: `You received +${a.amount.toFixed(2)} $BLOCKVILLE in fees`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: [...s.toasts, { id: nextId(), text: `💰 +${a.amount.toFixed(2)} $BLOCKVILLE` }],
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

  // The engine lives in App via a ref set by GameCanvas; feed reward events through here.
  const api = useMemo(
    () => ({
      requestReward: (building: BuildingType, level: number) => {
        if (Math.random() < CONFIG.feeChance) {
          const amt = CONFIG.feeMin + Math.random() * (CONFIG.feeMax - CONFIG.feeMin);
          dispatch({ t: 'npcReward', building, amount: Math.round(amt * feeMultFor(level) * 100) / 100 });
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
