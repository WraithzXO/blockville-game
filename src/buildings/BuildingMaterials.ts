//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const mat = (color: number | string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });

export const box = (w: number, h: number, d: number, m: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export function signTexture(text: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 120);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 64;
  do {
    g.font = `bold ${size}px system-ui, sans-serif`;
    size -= 4;
  } while (g.measureText(text).width > 470 && size > 20);
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function sign(text: string, bg: string, w = 6, h = 1.5): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: signTexture(text, bg), side: THREE.DoubleSide, depthWrite: true }),
  );
  return m;
}

// ── shared detail pieces so buildings read as crafted, not generic ─────────
export function windowBox(w = 0.9, h = 1.1): THREE.Group {
  const g = new THREE.Group();
  const frame = box(w + 0.16, h + 0.16, 0.12, mat(0xffffff));
  const glass = box(w, h, 0.14, mat(0x9fd8ef, { roughness: 0.35, metalness: 0.1 }));
  glass.position.z = 0.02;
  g.add(frame, glass);
  return g;
}

export function rbox(w: number, h: number, d: number, r: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 2, Math.max(0.02, Math.min(r, Math.min(w, h, d) / 2 - 0.02))),
    m,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// cornice: an overhanging slab that reads as eaves from any angle
export function cornice(g: THREE.Group, w: number, d: number, y: number, color: number, h = 0.34) {
  const c = box(w, h, d, mat(color));
  c.position.y = y;
  g.add(c);
}

// corner pilasters break up flat walls with shadow lines
export function pilasters(g: THREE.Group, w: number, d: number, h: number, color: number, s = 0.55) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const p = box(s, h, s, mat(color));
    p.position.set((sx * (w - s)) / 2, h / 2, (sz * (d - s)) / 2);
    g.add(p);
  }
}

// plinth: a darker footing strip that grounds the building
export function plinth(g: THREE.Group, w: number, d: number, color: number) {
  const p = box(w, 0.4, d, mat(color));
  p.position.y = 0.2;
  g.add(p);
}

// striped awning with side flaps and a front valance bar
export function stripedAwning(g: THREE.Group, width: number, y: number, z: number, cA: number, cB: number, folds: number, depth = 1.35) {
  const slope = 0.42;
  for (let i = 0; i < folds; i++) {
    const stripe = box(width / folds, 0.12, depth, mat(i % 2 ? cB : cA));
    stripe.position.set(-width / 2 + (i + 0.5) * (width / folds), y, z);
    stripe.rotation.x = slope;
    g.add(stripe);
  }
  const bar = box(width + 0.12, 0.16, 0.14, mat(cA));
  bar.position.set(0, y - Math.sin(slope) * (depth / 2), z + Math.cos(slope) * (depth / 2));
  g.add(bar);
}

// white die with pip faces for the casino rooftop
