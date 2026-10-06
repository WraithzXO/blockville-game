import { useState } from 'react';
import {
  BUILDING_DEFS,
  CONFIG,
  TINTS,
  stageFor,
  rewardMultFor,
  sizeLabelFor,
  sizeScaleFor,
  type BuildingType,
} from './game/config';
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

// ── store panel (opened by walking to the store and pressing E) ────────────
function StorePanel() {
  const { state, dispatch } = useGame();
  if (!state.storeOpen) return null;
  return (
    <div className="modal-backdrop" onClick={() => dispatch({ t: 'closeStore' })}>
      <div className="modal store-modal" onClick={(e) => e.stopPropagation()}>
        <div className="store-sign">🏪 BLOCKVILLE STORE</div>
        <p className="store-copy">
          The heart of Blockville. Stake here to become a Builder, restock on blueprints knowledge and
          watch the town grow around you.
        </p>
        <div className="store-stats">
          <div>💰 Wallet <b>{state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></div>
          <div>🔒 Staked <b>{state.staked.toLocaleString()}</b></div>
          <div>🧱 Blocks <b>{state.blocks}</b></div>
          <div>📊 Status <b>{state.builder ? 'BUILDER' : 'VISITOR'}</b></div>
        </div>
        <div className="bp-title">AVAILABLE BLUEPRINTS</div>
        <div className="bp-list">
          {(Object.keys(BUILDING_DEFS) as BuildingType[]).map((t) => {
            const d = BUILDING_DEFS[t];
            return (
              <div className="bp-item" key={t}>
                <span className="bp-icon">{d.icon}</span>
                <span className="bp-info">
                  <b>{d.name}</b>
                  <small>{d.blurb}</small>
                </span>
                <span className="bp-cost">🧱 {d.cost}+</span>
              </div>
            );
          })}
        </div>
        <p className="store-copy" style={{ marginTop: 10 }}>
          Tip: use a <b>preset blueprint</b> or go <b>custom</b> — every extra block you invest makes the
          building bigger and raises your share of the town's fee rewards.
        </p>
        <button className="cta" onClick={() => dispatch({ t: 'closeStore' })}>
          Back to town
        </button>
      </div>
    </div>
  );
}

// ── claim menu (when a plot is selected) ───────────────────────────────────
function ClaimMenu() {
  const { state, dispatch } = useGame();
  const [type, setType] = useState<BuildingType | null>(null);
  const [custom, setCustom] = useState(false);
  const [amount, setAmount] = useState(0);
  const [tint, setTint] = useState(0);

  if (state.selectedPlot === null) return null;
  const plot = state.plots.find((p) => p.id === state.selectedPlot)!;
  if (plot.type) return null;

  const choose = (t: BuildingType) => {
    setType(t);
    setCustom(false);
    setAmount(BUILDING_DEFS[t].cost);
    setTint(0);
  };
  const back = () => setType(null);

  // step 1: pick a building type
  if (!type) {
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
                onClick={() => choose(t)}
              >
                <div className="claim-icon">{d.icon}</div>
                <div className="claim-name">{d.name}</div>
                <div className="claim-blurb">{d.blurb}</div>
                <div className="claim-cost">🧱 from {d.cost} blocks</div>
              </button>
            );
          })}
        </div>
        {!state.builder && <div className="claim-note">Stake at the Blockville Store first to claim plots.</div>}
      </div>
    );
  }

  // step 2: preset or custom
  const def = BUILDING_DEFS[type];
  const customMax = Math.max(def.cost, state.blocks);
  const invested = custom ? Math.min(Math.max(amount, def.cost), customMax) : def.cost;
  const mult = rewardMultFor(invested, def.cost);
  const size = sizeLabelFor(invested, def.cost);
  const taps = Math.ceil(invested / CONFIG.blocksPerClick);

  return (
    <div className="claim-menu">
      <div className="claim-head">
        <span>{def.icon} {def.name} — Plot {plot.id + 1}</span>
        <button className="x" onClick={() => dispatch({ t: 'selectPlot', plot: null })}>✕</button>
      </div>
      <div className="tabs">
        <button className={`tab ${!custom ? 'active' : ''}`} onClick={() => setCustom(false)}>
          Preset blueprint
        </button>
        <button className={`tab ${custom ? 'active' : ''}`} onClick={() => setCustom(true)}>
          Build it your way
        </button>
      </div>
      {custom ? (
        <>
          <div className="stake-row">
            <input
              type="number"
              value={invested}
              min={def.cost}
              max={customMax}
              onChange={(e) => setAmount(Math.max(def.cost, Math.min(customMax, Math.floor(Number(e.target.value) || def.cost))))}
            />
            <span className="token">🧱</span>
          </div>
          <input
            className="slider"
            type="range"
            min={def.cost}
            max={customMax}
            step={5}
            value={invested}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="tint-row">
            {TINTS.map((t, i) => (
              <button
                key={t.name}
                title={t.name}
                className={`swatch ${tint === i ? 'on' : ''}`}
                style={{ background: t.hex ? `#${t.hex.toString(16).padStart(6, '0')}` : 'linear-gradient(135deg,#f2e3c8,#b4552e)' }}
                onClick={() => setTint(i)}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="store-copy">
          The classic {def.name.toLowerCase()} blueprint. Standard footprint, standard fee share —
          the fastest way to get the town buzzing.
        </p>
      )}
      <div className="build-summary">
        <span>🧱 {invested} blocks · ~{taps} taps to build</span>
        <span>📐 {size}</span>
        <span className="mult">💰 {mult.toFixed(1)}x fee share</span>
      </div>
      <div className="hint-row">
        <span>Blocks in stock: {state.blocks}</span>
        <span>More blocks → bigger building & higher rewards</span>
      </div>
      <button
        className="cta"
        disabled={state.blocks < def.cost}
        onClick={() => {
          dispatch({ t: 'claim', plot: plot.id, type, invested, tint: TINTS[tint].hex });
          setType(null);
        }}
      >
        {state.blocks < def.cost ? 'Not enough blocks' : `Claim plot & commit ${invested} blocks`}
      </button>
      <button className="link-btn" onClick={back}>← choose another building</button>
    </div>
  );
}

// ── build hint + progress ──────────────────────────────────────────────────
function BuildHud() {
  const { state } = useGame();
  const building = state.plots.find((p) => p.type && !p.done);
  if (!building || !building.type) return null;
  const def = BUILDING_DEFS[building.type];
  const pct = Math.round((building.progress / building.invested) * 100);
  return (
    <div className="build-hud">
      <div className="build-title">
        {def.icon} Building {def.name} — walk to the site and press <b>E</b> to place blocks
      </div>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="build-sub">
        🧱 {building.progress}/{building.invested} placed · {state.blocks} in stock
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
      <StorePanel />
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
