// ── BLOCKVILLE configuration ──────────────────────────────────────────────
// Every gameplay number lives here so it can be tuned without touching logic.

export type BuildingType = 'casino' | 'mine' | 'shop' | 'bank';

export const CONFIG = {
  // Staking
  stakeMin: 20_000,          // $BLOCKVILLE needed to become a Builder
  blocksPer20k: 120,         // blocks granted per 20,000 staked — stake more, build more

  // Land ("blocks"): up to 5 claimable plots, each requiring 20,000 staked
  plotStakeCost: 20_000,     // stake locked per plot ("block of land")
  maxPlots: 5,               // hard cap on claims per holder

  // Fee rewards (demo placeholder — NOT real on-chain rewards)
  feeChance: 0.35,           // chance an NPC visit generates a fee share
  feeMin: 0.02,
  feeMax: 0.35,

  // NPC economy (visual only)
  npcIntervalMin: 2.5,       // seconds between NPC visits (randomised)
  npcIntervalMax: 6.0,
  baseNpcs: 4,               // idle wanderers with zero buildings
  npcPerBuilding: 1.2,       // population growth per active building
  maxNpcs: 12,               // hard cap — keep it light
  bubbleTimeMin: 1.5,        // seconds a chat bubble stays visible
  bubbleTimeMax: 3.0,

  // Building upgrades (foundation for progression)
  maxLevel: 3,               // every building can reach level 3
  upgradeCostMult: 1.5,      // upgrading costs 1.5x the base cost, compounding per level
  feeBoostPerLevel: 0.5,     // each level adds +50% to your share of that building's fees

  // Player character
  playerSpeed: 9,            // world units per second while walking
  interactRange: 11,         // how close you must be to interact with a plot/building
  storeRange: 10,            // how close you must be to use the Blockville Store
} as const;

// total blocks granted for a given stake (initial stake and top-ups alike)
export const blocksForStake = (staked: number) =>
  Math.floor(staked / CONFIG.plotStakeCost) * CONFIG.blocksPer20k;

// cost in blocks to take a building from `level` to `level + 1`
// (level 1→2 costs 1.5x the base build, level 2→3 costs 2.25x)
export const upgradeCost = (type: BuildingType, level: number) =>
  Math.round(BUILDING_DEFS[type].cost * Math.pow(CONFIG.upgradeCostMult, level));

// fee-share multiplier for a building at a given level (level 1 = 1.0x)
export const feeMultFor = (level: number) =>
  1 + (level - 1) * CONFIG.feeBoostPerLevel;

// ── character customisation ────────────────────────────────────────────────
export type HatType = 'none' | 'cap' | 'beanie' | 'crown' | 'tophat';
export type FaceType = 'smile' | 'grin' | 'chill' | 'wow';

export interface PlayerLook {
  skin: string;
  shirt: string;
  hat: HatType;
  face: FaceType;
}

export const DEFAULT_LOOK: PlayerLook = { skin: '#f0c8a0', shirt: '#e0574f', hat: 'none', face: 'smile' };

export const SKIN_TONES = ['#f5d5b5', '#f0c8a0', '#c98850', '#8d5a3a', '#6b4226'];

export const SHIRT_COLORS = [
  { name: 'Red', hex: '#e0574f' },
  { name: 'Blue', hex: '#4f8fe0' },
  { name: 'Green', hex: '#53b56d' },
  { name: 'Gold', hex: '#c99a3c' },
  { name: 'Purple', hex: '#8e6fc1' },
  { name: 'Pink', hex: '#d97fa8' },
  { name: 'Teal', hex: '#5fb8b0' },
  { name: 'Navy', hex: '#35415c' },
];

export const FACE_STYLES: { id: FaceType; label: string }[] = [
  { id: 'smile', label: '🙂 Smile' },
  { id: 'grin', label: '😁 Grin' },
  { id: 'chill', label: '😌 Chill' },
  { id: 'wow', label: '😮 Wow' },
];

export const HATS: { id: HatType; label: string; price: number }[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'cap', label: '🧢 Cap', price: 0 },
  { id: 'beanie', label: '🧶 Beanie', price: 0 },
  { id: 'tophat', label: '🎩 Top Hat', price: 750 },     // purchasable in the Store
  { id: 'crown', label: '👑 Crown', price: 2500 },       // purchasable in the Store
];

// ── store items (purchasable with demo $BLOCKVILLE) ───────────────────────
export interface StoreItem {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  price: number;
  kind: 'blocks' | 'cosmetic';
  blocks?: number;
  cosmetic?: HatType;
}

export const STORE_ITEMS: StoreItem[] = [
  { id: 'pallet', icon: '🧱', name: 'Brick Pallet', blurb: '+10 building blocks, ready to place', price: 250, kind: 'blocks', blocks: 10 },
  { id: 'crate', icon: '📦', name: 'Block Crate', blurb: '+25 building blocks at a fair price', price: 500, kind: 'blocks', blocks: 25 },
  { id: 'bulk', icon: '🚚', name: 'Bulk Delivery', blurb: '+60 building blocks, best value', price: 1000, kind: 'blocks', blocks: 60 },
  { id: 'tophat', icon: '🎩', name: 'Top Hat', blurb: 'Distinguished headwear for your resident', price: 750, kind: 'cosmetic', cosmetic: 'tophat' },
  { id: 'crown', icon: '👑', name: 'Golden Crown', blurb: 'For true Blockville royalty', price: 2500, kind: 'cosmetic', cosmetic: 'crown' },
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
};

export const randInt = (min: number, max: number) =>
  Math.floor(min + Math.random() * (max - min + 1));

export const pickActivity = (type: BuildingType): string => {
  const tpl = BUILDING_DEFS[type].activities;
  const t = tpl[Math.floor(Math.random() * tpl.length)];
  return t.replace('{n}', String(randInt(3, 250)));
};

// ── World layout ───────────────────────────────────────────────────────────
// 8 plots around a crossroad. The starter Blockville Store anchors the north.
export interface PlotDef { id: number; x: number; z: number; side: 'north' | 'south' }

export const PLOT_POSITIONS: PlotDef[] = [
  { id: 0, x: -24, z: -10, side: 'north' },
  { id: 1, x: -8, z: -10, side: 'north' },
  { id: 2, x: 8, z: -10, side: 'north' },
  { id: 3, x: 24, z: -10, side: 'north' },
  { id: 4, x: -24, z: 10, side: 'south' },
  { id: 5, x: -8, z: 10, side: 'south' },
  { id: 6, x: 8, z: 10, side: 'south' },
  { id: 7, x: 24, z: 10, side: 'south' },
];

export const STORE_POS = { x: 0, z: -22 };

export const TOWN_STAGES: { min: number; label: string }[] = [
  { min: 0, label: 'Outpost' },
  { min: 1, label: 'Early Blockville' },
  { min: 3, label: 'Growing Blockville' },
  { min: 5, label: 'Large Blockville' },
];

export const stageFor = (built: number) =>
  [...TOWN_STAGES].reverse().find((s) => built >= s.min)!.label;
