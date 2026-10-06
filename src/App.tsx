import { useEffect, useState } from 'react';
import {
  BUILDING_DEFS,
  CONFIG,
  FACE_STYLES,
  HATS,
  RESIDENT_BUILDERS,
  SHIRT_COLORS,
  SKIN_TONES,
  STORE_ITEMS,
  TOTAL_PLOTS,
  plotAllowance,
  stageFor,
  type BuildingType,
  type PlayerLook,
} from './game/config';
import { GameProvider, useGame, useToastTimer, type Plot } from './game/state';
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

  // once you're a Builder the dock makes way for the game
  if (state.builder) return null;
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
          <div className="upgrade-info">Level {plot.level} · fee yield <b>×{mult}</b></div>
        </div>
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
  const locked = claimed >= plotAllowance(state.staked);
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
      <div className="cards four">
        {(Object.keys(BUILDING_DEFS) as BuildingType[]).map((t) => {
          const d = BUILDING_DEFS[t];
          const afford = state.blocks >= d.cost;
          return (
            <button
              key={t}
              className={`card ${afford ? '' : 'locked'}`}
              disabled={!afford}
              onClick={() => dispatch({ t: 'claim', plot: plot.id, type: t })}
            >
              <div className="card-icon">{d.icon}</div>
              <div className="card-name">{d.name}</div>
              <div className="card-blurb">{d.blurb}</div>
              <div className="card-cost">🧱 {d.cost} blocks · {d.cost} clicks</div>
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
      <div className="row-label">Skin</div>
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
      <div className="row-label">Shirt</div>
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
      <div className="row-label">Face</div>
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
      <div className="row-label">Hat</div>
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
      <div className="cards five">
        {STORE_ITEMS.map((item) => {
          const afford = state.balance >= item.price;
          const owned = item.kind === 'cosmetic' && state.unlockedHats.includes(item.cosmetic!);
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
              <div className="card-cost">{owned ? '✓ owned' : `💰 ${item.price.toLocaleString()} $BLOCKVILLE`}</div>
            </button>
          );
        })}
      </div>
      <div className="dock-foot">
        Balance: {state.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} $BLOCKVILLE
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
          Every ~45s, <b>{t.distributePct}%</b> of the Treasury is split across all Builders
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
  const nextPlot =
    plotAllowance(state.staked + amount) > plotAllowance(state.staked)
      ? plotAllowance(state.staked) + 1
      : null;
  return (
    <Modal icon="🔒" title="Stake more — unlock land" onClose={onClose}>
      <p className="lede">
        Each block of land (plot) requires <b>{CONFIG.plotStakeCost.toLocaleString()} $BLOCKVILLE</b> staked.
        You have <b>{plotAllowance(state.staked)}/{CONFIG.maxPlots}</b> unlocked with{' '}
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
                <span className="pill-value">{state.plots.filter((p) => p.owner === 'you').length}/{plotAllowance(state.staked)}</span>
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
            <button className="mbtn" onClick={() => dispatch({ t: 'setTreasuryOpen', open: true })} title="Treasury & fee distribution">
              🏦 <span>Treasury</span>
            </button>
            <button className="mbtn" onClick={() => dispatch({ t: 'setCustomiseOpen', open: true })} title="Customise your resident">
              🧍 <span>Character</span>
            </button>
            <button
              className="mbtn"
              onClick={() =>
                state.builder
                  ? dispatch({ t: 'setStakeMoreOpen', open: true })
                  : dispatch({ t: 'setStakeDockClosed', closed: false })
              }
              title={state.builder ? 'Stake more to unlock another block of land' : 'Open the Blockville Store to stake'}
            >
              🔒 <span>{state.builder ? 'Stake more' : 'Stake'}</span>
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

// ── activity feed ──────────────────────────────────────────────────────────
function Feed() {
  const { state } = useGame();
  return (
    <div className="feed panel">
      <div className="feed-title">TOWN ACTIVITY</div>
      {state.feed.length === 0 && <div className="empty">Quiet for now… build something!</div>}
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
  // any full-screen modal pauses walking; the claim dock stays walk-friendly
  const modalOpen =
    state.storeOpen ||
    state.marketOpen ||
    state.treasuryOpen ||
    state.customiseOpen ||
    state.stakeMoreOpen;
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
      <MarketplacePanel />
      <TreasuryPanel />
      <BuildHud />
      <CustomiseModal />
      {state.builder && <Feed />}
      <Toasts />
    </div>
  );
}

// ── E-to-interact prompt (the plot you're standing next to) ────────────────
function InteractPrompt({ modalOpen }: { modalOpen: boolean }) {
  const { state } = useGame();
  if (modalOpen || state.nearPlot === null) return null;
  const plot = state.plots.find((p) => p.id === state.nearPlot);
  if (!plot) return null;
  let label: string | null = null;
  if (plot.owner === 'other') label = 'Resident-owned plot';
  else if (plot.type && !plot.done) label = 'Build';
  else if (plot.type && plot.done && plot.owner === 'you') {
    const def = BUILDING_DEFS[plot.type];
    label = `Open ${def.name}`;
  } else if (!plot.type) label = state.builder ? 'Claim plot' : null;
  if (!label) return null;
  const interactive = label !== 'Resident-owned plot';
  return (
    <div className={`interact-prompt ${interactive ? '' : 'plain'}`}>
      {interactive && <kbd>E</kbd>} {interactive ? '' : '🔒 '}{label}
    </div>
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
