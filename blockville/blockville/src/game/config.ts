// ── BLOCKVILLE configuration ──────────────────────────────────────────────
// Every gameplay number lives here so it can be tuned without touching logic.

export type BuildingType = 'house' | 'casino' | 'mine' | 'shop' | 'bank' | 'cafe' | 'arcade' | 'bakery' | 'park';

export const CONFIG = {
  // Staking
  stakeMin: 20_000,          // $BLOCKVILLE needed to become a Builder
  stakeReward: {
    blocksPerStake: 75,
    stakeUnit: 20_000,
  },

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
  worldRect: { minX: -133, maxX: 133, minZ: -82, maxZ: 240 },
  // Decorative fence sits ~1.5 plots outside the outermost plots.
  fence: { minX: -135, maxX: 135, minZ: -84, maxZ: 242 },

  // Garden kit: buy in the Store, place on one of your completed plots.
  garden: { price: 1500, boost: 1.2 },

  // ── useful Store items (permanent personal perks, all demo-side) ──
  items: {
    bootsSpeed: 1.3,        // Speed Boots walk multiplier
    toolkitPerClick: 2,     // Builder's Toolkit: blocks placed per build click
    permitExtraPlots: 1,    // Claim Permit: extra plots beyond the stake allowance
  },

  // ── building upgrades (demo SOL — real wallet arrives with the backend) ──
  // Index 0 upgrades Level 1 → 2, etc. Level 4 is the max.
  upgrades: {
    solCosts: [0.1, 0.25, 0.5] as const,           // SOL per upgrade tier
    yieldMult: [1, 1.5, 2.25, 3.5] as const,       // fee yield multiplier per level
    maxLevel: 4,
  },
  demoSol: 2,                // demo SOL balance so upgrades are testable

  // ── town life: NPC greetings + small interactive objects ──
  town: {
    greetChance: 0.22,          // per-second chance a nearby NPC greets you
    greetRange: 6,              // how close the resident must be
    greetNpcCooldown: 25,       // seconds before the same NPC greets again
    greetGlobalCooldown: 6,     // town-wide spacing so greetings feel special
    greetTimeSec: 2.2,
    // 15-minute cooldowns — a mailbox or bin is a once-in-a-while stop, not a farm
    mailbox: { rewardChance: 0.18, rewardMin: 4, rewardMax: 16, cooldownSec: 900 },
    trash: { rewardChance: 0.1, rewardMin: 3, rewardMax: 10, cooldownSec: 900 },
    fountainCooldownSec: 4,
    interactObjRadius: 3.2,     // how close you must walk to small objects
  },

  // Town noticeboard (read in-world at the plaza). Update these strings
  // whenever Blockville ships something new.
  notice: {
    recent: [
      'Wave 1 land is live — the town has grown',
      'Treasury fee distributions every ~45s',
      'Garden kits in the Store — ×1.2 yield boost',
      'The Golden Crown remains unbought…',
      'Speed Boots & Builder’s Toolkit restocked',
    ],
    upcoming: [
      'Wave 2 land release',
      'Real wallet staking (demo staking until then)',
      'New buildings: Cinema, Gym',
      'Seasonal town events',
      'Builder leaderboards',
    ],
  },

  streetNames: ['Blockville Avenue', 'Market Street', 'Builder’s Road', 'Coin Corner'],
} as const;

/** Shared proportional staking formula used by the reducer, UI, and tests. */
export const stakingRewardFor = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return (amount * CONFIG.stakeReward.blocksPerStake) / CONFIG.stakeReward.stakeUnit;
};

// ── character customisation ────────────────────────────────────────────────
export type HatType =
  | 'none' | 'cap' | 'beanie' | 'crown' | 'tophat'
  | 'party' | 'halo' | 'horns' | 'headphones' | 'cowboy' | 'wizard';
export type GlassesType = 'none' | 'round' | 'shades' | 'visor';
export type FaceType = 'smile' | 'grin' | 'chill' | 'wow' | 'wink' | 'cool';
export type ShirtDesign =
  | 'none' | 'blockville' | 'solana' | 'pumpfun' | 'diamond' | 'bolt'
  | 'moon' | 'whale' | 'ape' | 'brick' | 'sunset';

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
  { id: 'crown', label: '👑 Golden Crown', price: 100_000 },  // the 100K joke flex
  { id: 'party', label: '🥳 Party Hat', price: 400 },    // purchasable in the Store
  { id: 'headphones', label: '🎧 Headphones', price: 900 },
  { id: 'horns', label: '😈 Mischief Horns', price: 1200 },
  { id: 'halo', label: '😇 Halo', price: 1500 },
  { id: 'cowboy', label: '🤠 Cowboy Hat', price: 2200 },  // purchasable in the Store
  { id: 'wizard', label: '🧙 Wizard Hat', price: 3000 },  // purchasable in the Store
];

export const GLASSES: { id: GlassesType; label: string; price: number }[] = [
  { id: 'none', label: 'None', price: 0 },
  { id: 'round', label: '👀 Round Specs', price: 0 },
  { id: 'shades', label: '🕶️ Shades', price: 900 },      // purchasable in the Store
  { id: 'visor', label: '🥽 Gold Visor', price: 1500 },  // purchasable in the Store
];

export const SHIRT_DESIGNS: { id: ShirtDesign; label: string; price: number }[] = [
  { id: 'none', label: 'Plain', price: 0 },
  { id: 'blockville', label: '🧱 $BLOCKVILLE', price: 0 },
  { id: 'solana', label: '◎ Solana', price: 0 },
  { id: 'pumpfun', label: '🐸 Pump.fun', price: 0 },
  { id: 'diamond', label: '💎 Diamond Hands', price: 0 },
  { id: 'bolt', label: '⚡ Degen Bolt', price: 0 },
  { id: 'moon', label: '🌕 To The Moon', price: 1200 },   // purchasable in the Store
  { id: 'whale', label: '🐋 Whale Mode', price: 1800 },   // purchasable in the Store
  { id: 'ape', label: '🦍 Ape Together', price: 1800 },   // purchasable in the Store
];

// ── store items (purchasable with demo $BLOCKVILLE) ───────────────────────
export type TownDecorType = 'bench' | 'lamp' | 'planter' | 'mailbox' | 'statue' | 'fence';

export interface StoreItem {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  price: number;
  kind: 'useful' | 'cosmetic' | 'garden';
  useful?: 'boots' | 'toolkit' | 'permit';
  cosmetic?: HatType;
  glasses?: GlassesType;
  design?: ShirtDesign;
  townDecor?: TownDecorType;
}

export const STORE_ITEMS: StoreItem[] = [
  // useful — permanent perks that change how you play
  { id: 'boots', icon: '🥾', name: 'Speed Boots', blurb: `Stride ${Math.round((CONFIG.items.bootsSpeed - 1) * 100)}% faster around Blockville`, price: 2500, kind: 'useful', useful: 'boots' },
  { id: 'toolkit', icon: '🧰', name: "Builder's Toolkit", blurb: `Every build click places ${CONFIG.items.toolkitPerClick} blocks instead of one`, price: 3500, kind: 'useful', useful: 'toolkit' },
  { id: 'permit', icon: '📜', name: 'Claim Permit', blurb: `Unlock ${CONFIG.items.permitExtraPlots} extra plot claim beyond your stake allowance`, price: 150_000, kind: 'useful', useful: 'permit' },
  // special cosmetics
  { id: 'tophat', icon: '🎩', name: 'Top Hat', blurb: 'Distinguished headwear for your resident', price: 750, kind: 'cosmetic', cosmetic: 'tophat' },
  { id: 'crown', icon: '👑', name: 'Golden Crown', blurb: 'It does absolutely nothing. It just costs 100,000.', price: 100_000, kind: 'cosmetic', cosmetic: 'crown' },
  { id: 'party', icon: '🥳', name: 'Party Hat', blurb: 'Celebrate in style at any building opening', price: 400, kind: 'cosmetic', cosmetic: 'party' },
  { id: 'headphones', icon: '🎧', name: 'Headphones', blurb: 'Crisp beats for strolling the streets', price: 900, kind: 'cosmetic', cosmetic: 'headphones' },
  { id: 'horns', icon: '😈', name: 'Mischief Horns', blurb: 'A little chaos looks good on you', price: 1200, kind: 'cosmetic', cosmetic: 'horns' },
  { id: 'halo', icon: '😇', name: 'Golden Halo', blurb: 'Glow gently above the town', price: 1500, kind: 'cosmetic', cosmetic: 'halo' },
  { id: 'cowboy', icon: '🤠', name: 'Cowboy Hat', blurb: 'Yeehaw — the frontier of decentralised land', price: 2200, kind: 'cosmetic', cosmetic: 'cowboy' },
  { id: 'wizard', icon: '🧙', name: 'Wizard Hat', blurb: 'Cast spells (still just walking around)', price: 3000, kind: 'cosmetic', cosmetic: 'wizard' },
  { id: 'shades', icon: '🕶️', name: 'Shades', blurb: 'Cool residents never squint', price: 900, kind: 'cosmetic', glasses: 'shades' },
  { id: 'visor', icon: '🥽', name: 'Gold Visor', blurb: 'Futuristic eyewear, Blockville edition', price: 1500, kind: 'cosmetic', glasses: 'visor' },
  { id: 'moonshirt', icon: '🌕', name: 'To The Moon Tee', blurb: 'Limited print — for the vertically inclined', price: 1200, kind: 'cosmetic', design: 'moon' },
  { id: 'whaleshirt', icon: '🐋', name: 'Whale Mode Tee', blurb: 'Big holder energy, printed on cotton', price: 1800, kind: 'cosmetic', design: 'whale' },
  { id: 'apeshirt', icon: '🦍', name: 'Ape Together Tee', blurb: 'Together strong. Individually also strong.', price: 1800, kind: 'cosmetic', design: 'ape' },
  { id: 'brickshirt', icon: '🧱', name: 'Brick Builder Jacket', blurb: 'A bold brick-pattern jacket for builders.', price: 2100, kind: 'cosmetic', design: 'brick' },
  { id: 'sunsetshirt', icon: '🌇', name: 'Sunset Jacket', blurb: 'Warm sunset colours for evening walks.', price: 2400, kind: 'cosmetic', design: 'sunset' },
  { id: 'bench', icon: '🪑', name: 'Town Bench', blurb: 'A sturdy seat for your plot or town corner.', price: 850, kind: 'garden', townDecor: 'bench' },
  { id: 'lamp', icon: '🏮', name: 'Street Lamp', blurb: 'A warm little lamp that makes the evening feel lived-in.', price: 1250, kind: 'garden', townDecor: 'lamp' },
  { id: 'planter', icon: '🪴', name: 'Planter Box', blurb: 'A compact planter for a splash of green.', price: 650, kind: 'garden', townDecor: 'planter' },
  { id: 'mailbox', icon: '📫', name: 'Mailbox', blurb: 'A cheerful mailbox for your plot entrance.', price: 700, kind: 'garden', townDecor: 'mailbox' },
  { id: 'statue', icon: '🗿', name: 'Builder Statue', blurb: 'A blocky landmark with real town character.', price: 2200, kind: 'garden', townDecor: 'statue' },
  { id: 'fence', icon: '🚧', name: 'Yard Fence', blurb: 'A white picket fence around your yard, with an open front gate.', price: 500, kind: 'garden', townDecor: 'fence' },
  {
    id: 'garden',
    icon: '🌷',
    name: 'Garden Kit',
    blurb: `Place at one of your buildings — ×${CONFIG.garden.boost} fee yield from that plot`,
    price: CONFIG.garden.price,
    kind: 'garden',
  },
];

export const plotAllowance = (staked: number, extraPlots = 0) =>
  Math.min(CONFIG.maxPlots, Math.floor(staked / CONFIG.plotStakeCost) + extraPlots);

export interface BuildingDef {
  name: string;
  icon: string;
  blurb: string;
  cost: number;              // blocks needed to construct (1 click = 1 block)
  tint: string;              // UI accent
  activities: string[];      // chat bubble templates. {n} = random number
}

export type FurnitureCategory = 'Beds' | 'Chairs' | 'Tables' | 'Rugs' | 'Paintings' | 'Decorations';
export interface FurnitureDef { id: string; name: string; category: FurnitureCategory; icon: string; price: number; color: string; blurb: string; }
export const FURNITURE_DEFS: FurnitureDef[] = [
  { id: 'oak-bed', name: 'Oak Bed', category: 'Beds', icon: '🛏️', price: 3200, color: '#9b6841', blurb: 'A sturdy warm-wood bed.' },
  { id: 'sky-bed', name: 'Skyline Bed', category: 'Beds', icon: '🛌', price: 5200, color: '#5d83b8', blurb: 'A bright blue statement bed.' },
  { id: 'block-chair', name: 'Block Chair', category: 'Chairs', icon: '🪑', price: 900, color: '#e0a54b', blurb: 'A cheerful chair for visitors.' },
  { id: 'velvet-chair', name: 'Velvet Chair', category: 'Chairs', icon: '💺', price: 1500, color: '#9b5a89', blurb: 'Soft and a little fancy.' },
  { id: 'worktable', name: 'Builder Table', category: 'Tables', icon: '🪵', price: 1800, color: '#8a633d', blurb: 'A practical table for projects.' },
  { id: 'neon-table', name: 'Neon Table', category: 'Tables', icon: '🔆', price: 2600, color: '#3c9fa4', blurb: 'A glowing town-night centrepiece.' },
  { id: 'sun-rug', name: 'Sun Rug', category: 'Rugs', icon: '🟡', price: 1100, color: '#d6a73d', blurb: 'Warm colour for the floor.' },
  { id: 'berry-rug', name: 'Berry Rug', category: 'Rugs', icon: '🟣', price: 1300, color: '#8c507c', blurb: 'A rich patterned rug.' },
  { id: 'town-painting', name: 'Town Painting', category: 'Paintings', icon: '🖼️', price: 1400, color: '#78a8b8', blurb: 'A little piece of Blockville.' },
  { id: 'sunset-painting', name: 'Sunset Painting', category: 'Paintings', icon: '🌅', price: 1900, color: '#db7d4c', blurb: 'The town at golden hour.' },
  { id: 'plant', name: 'Potted Plant', category: 'Decorations', icon: '🪴', price: 700, color: '#5b9c58', blurb: 'A little life for a corner.' },
  { id: 'trophy', name: 'Builder Trophy', category: 'Decorations', icon: '🏆', price: 2400, color: '#d3aa3e', blurb: 'Show off your best build.' },
];

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  house: {
    name: 'House', icon: '🏠', blurb: 'Your own welcoming Blockville home.', cost: 48, tint: '#d77b58',
    activities: ['🏠 Touring a resident home', '🛋️ Making the house feel cosy'],
  },
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

// Wave-1 expansion: 9 further rows of 11 plots between cross streets.
// Spacing was widened (15 x 18 per plot) so every plot has a real front
// yard and the buildings keep clear of the roads.
const GRID_ROWS: { z: number; side: 'north' | 'south' }[] = [
  { z: 45, side: 'south' }, { z: 63, side: 'north' },
  { z: 81, side: 'south' }, { z: 99, side: 'north' },
  { z: 117, side: 'south' }, { z: 135, side: 'north' },
  { z: 153, side: 'south' }, { z: 171, side: 'north' },
  { z: 189, side: 'south' },
];
const GRID_COLS = [-75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75];
// World expansion: three more plot columns east and west of the original grid,
// plus a north block (two rows) and a south block (two rows) of new land.
const EXT_COLS = [-120, -105, -90, 90, 105, 120];
const ALL_COLS = [...EXT_COLS.filter((x) => x < 0), ...GRID_COLS, ...EXT_COLS.filter((x) => x > 0)];
const GRID: PlotDef[] = GRID_ROWS.flatMap((r, ri) =>
  GRID_COLS.map((x, ci) => ({
    id: CORE.length + ri * GRID_COLS.length + ci,
    x,
    z: r.z,
    side: r.side,
  })),
);

// Appended after every original plot so existing plot ids (and ownership) never shift.
const EXT_ROWS: { z: number; side: 'north' | 'south' }[] = [
  { z: -45, side: 'north' }, { z: -63, side: 'south' }, { z: 207, side: 'north' }, { z: 225, side: 'south' },
];
const EXPANSION: PlotDef[] = [];
{
  let id = CORE.length + GRID.length;
  const push = (x: number, z: number, side: 'north' | 'south') => EXPANSION.push({ id: id++, x, z, side });
  for (const r of EXT_ROWS) for (const x of ALL_COLS) push(x, r.z, r.side);
  for (const r of GRID_ROWS) for (const x of EXT_COLS) push(x, r.z, r.side);
  for (const z of [-10, 10, 26]) for (const x of EXT_COLS) push(x, z, z < 0 ? 'north' : 'south');
}

export const PLOT_POSITIONS: PlotDef[] = [...CORE, ...GRID, ...EXPANSION];
export const TOTAL_PLOTS = PLOT_POSITIONS.length;   // 111 after the spacing wave

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
