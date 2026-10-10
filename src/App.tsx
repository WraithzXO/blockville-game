import { DECOR_LABEL, type PlotFeatureKind } from './plots/PlotLayout';
import { useEffect, useRef, useState } from 'react';
import {
  BUILDING_DEFS,
  CONFIG,
  FURNITURE_DEFS,
  GLASSES,
  FACE_STYLES,
  HATS,
  RESIDENT_BUILDERS,
  SHIRT_COLORS,
  SHIRT_DESIGNS,
  SKIN_TONES,
  STORE_ITEMS,
  TOTAL_PLOTS,
  plotAllowance,
  stakingRewardFor,
  stageFor,
  type BuildingType,
  type PlayerLook,
} from './game/config';
import { GameProvider, useGame, usePersonalUnread, type Plot } from './game/state';
import { sfx } from './game/audio';
import GameCanvas from './game/GameCanvas';
import CharacterPreview from './game/CharacterPreview';

// ── shared modal shell ─────────────────────────────────────────────────────
function Modal({
  icon,
  title,
  onClose,
  wide,
  children,
}: {
  icon: string;
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="modal-icon">{icon}</span>
            <h2>{title}</h2>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ── wallet connect (Phantom / Solana, honest read-only link) ────────────────
function WalletPanel() {
  const [provider, setProvider] = useState<any>(null);
  const [addr, setAddr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    const w = window as any;
    const p = w.phantom?.solana ?? w.solana;
    setProvider(p?.isPhantom ? p : null);
    fetch('/api/health').then((r) => setBackendUp(r.ok)).catch(() => setBackendUp(false));
  }, []);

  const connect = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await provider.connect();
      setAddr(res.publicKey?.toString() ?? String(res.publicKey));
    } catch {
      setErr('Connection request was rejected.');
    } finally {
      setBusy(false);
    }
  };

  if (addr) {
    return (
      <div className="note-box ok">
        <div className="note-title">🔗 {addr.slice(0, 4)}…{addr.slice(-4)}</div>
        <p className="note-text">
          Wallet linked (read-only). On-chain staking arrives with the backend rollout —
          use <b>Demo mode</b> to play the build loop today.
        </p>
        <button className="btn ghost sm" onClick={() => { provider?.disconnect?.(); setAddr(null); }}>
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="note-box warn">
      {provider ? (
        <>
          <p className="note-text">Phantom detected. Linking is read-only — nothing is signed or staked.</p>
          <button className="btn primary sm" disabled={busy} onClick={connect}>
            {busy ? 'Waiting for approval…' : 'Connect Phantom'}
          </button>
          {err && <div className="note-text error">{err}</div>}
        </>
      ) : (
        <p className="note-text">
          No Solana wallet detected in this browser. Install <b>Phantom</b> to link your wallet,
          or use <b>Demo mode</b> to play right now.
        </p>
      )}
      <div className="backend-row">
        Backend services: {backendUp === null ? 'checking…' : backendUp ? '🟢 online' : '🔴 offline (run `npm run server`)'}
      </div>
    </div>
  );
}

// ── staking modal ──────────────────────────────────────────────────────────
function StakeModal() {
  const { state, dispatch } = useGame();
  const [amount, setAmount] = useState<number>(CONFIG.stakeMin);
  const canStake = amount >= CONFIG.stakeMin && amount <= state.balance && !state.builder;
  const estimatedReward = stakingRewardFor(amount);

  // Once you're a Builder the onboarding dock is gone; the reward readout lives
  // in the status bar, so no dedicated Staking Rewards box is shown.
  if (state.builder) {
    return null;
  }
  // you can close it and just wander town — reopen it from the top bar
  if (state.stakeDockClosed) return null;

  return (
    <div className="dock stake-dock panel">
      <div className="panel-head">
        <span>🏪 Blockville Store</span>
        <button className="x" title="Close — reopen from the 🔒 button" onClick={() => dispatch({ t: 'setStakeDockClosed', closed: true })}>✕</button>
      </div>
      <div className="stake-body">
        <p className="dock-note">
          Stake <b>{CONFIG.stakeMin.toLocaleString()} $BLOCKVILLE</b> to become a <b>Builder</b> —
          receive starter blocks, claim a plot, and put up buildings the town will use.
          Feel free to walk around town while you decide.
        </p>
        <div className="stake-summary" aria-live="polite">
          <div><span>Reward rate</span><b>{CONFIG.stakeReward.blocksPerStake} Blocks / {CONFIG.stakeReward.stakeUnit.toLocaleString()} staked</b></div>
          <div><span>Estimated reward</span><b>{estimatedReward.toLocaleString(undefined, { maximumFractionDigits: 4 })} Blocks</b></div>
          <div><span>Currently staked</span><b>{state.staked.toLocaleString()} $BLOCKVILLE</b></div>
          <div><span>Staking Blocks</span><b>Instant on each new stake</b></div>
          <div><span>Fee distribution</span><b>Recurring Treasury share</b></div>
        </div>
        <div className="tabs">
          <button
            className={`tab ${state.mode !== 'wallet' ? 'active' : ''}`}
            onClick={() => dispatch({ t: 'setMode', mode: 'demo' })}
          >
            Demo mode
          </button>
          <button
            className={`tab ${state.mode === 'wallet' ? 'active' : ''}`}
            onClick={() => dispatch({ t: 'setMode', mode: 'wallet' })}
          >
            Connect wallet
          </button>
        </div>
        {state.mode === 'wallet' ? (
          <WalletPanel />
        ) : (
          <>
            <div className="field-row">
              <input
                type="number"
                value={amount}
                min={0}
                onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
              <span className="token">$BLOCKVILLE</span>
            </div>
            <div className="hint-row">
              <span>Minimum {CONFIG.stakeMin.toLocaleString()}</span>
              <span>Demo balance {state.balance.toLocaleString()}</span>
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
            <button className="btn primary" disabled={!canStake} onClick={() => dispatch({ t: 'stake', amount })}>
              Stake {amount.toLocaleString()} → become a Builder
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
  if (plot.owner === 'other') {
    const listing = state.listings.find((l) => l.plot === plot.id && !l.mine);
    const def = plot.type ? BUILDING_DEFS[plot.type] : null;
    return (
      <div className="dock panel">
        <div className="panel-head">
          <span>Plot {plot.id + 1} — resident owned</span>
          <button className="x" onClick={() => dispatch({ t: 'selectPlot', plot: null })}>✕</button>
        </div>
        {def && <p className="dock-note">{def.icon} A resident runs a <b>{def.name}</b> here.</p>}
        {listing ? (
          <>
            <p className="dock-note">
              🏷️ For sale: <b>{listing.price.toLocaleString()} $BLOCKVILLE</b> ({listing.seller})
            </p>
            <button
              className="btn primary"
              disabled={state.balance < listing.price}
              onClick={() => dispatch({ t: 'buyListing', id: listing.id })}
            >
              {state.balance < listing.price ? 'Not enough $BLOCKVILLE' : 'Buy this plot'}
            </button>
          </>
        ) : (
          <p className="dock-note">Not for sale — check the 🏷️ Market in the top bar.</p>
        )}
      </div>
    );
  }
  // your own plot: construction status, or the completed building's upgrade panel
  if (plot.type) {
    const def = BUILDING_DEFS[plot.type];
    if (!plot.done) {
      return (
        <div className="dock panel">
          <div className="panel-head">
            <span>Plot {plot.id + 1} — {def.icon} {def.name} under construction</span>
            <button className="x" onClick={() => dispatch({ t: 'selectPlot', plot: null })}>✕</button>
          </div>
          <p className="dock-note">
            🧱 {plot.progress}/{def.cost} blocks placed — keep clicking the site (stand next to it) to build.
          </p>
        </div>
      );
    }
    const mult = CONFIG.upgrades.yieldMult[plot.level - 1];
    const maxed = plot.level >= CONFIG.upgrades.maxLevel;
    const nextCost = maxed ? 0 : CONFIG.upgrades.solCosts[plot.level - 1];
    const nextMult = maxed ? 0 : CONFIG.upgrades.yieldMult[plot.level];
    const hasGarden = state.gardens.includes(plot.id);
    const canGarden = state.gardenKits > 0 && !hasGarden;
    return (
      <div className="dock panel">
        <div className="panel-head">
          <span>Plot {plot.id + 1} — {def.icon} {def.name}</span>
          <button className="x" onClick={() => dispatch({ t: 'selectPlot', plot: null })}>✕</button>
        </div>
        <div className="upgrade-row">
          <div className="level-pips">
            {Array.from({ length: CONFIG.upgrades.maxLevel }, (_, i) => (
              <span key={i} className={`pip ${i < plot.level ? 'on' : ''}`} />
            ))}
          </div>
          <div className="upgrade-info">
            Level {plot.level} · fee yield <b>×{mult}</b>
            {hasGarden ? ` · 🌷 garden ×${CONFIG.garden.boost}` : ''}
          </div>
        </div>
        {canGarden && (
          <button className="btn primary" onClick={() => dispatch({ t: 'placeGarden', plot: plot.id })}>
            🌷 Place Garden Kit — ×{CONFIG.garden.boost} fee yield on this plot
          </button>
        )}
        {hasGarden && (
          <p className="dock-note">🌷 The garden is thriving here — this plot earns ×{CONFIG.garden.boost} fees.</p>
        )}
        {plot.owner === 'you' && (() => {
          const kinds = (Object.keys(DECOR_LABEL) as PlotFeatureKind[]).filter((k) => k !== 'garden');
          const owned = kinds.filter((k) => (state.townDecorInventory[k] || 0) > 0);
          const placedHere = (state.plotDecor[plot.id] || []).filter((f) => f.kind !== 'garden');
          if (!owned.length && !placedHere.length) return null;
          return (
            <div className="house-furniture-controls">
              <b>Yard features</b>
              <div className="house-inventory">
                {owned.map((k) => (
                  <button key={k} className="house-control-btn" onClick={() => dispatch({ t: 'placeDecor', plot: plot.id, kind: k as Exclude<PlotFeatureKind, 'garden'> })}>
                    Place {DECOR_LABEL[k]} <small>×{state.townDecorInventory[k]}</small>
                  </button>
                ))}
              </div>
              {placedHere.map((f) => (
                <div key={f.id} className="house-piece">
                  <span>{DECOR_LABEL[f.kind]}</span>
                  <button className="house-control-btn tiny danger" onClick={() => dispatch({ t: 'removeDecor', plot: plot.id, id: f.id })}>Remove</button>
                </div>
              ))}
            </div>
          );
        })()}
        {maxed ? (
          <p className="dock-note">🏆 Fully upgraded — ×{mult} fee yield is the max.</p>
        ) : (
          <>
            <button
              className="btn primary"
              disabled={state.sol < nextCost}
              onClick={() => dispatch({ t: 'upgrade', plot: plot.id })}
            >
              ⬆ Upgrade to Level {plot.level + 1} — ◎ {nextCost} SOL
            </button>
            <p className="dock-note subtle">
              Raises fee yield to ×{nextMult}. Upgrade fees route to the Treasury
              (demo SOL — the real wallet arrives with the backend rollout).
            </p>
          </>
        )}
      </div>
    );
  }
  const free = state.plots.filter((p) => !p.owner).length;
  const claimed = state.plots.filter((p) => p.owner === 'you').length;
  const locked = claimed >= plotAllowance(state.staked, state.permit ? CONFIG.items.permitExtraPlots : 0);
  if (free === 0) {
    return (
      <div className="dock panel">
        <div className="panel-head">
          <span>Plot {plot.id + 1}</span>
          <button className="x" onClick={() => dispatch({ t: 'selectPlot', plot: null })}>✕</button>
        </div>
        <p className="dock-note">
          🚧 Wave {CONFIG.wave} sold out — all {TOTAL_PLOTS} plots are owned. The only way in
          is the 🏷️ Market, until the next wave of land is added.
        </p>
      </div>
    );
  }
  return (
    <div className="dock panel">
      <div className="panel-head">
        <span>Plot {plot.id + 1} — choose a building</span>
        <button className="x" onClick={() => dispatch({ t: 'selectPlot', plot: null })}>✕</button>
      </div>
      <div className="building-grid">
        {(Object.keys(BUILDING_DEFS) as BuildingType[]).map((t) => {
          const d = BUILDING_DEFS[t];
          const afford = state.blocks >= d.cost;
          return (
            <button
              key={t}
              className={`card building-card building-${t} ${afford ? '' : 'locked'}`}
              data-building={t}
              disabled={!afford}
              onClick={() => dispatch({ t: 'claim', plot: plot.id, type: t })}
            >
              <div className="building-preview"><span className="building-preview-icon">{d.icon}</span><span className="building-preview-lights" /></div>
              <div className="card-name">{d.name}</div>
              <div className="card-blurb">{d.blurb}</div>
              <div className="card-cost"><span>🧱 {d.cost} blocks</span><span className="card-action">Build →</span></div>
            </button>
          );
        })}
      </div>
      {locked && state.builder && (
        <p className="dock-note">
          🔒 Each block of land needs {CONFIG.plotStakeCost.toLocaleString()} $BLOCKVILLE staked
          ({claimed}/{CONFIG.maxPlots} claimed). Use "Stake more" in the top bar to unlock another
          plot — or buy one on the 🏷️ Market.
        </p>
      )}
      {!state.builder && <p className="dock-note">Stake at the Blockville Store first to claim plots.</p>}
    </div>
  );
}

// ── character customiser ───────────────────────────────────────────────────
function CustomiseModal() {
  const { state, dispatch } = useGame();
  if (!state.customiseOpen || !state.builder) return null;
  const set = (patch: Partial<PlayerLook>) =>
    dispatch({ t: 'setLook', look: { ...state.look, ...patch } });
  return (
    <Modal icon="🧍" title="Customise your resident" onClose={() => dispatch({ t: 'setCustomiseOpen', open: false })}>
      <CharacterPreview look={state.look} />
      <p className="lede">
        This is your resident — walk around town with <b>WASD</b>. Change the look any time from the top bar.
      </p>
      <div className="row-label">Skin tone <span>Choose your resident’s base look</span></div>
      <div className="chips">
        {SKIN_TONES.map((s) => (
          <button
            key={s}
            className={`chip swatch ${state.look.skin === s ? 'active' : ''}`}
            style={{ background: s }}
            onClick={() => set({ skin: s })}
          />
        ))}
      </div>
      <div className="row-label">Shirt colour <span>Pick a signature colour</span></div>
      <div className="chips">
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
      <div className="row-label">Shirt design <span>Free designs and store unlocks</span></div>
      <div className="chips">
        {SHIRT_DESIGNS.map((d) => {
          const owned = d.price === 0 || state.unlockedDesigns.includes(d.id);
          return (
            <button
              key={d.id}
              className={`chip text ${state.look.shirtDesign === d.id ? 'active' : ''} ${owned ? '' : 'locked'}`}
              title={owned ? '' : `Buy in the Blockville Store — ${d.price.toLocaleString()} $BLOCKVILLE`}
              onClick={() => owned && set({ shirtDesign: d.id })}
            >
              {owned ? d.label : `🔒 ${d.label}`}
            </button>
          );
        })}
      </div>
      <div className="row-label">Face <span>Give your resident some personality</span></div>
      <div className="chips">
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
      <div className="row-label">Headwear <span>Unlocked hats stay yours permanently</span></div>
      <div className="chips">
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
      <div className="row-label">Glasses <span>Add a little character</span></div>
      <div className="chips">
        {GLASSES.map((gl) => {
          const owned = gl.price === 0 || state.unlockedGlasses.includes(gl.id);
          return (
            <button
              key={gl.id}
              className={`chip text ${state.look.glasses === gl.id ? 'active' : ''} ${owned ? '' : 'locked'}`}
              title={owned ? '' : `Buy in the Blockville Store — ${gl.price.toLocaleString()} $BLOCKVILLE`}
              onClick={() => owned && set({ glasses: gl.id })}
            >
              {owned ? gl.label : `🔒 ${gl.label}`}
            </button>
          );
        })}
      </div>
      <button className="btn primary" onClick={() => dispatch({ t: 'setCustomiseOpen', open: false })}>
        Done — take my resident for a walk
      </button>
    </Modal>
  );
}

// ── store panel (items purchasable; every sale routes to the Treasury) ─────
function StorePanel() {
  const { state, dispatch } = useGame();
  if (!state.storeOpen) return null;
  return (
    <div className="dock wide panel">
      <div className="panel-head">
        <span>🏪 Blockville Store — spend your $BLOCKVILLE</span>
        <button className="x" onClick={() => dispatch({ t: 'setStoreOpen', open: false })}>✕</button>
      </div>
      <p className="dock-note subtle">
        Every purchase is routed <b>{CONFIG.treasury.storeRoutePct}%</b> to the Blockville Treasury,
        which funds fee distributions back to Builders.
      </p>
      <button className="btn secondary" onClick={() => dispatch({ t: 'setFurnitureStoreOpen', open: true })}>🪑 Visit Furniture Store</button>
      <div className="store-sections">
      {([
        ['useful', 'Builder essentials', 'Tools and permits that change how you play.'],
        ['cosmetic', 'Resident style', 'Cosmetics that make your character unmistakably yours.'],
        ['garden', 'Town details', 'Small touches that make your plot feel lived in.'],
      ] as const).map(([kind, heading, blurb]) => <section className="store-section" key={kind}>
        <div className="store-section-head"><div><h3>{heading}</h3><p>{blurb}</p></div><span>{STORE_ITEMS.filter((item) => item.kind === kind).length} items</span></div>
        <div className="cards five">
        {STORE_ITEMS.filter((item) => item.kind === kind).map((item) => {
          const afford = state.balance >= item.price;
          const owned =
            item.kind === 'useful'
              ? (item.useful === 'boots' && state.boots) ||
                (item.useful === 'toolkit' && state.toolkit) ||
                (item.useful === 'permit' && state.permit)
              : item.townDecor
                ? (state.townDecorInventory[item.townDecor] || 0) > 0
                : item.kind === 'garden'
                  ? false
                  : item.design
                  ? state.unlockedDesigns.includes(item.design)
                  : item.glasses
                    ? state.unlockedGlasses.includes(item.glasses)
                    : state.unlockedHats.includes(item.cosmetic!);
          return (
            <button
              key={item.id}
              className={`card ${afford && !owned ? '' : 'locked'}`}
              disabled={!afford || owned}
              onClick={() => dispatch({ t: 'buyItem', item: item.id })}
            >
              <div className="card-icon">{item.icon}</div>
              <div className="card-name">{item.name}</div>
              <div className="card-blurb">{owned ? 'Owned — equip it in the customiser' : item.blurb}</div>
              <div className="card-cost">{owned ? (item.townDecor ? `✓ owned ×${state.townDecorInventory[item.townDecor!] || 0}` : '✓ owned') : `💰 ${item.price.toLocaleString()} $BLOCKVILLE`}</div>
            </button>
          );
        })}
        </div>
      </section>)}
      </div>
      <div className="dock-foot">
        Balance: {state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} $BLOCKVILLE
      </div>
    </div>
  );
}

// ── furniture store and House interior ────────────────────────────────────
function FurnitureStorePanel() {
  const { state, dispatch } = useGame();
  if (!state.furnitureStoreOpen) return null;
  const groups = Array.from(new Set(FURNITURE_DEFS.map((x) => x.category)));
  return (
    <Modal icon="🪑" title="Blockville Furniture Store" wide onClose={() => dispatch({ t: 'setFurnitureStoreOpen', open: false })}>
      <p className="dock-note">Choose meaningful pieces for your House. Purchases use the existing demo $BLOCKVILLE balance and never pretend to be on-chain transactions.</p>
      {groups.map((category) => (
        <section className="store-section" key={category}>
          <div className="store-section-head"><h3>{category}</h3><span>{FURNITURE_DEFS.filter((x) => x.category === category).length} designs</span></div>
          <div className="cards five furniture-cards">
            {FURNITURE_DEFS.filter((x) => x.category === category).map((item) => {
              const qty = state.furnitureInventory[item.id] || 0;
              const afford = state.balance >= item.price;
              return <button key={item.id} className={`card furniture-card ${afford ? '' : 'locked'}`} disabled={!afford} onClick={() => dispatch({ t: 'buyFurniture', itemId: item.id })}>
                <div className="furniture-swatch" style={{ background: item.color }}>{item.icon}</div>
                <div className="card-name">{item.name}</div><div className="card-blurb">{item.blurb}</div>
                <div className="card-cost">{qty ? `Owned ×${qty} · ` : ''}{item.price.toLocaleString()} $BLOCKVILLE</div>
              </button>;
            })}
          </div>
        </section>
      ))}
    </Modal>
  );
}

function HouseInterior() {
  const { state, dispatch } = useGame();
  if (state.interiorPlot === null) return null;
  const plot = state.plots.find((p) => p.id === state.interiorPlot);
  if (!plot) return null;
  const owner = plot.owner === 'you';
  const paintOptions = ['#ead8b8', '#d8e6ef', '#e8c8c3', '#d7e7c8', '#d8d0e8'];
  const inventory = FURNITURE_DEFS.filter((item) => (state.furnitureInventory[item.id] || 0) > 0);
  const placed = state.houseFurniture[plot.id] || [];
  return (
    <div className="house-3d-hud">
      <div className="house-3d-card">
        <div className="house-3d-heading">
          <span className="eyebrow">3D HOUSE INTERIOR</span>
          <strong>{owner ? 'Your House' : `${plot.ownerName}'s House`}</strong>
          <small>{owner ? 'Owner mode · WASD to walk and decorate' : 'Visitor mode · viewing only'}</small>
        </div>
        {owner && <div className="house-paint-controls"><span>Wall colour</span>{paintOptions.map((color) => <button key={color} aria-label={`Paint walls ${color}`} className={`paint-dot${plot.housePaint === color ? ' active' : ''}`} style={{ background: color }} onClick={() => dispatch({ t: 'paintHouse', plot: plot.id, color })} />)}</div>}
        {owner && <div className="house-furniture-controls"><b>Furniture inventory</b><div className="house-inventory">{inventory.map((item) => <button key={item.id} className="house-control-btn" onClick={() => dispatch({ t: 'placeFurniture', plot: plot.id, itemId: item.id })}>{item.icon} Place {item.name} <small>×{state.furnitureInventory[item.id]}</small></button>)}{inventory.length === 0 && <small className="house-muted">Buy furniture at the Furniture Store.</small>}</div></div>}
        {owner && placed.length > 0 && <div className="house-placed-list"><b>Placed pieces</b>{placed.map((piece) => {
          const item = FURNITURE_DEFS.find((x) => x.id === piece.itemId);
          return <div className="house-piece-row" key={piece.id}><span>{item?.icon || '🪑'} {item?.name || piece.itemId}</span><div className="house-piece-actions">
            <button className="house-control-btn tiny" title="Move toward the back wall" aria-label="Move up" disabled={piece.locked} onClick={() => dispatch({ t: 'moveFurniture', plot: plot.id, placementId: piece.id, dx: 0, dz: -0.5 })}>↑</button>
            <button className="house-control-btn tiny" title="Move toward the door" aria-label="Move down" disabled={piece.locked} onClick={() => dispatch({ t: 'moveFurniture', plot: plot.id, placementId: piece.id, dx: 0, dz: 0.5 })}>↓</button>
            <button className="house-control-btn tiny" title="Move left" aria-label="Move left" disabled={piece.locked} onClick={() => dispatch({ t: 'moveFurniture', plot: plot.id, placementId: piece.id, dx: -0.5, dz: 0 })}>←</button>
            <button className="house-control-btn tiny" title="Move right" aria-label="Move right" disabled={piece.locked} onClick={() => dispatch({ t: 'moveFurniture', plot: plot.id, placementId: piece.id, dx: 0.5, dz: 0 })}>→</button>
            <button className="house-control-btn tiny" title="Rotate 90°" aria-label="Rotate" disabled={piece.locked} onClick={() => dispatch({ t: 'rotateFurniture', plot: plot.id, placementId: piece.id })}>⟳</button>
            <button className="house-control-btn tiny" onClick={() => dispatch({ t: 'toggleFurnitureLock', plot: plot.id, placementId: piece.id })}>{piece.locked ? 'Unlock' : 'Lock'}</button>
            <button className="house-control-btn tiny danger" disabled={piece.locked} onClick={() => dispatch({ t: 'removeFurniture', plot: plot.id, placementId: piece.id })}>Remove</button>
          </div></div>;
        })}</div>}
        <button className="x" onClick={() => dispatch({ t: 'exitHouse' })}>✕ Exit</button>
      </div>
    </div>
  );
}

// ── marketplace ────────────────────────────────────────────────────────────
function MineRow({ plot }: { plot: Plot }) {
  const { state, dispatch } = useGame();
  const [price, setPrice] = useState(6000);
  const listed = state.listings.some((l) => l.plot === plot.id);
  const def = plot.type ? BUILDING_DEFS[plot.type] : null;
  return (
    <div className="list-row">
      <span className="row-main">🗺️ Plot {plot.id + 1}</span>
      <span className="row-sub">
        {def ? `${def.icon} ${def.name}${plot.done ? '' : ` (${plot.progress}/${def.cost} built)`}` : 'Vacant land'}
      </span>
      {listed ? (
        <span className="row-price">🏷️ listed</span>
      ) : (
        <>
          <input
            className="price-input"
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
          />
          <button className="btn primary sm" onClick={() => dispatch({ t: 'listPlot', plot: plot.id, price })}>
            List
          </button>
        </>
      )}
    </div>
  );
}

function MarketplacePanel() {
  const { state, dispatch } = useGame();
  if (!state.marketOpen) return null;
  const free = state.plots.filter((p) => !p.owner).length;
  const mine = state.plots.filter((p) => p.owner === 'you');
  return (
    <Modal icon="🏷️" title="Blockville Market" wide onClose={() => dispatch({ t: 'setMarketOpen', open: false })}>
      <p className="lede">
        Residents buy and sell plots here for whatever price they choose. Wave {CONFIG.wave} has{' '}
        <b>{TOTAL_PLOTS}</b> plots — <b>{free}</b> still unclaimed. Once they sell out, the market
        is the only way in until the next wave of land drops.
      </p>
      {free === 0 && (
        <div className="alert">
          🚧 Wave {CONFIG.wave} sold out! No free plots remain — trade here until the next wave.
        </div>
      )}
      <div className="row-label">Plots for sale</div>
      <div className="list-rows">
        {state.listings.length === 0 && <div className="empty">Nothing listed right now…</div>}
        {state.listings.map((l) => {
          const plot = state.plots.find((p) => p.id === l.plot)!;
          const def = plot.type ? BUILDING_DEFS[plot.type] : null;
          return (
            <div className="list-row" key={l.id}>
              <span className="row-main">🗺️ Plot {l.plot + 1}</span>
              <span className="row-sub">
                {def ? `${def.icon} ${def.name}${plot.done ? '' : ' (site)'}` : 'Vacant land'}
                {' · '}{l.seller}
              </span>
              <span className="row-price">💰 {l.price.toLocaleString()}</span>
              {l.mine ? (
                <button className="btn ghost sm" onClick={() => dispatch({ t: 'cancelListing', id: l.id })}>
                  Cancel
                </button>
              ) : (
                <button
                  className="btn primary sm"
                  disabled={state.balance < l.price}
                  onClick={() => dispatch({ t: 'buyListing', id: l.id })}
                >
                  Buy
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="row-label">Your plots — list one for any price</div>
      <div className="list-rows">
        {mine.length === 0 && <div className="empty">You don't own a plot yet — claim or buy one first.</div>}
        {mine.map((p) => <MineRow key={p.id} plot={p} />)}
      </div>
      <div className="dock-foot">
        Balance: {state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} $BLOCKVILLE
        {' '}· market purchases don't use your staked claim allowance
      </div>
    </Modal>
  );
}

// ── treasury & fee distribution ────────────────────────────────────────────
function TreasuryPanel() {
  const { state, dispatch } = useGame();
  if (!state.treasuryOpen) return null;
  const t = CONFIG.treasury;
  const residentStake = RESIDENT_BUILDERS.reduce((n, r) => n + r.stake, 0);
  const pool = state.staked + residentStake;
  const mySharePct = pool > 0 && state.builder ? (state.staked / pool) * 100 : 0;
  return (
    <Modal icon="🏦" title="Blockville Treasury" wide onClose={() => dispatch({ t: 'setTreasuryOpen', open: false })}>
      <div className="treasury-wallet">
        <span className="wallet-chip">🏛️ {t.walletLabel}</span>
        <span className="wallet-hint">Demo placeholder — the on-chain treasury wallet arrives with the backend rollout. No real transactions are simulated.</span>
      </div>
      <div className="treasury-balance">
        <div className="tb-label">Treasury balance</div>
        <div className="tb-value">{state.treasury.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span>$BLOCKVILLE</span></div>
      </div>
      <div className="row-label">Where fees come from</div>
      <div className="split-card">
        <div className="split-head"><span>🎰 PumpFun fees</span><span>{t.pumpfunSharePct}% → Treasury</span></div>
        <div className="split-bar">
          <div className="split-gold" style={{ width: `${t.pumpfunSharePct}%` }} />
          <div className="split-grey" style={{ width: `${100 - t.pumpfunSharePct}%` }} />
        </div>
        <div className="split-legend">
          <span>🟡 {t.pumpfunSharePct}% Treasury</span>
          <span>{100 - t.pumpfunSharePct}% stays with the protocol</span>
        </div>
      </div>
      <div className="split-card">
        <div className="split-head"><span>🏪 Store purchases</span><span>{t.storeRoutePct}% → Treasury</span></div>
        <div className="split-bar">
          <div className="split-gold" style={{ width: `${t.storeRoutePct}%` }} />
        </div>
        <div className="split-legend">
          <span>🟡 {t.storeRoutePct}% Treasury — every block &amp; cosmetic sale funds distributions</span>
        </div>
      </div>
      <div className="row-label">Fee distribution to Builders</div>
      <div className="dist-card">
        <p className="note-text">
          Every ~45s, <b>{t.distributePct}%</b> of the Treasury is split across all Residents
          proportionally to their stake.
          {state.builder ? (
            <> Your stake is <b>{state.staked.toLocaleString()} $BLOCKVILLE</b> —{' '}
              <b>{mySharePct.toFixed(1)}%</b> of the Builder pool.</>
          ) : (
            <> Stake at the Store to join the next distribution.</>
          )}
        </p>
        {state.lastDistribution && (
          <div className="dist-last">
            Last payout: <b>{state.lastDistribution.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} $BLOCKVILLE</b>
            {' '}· your share <b className="gold">+{state.lastDistribution.yourShare.toFixed(2)}</b>
          </div>
        )}
      </div>
      <div className="row-label">Treasury ledger</div>
      <div className="list-rows ledger">
        {state.treasury.ledger.length === 0 && <div className="empty">No treasury activity yet…</div>}
        {state.treasury.ledger.map((l) => (
          <div className="list-row" key={l.id}>
            <span className="row-main">{l.text}</span>
            <span className="row-sub">{l.detail}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── stake more modal ───────────────────────────────────────────────────────
function StakeMoreModal({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useGame();
  const [amount, setAmount] = useState<number>(CONFIG.plotStakeCost);
  const can = state.builder && amount > 0 && amount <= state.balance;
  const extra = state.permit ? CONFIG.items.permitExtraPlots : 0;
  const nextPlot =
    plotAllowance(state.staked + amount, extra) > plotAllowance(state.staked, extra)
      ? plotAllowance(state.staked, extra) + 1
      : null;
  return (
    <Modal icon="🔒" title="Stake more — unlock land" onClose={onClose}>
      <p className="lede">
        Each block of land (plot) requires <b>{CONFIG.plotStakeCost.toLocaleString()} $BLOCKVILLE</b> staked.
        You have <b>{plotAllowance(state.staked, extra)}/{CONFIG.maxPlots}</b> unlocked with{' '}
        {state.staked.toLocaleString()} currently staked.
      </p>
      <div className="field-row">
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
        className="btn primary"
        disabled={!can}
        onClick={() => {
          dispatch({ t: 'stakeMore', amount });
          onClose();
        }}
      >
        Stake {amount.toLocaleString()} more
      </button>
    </Modal>
  );
}

// ── build hint + progress ──────────────────────────────────────────────────
function BuildHud() {
  const { state, dispatch } = useGame();
  const building = state.plots.find((p) => p.type && !p.done);
  if (!building || !building.type) return null;
  const def = BUILDING_DEFS[building.type];
  const pct = Math.round((building.progress / def.cost) * 100);
  const near = state.nearPlot === building.id;
  return (
    <div
      className={`build-hud panel ${near ? '' : 'far'}`}
      onClick={() => near && dispatch({ t: 'buildClick', plot: building.id })}
    >
      <div className="build-title">
        {def.icon} Building {def.name} —{' '}
        {near ? 'click the site (or here) to place blocks' : 'walk to the site to keep building'}
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
  const built = state.plots.filter((p) => p.done && p.owner === 'you').length;
  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark">▦</span>
          <div>
            <div className="brand-name">BLOCKVILLE</div>
            <div className="brand-sub">{stageFor(built)}</div>
          </div>
        </div>
        <div className="hud-right">
          <div className="pills">
            <div className="pill" title="Demo wallet balance">
              <span className="pill-icon">💰</span>
              <span className="pill-body">
                <span className="pill-value">{state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                <span className="pill-label">$BLOCKVILLE</span>
              </span>
            </div>
            <div className="pill" title="Demo SOL — pays for building upgrades">
              <span className="pill-icon">◎</span>
              <span className="pill-body">
                <span className="pill-value">{state.sol.toFixed(2)}</span>
                <span className="pill-label">SOL demo</span>
              </span>
            </div>
            <div className="pill" title="Staked $BLOCKVILLE">
              <span className="pill-icon">🔒</span>
              <span className="pill-body">
                <span className="pill-value">{state.staked.toLocaleString()}</span>
                <span className="pill-label">staked</span>
              </span>
            </div>
            <div className="pill" title="Building blocks in stock">
              <span className="pill-icon">🧱</span>
              <span className="pill-body">
                <span className="pill-value">{state.blocks}</span>
                <span className="pill-label">blocks</span>
              </span>
            </div>
            <div className="pill" title="Blocks of land: yours / unlocked by your stake">
              <span className="pill-icon">🗺️</span>
              <span className="pill-body">
                <span className="pill-value">{state.plots.filter((p) => p.owner === 'you').length}/{plotAllowance(state.staked, state.permit ? CONFIG.items.permitExtraPlots : 0)}</span>
                <span className="pill-label">land</span>
              </span>
            </div>
          </div>
          <div className="menu">
            <button className="mbtn" onClick={() => dispatch({ t: 'setStoreOpen', open: true })} title="Open the Blockville Store">
              🛒 <span>Store</span>
            </button>
            <button className="mbtn" onClick={() => dispatch({ t: 'setMarketOpen', open: true })} title="Buy and sell plots on the market">
              🏷️ <span>Market</span>
            </button>
            <button className="mbtn" onClick={() => dispatch({ t: 'setCustomiseOpen', open: true })} title="Customise your resident">
              🧍 <span>Character</span>
            </button>
            <button
              className="mbtn"
              onClick={() => dispatch({ t: 'setSettingsOpen', open: true })}
              title="Settings — audio volumes and bug reporting"
            >
              ⚙️ <span>Settings</span>
            </button>
            <div className={`badge ${state.builder ? 'on' : ''}`}>{state.builder ? 'BUILDER' : 'VISITOR'}</div>
          </div>
        </div>
      </div>
      <div className="demo-tag">DEMO MODE — no real wallet or on-chain rewards</div>
      {state.stakeMoreOpen && <StakeMoreModal onClose={() => dispatch({ t: 'setStakeMoreOpen', open: false })} />}
    </>
  );
}

// ── bottom-left activity log (TOWN / PERSONAL) ─────────────────────────────
function ActivityLog() {
  usePersonalUnread();
  const { state, dispatch } = useGame();
  const personal = state.logTab === 'personal';
  const items = personal
    // newest personal message first, matching the TOWN tab's ordering
    ? [...state.toasts].reverse().map((t) => ({ id: t.id, icon: '📌', text: t.text, detail: '' }))
    : state.feed;
  const visible = state.logOpen ? items : items.slice(0, 5);
  return (
    <div className={`activity-log panel${state.logOpen ? ' expanded' : ''}`}>
      <button
        className="log-tabs"
        onClick={() => dispatch({ t: 'setLogOpen', open: !state.logOpen })}
        title={state.logOpen ? 'Collapse the activity log' : 'Expand the activity log'}
      >
        <span className="log-title">ACTIVITY LOG</span>
        <span className="log-chevron">{state.logOpen ? '▾' : '▸'}</span>
      </button>
      <div className="log-tabs-row">
        <button
          className={`log-tab${personal ? '' : ' active'}`}
          onClick={() => dispatch({ t: 'setLogTab', tab: 'town' })}
        >
          TOWN
        </button>
        <button
          className={`log-tab${personal ? ' active' : ''}`}
          onClick={() => dispatch({ t: 'setLogTab', tab: 'personal' })}
        >
          PERSONAL
          {state.logUnread && !personal && <span className="log-dot" />}
        </button>
      </div>
      <div className="log-body">
        {items.length === 0 && <div className="empty">Quiet for now… build something!</div>}
        {visible.map((f) => (
          <div className="feed-item" key={f.id}>
            <span className="feed-icon">{f.icon}</span>
            <span>
              <b>{f.text}</b>
              <small>{f.detail}</small>
            </span>
          </div>
        ))}
      </div>
      {!state.logOpen && items.length > 5 && (
        <div className="log-more">+{items.length - 5} older — click to expand</div>
      )}
    </div>
  );
}

function Shell() {
  const { state } = useGame();
  if (!state.name) return <NameGate />;
  // any full-screen modal pauses walking; the claim dock stays walk-friendly
  const modalOpen =
    state.storeOpen ||
    state.marketOpen ||
    state.treasuryOpen ||
    state.customiseOpen ||
    state.noticeOpen ||
    state.stakeMoreOpen ||
    state.furnitureStoreOpen ||
    state.arcadeOpen ||
    state.settingsOpen ||
    state.interiorPlot !== null;
  return (
    <div className="app">
      <GameCanvas inputEnabled={!modalOpen} />
      {state.mode !== 'wallet' && <TopBar />}
      {state.mode !== 'wallet' && <StakeModal />}
      {state.mode === 'wallet' && !state.builder && <StakeModal />}
      <InteractPrompt modalOpen={modalOpen} />
      <WalkHint modalOpen={modalOpen} />
      <ClaimMenu />
      <StorePanel />
      <FurnitureStorePanel />
      <ArcadePanel />
      <HouseInterior />
      <MarketplacePanel />
      <TreasuryPanel />
      <NoticePanel />
      {state.settingsOpen && <SettingsModal />}
      <BuildHud />
      <CustomiseModal />
      {state.builder && <ActivityLog />}
    </div>
  );
}

function NameGate() {
  const { dispatch } = useGame();
  const [value, setValue] = useState('');
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
  const valid = clean.length >= 2;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid) dispatch({ t: 'setName', name: clean });
  };
  return (
    <main className="name-gate">
      <section className="name-card panel">
        <div className="name-brand"><span className="brand-mark">▦</span><span>BLOCKVILLE</span></div>
        <p className="eyebrow">WELCOME, BUILDER</p>
        <h1>Choose your town name</h1>
        <p className="name-copy">This is how other residents will recognise you around Blockville.</p>
        <form onSubmit={submit}>
          <label htmlFor="resident-name">Your username</label>
          <input id="resident-name" autoFocus maxLength={12} value={value} placeholder="e.g. Jacob" onChange={(e) => setValue(e.target.value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 12))} />
          <div className="name-meta"><span>2–12 characters</span><span>{value.length}/12</span></div>
          <button className="btn primary name-submit" type="submit" disabled={!valid}>Enter Blockville →</button>
        </form>
      </section>
    </main>
  );
}

// ── E-to-interact prompt (the plot you're standing next to) ────────────────
function InteractPrompt({ modalOpen }: { modalOpen: boolean }) {
  const { state } = useGame();
  // world objects (benches, mailboxes, the shopkeeper…) speak first
  if (!modalOpen && state.promptText) {
    return (
      <div className="interact-prompt">
        <kbd>E</kbd> {state.promptText}
      </div>
    );
  }
  if (modalOpen || state.nearPlot === null) return null;
  const plot = state.plots.find((p) => p.id === state.nearPlot);
  if (!plot) return null;
  let label: string | null = null;
  if (plot.owner === 'other') label = 'Resident-owned plot';
  else if (plot.type && !plot.done) label = 'Build';
  else if (plot.type && plot.done) {
    const def = BUILDING_DEFS[plot.type];
    label = plot.type === 'house' ? 'ENTER House' : `Open ${def.name}`;
  } else if (!plot.type) label = state.builder ? 'Claim plot' : null;
  if (!label) return null;
  const interactive = label !== 'Resident-owned plot';
  return (
    <div className={`interact-prompt ${interactive ? '' : 'plain'}`}>
      {interactive && <kbd>E</kbd>} {interactive ? '' : '🔒 '}{label}
    </div>
  );
}

// ── town noticeboard, read in-world at the plaza ───────────────────────────

function ArcadePanel() {
  const { state, dispatch } = useGame();
  const [status, setStatus] = useState<'idle' | 'playing' | 'result'>('idle');
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [target, setTarget] = useState({ left: 18, top: 26 });
  const [shownAt, setShownAt] = useState(0);
  const [message, setMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(20);
  const [, setSubmitted] = useState(false);
  const scoreRef = useRef(0);      // latest score without re-arming the timer
  const submittedRef = useRef(false);
  const rounds = 5;
  const start = () => {
    setStatus('playing'); setRound(1); setScore(0); scoreRef.current = 0; setMessage(''); setSubmitted(false); submittedRef.current = false;
    window.dispatchEvent(new CustomEvent('blockville:arcade-start', { detail: { gameId: 'reaction' } }));
    setTarget({ left: 18 + Math.floor(Math.random() * 62), top: 22 + Math.floor(Math.random() * 52) });
    setShownAt(performance.now());
    setTimeLeft(20);
  };
  useEffect(() => {
    if (status !== 'playing') return;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) { setStatus('result'); setMessage(`Time up · Final score: ${scoreRef.current.toLocaleString()}`); if (!submittedRef.current) { window.dispatchEvent(new CustomEvent('blockville:arcade-score', { detail: { gameId: 'reaction', score: scoreRef.current } })); submittedRef.current = true; setSubmitted(true); } return 0; }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // score is read through a ref so a fast hit never restarts the countdown
  }, [status]);
  const hit = () => {
    if (status !== 'playing') return;
    const elapsed = Math.max(1, performance.now() - shownAt);
    const gained = Math.max(20, Math.round(900 - elapsed * 2.2));
    const nextScore = score + gained;
    scoreRef.current = nextScore;
    if (round >= rounds) {
      setScore(nextScore); setStatus('result'); setMessage(`Final score: ${nextScore.toLocaleString()}`);
      if (!submittedRef.current) { window.dispatchEvent(new CustomEvent('blockville:arcade-score', { detail: { gameId: 'reaction', score: nextScore } })); submittedRef.current = true; setSubmitted(true); }
      return;
    }
    setScore(nextScore);
    setRound((value) => value + 1);
    setTarget({ left: 12 + Math.floor(Math.random() * 70), top: 18 + Math.floor(Math.random() * 58) });
    setShownAt(performance.now());
  };
  if (!state.arcadeOpen) return null;
  return (
    <Modal icon="🕹️" title="Blockville Reaction" wide onClose={() => dispatch({ t: 'setArcadeOpen', open: false })}>
      <div className="arcade-panel">
        <div className="arcade-head">
          <div><p className="eyebrow">BLOCKVILLE ARCADE</p><h3>Hit the signal</h3><p>Click the glowing target as quickly as you can. Five rounds. Faster reactions score more.</p></div>
          <div className="arcade-score"><span>SCORE</span><strong>{score.toLocaleString()}</strong></div>
        </div>
        <div className="arcade-screen">
          {status === 'idle' && <div className="arcade-screen-copy"><b>READY?</b><span>Start a run to test your reaction time.</span></div>}
          {status === 'result' && <div className="arcade-screen-copy"><b>RUN COMPLETE</b><span>{message}</span><small>Replay to chase a better personal best.</small></div>}
          {status === 'playing' && <button type="button" className="reaction-target" style={{ left: `${target.left}%`, top: `${target.top}%` }} onClick={(e) => { e.stopPropagation(); hit(); }} aria-label="Hit target">✦</button>}
        </div>
        <div className="arcade-footer"><span>{status === 'playing' ? `ROUND ${round}/${rounds} · ${timeLeft}s` : 'One game · five rounds'}</span><button className="btn primary" onClick={start}>{status === 'playing' ? 'Restart' : status === 'result' ? 'Replay' : 'Start game'}</button></div>
        <div className="arcade-leaderboard"><div className="eyebrow">HIGH SCORES · REACTION</div>{(() => { const scores = state.arcadeScores.filter((entry) => entry.gameId === 'reaction'); const personal = scores.find((entry) => entry.name === state.name); return <><div className="arcade-personal-best">{personal ? `Your best · ${personal.score.toLocaleString()}` : 'Your best · —'}</div>{scores.length ? scores.map((entry, index) => <div className="arcade-score-row" key={`${entry.gameId}-${entry.name}`}><span>{index + 1}. {entry.name}</span><strong>{entry.score.toLocaleString()}</strong></div>) : <p className="muted">No scores yet. Set the first record.</p>}</>; })()}</div>
      </div>
    </Modal>
  );
}


function NoticePanel() {
  const { state, dispatch } = useGame();
  if (!state.noticeOpen) return null;
  return (
    <Modal icon="📋" title="Town Noticeboard" onClose={() => dispatch({ t: 'setNoticeOpen', open: false })}>
      <div className="notice-wrap">
        <div className="notice-cols">
          <div>
            <h4>🛠️ Recent updates</h4>
            <ul>
              {CONFIG.notice.recent.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
          <div>
            <h4>🔭 Upcoming updates</h4>
            <ul>
              {CONFIG.notice.upcoming.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        </div>
        <p className="notice-note">Posted at the Blockville plaza — check back now and then.</p>
      </div>
    </Modal>
  );
}

// ── first-run controls hint, fades after you start moving ──────────────────
// ── settings (audio volumes; bug reporting lands in Chunk 2) ────────────────
function SettingsModal() {
  const { state, dispatch } = useGame();
  const close = () => dispatch({ t: 'setSettingsOpen', open: false });
  // report-a-bug form: real POST to the backend, honest success/failure
  const [bugText, setBugText] = useState('');
  const [bugState, setBugState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [bugMsg, setBugMsg] = useState<string | null>(null);
  const sendBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bugState === 'sending') return;
    setBugState('sending');
    setBugMsg(null);
    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: bugText, player: state.name, userAgent: navigator.userAgent }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        setBugState('error');
        setBugMsg(body.error || `The town server rejected the report (HTTP ${res.status}). Your text is kept below.`);
        return;
      }
      setBugState('done');
      setBugText('');
      setBugMsg(
        body.forwarded
          ? 'Report delivered to the town server and the configured destination.'
          : body.stored
            ? 'Report saved on the town server. No external destination is configured, so it stays in the server log.'
            : 'Report forwarded, but server storage failed.',
      );
    } catch {
      setBugState('error');
      setBugMsg('Could not reach the town server. Your text is kept below — try again.');
    }
  };
  return (
    <Modal icon="⚙️" title="Settings" onClose={close}>
      <div className="settings-row">
        <label htmlFor="vol-master">Master volume</label>
        <input
          id="vol-master"
          className="slider"
          type="range" min={0} max={1} step={0.05}
          value={state.volumes.master}
          onChange={(e) => dispatch({ t: 'setVolumes', master: Number(e.target.value), sfx: state.volumes.sfx })}
          onMouseUp={() => sfx('click')}
          onTouchEnd={() => sfx('click')}
        />
        <span className="settings-val">{Math.round(state.volumes.master * 100)}%</span>
      </div>
      <div className="settings-row">
        <label htmlFor="vol-sfx">Effects volume</label>
        <input
          id="vol-sfx"
          className="slider"
          type="range" min={0} max={1} step={0.05}
          value={state.volumes.sfx}
          onChange={(e) => dispatch({ t: 'setVolumes', master: state.volumes.master, sfx: Number(e.target.value) })}
          onMouseUp={() => sfx('click')}
          onTouchEnd={() => sfx('click')}
        />
        <span className="settings-val">{Math.round(state.volumes.sfx * 100)}%</span>
      </div>
      <p className="dock-note subtle">Sliders preview a blip on release so you can hear the level. Volumes are saved with your other progress.</p>
      <hr className="settings-divider" />
      <h4 className="settings-subhead">💰 Economy</h4>
      <div className="settings-actions">
        <button
          className="btn sm"
          type="button"
          title="Treasury & fee distribution"
          onClick={() => {
            dispatch({ t: 'setSettingsOpen', open: false });
            dispatch({ t: 'setTreasuryOpen', open: true });
          }}
        >
          🏦 Treasury
        </button>
        <button
          className="btn sm"
          type="button"
          title={state.builder ? 'Stake more to unlock another block of land' : 'Open the Blockville Store to stake'}
          onClick={() => {
            dispatch({ t: 'setSettingsOpen', open: false });
            if (state.builder) dispatch({ t: 'setStakeMoreOpen', open: true });
            else dispatch({ t: 'setStakeDockClosed', closed: false });
          }}
        >
          🔒 {state.builder ? 'Stake more' : 'Stake'}
        </button>
      </div>
      <hr className="settings-divider" />
      <form onSubmit={sendBug}>
        <h4 className="settings-subhead">🐞 Report a bug</h4>
        <textarea
          className="bug-textarea"
          rows={3}
          maxLength={4000}
          placeholder="What went wrong? What were you doing when it happened?"
          value={bugText}
          onChange={(e) => setBugText(e.target.value)}
          disabled={bugState === 'sending'}
        />
        <div className="bug-actions">
          <button className="btn primary sm" type="submit" disabled={bugState === 'sending' || bugText.trim().length < 5}>
            {bugState === 'sending' ? 'Sending…' : 'Send report'}
          </button>
        </div>
        {bugMsg && (
          <p className={`note-text ${bugState === 'error' ? 'error' : ''}`} role="status">
            {bugState === 'error' ? `⚠️ ${bugMsg}` : `✅ ${bugMsg}`}
          </p>
        )}
      </form>
    </Modal>
  );
}

// ── first-run controls hint, fades after you start moving ──────────────────
function WalkHint({ modalOpen }: { modalOpen: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (gone) return;
    const keys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    const h = (e: KeyboardEvent) => {
      if (keys.includes(e.key.toLowerCase())) setGone(true);
    };
    window.addEventListener('keydown', h);
    const t = setTimeout(() => setGone(true), 20000);
    return () => {
      window.removeEventListener('keydown', h);
      clearTimeout(t);
    };
  }, [gone]);
  if (gone || modalOpen) return null;
  return (
    <div className="walk-hint">
      <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <span>drag</span> orbit · <span>scroll</span> zoom
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
