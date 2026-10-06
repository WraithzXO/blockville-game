// ── BLOCKVILLE configuration ──────────────────────────────────────────────
// Every gameplay number lives here so it can be tuned without touching logic.

export type BuildingType = 'casino' | 'mine' | 'shop' | 'bank';

export const CONFIG = {
  // Staking
  stakeMin: 20_000,          // $BLOCKVILLE needed to become a Builder
  starterBlocks: 120,        // blocks granted on becoming a Builder

  // Building / construction
  blocksPerClick: 5,         // blocks placed per build action (click or E key)
  rewardMultCap: 3,          // max fee-share multiplier for heavily-invested buildings
  sizeScaleMax: 1.9,         // max visual size scale for custom builds

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
} as const;

// ── custom build helpers ───────────────────────────────────────────────────
// Reward share and visual size both scale with blocks invested vs the preset cost.
export const rewardMultFor = (invested: number, presetCost: number) =>
  Math.min(CONFIG.rewardMultCap, Math.max(1, invested / presetCost));

export const sizeScaleFor = (invested: number, presetCost: number) =>
  Math.min(CONFIG.sizeScaleMax, Math.max(1, 1 + (invested / presetCost - 1) * 0.45));

export const sizeLabelFor = (invested: number, presetCost: number) => {
  const r = invested / presetCost;
  if (r >= 2.5) return 'GRAND';
  if (r >= 1.6) return 'BIG';
  if (r > 1.05) return 'ROOMY';
  return 'STANDARD';
};

// Optional custom colour tints for "build it your way"
export const TINTS: { name: string; hex: number }[] = [
  { name: 'Classic', hex: 0 },   // 0 = use the building's signature colour
  { name: 'Cherry', hex: 0xc0392b },
  { name: 'Sky', hex: 0x4a90d9 },
  { name: 'Lime', hex: 0x5fae4e },
  { name: 'Royal', hex: 0x7d4fc1 },
  { name: 'Gold', hex: 0xd4a017 },
];

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

// Player spawn: just outside the store, facing the town
export const PLAYER_SPAWN = { x: 0, z: -13 };

// Interaction ranges (world units) for the walk-up system
export const INTERACT_RANGE = 11;     // plots / construction sites
export const STORE_RANGE = 13;        // Blockville Store

export const TOWN_STAGES: { min: number; label: string }[] = [
  { min: 0, label: 'Outpost' },
  { min: 1, label: 'Early Blockville' },
  { min: 3, label: 'Growing Blockville' },
  { min: 5, label: 'Large Blockville' },
];

export const stageFor = (built: number) =>
  [...TOWN_STAGES].reverse().find((s) => built >= s.min)!.label;
