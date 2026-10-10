// Analytic terrain shared by the hills mesh and by vegetation placement, so
// trees, bushes and rocks always sit on the real ground height (never inside it).
import { CONFIG } from '../game/config';

export const TOWN_CENTER_Z = 70;

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ihash = (ix: number, iz: number) => {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
export const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function vnoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = ihash(ix, iz), b = ihash(ix + 1, iz), c = ihash(ix, iz + 1), d = ihash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 7.3, z * 2.1 - 3.1) * 0.3 + vnoise(x * 4.3 - 1.7, z * 4.3 + 5.9) * 0.15;
}

/** Distance outside the fence rectangle (0 inside). */
export function fenceDist(x: number, z: number) {
  const f = CONFIG.fence;
  const dx = Math.max(f.minX - x, 0, x - f.maxX);
  const dz = Math.max(f.minZ - z, 0, z - f.maxZ);
  return Math.hypot(dx, dz);
}

const WINDMILL = { x: 186, z: 118 };

// ── Wilderness beyond the east gate: road -> dirt trail -> lake ──
export const LAKE = { x: 300, z: 6, a: 46, b: 32 };
export const WATER_Y = -3.35;
/** Trail centre line (z) at world x: dead straight along the road, then a gentle S-bend. */
export const trailZ = (x: number) => 14 * Math.sin((x - 140) / 36) * sstep(150, 230, x) + 0.5 * (x - 140) * 0 + LAKE.z * sstep(200, 252, x);
/** Gentle descent from town level to the shore. */
const trailLevel = (x: number) => -3.0 * sstep(160, 252, x);
/** Normalised lake radius: 1 at the (irregular) shoreline, <1 in the water. */
export function lakeQ(x: number, z: number): number {
  const dx = (x - LAKE.x) / LAKE.a, dz = (z - LAKE.z) / LAKE.b;
  const ang = Math.atan2(dz, dx);
  const wob = 1 + 0.13 * Math.sin(ang * 3 + 0.8) + 0.08 * Math.sin(ang * 5 + 2.1) + 0.05 * Math.sin(ang * 8 + 0.3);
  return Math.hypot(dx, dz) / wob;
}
/** Wooden dock: starts on the beach where the trail meets the lake and runs out over the water. */
export const DOCK = (() => {
  const z = trailZ(250);
  let x = 240; while (lakeQ(x + 0.5, z) > 1.0 && x < LAKE.x) x += 0.5;
  return { shoreX: x, z, x0: x - 3, x1: x - 3 + 14.5, hw: 1.5, deckY: -2.47 };
})();
const onDock = (x: number, z: number) => x >= DOCK.x0 - 0.5 && x <= DOCK.x1 && Math.abs(z - DOCK.z) <= DOCK.hw;
// ── rendered-surface sampling ──
// The hills mesh (WorldBeyond) renders terrainH as a grid of samples joined by
// two triangles per cell. Walking on the raw analytic height while the eyes see
// the triangulated mesh made the resident float or sink on slopes and dip below
// the lake water near the shore. Sample the same triangulated surface instead,
// so the feet always stand on exactly what is rendered.
export const HILLS = { x0: -300, z0: -230, x1: 460, z1: 370, st: 5 };
const HILL_NX = Math.round((HILLS.x1 - HILLS.x0) / HILLS.st) + 1;
const HILL_NZ = Math.round((HILLS.z1 - HILLS.z0) / HILLS.st) + 1;
let hillGrid: Float32Array | null = null;
function hillH(i: number, j: number): number {
  if (!hillGrid) {
    hillGrid = new Float32Array(HILL_NX * HILL_NZ);
    for (let jj = 0; jj < HILL_NZ; jj++) for (let ii = 0; ii < HILL_NX; ii++) hillGrid[jj * HILL_NX + ii] = terrainH(HILLS.x0 + ii * HILLS.st, HILLS.z0 + jj * HILLS.st);
  }
  return hillGrid[j * HILL_NX + i];
}
/** Height of the rendered hills surface at (x, z): triangle interpolation over the mesh grid. */
export function meshH(x: number, z: number): number {
  const fx = (x - HILLS.x0) / HILLS.st, fz = (z - HILLS.z0) / HILLS.st;
  const i = Math.max(0, Math.min(HILL_NX - 2, Math.floor(fx)));
  const j = Math.max(0, Math.min(HILL_NZ - 2, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
  const a = hillH(i, j), b = hillH(i + 1, j), c = hillH(i, j + 1), d = hillH(i + 1, j + 1);
  // same diagonal as WorldBeyond's index order (a,c,b / b,c,d)
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}
/** Standing height for the resident outside the town: the rendered surface, or the dock deck. */
export const groundY = (x: number, z: number) => (onDock(x, z) ? DOCK.deckY : meshH(x, z));
/** True once the terrain is in the wilderness area (may dip below ground level). */
export const inWilderness = (x: number, z: number) => x > 138 && x < 450 && Math.abs(z - 6) < 130;

export function terrainH(x: number, z: number): number {
  const d = fenceDist(x, z);
  if (d <= 0) return 0;
  const hn = townTerrainH(x, z, d);
  if (!inWilderness(x, z)) return hn;
  const q = lakeQ(x, z);
  const corr = (1 - sstep(9, 34, Math.abs(z - trailZ(x)))) * sstep(136, 146, x) * (1 - sstep(262, 300, x));
  const plateau = Math.max(corr, 1 - sstep(1.6, 2.6, q));
  let h = hn + (trailLevel(x) - hn) * plateau;
  const west = sstep(-0.35, 0.5, (x - LAKE.x) / LAKE.a);   // no hills on the trail side
  const rise = (2.4 + 4.2 * fbm(x * 0.03 + 5, z * 0.03 - 2)) * west;
  h += rise * sstep(1.0, 1.9, q) * (1 - sstep(1.9, 2.7, q));
  h -= 3.7 * (1 - sstep(0.55, 1.0, q)) * (q < 1 ? 1 : 0);   // lake bed
  return h;
}

function townTerrainH(x: number, z: number, d: number): number {
  const r = Math.hypot(x, z - TOWN_CENTER_Z);
  const taper = 1 - sstep(190, 285, r);
  const ramp = sstep(14, 95, d);
  const big = fbm(x * 0.0105 + 3.1, z * 0.0105 - 1.7);
  const rolling = Math.pow(Math.max(0, big - 0.3) / 0.7, 1.2) * 34;
  const small = (fbm(x * 0.042, z * 0.042) - 0.35) * 3.4;
  let h = ramp * taper * (rolling + small * ramp);
  // very gentle verge swell just outside the fence so the border is not a dead-flat strip
  h += sstep(6, 30, d) * (1 - ramp) * fbm(x * 0.05 + 11, z * 0.05) * 1.4 * taper;
  // keep the windmill mound on flat ground
  h *= sstep(16, 38, Math.hypot(x - WINDMILL.x, z - WINDMILL.z));
  return Math.max(0, h);
}


/** Where the resident may stand: the town, the open east gate, or the wilderness (but never in the lake). */
export function canWalk(x: number, z: number): boolean {
  const r = CONFIG.worldRect;
  if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return true;
  if (x > r.maxX && x < 139 && Math.abs(z) < 3.8) return true;               // through the gate
  if (x >= 139 && x <= 395 && Math.abs(z - 6) <= 100) return onDock(x, z) || meshH(x, z) >= WATER_Y + 0.25;
  return false;
}
