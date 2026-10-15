//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, sign, stripedAwning }  from './BuildingMaterials';
import  { wallLamp, hv2, sv3, archWindow, cafeTable, houseMats, gableBlock, framedDoor, flowerBox }  from './BuildingParts';

export function buildCafeV3(level: number): THREE.Group {
  const M = houseMats(); const H = hv2(); const S = sv3();
  const g = new THREE.Group();
  const L = 7.0, D = 4.2, wallH = 2.8, rise = 1.6, base = 0.45, fz = D / 2;
  const found = box(L + 0.45, base, D + 0.45, H.stone); found.position.y = base / 2; g.add(found);
  const main = gableBlock(D, L, wallH, rise, S.coral, 0.5, H.shingle, H.ridge); main.rotation.y = Math.PI / 2; main.position.y = base; g.add(main);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const q = box(0.22, wallH, 0.22, H.cream); q.position.set(sx * (L / 2 + 0.02), base + wallH / 2, sz * (D / 2 + 0.02)); g.add(q); }
  // timber base band
  const tb = box(L + 0.12, 0.7, D + 0.12, H.woodDark); tb.position.y = base + 0.35; g.add(tb);
  // front cross-gable entrance bay
  const cw = 3.0, cd = 2.0, cg = gableBlock(cw, cd, wallH, 1.5, S.coralD, 0.45, H.shingle, H.ridge); cg.position.set(0, base, fz + cd / 2 - 0.3); g.add(cg);
  const cz = fz + cd - 0.3;
  const cf = box(cw + 0.3, base, cd + 0.3, H.stone); cf.position.set(0, base / 2, fz + cd / 2 - 0.3); g.add(cf);
  const door = framedDoor(1.3, 2.1); door.position.set(0, base, cz + 0.02); g.add(door);
  const sg = sign('CAFE', '#8a4a2d', 1.9, 0.55); sg.position.set(0, base + wallH + 0.6, cz + 0.05); g.add(sg);
  stripedAwning(g, cw + 0.4, base + 2.35, cz + 0.55, 0xe9604a, 0xfff0d6, 5, 1.1);
  wallLamp(g, -1.25, base + 1.9, cz + 0.1);
  for (const sx of [-1, 1]) {
    const w = archWindow(1.1, 1.2, true); w.position.set(sx * 2.55, base + 1.45, fz + 0.08); g.add(w);
    const fb = flowerBox(1.3); fb.position.set(sx * 2.55, base + 0.78, fz + 0.28); g.add(fb);
  }
  for (const sx of [-1, 1]) { const sw = archWindow(0.9, 1.0, true); sw.rotation.y = (sx * Math.PI) / 2; sw.position.set(sx * (L / 2 + 0.06), base + 1.3, 0); g.add(sw); }
  const rd = framedDoor(1.0, 1.9); rd.rotation.y = Math.PI; rd.position.set(-1.8, base, -fz - 0.02); g.add(rd);
  const rw = archWindow(1.0, 1.0, false); rw.rotation.y = Math.PI; rw.position.set(1.8, base + 1.3, -fz - 0.06); g.add(rw);
  const chim = box(0.6, 2.4, 0.6, M.brick); chim.position.set(2.4, base + wallH + 1.0, -0.8); g.add(chim);
  const cc = box(0.95, 0.16, 0.95, H.stone); cc.position.set(2.4, base + wallH + 2.2, -0.8); g.add(cc);
  // terrace in front: deck, rail posts, two tables (one with umbrella)
  const tdz = cz + 1.5;
  const deck = box(L - 0.8, 0.14, 2.6, H.wood); deck.position.set(0, 0.07 + 0.05, tdz - 0.1); g.add(deck);
  cafeTable(g, -2.3, tdz, true);
  cafeTable(g, 2.3, tdz, level >= 2);
  for (const sx of [-1, 1]) { const p = box(0.12, 0.9, 0.12, H.woodDark); p.position.set(sx * (L / 2 - 0.5), 0.55, tdz + 1.15); g.add(p); }
  const rail = box(L - 1.0, 0.08, 0.08, H.woodDark); rail.position.set(0, 0.95, tdz + 1.15); g.add(rail);
  const board = box(0.7, 0.9, 0.08, H.woodDark); board.position.set(-1.2, 0.5, cz + 0.8); board.rotation.x = -0.2; g.add(board);
  const bf = box(0.58, 0.7, 0.02, H.cream); bf.position.set(-1.2, 0.5, cz + 0.85); bf.rotation.x = -0.2; g.add(bf);
  // L2: glass conservatory on the right side
  if (level >= 2) {
    const cwid = 2.4, cdep = 2.8, cx = L / 2 + cwid / 2 - 0.1;
    const cfd = box(cwid + 0.3, base, cdep + 0.3, H.stone); cfd.position.set(cx, base / 2, 0.2); g.add(cfd);
    const paneM = mat(0x6fc0de, { roughness: 0.2, metalness: 0.1, emissive: 0x3d93b8, emissiveIntensity: 0.3 } as any);
    const kH = 0.65, gH = 1.55;
    const kx = box(cwid, kH, cdep, M.brick); kx.position.set(cx, base + kH / 2, 0.2); g.add(kx);
    const inner = box(cwid - 0.3, gH, cdep - 0.3, S.glassWarm); inner.position.set(cx, base + kH + gH / 2, 0.2); g.add(inner);
    const gy = base + kH + gH / 2;
    const pOut = box(0.05, gH, cdep - 0.1, paneM); pOut.position.set(cx + cwid / 2 + 0.03, gy, 0.2); g.add(pOut);
    const pF = box(cwid - 0.1, gH, 0.05, paneM); pF.position.set(cx, gy, 0.2 + cdep / 2 + 0.03); g.add(pF);
    const pB = box(cwid - 0.1, gH, 0.05, paneM); pB.position.set(cx, gy, 0.2 - cdep / 2 - 0.03); g.add(pB);
    for (let i = 0; i <= 3; i++) {
      const mz = 0.2 - cdep / 2 + (i / 3) * cdep;
      const mm = box(0.08, gH, 0.08, H.cream); mm.position.set(cx + cwid / 2 + 0.05, gy, mz); g.add(mm);
    }
    for (let i = 0; i <= 2; i++) {
      const mx = cx - cwid / 2 + (i / 2) * cwid;
      const mf = box(0.08, gH, 0.08, H.cream); mf.position.set(mx, gy, 0.2 + cdep / 2 + 0.05); g.add(mf);
    }
    const tr = box(cwid + 0.12, 0.1, cdep + 0.12, H.cream); tr.position.set(cx, base + kH + gH, 0.2); g.add(tr);
    const rl = box(cwid + 0.12, 0.08, 0.08, H.cream); rl.position.set(cx, base + kH + gH * 0.5, 0.2 + cdep / 2 + 0.06); g.add(rl);
    const cr = box(cwid + 0.7, 0.18, cdep + 0.6, H.shingle2); cr.rotation.z = -0.22; cr.position.set(cx + 0.1, base + 2.32, 0.2); g.add(cr);
  }
  // L3: two front dormers
  if (level >= 3) {
    for (const sx of [-1, 1]) {
      const dm = gableBlock(1.3, 1.4, 1.1, 0.7, S.coralD, 0.2, H.shingle, H.ridge); dm.position.set(sx * 2.45, base + wallH + 0.15, 0.8); g.add(dm);
      const dw = archWindow(0.6, 0.6, false); dw.position.set(sx * 2.45, base + wallH + 0.7, 0.8 + 0.72); g.add(dw);
    }
  }
  // L4: round-cap turret at the back-left with lantern + bunting over the terrace
  if (level >= 4) {
    const tx = -L / 2 - 0.1, tz = -0.6, th = wallH + 2.0;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, th, 10), S.coral); t.position.set(tx, base + th / 2, tz); t.castShadow = true; g.add(t);
    const tc = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.5, 10), H.shingle2); tc.position.set(tx, base + th + 0.75, tz); tc.castShadow = true; g.add(tc);
    const tw = archWindow(0.55, 0.8, false); tw.rotation.y = -Math.PI / 2; tw.position.set(tx - 0.97, base + th - 1.0, tz); g.add(tw);
    const cols = [S.bunA, S.bunB, S.bunC];
    for (let i = 0; i < 9; i++) { const f = box(0.28, 0.32, 0.04, cols[i % 3]); f.position.set(-3.0 + i * 0.75, 2.75 - Math.sin((i / 8) * Math.PI) * -0.0 - 0.0 + 0.2 - Math.sin((i / 8) * Math.PI) * 0.35 * 0, tdz + 1.15); g.add(f); }
    const l1 = box(0.1, 2.0, 0.1, H.woodDark); l1.position.set(-3.2, 1.7, tdz + 1.15); g.add(l1);
    const l2 = box(0.1, 2.0, 0.1, H.woodDark); l2.position.set(3.2, 1.7, tdz + 1.15); g.add(l2);
  }
  return g;
}


