//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { box }  from './BuildingMaterials';
import  { mailbox, flowerPot, hv2, archWindow, balconyV2, slopeRoof, houseMats, gableBlock, framedDoor, hedge }  from './BuildingParts';

export function buildHouse(level: number): THREE.Group {
  const M = houseMats(); const H = hv2();
  const g = new THREE.Group();
  const W = 5.4, D = 4.8, fh = 2.5, base = 0.45;
  const F = level >= 4 ? 3 : level >= 3 ? 2 : 1;
  const wallH = F * fh;
  const rise = 2.1;
  const fz = D / 2;

  const found = box(W + 0.45, base, D + 0.45, H.stone); found.position.y = base / 2; g.add(found);
  const main = gableBlock(W, D, wallH, rise, H.stucco, 0.5, H.shingle, H.ridge);
  main.position.y = base; g.add(main);
  // timber-tone quoins on corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const q = box(0.22, wallH, 0.22, H.stucco2); q.position.set(sx * (W / 2 + 0.02), base + wallH / 2, sz * (D / 2 + 0.02)); g.add(q);
  }
  // stringcourses between storeys
  for (let k = 1; k < F; k++) { const b = box(W + 0.2, 0.16, D + 0.2, H.cream); b.position.y = base + k * fh; g.add(b); }

  // ground-floor entrance
  const door = framedDoor(1.15, 2.05); door.position.set(0, base, fz + 0.02); g.add(door);
  for (const x of [-1.8, 1.8]) {
    if (level >= 2 && x > 0) continue; // annex takes the right bay
    const w = archWindow(0.9, 1.0, true); w.position.set(x, base + 1.35, fz + 0.06); g.add(w);
  }
  // upper floors
  for (let k = 1; k < F; k++) {
    for (const x of [-1.8, 0, 1.8]) {
      const w = archWindow(0.9, 1.0, x !== 0); w.position.set(x, base + k * fh + 1.3, fz + 0.06); g.add(w);
    }
    // wooden balconies in front of the outer windows
    for (const x of [-1.8, 1.8]) {
      const b = balconyV2(1.7, 0.9); b.position.set(x, base + k * fh + 0.62, fz + 0.45); g.add(b);
    }
  }
  // gable window
  const gw = box(0.5, 0.5, 0.06, M.glass); gw.position.set(0, base + wallH + 0.95, fz + 0.04); g.add(gw);
  const gwf = box(0.7, 0.7, 0.04, H.cream); gwf.position.set(0, base + wallH + 0.95, fz + 0.02); g.add(gwf);
  // side + rear windows per floor
  for (let k = 0; k < F; k++) {
    for (const sx of [-1, 1]) {
      if (k === 0 && level >= 2 && sx === 1) continue;
      const sw = archWindow(0.9, 1.0); sw.rotation.y = (sx * Math.PI) / 2; sw.position.set(sx * (W / 2 + 0.06), base + k * fh + 1.3, -0.3); g.add(sw);
    }
    const rw = archWindow(0.9, 1.0); rw.rotation.y = Math.PI; rw.position.set(1.4, base + k * fh + 1.3, -fz - 0.06); g.add(rw);
  }
  const rd = framedDoor(1.0, 1.9); rd.rotation.y = Math.PI; rd.position.set(-1.0, base, -fz - 0.02); g.add(rd);
  // brick chimney with cap
  const chimH = rise + 0.7;
  const chim = box(0.6, chimH, 0.6, M.brick); chim.position.set(-1.5, base + wallH + chimH / 2 - 0.3, -1.1); g.add(chim);
  const cap = box(1.0, 0.18, 1.0, H.stone); cap.position.set(-1.5, base + wallH + chimH - 0.2, -1.1); g.add(cap);

  // porch (all levels): shingle lean-to roof on posts, railing, stone steps, lanterns
  {
    const pw = 4.0, pd = 1.7, pz = fz + pd / 2;
    const deck = box(pw, 0.3, pd, H.wood); deck.position.set(0, 0.3, pz); g.add(deck);
    const roofTop = base + 2.75, drop = 0.5;
    const roof = slopeRoof(pw + 0.6, pd + 0.5, drop, H.shingle); roof.position.set(0, roofTop - drop / 2 + 0.1, pz + 0.1); g.add(roof);
    const fascia = box(pw + 0.6, 0.2, 0.1, H.woodDark); fascia.position.set(0, roofTop - drop + 0.0, pz + pd / 2 + 0.33); g.add(fascia);
    for (const sx of [-1, 1]) {
      const post = box(0.2, roofTop - drop - 0.45, 0.2, H.woodDark); post.position.set(sx * (pw / 2 - 0.15), 0.45 + (roofTop - drop - 0.45) / 2, pz + pd / 2 - 0.15); g.add(post);
      const lan = box(0.22, 0.3, 0.22, H.lantern); lan.position.set(sx * (pw / 2 - 0.15), roofTop - drop - 0.45, pz + pd / 2 - 0.15 + 0.2); g.add(lan);
      // side rails
      const sr = box(0.1, 0.1, pd - 0.2, H.woodDark); sr.position.set(sx * (pw / 2 - 0.15), 1.3, pz); g.add(sr);
      // front rail halves, leaving a gap for steps
      const rl = box(pw / 2 - 0.9, 0.1, 0.1, H.woodDark); rl.position.set(sx * (0.6 + (pw / 2 - 0.9) / 2), 1.3, pz + pd / 2 - 0.15); g.add(rl);
      for (let i = 0; i < 4; i++) { const b = box(0.07, 0.7, 0.07, H.woodDark); b.position.set(sx * (0.8 + i * 0.35), 0.95, pz + pd / 2 - 0.15); g.add(b); }
    }
    for (let i = 0; i < 3; i++) { const st = box(1.4 - i * 0.05, 0.18, 0.45, H.stone); st.position.set(0, 0.34 - i * 0.12, fz + pd + 0.22 + i * 0.4); g.add(st); }
  }
  // barrel beside the porch
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.28, 0.7, 10), H.barrel); barrel.position.set(2.7, 0.35, fz + 1.2); barrel.castShadow = true; g.add(barrel);

  // L2: lean-to annex on the right with oven chimney + arched window
  if (level >= 2) {
    const aw = 2.5, ad = 3.4, ah = 2.2, ax = W / 2 + aw / 2 - 0.1;
    const af = box(aw + 0.35, base, ad + 0.35, H.stone); af.position.set(ax, base / 2, 0.1); g.add(af);
    const ab = box(aw, ah, ad, H.stucco2); ab.position.set(ax, base + ah / 2, 0.1); g.add(ab);
    const ar = box(aw + 0.9, 0.22, ad + 0.7, H.shingle2); ar.rotation.z = -0.3; ar.position.set(ax + 0.2, base + ah + 0.25, 0.1); g.add(ar);
    const aw2 = archWindow(0.9, 0.95, true); aw2.position.set(ax, base + 1.3, 0.1 + ad / 2 + 0.06); g.add(aw2);
    // round oven vent with wood hatch on the outer wall
    const hatch = box(0.05, 0.7, 0.55, H.woodDark); hatch.position.set(ax + aw / 2 + 0.03, base + 0.9, 0.1); g.add(hatch);
    const hf = box(0.04, 0.9, 0.75, H.cream); hf.position.set(ax + aw / 2 + 0.01, base + 0.9, 0.1); g.add(hf);
    const oven = box(0.6, 1.3, 0.6, M.brick); oven.position.set(ax + 0.4, base + ah + 0.9, -0.9); g.add(oven);
    const ocap = box(0.8, 0.14, 0.8, H.stone); ocap.position.set(ax + 0.4, base + ah + 1.58, -0.9); g.add(ocap);
  }
  // L3+: front gable dormer feel via cream frieze + extra eave bracket row
  if (level >= 3) {
    for (const sx of [-1, 1]) { const br = box(0.14, 0.4, 0.5, H.woodDark); br.position.set(sx * (W / 2 - 0.3), base + wallH - 0.3, fz + 0.28); g.add(br); }
    for (const x of [-3.0, 3.0]) { const h = hedge(1.6); h.position.set(x * 0.8, 0, fz + 2.3); g.add(h); }
  }
  // L4: wooden attic hatch + flag pole
  if (level >= 4) {
    const pole = box(0.08, 1.4, 0.08, H.woodDark); pole.position.set(0, base + wallH + rise + 0.9, 0); g.add(pole);
    const flag = box(0.7, 0.4, 0.04, M.brick); flag.position.set(0.38, base + wallH + rise + 1.4, 0); g.add(flag);
  }
  // path + residential props
  for (let i = 0; i < 3; i++) { const st = box(1.0, 0.08, 0.6, M.stoneLight); st.position.set(0, 0.04, fz + 2.9 + i * 0.8); g.add(st); }
  mailbox(g, 3.0, 5.0);
  flowerPot(g, -2.4, fz + 1.2, 0xe05a8a);
  return g;
}

