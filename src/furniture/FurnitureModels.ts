import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ── Blockville furniture ───────────────────────────────────────────────
// One builder per purchasable item. Geometry and materials are cached and
// shared, so any number of pieces (house, showroom, store window) reuse the
// same GPU resources. Orientation convention (matches the old models):
// bed head toward -x, chair back toward -z, origin on the floor centre.

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

function boxGeo(w: number, h: number, d: number) {
  const k = `b${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}
function softGeo(w: number, h: number, d: number, r: number) {
  const k = `r${w}|${h}|${d}|${r}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new RoundedBoxGeometry(w, h, d, 2, r)));
  return g;
}
function cylGeo(rt: number, rb: number, h: number, seg = 10) {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, seg)));
  return g;
}
function icoGeo(r: number, detail = 0) {
  const k = `i${r}|${detail}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new THREE.IcosahedronGeometry(r, detail)));
  return g;
}
export function fmat(color: number | string, emissive: number | string = 0, ei = 0): THREE.MeshStandardMaterial {
  const k = `${color}|${emissive}|${ei}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.04, flatShading: false });
    m.userData.noFade = true;
    if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = ei; }
    matCache.set(k, m);
  }
  return m;
}

function put(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const B = (p: THREE.Object3D, w: number, h: number, d: number, c: number | string, x: number, y: number, z: number) =>
  put(p, boxGeo(w, h, d), fmat(c), x, y, z);
const S = (p: THREE.Object3D, w: number, h: number, d: number, r: number, c: number | string, x: number, y: number, z: number) =>
  put(p, softGeo(w, h, d, r), fmat(c), x, y, z);

const shade = (hex: string, f: number) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
const tint = (hex: string, f: number) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), f).getHexString();

const WOOD = '#9a6a42', WOOD_D = '#6f4a2e', WOOD_L = '#c99a62', LINEN = '#f4eee0';

function bed(color: string, canopy: boolean): THREE.Group {
  const g = new THREE.Group();
  const frame = canopy ? '#d9c7a8' : '#8e5632', trim = shade(frame, 0.78), fin = shade(frame, 0.62);
  // four turned posts: tall at the head, shorter at the foot, each with a block finial
  for (const z of [-0.84, 0.84]) {
    B(g, 0.2, 1.9, 0.2, trim, -1.2, 0.95, z); B(g, 0.26, 0.12, 0.26, fin, -1.2, 1.95, z);
    B(g, 0.2, 1.05, 0.2, trim, 1.2, 0.525, z); B(g, 0.26, 0.12, 0.26, fin, 1.2, 1.11, z);
  }
  for (const z of [-0.84, 0.84]) B(g, 2.2, 0.26, 0.1, frame, 0, 0.5, z);   // side rails
  B(g, 2.2, 0.1, 1.58, shade(frame, 0.7), 0, 0.4, 0);                        // slat deck
  S(g, 2.16, 0.3, 1.5, 0.07, '#fbf6ea', 0, 0.72, 0);                         // mattress
  S(g, 1.5, 0.2, 1.56, 0.07, color, 0.32, 0.9, 0);                           // quilt
  B(g, 0.14, 0.04, 1.58, '#fbf6ea', -0.46, 0.995, 0);                        // folded white sheet
  B(g, 1.5, 0.04, 0.12, shade(color, 0.78), 0.32, 1.0, 0);                   // quilt stripe
  S(g, 0.46, 0.2, 0.66, 0.08, '#ffffff', -0.84, 0.98, -0.4);                 // two white pillows
  S(g, 0.46, 0.2, 0.66, 0.08, '#ffffff', -0.84, 0.98, 0.4);
  B(g, 0.12, 0.86, 1.48, frame, -1.2, 1.2, 0);                               // headboard panel
  B(g, 0.08, 0.6, 1.2, shade(frame, 1.12), -1.13, 1.2, 0);                   // raised inset
  B(g, 0.24, 0.12, 1.84, trim, -1.2, 1.7, 0);                                // crown rail
  B(g, 0.12, 0.5, 1.48, frame, 1.2, 0.74, 0);                                // footboard panel
  B(g, 0.22, 0.1, 1.84, trim, 1.2, 1.02, 0);                                 // foot cap rail
  if (canopy) {
    for (const x of [-1.2, 1.2]) for (const z of [-0.84, 0.84]) B(g, 0.1, 0.8, 0.1, frame, x, 2.35, z);
    for (const z of [-0.84, 0.84]) B(g, 2.5, 0.08, 0.1, frame, 0, 2.78, z);
    for (const x of [-1.2, 1.2]) B(g, 0.1, 0.08, 1.7, frame, x, 2.78, 0);
    S(g, 2.4, 0.06, 1.6, 0.02, tint(color, 0.45), 0, 2.74, 0);
  }
  return g;
}

function chair(color: string, arm: boolean): THREE.Group {
  const g = new THREE.Group();
  if (!arm) {
    for (const x of [-0.38, 0.38]) for (const z of [-0.38, 0.38]) B(g, 0.12, 0.74, 0.12, WOOD_D, x, 0.37, z);
    for (const z of [-0.38, 0.38]) B(g, 0.66, 0.07, 0.07, WOOD_D, 0, 0.3, z);   // side stretchers
    B(g, 0.07, 0.07, 0.66, WOOD_D, 0, 0.3, 0);
    B(g, 0.94, 0.12, 0.94, WOOD, 0, 0.8, 0);                                    // seat frame
    S(g, 0.8, 0.14, 0.8, 0.05, color, 0, 0.92, 0.02);                           // cushion
    for (const x of [-0.4, 0.4]) { B(g, 0.12, 1.1, 0.12, WOOD_D, x, 1.3, -0.4); B(g, 0.16, 0.08, 0.16, WOOD, x, 1.88, -0.4); }
    B(g, 0.92, 0.14, 0.1, WOOD, 0, 1.78, -0.4);                                 // top rail
    for (const y of [1.2, 1.5]) B(g, 0.68, 0.18, 0.06, color, 0, y, -0.4);      // upholstered slats
  } else {
    for (const x of [-0.52, 0.52]) for (const z of [-0.42, 0.42]) B(g, 0.14, 0.22, 0.14, WOOD_D, x, 0.11, z);
    S(g, 1.34, 0.5, 1.12, 0.1, shade(color, 0.92), 0, 0.46, 0);                 // base
    S(g, 0.84, 0.24, 0.9, 0.09, color, 0, 0.83, 0.1);                           // seat cushion
    S(g, 1.34, 1.3, 0.36, 0.12, color, 0, 1.15, -0.46);                         // back
    S(g, 0.92, 0.5, 0.14, 0.07, tint(color, 0.16), 0, 1.38, -0.24);             // back cushion
    for (const x of [-0.6, 0.6]) S(g, 0.3, 0.82, 1.12, 0.11, shade(color, 0.86), x, 0.9, 0);  // chunky arms
  }
  return g;
}

function table(top: string, neon: boolean): THREE.Group {
  const g = new THREE.Group();
  if (!neon) {
    for (const x of [-0.8, 0.8]) for (const z of [-0.42, 0.42]) B(g, 0.14, 1.06, 0.14, '#6a4128', x, 0.53, z);
    for (const z of [-0.42, 0.42]) B(g, 1.5, 0.14, 0.07, WOOD_D, 0, 0.98, z);     // aprons
    for (const x of [-0.8, 0.8]) B(g, 0.07, 0.14, 0.7, WOOD_D, x, 0.98, 0);
    for (const z of [-0.42, 0.42]) B(g, 1.5, 0.07, 0.07, WOOD_D, 0, 0.28, z);     // lower stretcher frame
    for (const x of [-0.8, 0.8]) B(g, 0.07, 0.07, 0.7, WOOD_D, x, 0.28, 0);
    B(g, 1.96, 0.14, 1.2, WOOD_L, 0, 1.13, 0);                                    // plank top
    B(g, 1.9, 0.05, 1.14, shade(WOOD_L, 1.08), 0, 1.22, 0);                       // inset top panel
    S(g, 0.3, 0.2, 0.3, 0.05, '#d9534f', -0.55, 1.35, 0.1);
    S(g, 0.26, 0.26, 0.26, 0.05, '#4f8fe0', -0.2, 1.38, -0.15);
    put(g, cylGeo(0.1, 0.09, 0.2, 8), fmat('#f2b134'), 0.55, 1.35, 0.05);
  } else {
    put(g, cylGeo(0.28, 0.5, 0.2, 10), fmat('#27323a'), 0, 0.1, 0);
    put(g, cylGeo(0.12, 0.16, 1.0, 10), fmat('#27323a'), 0, 0.65, 0);
    S(g, 1.9, 0.14, 1.14, 0.06, '#1f2a32', 0, 1.2, 0);
    S(g, 1.8, 0.05, 1.04, 0.02, top, 0, 1.3, 0);
    for (const z of [-0.54, 0.54]) B(g, 1.84, 0.05, 0.05, top, 0, 1.18, z).material = fmat(top, top, 0.9);
    put(g, cylGeo(0.12, 0.1, 0.34, 8), fmat('#ffffff'), 0.4, 1.5, 0.1);
    put(g, icoGeo(0.2, 1), fmat('#8fe0d8', 0x3cc7bd, 0.8), 0.4, 1.8, 0.1);
  }
  return g;
}

function rug(color: string, round: boolean): THREE.Group {
  const g = new THREE.Group();
  if (round) {
    put(g, cylGeo(1.15, 1.15, 0.05, 28), fmat(shade(color, 0.85)), 0, 0.03, 0);
    put(g, cylGeo(0.92, 0.92, 0.06, 28), fmat(color), 0, 0.04, 0);
    put(g, cylGeo(0.6, 0.6, 0.07, 28), fmat(tint(color, 0.45)), 0, 0.05, 0);
    put(g, cylGeo(0.28, 0.28, 0.08, 20), fmat(shade(color, 0.8)), 0, 0.06, 0);
  } else {
    B(g, 2.5, 0.05, 1.7, shade(color, 0.82), 0, 0.03, 0);
    B(g, 2.2, 0.06, 1.4, color, 0, 0.04, 0);
    B(g, 1.7, 0.07, 0.9, tint(color, 0.4), 0, 0.05, 0);
    B(g, 1.3, 0.08, 0.5, shade(color, 0.78), 0, 0.06, 0);
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) B(g, 0.05, 0.03, 0.18, tint(color, 0.6), sx * 1.3, 0.03, -0.72 + i * 0.18);
  }
  return g;
}

function painting(color: string, sunset: boolean): THREE.Group {
  const g = new THREE.Group();
  // standing easel so the piece is grounded wherever the player puts it
  for (const [x, rz] of [[-0.55, 0.14], [0.55, -0.14]] as [number, number][]) {
    const leg = B(g, 0.08, 2.1, 0.08, WOOD_D, x, 1.0, 0.18); leg.rotation.x = -0.12; void rz;
  }
  B(g, 0.08, 2.1, 0.08, WOOD_D, 0, 1.0, -0.22).rotation.x = 0.16;
  B(g, 1.7, 0.1, 0.12, WOOD, 0, 0.7, 0.08);
  B(g, 1.5, 1.2, 0.08, '#f5ecdc', 0, 1.45, 0);                      // canvas mount
  B(g, 1.66, 0.1, 0.14, WOOD_L, 0, 2.1, 0); B(g, 1.66, 0.1, 0.14, WOOD_L, 0, 0.8, 0);
  B(g, 0.1, 1.4, 0.14, WOOD_L, -0.78, 1.45, 0); B(g, 0.1, 1.4, 0.14, WOOD_L, 0.78, 1.45, 0);
  // painted scene
  const sky = sunset ? '#f4b067' : '#9fd3ea';
  B(g, 1.34, 1.04, 0.05, sky, 0, 1.45, 0.05);
  if (sunset) {
    B(g, 1.34, 0.3, 0.06, '#e27d5a', 0, 1.82, 0.055);
    put(g, cylGeo(0.2, 0.2, 0.06, 14), fmat('#fff0b0'), 0, 1.58, 0.085).rotation.x = Math.PI / 2;
  } else {
    put(g, cylGeo(0.14, 0.14, 0.06, 12), fmat('#fff4b8'), 0.4, 1.75, 0.085).rotation.x = Math.PI / 2;
  }
  S(g, 1.34, 0.4, 0.07, 0.04, sunset ? '#7a4a64' : '#6aa86a', 0, 1.1, 0.07);
  S(g, 0.7, 0.3, 0.08, 0.04, color, -0.3, 1.2, 0.09);
  B(g, 0.22, 0.28, 0.08, '#d8452f', 0.3, 1.27, 0.1);                // tiny red house
  B(g, 0.28, 0.1, 0.1, '#7a2a1c', 0.3, 1.45, 0.1);
  return g;
}

function plant(): THREE.Group {
  const g = new THREE.Group();
  put(g, cylGeo(0.42, 0.3, 0.62, 10), fmat('#b9693f'), 0, 0.31, 0);
  put(g, cylGeo(0.48, 0.46, 0.12, 10), fmat('#cf7d4d'), 0, 0.66, 0);
  put(g, cylGeo(0.4, 0.4, 0.04, 10), fmat('#4a3220'), 0, 0.7, 0);
  const leaf = ['#4f985d', '#3f8650', '#69b36a'];
  const spots: [number, number, number, number][] = [[0, 1.45, 0, 0.5], [-0.34, 1.12, 0.1, 0.34], [0.32, 1.2, -0.12, 0.38], [0.05, 1.05, 0.34, 0.3], [-0.1, 1.85, 0.05, 0.3]];
  spots.forEach(([x, y, z, r], i) => {
    put(g, icoGeo(r, 0), fmat(leaf[i % 3]), x, y, z).rotation.y = i;
    B(g, 0.05, y - 0.7, 0.05, '#3a6b3a', x * 0.5, 0.7 + (y - 0.7) / 2, z * 0.5);
  });
  put(g, icoGeo(0.08, 0), fmat('#f26d7d'), 0.2, 1.95, 0.25);
  return g;
}

function trophy(): THREE.Group {
  const g = new THREE.Group();
  B(g, 0.9, 0.3, 0.9, '#6b4a30', 0, 0.15, 0);
  B(g, 0.7, 0.4, 0.7, '#8a6240', 0, 0.5, 0);
  B(g, 0.5, 0.08, 0.1, '#d3aa3e', 0, 0.55, 0.36);                    // plaque
  const gold = fmat('#e8bf45', 0x8a6410, 0.25);
  put(g, cylGeo(0.12, 0.2, 0.5, 10), gold, 0, 0.95, 0);
  put(g, cylGeo(0.42, 0.14, 0.7, 12), gold, 0, 1.55, 0);
  put(g, cylGeo(0.46, 0.46, 0.06, 12), gold, 0, 1.92, 0);
  for (const sx of [-1, 1]) { const h = put(g, new THREE.TorusGeometry(0.2, 0.05, 6, 10), gold, sx * 0.5, 1.6, 0); h.rotation.y = 0; }
  put(g, icoGeo(0.14, 0), fmat('#fff0a0', 0xffd24a, 0.6), 0, 2.2, 0);
  return g;
}

/** Build the 3D model for a furniture item id. Colour comes from the catalog. */
export function makeFurnitureModel(itemId: string, color = '#9b6841'): THREE.Group {
  let g: THREE.Group;
  if (itemId === 'oak-bed') g = bed(color, false);
  else if (itemId === 'sky-bed') g = bed(color, true);
  else if (itemId.includes('bed')) g = bed(color, false);
  else if (itemId === 'velvet-chair') g = chair(color, true);
  else if (itemId.includes('chair')) g = chair(color, false);
  else if (itemId === 'neon-table') g = table(color, true);
  else if (itemId.includes('table')) g = table(color, false);
  else if (itemId === 'sun-rug') g = rug(color, true);
  else if (itemId.includes('rug')) g = rug(color, false);
  else if (itemId === 'sunset-painting') g = painting(color, true);
  else if (itemId.includes('painting')) g = painting(color, false);
  else if (itemId.includes('plant')) g = plant();
  else if (itemId.includes('trophy')) g = trophy();
  else g = painting(color, false);
  return g;
}

// ── showroom-only dressing (not sold — set dressing for the Furniture Store) ──
export function makeBookshelf(w = 2.4, h = 3.2): THREE.Group {
  const g = new THREE.Group();
  const frame = '#8a5a36', board = '#b8855a';
  B(g, w, h, 0.08, '#6f4a2e', 0, h / 2, -0.21);                       // back panel
  for (const sx of [-1, 1]) B(g, 0.1, h, 0.5, frame, sx * (w / 2 - 0.05), h / 2, 0);
  B(g, w, 0.1, 0.5, frame, 0, h - 0.05, 0); B(g, w, 0.14, 0.5, frame, 0, 0.07, 0);
  B(g, w + 0.24, 0.16, 0.62, '#76492a', 0, h + 0.08, 0.03);   // crown moulding
  B(g, w + 0.14, 0.2, 0.56, '#76492a', 0, 0.1, 0.02);          // plinth
  const cols = ['#d8452f', '#4f8fe0', '#e8b04c', '#53b56d', '#9b5a89', '#f0e6d2'];
  const rows = 4;
  const rowH = (h - 0.2) / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = 0.14 + r * rowH;
    if (r > 0) B(g, w - 0.2, 0.07, 0.5, board, 0, y0, 0);
    let x = -w / 2 + 0.18;
    let i = r * 3;
    while (x < w / 2 - 0.3) {
      const bw = 0.12 + ((i * 37) % 5) * 0.03, bh = Math.min(rowH - 0.15, 0.45 + ((i * 53) % 4) * 0.08);
      if (r === 2 && x > w / 2 - 1.0) { put(g, icoGeo(0.16, 0), fmat('#4f985d'), x + 0.2, y0 + 0.2, 0.0); break; }
      B(g, bw, bh, 0.32, cols[i % cols.length], x + bw / 2, y0 + 0.04 + bh / 2, 0.02);
      x += bw + 0.02;
      i++;
    }
  }
  return g;
}

function makeSofaX(color = '#c8453a'): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.5, 1.5]) for (const z of [-0.52, 0.52]) B(g, 0.16, 0.2, 0.16, WOOD_D, x, 0.1, z);
  S(g, 3.5, 0.5, 1.4, 0.12, shade(color, 0.9), 0, 0.45, 0);                    // base
  S(g, 1.58, 0.28, 1.1, 0.1, color, -0.8, 0.84, 0.12);                          // two seat cushions
  S(g, 1.58, 0.28, 1.1, 0.1, color, 0.8, 0.84, 0.12);
  S(g, 3.5, 1.1, 0.4, 0.12, color, 0, 1.05, -0.55);                             // back
  for (const x of [-0.8, 0.8]) S(g, 1.5, 0.6, 0.18, 0.08, tint(color, 0.14), x, 1.28, -0.3);  // back cushions
  for (const x of [-1.66, 1.66]) S(g, 0.36, 0.95, 1.4, 0.12, shade(color, 0.84), x, 0.88, 0);
  S(g, 0.5, 0.5, 0.18, 0.07, '#f2c14e', -1.1, 1.18, 0.02).rotation.z = 0.25;
  S(g, 0.5, 0.5, 0.18, 0.07, '#f4eee0', 1.1, 1.18, 0.02).rotation.z = -0.2;
  return g;
}
export const makeSofa = makeSofaX;

export function makeLamp(): THREE.Group {
  const g = new THREE.Group();
  put(g, cylGeo(0.34, 0.38, 0.1, 8), fmat('#2f3a52'), 0, 0.05, 0);              // weighted base disc
  put(g, cylGeo(0.04, 0.04, 2.1, 6), fmat('#2f3a52'), 0, 1.1, 0);               // thin pole
  put(g, cylGeo(0.4, 0.3, 0.66, 8), fmat('#fff0c8', 0xffdc8a, 0.7), 0, 2.4, 0); // octagonal shade
  put(g, cylGeo(0.3, 0.3, 0.04, 8), fmat('#d9b66a'), 0, 2.74, 0);
  return g;
}
