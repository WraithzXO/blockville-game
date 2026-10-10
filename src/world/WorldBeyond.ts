// Extracted verbatim from Engine.buildWorld (Checkpoint 2, world/environment
// extraction). Behaviour-preserving: no visual or gameplay change intended.
import * as THREE from 'three';
import { townGrassTexture, GRASS_TILE } from './WorldGround';
import { mat, box } from '../buildings/BuildingMaterials';
import { addContactShadow } from './WorldSky';
import { CONFIG } from '../game/config';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DOCK, fbm, fenceDist, mulberry32, sstep, terrainH, TOWN_CENTER_Z, LAKE, WATER_Y, lakeQ, trailZ, HILLS, meshH } from './WorldTerrain';

export function buildWindmill(scene: THREE.Scene): void {
      // distant windmill on a small mound: a landmark that says "farmland" beyond the fence
      {
        // Low-poly landmark mill after the supplied reference: faceted cream tower on a stepped brown base,
        // dark cap with a collar, arched blue window, wooden door and four gold-framed white sails.
        const w = new THREE.Group();
        const flat = (c: number, o: Record<string, unknown> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, ...o });
        const mound = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 1.6, 10), mat(0x7bb36a, { roughness: 1 }));
        mound.position.y = 0.8; mound.receiveShadow = true; w.add(mound);
        const baseM = flat(0x8a5a36);
        const base1 = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.0, 0.7, 6), baseM); base1.position.y = 1.95;
        const base2 = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.0, 0.7, 6), flat(0x9c6a40)); base2.position.y = 2.65;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.1, 8.2, 6), flat(0xe9dcb8));
        tower.position.y = 7.1;
        const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.15, 1.5, 6), flat(0x4a3a30)); collar.position.y = 11.9;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(2.25, 2.9, 6), flat(0x6e5848)); cap.position.y = 14.1;
        for (const m of [base1, base2, tower, collar, cap]) { m.castShadow = true; m.receiveShadow = true; w.add(m); }
        // front details sit just proud of the sloped tower face (tower radius at y: 3.1 -> 2.0 over 8.2 tall)
        const faceR = (y: number) => (3.1 - (1.1 * (y - 3.0)) / 8.2) * 0.866;
        const door = box(1.1, 2.0, 0.22, mat(0xb8843c)); door.position.set(0, 4.1, faceR(4.1) + 0.05); w.add(door);
        const frame = box(1.35, 2.25, 0.16, mat(0x7a5230)); frame.position.set(0, 4.2, faceR(4.2) + 0.0); w.add(frame);
        const win = box(0.7, 1.0, 0.18, mat(0x6fb4e8, { emissive: 0x2a6a9a, emissiveIntensity: 0.25 } as never)); win.position.set(-1.05, 7.6, faceR(7.6) + 0.04);
        const winTop = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.18, 8), mat(0x6fb4e8)); winTop.rotation.x = Math.PI / 2; winTop.position.set(-1.05, 8.1, faceR(8.1) + 0.04);
        const winFrame = box(0.95, 1.5, 0.12, mat(0x9c6a2e)); winFrame.position.set(-1.05, 7.75, faceR(7.75) - 0.02);
        w.add(winFrame, win, winTop);
        for (const [bx, by] of [[1.0, 6.2], [0.4, 5.4]] as [number, number][]) { const br = box(0.7, 0.4, 0.14, mat(0xc99b72)); br.position.set(bx, by, faceR(by) + 0.04); w.add(br); }
        // sails: gold frame arms with white panels, hub at the cap's front
        const hub = new THREE.Group(); hub.position.set(0, 10.9, faceR(10.9) + 0.9);
        const gold = mat(0xd9a84a), sailM = mat(0xf4f1ea);
        const axle = box(0.7, 0.7, 0.7, mat(0x9c6a2e)); hub.add(axle);
        for (let k = 0; k < 4; k++) {
          const bl = new THREE.Group();
          const arm = box(0.3, 8.2, 0.2, gold); arm.position.y = 4.1;
          const sail = box(1.7, 5.2, 0.1, sailM); sail.position.set(1.05, 4.9, 0.12);
          const rim = box(0.14, 5.2, 0.12, gold); rim.position.set(1.95, 4.9, 0.12);
          bl.add(arm, sail, rim); bl.rotation.z = (k * Math.PI) / 2 + 0.5; hub.add(bl);
        }
        w.add(hub);
        w.position.set(186, 0, 118); w.rotation.y = -1.35;   // faces back toward the town
        scene.add(w);
        addContactShadow(scene, 186, 118, 6.5, 0.28);
      }
}

const SAND = new THREE.Color(0xf0e0b0), MUD = new THREE.Color(0x8a7a5a);
const WETSAND = new THREE.Color(0xcbb083);

export function buildHills(scene: THREE.Scene): void {
  // Rolling terrain outside the fence: one smooth, vertex-coloured mesh whose
  // height comes from terrainH(), the same function vegetation is planted with.
  // The ground is perfectly flat near the fence, so nothing can clip it.
  const { x0, x1, z0, z1, st } = HILLS;   // same grid the walker samples via meshH()
  const nx = Math.round((x1 - x0) / st) + 1, nz = Math.round((z1 - z0) / st) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  // Hills now wear the SAME lawn texture + tonal drift as the town ground (same texel density, same
  // material), so the grass reads as one continuous meadow. Only a very faint tint is added with altitude.
  const uv = new Float32Array(nx * nz * 2), tmp = new THREE.Color();
  const crestTint = new THREE.Color(0.9, 0.95, 0.82);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * st, z = z0 + j * st, h = terrainH(x, z), k = (j * nx + i) * 3;
    pos[k] = x; pos[k + 1] = h - 0.02; pos[k + 2] = z;
    uv[(j * nx + i) * 2] = x / GRASS_TILE.x; uv[(j * nx + i) * 2 + 1] = z / GRASS_TILE.z;
    // identical formula to buildGround's vertex tint (x, y = world x, -z in its local frame)
    const gy = -(z - 79);
    const n = Math.sin(x * 0.09 + 1.3) * Math.cos(gy * 0.07) * 0.5 + Math.sin(x * 0.21 + gy * 0.17) * 0.5;
    const patch = Math.sin(x * 0.33 + 2.1) * Math.sin(gy * 0.29 - 0.7) + Math.sin((x + gy) * 0.13);
    const v = 0.93 + n * 0.1 + patch * 0.035;
    tmp.setRGB(v + n * 0.03, v + 0.03, v - n * 0.05).lerp(crestTint, sstep(14, 34, h) * 0.35);
    if (x > 138) {
      const q = lakeQ(x, z);
      tmp.lerp(SAND, (1 - sstep(1.0, 1.35, q)) * 1.0);                 // beach ring
      tmp.lerp(WETSAND, (1 - sstep(1.06, 1.22, q)) * (q >= 1 ? 1 : 0) * 0.85);   // darker wet band just above the water line
      if (q < 1) tmp.lerp(MUD, 0.5);                                    // wet lake bed under the water
    }
    col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
  }
  const f = CONFIG.fence, idx: number[] = [];
  const inside = (x: number, z: number) => x > f.minX - 1 && x < f.maxX + 1 && z > f.minZ - 1 && z < f.maxZ + 1;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const xa = x0 + i * st, xb = xa + st, za = z0 + j * st, zb = za + st;
    if (inside(xa, za) && inside(xb, za) && inside(xa, zb) && inside(xb, zb)) continue;
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  let grassMap: THREE.Texture | null = null;
  if (townGrassTexture) { grassMap = townGrassTexture.clone(); grassMap.repeat.set(1, 1); grassMap.needsUpdate = true; }
  const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: grassMap, vertexColors: true, roughness: 1, metalness: 0 }));
  terrain.receiveShadow = false;
  scene.add(terrain);
}

/** One faceted mountain: one dominant peak plus 2-3 randomised shoulders, tinted by height. */
function mountainGeo(rnd: () => number, radius: number, height: number, low: THREE.Color, high: THREE.Color, cap: THREE.Color | null, haze: THREE.Color, hazeAmt: number, grass: THREE.Color): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Varied silhouette: the old fixed 3-peak layout (same offsets every mountain,
  // only rotated) read as one identical cone repeated around the ring.
  const nShoulders = 1 + Math.floor(rnd() * 3);   // 1..3 shoulders
  const peaks: number[][] = [[0, 0, 1, 1]];
  for (let s = 0; s < nShoulders; s++) {
    const sa = rnd() * Math.PI * 2, sd = radius * (0.45 + rnd() * 0.25);
    peaks.push([Math.cos(sa) * sd, Math.sin(sa) * sd, 0.5 + rnd() * 0.2, 0.45 + rnd() * 0.3]);
  }
  const ph = rnd() * 6;
  peaks.forEach(([ox, oz, rs, hs], pi) => {
    const r = radius * rs, h = height * hs;
    const cone = new THREE.ConeGeometry(r, h, 9, 6, true);
    const p = cone.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (y + h / 2) / h, a = Math.atan2(z, x);
      const rough = 1 + 0.26 * Math.sin(a * 3 + ph + pi) + 0.16 * Math.sin(a * 5 + ph * 2) + 0.1 * Math.sin(a * 7 + ph * 1.7 + pi * 0.6)
        + Math.abs(Math.sin(x * 12.9 + z * 78.2 + pi) * 43758.5 % 1) * 0.24 * (1 - t);
      p.setXYZ(i, x * rough + ox, y + (Math.sin(x * 7.1 + z * 3.3 + pi) * 0.5) * h * 0.05 * (1 - t) * (t < 0.99 ? 1 : 0), z * rough + oz);
    }
    const ng = cone.toNonIndexed();
    ng.deleteAttribute('uv');
    ng.computeVertexNormals();
    const cp = ng.attributes.position, cc = new Float32Array(cp.count * 3);
    const cn = ng.attributes.normal;
    for (let i = 0; i < cp.count; i++) {
      const t = Math.min(1, Math.max(0, (cp.getY(i) + h / 2) / h));
      tmp2.copy(low).lerp(high, sstep(0.0, 0.75, t));
      // Snow keys off ABSOLUTE height against the dominant peak, so a shoulder's own
      // top can no longer paint a pale snow wedge mid-flank of the main cone.
      const tAbs = Math.min(1, (cp.getY(i) + h / 2) / height);
      if (cap && tAbs > 0.72) tmp2.lerp(cap, sstep(0.72, 0.9, tAbs));
      // Feet melt into the meadow: the bottom ring takes the lawn tone so the hard
      // dark skirt where cone meets grass disappears into the terrain.
      tmp2.lerp(grass, (1 - sstep(0.02, 0.16, t)) * 0.85);
      tmp2.lerp(haze, hazeAmt);
      // rock striation: faint horizontal bands so big faces are not one flat tone
      tmp2.multiplyScalar(1 + 0.045 * Math.sin(t * h * 0.55 + pi * 2.3));
      // sun-facing slopes read warmer/brighter, shaded slopes cooler/darker
      const nd = cn.getX(i) * SUN.x + cn.getY(i) * SUN.y + cn.getZ(i) * SUN.z;
      tmp2.multiplyScalar(0.92 + 0.13 * Math.max(0, nd) - 0.05 * Math.max(0, -nd));
      const tri = Math.floor(i / 3), fj = 0.9 + 0.2 * (Math.abs(Math.sin(tri * 91.7 + pi * 13.1 + ph)) % 1);   // per-facet tone, like the low-poly references
      tmp2.multiplyScalar(fj);
      cc[i * 3] = tmp2.r; cc[i * 3 + 1] = tmp2.g; cc[i * 3 + 2] = tmp2.b;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    ng.translate(0, h / 2 - 1, 0);
    parts.push(ng);
  });
  return mergeGeometries(parts)!;
}
const tmp2 = new THREE.Color();
// fixed sun direction shared by the mountain shading tint (matches the scene's key light feel)
const SUN = new THREE.Vector3(0.5, 0.65, 0.35).normalize();
const MEADOW = new THREE.Color(0x74a15f);   // matches the rendered lawn tone at distance

export function buildHorizonRing(scene: THREE.Scene): void {
  // Three layered mountain ranges (foothills, ridge, far peaks). Each is one merged
  // mesh with a different height/colour/haze so depth reads, and every range starts
  // beyond the vegetated terrain (r > 280) so trees can never poke into a mountain.
  const rnd = mulberry32(77);
  const haze = new THREE.Color(0xc9d4de);   // cool atmospheric blue-grey (was lavender)
  const layers = [
    { r: 345, n: 22, rad: [46, 62], h: [44, 76], low: 0x5f8f62, high: 0x86a088, cap: null as number | null, hz: 0.05 },
    { r: 420, n: 24, rad: [70, 92], h: [96, 150], low: 0x6f9a9c, high: 0x9fb4c6, cap: 0xf3e6ea, hz: 0.14 },
    { r: 500, n: 22, rad: [90, 118], h: [140, 210], low: 0x8aa6c4, high: 0xbcc9e0, cap: 0xf8ecee, hz: 0.24 },
  ];
  const mat3 = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const dropIdx = [5, 13, 20];   // one peak per range is left out (~4-5% fewer) — geometry is still generated so the other peaks keep their shapes
  layers.forEach((L, li) => {
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < L.n; i++) {
      const a = (i / L.n) * Math.PI * 2 + (rnd() - 0.5) * 0.12 + li * 0.07;
      const rad = L.rad[0] + rnd() * (L.rad[1] - L.rad[0]);
      const h = L.h[0] + Math.pow(rnd(), 1.4) * (L.h[1] - L.h[0]);
      const g = mountainGeo(rnd, rad, h, new THREE.Color(L.low), new THREE.Color(L.high), L.cap ? new THREE.Color(L.cap) : null, haze, L.hz, MEADOW);
      g.rotateY(rnd() * 6.28);
      g.translate(Math.cos(a) * (L.r + rnd() * 20), 0, TOWN_CENTER_Z + Math.sin(a) * (L.r + rnd() * 20));
      const mx = Math.cos(a) * L.r, mz = TOWN_CENTER_Z + Math.sin(a) * L.r;
      const clearLake = li < 2 && Math.hypot(mx - LAKE.x, mz - LAKE.z) < (li === 0 ? 150 : 110);   // keep the lake vista open
      if (i !== dropIdx[li] && !clearLake) geos.push(g);
    }
    const m = new THREE.Mesh(mergeGeometries(geos)!, mat3);
    m.frustumCulled = false;
    scene.add(m);
  });
}

export function buildWelcomeGlows(scene: THREE.Scene): void {
      // Warm point lights at the spawn road make the first view feel inhabited
      // without changing the low-resolution material language.
      for (const x of [-10, 10]) {
        const glow = new THREE.PointLight(0xffd98a, 0.55, 18, 2);
        glow.position.set(x, 3.2, -7);
        scene.add(glow);
      }
}

export function buildFlowerbeds(scene: THREE.Scene): THREE.Group[] {
    const groups: THREE.Group[] = [];
      // A few small wildflower tufts, placed ONLY on open meadow: the grass margin between the outer
      // plot columns (x = +/-120 (outer column edge 127.5)) and the fence (x = +/-135), at z values well clear of every road,
      // sidewalk and plot row. Nothing sits on a plot, road, sidewalk, curb, median or pavement.
      const flowerColors = [0xf26d7d, 0xf2b134, 0xb455e0, 0xfff3e0, 0x5fb8b0];
      const leafMat = mat(0x3f7d3a);
      const tuftGeo = new THREE.OctahedronGeometry(0.2, 0);
      let n = 0;
      for (const side of [-1, 1]) {
        for (const z of [54, 90, 126, 162, 198]) {
          for (const dx of [0, 1]) {
            const clump = new THREE.Group();
            const k = 3 + ((n + dx) % 2);
            for (let f = 0; f < k; f++) {
              const fx = (f - (k - 1) / 2) * 0.55, fz = ((f + n) % 2) * 0.4 - 0.2;
              const stem = box(0.08, 0.32, 0.08, leafMat);
              stem.position.set(fx, 0.16, fz);
              const head = new THREE.Mesh(tuftGeo, mat(flowerColors[(n + f) % flowerColors.length]));
              head.position.set(fx, 0.38, fz);
              clump.add(stem, head);
            }
            clump.position.set(side * (128.2 + dx * 2.6), 0, z + (dx ? 3.5 : -1.5));
            scene.add(clump);
            groups.push(clump);
            n++;
          }
        }
      }
      // (round shrubs removed: they sat on the sidewalk edge / plot corners along the main street)
      // (old globe lamps removed: superseded by the sidewalk lamp posts above)
  return groups;
}

/** Water, trail ribbon, dock and shoreline props for the wilderness beyond the east gate. */
export function buildWilderness(scene: THREE.Scene): void {
  const rnd = mulberry32(4242);
  // ── trail: asphalt road that frays into a worn dirt path ──
  const asphalt = new THREE.Color(0x565b63), dirt = new THREE.Color(0x9a7448), dirt2 = new THREE.Color(0xb08a58), c = new THREE.Color();
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const x0 = 135.2, x1 = 262, step = 1.5;
  let n = 0;
  for (let x = x0; x <= x1; x += step, n++) {
    const t = sstep(150, 200, x);                       // 0 = road, 1 = trail
    const halfW = (3 - 0.8 * t) + t * (0.35 * Math.sin(x * 0.21) + 0.25 * Math.sin(x * 0.47 + 1));
    const zc = trailZ(x);
    for (const side of [-1, 1]) {
      const edge = t * (fbm(x * 0.3, side * 9) - 0.5) * 1.1;   // ragged edges only once it is a trail
      const z = zc + side * (halfW + edge);
      const y = meshH(x, z) + 0.1;   // sit the ribbon exactly on the rendered surface
      pos.push(x, y, z);
      c.copy(asphalt).lerp(Math.sin(x * 0.4 + side) > 0.3 ? dirt2 : dirt, t);
      const edgeFade = t > 0.2 ? 0.88 : 1;               // slightly darker, worn rim
      c.multiplyScalar(edgeFade + 0.12 * fbm(x * 0.5, side * 3));
      col.push(c.r, c.g, c.b);
    }
    if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.setIndex(idx); tg.computeVertexNormals();
  const trail = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  trail.receiveShadow = true;
  scene.add(trail);
  // a few pebbles and ruts along the dirt section
  for (let x = 185; x < 255; x += 6 + rnd() * 8) {
    const side = rnd() < 0.5 ? -1 : 1, z = trailZ(x) + side * (2.4 + rnd() * 1.4);
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rnd() * 0.18, 0), new THREE.MeshStandardMaterial({ color: 0x8c8678, flatShading: true, roughness: 1 }));
    p.position.set(x, meshH(x, z) + 0.12, z); p.rotation.set(rnd() * 3, rnd() * 3, 0); p.castShadow = true;
    scene.add(p);
  }
  // ── lake surface: faceted water, soft teal at the rim to deep blue in the middle ──
  const RING = 40, SEG = 7, wp: number[] = [], wc: number[] = [], wi: number[] = [];
  const shallow = new THREE.Color(0x74c7bd), deep = new THREE.Color(0x2464a4);
  wp.push(LAKE.x, WATER_Y, LAKE.z); wc.push(deep.r, deep.g, deep.b);
  for (let r = 1; r <= SEG; r++) {
    for (let k = 0; k < RING; k++) {
      const ang = (k / RING) * Math.PI * 2;
      // march outward along this ray to the q = 1.06 shoreline (the bank hides the edge)
      let lo = 0, hi = 2;
      for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; (lakeQ(LAKE.x + Math.cos(ang) * LAKE.a * m, LAKE.z + Math.sin(ang) * LAKE.b * m) < 1.06 ? (lo = m) : (hi = m)); }
      const f = (r / SEG) * lo;
      const px = LAKE.x + Math.cos(ang) * LAKE.a * f, pz = LAKE.z + Math.sin(ang) * LAKE.b * f;
      wp.push(px, WATER_Y, pz);
      // colour by the true radial fraction (not the ring index) so the gradient
      // stays even where the shoreline bulges or pinches
      c.copy(deep).lerp(shallow, sstep(0.35, 0.95, f / lo));
      c.multiplyScalar(0.9 + 0.2 * rnd());   // facet-to-facet tonal variation, like the low-poly references
      wc.push(c.r, c.g, c.b);
    }
  }
  for (let k = 0; k < RING; k++) wi.push(0, 1 + ((k + 1) % RING), 1 + k);
  for (let r = 1; r < SEG; r++) for (let k = 0; k < RING; k++) {
    const a = 1 + (r - 1) * RING + k, b = 1 + (r - 1) * RING + ((k + 1) % RING), cc = a + RING, d = b + RING;
    wi.push(a, b, cc, b, d, cc);
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  wg.setIndex(wi);
  const flatWg = wg.toNonIndexed();
  // per-facet colour so each triangle reads as its own flat tone
  const fc = flatWg.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < fc.count; i += 3) {
    const ar = (fc.getX(i) + fc.getX(i + 1) + fc.getX(i + 2)) / 3, ag = (fc.getY(i) + fc.getY(i + 1) + fc.getY(i + 2)) / 3, ab = (fc.getZ(i) + fc.getZ(i + 1) + fc.getZ(i + 2)) / 3;
    for (let j = 0; j < 3; j++) fc.setXYZ(i + j, ar, ag, ab);
  }
  flatWg.computeVertexNormals();
  const water = new THREE.Mesh(flatWg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.18, emissive: 0x0f3a5a, emissiveIntensity: 0.18, transparent: true, opacity: 0.93 }));
  water.receiveShadow = true;
  // gentle ripple: displace the vertices a few centimetres while rendering.
  // Self-contained via onBeforeRender — no engine or worldLife coupling, and
  // the ±0.05 amplitude keeps the visual water line inside the walker's
  // WATER_Y + 0.25 safety margin (tests/terrain.spec.mjs still holds).
  const wpos = flatWg.attributes.position as THREE.BufferAttribute;
  const wBase = Float32Array.from(wpos.array as Float32Array);
  water.onBeforeRender = () => {
    const t = performance.now() * 0.001;
    for (let i = 0; i < wpos.count; i++) {
      const bx = wBase[i * 3], bz = wBase[i * 3 + 2];
      wpos.setY(i, WATER_Y + 0.05 * Math.sin(bx * 0.32 + t * 1.3) + 0.04 * Math.sin(bz * 0.27 - t * 1.05));
    }
    wpos.needsUpdate = true;
    flatWg.computeVertexNormals();
  };
  scene.add(water);
  // ── foam ring where the water meets the beach ──
  const fp: number[] = [], fi: number[] = [];
  const foamPts: number[] = [];
  for (let k = 0; k < RING; k++) {
    const ang = (k / RING) * Math.PI * 2;
    let lo = 0, hi = 2;
    for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; (lakeQ(LAKE.x + Math.cos(ang) * LAKE.a * m, LAKE.z + Math.sin(ang) * LAKE.b * m) < 1.04 ? (lo = m) : (hi = m)); }
    const wob = 1 + 0.02 * Math.sin(ang * 9 + 1.2) + 0.015 * Math.sin(ang * 15 + 4);
    foamPts.push(LAKE.x + Math.cos(ang) * LAKE.a * lo * wob, LAKE.z + Math.sin(ang) * LAKE.b * lo * wob);
  }
  for (let k = 0; k < RING; k++) {
    const k2 = (k + 1) % RING;
    const ax = foamPts[k * 2], az = foamPts[k * 2 + 1], bx = foamPts[k2 * 2], bz = foamPts[k2 * 2 + 1];
    // a thin inward-pointing quad so the foam hugs the shore from the water side
    const cx = (ax + bx) / 2 - LAKE.x, cz = (az + bz) / 2 - LAKE.z;
    const cl = Math.hypot(cx, cz) || 1;
    const ix = (ax + bx) / 2 - (cx / cl) * 0.9, iz = (az + bz) / 2 - (cz / cl) * 0.9;
    const a = fp.length / 3;
    fp.push(ax, WATER_Y + 0.03, az, bx, WATER_Y + 0.03, bz, ix, WATER_Y + 0.03, iz);
    fi.push(a, a + 1, a + 2);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  fg.setIndex(fi); fg.computeVertexNormals();
  const foam = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0xeef7f4, transparent: true, opacity: 0.6, depthWrite: false }));
  scene.add(foam);
  // ── shoreline props: reeds, rocks, lily pads (few, deterministic, off the trail) ──
  const reedMat = mat(0x4a7a3c), rockMat = mat(0x8c8678, { flatShading: true }), padMat = mat(0x4f9e58);
  for (let k = 0; k < RING; k += 5) {
    const ang = ((k + 0.5) / RING) * Math.PI * 2;
    if (Math.abs(ang - 0) < 0.5 || Math.abs(ang - Math.PI) < 0.5) continue;   // keep the trail/dock approaches clear
    let lo = 0, hi = 2;
    for (let it = 0; it < 14; it++) { const m = (lo + hi) / 2; (lakeQ(LAKE.x + Math.cos(ang) * LAKE.a * m, LAKE.z + Math.sin(ang) * LAKE.b * m) < 1.18 ? (lo = m) : (hi = m)); }
    const px = LAKE.x + Math.cos(ang) * LAKE.a * lo, pz = LAKE.z + Math.sin(ang) * LAKE.b * lo;
    if (Math.hypot(px - trailZ(250), pz - DOCK.z) < 7) continue;
    const pick = rnd();
    if (pick < 0.55) {
      const clump = new THREE.Group();
      for (let rr = 0; rr < 3; rr++) {
        const reed = new THREE.Mesh(new THREE.ConeGeometry(0.07, 1.1 + rnd() * 0.7, 5), reedMat);
        reed.position.set((rnd() - 0.5) * 0.7, 0.5, (rnd() - 0.5) * 0.7);
        reed.rotation.z = (rnd() - 0.5) * 0.24;
        clump.add(reed);
      }
      clump.position.set(px, meshH(px, pz), pz);
      scene.add(clump);
    } else if (pick < 0.8) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rnd() * 0.4, 0), rockMat);
      rock.position.set(px, meshH(px, pz) + 0.1, pz);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      rock.castShadow = true;
      scene.add(rock);
    } else {
      // lily pad out on the water near the rim
      let li = 0, hi2 = 1;
      for (let it = 0; it < 14; it++) { const m = (li + hi2) / 2; (lakeQ(LAKE.x + Math.cos(ang) * LAKE.a * m, LAKE.z + Math.sin(ang) * LAKE.b * m) < 0.82 ? (li = m) : (hi2 = m)); }
      const lx = LAKE.x + Math.cos(ang) * LAKE.a * li, lz = LAKE.z + Math.sin(ang) * LAKE.b * li;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42 + rnd() * 0.2, 0.42 + rnd() * 0.2, 0.05, 7), padMat);
      pad.position.set(lx, WATER_Y + 0.02, lz);
      scene.add(pad);
    }
  }
  // ── wooden dock where the trail meets the water ──
  const dockZ = DOCK.z, shoreX = DOCK.shoreX;
  const wood = mat(0x9a6b3e), woodDark = mat(0x6e4a2b);
  const dock = new THREE.Group();
  const len = 15;
  for (let i = 0; i < len; i++) {
    const plank = box(0.95, 0.16, 3.0, i % 2 ? wood : mat(0xa8774a)); plank.position.set(shoreX - 3 + i * 1.0, -2.55 + 0.0, dockZ); dock.add(plank);
  }
  for (const zz of [-1.35, 1.35]) {
    const rail = box(len, 0.14, 0.18, woodDark); rail.position.set(shoreX - 3 + len / 2 - 0.5, -2.45, dockZ + zz); dock.add(rail);
  }
  for (let i = 0; i < len; i += 3) for (const zz of [-1.4, 1.4]) {
    const post = box(0.3, 3.0, 0.3, woodDark); post.position.set(shoreX - 3 + i, -4.0, dockZ + zz); post.castShadow = true; dock.add(post);
  }
  dock.traverse((o) => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; } });
  scene.add(dock);
  void fenceDist;
}
