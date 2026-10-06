// ── BLOCKVILLE configuration ──────────────────────────────────────────────
// Every gameplay number lives here so it can be tuned without touching logic.

export type BuildingType = 'casino' | 'mine' | 'shop' | 'bank' | 'cafe' | 'arcade' | 'bakery' | 'park';

export const CONFIG = {
  // Staking
  stakeMin: 20_000,          // $BLOCKVILLE needed to become a Builder
  starterBlocks: 120,        // blocks granted on becoming a Builder

  // Land ("blocks"): up to 5 claimable plots, each requiring 20,000 staked
  plotStakeCost: 20_000,     // stake locked per plot ("block of land")
  maxPlots: 5,               // hard cap on claims per holder

  // Marketplace (demo simulation — NOT real trading)
  market: {
    listPriceMin: 4_000,     // residents list plots between these prices
    listPriceMax: 14_000,
    simListChance: 0.12,     // per tick: a resident lists one of their plots
    simBuyChance: 0.15,      // per tick: a buyer purchases a listing
    simClaimChance: 0.10,    // per tick: a resident claims a free plot
    tickMs: 8_000,           // simulation heartbeat
    maxOpenListings: 7,      // keep the board tidy
  },

  wave: 1,                   // current land wave

  // Fee rewards (demo placeholder — NOT real on-chain rewards)
  feeChance: 0.35,           // chance an NPC visit generates a fee share
  feeMin: 0.02,
  feeMax: 0.35,

  // ── Treasury & fee distribution (demo structure — wallet is a placeholder
  // until the backend rollout; no real token movements are simulated) ──
  treasury: {
    walletLabel: 'BVtre…5xKQ',   // placeholder display address
    pumpfunSharePct: 75,         // % of all PumpFun fees routed into the Treasury
    storeRoutePct: 100,          // % of every Store purchase routed into the Treasury
    distributePct: 20,           // % of Treasury balance paid out per distribution
    distributeEveryMs: 45_000,   // base interval between distributions (± jitter)
    // Simulated PumpFun fee drip, checked once per market heartbeat:
    pumpfunTick: { chance: 0.55, min: 6, max: 60 },
  },

  // NPC economy (visual only)
  npcIntervalMin: 2.5,       // seconds between NPC visits (randomised)
  npcIntervalMax: 6.0,
  baseNpcs: 4,               // idle wanderers with zero buildings
  npcPerBuilding: 1.2,       // population growth per active building
  maxNpcs: 12,               // hard cap — keep it light
  bubbleTimeMin: 1.5,        // seconds a chat bubble stays visible
  bubbleTimeMax: 3.0,

  // ── walking & interaction (third-person resident) ──
  walkSpeed: 7.5,            // units per second with WASD held
  interactRadius: 10.5,      // how close you must walk to claim / build on a plot
  // Walkable town area: covers every plot, the store and the fence ring.
  worldRect: { minX: -83, maxX: 83, minZ: -32, maxZ: 172 },
  // Decorative fence sits ~1.5 plots outside the outermost plots.
  fence: { minX: -85, maxX: 85, minZ: -34, maxZ: 174 },

  // Garden kit: buy in the Store, place on one of your completed plots.
  garden: { price: 1500, boost: 1.2 },

  // ── building upgrades (demo SOL — real wallet arrives with the backend) ──
  // Index 0 upgrades Level 1 → 2, etc. Level 4 is the max.
  upgrades: {
    solCosts: [0.1, 0.25, 0.5] as const,           // SOL per upgrade tier
    yieldMult: [1, 1.5, 2.25, 3.5] as const,       // fee yield multiplier per level
    maxLevel: 4,
  },
  demoSol: 2,                // demo SOL balance so upgrades are testable
} as const;

// ── character customisation ────────────────────────────────────────────────
export type HatType =
  | 'none' | 'cap' | 'beanie' | 'crown' | 'tophat'
  | 'party' | 'halo' | 'horns' | 'headphones';
export type GlassesType = 'none' | 'round' | 'shades' | 'visor';
export type FaceType = 'smile' | 'grin' | 'chill' | 'wow' | 'wink' | 'cool';
export type ShirtDesign = 'none' | 'blockville' | 'solana' | 'pumpfun' | 'diamond' | 'bolt';

export interface PlayerLook {
  skin: string;
  shirt: string;
  shirtDesign: ShirtDesign;
  hat: HatType;
  glasses: GlassesType;
  face: FaceType;
}

export const DEFAULT_LOOK: PlayerLook = {
  skin: '#f0c8a0',
  shirt: '#e0574f',
  shirtDesign: 'none',
  hat: 'none',
  glasses: 'none',
  face: 'smile',
};

export const SKIN_TONES = [
  '#ffdfc4', '#f5d5b5', '#f0c8a0', '#c98850',
  '#a0683f', '#8d5a3a', '#6b4226', '#4a2e1d',
];

export const SHIRT_COLORS = [
  { name: 'Red', hex: '#e0574f' },
  { name: 'Blue', hex: '#4f8fe0' },
  { name: 'Green', hex: '#53b56d' },
  { name: 'Gold', hex: '#c99a3c' },
  { name: 'Purple', hex: '#8e6fc1' },
  { name: 'Pink', hex: '#d97fa8' },
  { name: 'Teal', hex: '#5fb8b0' },
  { name: 'Navy', hex: '#35415c' },
  { name: 'Black', hex: '#2f3542' },
  { name: 'White', hex: '#f2f0ea' },
  { name: 'Orange', hex: '#ef8b3a' },
  { name: 'Crimson', hex: '#b03a48' },
  { name: 'Lime', hex: '#8fce4f' },
  { name: 'Sky', hex: '#7fc4ef' },
  { name: 'Brown', hex: '#8a6a3f' },
  { name: 'Charcoal', hex: '#555d6e' },
];

export const FACE_STYLES: { id: FaceType; label: string }[] = [
  { id: 'smile', label: '🙂 Smile' },
  { id: 'grin', label: '😁 Grin' },
  { id: 'chill', label: '😌 Chill' },
  { id: 'wow', label: '😮 Wow' },
  { id: 'wink', label: '😉 Wink' },
  { id: 'cool', label: '😎 Cool' },
];

export const HATS: { id: HatType; label: string; price: number }[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'cap', label: '🧢 Cap', price: 0 },
  { id: 'beanie', label: '🧶 Beanie', price: 0 },
  { id: 'tophat', label: '🎩 Top Hat', price: 750 },     // purchasable in the Store
  { id: 'crown', label: '👑 Crown', price: 2500 },       // purchasable in the Store
  { id: 'party', label: '🥳 Party Hat', price: 400 },    // purchasable in the Store
  { id: 'headphones', label: '🎧 Headphones', price: 900 },
  { id: 'horns', label: '😈 Mischief Horns', price: 1200 },
  { id: 'halo', label: '😇 Halo', price: 1500 },
];

export const GLASSES: { id: GlassesType; label: string; price: number }[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'round', label: '👀 Round Specs', price: 0 },
  { id: 'shades', label: '🕶️ Shades', price: 900 },      // purchasable in the Store
  { id: 'visor', label: '🥽 Gold Visor', price: 1500 },  // purchasable in the Store
];

export const SHIRT_DESIGNS: { id: ShirtDesign; label: string }[] = [
  { id: 'none', label: 'Plain' },
  { id: 'blockville', label: '🧱 $BLOCKVILLE' },
  { id: 'solana', label: '◎ Solana' },
  { id: 'pumpfun', label: '🐸 Pump.fun' },
  { id: 'diamond', label: '💎 Diamond Hands' },
  { id: 'bolt', label: '⚡ Degen Bolt' },
];

// ── store items (purchasable with demo $BLOCKVILLE) ───────────────────────
export interface StoreItem {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  price: number;
  kind: 'blocks' | 'cosmetic' | 'garden';
  blocks?: number;
  cosmetic?: HatType;
  glasses?: GlassesType;
}

export const STORE_ITEMS: StoreItem[] = [
  { id: 'pallet', icon: '🧱', name: 'Brick Pallet', blurb: '+10 building blocks, ready to place', price: 250, kind: 'blocks', blocks: 10 },
  { id: 'crate', icon: '📦', name: 'Block Crate', blurb: '+25 building blocks at a fair price', price: 500, kind: 'blocks', blocks: 25 },
  { id: 'bulk', icon: '🚚', name: 'Bulk Delivery', blurb: '+60 building blocks, best value', price: 1000, kind: 'blocks', blocks: 60 },
  { id: 'tophat', icon: '🎩', name: 'Top Hat', blurb: 'Distinguished headwear for your resident', price: 750, kind: 'cosmetic', cosmetic: 'tophat' },
  { id: 'crown', icon: '👑', name: 'Golden Crown', blurb: 'For true Blockville royalty', price: 2500, kind: 'cosmetic', cosmetic: 'crown' },
  { id: 'party', icon: '🥳', name: 'Party Hat', blurb: 'Celebrate in style at any building opening', price: 400, kind: 'cosmetic', cosmetic: 'party' },
  { id: 'headphones', icon: '🎧', name: 'Headphones', blurb: 'Crisp beats for strolling the streets', price: 900, kind: 'cosmetic', cosmetic: 'headphones' },
  { id: 'horns', icon: '😈', name: 'Mischief Horns', blurb: 'A little chaos looks good on you', price: 1200, kind: 'cosmetic', cosmetic: 'horns' },
  { id: 'halo', icon: '😇', name: 'Golden Halo', blurb: 'Glow gently above the town', price: 1500, kind: 'cosmetic', cosmetic: 'halo' },
  { id: 'shades', icon: '🕶️', name: 'Shades', blurb: 'Cool residents never squint', price: 900, kind: 'cosmetic', glasses: 'shades' },
  { id: 'visor', icon: '🥽', name: 'Gold Visor', blurb: 'Futuristic eyewear, Blockville edition', price: 1500, kind: 'cosmetic', glasses: 'visor' },
  {
    id: 'garden',
    icon: '🌷',
    name: 'Garden Kit',
    blurb: `Place at one of your buildings — ×${CONFIG.garden.boost} fee yield from that plot`,
    price: CONFIG.garden.price,
    kind: 'garden',
  },
];

export const plotAllowance = (staked: number) =>
  Math.min(CONFIG.maxPlots, Math.floor(staked / CONFIG.plotStakeCost));

export interface BuildingDef {
  name: string;
  icon: string;
  blurb: string;
  cost: number;              // blocks needed to construct (1 click = 1 block)
  tint: string;              // UI accent
  activities: string[];      // chat bubble templates. {n} = random number
}

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  casino: {
    name: 'Casino',
    icon: '🎰',
    blurb: 'Gamblers spin $BLOCKVILLE around the clock.',
    cost: 60,
    tint: '#e0b64a',
    activities: [
      '🎰 Spinning {n} $BLOCKVILLE',
      '🎰 Spinning {n} $BLOCKVILLE',
      '🎉 Won {n} $BLOCKVILLE',
      '😵 Lost {n} $BLOCKVILLE',
    ],
  },
  mine: {
    name: 'Diamond Mine',
    icon: '💎',
    blurb: 'Miners pull blocks and gems out of the ground.',
    cost: 45,
    tint: '#5ad1e6',
    activities: [
      '⛏️ Mining Diamonds',
      '⛏️ Mining Diamonds',
      '🛒 Buying Pickaxe',
      '💎 Found {n} Diamonds',
    ],
  },
  shop: {
    name: 'Shop',
    icon: '🏪',
    blurb: 'Residents stock up on blocks and materials.',
    cost: 30,
    tint: '#e8874a',
    activities: [
      '🛒 Buying {n} Blocks',
      '🛒 Buying Materials',
      '🧱 Restocking Bricks',
    ],
  },
  bank: {
    name: 'Bank',
    icon: '🏦',
    blurb: 'Deposits, withdrawals and staking services.',
    cost: 75,
    tint: '#8fd18f',
    activities: [
      '🏦 Depositing {n} $BLOCKVILLE',
      '🏦 Withdrawing {n} $BLOCKVILLE',
      '🏦 Opening a Vault',
    ],
  },
  cafe: {
    name: 'Cafe',
    icon: '☕',
    blurb: 'Residents stop by for a warm drink and a chat.',
    cost: 35,
    tint: '#b07b4f',
    activities: [
      '☕ Ordering a Latte',
      '☕ Ordering a Coffee',
      '🍪 Buying a Cookie',
      '💬 Chatting with Friends',
    ],
  },
  arcade: {
    name: 'Arcade',
    icon: '🕹️',
    blurb: 'High scores, bright lights and happy gamers.',
    cost: 55,
    tint: '#b455e0',
    activities: [
      '🕹️ Playing {n} Credits',
      '🏆 New High Score!',
      '🕹️ Challenging a Friend',
    ],
  },
  bakery: {
    name: 'Bakery',
    icon: '🍞',
    blurb: 'Fresh bread and sweet rolls every morning.',
    cost: 40,
    tint: '#d9a441',
    activities: [
      '🍞 Buying Fresh Bread',
      '🥐 Buying a Croissant',
      '🎂 Ordering a Cake',
    ],
  },
  park: {
    name: 'Town Park',
    icon: '🌳',
    blurb: 'A green spot with a fountain everyone loves.',
    cost: 25,
    tint: '#63c46e',
    activities: [
      '🦆 Feeding the Ducks',
      '🚶 Taking a Stroll',
      '🧺 Having a Picnic',
      '⛲ Tossing a Coin',
    ],
  },
};

export const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min + 1));

export const pickActivity = (type: BuildingType): string => {
  const tpl = BUILDING_DEFS[type].activities;
  const t = tpl[Math.floor(Math.random() * tpl.length)];
  return t.replace('{n}', String(randInt(3, 250)));
};

// ── World layout ───────────────────────────────────────────────────────────
// An organised town grid along the main street, like the start of a city:
// two rows front the main road, a back row sits across a second street,
// and Wave-1 land extends south in further blocks between cross streets.
// Wave 1 = 100 plots total. Once all are claimed, the only way in is the
// marketplace until the next wave of land is added.
export interface PlotDef {
  id: number;
  x: number;
  z: number;
  side: 'north' | 'south';
}

const CORE: PlotDef[] = [
  // main-street north row (claimable)
  { id: 0, x: -26, z: -10, side: 'north' },
  { id: 1, x: -13, z: -10, side: 'north' },
  { id: 2, x: 13, z: -10, side: 'north' },
  { id: 3, x: 26, z: -10, side: 'north' },
  // main-street south row
  { id: 4, x: -26, z: 10, side: 'south' },
  { id: 5, x: -13, z: 10, side: 'south' },
  { id: 6, x: 13, z: 10, side: 'south' },
  { id: 7, x: 26, z: 10, side: 'south' },
  // back row across the second street
  { id: 8, x: -26, z: 26, side: 'south' },
  { id: 9, x: -13, z: 26, side: 'south' },
  { id: 10, x: 13, z: 26, side: 'south' },
  { id: 11, x: 26, z: 26, side: 'south' },
];

// Wave-1 expansion: 8 further rows of 11 plots between cross streets.
const GRID_ROWS: { z: number; side: 'north' | 'south' }[] = [
  { z: 42, side: 'north' }, { z: 58, side: 'south' },
  { z: 74, side: 'north' }, { z: 90, side: 'south' },
  { z: 106, side: 'north' }, { z: 122, side: 'south' },
  { z: 138, side: 'north' }, { z: 154, side: 'south' },
];
const GRID_COLS = [-65, -52, -39, -26, -13, 0, 13, 26, 39, 52, 65];
const GRID: PlotDef[] = GRID_ROWS.flatMap((r, ri) =>
  GRID_COLS.map((x, ci) => ({
    id: CORE.length + ri * GRID_COLS.length + ci,
    x,
    z: r.z,
    side: r.side,
  })),
);

export const PLOT_POSITIONS: PlotDef[] = [...CORE, ...GRID];
export const TOTAL_PLOTS = PLOT_POSITIONS.length;   // 100 in Wave 1

// Plots already owned by residents when the demo starts — the town is not
// empty, and these seed the marketplace with real second-hand supply.
export const COMMUNITY_PLOTS: { id: number; type: BuildingType }[] = [
  { id: 17, type: 'shop' },
  { id: 28, type: 'casino' },
  { id: 39, type: 'cafe' },
  { id: 50, type: 'mine' },
  { id: 61, type: 'arcade' },
  { id: 72, type: 'bakery' },
  { id: 83, type: 'bank' },
  { id: 94, type: 'park' },
];

// Listings live at the start (all on resident-owned plots).
export const START_LISTINGS: { plot: number; price: number }[] = [
  { plot: 28, price: 9_800 },
  { plot: 61, price: 6_500 },
  { plot: 94, price: 4_200 },
];

export const STORE_POS = { x: 0, z: -22 };

// Resident Builders used for proportional fee distribution in the demo —
// the player's share of a distribution is their stake / total stake.
export const RESIDENT_BUILDERS: { name: string; stake: number }[] = [
  { name: 'Nova', stake: 40_000 },
  { name: 'Rex', stake: 25_000 },
  { name: 'Momo', stake: 60_000 },
  { name: 'Vega', stake: 20_000 },
  { name: 'Juno', stake: 35_000 },
];

export const TOWN_STAGES: { min: number; label: string }[] = [
  { min: 0, label: 'Outpost' },
  { min: 1, label: 'Early Blockville' },
  { min: 2, label: 'Growing Blockville' },
  { min: 4, label: 'Large Blockville' },
];

export const stageFor = (built: number) =>
  [...TOWN_STAGES].reverse().find((s) => built >= s.min)!.label;
