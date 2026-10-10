import * as THREE from 'three';
import { mat, box, rbox, sign } from '../buildings/BuildingMaterials';
import { flowerBox } from '../buildings/BuildingParts';
import { STORE_POS } from '../game/config';
import { makeFurnitureModel, makeBookshelf, makeSofa, makeLamp, fmat } from '../furniture/FurnitureModels';

// Landmark detailing for the two stores: layered facade materials, framed
// openings, rooftop emblems, a pole sign, planter trees and (for the
// Furniture Store) a porch showroom plus a walk-in furniture showroom.

const emissive = (c: number, e: number, i = 0.7) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: i });

function planterTree(x: number, z: number, h = 2.3, leaf = 0x4fa056): THREE.Group {
  const t = new THREE.Group();
  const stone = mat(0x9a948a);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.34, 10), stone);
  ring.position.y = 0.17; ring.castShadow = true; ring.receiveShadow = true;
  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 10), mat(0x4a3220)); soil.position.y = 0.34;
  const trunk = box(0.16, h * 0.55, 0.16, mat(0x7a5230)); trunk.position.y = 0.34 + h * 0.275;
  t.add(ring, soil, trunk);
  const spots: [number, number, number, number][] = [[0, h, 0, 0.62], [0.42, h - 0.35, 0.1, 0.42], [-0.4, h - 0.45, -0.1, 0.4], [0.05, h + 0.45, 0.05, 0.36]];
  spots.forEach(([lx, ly, lz, r], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat(i % 2 ? leaf : 0x5cb860));
    m.position.set(lx, ly, lz); m.rotation.y = i; m.castShadow = true; t.add(m);
  });
  t.position.set(x, 0, z);
  return t;
}

function quoins(g: THREE.Group, x: number, z: number, hgt: number, c: number) {
  for (let i = 0; i < hgt / 0.55; i++) {
    const long = i % 2 === 0;
    const q = box(long ? 0.62 : 0.4, 0.5, long ? 0.4 : 0.62, mat(c));
    q.position.set(x, 0.3 + i * 0.55, z);
    g.add(q);
  }
}

function poleSign(x: number, z: number, text: string, bg: string, accent: number): THREE.Group {
  const p = new THREE.Group();
  const post = box(0.2, 4.4, 0.2, mat(0xf3e9d6)); post.position.y = 2.2;
  const foot = box(0.9, 0.4, 0.9, mat(0x6f655a)); foot.position.y = 0.2;
  p.add(post, foot);
  const blade = rbox(2.2, 0.8, 0.2, 0.06, mat(accent)); blade.position.set(0.7, 3.5, 0);
  const label = sign(text, bg, 2.0, 0.62); label.position.set(0.7, 3.5, 0.12);
  const label2 = label.clone(); label2.position.z = -0.12; label2.rotation.y = Math.PI;
  const arrow = box(1.7, 0.5, 0.16, mat(0xc7432f)); arrow.position.set(0.55, 2.7, 0);
  const tip = box(0.5, 0.5, 0.16, mat(0xc7432f)); tip.rotation.z = Math.PI / 4; tip.position.set(1.45, 2.7, 0);
  const open = sign('OPEN', '#c7432f', 1.5, 0.42); open.position.set(0.5, 2.7, 0.1);
  p.add(blade, label, label2, arrow, tip, open);
  p.position.set(x, 0, z);
  return p;
}

function aFrameBoard(x: number, z: number, text: string, bg: string, rotY = 0): THREE.Group {
  const a = new THREE.Group();
  for (const s of [-1, 1]) {
    const leaf = box(1.1, 1.5, 0.08, mat(0x5b3d28));
    leaf.position.set(0, 0.75, s * 0.28); leaf.rotation.x = -s * 0.22;
    a.add(leaf);
  }
  const face = sign(text, bg, 0.96, 1.28); face.position.set(0, 0.78, 0.33); face.rotation.x = -0.22; a.add(face);
  a.position.set(x, 0, z); a.rotation.y = rotY;
  return a;
}

// ── Blockville Store ──────────────────────────────────────────────────────
export function dressBlockvilleStore(g: THREE.Group) {
  // layered facade: dark brick wainscot, cream corner quoins, window frames
  const wain = box(9.06, 0.95, 7.06, mat(0x8f2c1e)); wain.position.y = 0.48; g.add(wain);
  const belt = box(9.2, 0.14, 7.2, mat(0xfff3e0)); belt.position.y = 0.97; g.add(belt);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) quoins(g, sx * 4.55, sz * 3.55, 4.2, 0xfff3e0);
  // proper framed shopfront windows with mullions, sills and flower boxes
  for (const x of [-2.9, 2.9]) {
    const fr = box(3.0, 0.14, 0.2, mat(0xfff3e0)); fr.position.set(x, 2.84, 3.66);
    const sill = box(3.1, 0.16, 0.34, mat(0xfff3e0)); sill.position.set(x, 0.98, 3.7);
    const mv = box(0.1, 1.8, 0.14, mat(0xfff3e0)); mv.position.set(x, 1.9, 3.68);
    const mh = box(2.7, 0.1, 0.14, mat(0xfff3e0)); mh.position.set(x, 1.9, 3.68);
    g.add(fr, sill, mv, mh);
    const fb = flowerBox(2.4); fb.position.set(x, 1.12, 3.9); g.add(fb);
  }
  // door canopy: blue-red lanterns and a bell sign
  for (const x of [-1.9, 1.9]) {
    const arm = box(0.5, 0.06, 0.06, mat(0x3a241a)); arm.position.set(x, 3.0, 3.8);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.26), emissive(0xffe08a, 0xffb300, 0.9));
    lamp.position.set(x, 2.76, 3.9); g.add(arm, lamp);
  }
  // rooftop emblem: a stack of the game's blocks
  const em = new THREE.Group();
  const cols = [0xe8b04c, 0x4f8fe0, 0x53b56d, 0xe0574f, 0xf4eddc, 0x9b5a89];
  let ci = 0;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
    const b = rbox(1.0, 1.0, 1.0, 0.1, mat(cols[ci++ % cols.length]));
    b.position.set((i - (2 - row) / 2) * 1.04, 0.5 + row * 1.0, 0);
    b.rotation.y = (row * 0.12) - 0.1 + i * 0.06;
    em.add(b);
  }
  em.position.set(0, 5.04, 2.6);
  g.add(em);
  // rooftop units + skylight so the roof is not a blank slab
  for (const x of [-2.6, -1.3]) { const u = box(0.9, 0.55, 0.9, mat(0xb9b2a4)); u.position.set(x, 5.25, -1.2); g.add(u); const f = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), mat(0x3d3428)); f.position.set(x, 5.55, -1.2); g.add(f); }
  // pole sign, tree planters and an A-frame board outside
  g.add(poleSign(-6.6, 4.4, 'BLOCKS', '#d8452f', 0xfff3e0));
  g.add(planterTree(-5.5, 5.0));
  g.add(planterTree(5.7, 5.6, 2.0, 0x68b45f));
  g.add(aFrameBoard(-2.8, 5.4, 'FRESH BLOCKS', '#53b56d', 0.2));
  // outdoor display stack barrels of cubes by the door
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 0.7, 10), mat(0x7a5230)); barrel.position.set(2.4, 0.35, 4.7); barrel.castShadow = true; g.add(barrel);
  for (const [dx, dz, c] of [[-0.12, 0, 0xe8b04c], [0.14, 0.1, 0x4f8fe0], [0, -0.14, 0x53b56d]] as [number, number, number][]) {
    const b = rbox(0.34, 0.34, 0.34, 0.05, mat(c)); b.position.set(2.4 + dx, 0.88, 4.7 + dz); b.rotation.y = dx * 6; g.add(b);
  }
}

// ── Furniture Store exterior ───────────────────────────────────────────
export function dressFurnitureStore(g: THREE.Group, colliders: { x: number; z: number; hw: number; hd: number }[]) {
  const FX = STORE_POS.x + 13, FZ = STORE_POS.z;
  // wood-plank wainscot + blue cap band over the (now cream) walls
  const wain = box(9.26, 1.0, 7.16, mat(0x8a6240)); wain.position.y = 0.5; g.add(wain);
  for (let i = 0; i < 9; i++) { const pl = box(0.03, 0.96, 0.04, mat(0x6f4a2e)); pl.position.set(-4.0 + i, 0.5, 3.6); g.add(pl); }
  const band = box(9.5, 0.7, 7.4, mat(0x2f5f9e)); band.position.y = 3.72; g.add(band);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) quoins(g, sx * 4.62, sz * 3.6, 3.4, 0x2f5f9e);
  // window frames, sills, flower boxes
  for (const x of [-2.8, 2.8]) {
    const sill = box(2.7, 0.16, 0.34, mat(0xfff3e0)); sill.position.set(x, 1.0, 3.72);
    const mv = box(0.09, 1.7, 0.12, mat(0xfff3e0)); mv.position.set(x, 1.9, 3.68);
    const top = box(2.6, 0.12, 0.2, mat(0xfff3e0)); top.position.set(x, 2.78, 3.68);
    const fb = flowerBox(2.1); fb.position.set(x, 1.12, 3.9);
    g.add(sill, mv, top, fb);
  }
  // rooftop emblem: a big blue armchair on the sign board announces the trade from afar
  const chair = makeFurnitureModel('velvet-chair', '#4f8fe0');
  chair.scale.setScalar(1.45); chair.position.set(0, 4.84, 3.78);
  g.add(chair);
  // porch showroom under the awning: real pieces on a plank deck, either side of the path
  const deckMat = mat(0xc9a06a);
  const deckL = box(3.7, 0.14, 2.0, deckMat); deckL.position.set(-3.1, 0.07, 4.65);
  const deckR = box(3.7, 0.14, 2.0, deckMat); deckR.position.set(3.1, 0.07, 4.65);
  g.add(deckL, deckR);
  const sofa = makeSofa('#c8453a'); sofa.scale.setScalar(0.72); sofa.position.set(-3.1, 0.14, 5.15); g.add(sofa);
  const shelf = makeBookshelf(1.5, 2.2); shelf.position.set(-3.7, 0.14, 3.95); g.add(shelf);
  const lampL = makeLamp(); lampL.scale.setScalar(0.8); lampL.position.set(-1.45, 0.14, 4.0); g.add(lampL);
  const bedD = makeFurnitureModel('oak-bed', '#4f8fe0'); bedD.scale.setScalar(0.62); bedD.rotation.y = -Math.PI / 2; bedD.position.set(3.9, 0.14, 4.55); g.add(bedD);
  const tab = makeFurnitureModel('worktable'); tab.scale.setScalar(0.72); tab.position.set(2.9, 0.14, 5.45); g.add(tab);
  const ch1 = makeFurnitureModel('block-chair', '#e0a54b'); ch1.scale.setScalar(0.7); ch1.position.set(2.2, 0.14, 5.45); ch1.rotation.y = Math.PI / 2; g.add(ch1);
  const pl = makeFurnitureModel('plant'); pl.scale.setScalar(0.8); pl.position.set(1.6, 0.14, 4.0); g.add(pl);
  g.add(planterTree(-5.9, 5.3, 2.1));
  g.add(planterTree(5.9, 5.7, 2.4, 0x68b45f));
  g.add(aFrameBoard(1.9, 6.6, 'FREE DELIVERY', '#2f5f9e', -0.25));
  colliders.push(
    { x: FX - 3.1, z: FZ + 5.15, hw: 1.15, hd: 0.55 },
    { x: FX + 3.9, z: FZ + 4.55, hw: 0.55, hd: 0.9 },
  );
}

// ── Furniture Store walk-in showroom ───────────────────────────────────
export function buildFurnitureShowroom(ctx: { colliders: { x: number; z: number; hw: number; hd: number }[]; scene: THREE.Scene; storeLights?: THREE.Light[] }) {
  const FX = STORE_POS.x + 13, FZ = STORE_POS.z;
  const g = new THREE.Group();
  const inner = new THREE.Mesh(
    new THREE.BoxGeometry(8.8, 4.2, 6.8),
    new THREE.MeshStandardMaterial({ color: 0xf1e6d2, side: THREE.BackSide, roughness: 1 }),
  );
  inner.position.y = 2.1; g.add(inner);
  // wood plank floor
  const tones = [0xb78556, 0xa9784c, 0xbf8d5d, 0xb08050];
  for (let i = 0; i < 11; i++) {
    const p = box(8.6, 0.06, 0.6, mat(tones[i % 4])); p.position.set(0, 0.03, -3.3 + i * 0.66); p.castShadow = false; g.add(p);
  }
  // blue wall base + picture rail
  for (const [w, d, x, z] of [[8.7, 0.1, 0, -3.36], [0.1, 6.7, -4.36, 0], [0.1, 6.7, 4.36, 0]] as number[][]) {
    const b = box(w, 1.0, d, mat(0x35639f)); b.position.set(x, 0.5, z); g.add(b);
    const r = box(w, 0.1, d + 0.04, mat(0xfff3e0)); r.position.set(x, 1.05, z); g.add(r);
  }
  // blue runner marking the clear walking path from the door
  const run = box(1.5, 0.05, 6.0, mat(0x2f5f9e)); run.position.set(0, 0.07, 0.1); g.add(run);
  const runEdge = box(1.7, 0.04, 6.2, mat(0xfff3e0)); runEdge.position.set(0, 0.06, 0.1); g.add(runEdge);
  const place = (m: THREE.Object3D, x: number, z: number, ry = 0, s = 1) => { m.position.set(x, 0.06, z); m.rotation.y = ry; m.scale.setScalar(s); g.add(m); return m; };
  // left: two bedrooms on rugs, headboards to the wall
  place(makeFurnitureModel('berry-rug', '#8c507c'), -3.0, -2.2, 0, 1);
  place(makeFurnitureModel('sky-bed', '#5d83b8'), -3.05, -2.2, 0, 0.92);
  place(makeFurnitureModel('sun-rug', '#d6a73d'), -3.1, 0.15, 0, 0.9);
  place(makeFurnitureModel('oak-bed', '#9b6841'), -3.05, 0.15, 0, 0.92);
  place(makeFurnitureModel('plant'), -3.95, 1.9, 0.5, 0.9);
  place(makeFurnitureModel('town-painting', '#78a8b8'), -3.4, 2.65, 0.2, 0.9);
  // right: living room + dining
  place(makeFurnitureModel('sun-rug', '#d6a73d'), 3.0, -1.4, 0, 1);
  place(makeSofa('#c8453a'), 3.0, -2.75, 0, 0.9);
  place(makeFurnitureModel('neon-table', '#3c9fa4'), 3.0, -1.1, 0, 0.9);
  place(makeFurnitureModel('velvet-chair', '#9b5a89'), 1.85, -2.7, 0.35, 0.95);
  place(makeFurnitureModel('worktable'), 3.1, 0.95, 0, 0.9);
  place(makeFurnitureModel('block-chair', '#e0a54b'), 2.3, 0.95, Math.PI / 2, 0.9);
  place(makeFurnitureModel('block-chair', '#e0a54b'), 3.95, 0.95, -Math.PI / 2, 0.9);
  place(makeFurnitureModel('trophy'), 3.1, 0.95, 0, 0.32).position.y = 1.36;
  // back wall: framed pictures and shelving
  place(makeBookshelf(2.0, 3.0), -1.0, -3.0, 0, 1);
  for (const [fx, c] of [[-0.2, 0xf4b067], [0.7, 0x9fd3ea]] as [number, number][]) {
    const fr = box(0.6, 0.8, 0.06, mat(0xc99a62)); fr.position.set(fx + 0.2, 2.5, -3.32);
    const pic = box(0.46, 0.66, 0.05, mat(c)); pic.position.set(fx + 0.2, 2.5, -3.28);
    g.add(fr, pic);
  }
  // service counter with a cash register, front right
  const counter = rbox(2.6, 1.0, 0.8, 0.07, mat(0x8a5a33)); counter.position.set(3.0, 0.55, 2.55);
  const ctop = box(2.8, 0.1, 0.95, mat(0xfff3e0)); ctop.position.set(3.0, 1.1, 2.55);
  const reg = box(0.5, 0.35, 0.4, mat(0x3a3a46)); reg.position.set(3.7, 1.33, 2.55);
  g.add(counter, ctop, reg);
  // pendant lamps + one warm light
  for (const [lx, lz] of [[-2.8, -1.0], [0, 0], [2.8, -1.2]] as number[][]) {
    const cord = box(0.04, 0.9, 0.04, mat(0x3d3428)); cord.position.set(lx, 3.7, lz);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.46, 0.4, 10), fmat('#fff0c8', 0xffdc8a, 1.1));
    shade.position.set(lx, 3.2, lz);
    g.add(cord, shade);
  }
  const warm = new THREE.PointLight(0xffe2b0, 48, 18, 1.6); warm.position.set(0, 3.4, 0);
  warm.visible = false; // switched on by the engine while the resident is inside the showroom
  ctx.storeLights?.push(warm);
  g.add(warm);
  g.position.set(FX, 0, FZ);
  ctx.scene.add(g);
  ctx.colliders.push(
    { x: FX - 3.05, z: FZ - 2.2, hw: 1.15, hd: 0.85 }, { x: FX - 3.05, z: FZ + 0.15, hw: 1.15, hd: 0.85 },
    { x: FX + 3.0, z: FZ - 2.75, hw: 1.6, hd: 0.7 }, { x: FX + 3.0, z: FZ - 1.1, hw: 1.0, hd: 0.55 },
    { x: FX + 3.1, z: FZ + 0.95, hw: 0.95, hd: 0.55 }, { x: FX + 3.0, z: FZ + 2.55, hw: 1.4, hd: 0.5 },
    { x: FX - 1.0, z: FZ - 3.0, hw: 1.0, hd: 0.3 },
  );
}
