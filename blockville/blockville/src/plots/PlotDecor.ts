import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlotFeatureKind } from './PlotLayout';

// ── Models for everything that can sit in a plot's yard ───────────────
// Every model is baked into ONE vertex-coloured geometry (cached per kind),
// so each placed feature costs a single draw call and no new GPU resources.

const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0.03, flatShading: true });
const glowMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb300, emissiveIntensity: 0.9 });

class Bake {
  private parts: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, color: string | number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(m);
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }
  box(w: number, h: number, d: number, color: string | number, x: number, y: number, z: number, ry = 0, rz = 0, rx = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz);
  }
  geo(): THREE.BufferGeometry {
    const g = mergeGeometries(this.parts, false)!;
    g.computeBoundingSphere();
    this.parts.forEach((p) => p.dispose());
    return g;
  }
}

const ICO0 = new THREE.IcosahedronGeometry(1, 0);
const ICO1 = new THREE.IcosahedronGeometry(1, 1);
const CONE5 = new THREE.ConeGeometry(1, 1, 5);
const CONE6 = new THREE.ConeGeometry(1, 1, 6);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);

// ── flowers (shapes after the reference sheet: daisies, tulips, poppies,
//    bell-flowers, hydrangea heads, cosmos) ─────────────────────────────
type FlowerKind = 'daisy' | 'tulip' | 'poppy' | 'bell' | 'hydrangea' | 'cosmos' | 'lily';
const STEM = '#3f8a46', LEAF = '#4fa056', LEAF_L = '#6bb865';

function flower(b: Bake, kind: FlowerKind, x: number, z: number, h: number, ry: number) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const P = (lx: number, ly: number, lz: number) => [x + lx * c + lz * s, ly, z - lx * s + lz * c] as const;
  b.add(CYL6, STEM, x, h / 2, z, 0, 0, 0, 0.025, h, 0.025);
  // two leaves near the base
  for (const sd of [-1, 1]) { const [px, py, pz] = P(sd * 0.12, h * 0.25, 0); b.add(ICO0, LEAF_L, px, py, pz, 0, ry, sd * 0.7, 0.14, 0.04, 0.05); }
  const top = P(0, h, 0);
  switch (kind) {
    case 'daisy':
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add(ICO0, '#fbfbf2', top[0] + Math.cos(a) * 0.09, h, top[2] + Math.sin(a) * 0.09, 0, a, 0.2, 0.08, 0.025, 0.035); }
      b.add(ICO0, '#f2b134', top[0], h + 0.015, top[2], 0, 0, 0, 0.055, 0.04, 0.055); break;
    case 'cosmos':
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.add(ICO0, '#ef6a4c', top[0] + Math.cos(a) * 0.1, h, top[2] + Math.sin(a) * 0.1, 0, a, 0.25, 0.1, 0.025, 0.05); }
      b.add(ICO0, '#f2b134', top[0], h + 0.02, top[2], 0, 0, 0, 0.05, 0.04, 0.05); break;
    case 'tulip':
      b.add(CONE6, '#f2c230', top[0], h + 0.06, top[2], Math.PI, 0, 0, 0.1, 0.2, 0.1); break;
    case 'poppy':
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + ry; b.add(ICO0, '#e5412f', top[0] + Math.cos(a) * 0.08, h, top[2] + Math.sin(a) * 0.08, 0, a, 0.3, 0.11, 0.035, 0.1); }
      b.add(ICO0, '#2d2a30', top[0], h + 0.02, top[2], 0, 0, 0, 0.04, 0.035, 0.04); break;
    case 'bell':
      for (let i = 0; i < 4; i++) b.add(CONE6, i % 2 ? '#b66ad9' : '#9b52c4', x + (i % 2 ? 0.05 : -0.04), h - i * 0.17, z, Math.PI, 0, 0, 0.07, 0.13, 0.07);
      break;
    case 'hydrangea':
      b.add(ICO1, '#59b8e8', top[0], h + 0.08, top[2], 0, 0, 0, 0.19, 0.15, 0.19);
      b.add(ICO0, '#8fd6f4', top[0] + 0.05, h + 0.18, top[2], 0, 0, 0, 0.08, 0.06, 0.08); break;
    case 'lily':
      b.add(CONE6, '#fbf4e6', top[0], h + 0.07, top[2], 0, 0, 0, 0.1, 0.22, 0.1);
      b.add(CYL6, '#f2b134', top[0], h + 0.18, top[2], 0, 0, 0, 0.012, 0.12, 0.012); break;
  }
}

function leafTuft(b: Bake, x: number, z: number, s: number, seed: number) {
  for (let i = 0; i < 5; i++) {
    const a = seed + (i / 5) * Math.PI * 2;
    b.add(CONE5, i % 2 ? LEAF : LEAF_L, x + Math.cos(a) * 0.1 * s, 0.1 * s, z + Math.sin(a) * 0.1 * s, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5, 0.06 * s, 0.28 * s, 0.04 * s);
  }
}

const FLOWER_ORDER: FlowerKind[] = ['daisy', 'tulip', 'poppy', 'bell', 'cosmos', 'hydrangea', 'lily', 'poppy', 'daisy', 'bell'];

function gardenBedGeo(): THREE.BufferGeometry {
  const b = new Bake();
  const W = 2.5, D = 2.1, wood = '#8a5a33', woodD = '#6a4325', woodL = '#a87445';
  // raised timber bed: two stacked boards per side, corner posts with caps
  for (const [y, tone] of [[0.12, wood], [0.34, woodL]] as [number, string][]) {
    b.box(W, 0.2, 0.12, tone, 0, y, D / 2 - 0.06); b.box(W, 0.2, 0.12, tone, 0, y, -D / 2 + 0.06);
    b.box(0.12, 0.2, D - 0.24, tone, W / 2 - 0.06, y, 0); b.box(0.12, 0.2, D - 0.24, tone, -W / 2 + 0.06, y, 0);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { b.box(0.2, 0.52, 0.2, woodD, sx * W / 2, 0.26, sz * D / 2); b.box(0.26, 0.06, 0.26, woodL, sx * W / 2, 0.55, sz * D / 2); }
  // soil with a gentle mound
  b.add(ICO1, '#5a3a24', 0, 0.3, 0, 0, 0, 0, W / 2 - 0.12, 0.22, D / 2 - 0.12);
  // planting: tall flowers at the back, shorter at the front, leaf tufts between
  const rows: [number, number, number][] = [[-0.62, 0.62, 0.78], [-0.2, 0.52, 0.6], [0.28, 0.42, 0.46], [0.7, 0.34, 0.34]];
  let n = 0;
  rows.forEach(([z, h, hv], ri) => {
    const cols = ri % 2 ? 5 : 6;
    for (let i = 0; i < cols; i++) {
      const x = (i - (cols - 1) / 2) * (W - 0.5) / (cols - 1) + (((n * 37) % 7) - 3) * 0.015;
      const k = FLOWER_ORDER[(n + ri * 3) % FLOWER_ORDER.length];
      flower(b, k, x, z + (((n * 53) % 5) - 2) * 0.03, h + (((n * 29) % 5) - 2) * 0.04 + (hv - h) * 0.2 + 0.3, n * 1.3);
      if (i < cols - 1) leafTuft(b, x + (W - 0.5) / (cols - 1) / 2, z + 0.1, 0.9 + (n % 3) * 0.2, n);
      n++;
    }
  });
  // a little shrub with blossoms at the back corner, stepping stones along the front
  b.add(ICO1, '#4b9a52', -0.95, 0.62, -0.5, 0, 0, 0, 0.3, 0.26, 0.28);
  for (let i = 0; i < 4; i++) b.add(ICO0, i % 2 ? '#f7a6c1' : '#fff3e0', -0.95 + Math.cos(i * 1.7) * 0.2, 0.7 + (i % 2) * 0.08, -0.5 + Math.sin(i * 1.7) * 0.2, 0, 0, 0, 0.06, 0.05, 0.06);
  for (let i = 0; i < 4; i++) b.add(CYL8, '#bdb6a6', -0.9 + i * 0.6, 0.03, D / 2 + 0.38, 0, i, 0, 0.26, 0.06, 0.2);
  // garden gnome and lantern post at the opposite corner
  b.add(CONE5, '#4f8fe0', 0.9, 0.7, 0.4, 0, 0, 0, 0.17, 0.4, 0.17).add(ICO0, '#f0c8a0', 0.9, 0.98, 0.4, 0, 0, 0, 0.09, 0.09, 0.09).add(CONE5, '#e0574f', 0.9, 1.12, 0.4, 0, 0, 0, 0.1, 0.24, 0.1);
  b.box(0.1, 1.5, 0.1, '#5c4430', 1.15, 0.75, -0.9);
  return b.geo();
}

function benchGeo(): THREE.BufferGeometry {
  const b = new Bake(), wood = '#b07a47', woodD = '#6b4528', iron = '#3a3a42';
  for (const sx of [-0.8, 0.8]) { b.box(0.1, 0.5, 0.62, iron, sx, 0.25, 0); b.box(0.1, 0.55, 0.08, iron, sx, 0.78, -0.26, 0, 0, -0.18); b.box(0.12, 0.08, 0.5, woodD, sx, 0.55, 0.0); }
  for (let i = 0; i < 4; i++) b.box(1.8, 0.07, 0.12, i % 2 ? wood : '#bd8650', 0, 0.52, -0.26 + i * 0.17);
  for (let i = 0; i < 2; i++) b.box(1.8, 0.14, 0.06, wood, 0, 0.74 + i * 0.19, -0.3 - (0.74 + i * 0.19 - 0.52) * 0.18);
  return b.geo();
}

function lampGeo(): THREE.BufferGeometry {
  const b = new Bake();
  b.add(CYL8, '#3a3a42', 0, 0.09, 0, 0, 0, 0, 0.26, 0.18, 0.26).add(CYL6, '#3a3a42', 0, 1.0, 0, 0, 0, 0, 0.05, 1.9, 0.05);
  b.box(0.36, 0.06, 0.36, '#3a3a42', 0, 2.0, 0).add(CONE5, '#2f3a48', 0, 2.5, 0, 0, 0, 0, 0.3, 0.2, 0.3);
  b.box(0.04, 0.4, 0.04, '#3a3a42', 0.16, 2.2, 0.16).box(0.04, 0.4, 0.04, '#3a3a42', -0.16, 2.2, 0.16).box(0.04, 0.4, 0.04, '#3a3a42', 0.16, 2.2, -0.16).box(0.04, 0.4, 0.04, '#3a3a42', -0.16, 2.2, -0.16);
  return b.geo();
}

function planterGeo(): THREE.BufferGeometry {
  const b = new Bake(), wood = '#9a6a3d';
  b.box(1.5, 0.5, 0.8, wood, 0, 0.25, 0).box(1.56, 0.08, 0.86, '#b98250', 0, 0.52, 0);
  b.add(ICO1, '#523520', 0, 0.52, 0, 0, 0, 0, 0.7, 0.12, 0.36);
  b.add(ICO1, '#4b9a52', -0.3, 0.8, 0, 0, 0, 0, 0.34, 0.28, 0.3).add(ICO1, '#5cb560', 0.25, 0.78, 0.05, 0, 0, 0, 0.3, 0.25, 0.28);
  [['daisy', -0.55], ['poppy', -0.1], ['tulip', 0.3], ['cosmos', 0.6]].forEach(([k, x], i) => flower(b, k as FlowerKind, x as number, (i % 2) * 0.12 - 0.06, 0.78 + (i % 2) * 0.12, i * 2));
  return b.geo();
}

function mailboxGeo(): THREE.BufferGeometry {
  const b = new Bake();
  b.box(0.12, 1.05, 0.12, '#6b4528', 0, 0.52, 0).box(0.1, 0.1, 0.5, '#6b4528', 0, 1.0, 0.05);
  b.box(0.52, 0.36, 0.7, '#3d6fb8', 0, 1.28, 0.05).add(CYL8, '#3d6fb8', 0, 1.46, 0.05, Math.PI / 2, 0, 0, 0.26, 0.7, 0.2);
  b.box(0.04, 0.3, 0.1, '#d8452f', 0.3, 1.38, 0.1).box(0.1, 0.1, 0.1, '#d8452f', 0.3, 1.54, 0.1);
  b.box(0.3, 0.02, 0.01, '#fff3e0', 0, 1.3, 0.41);
  return b.geo();
}

function statueGeo(): THREE.BufferGeometry {
  const b = new Bake(), stone = '#c9c4b8', stoneD = '#a9a498', gold = '#e8bf45', suit = '#6e8fb3';
  b.box(1.3, 0.3, 1.3, stoneD, 0, 0.15, 0).box(1.0, 0.45, 1.0, stone, 0, 0.52, 0).box(0.7, 0.06, 0.06, gold, 0, 0.5, 0.52);  // plinth + plaque
  b.box(0.17, 0.62, 0.2, '#445066', -0.13, 1.06, 0).box(0.17, 0.62, 0.2, '#445066', 0.13, 1.06, 0);                         // legs
  b.add(new THREE.BoxGeometry(0.5, 0.64, 0.3), suit, 0, 1.68, 0).box(0.5, 0.1, 0.32, '#8a5a33', 0, 1.42, 0);                 // torso + belt
  b.box(0.15, 0.55, 0.18, suit, -0.34, 1.62, 0).box(0.15, 0.62, 0.18, suit, 0.34, 2.12, 0.04, 0, 0, 0.2);                     // arms (right raised)
  b.add(new THREE.BoxGeometry(0.34, 0.34, 0.34), '#f0c8a0', 0, 2.17, 0);                                                      // head
  b.add(ICO0, gold, 0, 2.38, 0, 0, 0, 0, 0.26, 0.15, 0.26).box(0.46, 0.05, 0.4, gold, 0, 2.3, 0.02);                          // hard hat
  b.add(new THREE.BoxGeometry(0.28, 0.2, 0.2), '#d8452f', 0.43, 2.55, 0.04);                                                   // raised brick
  b.box(0.12, 0.12, 0.04, '#2d2a30', -0.08, 2.19, 0.18).box(0.12, 0.12, 0.04, '#2d2a30', 0.08, 2.19, 0.18);                   // eyes
  return b.geo();
}

// ── yard fence ─────────────────────────────────────────────────────────
// A full picket fence just inside the plot boundary (u, v within +/-FENCE_HALF of the plot centre, so it
// can never reach the road, sidewalk or a neighbouring plot). Front side keeps a clear, open gate at the
// entrance path. Sections that would pass through the building are dropped, so the fence meets the
// building instead of cutting into it.
export const FENCE_HALF = 4.6;
const GATE_HALF = 1.5;
export interface FenceBlock { u0: number; u1: number; v0: number; v1: number; }

function fenceGeo(blocks: FenceBlock[]): THREE.BufferGeometry {
  const b = new Bake(), post = '#7a5230', cap = '#a07447', pick = '#fbf8ee';
  const H = FENCE_HALF;
  const blocked = (u0: number, u1: number, v0: number, v1: number) =>
    blocks.some((block) => Math.min(u1, block.u1 + 0.2) > Math.max(u0, block.u0 - 0.2) && Math.min(v1, block.v1 + 0.2) > Math.max(v0, block.v0 - 0.2));
  // one run of fence from (a) to (b) along u (axis 'u') or v (axis 'v'), at fixed c on the other axis
  const run = (axis: 'u' | 'v', c: number, a: number, e: number, endPosts = true) => {
    const len = e - a, n = Math.max(1, Math.round(len / 2.1)), step = len / n;
    for (let i = 0; i < n; i++) {
      const s0 = a + i * step, s1 = s0 + step, mid = (s0 + s1) / 2;
      const hit = axis === 'u' ? blocked(s0, s1, c - 0.15, c + 0.15) : blocked(c - 0.15, c + 0.15, s0, s1);
      if (hit) continue;
      const X = axis === 'u' ? mid : c, Z = axis === 'u' ? c : mid, ry = axis === 'u' ? 0 : Math.PI / 2;
      for (const y of [0.34, 0.7]) b.box(step, 0.09, 0.07, post, X, y, Z, ry);
      const np = Math.max(2, Math.round(step / 0.3));
      for (let k = 0; k < np; k++) {
        const t = -step / 2 + 0.17 + (k * (step - 0.34)) / (np - 1);
        const px = axis === 'u' ? mid + t : c, pz = axis === 'u' ? c : mid + t;
        b.box(0.15, 0.82, 0.05, pick, px, 0.45, pz, ry).add(CONE5, pick, px, 0.9, pz, 0, Math.PI / 4 + ry, 0, 0.1, 0.12, 0.03);
      }
      for (const s of i === 0 && endPosts ? [s0, s1] : [s1]) {
        const px = axis === 'u' ? s : c, pz = axis === 'u' ? c : s;
        b.box(0.16, 1.0, 0.16, post, px, 0.5, pz).box(0.22, 0.06, 0.22, cap, px, 1.02, pz);
      }
    }
  };
  run('u', -H, -H, H);            // back
  run('v', -H, -H, H);            // left
  run('v', H, -H, H);             // right
  run('u', H, -H, -GATE_HALF);    // front, left of the gate
  run('u', H, GATE_HALF, H);      // front, right of the gate
  // gate posts (taller, capped) and an OPEN gate leaf swung back into the yard along the path edge
  for (const gx of [-GATE_HALF, GATE_HALF]) b.box(0.2, 1.2, 0.2, post, gx, 0.6, H).box(0.26, 0.07, 0.26, cap, gx, 1.23, H);
  const hx = -GATE_HALF + 0.12, leaf = 1.2;
  for (const y of [0.34, 0.7]) b.box(0.06, 0.08, leaf, post, hx, y, H - leaf / 2 - 0.1);
  for (let k = 0; k < 4; k++) { const z = H - 0.28 - k * 0.3; b.box(0.05, 0.78, 0.14, pick, hx, 0.44, z).add(CONE5, pick, hx, 0.86, z, 0, Math.PI / 4, 0, 0.03, 0.12, 0.1); }
  return b.geo();
}

/** The whole yard fence as one mesh group (plot-local, centred on the plot). `block` = building footprint in plot-local u/v. */
export function makeYardFence(blocks: FenceBlock[]): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(fenceGeo(blocks), vcMat);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return g;
}

const cache = new Map<PlotFeatureKind, THREE.BufferGeometry>();
const BUILD: Record<PlotFeatureKind, () => THREE.BufferGeometry> = {
  garden: gardenBedGeo, bench: benchGeo, lamp: lampGeo, planter: planterGeo, mailbox: mailboxGeo, statue: statueGeo, fence: () => fenceGeo([]),
};

/** A fresh Object3D for one placed feature (shares cached geometry + material). */
export function makeYardFeature(kind: PlotFeatureKind): THREE.Group {
  let geo = cache.get(kind);
  if (!geo) cache.set(kind, (geo = BUILD[kind]()));
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, vcMat);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  if (kind === 'lamp') {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), glowMat); l.position.y = 2.2; g.add(l);
  } else if (kind === 'garden') {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.26), glowMat); l.position.set(1.15, 1.6, -0.9); g.add(l);
  }
  return g;
}
