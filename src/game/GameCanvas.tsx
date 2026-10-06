import { useEffect, useRef } from 'react';
import { Engine } from './engine';
import { CONFIG } from './config';
import { useEngineBridge, useGame, type EngineApi, type Plot } from './state';

export default function GameCanvas() {
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
        if (p && !p.type) dispatch({ t: 'selectPlot', plot: id });
      },
      onBuildClick: (id) => dispatch({ t: 'buildClick', plot: id }),
      requestReward: (b) => bridge.rewardBridge().requestReward(b),
    });
    engineRef.current = engine;
    bridge.setEngine(engine as EngineApi);
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

  return <div className="game-canvas" ref={containerRef} data-testid="game-canvas" />;
}

export type { Plot };
