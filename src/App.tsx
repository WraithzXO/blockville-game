import { useState } from 'react';
import {
  BUILDING_DEFS,
  CONFIG,
  FACE_STYLES,
  HATS,
  SHIRT_COLORS,
  SKIN_TONES,
  STORE_ITEMS,
  plotAllowance,
  stageFor,
  type BuildingType,
  type PlayerLook,
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

// ── claim menu (when a plot is selected) ───────────────────────────────────
function ClaimMenu() {
  const { state, dispatch } = useGame();
  if (state.selectedPlot === null) return null;
  const plot = state.plots.find((p) => p.id === state.selectedPlot)!;
  if (plot.type) return null;
  const claimed = state.plots.filter((p) => p.type).length;
  const locked = claimed >= plotAllowance(state.staked);
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
      {locked && state.builder && (
        <div className="claim-note">
          🔒 Each block of land needs {CONFIG.plotStakeCost.toLocaleString()} $BLOCKVILLE staked
          ({claimed}/{CONFIG.maxPlots} claimed). Use "Stake more" in the top bar to unlock another plot.
        </div>
      )}
      {!state.builder && <div className="claim-note">Stake at the Blockville Store first to claim plots.</div>}
    </div>
  );
}

// ── character customiser (array of options to pick from) ───────────────────
function CustomiseModal() {
  const { state, dispatch } = useGame();
  if (!state.customiseOpen || !state.builder) return null;
  const set = (patch: Partial<PlayerLook>) =>
    dispatch({ t: 'setLook', look: { ...state.look, ...patch } });
  return (
    <div className="modal-backdrop" onClick={() => dispatch({ t: 'setCustomiseOpen', open: false })}>
      <div className="modal customise-modal" onClick={(e) => e.stopPropagation()}>
        <div className="store-sign">🧍 CUSTOMISE YOUR RESIDENT</div>
        <p className="store-copy">
          This is your character standing by the store. Pick a look — change it any time from the top bar.
        </p>
        <div className="cust-row-label">Skin</div>
        <div className="chip-row">
          {SKIN_TONES.map((s) => (
            <button
              key={s}
              className={`chip swatch ${state.look.skin === s ? 'active' : ''}`}
              style={{ background: s }}
              onClick={() => set({ skin: s })}
            />
          ))}
        </div>
        <div className="cust-row-label">Shirt</div>
        <div className="chip-row">
          {SHIRT_COLORS.map((c) => (
            <button
              key={c.hex}
              className={`chip swatch ${state.look.shirt === c.hex ? 'active' : ''}`}
              style={{ background: c.hex }}
              title={c.name}
              onClick={() => set({ shirt: c.hex })}
            />
          ))}
        </div>
        <div className="cust-row-label">Face</div>
        <div className="chip-row">
          {FACE_STYLES.map((f) => (
            <button
              key={f.id}
              className={`chip text ${state.look.face === f.id ? 'active' : ''}`}
              onClick={() => set({ face: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="cust-row-label">Hat</div>
        <div className="chip-row">
          {HATS.map((h) => {
            const owned = h.price === 0 || state.unlockedHats.includes(h.id);
            return (
              <button
                key={h.id}
                className={`chip text ${state.look.hat === h.id ? 'active' : ''} ${owned ? '' : 'locked'}`}
                title={owned ? '' : `Buy in the Blockville Store — ${h.price.toLocaleString()} $BLOCKVILLE`}
                onClick={() => owned && set({ hat: h.id })}
              >
                {owned ? h.label : `🔒 ${h.label}`}
              </button>
            );
          })}
        </div>
        <button className="cta" onClick={() => dispatch({ t: 'setCustomiseOpen', open: false })}>
          Done — my resident is by the store
        </button>
      </div>
    </div>
  );
}

// ── store panel (items are actually purchasable) ───────────────────────────
function StorePanel() {
  const { state, dispatch } = useGame();
  if (!state.storeOpen) return null;
  return (
    <div className="store-panel">
      <div className="claim-head">
        <span>🏪 Blockville Store — spend your $BLOCKVILLE</span>
        <button className="x" onClick={() => dispatch({ t: 'setStoreOpen', open: false })}>✕</button>
      </div>
      <div className="store-items">
        {STORE_ITEMS.map((item) => {
          const afford = state.balance >= item.price;
          const owned = item.kind === 'cosmetic' && state.unlockedHats.includes(item.cosmetic!);
          return (
            <button
              key={item.id}
              className={`claim-card ${afford && !owned ? '' : 'locked'}`}
              disabled={!afford || owned}
              onClick={() => dispatch({ t: 'buyItem', item: item.id })}
            >
              <div className="claim-icon">{item.icon}</div>
              <div className="claim-name">{item.name}</div>
              <div className="claim-blurb">{owned ? 'Owned — equip it in the customiser' : item.blurb}</div>
              <div className="claim-cost">{owned ? '✓ owned' : `💰 ${item.price.toLocaleString()} $BLOCKVILLE`}</div>
            </button>
          );
        })}
      </div>
      <div className="store-balance">
        Balance: {state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} $BLOCKVILLE
      </div>
    </div>
  );
}

// ── stake more modal (unlocks more blocks of land) ─────────────────────────
function StakeMoreModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useGame();
  const [amount, setAmount] = useState<number>(CONFIG.plotStakeCost);
  const can = state.builder && amount > 0 && amount <= state.balance;
  const nextPlot =
    plotAllowance(state.staked + amount) > plotAllowance(state.staked)
      ? plotAllowance(state.staked) + 1
      : null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="store-sign">🔒 STAKE MORE — UNLOCK LAND</div>
        <p className="store-copy">
          Each block of land (plot) requires <b>{CONFIG.plotStakeCost.toLocaleString()} $BLOCKVILLE</b> staked.
          You have <b>{plotAllowance(state.staked)}/{CONFIG.maxPlots}</b> unlocked with{' '}
          {state.staked.toLocaleString()} currently staked.
        </p>
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
          <span>Balance: {state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          <span>{nextPlot ? `Unlocks plot #${nextPlot}` : 'Not enough for another plot yet'}</span>
        </div>
        <button
          className="cta"
          disabled={!can}
          onClick={() => {
            dispatch({ t: 'stakeMore', amount });
            onClose();
          }}
        >
          Stake {amount.toLocaleString()} more
        </button>
      </div>
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
  const { state, dispatch } = useGame();
  const built = state.plots.filter((p) => p.done).length;
  const claimed = state.plots.filter((p) => p.type).length;
  const [stakeMoreOpen, setStakeMoreOpen] = useState(false);
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
          <div className="stat" title="Blocks of land: claimed / unlocked by your stake">
            🗺️ {claimed}/{plotAllowance(state.staked)}
          </div>
          <button className="stat clickable" onClick={() => dispatch({ t: 'setStoreOpen', open: true })} title="Open the Blockville Store">
            🛒 Store
          </button>
          <button className="stat clickable" onClick={() => dispatch({ t: 'setCustomiseOpen', open: true })} title="Customise your resident">
            🧍 Character
          </button>
          <button className="stat clickable" onClick={() => setStakeMoreOpen(true)} title="Stake more to unlock another block of land">
            🔒 Stake more
          </button>
          <div className={`badge ${state.builder ? 'on' : ''}`}>{state.builder ? 'BUILDER' : 'VISITOR'}</div>
        </div>
      </div>
      <div className="demo-tag">DEMO MODE — no real wallet or on-chain rewards</div>
      {stakeMoreOpen && <StakeMoreModal onClose={() => setStakeMoreOpen(false)} />}
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
      <CustomiseModal />
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
