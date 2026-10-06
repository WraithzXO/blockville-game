import { useState } from 'react';
import { BUILDING_DEFS, CONFIG, stageFor, type BuildingType } from './game/config';
import { GameProvider, useGame, useToastTimer } from './game/state';
import GameCanvas from './game/GameCanvas';

// ── staking modal ──────────────────────────────────────────────────────────
function StakeModal() {
  const { state, dispatch } = useGame();
  const [amount, setAmount] = useState<number>(CONFIG.stakeMin);
  const canStake = amount >= CONFIG.stakeMin && amount <= state.balance && !state.builder;

  return (
    <div className="modal-backdrop">
      <div className="modal store-modal">
        <div className="store-sign">🏪 BLOCKVILLE STORE</div>
        <p className="store-copy">
          Welcome to Blockville. Stake <b>{CONFIG.stakeMin.toLocaleString()} $BLOCKVILLE</b> to become a{' '}
          <b>Builder</b>, receive starter blocks, claim a plot and put up buildings the town will use.
        </p>
        <div className="tabs">
          <button className={`tab ${state.mode !== 'wallet' ? 'active' : ''}`} onClick={() => dispatch({ t: 'setMode', mode: 'demo' })}>
            Demo mode
          </button>
          <button className={`tab ${state.mode === 'wallet' ? 'active' : ''}`} onClick={() => dispatch({ t: 'setMode', mode: 'wallet' })}>
            Connect wallet
          </button>
        </div>
        {state.mode === 'wallet' ? (
          <div className="wallet-note">
            <span>🔌</span> Real wallet staking is not connected yet. This tab is a placeholder — no transaction
            will be faked. Use <b>Demo mode</b> to play the build loop today.
          </div>
        ) : (
          <>
            <div className="stake-row">
              <input
                type="number"
                value={amount}
                min={0}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
              <span className="token">$BLOCKVILLE</span>
            </div>
            <div className="hint-row">
              <span>Minimum: {CONFIG.stakeMin.toLocaleString()}</span>
              <span>Demo balance: {state.balance.toLocaleString()}</span>
            </div>
            <input
              className="slider"
              type="range"
              min={CONFIG.stakeMin}
              max={state.balance}
              step={1000}
              value={Math.min(amount, state.balance)}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <button className="cta" disabled={!canStake} onClick={() => dispatch({ t: 'stake', amount })}>
              {state.builder ? 'You are a Builder ✓' : `Stake ${amount.toLocaleString()} → become a Builder`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── claim menu (when a plot is selected) ───────────────────────────────────
function ClaimMenu() {
  const { state, dispatch } = useGame();
  if (state.selectedPlot === null) return null;
  const plot = state.plots.find((p) => p.id === state.selectedPlot)!;
  if (plot.type) return null;
  return (
    <div className="claim-menu">
      <div className="claim-head">
        <span>Plot {plot.id + 1} — choose a building</span>
        <button className="x" onClick={() => dispatch({ t: 'selectPlot', plot: null })}>✕</button>
      </div>
      <div className="claim-cards">
        {(Object.keys(BUILDING_DEFS) as BuildingType[]).map((t) => {
          const d = BUILDING_DEFS[t];
          const afford = state.blocks >= d.cost;
          return (
            <button
              key={t}
              className={`claim-card ${afford ? '' : 'locked'}`}
              disabled={!afford}
              onClick={() => dispatch({ t: 'claim', plot: plot.id, type: t })}
            >
              <div className="claim-icon">{d.icon}</div>
              <div className="claim-name">{d.name}</div>
              <div className="claim-blurb">{d.blurb}</div>
              <div className="claim-cost">🧱 {d.cost} blocks · {d.cost} clicks</div>
            </button>
          );
        })}
      </div>
      {!state.builder && <div className="claim-note">Stake at the Blockville Store first to claim plots.</div>}
    </div>
  );
}

// ── build hint + progress ──────────────────────────────────────────────────
function BuildHud() {
  const { state, dispatch } = useGame();
  const building = state.plots.find((p) => p.type && !p.done);
  if (!building || !building.type) return null;
  const def = BUILDING_DEFS[building.type];
  const pct = Math.round((building.progress / def.cost) * 100);
  return (
    <div className="build-hud" onClick={() => dispatch({ t: 'buildClick', plot: building.id })}>
      <div className="build-title">
        {def.icon} Building {def.name} — click the site (or here) to place blocks
      </div>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="build-sub">
        🧱 {building.progress}/{def.cost} placed · {state.blocks} in stock
      </div>
    </div>
  );
}

// ── top bar ────────────────────────────────────────────────────────────────
function TopBar() {
  const { state } = useGame();
  const built = state.plots.filter((p) => p.done).length;
  return (
    <>
      <div className="topbar">
        <div className="logo">
          BLOCKVILLE
          <span className="stage">{stageFor(built)}</span>
        </div>
        <div className="stats">
          <div className="stat" title="Demo wallet balance">
            💰 {state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="stat" title="Staked $BLOCKVILLE">
            🔒 {state.staked.toLocaleString()} staked
          </div>
          <div className="stat" title="Building blocks in stock">
            🧱 {state.blocks}
          </div>
          <div className={`badge ${state.builder ? 'on' : ''}`}>{state.builder ? 'BUILDER' : 'VISITOR'}</div>
        </div>
      </div>
      <div className="demo-tag">DEMO MODE — no real wallet or on-chain rewards</div>
    </>
  );
}

// ── activity feed ──────────────────────────────────────────────────────────
function Feed() {
  const { state } = useGame();
  return (
    <div className="feed">
      <div className="feed-title">TOWN ACTIVITY</div>
      {state.feed.length === 0 && <div className="feed-empty">Quiet for now… build something!</div>}
      {state.feed.map((f) => (
        <div className="feed-item" key={f.id}>
          <span className="feed-icon">{f.icon}</span>
          <span>
            <b>{f.text}</b>
            <small>{f.detail}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function Toasts() {
  useToastTimer();
  const { state } = useGame();
  return (
    <div className="toasts">
      {state.toasts.map((t) => (
        <div className="toast" key={t.id}>{t.text}</div>
      ))}
    </div>
  );
}

function Shell() {
  const { state } = useGame();
  return (
    <div className="app">
      <GameCanvas />
      {state.mode !== 'wallet' && <TopBar />}
      {(!state.builder || state.mode === 'wallet') && <StakeModal />}
      <ClaimMenu />
      <BuildHud />
      {state.builder && <Feed />}
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <Shell />
    </GameProvider>
  );
}
