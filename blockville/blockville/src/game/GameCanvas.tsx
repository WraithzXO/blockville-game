import { useEffect, useRef } from 'react';
import { Engine } from './engine';
import { CONFIG } from './config';
import { useEngineBridge, useGame, type EngineApi, type Plot } from './state';

export default function GameCanvas({ inputEnabled = true }: { inputEnabled?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useGame();
  const bridge = useEngineBridge();
  const engineRef = useRef<Engine | null>(null);

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
      requestReward: (b, level, plotId) => bridge.rewardBridge().requestReward(b, level, plotId),
      // the engine only fires these when the value changes
      onNearby: (id) => dispatch({ t: 'setNearPlot', plot: id }),
      onTooFar: () => dispatch({ t: 'toast', text: '🚶 Walk up to a plot to interact with it' }),
    }, stateRef.current.look);
    engineRef.current = engine;
    bridge.setEngine(engine as EngineApi);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__bv = {
        screenPos: (x: number, z: number) => engine.screenPos(x, z),
        camDist: (d: number) => engine.setCamDist(d),
        camDistance: () => engine.camDistance(),
        playerPos: () => engine.playerPos(),
        teleport: (x: number, z: number) => engine.teleport(x, z),
        plots: () => Array.from((engine as unknown as { plotPos: Map<number, { x: number; z: number }> }).plotPos.entries()),
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

  // drop garden visuals whenever a garden is placed
  useEffect(() => {
    for (const id of state.gardens) engineRef.current?.placeGardenVisual(id);
  }, [state.gardens]);

  // pause walking while any modal is open
  useEffect(() => {
    engineRef.current?.setInputEnabled(inputEnabled);
  }, [inputEnabled]);

  return <div className="game-canvas" ref={containerRef} data-testid="game-canvas" />;
}

export type { Plot };
