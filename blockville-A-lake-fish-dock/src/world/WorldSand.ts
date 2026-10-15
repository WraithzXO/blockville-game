// Beach sand: a dedicated ribbon laid over the hills mesh in the shore band (same approach as the trail
// ribbon: own canvas texture, own polygonOffset). It follows lakeQ so it hugs the irregular shoreline,
// carries the SAND / WETSAND colours the hills mesh already uses (so the fade-out is seamless), and adds
// grain, tide marks, a worn footpath where the trail arrives, plus a few shells and pebbles.
import * as THREE from 'three';
import { DOCK, LAKE, WATER_Y, fbm, lakeQ, meshH, mulberry32, sstep, trailZ } from './WorldTerrain';

const SAND = new THREE.Color(0xf0e0b0), WETSAND = new THREE.Color(0xcbb083), BED_SAND = new THREE.Color(0xe6d49c);
const onDock = (x: number, z: number) => x >= DOCK.x0 - 0.5 && x <= DOCK.x1 && Math.abs(z - DOCK.z) <= DOCK.hw;   // same rule as WorldTerrain (not exported there)
const TILE = 22;   // world units per texture repeat; low-frequency vertex tint hides the repeat

/** Seeded, seamless, nearest-filtered grain texture (near-white so vertex colours stay in charge). */
function makeSandTexture(): THREE.CanvasTexture {
  const W = 256, cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const g = cv.getContext('2d')!;
  const r = mulberry32(77);
  const px = (x: number, y: number, w: number, h: number) => { for (const ox of [0, -W, W]) for (const oy of [0, -W, W]) g.fillRect(x + ox, y + oy, w, h); };
  g.fillStyle = '#faf5e8'; g.fillRect(0, 0, W, W);
  for (let i = 0; i < 70; i++) { g.fillStyle = r() > 0.5 ? 'rgba(190,165,120,0.16)' : 'rgba(255,255,248,0.3)'; px(Math.floor(r() * 128) * 2, Math.floor(r() * 128) * 2, 8 + Math.floor(r() * 12) * 2, 4 + Math.floor(r() * 6) * 2); }
  for (let i = 0; i < 2600; i++) { g.fillStyle = r() > 0.55 ? 'rgba(150,120,80,0.30)' : 'rgba(255,255,255,0.35)'; px(Math.floor(r() * 128) * 2, Math.floor(r() * 128) * 2, 2, 2); }
  for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(96,78,56,0.36)'; px(Math.floor(r() * 128) * 2, Math.floor(r() * 128) * 2, 2, 2); }   // dark grains
  for (let i = 0; i < 90; i++) { const x = Math.floor(r() * 128) * 2, y = Math.floor(r() * 128) * 2; g.fillStyle = 'rgba(255,252,240,0.8)'; px(x, y, 2, 2); g.fillStyle = 'rgba(120,100,72,0.4)'; px(x, y + 2, 2, 2); }   // tiny pale pebbles
  // faint wind ripples
  for (let k = 0; k < 6; k++) { const y0 = Math.floor(r() * 128) * 2; for (let x = 0; x < W; x += 2) { g.fillStyle = 'rgba(170,140,100,0.13)'; px(x, y0 + Math.round(Math.sin(x * 0.05 + k) * 3), 2, 2); } }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 4;
  return tex;
}

/** distance from (x,z) to the path that walks down the sand from the trail end to the dock root */
function pathDist(x: number, z: number): number {
  if (x < 236) return 99;
  const zc = trailZ(Math.min(x, 262)) + 0.4 * Math.sin(x * 0.35);
  return Math.abs(z - zc);
}

export function buildSand(scene: THREE.Scene): void {
  const X0 = 236, X1 = 366, Z0 = -48, Z1 = 60, ST = 1.2;
  const nx = Math.round((X1 - X0) / ST) + 1, nz = Math.round((Z1 - Z0) / ST) + 1;
  const pos: number[] = [], col: number[] = [], uv: number[] = [], qv: number[] = [];
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * ST, z = Z0 + j * ST, q = lakeQ(x, z);
    qv.push(q);
    pos.push(x, meshH(x, z) + 0.09, z);
    uv.push(x / TILE, z / TILE);
    // identical colour recipe to the hills mesh beach, so the outer fade is invisible
    tmp.copy(SAND);
    tmp.lerp(WETSAND, (1 - sstep(1.06, 1.22, q)) * (q >= 1 ? 1 : 0) * 0.85);
    if (q < 1) tmp.lerp(BED_SAND, 0.6).lerp(WETSAND, 0.35);
    // tonal variation: broad dry/damp drifts so the texture never reads as a repeat
    const drift = fbm(x * 0.07, z * 0.07) - 0.5, patch = fbm(x * 0.23 + 40, z * 0.23) - 0.5;
    let k = 1.04 + drift * 0.18 + patch * 0.08;
    // tide marks: thin, wobbling bands parallel to the shore, strongest near the waterline
    const wob = fbm(x * 0.4, z * 0.4) * 0.03;
    const tide = Math.max(0, Math.sin((q + wob) * 78)) ** 6;
    k *= 1 - tide * 0.09 * (1 - sstep(1.1, 1.3, q)) * (q > 1 ? 1 : 0);
    // worn footpath in the sand: trail end to the dock root
    const pd = pathDist(x, z), pathW = 1.5 + (fbm(x * 0.5, 3) - 0.5) * 0.8;
    if (q > 0.98 && q < 1.5) k *= 1 - (1 - sstep(pathW * 0.4, pathW, pd)) * 0.13 * (1 - sstep(1.3, 1.5, q));
    tmp.multiplyScalar(k);
    // alpha: opaque on the beach, fades out inland (q 1.28 -> 1.5) and just under the waterline
    const a = (1 - sstep(1.28, 1.5, q)) * sstep(0.84, 0.95, q);
    col.push(Math.min(1, tmp.r), Math.min(1, tmp.g), Math.min(1, tmp.b), a);
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const inBand = (n: number) => qv[n] > 0.84 && qv[n] < 1.5;
    if (!(inBand(a) || inBand(b) || inBand(c) || inBand(d))) continue;
    if (qv[a] < 0.84 && qv[b] < 0.84 && qv[c] < 0.84 && qv[d] < 0.84) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    map: makeSandTexture(), vertexColors: true, transparent: true, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  mesh.receiveShadow = true;
  mesh.renderOrder = -1;   // draw before the translucent water so the shallows read over the sand
  scene.add(mesh);

  // ── sparse deliberate shoreline detail: shells and pebbles (rocks and driftwood already live in WorldLake) ──
  const r = mulberry32(4242);
  const spots: { x: number; z: number; q: number }[] = [];
  for (let tries = 0; tries < 900 && spots.length < 60; tries++) {
    const ang = r() * Math.PI * 2, m = 1.08 + r() * 0.2;
    const x = LAKE.x + Math.cos(ang) * LAKE.a * m, z = LAKE.z + Math.sin(ang) * LAKE.b * m;
    const q = lakeQ(x, z);
    if (q < 1.05 || q > 1.3 || x < 240 || onDock(x, z) || Math.abs(x - DOCK.x0) < 6 && Math.abs(z - DOCK.z) < 4) continue;
    if (pathDist(x, z) < 1.2) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 1.6)) continue;
    if (meshH(x, z) < WATER_Y + 0.3) continue;
    spots.push({ x, z, q });
  }
  const shellG = new THREE.ConeGeometry(0.16, 0.12, 5), pebG = new THREE.DodecahedronGeometry(0.12, 0);
  const shellM = new THREE.MeshStandardMaterial({ color: 0xf6e8dc, roughness: 0.7, flatShading: true });
  const pebM = new THREE.MeshStandardMaterial({ color: 0x8f8a80, roughness: 0.95, flatShading: true });
  const shells = spots.slice(0, 16), pebs = spots.slice(16, 52);
  const ish = new THREE.InstancedMesh(shellG, shellM, shells.length), ipb = new THREE.InstancedMesh(pebG, pebM, pebs.length);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  shells.forEach((s, n) => {
    e.set(Math.PI / 2 + (r() - 0.5) * 0.3, 0, r() * 6.28); qt.setFromEuler(e);
    const k = 0.8 + r() * 0.6; sc.set(k, k, k); p.set(s.x, meshH(s.x, s.z) + 0.1, s.z);
    ish.setMatrixAt(n, m4.compose(p, qt, sc));
  });
  pebs.forEach((s, n) => {
    e.set(r() * 3, r() * 6, r() * 3); qt.setFromEuler(e);
    const k = 0.5 + r() * 0.9; sc.set(k * 1.2, k * 0.6, k); p.set(s.x, meshH(s.x, s.z) + 0.1, s.z);
    ipb.setMatrixAt(n, m4.compose(p, qt, sc));
  });
  for (const im of [ish, ipb]) { im.castShadow = false; im.receiveShadow = true; scene.add(im); }
}
