// Reusable building kit: props, roofs, windows, doors, shared material sets.
import * as THREE from 'three';


import  { mat, box, rbox, windowBox }  from './BuildingMaterials';

export function frontPath(g: THREE.Group, z: number) {
  for (let i = 0; i < 3; i++) {
    const slab = box(1.5, 0.1, 0.9, mat(0xb9b2a4));
    slab.position.set(0, 0.05, z + 0.7 + i * 1.1);
    g.add(slab);
  }
}

export function entranceSteps(g: THREE.Group, z: number, w = 3) {
  const s1 = box(w, 0.18, 1, mat(0xcfc8b8));
  s1.position.set(0, 0.09, z);
  const s2 = box(w - 0.6, 0.18, 0.8, mat(0xdad3c2));
  s2.position.set(0, 0.27, z - 0.25);
  g.add(s1, s2);
}

// warm wall lamp beside an entrance: dark bracket plus a glowing head
export function wallLamp(g: THREE.Group, x: number, y: number, z: number) {
  const bracket = box(0.12, 0.3, 0.24, mat(0x3d4450, { metalness: 0.4 }));
  bracket.position.set(x, y + 0.24, z);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.3, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb300, emissiveIntensity: 0.9 }),
  );
  head.position.set(x, y, z + 0.06);
  g.add(bracket, head);
}

// rooftop flag pole with a coloured pennant
export function flagPole(g: THREE.Group, x: number, y: number, z: number, color: number, h = 2.2) {
  const pole = box(0.09, h, 0.09, mat(0x9aa2ad, { metalness: 0.4 }));
  pole.position.set(x, y + h / 2, z);
  const flag = box(0.85, 0.5, 0.05, mat(color));
  flag.position.set(x + 0.48, y + h - 0.42, z);
  flag.rotation.y = 0.18;
  g.add(pole, flag);
}
export function dieTexture(pips: 3 | 5): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fdf7ea';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#22201d';
  const spots: [number, number][] =
    pips === 3 ? [[64, 34], [64, 64], [64, 94]] : [[38, 38], [90, 38], [64, 64], [38, 90], [90, 90]];
  for (const [x, y] of spots) {
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function die(pips: 3 | 5): THREE.Mesh {
  const side = mat(0xfdf7ea, { roughness: 0.6 });
  const top = new THREE.MeshStandardMaterial({ map: dieTexture(pips), roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), [side, side, top, side, side, side]);
  m.castShadow = true;
  return m;
}

export function hipRoofC(w: number, d: number, h: number, m: THREE.Material): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.7071, 1, 4);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, 0.5, 0);
  const r = new THREE.Mesh(geo, m);
  r.scale.set(w, h, d);
  r.castShadow = true;
  return r;
}
export function lampPost(g: THREE.Group, x: number, z: number, h = 2.6) {
  const pm = mat(0x2f3338, { metalness: 0.5, roughness: 0.45 });
  const base = box(0.34, 0.18, 0.34, pm); base.position.set(x, 0.09, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 8), pm); pole.position.set(x, h / 2, z);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34),
    new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffb84d, emissiveIntensity: 0.9 }));
  head.position.set(x, h + 0.2, z);
  const cap = box(0.46, 0.1, 0.46, pm); cap.position.set(x, h + 0.45, z);
  g.add(base, pole, head, cap);
}
export function planterBox(g: THREE.Group, x: number, z: number, w: number, bloom: number, hedge = false) {
  const tub = box(w, 0.45, 0.6, mat(0x6b5a48)); tub.position.set(x, 0.23, z);
  const fill = box(w - 0.1, 0.12, 0.5, mat(0x3a2c20)); fill.position.set(x, 0.47, z);
  g.add(tub, fill);
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(hedge ? 0.3 : 0.2, 8, 6), mat(hedge ? 0x2f6b3a : bloom, { roughness: 0.9 }));
    b.position.set(x - w / 2 + 0.25 + (i * (w - 0.5)) / (n - 1), hedge ? 0.78 : 0.68, z);
    if (hedge) b.scale.y = 1.2;
    g.add(b);
  }
}
export function mailbox(g: THREE.Group, x: number, z: number) {
  const post = box(0.1, 0.9, 0.1, mat(0x5c4430)); post.position.set(x, 0.45, z);
  const body = rbox(0.42, 0.3, 0.3, 0.06, mat(0x2a6fb5)); body.position.set(x, 1.0, z);
  const flag = box(0.05, 0.22, 0.05, mat(0xd94a3a)); flag.position.set(x + 0.24, 1.08, z);
  g.add(post, body, flag);
}
export function crateStack(g: THREE.Group, x: number, z: number, col = 0x9a6b3c) {
  const a = box(0.8, 0.7, 0.8, mat(col)); a.position.set(x, 0.35, z);
  const b = box(0.6, 0.55, 0.6, mat(col + 0x101008)); b.position.set(x + 0.05, 0.98, z); b.rotation.y = 0.3;
  const st = box(0.82, 0.08, 0.82, mat(0x5c4430)); st.position.set(x, 0.38, z);
  g.add(a, b, st);
}
export function benchSeat(g: THREE.Group, x: number, z: number, col = 0x8a5a33) {
  const seat = box(1.5, 0.12, 0.5, mat(col)); seat.position.set(x, 0.5, z);
  const back = box(1.5, 0.45, 0.1, mat(col)); back.position.set(x, 0.85, z - 0.22);
  g.add(seat, back);
  for (const lx of [-0.6, 0.6]) { const l = box(0.1, 0.5, 0.4, mat(0x2f3338)); l.position.set(x + lx, 0.25, z); g.add(l); }
}
export function orePile(g: THREE.Group, x: number, z: number) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.9, 6), mat(0x4b4540)); m.position.set(x, 0.45, z); m.castShadow = true;
  g.add(m);
  for (let i = 0; i < 3; i++) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), mat(0x67e8f9, { emissive: 0x22d3ee, emissiveIntensity: 0.6 }));
    gem.position.set(x + (i - 1) * 0.35, 0.55 + (i % 2) * 0.18, z + 0.5); g.add(gem);
  }
}

// ---- Shop & Bank: dedicated architecture, each level adds real structure ----

// shop mass whose ridge runs along X, so the long eave wall is the storefront
export function sideWindows(g: THREE.Group, halfW: number, zs: number[], y: number, w: number, h: number, shutter?: number) {
  for (const sx of [-1, 1]) for (const z of zs) {
    const win = windowBox(w, h);
    win.rotation.y = sx * Math.PI / 2;
    win.position.set(sx * halfW, y, z);
    g.add(win);
    const sill = box(0.34, 0.1, w + 0.3, mat(0x8a7a66));
    sill.position.set(sx * (halfW + 0.12), y - h / 2 - 0.08, z);
    g.add(sill);
    if (shutter !== undefined) for (const dz of [-1, 1]) {
      const sh = box(0.1, h, 0.34, mat(shutter));
      sh.position.set(sx * (halfW + 0.06), y, z + dz * (w / 2 + 0.25));
      g.add(sh);
    }
  }
}
export function rearDetail(g: THREE.Group, z: number, doorCol: number, x = 1.3) {
  const door = rbox(1.3, 2.0, 0.14, 0.04, mat(doorCol));
  door.position.set(x, 1.05, z);
  g.add(door);
  const step = box(1.7, 0.16, 0.7, mat(0x9a9082));
  step.position.set(x, 0.1, z - 0.3);
  g.add(step);
  const pipe = box(0.12, 3.4, 0.12, mat(0x6e6a64));
  pipe.position.set(-x - 1.2, 1.9, z + 0.06);
  g.add(pipe);
  const crate = box(0.8, 0.6, 0.8, mat(0x9a6b3c));
  crate.position.set(-x, 0.4, z - 0.8);
  g.add(crate);
}
export function bistroChairs(g: THREE.Group, tx: number, tz: number, col: number) {
  for (const [dx, dz] of [[-0.85, 0], [0.85, 0]] as const) {
    const seat = box(0.5, 0.1, 0.5, mat(col));
    seat.position.set(tx + dx, 0.5, tz + dz);
    g.add(seat);
    const back = box(0.5, 0.5, 0.08, mat(col));
    back.position.set(tx + dx, 0.82, tz + dz + (dx < 0 ? -0.22 : -0.22));
    back.rotation.y = dx < 0 ? 0.0 : 0.0;
    g.add(back);
    const leg = box(0.1, 0.46, 0.1, mat(0x4a3220));
    leg.position.set(tx + dx, 0.24, tz + dz);
    g.add(leg);
  }
}
export function flowerPot(g: THREE.Group, x: number, z: number, col: number) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.4, 8), mat(0xb4552e));
  pot.position.set(x, 0.2, z);
  g.add(pot);
  const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(col));
  bloom.position.set(x, 0.55, z);
  g.add(bloom);
}
export function dormer(g: THREE.Group, x: number, y: number, z: number, wall: number, roof: number) {
  const b = rbox(1.5, 1.3, 1.1, 0.06, mat(wall));
  b.position.set(x, y, z);
  g.add(b);
  const w = windowBox(0.8, 0.7);
  w.position.set(x, y, z + 0.57);
  g.add(w);
  const r = box(1.9, 0.14, 1.5, mat(roof));
  r.position.set(x, y + 0.78, z);
  g.add(r);
}

export let HV2: Record<string, THREE.Material> | null = null;

export function hv2() {
  if (!HV2) {
    HV2 = {
      stucco: mat(0xffeec6),
      stucco2: mat(0xf5d9a4),
      cream: mat(0xfff7e6),
      shingle: mat(0xd9772e, { roughness: 0.8 }),
      shingle2: mat(0xc2621f, { roughness: 0.8 }),
      ridge: mat(0x9c4a1a),
      wood: mat(0xb86f34),
      woodDark: mat(0x8a5224),
      stone: mat(0xcfc6b4),
      stoneDark: mat(0x9a917f),
      shutter: mat(0x4f7f6a),
      barrel: mat(0x8a5a2b),
      lantern: new THREE.MeshStandardMaterial({ color: 0xffe3a0, emissive: 0xffb84a, emissiveIntensity: 0.9 }),
    };
  }
  return HV2;
}

// Roof plane: width w along x, run along z, front edge lower by `drop`.

export let SV3: Record<string, THREE.MeshStandardMaterial> | null = null;

export function sv3() {
  if (!SV3) SV3 = {
    teal: mat(0x6fc1ae), tealD: mat(0x4a9b8e), coral: mat(0xf2a58a), coralD: mat(0xd9795c),
    awnA: mat(0xe8874a), roofTeal: mat(0x3f7f78), umb: mat(0xe9604a), umb2: mat(0xfff0d6),
    chair: mat(0x7a4f32), tabletop: mat(0xf4e4c1), bunA: mat(0xe9604a), bunB: mat(0xffd36b), bunC: mat(0x6fc1ae),
    glassWarm: mat(0xffe2a0, { roughness: 0.25, emissive: 0xffc870, emissiveIntensity: 0.35 } as any),
  };
  return SV3;
}

export function archWindow(w: number, h: number, shutters = false): THREE.Group {
  const M = houseMats(); const H = hv2();
  const g = new THREE.Group();
  const r = w / 2;
  const glass = box(w, h, 0.05, M.glass); glass.position.set(0, 0, 0.0); g.add(glass);
  const mkArch = (rad: number, depth: number, m: THREE.Material, z: number) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, rad, 0, Math.PI, false); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    const me = new THREE.Mesh(geo, m); me.position.set(0, h / 2, z); me.castShadow = true; return me;
  };
  g.add(mkArch(r + 0.14, 0.08, H.cream, -0.03));
  g.add(mkArch(r, 0.1, M.glass, 0.0));
  for (const sx of [-1, 1]) { const j = box(0.14, h, 0.14, H.cream); j.position.set(sx * (r + 0.07), 0, 0.03); g.add(j); }
  const mull = box(0.06, h + r, 0.08, H.cream); mull.position.set(0, r / 2, 0.06); g.add(mull);
  const sill = box(w + 0.5, 0.14, 0.3, H.stone); sill.position.set(0, -h / 2 - 0.08, 0.1); g.add(sill);
  if (shutters) for (const sx of [-1, 1]) { const s = box(0.36, h + 0.1, 0.07, H.shutter); s.position.set(sx * (r + 0.4), r * 0.2, 0.05); g.add(s); }
  return g;
}


export function balconyV2(w: number, d: number): THREE.Group {
  const H = hv2(); const g = new THREE.Group();
  const floor = box(w, 0.16, d, H.wood); floor.position.y = 0; g.add(floor);
  const front = box(w, 0.1, 0.1, H.woodDark); front.position.set(0, 0.95, d / 2 - 0.05); g.add(front);
  const n = Math.max(3, Math.round(w / 0.4));
  for (let i = 0; i <= n; i++) { const b = box(0.07, 0.85, 0.07, H.woodDark); b.position.set(-w / 2 + 0.05 + (i * (w - 0.1)) / n, 0.5, d / 2 - 0.05); g.add(b); }
  for (const sx of [-1, 1]) {
    const sr = box(0.1, 0.1, d, H.woodDark); sr.position.set(sx * (w / 2 - 0.05), 0.95, 0); g.add(sr);
    const bp = box(0.08, 0.85, 0.08, H.woodDark); bp.position.set(sx * (w / 2 - 0.05), 0.5, d / 2 - 0.05); g.add(bp);
    const br = box(0.12, 0.4, 0.5, H.woodDark); br.position.set(sx * (w / 2 - 0.2), -0.3, d / 2 - 0.3); g.add(br);
  }
  return g;
}


export function cafeTable(g: THREE.Group, x: number, z: number, withUmb: boolean) {
  const S = sv3();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.07, 10), S.tabletop); top.position.set(x, 0.95, z); top.castShadow = true; g.add(top);
  const leg = box(0.08, 0.7, 0.08, S.chair); leg.position.set(x, 0.6, z); g.add(leg);
  for (const sx of [-1, 1]) { const c = box(0.34, 0.08, 0.34, S.chair); c.position.set(x + sx * 0.7, 0.62, z); g.add(c); const bk = box(0.06, 0.4, 0.34, S.chair); bk.position.set(x + sx * 0.86, 0.85, z); g.add(bk); }
  if (withUmb) {
    const pole = box(0.05, 1.7, 0.05, S.chair); pole.position.set(x, 1.55, z); g.add(pole);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.4, 8), S.umb); cone.position.set(x, 2.5, z); cone.castShadow = true; g.add(cone);
  }
}


export function civicLamp(g: THREE.Group, x: number, z: number, h = 2.3) {
  const H = hv2();
  const p = box(0.12, h, 0.12, mat(0x2b2f2a)); p.position.set(x, h / 2, z); g.add(p);
  const bs = box(0.3, 0.25, 0.3, H.stone); bs.position.set(x, 0.12, z); g.add(bs);
  const hd = box(0.34, 0.4, 0.34, mat(0xffe2a0, { emissive: 0xffc870, emissiveIntensity: 0.8 } as any)); hd.position.set(x, h + 0.2, z); g.add(hd);
  const cp = pyramid(0.3, 0.25, mat(0x2b2f2a)); cp.position.set(x, h + 0.55, z); g.add(cp);
}

export function hedgePlanter(g: THREE.Group, x: number, z: number, w = 1.2) {
  const H = hv2();
  const tub = box(w, 0.4, 0.55, H.stone); tub.position.set(x, 0.2, z); g.add(tub);
  const hedge = rbox(w - 0.1, 0.55, 0.45, 0.1, mat(0x3f7f4a)); hedge.position.set(x, 0.66, z); g.add(hedge);
  const top = rbox(w - 0.45, 0.3, 0.35, 0.1, mat(0x57a05c)); top.position.set(x, 1.05, z); g.add(top);
}

export function pyramid(r: number, h: number, m: THREE.Material): THREE.Mesh {
  const me = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), m);
  me.rotation.y = Math.PI / 4; me.castShadow = true; return me;
}

export function slopeRoof(w: number, run: number, drop: number, m: THREE.Material): THREE.Mesh {
  const len = Math.hypot(run, drop);
  const s = box(w, 0.22, len, m);
  s.rotation.x = Math.atan2(drop, run);
  return s;
}

// Arched window: recessed glass, cream arch surround, sill, optional shutters.

export let HOUSE_MATS: Record<string, THREE.MeshStandardMaterial> | null = null;
export function houseMats() {
  if (!HOUSE_MATS) {
    HOUSE_MATS = {
      wall: mat(0xeec9a3),
      wall2: mat(0xd99a74),
      trim: mat(0xfff4e2),
      roof: mat(0x6a4a6e, { roughness: 0.75 }),
      ridge: mat(0x4e3552),
      stone: mat(0x8c8378),
      stoneLight: mat(0xa59d90),
      door: mat(0x3f6f8a, { roughness: 0.6 }),
      glass: mat(0x9fd3e6, { roughness: 0.2, metalness: 0.15 }),
      shutter: mat(0x5f8f6a),
      brick: mat(0xb4552e),
      wood: mat(0x9a6b45),
      hedge: mat(0x4f8a45),
      flowerA: mat(0xf28aa0),
      flowerB: mat(0xffd36b),
      knob: mat(0xe8c15a, { metalness: 0.6, roughness: 0.3 }),
    };
  }
  return HOUSE_MATS;
}

// Walls + gable-end infill + two roof slabs that actually meet at the ridge.
// The ridge runs along local Z; the gable ends face +Z / -Z.
export function gableBlock(w: number, d: number, wallH: number, rise: number, wallM: THREE.Material, ov = 0.45, roofM?: THREE.Material, ridgeM?: THREE.Material): THREE.Group {
  const M = houseMats();
  const g = new THREE.Group();
  const walls = box(w, wallH, d, wallM);
  walls.position.y = wallH / 2;
  g.add(walls);
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rise); tri.closePath();
  const tg = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
  tg.translate(0, 0, -d / 2);
  const gable = new THREE.Mesh(tg, wallM);
  gable.position.y = wallH;
  gable.castShadow = gable.receiveShadow = true;
  g.add(gable);
  const half = w / 2 + ov;
  const ang = Math.atan2(rise, w / 2);
  const len = half / Math.cos(ang);
  for (const sx of [-1, 1]) {
    const slab = box(len, 0.24, d + ov * 2, roofM ?? M.roof);
    slab.rotation.z = -sx * ang;
    slab.position.set((sx * Math.cos(ang) * len) / 2, wallH + rise - (Math.sin(ang) * len) / 2 + 0.14, 0);
    g.add(slab);
    // bargeboard trim along both gable edges
    for (const ez of [-1, 1]) {
      const barge = box(len, 0.18, 0.1, M.trim);
      barge.rotation.z = -sx * ang;
      barge.position.set(slab.position.x, slab.position.y - 0.04, ez * (d / 2 + ov + 0.04));
      g.add(barge);
    }
  }
  const ridge = box(0.34, 0.22, d + ov * 2 + 0.06, ridgeM ?? M.ridge);
  ridge.position.y = wallH + rise + 0.24;
  g.add(ridge);
  // eave trim band where wall meets roof
  const eave = box(w + 0.12, 0.16, d + 0.12, M.trim);
  eave.position.y = wallH - 0.08;
  g.add(eave);
  return g;
}

// Framed window that reads as recessed: proud trim frame, inset glass, mullions, sill.
export function framedWindow(w: number, h: number, shutters = false): THREE.Group {
  const M = houseMats();
  const g = new THREE.Group();
  const glass = box(w, h, 0.04, M.glass);
  glass.position.z = -0.02;
  g.add(glass);
  const t = 0.14;
  for (const sx of [-1, 1]) {
    const jamb = box(t, h + t * 2, 0.16, M.trim);
    jamb.position.set((sx * (w + t)) / 2, 0, 0.04);
    g.add(jamb);
  }
  const head = box(w + t * 2 + 0.12, t + 0.04, 0.2, M.trim);
  head.position.set(0, h / 2 + t / 2, 0.06);
  const sill = box(w + t * 2 + 0.16, 0.12, 0.3, M.trim);
  sill.position.set(0, -h / 2 - 0.08, 0.1);
  const mv = box(0.07, h, 0.08, M.trim);
  mv.position.z = 0.02;
  const mh = box(w, 0.07, 0.08, M.trim);
  mh.position.z = 0.02;
  g.add(head, sill, mv, mh);
  if (shutters) {
    for (const sx of [-1, 1]) {
      const sh = box(w * 0.42, h + 0.1, 0.07, M.shutter);
      sh.position.set(sx * (w / 2 + t + w * 0.21 + 0.04), 0, 0.02);
      g.add(sh);
      for (let i = -1; i <= 1; i++) {
        const slat = box(w * 0.36, 0.05, 0.03, M.trim);
        slat.position.set(sh.position.x, i * h * 0.3, 0.07);
        g.add(slat);
      }
    }
  }
  return g;
}

// Panelled door inside a trimmed frame, with a small stone step.
export function framedDoor(w: number, h: number): THREE.Group {
  const M = houseMats();
  const g = new THREE.Group();
  const leaf = box(w, h, 0.08, M.door);
  leaf.position.set(0, h / 2, -0.02);
  g.add(leaf);
  for (const py of [h * 0.3, h * 0.68]) {
    const panel = box(w * 0.62, h * 0.24, 0.04, M.trim);
    panel.position.set(0, py, 0.04);
    (panel.material as THREE.Material) = M.wall;
    g.add(panel);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.knob);
  knob.position.set(w * 0.32, h * 0.48, 0.08);
  g.add(knob);
  for (const sx of [-1, 1]) {
    const jamb = box(0.16, h + 0.16, 0.18, M.trim);
    jamb.position.set((sx * (w + 0.16)) / 2, (h + 0.16) / 2, 0.04);
    g.add(jamb);
  }
  const lintel = box(w + 0.6, 0.2, 0.24, M.trim);
  lintel.position.set(0, h + 0.18, 0.06);
  g.add(lintel);
  const step = box(w + 0.8, 0.18, 0.7, M.stoneLight);
  step.position.set(0, 0.09, 0.36);
  g.add(step);
  return g;
}

export function hedge(len: number): THREE.Group {
  const M = houseMats();
  const g = new THREE.Group();
  const body = rbox(len, 0.7, 0.7, 0.22, M.hedge);
  body.position.y = 0.35;
  g.add(body);
  return g;
}

export function flowerBox(w: number): THREE.Group {
  const M = houseMats();
  const g = new THREE.Group();
  const planter = box(w, 0.22, 0.3, M.wood);
  g.add(planter);
  for (let i = 0; i < 4; i++) {
    const f = box(0.16, 0.16, 0.16, i % 2 ? M.flowerA : M.flowerB);
    f.position.set(-w / 2 + 0.2 + (i * (w - 0.4)) / 3, 0.18, 0);
    g.add(f);
  }
  const leaves = box(w - 0.1, 0.1, 0.24, M.hedge);
  leaves.position.y = 0.13;
  g.add(leaves);
  return g;
}

// Residential house. Each level adds architecture rather than scaling:
// L1 cottage, L2 side wing (cross gable), L3 covered porch + dormer + hedges,
// L4 full second storey with a balcony over the porch.
