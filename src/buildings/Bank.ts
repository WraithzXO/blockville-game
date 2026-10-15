//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, sign }  from './BuildingMaterials';
import  { wallLamp, hv2, archWindow, civicLamp, hedgePlanter, pyramid, gableBlock, framedDoor }  from './BuildingParts';

// ---- Blockville architecture v3: Bank + Bakery (reference-inspired) --------
export function buildBankV3(level: number): THREE.Group {
  const H = hv2();
  const sand = mat(0xf0d8a8), sandD = mat(0xd2b078), green = mat(0x2f6b4c), brass = mat(0xd4a838), copper = mat(0x4fa58f);
  const g = new THREE.Group();
  const W = 6.0, D = 5.0, fh = 2.9, base = 0.5, rise = 1.9, fz = D / 2;
  const F = level >= 3 ? 2 : 1, wallH = F * fh;
  const found = box(W + 0.5, base, D + 0.5, H.stone); found.position.y = base / 2; g.add(found);
  const main = gableBlock(W, D, wallH, rise, sand, 0.45, green, brass); main.position.y = base; g.add(main);
  // rusticated corner quoins
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < F * 4; i++) {
    const q = box(0.34, 0.5, 0.34, i % 2 ? sandD : H.cream); q.position.set(sx * (W / 2), base + 0.3 + i * 0.72, sz * (D / 2)); g.add(q);
  }
  const band = box(W + 0.2, 0.18, D + 0.2, H.cream); band.position.y = base + 0.95; g.add(band);
  const cornice = box(W + 0.3, 0.22, D + 0.3, H.cream); cornice.position.y = base + wallH - 0.05; g.add(cornice);
  // portico: 4 columns, entablature and a pediment
  const pz = fz + 0.95;
  const slab = box(4.2, 0.2, 1.9, H.stone); slab.position.set(0, base + 0.1, pz - 0.2); g.add(slab);
  for (let i = 0; i < 3; i++) { const st = box(3.0 - i * 0.2, 0.16, 0.5, H.stone); st.position.set(0, 0.08 + i * 0.16, pz + 1.0 + (2 - i) * 0.0 + 0.3 - i * 0.0); g.add(st); }
  for (const cx of [-1.8, -0.6, 0.6, 1.8]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, fh - 0.5, 10), H.cream); col.position.set(cx, base + 0.2 + (fh - 0.5) / 2, pz); col.castShadow = true; g.add(col);
    const cap = box(0.55, 0.16, 0.55, brass); cap.position.set(cx, base + fh - 0.2, pz); g.add(cap);
    const cb = box(0.5, 0.16, 0.5, H.stone); cb.position.set(cx, base + 0.28, pz); g.add(cb);
  }
  const ent = box(4.5, 0.3, 1.6, H.cream); ent.position.set(0, base + fh - 0.02, pz - 0.15); g.add(ent);
  const ped = gableBlock(4.5, 1.4, 0.05, 0.85, sand, 0.15, green, brass); ped.position.set(0, base + fh + 0.12, pz - 0.15); g.add(ped);
  const board = sign('BANK', '#2f6b4c', 2.0, 0.52); board.position.set(0, base + fh + 0.02 + 0.05, pz + 0.66); g.add(board);
  const em = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), brass); em.rotation.x = Math.PI / 2; em.position.set(0, base + fh + 0.7, pz + 0.65); g.add(em);
  // entrance: framed double doors
  for (const dx of [-0.5, 0.5]) { const d = framedDoor(0.95, 2.2); d.position.set(dx, base, fz + 0.02); g.add(d); }
  wallLamp(g, -1.7, base + 2.0, fz + 0.12); wallLamp(g, 1.7, base + 2.0, fz + 0.12);
  // tall arched windows flanking the portico
  for (const wx of [-2.45, 2.45]) { const w = archWindow(0.85, 1.7, true); w.position.set(wx, base + 1.75, fz + 0.08); g.add(w); }
  // side + rear windows and a service door
  for (const sx of [-1, 1]) for (const z of [-1.2, 1.2]) { const w = archWindow(0.8, 1.4, false); w.rotation.y = sx * Math.PI / 2; w.position.set(sx * (W / 2 + 0.08), base + 1.6, z); g.add(w); }
  const rd = framedDoor(0.9, 2.0); rd.rotation.y = Math.PI; rd.position.set(1.4, base, -fz - 0.02); g.add(rd);
  const rw = archWindow(0.9, 1.3, false); rw.rotation.y = Math.PI; rw.position.set(-1.4, base + 1.6, -fz - 0.08); g.add(rw);
  hedgePlanter(g, -2.6, fz + 1.9); hedgePlanter(g, 2.6, fz + 1.9);
  civicLamp(g, -3.6, fz + 2.0); civicLamp(g, 3.6, fz + 2.0);
  // L2: low flanking wings with their own roofs and a window each
  if (level >= 2) for (const sx of [-1, 1]) {
    const ww = 2.1, wd = D - 1.2, wh = 2.3;
    const wing = gableBlock(ww, wd, wh, 1.1, sand, 0.3, green, brass); wing.position.set(sx * (W / 2 + ww / 2), base, -0.1); g.add(wing);
    const wf = box(ww + 0.3, base, wd + 0.3, H.stone); wf.position.set(sx * (W / 2 + ww / 2), base / 2, -0.1); g.add(wf);
    const w = archWindow(0.8, 1.3, true); w.position.set(sx * (W / 2 + ww / 2), base + 1.3, wd / 2 - 0.1 + 0.08); g.add(w);
  }
  // L3: upper-storey arched windows and a copper dome on a drum
  if (level >= 3) {
    for (const wx of [-2.0, 0, 2.0]) { const w = archWindow(0.8, 1.3, wx !== 0); w.position.set(wx, base + fh + 1.4, fz + 0.08); g.add(w); }
    if (level === 3) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.7, 12), H.cream); drum.position.set(0, base + wallH + rise + 0.15, 0); g.add(drum);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), copper); dome.position.set(0, base + wallH + rise + 0.5, 0); dome.castShadow = true; g.add(dome);
      const fin = box(0.08, 0.6, 0.08, brass); fin.position.set(0, base + wallH + rise + 1.7, 0); g.add(fin);
    }
  }
  // L4: clock tower with copper cap + rear annex
  if (level >= 4) {
    const tw = 2.0, th = 3.4, ty = base + wallH + rise - 0.2;
    const tb = box(tw, th, tw, sand); tb.position.set(0, ty + th / 2, 0); g.add(tb);
    const tc = box(tw + 0.3, 0.2, tw + 0.3, H.cream); tc.position.set(0, ty + th, 0); g.add(tc);
    const roof = pyramid(tw * 0.95, 1.5, copper); roof.position.set(0, ty + th + 0.9, 0); g.add(roof);
    for (const [rx, rz, ry] of [[0, tw / 2 + 0.05, 0], [0, -tw / 2 - 0.05, Math.PI], [tw / 2 + 0.05, 0, Math.PI / 2], [-tw / 2 - 0.05, 0, -Math.PI / 2]] as [number, number, number][]) {
      const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), H.cream); cl.rotation.x = Math.PI / 2; const holder = new THREE.Group(); holder.add(cl);
      const hand = box(0.06, 0.4, 0.04, mat(0x222222)); hand.position.set(0, 0.1, 0.06); holder.add(hand);
      holder.rotation.y = ry; holder.position.set(rx, ty + th - 1.0, rz); g.add(holder);
    }
    const annex = gableBlock(3.6, 1.8, 2.3, 1.0, sand, 0.3, green, brass); annex.position.set(0, base, -D / 2 - 0.9 + 0.3); g.add(annex);
  }
  return g;
}


