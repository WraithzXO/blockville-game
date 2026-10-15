import { DECOR_LABEL, type PlotFeatureKind } from './plots/PlotLayout';
import { blackjackBet, blackjackHit, blackjackStand } from './game/net';
import { useEffect, useRef, useState } from 'react';
import {
  BUILDING_DEFS,
  CONFIG,
  FURNITURE_DEFS,
  GLASSES,
  FACE_STYLES,
  HATS,
  SHIRT_COLORS,
  SHIRT_DESIGNS,
  SKIN_TONES,
  STORE_ITEMS,
  TOTAL_PLOTS,
  type BuildingType,
  type PlayerLook,
} from './game/config';
import { GameProvider, useGame, usePersonalUnread, type Plot } from './game/state';
import { sfx } from './game/audio';
import GameCanvas from './game/GameCanvas';
import { setAccess, signInWithPhantom, useAccess } from './game/access';
import CharacterPreview from './game/CharacterPreview';
import { renderCharacterSnapshot } from './game/CharacterSnapshot';

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
          Wallet linked (read-only). On-chain holdings verification arrives with the backend rollout —
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
          <button className="btn primary" onClick={() => { dispatch({ t: 'placeGarden', plot: plot.id }); window.dispatchEvent(new CustomEvent('blockville:garden-place', { detail: { plot: plot.id } })); }}>
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
  // claim allowance comes from the server's verified-holdings entitlement snapshot
  const allowance = state.entitlement
    ? Math.min(CONFIG.maxPlots, state.entitlement.entitlement + (state.permit ? CONFIG.items.permitExtraPlots : 0))
    : CONFIG.maxPlots;
  const locked = claimed >= allowance;
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
      {locked && (
        <p className="dock-note">
          🔒 Each block of land needs {CONFIG.plotStakeCost.toLocaleString()} $BLOCKVILLE held
          ({claimed}/{CONFIG.maxPlots} claimed). Hold more $BLOCKVILLE in your wallet to unlock
          another plot — or buy one on the 🏷️ Market.
        </p>
      )}
    </div>
  );
}

// ── character customiser ───────────────────────────────────────────────────
function CustomiseModal() {
  const { state, dispatch } = useGame();
  if (!state.customiseOpen) return null;
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
              onClick={() => { dispatch({ t: 'buyItem', item: item.id }); window.dispatchEvent(new CustomEvent('blockville:shop-purchase', { detail: { item: item.id } })); }}
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
        {' '}· market purchases don't use your holding-based claim allowance
      </div>
    </Modal>
  );
}

// ── treasury & fee distribution ────────────────────────────────────────────
// Chunk 5: the on-chain treasury wallet holdings, read from the server
// (/api/treasury/holdings — a read-only Solana RPC fetch server-side). The
// client receives the VALUE only: no key material, no balance logic. Polls
// every 10s while the panel is open; on a failed poll the last valid value
// stays on screen behind a stale indicator and recovers automatically.
type OnChainHoldings = {
  configured: boolean;
  wallet: string;
  balance: number | null;
  decimals: number | null;
  updatedAt: number | null;
  stale: boolean;
};

function useOnChainHoldings(enabled: boolean) {
  const [holdings, setHoldings] = useState<OnChainHoldings | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) { setHoldings(null); setFailed(false); return; }
    let alive = true;
    const load = () => {
      fetch('/api/treasury/holdings')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: OnChainHoldings) => { if (alive) { setHoldings(d); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(iv); };
  }, [enabled]);
  return { holdings, stale: failed || (holdings?.stale === true) };
}

function TreasuryPanel() {
  const { state, dispatch } = useGame();
  const { holdings, stale } = useOnChainHoldings(state.treasuryOpen);
  if (!state.treasuryOpen) return null;
  const t = CONFIG.treasury;
  return (
    <Modal icon="🏦" title="Blockville Treasury" wide onClose={() => dispatch({ t: 'setTreasuryOpen', open: false })}>
      <div className="treasury-wallet">
        <span className="wallet-chip">🏛️ {holdings?.wallet ?? t.walletLabel}</span>
        <span className="wallet-hint">Live read of the real on-chain treasury wallet (public address only — no key material ever leaves the server). Simulated demo ledger: {state.treasury.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} $BLOCKVILLE.</span>
      </div>
      <div className="treasury-balance">
        <div className="tb-label">On-chain treasury holdings</div>
        <div className="tb-value">
          {holdings?.configured && holdings.balance != null
            ? holdings.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })
            : '—'} <span>$BLOCKVILLE</span>
        </div>
        <div className={'tb-status' + (stale ? ' stale' : '')}>
          {!holdings?.configured
            ? 'Awaiting $BLOCKVILLE mint configuration (BLOCKVILLE_MINT) — shows 0 until the operator sets it.'
            : stale
              ? 'Stale — showing the last valid balance; retrying automatically.'
              : 'Live · auto-refreshes every 10s'}
        </div>
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
          Every cycle, <b>{t.distributePct}%</b> of the Treasury is split across all Residents
          proportionally to their plots and upgrades (verified holdings decide how many plots you
          can claim — the more you hold, the more you can build).
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

// ── build hint + progress ──────────────────────────────────────────────────
type TokenomicsConfig = {
  plotScore: {
    formula: string;
    basePlotPoints: number;
    buildBlocks: Record<string, number>;
    upgradeMultipliers: number[];
    maxLevel: number;
    gardenMultiplier: number;
  };
  cycle: { intervalMinutes: number; distributePct: number; minDistributableTokens: number };
  fees: { buybackPct: number; gasReservePct: number; gasSweepThresholdSol: number; gasSweepFraction: number };
  payoutRules: { roundDownPerPlayer: boolean; remainderRetained: boolean; npcExcluded: boolean };
  entitlement: { tokensPerPlot: number; maxPlots: number };
};

// Live tokenomics config, fetched while the panel is open. Values come from
// the backend's single source of truth so the panel cannot drift from what
// the payout engine enforces. No local mirror — if the server is unreachable
// the panel says so instead of showing possibly-stale numbers.
function useTokenomicsConfig(enabled: boolean) {
  const [config, setConfig] = useState<TokenomicsConfig | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) { setConfig(null); setFailed(false); return; }
    let alive = true;
    const load = () => {
      fetch('/api/tokenomics')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => { if (alive && d?.tokenomics) { setConfig(d.tokenomics as TokenomicsConfig); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(iv); };
  }, [enabled]);
  return { config, failed };
}

function TokenomicsPanel() {
  const { state, dispatch } = useGame();
  const { config, failed } = useTokenomicsConfig(state.tokenomicsOpen);
  if (!state.tokenomicsOpen) return null;
  return (
    <Modal icon="📊" title="Tokenomics" wide onClose={() => dispatch({ t: 'setTokenomicsOpen', open: false })}>
      {!config && (
        <p className="note-text" role="status">
          {failed
            ? '⚠️ Could not reach the town server for live tokenomics values. Retrying automatically — no figures are shown until they load, so nothing can be out of date.'
            : 'Loading live tokenomics from the town server…'}
        </p>
      )}
      {config && (
        <>
          <div className="row-label">Plot reward points</div>
          <div className="dist-card">
            <p className="note-text">
              Every completed building on an owned plot earns points each cycle:
              {' '}<b>{config.plotScore.formula}</b> — where <b>{config.plotScore.basePlotPoints}</b> is
              the base points for the plot itself, <b>B</b> is the building's construction-block
              requirement, <b>U</b> is the upgrade multiplier and <b>G</b> is the Garden Kit
              multiplier. Only real players' completed buildings earn points.
            </p>
            <div className="list-rows">
              {Object.entries(config.plotScore.buildBlocks).map(([type, blocks]) => (
                <div className="list-row" key={type}>
                  <span className="row-main">{BUILDING_DEFS[type as keyof typeof BUILDING_DEFS]?.icon ?? '🏗️'} {BUILDING_DEFS[type as keyof typeof BUILDING_DEFS]?.name ?? type}</span>
                  <span className="row-sub">{config.plotScore.basePlotPoints} + {blocks} blocks = {config.plotScore.basePlotPoints + blocks} base points</span>
                </div>
              ))}
            </div>
          </div>
          <div className="row-label">Upgrade multipliers (per building level)</div>
          <div className="dist-card">
            <div className="tk-mults">
              {config.plotScore.upgradeMultipliers.map((m, i) => (
                <span className="tk-mult" key={i}>Lv{i + 1} ×{m.toFixed(2)}</span>
              ))}
              <span className="tk-mult">🌸 Garden Kit ×{config.plotScore.gardenMultiplier.toFixed(2)}</span>
            </div>
            <p className="note-text">Level {config.plotScore.maxLevel} is the maximum. The Garden Kit multiplier applies only while a kit is actually placed on the plot.</p>
          </div>
          <div className="row-label">Distribution cycle</div>
          <div className="dist-card">
            <p className="note-text">
              Every <b>{config.cycle.intervalMinutes} minutes</b>, <b>{Math.round(config.cycle.distributePct * 100)}%</b> of the
              treasury's $BLOCKVILLE holdings is distributed across residents in proportion to their plot points.
              Each player's payout is <b>rounded down</b> to a whole token; the round-down remainder stays in the
              treasury and carries into the next cycle. Cycles below {config.cycle.minDistributableTokens} whole
              distributable token are skipped.
            </p>
          </div>
          <div className="row-label">Fee intake split (of SOL the treasury actually receives)</div>
          <div className="split-card">
            <div className="split-head"><span>💰 Received SOL per cycle</span><span>{Math.round(config.fees.buybackPct * 100)}% buyback / {Math.round(config.fees.gasReservePct * 100)}% gas</span></div>
            <div className="split-bar">
              <div className="split-gold" style={{ width: `${config.fees.buybackPct * 100}%` }} />
              <div className="split-grey" style={{ width: `${config.fees.gasReservePct * 100}%` }} />
            </div>
            <div className="split-legend">
              <span>🟡 {Math.round(config.fees.buybackPct * 100)}% → $BLOCKVILLE buybacks</span>
              <span>⚙️ {Math.round(config.fees.gasReservePct * 100)}% → SOL gas reserve</span>
            </div>
          </div>
          <div className="dist-card">
            <p className="note-text">
              <b>Gas sweep rule:</b> when the gas reserve holds at least <b>{config.fees.gasSweepThresholdSol} SOL</b>,
              half of it is swept into that cycle's buyback so the reserve never pools idle.
            </p>
          </div>
          <div className="row-label">Plot entitlement</div>
          <div className="dist-card">
            <p className="note-text">
              Plot eligibility comes from <b>verified on-chain holdings</b>: every {' '}
              <b>{config.entitlement.tokensPerPlot.toLocaleString()} $BLOCKVILLE held</b> unlocks one claimable plot,
              up to <b>{config.entitlement.maxPlots}</b>. Staking is not part of the equation.
            </p>
          </div>
          <div className="row-label">Fairness rules</div>
          <div className="dist-card">
            <p className="note-text">
              <b>NPCs are excluded</b> from every distribution — no flag, no share, ever. All payouts are
              server-authoritative from the real plot ledger.
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}

// ── whitepaper (opened from Settings; document view in the game's style) ────
// Long-form explanation of the real, implemented systems. Live figures come
// from /api/tokenomics via the same hook the Tokenomics panel uses, so the
// document cannot drift from what the payout engine enforces. When the town
// server is unreachable the affected sections say so instead of guessing.
const WP_SECTIONS = [
  { id: 'what', label: 'The town' },
  { id: 'loop', label: 'Core loop' },
  { id: 'tokenomics', label: 'Tokenomics' },
  { id: 'treasury', label: 'Treasury & fees' },
  { id: 'plots', label: 'Plots & revocation' },
  { id: 'risk', label: 'Risk' },
  { id: 'future', label: 'Future' },
] as const;

function WhitepaperPanel() {
  const { state, dispatch } = useGame();
  const { config, failed } = useTokenomicsConfig(state.whitepaperOpen);
  const [section, setSection] = useState<string>('what');
  if (!state.whitepaperOpen) return null;
  const t = config;
  const close = () => dispatch({ t: 'setWhitepaperOpen', open: false });
  const num = (x: number) => x.toLocaleString('en-US');
  const idx = WP_SECTIONS.findIndex((s) => s.id === section);
  const goto = (i: number) => setSection(WP_SECTIONS[Math.max(0, Math.min(WP_SECTIONS.length - 1, i))].id);
  // live figures render only from the backend config; without it the affected
  // sections show a notice rather than possibly-stale hardcoded numbers
  const liveNote = failed ? (
    <p className="note-text wp-live-note" role="status">⚠️ Live figures could not be loaded from the town server — open the 📊 Tokenomics panel once it is reachable.</p>
  ) : null;
  const body = () => {
    switch (section) {
      case 'what':
        return (
          <>
            <p className="note-text">
              <b>Blockville</b> is a lightweight multiplayer voxel town. Holding <b>$BLOCKVILLE</b> grants
              land: residents claim plots, build on them, and the town's real activity — construction,
              upgrades, trade and purchases — drives its economy.
            </p>
            <p className="note-text">
              Everything described in this document is enforced by the town server itself, not by promises:
              ownership, upgrades, boosts and payouts are all decided server-side from the real ledger.
            </p>
          </>
        );
      case 'loop':
        return (
          <>
            <p className="note-text"><b>1. Hold.</b> Keep $BLOCKVILLE in your wallet.</p>
            <p className="note-text">
              <b>2. Claim land.</b> Verified on-chain holdings decide how many plots you may claim —{' '}
              {t ? <><b>{num(t.entitlement.tokensPerPlot)} $BLOCKVILLE per plot, up to {t.entitlement.maxPlots} plots</b></> : <b>holding tiers decide your plot allowance</b>}
              {' '}— and a plot is claimed by walking up to it in town.
            </p>
            <p className="note-text"><b>3. Build.</b> Raise buildings from ready-made presets or your own custom design.</p>
            <p className="note-text"><b>4. Grow your weight.</b> Completed buildings and upgrades increase your share of every distribution.</p>
            <p className="note-text">
              <b>5. Get paid.</b> Treasury distributions pay plot owners every cycle, and town activity —
              purchases and upgrades — recycles value back into the treasury.
            </p>
          </>
        );
      case 'tokenomics':
        return (
          <>
            {!t && liveNote}
            <p className="note-text">
              <b>Plot points:</b> each plot is worth{' '}
              {t ? <><b>{t.plotScore.basePlotPoints} points</b> plus <b>1 point per construction block</b></> : <b>a base amount plus 1 point per construction block</b>}.
            </p>
            <p className="note-text">
              <b>Upgrades multiply</b> a building's base points:{' '}
              {t
                ? t.plotScore.upgradeMultipliers.map((m, i) => <span key={i}><b>×{m.toFixed(2)}</b>{i < t.plotScore.upgradeMultipliers.length - 1 ? ' / ' : ''}</span>)
                : <b>each building level raises the multiplier</b>}
              {t ? <>, and a <b>Garden Kit ×{t.plotScore.gardenMultiplier.toFixed(2)}</b> boosts the plot further.</> : <>, with a further boost from Garden Kits.</>}
            </p>
            <p className="note-text">
              <b>The cycle:</b> every {t ? <><b>{t.cycle.intervalMinutes} minutes</b>, <b>{Math.round(t.cycle.distributePct * 100)}%</b></> : <b>each cycle, a fixed share</b>} of the
              treasury's holdings is distributed, weighted by points. Each player's share is rounded
              down, with the remainder retained in the treasury. <b>NPCs are excluded</b> — no flag, no share, ever.
            </p>
            <p className="note-text">
              This is a summary — the 📊 <b>Tokenomics</b> panel in the top bar holds the full detail,
              including per-building base points, all pulled live from the server.
            </p>
          </>
        );
      case 'treasury':
        return (
          <>
            {!t && liveNote}
            <p className="note-text">
              The treasury wallet receives the game's fees and splits every SOL it actually receives{' '}
              {t ? <>into <b>{Math.round(t.fees.buybackPct * 100)}% buyback</b> and <b>{Math.round(t.fees.gasReservePct * 100)}% gas reserve</b></> : <b>between buybacks and the gas reserve</b>}.
            </p>
            <p className="note-text">
              {t ? <>When the gas reserve reaches <b>{t.fees.gasSweepThresholdSol} SOL</b>, about half is swept</> : <>When the gas reserve grows past its threshold, part of it is swept</>} into
              extra $BLOCKVILLE buybacks, so the reserve never silently accumulates.
            </p>
            <p className="note-text">
              Distributions are funded from treasury holdings and recorded in an <b>auditable ledger</b> —
              visible to everyone in the 🏦 <b>Treasury</b> panel in the top bar.
            </p>
          </>
        );
      case 'plots':
        return (
          <>
            <p className="note-text">
              <b>Claiming:</b> walk up to an unclaimed plot and claim it — the server verifies your
              on-chain holdings against the tiers before the claim is accepted.
            </p>
            <p className="note-text">
              <b>Revocation:</b> if your holdings drop below the tier for the plots you hold, the{' '}
              <b>most recently claimed plot (LIFO)</b> is revoked server-side and becomes claimable again
              immediately. A drop across multiple tiers revokes one plot per pass.
            </p>
            <p className="note-text">
              <b>Stale-data guard:</b> if the server cannot verify holdings at a given moment (an RPC
              failure serves the last valid balance, flagged stale), <b>nothing is revoked and no tier
              changes</b> until a fresh successful read recovers. Your land is never taken on unknown data.
            </p>
            <p className="note-text">A revoked plot's building does not remain; the plot itself is free to be claimed again.</p>
          </>
        );
      case 'risk':
        return (
          <>
            <p className="note-text"><b>$BLOCKVILLE is volatile</b> and may go to zero.</p>
            <p className="note-text">
              <b>Distributions are not guaranteed.</b> They depend on game activity, fee revenue and
              treasury holdings, may change at any time, and may stop entirely.
            </p>
            <p className="note-text">
              Nothing in Blockville is financial advice. The complete wording lives in the{' '}
              <b>📜 Terms &amp; Disclaimer</b> section of Settings, just below the whitepaper's entry point.
            </p>
          </>
        );
      case 'future':
        return (
          <>
            <p className="note-text">The town keeps growing beyond its fences.</p>
            <p className="note-text">Some doors around town aren't open yet.</p>
            <p className="note-text">Residents will find new ways to leave a mark.</p>
            <p className="note-text">The wilderness beyond the gate has stories of its own.</p>
          </>
        );
      default:
        return null;
    }
  };
  return (
    <Modal icon="📖" title="Whitepaper" wide onClose={close}>
      <div className="wp-tabs" role="tablist">
        {WP_SECTIONS.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === section}
            className={`wp-tab${s.id === section ? ' active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="wp-page">
        <h4 className="wp-heading">{WP_SECTIONS[idx]?.label}</h4>
        {body()}
      </div>
      <div className="wp-pager">
        <button className="btn sm" disabled={idx <= 0} onClick={() => goto(idx - 1)}>← Previous</button>
        <span className="wp-count">{idx + 1} / {WP_SECTIONS.length}</span>
        <button className="btn sm" disabled={idx >= WP_SECTIONS.length - 1} onClick={() => goto(idx + 1)}>Next →</button>
      </div>
    </Modal>
  );
}

// ── build hint + progress ──────────────────────────────────────────────────
function BuildHud() {
  const { state, dispatch } = useGame();
  const building = state.plots.find((p) => p.type && !p.done);
  // The anywhere-on-map low-opacity variant is gone: the panel only renders
  // when the player is standing at the site (the clickable control and its
  // hitbox are unchanged). Away from the site the InteractPrompt alone guides.
  if (!building || !building.type || state.nearPlot !== building.id) return null;
  const def = BUILDING_DEFS[building.type];
  const pct = Math.round((building.progress / def.cost) * 100);
  return (
    <div
      className="build-hud panel"
      onClick={() => dispatch({ t: 'buildClick', plot: building.id })}
    >
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
  return (
    <>
      <div className="topbar">
        {/* top-left: read-only info (pills + resident badge) — no clickable controls here */}
        <div className="hud-left">
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
            <div className="pill" title="Building blocks in stock">
              <span className="pill-icon">🧱</span>
              <span className="pill-body">
                <span className="pill-value">{state.blocks}</span>
                <span className="pill-label">blocks</span>
              </span>
            </div>
            <div className="pill" title="Blocks of land: yours / unlocked by your verified holdings">
              <span className="pill-icon">🗺️</span>
              <span className="pill-body">
                <span className="pill-value">{state.plots.filter((p) => p.owner === 'you').length}/{state.entitlement ? Math.min(CONFIG.maxPlots, state.entitlement.entitlement + (state.permit ? CONFIG.items.permitExtraPlots : 0)) : CONFIG.maxPlots}</span>
                <span className="pill-label">land</span>
              </span>
            </div>
          </div>
          <div className="badge on">RESIDENT</div>
        </div>
        {/* top-right: interactive controls only */}
        <div className="hud-right">
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
            <button className="mbtn" onClick={() => dispatch({ t: 'setTreasuryOpen', open: true })} title="Treasury — live holdings, fee routing and payouts">
              🏦 <span>Treasury</span>
            </button>
            <button className="mbtn" onClick={() => dispatch({ t: 'setTokenomicsOpen', open: true })} title="Tokenomics — how plot points and payouts work">
              📊 <span>Tokenomics</span>
            </button>
            <button
              className="mbtn"
              onClick={() => dispatch({ t: 'setSettingsOpen', open: true })}
              title="Settings — audio volumes and bug reporting"
            >
              ⚙️ <span>Settings</span>
            </button>
          </div>
        </div>
      </div>
      <div className="demo-tag">DEMO MODE — no real wallet or on-chain rewards</div>
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
    ? [...state.toasts].reverse().map((t) => ({ id: t.id, icon: t.icon ?? '📌', text: t.text, detail: t.detail ?? '' }))
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

// ── earnings callout card (always visible, bottom-left column) ─────────────
// Server-authoritative figures only: holdings come from the entitlement
// snapshot and total fees earned from the payout engine's ledger records —
// the client never sums anything itself. Share renders the card from that
// same real data, downloads the PNG, and opens an X compose window with a
// pre-filled draft (never auto-posts).
function EarningsCard() {
  const { state } = useGame();
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    try {
      const url = renderCharacterSnapshot(state.look, 96, 120);
      if (alive) setAvatar(url);
    } catch { /* WebGL unavailable: the card keeps its initials slot */ }
    return () => { alive = false; };
  }, [state.look]);

  const holdings = state.entitlement?.tokens ?? 0;
  const fees = state.feesEarned?.total ?? 0;

  const share = () => {
    // the image and the draft text are built from the SAME authoritative
    // figures the card shows — nothing is fabricated or inflated
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 520;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1d2430';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2a3444';
    ctx.fillRect(18, 18, canvas.width - 36, canvas.height - 36);
    ctx.strokeStyle = '#e0b64a';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
    if (avatar) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 52, 130, 240, 300);
        finishShare(canvas, holdings, fees);
      };
      img.onerror = () => finishShare(canvas, holdings, fees);
      img.src = avatar;
      return;
    }
    finishShare(canvas, holdings, fees);
  };

  return (
    <div className="earnings-card panel" data-testid="earnings-card">
      <div className="earnings-head">EARNINGS</div>
      <div className="earnings-body">
        {avatar
          ? <img className="earnings-avatar" src={avatar} alt="" data-testid="earnings-avatar" />
          : <div className="earnings-avatar earnings-avatar-fallback">{(state.name || '?').slice(0, 1).toUpperCase()}</div>}
        <div className="earnings-figs">
          <div className="earnings-row">
            <span className="earnings-label">HOLDINGS</span>
            <b className="earnings-value" data-testid="earnings-holdings">{holdings.toLocaleString()}</b>
          </div>
          <div className="earnings-row">
            <span className="earnings-label">FEES EARNED</span>
            <b className="earnings-value gold" data-testid="earnings-fees">{fees.toLocaleString()}</b>
          </div>
        </div>
      </div>
      <button className="earnings-share" onClick={share} title="Download the card and open a pre-filled X post for you to review" data-testid="earnings-share">
        Share
      </button>
    </div>
  );
}

function finishShare(canvas: HTMLCanvasElement, holdings: number, fees: number) {
  // header + figures are drawn here so the PNG matches the live card exactly
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f4ead2';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillText('BLOCKVILLE', 340, 110);
    ctx.fillStyle = '#9aa7bd';
    ctx.font = '26px system-ui, sans-serif';
    ctx.fillText('TOWN EARNINGS', 340, 150);
    ctx.fillStyle = '#f4ead2';
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.fillText(`Holdings: ${holdings.toLocaleString()} $BLOCKVILLE`, 340, 260);
    ctx.fillStyle = '#e0b64a';
    ctx.fillText(`Fees earned: ${fees.toLocaleString()} $BLOCKVILLE`, 340, 330);
    ctx.fillStyle = '#9aa7bd';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('@blockville_', 340, 460);
  }
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'blockville-earnings.png';
  a.click();
  const draft = `I've earned ${fees.toLocaleString()} $BLOCKVILLE in treasury fees from my plots in @blockville_ — come build with me!`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(draft)}`, '_blank', 'noopener,noreferrer');
}

// ── entry choice + guest wall (guest-mode chunk) ───────────────────────────
// Connect Wallet = Phantom + server-verified Ed25519 sign-in (full economy).
// Continue as Guest = walk / fish / explore only; the SERVER refuses every
// economic message from a guest, so hiding things here is only courtesy.
function useConnectWallet(reloadAfter = false) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connect = async () => {
    setErr(null);
    setBusy(true);
    try {
      setAccess(await signInWithPhantom());
      // a fresh connection (new session token) is the simple, duplicate-free
      // path for a guest upgrading mid-session: reload re-joins as the wallet
      // identity; the guest connection closes and its character leaves
      if (reloadAfter) window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Connection was rejected.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, connect };
}
function EntryGate() {
  const { busy, err, connect } = useConnectWallet();
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/health').then((r) => r.json()).then((h) => setLive(h?.liveEconomy === true)).catch(() => setLive(null));
  }, []);
  const hasPhantom = typeof window !== 'undefined' && !!((window as any).phantom?.solana ?? (window as any).solana)?.isPhantom;
  return (
    <main className="name-gate">
      <section className="name-card panel" data-testid="entry-gate">
        <button className="x entry-x" aria-label="Skip and continue as guest" onClick={() => setAccess({ kind: 'guest', guestSession: null })}>✕</button>
        <div className="name-brand"><span className="brand-mark">▦</span><span>BLOCKVILLE</span></div>
        <p className="eyebrow">WELCOME, RESIDENT</p>
        <h1>How do you want to play?</h1>
        <p className="name-copy">Connect a Solana wallet to prove your $BLOCKVILLE, claim plots and receive fee payouts — or click the ✕ to skip and just walk around.</p>
        <button className="btn primary name-submit" data-testid="entry-connect" disabled={busy || !hasPhantom} onClick={connect}>
          {busy ? 'Waiting for approval…' : 'Connect Wallet'}
        </button>
        {!hasPhantom && <p className="note-text">No Phantom wallet detected in this browser — install Phantom to connect.</p>}
        {err && <div className="note-text error">{err}</div>}
        <button className="btn ghost name-submit" data-testid="entry-guest" onClick={() => setAccess({ kind: 'guest', guestSession: null })}>Continue as Guest</button>
        <p className="note-text">Guests can create a character, walk the town, fish and see other players. Plots, shop, casino and payouts need a wallet.</p>
        {live === false && (
          <button className="btn ghost sm" data-testid="entry-demo" onClick={() => setAccess({ kind: 'demo' })}>Play demo (this server has no live economy)</button>
        )}
      </section>
    </main>
  );
}

function GuestWall({ onClose }: { onClose: () => void }) {
  const { busy, err, connect } = useConnectWallet(true);
  return (
    <Modal icon="🔒" title="Connect wallet to play" onClose={onClose}>
      <p className="note-text" data-testid="guest-wall">Guests can walk, fish and explore. Plots, the shop, blackjack and fee payouts need a connected wallet so the game can verify your $BLOCKVILLE.</p>
      <button className="btn primary" disabled={busy} onClick={connect}>{busy ? 'Waiting for approval…' : 'Connect Wallet'}</button>
      {err && <div className="note-text error">{err}</div>}
    </Modal>
  );
}

function Shell() {
  const { state, dispatch } = useGame();
  const access = useAccess();
  if (!access) return <EntryGate />;
  if (!state.name) return <NameGate />;
  const guest = access.kind === 'guest';
  const closeEconomy = () => {
    dispatch({ t: 'selectPlot', plot: null });
    dispatch({ t: 'setStoreOpen', open: false });
    dispatch({ t: 'setMarketOpen', open: false });
    dispatch({ t: 'setFurnitureStoreOpen', open: false });
    dispatch({ t: 'setBlackjackOpen', open: false });
  };
  const guestWall = guest && (state.selectedPlot !== null || state.storeOpen || state.marketOpen || state.furnitureStoreOpen || state.blackjackOpen);
  // any full-screen modal pauses walking; the claim dock stays walk-friendly
  const modalOpen =
    state.storeOpen ||
    state.marketOpen ||
    state.treasuryOpen ||
    state.tokenomicsOpen ||
    state.whitepaperOpen ||
    state.customiseOpen ||
    state.noticeOpen ||
    state.furnitureStoreOpen ||
    state.arcadeOpen ||
    state.blackjackOpen ||
    state.settingsOpen ||
    state.interiorPlot !== null;
  return (
    <div className="app">
      <GameCanvas inputEnabled={!modalOpen} />
      {state.mode !== 'wallet' && <TopBar />}
      <InteractPrompt modalOpen={modalOpen} />
      <WalkHint modalOpen={modalOpen} />
      {guest ? (guestWall && <GuestWall onClose={closeEconomy} />) : <ClaimMenu />}
      {!guest && <StorePanel />}
      {!guest && <FurnitureStorePanel />}
      <ArcadePanel />
      {!guest && <BlackjackPanel />}
      {!guest && <HouseInterior />}
      {!guest && <MarketplacePanel />}
      <TreasuryPanel />
      <TokenomicsPanel />
      <WhitepaperPanel />
      <NoticePanel />
      {state.settingsOpen && <SettingsModal />}
      <BuildHud />
      <CustomiseModal />
      {/* bottom-left column: the earnings card sits above the activity log
          in one shared column, so neither overlaps the other or the HUD */}
      <div className="bl-col" data-testid="bl-col">
        {!guest && <EarningsCard />}
        <ActivityLog />
      </div>
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
        <p className="eyebrow">WELCOME, RESIDENT</p>
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
  } else if (!plot.type) label = 'Claim plot';
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


// ── casino blackjack ───────────────────────────────────────────────────────
// A pure view over the server's authoritative table state. Every card, total,
// result and balance on screen comes from the last `bj` message — the client
// sends only intent (a bet amount, hit, stand) and never computes anything.
function BlackjackPanel() {
  const { state, dispatch } = useGame();
  const [draftBet, setDraftBet] = useState('100');
  const [lastReason, setLastReason] = useState<string | null>(null);
  if (!state.blackjackOpen) return null;
  const bj = state.blackjack;
  const phase = bj?.phase ?? 'betting';
  const inHand = phase === 'player';
  const betValue = Math.floor(Number(draftBet)) || 0;
  const reasonText: Record<string, string> = {
    bet_too_small: 'Bet is below the table minimum (1 $BLOCKVILLE).',
    bet_too_large: 'Bet is over the table maximum (5,000 $BLOCKVILLE).',
    hand_in_progress: 'Finish your current hand first.',
    insufficient_balance: 'Not enough $BLOCKVILLE in your in-game balance. Deposit at the treasury to top up.',
    treasury_cannot_cover: 'The treasury cannot cover this bet right now. Try a smaller stake.',
    no_active_hand: 'No hand in progress — place a bet first.',
  };
  const cardLabel = (card: string) => {
    if (card === '??') return '🂠';
    const rank = card.slice(0, card.length - 1);
    const suit = card.slice(-1);
    const glyph = suit === 'S' ? '♠' : suit === 'H' ? '♥' : suit === 'D' ? '♦' : '♣';
    return `${rank}${glyph}`;
  };
  const act = (fn: () => void) => { setLastReason(null); fn(); };
  return (
    <Modal icon="🃏" title="Blockville Casino · Blackjack" wide onClose={() => dispatch({ t: 'setBlackjackOpen', open: false })}>
      <div className="bj-panel">
        <div className="bj-head">
          <div>
            <p className="eyebrow">TABLE RULES</p>
            <h3>Dealer stands on 17 · Blackjack pays 3:2</h3>
            <p>Max bet 5,000 $BLOCKVILLE. Bets are placed from your in-game balance, settled by the house treasury.</p>
          </div>
          <div className="arcade-score"><span>BALANCE</span><strong>{(bj?.balance ?? 0).toLocaleString()}</strong></div>
        </div>
        <div className="bj-table">
          {inHand || phase === 'done' ? (
            <>
              <div className="bj-row"><span className="bj-label">DEALER</span><div className="bj-cards">{(bj?.dealer ?? []).map((c, i) => <span className={`bj-card${c === '??' ? ' bj-card-hidden' : ''}`} key={`${c}-${i}`}>{cardLabel(c)}</span>)}</div></div>
              <div className="bj-row"><span className="bj-label">YOU{inHand ? ` · BET ${(bj?.bet ?? 0).toLocaleString()}` : ''}</span><div className="bj-cards">{(bj?.you ?? []).map((c, i) => <span className="bj-card" key={`${c}-${i}`}>{cardLabel(c)}</span>)}</div></div>
            </>
          ) : (
            <div className="bj-idle"><b>PLACE YOUR BET</b><span>The table is open. Deal when you're ready.</span></div>
          )}
          {phase === 'done' && bj?.result && (
            <div className={`bj-result bj-result-${bj.result.outcome}`}>
              {bj.result.outcome === 'natural' && <b>BLACKJACK! · 3:2</b>}
              {bj.result.outcome === 'win' && <b>YOU WIN</b>}
              {bj.result.outcome === 'lose' && <b>DEALER WINS</b>}
              {bj.result.outcome === 'push' && <b>PUSH</b>}
              <span>{bj.result.payout > 0 ? `Payout: ${bj.result.payout.toLocaleString()} $BLOCKVILLE` : 'Stake returned'}</span>
            </div>
          )}
          {lastReason && <div className="bj-reason">{reasonText[lastReason] ?? 'That action was rejected by the table.'}</div>}
        </div>
        {inHand ? (
          <div className="bj-actions">
            <button className="btn primary" onClick={() => act(blackjackHit)}>Hit</button>
            <button className="btn secondary" onClick={() => act(blackjackStand)}>Stand</button>
          </div>
        ) : (
          <div className="bj-actions">
            <div className="bj-chips">
              {[100, 500, 1000, 5000].map((chip) => (
                <button key={chip} className="btn secondary bj-chip" onClick={() => { setLastReason(null); setDraftBet(String(chip)); }}>{chip.toLocaleString()}</button>
              ))}
            </div>
            <input
              className="bj-bet-input"
              type="number"
              min={1}
              max={5000}
              value={draftBet}
              onChange={(e) => { setLastReason(null); setDraftBet(e.target.value); }}
              aria-label="Bet amount in BLOCKVILLE"
            />
            <button className="btn primary" disabled={betValue <= 0} onClick={() => act(() => blackjackBet(betValue))}>Deal</button>
          </div>
        )}
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
      <details className="terms-box">
        <summary className="settings-subhead" title="Terms &amp; Disclaimer">📜 Terms &amp; Disclaimer</summary>
        <p className="note-text"><b>No Financial Advice:</b> Blockville, $BLOCKVILLE and all related features are a game and entertainment product. Nothing in the game, on the website, or in any community channel is financial advice or a recommendation to buy, sell or hold any token.</p>
        <p className="note-text"><b>No Guarantee of Value:</b> $BLOCKVILLE is a volatile digital asset and may go to zero. Rewards, payouts and treasury distributions are not guaranteed: they depend on game activity, fee revenue and treasury holdings, may change at any time, and may stop entirely.</p>
        <p className="note-text"><b>Play at Your Own Risk:</b> Any purchase, upgrade or trade made in or around Blockville is at your own risk. To the maximum extent permitted by law, we accept no liability for any financial loss, lost profits or lost data arising from use of the game or participation in the token economy.</p>
        <p className="note-text"><b>Not an Investment:</b> $BLOCKVILLE and in-game assets are game items with no promise of profit or return. Participation does not make you an investor, partner or creditor.</p>
      </details>
      <div className="wp-entry">
        <h4 className="settings-subhead">📖 Whitepaper</h4>
        <p className="note-text">
          How the town works — the core loop, the in-game economy and the plot rules — grounded in
          the live systems this server runs.
        </p>
        <div className="bug-actions">
          <button
            className="btn primary sm"
            onClick={() => {
              // the document replaces Settings on screen; closing it returns to the town
              dispatch({ t: 'setWhitepaperOpen', open: true });
              dispatch({ t: 'setSettingsOpen', open: false });
            }}
          >
            Open the whitepaper
          </button>
        </div>
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
