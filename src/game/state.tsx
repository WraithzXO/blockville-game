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
  rewardMultFor,
  type BuildingType,
} from './config';

export interface Plot {
  id: number;
  type: BuildingType | null;
  progress: number;   // blocks placed so far
  done: boolean;
  level: number;      // foundation for future upgrades
  invested: number;   // total blocks committed (preset cost or custom amount)
  tint: number;       // 0 = signature colour, else custom body colour
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
  storeOpen: boolean;
}

type Action =
  | { t: 'setMode'; mode: 'demo' | 'wallet' }
  | { t: 'stake'; amount: number }
  | { t: 'claim'; plot: number; type: BuildingType; invested: number; tint: number }
  | { t: 'buildClick'; plot: number }
  | { t: 'selectPlot'; plot: number | null }
  | { t: 'npcReward'; building: BuildingType; amount: number }
  | { t: 'feed'; icon: string; text: string; detail: string }
  | { t: 'toast'; text: string }
  | { t: 'toastGone'; id: number }
  | { t: 'openStore' }
  | { t: 'closeStore' };

let uid = 1;
const nextId = () => uid++;

const emptyPlots = (): Plot[] =>
  PLOT_POSITIONS.map((p) => ({ id: p.id, type: null, progress: 0, done: false, level: 1, invested: 0, tint: 0 }));

const initial: State = {
  mode: null,
  onboarded: false,
  balance: 25000, // demo wallet balance so the 20K stake is testable
  staked: 0,
  blocks: 0,
  builder: false,
  plots: emptyPlots(),
  feed: [],
  toasts: [],
  selectedPlot: null,
  storeOpen: false,
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
      };
    }
    case 'claim': {
      const def = BUILDING_DEFS[a.type];
      const invested = Math.max(def.cost, Math.min(a.invested, s.blocks));
      if (s.blocks < invested || invested < def.cost) return s;
      return {
        ...s,
        blocks: s.blocks - invested,
        selectedPlot: null,
        plots: s.plots.map((p) =>
          p.id === a.plot
            ? { ...p, type: a.type, progress: 0, done: false, invested, tint: a.tint }
            : p,
        ),
        feed: [
          {
            id: nextId(),
            icon: def.icon,
            text: `${def.name} claimed on plot ${a.plot + 1}`,
            detail: `Site cleared — ${invested} blocks committed (${a.tint ? 'custom design' : 'preset'})`,
          },
          ...s.feed,
        ].slice(0, 8),
      };
    }
    case 'buildClick': {
      const plots = s.plots.map((p) => {
        if (p.id !== a.plot || !p.type || p.done || s.blocks <= 0) return p;
        const place = Math.min(CONFIG.blocksPerClick, s.blocks, p.invested - p.progress);
        if (place <= 0) return p;
        const progress = p.progress + place;
        const done = progress >= p.invested;
        return { ...p, progress, done };
      });
      if (plots.every((p, i) => p === s.plots[i])) return s; // nothing consumed
      const finished = plots.find((p, i) => p.done && !s.plots[i].done);
      const completed = finished?.type ?? null;
      // blocks were already committed at claim time — placing them costs nothing extra
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
    case 'openStore':
      return { ...s, storeOpen: true };
    case 'closeStore':
      return { ...s, storeOpen: false };
    case 'npcReward': {
      const def = BUILDING_DEFS[a.building];
      const plot = s.plots.find((p) => p.type === a.building && p.done);
      // Bigger investment = bigger share of the fee pool (capped in config)
      const mult = plot ? rewardMultFor(plot.invested, def.cost) : 1;
      return {
        ...s,
        balance: s.balance + a.amount * mult,
        feed: [
          {
            id: nextId(),
            icon: '💰',
            text: `${def.name} activity completed`,
            detail: `You received +${(a.amount * mult).toFixed(2)} $BLOCKVILLE in fees${mult > 1.01 ? ` (${mult.toFixed(1)}x share)` : ''}`,
          },
          ...s.feed,
        ].slice(0, 8),
        toasts: [...s.toasts, { id: nextId(), text: `💰 +${(a.amount * mult).toFixed(2)} $BLOCKVILLE` }],
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
      requestReward: (building: BuildingType) => {
        if (Math.random() < CONFIG.feeChance) {
          const amt = CONFIG.feeMin + Math.random() * (CONFIG.feeMax - CONFIG.feeMin);
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
  rewardBridge: () => { requestReward: (b: BuildingType) => void };
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
