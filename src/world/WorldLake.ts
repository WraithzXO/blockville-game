// Lake dressing: beach, shallows planting, shoreline props, the dock and its rowboat.
// Everything is procedural and merged (one vertex-coloured mesh per group) — no loaders,
// no textures. LAKE / WATER_Y / lakeQ / DOCK / groundY are READ ONLY here: nothing in this
// file moves the shoreline, the dock footprint or the deck height (-2.47).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DOCK, LAKE, WATER_Y, lakeQ, meshH, sstep, trailZ } from './WorldTerrain';

/** Registered with the scene so AmbientLife can move them with the shared ripple (one update loop). */
export interface LakeSway {
  obj: THREE.Object3D;
  kind: 'reed' | 'pad' | 'boat' | 'weed';
  phase: number;
  baseY: number;
  baseRot: number;
}

/** Collects transformed, vertex-coloured primitives and merges them into one mesh. */
class Bag {
  private geos: THREE.BufferGeometry[] = [];
  private tmp = new THREE.Object3D();
  private col = new THREE.Color();
  add(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number,
    rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    this.tmp.position.set(x, y, z);
    this.tmp.rotation.set(rx, ry, rz);
    this.tmp.scale.set(sx, sy, sz);
    this.tmp.updateMatrix();
    g.applyMatrix4(this.tmp.matrix);
    this.col.setHex(color);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    // faint per-primitive tone shift so merged parts do not read as one flat colour
    const k = 0.94 + ((Math.abs(Math.sin(x * 12.9 + y * 78.2 + z * 37.7)) * 43758.5) % 1) * 0.12;
    for (let i = 0; i < n; i++) { arr[i * 3] = this.col.r * k; arr[i * 3 + 1] = this.col.g * k; arr[i * 3 + 2] = this.col.b * k; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.geos.push(g);
  }
  box(w: number, h: number, d: number, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    this.add(BOX, color, x, y, z, rx, ry, rz, w, h, d);
  }
  mesh(m: THREE.Material, shadows = true): THREE.Mesh {
    const g = mergeGeometries(this.geos, false)!;
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    return mesh;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
const CONE = new THREE.ConeGeometry(0.5, 1, 5);
const ROCK = new THREE.DodecahedronGeometry(0.5, 0);

const propMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02, flatShading: true });

/** Point at normalised lake radius qv along angle `ang` (binary search on the real lakeQ). */
function edgeAt(ang: number, qv: number): [number, number] {
  let lo = 0, hi = 2;
  for (let it = 0; it < 14; it++) {
    const m = (lo + hi) / 2;
    (lakeQ(LAKE.x + Math.cos(ang) * LAKE.a * m, LAKE.z + Math.sin(ang) * LAKE.b * m) < qv ? (lo = m) : (hi = m));
  }
  return [LAKE.x + Math.cos(ang) * LAKE.a * lo, LAKE.z + Math.sin(ang) * LAKE.b * lo];
}

export function buildLakeDressing(scene: THREE.Scene, rnd: () => number): void {
  const sway: LakeSway[] = [];
  scene.userData.lakeSway = sway;
  const nearDock = (x: number, z: number, r: number) => Math.hypot(x - (DOCK.shoreX + 4), z - DOCK.z) < r;
  const nearTrail = (x: number, z: number) => x > 236 && Math.abs(z - trailZ(Math.min(x, 262))) < 5;

  // ── beach: a soft sand ribbon around the whole shoreline, running under the shallows ──
  {
    const rows: { q: number; c: number; a: number; lift: number }[] = [
      { q: 0.9, c: 0xf0e2ae, a: 1, lift: 0.07 }, { q: 1.04, c: 0xd9c08a, a: 1, lift: 0.1 }, { q: 1.12, c: 0xf4e6b8, a: 1, lift: 0.3 },
      { q: 1.2, c: 0xf6e9bd, a: 0.8, lift: 0.34 }, { q: 1.3, c: 0xf6e9bd, a: 0, lift: 0.36 },
    ];
    const N = 120, pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2;
      const jit = 0.04 * Math.sin(ang * 7 + 1) + 0.03 * Math.sin(ang * 13);
      for (const r of rows) {
        const [px, pz] = edgeAt(ang, r.q + (r.q > 1.2 ? jit * 2 : jit * 0.5));
        // the hills mesh is a coarse 5 m grid: ride the highest nearby sample so no grass tip pokes through the sand
        const trailSide = Math.abs(Math.atan2(Math.sin(ang - Math.PI), Math.cos(ang - Math.PI)));
        let hy = meshH(px, pz);
        if (r.q > 1.0 && trailSide > 0.2) hy = Math.max(hy, meshH(px + 2.5, pz), meshH(px - 2.5, pz), meshH(px, pz + 2.5), meshH(px, pz - 2.5));
        pos.push(px, hy + (trailSide > 0.2 ? r.lift + 0.1 : 0.07), pz);
        c.setHex(r.c);
        col.push(c.r, c.g, c.b, r.a);
      }
    }
    const R = rows.length;
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      for (let r = 0; r < R - 1; r++) {
        const a = k * R + r, b = k * R + r + 1, d = k2 * R + r, e = k2 * R + r + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx); g.computeVertexNormals();
    const beach = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    beach.receiveShadow = true;
    beach.renderOrder = 1;   // after the opaque terrain, before the water facets
    scene.add(beach);
  }

  // ── seagrass in the shallows: thin blades under the surface, swaying ──
  for (let i = 0; i < 16; i++) {
    const ang = rnd() * Math.PI * 2;
    if (Math.abs(ang - Math.PI) < 0.35 || Math.abs(ang) < 0.3 || Math.abs(ang - Math.PI * 2) < 0.3) { rnd(); continue; }
    const [px, pz] = edgeAt(ang, 0.62 + rnd() * 0.22);
    if (nearDock(px, pz, 10)) continue;
    const bag = new THREE.Group();
    const b = new Bag();
    const n = 6 + Math.floor(rnd() * 5);
    const bed = meshH(px, pz);
    const top = WATER_Y - 0.3;
    for (let j = 0; j < n; j++) {
      const ox = (rnd() - 0.5) * 1.3, oz = (rnd() - 0.5) * 1.3;
      const bedH = meshH(px + ox, pz + oz);
      const h = Math.max(0.5, top - bedH);
      b.add(CONE, rnd() < 0.5 ? 0x3d9a66 : 0x59b36c, ox, bedH - bed + h * 0.5, oz, (rnd() - 0.5) * 0.2, 0, (rnd() - 0.5) * 0.25, 0.14, h, 0.14);
    }
    const m = b.mesh(propMat(), false);
    m.castShadow = false;
    bag.add(m);
    bag.position.set(px, bed, pz);
    scene.add(bag);
    sway.push({ obj: bag, kind: 'weed', phase: rnd() * 6.28, baseY: bed, baseRot: 0 });
  }

  // ── bank props: reed clumps (with cattails), flat rocks, driftwood — sparse and deliberate ──
  const reedCols = [0x4a7a3c, 0x5b8f45, 0x3f6e38];
  for (let i = 0; i < 26; i++) {
    const ang = rnd() * Math.PI * 2;
    const kind = rnd();
    if (Math.abs(ang - 0) < 0.5 || Math.abs(ang - Math.PI) < 0.5 || Math.abs(ang - Math.PI * 2) < 0.5) continue;   // keep the trail/dock approaches clear
    const [px, pz] = edgeAt(ang, 1.12 + rnd() * 0.12);
    if (nearDock(px, pz, 8) || nearTrail(px, pz)) continue;
    if (kind < 0.5) {
      // reed clump: 7-12 blades, a few topped with a brown cattail
      const b = new Bag();
      const n = 7 + Math.floor(rnd() * 6);
      for (let j = 0; j < n; j++) {
        const ox = (rnd() - 0.5) * 0.9, oz = (rnd() - 0.5) * 0.9, h = 1.2 + rnd() * 1.0;
        const tx = (rnd() - 0.5) * 0.3, tz = (rnd() - 0.5) * 0.3;
        b.add(CONE, reedCols[j % 3], ox, h / 2, oz, tz, 0, -tx, 0.1, h, 0.1);
        if (rnd() < 0.3) b.add(CYL, 0x6b4a2a, ox - tx * h * 0.5, h - 0.1, oz + tz * h * 0.5, 0, 0, 0, 0.13, 0.4, 0.13);
      }
      const m = b.mesh(propMat());
      m.position.set(px, meshH(px, pz), pz);
      scene.add(m);
      sway.push({ obj: m, kind: 'reed', phase: rnd() * 6.28, baseY: m.position.y, baseRot: 0 });
    } else if (kind < 0.82) {
      // flat skipping rocks, 2-3 together
      const b = new Bag();
      const n = 2 + Math.floor(rnd() * 2);
      for (let j = 0; j < n; j++) {
        const s = 0.5 + rnd() * 0.7;
        b.add(ROCK, [0x8c8678, 0x9a9484, 0x7a7466][j % 3], (rnd() - 0.5) * 1.3, 0.08 * s, (rnd() - 0.5) * 1.3, 0, rnd() * 3, 0, s * 1.5, s * 0.5, s * 1.3);
      }
      const m = b.mesh(propMat());
      m.position.set(px, meshH(px, pz) + 0.04, pz);
      scene.add(m);
    } else {
      // driftwood: a bleached log with a stub branch
      const b = new Bag();
      const len = 2.2 + rnd() * 1.4;
      b.add(CYL, 0xb7a58a, 0, 0.18, 0, 0, 0, Math.PI / 2, 0.34, len, 0.34);
      b.add(CYL, 0xa89678, len * 0.15, 0.4, 0.12, 0.5, 0, 0.3, 0.14, 0.7, 0.14);
      const m = b.mesh(propMat());
      m.position.set(px, meshH(px, pz) + 0.05, pz);
      m.rotation.y = rnd() * Math.PI;
      scene.add(m);
    }
  }

  // ── lily pads: loose clusters on the water, bobbing with the ripple ──
  for (let i = 0; i < 6; i++) {
    const ang = rnd() * Math.PI * 2;
    if (Math.abs(ang - Math.PI) < 0.6) continue;
    const [cx, cz] = edgeAt(ang, 0.7 + rnd() * 0.12);
    if (nearDock(cx, cz, 12)) continue;
    const b = new Bag();
    const n = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < n; j++) {
      const r = 0.45 + rnd() * 0.35;
      const ox = (rnd() - 0.5) * 3, oz = (rnd() - 0.5) * 3;
      b.add(CYL, [0x4f9e58, 0x5fb066, 0x428a50][j % 3], ox, 0, oz, 0, rnd() * 3, 0, r * 2, 0.05, r * 2);
      if (rnd() < 0.28) b.add(CONE, 0xf4a6c0, ox + 0.1, 0.12, oz, 0, 0, 0, 0.3, 0.26, 0.3);
    }
    const m = b.mesh(propMat(), false);
    m.position.set(cx, WATER_Y + 0.03, cz);
    scene.add(m);
    sway.push({ obj: m, kind: 'pad', phase: rnd() * 6.28, baseY: WATER_Y + 0.03, baseRot: 0 });
  }

  // ── the dock: same footprint and deck height as before (DOCK, deckY -2.47) ──
  const X0 = DOCK.shoreX - 3, LEN = 15, DZ = DOCK.z, TOP = DOCK.deckY;
  const d = new Bag();
  const woods = [0xa8774a, 0x9a6b3e, 0xb08350, 0x8c6038];
  // deck: two boards per 1m bay, uneven tone and length, hairline gaps
  for (let i = 0; i < LEN; i++) {
    for (let s = 0; s < 2; s++) {
      const len = 2.88 + rnd() * 0.12, sink = rnd() * 0.02;
      d.box(0.44, 0.14, len, woods[Math.floor(rnd() * 4)], X0 + i + (s ? 0.25 : -0.25), TOP - 0.07 - sink, DZ + (rnd() - 0.5) * 0.08);
    }
  }
  // stringers under the deck + cross-bearers
  for (const zz of [-1.2, 0, 1.2]) d.box(LEN, 0.18, 0.2, 0x5e4026, X0 + LEN / 2 - 0.5, TOP - 0.3, DZ + zz);
  for (let i = 0; i < LEN; i += 3) d.box(0.22, 0.2, 3.1, 0x5e4026, X0 + i, TOP - 0.42, DZ);
  // piles + rail posts: every 3m, both sides
  for (let i = 0; i < LEN; i += 3) for (const zz of [-1.42, 1.42]) {
    d.box(0.34, 4.4, 0.34, 0x5a3d25, X0 + i, TOP - 1.7, DZ + zz);
    d.box(0.42, 0.1, 0.42, 0x7a5535, X0 + i, TOP + 0.55, DZ + zz);   // post cap
  }
  // rails: top + mid, left open on the boat side midway and at the shore end
  const rail = (zz: number, gap: boolean) => {
    for (let i = 3; i < LEN - 3; i += 3) {
      if (gap && i >= 6 && i <= 9) continue;
      d.box(3, 0.1, 0.12, 0x6e4a2b, X0 + i + 1.5, TOP + 0.34, DZ + zz);
      d.box(3, 0.08, 0.1, 0x6e4a2b, X0 + i + 1.5, TOP + 0.02 + 0.1, DZ + zz);
    }
  };
  rail(-1.42, false); rail(1.42, true);
  // far end: bollards with a rope coil, a lamp post, crates, a bucket, a leaning rod
  const endX = X0 + LEN - 1.0;
  for (const zz of [-1.15, 1.15]) {
    d.add(CYL, 0x6a4a2e, endX + 0.25, TOP + 0.26, DZ + zz, 0, 0, 0, 0.3, 0.55, 0.3);
    d.add(CYL, 0xd9c79a, endX + 0.25, TOP + 0.4, DZ + zz, 0, 0, 0, 0.38, 0.09, 0.38);
  }
  d.box(0.14, 1.9, 0.14, 0x4a3320, endX - 0.6, TOP + 0.95, DZ - 1.25);
  d.box(0.5, 0.06, 0.06, 0x4a3320, endX - 0.4, TOP + 1.85, DZ - 1.25);
  d.box(0.62, 0.62, 0.62, 0x8f6a3f, endX - 1.8, TOP + 0.31, DZ - 1.1, 0, 0.2, 0);
  d.box(0.66, 0.06, 0.66, 0x7a5a34, endX - 1.8, TOP + 0.65, DZ - 1.1, 0, 0.2, 0);
  d.box(0.44, 0.44, 0.44, 0xa07848, endX - 1.7, TOP + 0.84, DZ - 1.05, 0, -0.3, 0);
  d.add(CYL, 0x8fa6b4, endX - 1.0, TOP + 0.22, DZ + 1.0, 0, 0, 0, 0.36, 0.44, 0.36);   // bucket
  d.add(CYL, 0x6d7f8c, endX - 1.0, TOP + 0.45, DZ + 1.0, 0, 0, 0, 0.3, 0.04, 0.3);
  d.add(CYL, 0x3f2c1c, endX - 3.4, TOP + 0.85, DZ + 1.34, 0.12, 0, 0.45, 0.05, 1.9, 0.05);   // rod
  const dock = d.mesh(propMat());
  scene.add(dock);
  // the lantern glass is its own emissive piece (drawn bright, no light source)
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffb84a, emissiveIntensity: 1.6, roughness: 0.4 }));
  lamp.position.set(endX - 0.2, TOP + 1.62, DZ - 1.25);
  scene.add(lamp);
  scene.userData.dockLamp = lamp;
  // a small warm pool of light under the lantern (no shadow, short range)
  const lampLight = new THREE.PointLight(0xffb84a, 6, 11, 2);
  lampLight.position.copy(lamp.position).add(new THREE.Vector3(0, -0.1, 0));
  scene.add(lampLight);

  // ── rowboat moored on the +z side, bobbing with the ripple ──
  const bx = DOCK.shoreX + 6.2, bz = DOCK.z + 3.7;
  const bb = new Bag();
  const HULL = 0x2f5f9e, HULL2 = 0x244b82, IN = 0xc9a46a, WOODB = 0x8a6238;
  bb.box(3.1, 0.12, 1.05, HULL2, 0, 0.0, 0);
  for (const s of [-1, 1]) bb.box(3.5, 0.5, 0.12, HULL, 0, 0.26, s * 0.58, s * 0.16, 0, 0);
  bb.box(0.12, 0.5, 1.1, HULL, -1.72, 0.27, 0, 0, 0, 0.12);
  bb.add(CONE, HULL, 1.9, 0.26, 0, 0, 0, -Math.PI / 2, 0.9, 0.7, 1.1);
  bb.box(2.9, 0.04, 0.9, IN, 0, 0.1, 0);
  for (const x of [-0.7, 0.5]) bb.box(0.16, 0.06, 1.1, WOODB, x, 0.38, 0);
  bb.add(CYL, WOODB, -0.2, 0.55, 0.9, Math.PI / 2, 0.5, 0, 0.05, 1.7, 0.05);   // oar
  const boat = bb.mesh(propMat());
  const bg = new THREE.Group();
  bg.add(boat);
  bg.position.set(bx, WATER_Y, bz);
  bg.rotation.y = 0.08;
  scene.add(bg);
  sway.push({ obj: bg, kind: 'boat', phase: 0, baseY: WATER_Y + 0.03, baseRot: 0.08 });
  // mooring line from the bow to the nearest dock post
  const lx0 = bx + 1.9, lz0 = bz - 0.05, lx1 = X0 + 9, lz1 = DOCK.z + 1.42;
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, Math.hypot(lx1 - lx0, lz1 - lz0), 4), new THREE.MeshStandardMaterial({ color: 0xd8c690, roughness: 1 }));
  line.position.set((lx0 + lx1) / 2, TOP - 0.25, (lz0 + lz1) / 2);
  line.rotation.set(Math.PI / 2, 0, 0);
  line.rotation.order = 'YXZ';
  line.rotation.y = Math.atan2(lx1 - lx0, lz1 - lz0);
  scene.add(line);
  void sstep;
}
