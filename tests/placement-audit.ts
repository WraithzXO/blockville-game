// Chunk 3 audit: measure every building type/level placed on every distinct
// plot geometry via the real placeOnPlot, then check world footprints against
// the real road/sidewalk rectangles emitted by buildRoads.
// Run: npx esbuild tests/placement-audit.ts --bundle --format=esm --outfile=/tmp/audit.mjs --platform=node && node /tmp/audit.mjs
import * as THREE from 'three';
import { buildMesh, placeOnPlot } from '../src/buildings/BuildingFactory';
import { PLOT_POSITIONS, type BuildingType } from '../src/game/config';
import { buildRoads } from '../src/world/WorldRoads';

// headless stub for signTexture's canvas
(globalThis as any).document = {
  createElement: () => {
    const ctx: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'measureText') return () => ({ width: 10 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
        return () => undefined;
      },
      set() { return true; },
    });
    return { width: 512, height: 128, getContext: () => ctx };
  },
};

const types: BuildingType[] = ['house', 'casino', 'mine', 'shop', 'bank', 'cafe', 'arcade', 'bakery', 'park'];
const LEVELS = [1, 2, 3, 4];

// real road/sidewalk rectangles from buildRoads (captured via a stub scene)
const rects: { x0: number; x1: number; z0: number; z1: number; label: string }[] = [];
{
  const scene = new THREE.Scene();
  const capture: any[] = [];
  scene.add = ((o: any) => { capture.push(o); }) as any;
  buildRoads(scene as unknown as THREE.Scene);
  for (const o of capture) {
    // only ground pavement counts: flat planes (roads, sidewalks, markings)
    // and the low curb strips — not lamps or benches
    const isPlane = o.geometry?.type === 'PlaneGeometry';
    const isCurb = o.geometry?.type === 'BoxGeometry' && o.geometry.parameters.height <= 0.3;
    if (!isPlane && !isCurb) continue;
    const bb = new THREE.Box3().setFromObject(o);
    rects.push({ x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, label: `road-piece` });
  }
}

const TOL = 0.05;
const overlaps = (bb: THREE.Box3) =>
  rects.filter((r) => bb.min.x < r.x1 - TOL && bb.max.x > r.x0 + TOL && bb.min.z < r.z1 - TOL && bb.max.z > r.z0 + TOL);

let violations = 0;
let checks = 0;
for (const t of types) {
  for (const lvl of LEVELS) {
    const pristine = buildMesh(t, lvl);
    for (const def of PLOT_POSITIONS) {
      const mesh = pristine.clone();
      placeOnPlot(mesh, def);
      mesh.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(mesh);
      const hit = overlaps(bb);
      checks++;
      if (hit.length) {
        violations++;
        const size = new THREE.Vector3(); bb.getSize(size);
        console.log(
          `VIOLATION ${t} L${lvl} on plot (x=${def.x} z=${def.z} ${def.side}) ` +
          `footprint x[${bb.min.x.toFixed(2)},${bb.max.x.toFixed(2)}] z[${bb.min.z.toFixed(2)},${bb.max.z.toFixed(2)}] ` +
          `size (${size.x.toFixed(2)} x ${size.z.toFixed(2)}) overlaps ${hit.length} road pieces`,
        );
      }
    }
  }
}
console.log(`\nAudited ${checks} placements against ${rects.length} road pieces: ${violations} violations`);
if (violations > 0) process.exit(1);
