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

// ── Part A: storefront / plaza props (added after the original audit) ──────
// Guards against the "dropped objects" regression: props must stand on paving,
// on the ground, clear of each other, and the BLOCKS pole sign must stay readable.
{
  const { makeStore, makeFurnitureStore } = await import('../src/stores/StoreLandmarks');
  const { STORE_APRON, buildStoreForecourts } = await import('../src/world/WorldRoads');
  const { STORE_POS, RETIRED_PLOT_IDS } = await import('../src/game/config');
  void makeFurnitureStore;

  // paving shapes: plaza disc + ellipse (WorldGround/engine), spawn walks, forecourt slabs, apron
  const forecourt: THREE.Mesh[] = [];
  { const sc: any = { add: (o: any) => forecourt.push(o) }; buildStoreForecourts(sc); }
  // The paved forecourts/apron/plaza were removed on request (they read as concrete slabs and a stray road in front of the
  // shops), so buildStoreForecourts is now empty. Store porches stand on lawn right at the shop frontage; keep checking
  // those props against the same former footprints so nothing drifts away from the shops.
  { const { PLOT_POSITIONS } = await import('../src/game/config');
    for (const id of RETIRED_PLOT_IDS) { const d = PLOT_POSITIONS.find((q: any) => q.id === id); if (!d) continue;
      const b = new THREE.Box3(new THREE.Vector3(d.x - 4.5, 0, d.z - 4.5), new THREE.Vector3(d.x + 4.5, 0.1, -5.2)); forecourt.push({ __box: b } as any); } }
  const slabs = forecourt.map((o: any) => o.__box ?? new THREE.Box3().setFromObject(o));
  const inEllipse = (x: number, z: number) => ((x / 13.75) ** 2 + ((z + 13.5) / 8.58) ** 2) <= 1;
  const inDisc = (x: number, z: number) => Math.hypot(x, z + 10) <= 6.4;
  const inRect = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;
  const paved = (x: number, z: number) =>
    inEllipse(x, z) || inDisc(x, z) || slabs.some((b) => inRect(x, z, { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z })) ||
    inRect(x, z, STORE_APRON) || inRect(x, z, { x0: -2.1, x1: 2.1, z0: -27, z1: -17 });

  const ctx: any = { storeFadeMats: [], colliders: [], fadeMats: [], scene: { add() {} } };
  const stores: { name: string; root: THREE.Object3D }[] = [];
  const s1 = makeStore(ctx); stores.push({ name: 'blockville-store', root: s1 });
  const s2 = makeFurnitureStore(ctx); stores.push({ name: 'furniture-store', root: s2 });
  const props: { name: string; bb: THREE.Box3; obj: THREE.Object3D }[] = [];
  for (const st of stores) {
    st.root.updateMatrixWorld(true);
    st.root.traverse((o) => {
      if (o.userData.prop) props.push({ name: `${st.name}#${props.length}`, bb: new THREE.Box3().setFromObject(o), obj: o });
    });
  }
  // plaza town objects (fixed coordinates from Engine.buildTownObjects): bench pair, noticeboard
  const town = [
    { name: 'bench-L', x: -4.9, z: -10, hw: 1.32, hd: 0.4 }, { name: 'bench-R', x: 4.9, z: -10, hw: 1.32, hd: 0.4 },
    { name: 'noticeboard', x: -6.8, z: -6.6, hw: 1.4, hd: 0.35 },
  ];

  let newChecks = 0; let newFails = 0;
  const fail = (m: string) => { newFails++; console.log('PARTA-FAIL ' + m); };
  const EPS = 0.16;
  for (const p of props) {
    // 1. footprint corners sit on paving, never on grass/kerb gap
    for (const [x, z] of [[p.bb.min.x, p.bb.min.z], [p.bb.min.x, p.bb.max.z], [p.bb.max.x, p.bb.min.z], [p.bb.max.x, p.bb.max.z]]) {
      newChecks++; if (!paved(x, z)) fail(`${p.name} corner (${x.toFixed(2)}, ${z.toFixed(2)}) is off the pavement`);
    }
    // 2. no road band / kerb intrusion (main-road kerb at z=-3.12-0.11, road edge -5.2)
    newChecks++; if (p.bb.max.z > -5.2) fail(`${p.name} reaches into the main-road sidewalk (z max ${p.bb.max.z.toFixed(2)})`);
    // 3. floats / sinks: base within [0, EPS] (porch deck is 0.14 high)
    newChecks++; if (p.bb.min.y < -0.01 || p.bb.min.y > EPS) fail(`${p.name} base y ${p.bb.min.y.toFixed(3)} is floating or sunk`);
  }
  for (const t of town) {
    for (const [x, z] of [[t.x - t.hw, t.z - t.hd], [t.x + t.hw, t.z + t.hd]]) { newChecks++; if (!paved(x, z)) fail(`${t.name} edge (${x.toFixed(2)}, ${z.toFixed(2)}) is off the pavement`); }
    newChecks++; if (t.z + t.hd > -5.2) fail(`${t.name} reaches the road sidewalk`);
  }
  // 4. no two props' footprints overlap (props, then town objects vs props)
  const ov = (a: THREE.Box3, b: THREE.Box3) => a.min.x < b.max.x - 0.02 && a.max.x > b.min.x + 0.02 && a.min.z < b.max.z - 0.02 && a.max.z > b.min.z + 0.02;
  for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) {
    newChecks++; if (ov(props[i].bb, props[j].bb)) fail(`footprints overlap: ${props[i].name} and ${props[j].name}`);
  }
  for (const t of town) for (const p of props) {
    newChecks++; if (ov(new THREE.Box3(new THREE.Vector3(t.x - t.hw, 0, t.z - t.hd), new THREE.Vector3(t.x + t.hw, 1, t.z + t.hd)), p.bb)) fail(`${t.name} overlaps ${p.name}`);
  }
  // 5. the BLOCKS pole sign has line of sight: nothing in front of its blade (facing +z)
  const pole = props.find((p) => p.obj.userData.prop && Math.abs(p.bb.min.x - (STORE_POS.x - 7.6 - 0.45)) < 0.05);
  newChecks++;
  if (!pole) fail('BLOCKS pole sign not found');
  else for (const p of props) {
    if (p === pole) continue;
    const cone = new THREE.Box3(new THREE.Vector3(pole.bb.min.x, 0, pole.bb.max.z + 0.01), new THREE.Vector3(pole.bb.max.x, 4, pole.bb.max.z + 4));
    newChecks++; if (ov(cone, p.bb)) fail(`${p.name} stands in front of the BLOCKS sign`);
  }
  if (process.env.PARTA_DUMP) for (const p of props) console.log(p.name, 'x', p.bb.min.x.toFixed(2), p.bb.max.x.toFixed(2), 'z', p.bb.min.z.toFixed(2), p.bb.max.z.toFixed(2), 'y', p.bb.min.y.toFixed(2));
  console.log(`Part A prop audit: ${props.length} props, ${newChecks} assertions, ${newFails} failures`);
  void RETIRED_PLOT_IDS;
  if (newFails > 0) process.exit(1);
}
