import { useEffect, useRef, useState } from 'react';
import { Engine, type NearInfo } from './engine';
import { CONFIG } from './config';
import { useEngineBridge, useGame, type EngineApi, type Plot } from './state';

export default function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useGame();
  const bridge = useEngineBridge();
  const engineRef = useRef<Engine | null>(null);
  const [nearTick, setNearTick] = useState(0);
  const nearRef = useRef<NearInfo | null>(null);

  // latest-state refs for engine callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new Engine(containerRef.current, {
      onPlotClick: (id) => {
        const p = stateRef.current.plots.find((q) => q.id === id);
        if (p && !p.type) dispatch({ t: 'selectPlot', plot: id });
      },
      onBuildClick: (id) => dispatch({ t: 'buildClick', plot: id }),
      onStoreClick: () => dispatch({ t: 'setStoreOpen', open: true }),
      onBuildingClick: (id) => dispatch({ t: 'openBuilding', plot: id }),
      onNear: (info) => {
        nearRef.current = info;
        setNearTick((n) => n + 1);
      },
      onHint: (text) => dispatch({ t: 'toast', text }),
      requestReward: (b, level) => bridge.rewardBridge().requestReward(b, level),
    }, stateRef.current.look);
    engineRef.current = engine;
    bridge.setEngine(engine as EngineApi);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__bv = {
        screenPos: (x: number, z: number) => engine.screenPos(x, z),
        camDist: (d: number) => engine.setCamDist(d),
        playerPos: () => engine.playerPos(),
      };
    }
    return () => {
      engine.dispose();
      bridge.setEngine(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // keyboard input is off while any modal owns the screen
  useEffect(() => {
    const blocked = !state.builder || state.mode === 'wallet' || state.storeOpen ||
      state.customiseOpen || state.selectedPlot !== null || state.selectedBuilding !== null;
    engineRef.current?.setInputEnabled(!blocked);
  }, [state.builder, state.mode, state.storeOpen, state.customiseOpen, state.selectedPlot, state.selectedBuilding]);

  const near = nearRef.current;
  const modalOpen = state.storeOpen || state.customiseOpen ||
    state.selectedPlot !== null || state.selectedBuilding !== null;

  return (
    <>
      <div className="game-canvas" ref={containerRef} data-testid="game-canvas" />
      {state.builder && (
        <div className="controls-hint">🚶 WASD / arrows to walk · E to interact · drag to orbit</div>
      )}
      {near && !modalOpen && (
        <div className="near-prompt" data-testid="near-prompt">{near.label}</div>
      )}
      {/* nearTick keeps the prompt in sync with proximity changes */}
      <span hidden>{nearTick}</span>
    </>
  );
}

export type { Plot };
