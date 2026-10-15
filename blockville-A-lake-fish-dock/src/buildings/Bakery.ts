//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, rbox, sign, stripedAwning }  from './BuildingMaterials';
import  { wallLamp, flowerPot, hv2, archWindow, balconyV2, hedgePlanter, gableBlock, framedDoor }  from './BuildingParts';

export function buildBakeryV3(level: number): THREE.Group {
  const H = hv2();
  const peach = mat(0xffd8ae), peachD = mat(0xf0bd8a), brick = mat(0xb4552e), bread = mat(0xc98a3c), crust = mat(0x8c5a2a);
  const g = new THREE.Group();
  const W = 5.6, D = 4.6, fh = 2.7, base = 0.4, rise = 1.9, fz = D / 2;
  const F = level >= 3 ? 2 : 1, wallH = F * fh;
  const found = box(W + 0.4, base, D + 0.4, H.stone); found.position.y = base / 2; g.add(found);
  const main = gableBlock(W, D, wallH, rise, peach, 0.5, H.shingle, H.ridge); main.position.y = base; g.add(main);
  const tb = box(W + 0.06, 0.9, D + 0.06, H.wood); tb.position.y = base + 0.45; g.add(tb);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const q = box(0.2, wallH, 0.2, H.cream); q.position.set(sx * (W / 2 + 0.02), base + wallH / 2, sz * (D / 2 + 0.02)); g.add(q); }
  const band = box(W + 0.16, 0.14, D + 0.16, H.cream); band.position.y = base + 0.95; g.add(band);
  // front: framed door left, display window with bread right, scalloped awning, hanging sign
  const door = framedDoor(1.05, 2.1); door.position.set(-1.1, base, fz + 0.02); g.add(door);
  const bulk = box(2.2, 0.8, 0.14, H.stone); bulk.position.set(1.3, base + 0.4, fz + 0.06); g.add(bulk);
  const dw = archWindow(1.7, 1.1, false); dw.position.set(1.3, base + 1.55, fz + 0.08); g.add(dw);
  for (const [bx, kind] of [[0.8, 0], [1.3, 1], [1.8, 0]] as [number, number][]) {
    if (kind === 0) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8), bread); b.rotation.z = Math.PI / 2; b.position.set(bx, base + 1.15, fz - 0.05); g.add(b); }
    else { const b = rbox(0.4, 0.28, 0.2, 0.1, crust); b.position.set(bx, base + 1.25, fz - 0.05); g.add(b); }
  }
  stripedAwning(g, W - 0.8, base + 2.25, fz + 0.6, 0xe6b455, 0xb4552e, 8, 1.1);
  const arm = box(0.9, 0.07, 0.07, H.woodDark); arm.position.set(-2.4, base + 3.2, fz + 0.5); g.add(arm);
  const hs = sign('BREAD', '#8c5a2a', 0.85, 0.5); hs.position.set(-2.4, base + 2.88, fz + 0.5); g.add(hs);
  const nm = sign('BAKERY', '#b4552e', 2.4, 0.6); nm.position.set(0, base + wallH + 0.15 + (level >= 3 ? 0 : 0.2), fz + 0.1); if (level < 3) nm.position.y = base + 3.35; g.add(nm);
  wallLamp(g, -2.2, base + 1.9, fz + 0.12);
  // chimney with smoke puffs
  const ch = rbox(0.7, 2.0, 0.7, 0.06, brick); ch.position.set(W / 2 - 0.9, base + wallH + rise - 0.2, -0.6); g.add(ch);
  const chc = box(0.9, 0.14, 0.9, H.stone); chc.position.set(W / 2 - 0.9, base + wallH + rise + 0.85, -0.6); g.add(chc);
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + i * 0.1, 0), mat(0xf3f1ec)); p.position.set(W / 2 - 0.9 + i * 0.2, base + wallH + rise + 1.3 + i * 0.5, -0.6); g.add(p); }
  // side windows with shutters, rear door and window
  for (const sx of [-1, 1]) { const w = archWindow(0.8, 1.2, true); w.rotation.y = sx * Math.PI / 2; w.position.set(sx * (W / 2 + 0.08), base + 1.6, 0.2); g.add(w); }
  const rd = framedDoor(0.9, 2.0); rd.rotation.y = Math.PI; rd.position.set(1.2, base, -fz - 0.02); g.add(rd);
  // frontage: bread basket, flour sacks, flower pot
  const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.35, 10), H.wood); bk.position.set(2.5, 0.18, fz + 1.0); g.add(bk);
  for (let i = 0; i < 3; i++) { const lf = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6), bread); lf.rotation.z = Math.PI / 2 - 0.5 + i * 0.5; lf.position.set(2.5 - 0.1 + i * 0.1, 0.45, fz + 1.0); g.add(lf); }
  for (const [sx2, sy] of [[-2.5, 0], [-2.0, 0]] as [number, number][]) { const s = rbox(0.5, 0.55, 0.4, 0.15, mat(0xf2ead8)); s.position.set(sx2, 0.28 + sy, fz + 1.0); g.add(s); }
  flowerPot(g, 0.1, fz + 1.0, 0xe087a0);
  // L2: bake-house lean-to annex with its own oven chimney
  if (level >= 2) {
    const aw = 2.4, ad = D - 0.8, ah = 2.2, ax = W / 2 + aw / 2 - 0.1;
    const af = box(aw + 0.3, base, ad + 0.3, H.stone); af.position.set(ax, base / 2, -0.2); g.add(af);
    const ab = box(aw, ah, ad, peachD); ab.position.set(ax, base + ah / 2, -0.2); g.add(ab);
    const ar = gableBlock(ad, aw, 0.05, 0.9, peachD, 0.3, H.shingle2, H.ridge); ar.rotation.y = Math.PI / 2; ar.position.set(ax, base + ah, -0.2); g.add(ar);
    const oven = rbox(0.6, 1.9, 0.6, 0.06, brick); oven.position.set(ax + 0.5, base + ah + 1.0, -0.8); g.add(oven);
    const w = archWindow(0.9, 1.1, false); w.position.set(ax, base + 1.4, ad / 2 - 0.2 + 0.08); g.add(w);
    const od = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), brick); od.position.set(ax + aw / 2 + 0.2, 0.5, -0.2); g.add(od);
  }
  // L3: second floor windows + balcony
  if (level >= 3) {
    for (const x of [-1.6, 0, 1.6]) { const w = archWindow(0.85, 1.1, x !== 0); w.position.set(x, base + fh + 1.3, fz + 0.08); g.add(w); }
    const b = balconyV2(2.0, 0.9); b.position.set(0, base + fh + 0.62, fz + 0.45); g.add(b);
  }
  // L4: flag, planters and a barrel
  if (level >= 4) {
    for (const x of [-2.6, 2.6]) hedgePlanter(g, x, fz + 1.7, 0.9);
    const pole = box(0.07, 1.2, 0.07, H.woodDark); pole.position.set(0, base + wallH + rise + 0.5, 0.9); g.add(pole);
    const fl = box(0.65, 0.35, 0.05, mat(0xb4552e)); fl.position.set(0.35, base + wallH + rise + 0.9, 0.9); g.add(fl);
  }
  return g;
}


