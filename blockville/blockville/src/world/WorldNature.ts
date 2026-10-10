// Designed vegetation kit: a handful of hand-authored, faceted tree variants,
// bushes, rocks, grass tufts and flowers. Every variant is ONE merged geometry
// with baked vertex colours, drawn with InstancedMesh and shared materials, so
// a whole forest costs a few draw calls. Placement is deterministic.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from '../game/config';
import { fbm, fenceDist, mulberry32, sstep, terrainH, TOWN_CENTER_Z, lakeQ, trailZ, inWilderness } from './WorldTerrain';

type ColorFn = (y: number, ny: number, r: number) => THREE.Color;
const C = (hex: number) => new THREE.Color(hex);

const posHash = (x: number, y: number, z: number, k: number) => {
  const s = Math.sin(Math.round(x * 50) * 12.9898 + Math.round(y * 50) * 78.233 + Math.round(z * 50) * 37.719 + k * 4.1) * 43758.5453;
  return s - Math.floor(s);
};

/** Jitter shared vertices (so seams stay closed), flatten, then bake per-face colour. */
function facet(geo: THREE.BufferGeometry, m: THREE.Matrix4, jitter: number, seed: number, color: ColorFn): THREE.BufferGeometry {
  geo.applyMatrix4(m);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i,
      x + (posHash(x, y, z, seed) - 0.5) * jitter,
      y + (posHash(x, y, z, seed + 1) - 0.5) * jitter * 0.8,
      z + (posHash(x, y, z, seed + 2) - 0.5) * jitter);
  }
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const r = posHash(pos.getX(i), pos.getY(i + 1), pos.getZ(i + 2), seed + 9);
    const c = color(cy, nor.getY(i), r);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const mx = (px: number, py: number, pz: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const lerpC = (a: THREE.Color, b: THREE.Color, t: number) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));

/** foliage shader: dark underside -> sunlit top, per-face tint noise */
const foliage = (dark: number, mid: number, light: number, y0: number, y1: number): ColorFn => {
  const d = C(dark), m = C(mid), l = C(light);
  return (y, ny, r) => {
    const t = (y - y0) / (y1 - y0);
    const base = t < 0.5 ? lerpC(d, m, t * 2) : lerpC(m, l, (t - 0.5) * 2);
    const up = Math.max(0, ny) * 0.12;
    return base.multiplyScalar(0.9 + r * 0.2 + up);
  };
};
const bark = (hex: number): ColorFn => { const b = C(hex); return (y, _n, r) => b.clone().multiplyScalar(0.8 + r * 0.25 + Math.min(0.15, y * 0.03)); };

const blob = (r: number, x: number, y: number, z: number, sy: number, detail: number, jit: number, seed: number, color: ColorFn, sx = 1) =>
  facet(new THREE.IcosahedronGeometry(r, detail), mx(x, y, z, sx, sy, sx), jit, seed, color);
const stick = (rTop: number, rBot: number, h: number, x: number, y: number, z: number, rx: number, rz: number, color: ColorFn, seed = 3, ry = 0) =>
  facet(new THREE.CylinderGeometry(rTop, rBot, h, 5, 1), mx(x, y + h / 2 * Math.cos(rx) * Math.cos(rz), z, 1, 1, 1, rx, ry, rz), 0.04, seed, color);
const flare = (r: number, color: ColorFn) =>
  facet(new THREE.ConeGeometry(r * 1.9, 0.55, 6, 1), mx(0, 0.18, 0), 0.08, 5, color);

// ───────────── tree variants ─────────────
export const TREE_RADIUS = [2.8, 2.5, 2.1, 1.3, 1.7, 3.0, 2.4];
export const TREE_HEIGHT = [5.8, 6.6, 7.2, 6.4, 5.4, 4.6, 5.4];

function buildVariants(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const wood = bark(0x7a5230), woodDark = bark(0x5e4026), birch = bark(0xe6e0d2);

  // 0 — broad oak: forked trunk, five jittered crown lobes
  {
    const f = foliage(0x2c7a3c, 0x469c4a, 0x86cf62, 2.2, 5.6);
    out.push(mergeGeometries([
      flare(0.42, woodDark),
      stick(0.26, 0.42, 2.5, 0, 0, 0, 0, 0, wood, 1),
      stick(0.12, 0.2, 1.6, 0.05, 2.0, 0, 0, -0.75, wood, 2),
      stick(0.1, 0.18, 1.4, 0, 2.1, 0.05, 0.7, 0.2, woodDark, 4),
      blob(1.9, 0, 3.7, 0, 0.8, 1, 0.5, 11, f),
      blob(1.35, 1.65, 3.3, 0.5, 0.8, 1, 0.4, 12, f),
      blob(1.3, -1.5, 3.4, -0.5, 0.78, 1, 0.4, 13, f),
      blob(1.15, 0.3, 3.2, -1.6, 0.8, 1, 0.4, 14, f),
      blob(1.1, -0.2, 4.9, 0.4, 0.82, 1, 0.4, 15, f),
    ])!);
  }
  // 1 — tall lumpy oak: slimmer trunk, taller stacked crown
  {
    const f = foliage(0x2f8040, 0x55a850, 0x9ad66b, 2.6, 6.6);
    out.push(mergeGeometries([
      flare(0.34, woodDark),
      stick(0.2, 0.34, 3.0, 0, 0, 0, 0.05, 0, wood, 21),
      stick(0.1, 0.16, 1.5, 0, 2.3, 0, -0.6, 0.1, wood, 22),
      blob(1.6, 0, 4.0, 0, 0.95, 1, 0.45, 31, f),
      blob(1.25, 0.9, 5.0, 0.3, 0.9, 1, 0.4, 32, f),
      blob(1.15, -0.9, 4.6, -0.5, 0.9, 1, 0.4, 33, f),
      blob(0.9, 0.1, 6.0, 0, 0.9, 1, 0.35, 34, f),
      blob(0.85, 1.35, 3.5, -0.8, 0.85, 1, 0.35, 35, f),
    ])!);
  }
  // 2 — spruce: six drooping skirts, darker underside
  {
    const f = foliage(0x1f5c38, 0x2f7a45, 0x5aa95a, 1.0, 7.6);
    const parts: THREE.BufferGeometry[] = [flare(0.3, woodDark), stick(0.12, 0.26, 2.0, 0, 0, 0, 0, 0, wood, 41)];
    for (let i = 0; i < 6; i++) {
      const r = 2.2 * (1 - i * 0.145), h = 2.0 - i * 0.12;
      parts.push(facet(new THREE.ConeGeometry(r, h, 7, 1), mx(0, 1.5 + i * 1.0 + h / 2, 0, 1, 1, 1, 0, i * 0.6, 0), 0.22 - i * 0.02, 50 + i, f));
    }
    parts.push(facet(new THREE.ConeGeometry(0.28, 1.0, 5, 1), mx(0, 7.7, 0), 0.04, 60, f));
    out.push(mergeGeometries(parts)!);
  }
  // 3 — birch / cypress: pale leaning trunk, narrow tall crown
  {
    const f = foliage(0x4f9a46, 0x7cc15c, 0xb4e27a, 2.2, 6.9);
    out.push(mergeGeometries([
      stick(0.14, 0.26, 3.4, 0, 0, 0, 0.06, 0, birch, 71),
      stick(0.07, 0.1, 1.5, 0.1, 2.4, 0, -0.7, 0, birch, 72),
      blob(1.05, 0, 3.6, 0, 1.55, 1, 0.3, 73, f),
      blob(0.85, 0.35, 5.0, 0.1, 1.5, 1, 0.3, 74, f),
      blob(0.8, -0.4, 4.4, 0.35, 1.4, 1, 0.3, 75, f),
      blob(0.55, 0, 6.2, 0, 1.4, 1, 0.25, 76, f),
    ])!);
  }
  // 4 — rounded tiers (snowman spruce)
  {
    const f = foliage(0x2f7340, 0x4a9650, 0x86c765, 1.4, 6.0);
    out.push(mergeGeometries([
      flare(0.3, woodDark),
      stick(0.16, 0.28, 1.6, 0, 0, 0, 0, 0, wood, 81),
      blob(1.65, 0, 2.2, 0, 0.72, 1, 0.38, 82, f),
      blob(1.35, 0.1, 3.4, 0.05, 0.75, 1, 0.34, 83, f),
      blob(1.05, 0, 4.4, 0, 0.78, 1, 0.3, 84, f),
      blob(0.7, 0, 5.3, 0, 0.9, 1, 0.25, 85, f),
    ])!);
  }
  // 5 — umbrella tree: leaning forked trunk, wide flat crown
  {
    const f = foliage(0x4f8a3a, 0x6fae4f, 0xaed96a, 3.0, 4.9);
    out.push(mergeGeometries([
      flare(0.34, woodDark),
      stick(0.16, 0.32, 2.7, 0, 0, 0, 0.0, 0.22, wood, 91),
      stick(0.08, 0.14, 1.6, -0.5, 2.2, 0, 0, 0.8, wood, 92),
      stick(0.08, 0.14, 1.5, 0.3, 2.3, 0, 0.5, -0.5, woodDark, 93),
      blob(2.3, -0.3, 3.7, 0, 0.42, 1, 0.55, 94, f),
      blob(1.7, 1.4, 3.5, 0.9, 0.42, 1, 0.45, 95, f),
      blob(1.5, -1.8, 3.9, -0.8, 0.4, 1, 0.45, 96, f),
    ])!);
  }
  // 6 — blossom tree (charm, used sparingly)
  {
    const f = foliage(0xd7699a, 0xf08bb4, 0xfde1ec, 2.0, 5.4);
    out.push(mergeGeometries([
      flare(0.34, woodDark),
      stick(0.2, 0.34, 2.2, 0, 0, 0, 0, 0.1, bark(0x6d4a30), 101),
      stick(0.1, 0.16, 1.4, 0, 1.8, 0, 0.7, 0, bark(0x6d4a30), 102),
      blob(1.6, 0, 3.2, 0, 0.82, 1, 0.45, 111, f),
      blob(1.2, 1.3, 3.0, 0.3, 0.8, 1, 0.4, 112, f),
      blob(1.15, -1.2, 3.1, -0.4, 0.8, 1, 0.4, 113, f),
      blob(1.0, 0.1, 4.2, 0.2, 0.82, 1, 0.35, 114, f),
    ])!);
  }
  return out;
}

function buildBush(kind: number): THREE.BufferGeometry {
  const f = kind === 0 ? foliage(0x2f7a3c, 0x4a9a48, 0x8acb62, 0, 1.2) : kind === 1 ? foliage(0x3c7d3a, 0x69a84c, 0xb0d870, 0, 1.2) : foliage(0x2a6e3c, 0x3f8f4c, 0x6fb868, 0, 1.2);
  const parts = [
    blob(0.75, 0, 0.45, 0, 0.8, 1, 0.22, 200 + kind, f),
    blob(0.55, 0.65, 0.35, 0.2, 0.8, 1, 0.2, 210 + kind, f),
    blob(0.5, -0.55, 0.32, -0.25, 0.8, 1, 0.2, 220 + kind, f),
  ];
  if (kind === 2) for (let i = 0; i < 7; i++) {
    const a = i * 2.4, rr = 0.55 + (i % 3) * 0.12;
    parts.push(facet(new THREE.IcosahedronGeometry(0.1, 0), mx(Math.cos(a) * rr, 0.6 + (i % 2) * 0.22, Math.sin(a) * rr), 0.02, 230 + i, () => C(i % 2 ? 0xf7e27a : 0xfde8f0)));
  }
  return mergeGeometries(parts)!;
}

function buildRock(kind: number): THREE.BufferGeometry {
  const stone = (y: number, ny: number, r: number) => {
    if (ny > 0.55) return C(0x86a94a).multiplyScalar(0.9 + r * 0.16);          // mossy top
    return lerpC(C(0x6c6a80), C(0x938da3), r).multiplyScalar(0.82 + Math.max(0, y) * 0.08);
  };
  const s = kind === 0 ? [1, 0.7, 0.9] : [0.7, 1.05, 0.8];
  const parts = [facet(new THREE.IcosahedronGeometry(0.8, 0), mx(0, 0.35, 0, s[0], s[1], s[2], 0.1, kind, 0.15), 0.35, 300 + kind, stone),
    facet(new THREE.IcosahedronGeometry(0.45, 0), mx(0.85, 0.15, 0.3, 1, 0.7, 1), 0.2, 310 + kind, stone)];
  return mergeGeometries(parts)!;
}

function buildTuft(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const col = (y: number) => lerpC(C(0x3e8c3e), C(0xb0d96a), y / 0.8);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05, lean = 0.12 + (i % 3) * 0.12, h = 0.5 + (i % 3) * 0.2;
    parts.push(facet(new THREE.ConeGeometry(0.075, h, 3, 1), mx(Math.cos(a) * 0.1, h / 2, Math.sin(a) * 0.1, 1, 1, 1, Math.sin(a) * lean, a, Math.cos(a) * lean), 0.0, 400 + i, (y) => col(y)));
  }
  return mergeGeometries(parts)!;
}

function buildFlower(hex: number): THREE.BufferGeometry {
  const stem = facet(new THREE.CylinderGeometry(0.02, 0.025, 0.4, 3, 1), mx(0, 0.2, 0), 0, 500, () => C(0x4a9a40));
  const head = facet(new THREE.IcosahedronGeometry(0.12, 0), mx(0, 0.43, 0, 1, 0.6, 1), 0.02, 501, (_y, ny) => C(hex).multiplyScalar(0.85 + Math.max(0, ny) * 0.25));
  const leaf = facet(new THREE.ConeGeometry(0.06, 0.2, 3, 1), mx(0.07, 0.1, 0, 1, 1, 1, 0, 0, -1.1), 0, 502, () => C(0x58b04a));
  return mergeGeometries([stem, head, leaf])!;
}

// ───────────── materials, instancing ─────────────
const swayTime = { value: 0 };
let shared: null | {
  trees: THREE.BufferGeometry[]; bushes: THREE.BufferGeometry[]; rocks: THREE.BufferGeometry[]; tuft: THREE.BufferGeometry; flowers: THREE.BufferGeometry[];
  treeMat: THREE.MeshStandardMaterial; bushMat: THREE.MeshStandardMaterial; rockMat: THREE.MeshStandardMaterial; tuftMat: THREE.MeshStandardMaterial;
  blobTex: THREE.CanvasTexture;
} = null;
const FLOWER_COLORS = [0xf26d7d, 0xf7c548, 0xfff3e0, 0xb77be0, 0xff9a5a];

function kit() {
  if (shared) return shared;
  const std = (flat = true) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: flat, roughness: 0.95, metalness: 0 });
  const treeMat = std();
  treeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = swayTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float swH = max(position.y - 1.4, 0.0);
      float swP = sin(uTime * 0.85 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17);
      transformed.x += swP * 0.02 * swH;
      transformed.z += swP * 0.012 * swH;`);
  };
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(20,32,18,0.9)'); gr.addColorStop(0.5, 'rgba(20,32,18,0.45)'); gr.addColorStop(1, 'rgba(20,32,18,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const blobTex = new THREE.CanvasTexture(c); blobTex.colorSpace = THREE.SRGBColorSpace;
  shared = {
    trees: buildVariants(), bushes: [0, 1, 2].map(buildBush), rocks: [0, 1].map(buildRock), tuft: buildTuft(), flowers: FLOWER_COLORS.map(buildFlower),
    treeMat, bushMat: std(), rockMat: std(), tuftMat: std(false), blobTex,
  };
  return shared;
}

export interface Spot { x: number; z: number; s: number; rot: number; v: number; y?: number; sx?: number }

function instanced(geo: THREE.BufferGeometry, material: THREE.Material, spots: Spot[], opts: { shadow: boolean; sway?: boolean; tint?: number; sink?: number; lean?: number }): THREE.InstancedMesh | null {
  if (!spots.length) return null;
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  const o = new THREE.Object3D();
  const col = new THREE.Color();
  const rnd = mulberry32(spots.length * 7919 + 13);
  spots.forEach((p, i) => {
    const y = p.y ?? terrainH(p.x, p.z);
    o.position.set(p.x, y - (opts.sink ?? 0.12), p.z);
    o.rotation.set((rnd() - 0.5) * (opts.lean ?? 0.05), p.rot, (rnd() - 0.5) * (opts.lean ?? 0.05));
    o.scale.set(p.s * (p.sx ?? 1), p.s, p.s * (p.sx ?? 1));
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    const t = opts.tint ?? 0.1;
    col.setRGB(1 + (rnd() - 0.5) * t * 2, 1 + (rnd() - 0.5) * t * 1.5, 1 + (rnd() - 0.5) * t * 2.2);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = opts.shadow;
  mesh.receiveShadow = opts.shadow;
  mesh.computeBoundingSphere();
  if (opts.sway) mesh.onBeforeRender = () => { swayTime.value = performance.now() / 1000; };
  return mesh;
}

// ───────────── placement ─────────────
export interface PlantPlan {
  trees: Spot[]; bushes: Spot[]; rocks: Spot[]; tufts: Spot[]; flowers: Spot[][];
}
const newPlan = (): PlantPlan => ({ trees: [], bushes: [], rocks: [], tufts: [], flowers: FLOWER_COLORS.map(() => []) });

class Occupancy {
  private cells = new Map<string, [number, number, number][]>();
  private key = (x: number, z: number) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
  add(x: number, z: number, r: number) {
    const k = this.key(x, z);
    (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push([x, z, r]);
  }
  free(x: number, z: number, r: number, k = 0.62) {
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.cells.get(`${cx + i},${cz + j}`);
      if (l) for (const [ox, oz, or] of l) if (Math.hypot(ox - x, oz - z) < (or + r) * k) return false;
    }
    return true;
  }
}

const WINDMILL = { x: 186, z: 118 };

function pickVariant(rnd: () => number, style: string, h: number): number {
  const r = rnd();
  switch (style) {
    case 'conifer': return r < 0.62 ? 2 : r < 0.9 ? 4 : 3;
    case 'birch': return r < 0.55 ? 3 : r < 0.8 ? 0 : 1;
    case 'blossom': return r < 0.55 ? 6 : r < 0.8 ? 0 : 3;
    case 'savanna': return r < 0.5 ? 5 : r < 0.8 ? 0 : 1;
    default: return h > 9 ? (r < 0.5 ? 2 : r < 0.75 ? 4 : 1) : r < 0.34 ? 0 : r < 0.6 ? 1 : r < 0.74 ? 4 : r < 0.84 ? 3 : r < 0.92 ? 5 : 2;
  }
}

/** Plant one designed cluster (grove, small group or lone tree) with its understory. */
function plantCluster(plan: PlantPlan, occ: Occupancy, rnd: () => number, cx: number, cz: number, kind: 'grove' | 'group' | 'lone', style: string, ok: (x: number, z: number) => boolean, scaleMul = 1, y = (x: number, z: number) => terrainH(x, z)) {
  const n = kind === 'grove' ? 9 + Math.floor(rnd() * 10) : kind === 'group' ? 3 + Math.floor(rnd() * 4) : 1;
  const R = kind === 'grove' ? 8 + rnd() * 7 : kind === 'group' ? 3.5 + rnd() * 3 : 0;
  const placed: [number, number][] = [];
  for (let i = 0, tries = 0; i < n && tries < n * 14; tries++) {
    const a = rnd() * Math.PI * 2, d = R * Math.pow(rnd(), 0.75);
    const x = cx + Math.cos(a) * d * 1.15, z = cz + Math.sin(a) * d * 0.9;
    if (!ok(x, z)) continue;
    const v = pickVariant(rnd, style, y(x, z));
    const edge = R ? d / R : 0;
    const s = scaleMul * (kind === 'lone' ? 1.25 + rnd() * 0.3 : (1.15 - edge * 0.4) * (0.82 + rnd() * 0.4));
    const rad = TREE_RADIUS[v] * s;
    if (!occ.free(x, z, rad)) continue;
    occ.add(x, z, rad);
    plan.trees.push({ x, z, s, rot: rnd() * 6.28, v, sx: 0.88 + rnd() * 0.26 });
    placed.push([x, z]); i++;
  }
  if (!placed.length) return;
  // understory: shrubs on the clearing edge, tufts underfoot, the odd rock / flower patch
  const bn = kind === 'grove' ? placed.length * 0.8 : kind === 'group' ? placed.length * 0.9 : 2;
  for (let i = 0; i < bn; i++) {
    const [px, pz] = placed[Math.floor(rnd() * placed.length)];
    const a = rnd() * 6.28, d = 1.9 + rnd() * 2.6;
    const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
    if (!ok(x, z) || !occ.free(x, z, 0.9, 0.8)) continue;
    occ.add(x, z, 0.9);
    plan.bushes.push({ x, z, s: 0.8 + rnd() * 0.7, rot: rnd() * 6.28, v: Math.floor(rnd() * (style === 'blossom' ? 3 : 2.4)) });
  }
  const tn = placed.length * 3 + 3;
  for (let i = 0; i < tn; i++) {
    const [px, pz] = placed[Math.floor(rnd() * placed.length)];
    const a = rnd() * 6.28, d = 0.8 + rnd() * 4.5;
    const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
    if (ok(x, z)) plan.tufts.push({ x, z, s: 0.8 + rnd() * 0.8, rot: rnd() * 6.28, v: 0 });
  }
  if (kind !== 'lone' && rnd() < 0.7) {
    const [px, pz] = placed[Math.floor(rnd() * placed.length)];
    const a = rnd() * 6.28, x = px + Math.cos(a) * 4, z = pz + Math.sin(a) * 4;
    if (ok(x, z) && occ.free(x, z, 0.8, 0.8)) { occ.add(x, z, 0.8); plan.rocks.push({ x, z, s: 0.8 + rnd() * 0.9, rot: rnd() * 6.28, v: Math.floor(rnd() * 2) }); }
  }
  if (rnd() < 0.55) {
    const [px, pz] = placed[Math.floor(rnd() * placed.length)];
    const a = rnd() * 6.28, fx = px + Math.cos(a) * 3.8, fz = pz + Math.sin(a) * 3.8, ci = Math.floor(rnd() * FLOWER_COLORS.length);
    for (let i = 0; i < 9; i++) {
      const x = fx + (rnd() - 0.5) * 3.4, z = fz + (rnd() - 0.5) * 3.4;
      if (ok(x, z)) plan.flowers[ci].push({ x, z, s: 0.9 + rnd() * 0.7, rot: rnd() * 6.28, v: 0 });
    }
  }
}

function addMeshes(scene: THREE.Scene, plan: PlantPlan, inside: boolean) {
  const k = kit();
  const meshes: (THREE.InstancedMesh | null)[] = [];
  k.trees.forEach((g, v) => meshes.push(instanced(g, k.treeMat, plan.trees.filter((t) => t.v === v), { shadow: inside, sway: true, tint: 0.09, sink: 0.14 })));
  k.bushes.forEach((g, v) => meshes.push(instanced(g, k.bushMat, plan.bushes.filter((t) => t.v === v), { shadow: inside, tint: 0.1, sink: 0.12, lean: 0.1 })));
  k.rocks.forEach((g, v) => meshes.push(instanced(g, k.rockMat, plan.rocks.filter((t) => t.v === v), { shadow: inside, tint: 0.05, sink: 0.18, lean: 0.25 })));
  meshes.push(instanced(k.tuft, k.tuftMat, plan.tufts, { shadow: false, tint: 0.12, sink: 0.02, lean: 0.12 }));
  k.flowers.forEach((g, i) => meshes.push(instanced(g, k.tuftMat, plan.flowers[i], { shadow: false, tint: 0.04, sink: 0.02, lean: 0.2 })));
  meshes.forEach((m) => { if (m) scene.add(m); });
  // soft grounding blobs for trees, bushes and rocks: one instanced quad mesh
  const blobs: { x: number; z: number; r: number; y: number }[] = [];
  const add = (sp: Spot[], rad: (s: Spot) => number) => sp.forEach((s) => {
    const r = rad(s);
    const y = inside ? 0.045 : Math.max(terrainH(s.x, s.z), terrainH(s.x + r, s.z), terrainH(s.x - r, s.z), terrainH(s.x, s.z + r), terrainH(s.x, s.z - r)) + 0.06;
    blobs.push({ x: s.x, z: s.z, r, y });
  });
  add(plan.trees, (s) => TREE_RADIUS[s.v] * s.s * 0.95);
  add(plan.bushes, (s) => 1.15 * s.s);
  add(plan.rocks, (s) => 1.1 * s.s);
  if (blobs.length) {
    const bm = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: k.blobTex, transparent: true, opacity: inside ? 0.34 : 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), blobs.length);
    const o = new THREE.Object3D();
    blobs.forEach((b, i) => { o.position.set(b.x, b.y, b.z); o.scale.set(b.r, 1, b.r); o.updateMatrix(); bm.setMatrixAt(i, o.matrix); });
    bm.renderOrder = 1; bm.computeBoundingSphere();
    scene.add(bm);
  }
}

/** Markers (not meshes) at crown height so ambient birds can still perch. */
function perchMarkers(plan: PlantPlan, max: number): THREE.Object3D[] {
  return [...plan.trees].sort((a, b) => TREE_HEIGHT[b.v] * b.s - TREE_HEIGHT[a.v] * a.s).slice(0, max).map((t) => {
    const o = new THREE.Object3D();
    o.position.set(t.x, TREE_HEIGHT[t.v] * t.s * 0.88, t.z);
    return o;
  });
}

// ───────────── public builders ─────────────
export function buildInsideVegetation(scene: THREE.Scene): THREE.Object3D[] {
  const rnd = mulberry32(8801);
  const plan = newPlan();
  const occ = new Occupancy();
  const f = CONFIG.fence;
  // the ten original decorative spots stay where they were, redesigned
  const spots: [number, number, number][] = [
    [-42, -22, 0], [42, -22, 2], [-46, -8, 4], [46, -8, 6], [-16, -30, 3], [16, -30, 0],
    [-40.5, 9.4, 5], [40.5, 9.4, 1], [-42, 28, 6], [42, 28, 3],
  ];
  const spotV = [0, 2, 3, 6, 1, 4, 5, 2, 6, 0];
  spots.forEach(([x, z], i) => {
    const s = 0.95 + ((i * 37) % 5) * 0.08;
    const v = spotV[i];
    plan.trees.push({ x, z, s, rot: i * 1.7, v, sx: 1 });
    occ.add(x, z, TREE_RADIUS[v] * s);
  });
  // north verge (between the Store avenue and the fence) and south verge
  const northOk = (x: number, z: number) => (z > -32.4 && z < -23 && Math.abs(x) > 26 && Math.abs(x) < f.maxX - 4) || (z > f.minZ + 2.6 && z < -78.5 && Math.abs(x) < f.maxX - 4);
  const southOk = (x: number, z: number) => z > 234 && z < f.maxZ - 1.6 && Math.abs(x) < f.maxX - 4;
  const lvl = () => 0;
  for (const side of [-1, 1]) {
    plantCluster(plan, occ, rnd, side * 66, -28.6, 'grove', side < 0 ? 'mixed' : 'birch', northOk, 0.95, lvl);
    plantCluster(plan, occ, rnd, side * 34, -28.2, 'group', 'blossom', northOk, 0.9, lvl);
    plantCluster(plan, occ, rnd, side * 84, -28, 'group', 'conifer', northOk, 0.95, lvl);
    plantCluster(plan, occ, rnd, side * 60, -26.5, 'lone', 'mixed', northOk, 0.9, lvl);
    for (const x of [24, 66, 108]) plantCluster(plan, occ, rnd, side * x, -81.5, 'group', x === 66 ? 'blossom' : 'mixed', northOk, 0.85, lvl);
    for (const x of [18, 52, 80, 112]) plantCluster(plan, occ, rnd, side * x, 237.6, 'group', x === 52 ? 'blossom' : 'mixed', southOk, 0.8, lvl);
  }
  addMeshes(scene, plan, true);
  return perchMarkers(plan, 18);
}

export function buildOutskirtsVegetation(scene: THREE.Scene): THREE.Object3D[] {
  const rnd = mulberry32(20261008);
  const plan = newPlan();
  const occ = new Occupancy();
  const maxR = 245, step = 33, MAX_TREES = 560;
  const ok = (x: number, z: number) => {
    if (fenceDist(x, z) < 7) return false;
    if (Math.hypot(x, z - TOWN_CENTER_Z) > maxR + 8) return false;
    if (Math.hypot(x - WINDMILL.x, z - WINDMILL.z) < 16) return false;
    if (Math.abs(z) < 9 && Math.abs(x) < 150) return false;          // keep the gate approaches open
    if (inWilderness(x, z)) return false;                             // the wilderness is planted separately
    return true;
  };
  for (let gx = -maxR; gx <= maxR; gx += step) {
    for (let gz = -170; gz <= 320; gz += step) {
      if (plan.trees.length > MAX_TREES) break;
      const cx = gx + (rnd() - 0.5) * step * 0.8, cz = gz + (rnd() - 0.5) * step * 0.8;
      const d = fenceDist(cx, cz), r = Math.hypot(cx, cz - TOWN_CENTER_Z);
      if (d < 9 || r > maxR) continue;
      const dens = fbm(cx * 0.019 + 9, cz * 0.019 + 4) + (d < 45 ? 0.1 : 0) - (r > 200 ? 0.12 : 0);
      const h = terrainH(cx, cz);
      const roll = rnd();
      let kind: 'grove' | 'group' | 'lone' | null = null;
      if (dens > 0.56) kind = roll < 0.75 ? 'grove' : 'group';
      else if (dens > 0.44) kind = roll < 0.7 ? 'group' : 'lone';
      else if (roll < 0.22) kind = 'lone';
      if (!kind) continue;
      const style = h > 10 ? 'conifer' : roll > 0.9 ? 'savanna' : roll > 0.8 ? 'blossom' : roll > 0.55 ? 'birch' : 'mixed';
      plantCluster(plan, occ, rnd, cx, cz, kind, style, ok, 1 + (r / maxR) * 0.35);
    }
  }
  // open-meadow flower drifts and tuft patches close to the fence so the verge reads as lived-in
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.28, d = 10 + rnd() * 60;
    const f = CONFIG.fence;
    const x = THREE.MathUtils.clamp(Math.cos(a) * 190, f.minX - 70, f.maxX + 70) + Math.cos(a) * d * 0.2;
    const z = THREE.MathUtils.clamp(TOWN_CENTER_Z + Math.sin(a) * 190, f.minZ - 70, f.maxZ + 70);
    if (!ok(x, z)) continue;
    const ci = Math.floor(rnd() * FLOWER_COLORS.length);
    for (let j = 0; j < 7; j++) {
      const px = x + (rnd() - 0.5) * 5, pz = z + (rnd() - 0.5) * 5;
      if (ok(px, pz)) { plan.tufts.push({ x: px, z: pz, s: 0.9 + rnd() * 0.7, rot: rnd() * 6.28, v: 0 }); if (rnd() < 0.5) plan.flowers[ci].push({ x: px + 0.4, z: pz, s: 1, rot: rnd() * 6.28, v: 0 }); }
    }
  }
  // hillside cover: grass tufts in drifting patches, scattered shrubs and flower specks
  // on the rolling hills (denser in noise "meadow" patches, bare gaps left open)
  {
    const hr = mulberry32(5521);
    let tn = 0, bn = 0;
    for (let i = 0; i < 9000 && tn < 3200; i++) {
      const a = hr() * 6.283, rr = 30 + Math.sqrt(hr()) * (maxR - 30);
      const x = Math.cos(a) * rr * 1.1, z = TOWN_CENTER_Z + Math.sin(a) * rr;
      if (fenceDist(x, z) < 12 || !ok(x, z)) continue;
      const h = terrainH(x, z);
      if (h < 1.2) continue;
      const patch = fbm(x * 0.045 + 3, z * 0.045 + 11);
      if (patch < 0.5 || hr() > 0.35 + (patch - 0.5) * 1.4) continue;
      const cx = x, cz = z;
      const n = 3 + Math.floor(hr() * 4);
      for (let j = 0; j < n; j++) {
        const px = cx + (hr() - 0.5) * 3.2, pz = cz + (hr() - 0.5) * 3.2;
        if (!ok(px, pz)) continue;
        plan.tufts.push({ x: px, z: pz, s: 1 + hr() * 1.1, rot: hr() * 6.28, v: 0 }); tn++;
      }
      if (patch > 0.62 && hr() < 0.3) {
        const ci = Math.floor(hr() * FLOWER_COLORS.length);
        for (let j = 0; j < 4; j++) {
          const px = cx + (hr() - 0.5) * 2.4, pz = cz + (hr() - 0.5) * 2.4;
          if (ok(px, pz)) plan.flowers[ci].push({ x: px, z: pz, s: 0.9 + hr() * 0.6, rot: hr() * 6.28, v: 0 });
        }
      }
      if (bn < 140 && hr() < 0.07 && occ.free(cx, cz, 1.1, 0.8)) {
        occ.add(cx, cz, 1.1); bn++;
        plan.bushes.push({ x: cx, z: cz, s: 0.8 + hr() * 0.8, rot: hr() * 6.28, v: Math.floor(hr() * 2) });
      }
    }
  }
  // subtle density trim (~5%): thin the outer woodland deterministically, keeping every cluster's overall shape
  plan.trees = plan.trees.filter((_, k) => k % 20 !== 7 && k % 25 !== 3);
  addMeshes(scene, plan, false);
  void sstep;
  return [];
}

/** Sparse pines, birches and shrubs framing the trail and the lake (never on the path or in the water). */
export function buildWildernessVegetation(scene: THREE.Scene): void {
  const rnd = mulberry32(31337);
  const plan = newPlan();
  const occ = new Occupancy();
  const ok = (x: number, z: number) => {
    if (x < 146 || x > 430 || Math.abs(z - 6) > 105) return false;
    if (lakeQ(x, z) < 1.3) return false;                               // water and beach stay clear
    if (x < 270 && Math.abs(z - trailZ(x)) < 6.5) return false;       // keep the trail open
    if (Math.abs(z) < 7 && x < 160) return false;                      // road verge
    return true;
  };
  for (let gx = 150; gx <= 430; gx += 17) {
    for (let gz = -95; gz <= 105; gz += 17) {
      const cx = gx + (rnd() - 0.5) * 14, cz = gz + (rnd() - 0.5) * 14;
      if (!ok(cx, cz)) continue;
      const dens = fbm(cx * 0.03 + 2, cz * 0.03 - 6) + (lakeQ(cx, cz) < 2.4 ? 0.12 : 0);
      const roll = rnd();
      let kind: 'grove' | 'group' | 'lone' | null = null;
      if (dens > 0.6) kind = roll < 0.55 ? 'grove' : 'group';
      else if (dens > 0.45) kind = roll < 0.55 ? 'group' : 'lone';
      else if (roll < 0.18) kind = 'lone';
      if (!kind) continue;
      const style = rnd() < 0.55 ? 'conifer' : rnd() < 0.5 ? 'birch' : 'mixed';
      plantCluster(plan, occ, rnd, cx, cz, kind, style, ok, 1);
    }
  }
  addMeshes(scene, plan, false);
}
