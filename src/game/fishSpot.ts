// Where fishing is allowed and where the cast lands. Pure functions over the terrain, so they are testable
// without the engine. Replaces the old 5.3 x 3.0 box at the end of the dock.
import { LAKE, WATER_Y, onDock, lakeQ, meshH } from '../world/WorldTerrain';

/** Longest cast reach from the player to the first water. The beach ring is ~1.35 lake radii wide, i.e. under 20 units;
 *  the walkable part (ground >= WATER_Y + 0.25) is far narrower, so 12 covers every walkable shore point. */
export const CAST_RANGE = 12;
const STEP = 0.5;

export interface FishSpot { dirX: number; dirZ: number; shoreDist: number }

/** Same lakeside region predicate as canWalk (WorldTerrain), so the town can never qualify. */
const lakeside = (x: number, z: number) => x >= 139 && x <= 395 && Math.abs(z - 6) <= 100 && (onDock(x, z) || meshH(x, z) >= WATER_Y + 0.25);

/** March from (x,z) toward the lake centre; the first point with lakeQ < 1 is the waterline. */
export function fishSpot(x: number, z: number): FishSpot | null {
  if (!lakeside(x, z)) return null;
  const dx = LAKE.x - x, dz = LAKE.z - z, len = Math.hypot(dx, dz);
  if (len < 1e-3) return null;
  const ux = dx / len, uz = dz / len;
  if (!onDock(x, z) && lakeQ(x, z) < 1.0) return null; // already in the water
  for (let d = 0; d <= CAST_RANGE; d += STEP) {
    if (lakeQ(x + ux * d, z + uz * d) < 1.0) return { dirX: ux, dirZ: uz, shoreDist: d };
  }
  return null;
}

/** Bobber target: out past the waterline, on genuinely deep water (ground clearly under the surface). */
export function castTarget(x: number, z: number, spot: FishSpot, r1: number, r2: number): { x: number; z: number } {
  let d = Math.max(4.2, spot.shoreDist + 3) + r1 * 2.2;
  // the dock stands on the shore line, so also keep going until the terrain is below the water
  for (let i = 0; i < 40; i++) {
    const tx = x + spot.dirX * d, tz = z + spot.dirZ * d;
    if (lakeQ(tx, tz) < 0.95 && meshH(tx, tz) < WATER_Y - 0.4) {
      const side = (r2 - 0.5) * 2.0; // small lateral spread
      const sx = tx - spot.dirZ * side, sz = tz + spot.dirX * side;
      if (lakeQ(sx, sz) < 0.95 && meshH(sx, sz) < WATER_Y - 0.4) return { x: sx, z: sz };
      return { x: tx, z: tz };
    }
    d += 0.5;
  }
  return { x: LAKE.x, z: LAKE.z };
}
