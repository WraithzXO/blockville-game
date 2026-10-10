//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, sign, stripedAwning }  from './BuildingMaterials';
import  { wallLamp, hv2, sv3, archWindow, balconyV2, pyramid, houseMats, gableBlock, framedDoor }  from './BuildingParts';

export function buildShopV3(level: number): THREE.Group {
  const M = houseMats(); const H = hv2(); const S = sv3();
  const g = new THREE.Group();
  const W = 6.2, D = 4.6, fh = 2.7, base = 0.45, rise = 2.0;
  const F = level >= 3 ? 2 : 1;
  const wallH = F * fh; const fz = D / 2;
  const found = box(W + 0.45, base, D + 0.45, H.stone); found.position.y = base / 2; g.add(found);
  const main = gableBlock(W, D, wallH, rise, S.teal, 0.5, H.shingle, H.ridge); main.position.y = base; g.add(main);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const q = box(0.22, wallH, 0.22, H.cream); q.position.set(sx * (W / 2 + 0.02), base + wallH / 2, sz * (D / 2 + 0.02)); g.add(q); }
  const band = box(W + 0.2, 0.16, D + 0.2, H.cream); band.position.y = base + fh; g.add(band);
  // false-front parapet with stepped crown carrying the sign
  const par = box(W + 0.1, 0.9, 0.28, H.cream); par.position.set(0, base + wallH + 0.45, fz + 0.1); g.add(par);
  const crown = box(3.0, 0.55, 0.28, H.cream); crown.position.set(0, base + wallH + 1.15, fz + 0.1); g.add(crown);
  const cap = box(3.3, 0.12, 0.4, H.stone); cap.position.set(0, base + wallH + 1.48, fz + 0.1); g.add(cap);
  const board = sign('SHOP', '#2f7f77', 2.5, 0.72); board.position.set(0, base + wallH + 0.78, fz + 0.28); g.add(board);
  // storefront: framed door + big arched display window on a stone bulkhead
  const door = framedDoor(1.1, 2.1); door.position.set(-1.0, base, fz + 0.02); g.add(door);
  const bulk = box(2.3, 0.85, 0.14, H.stone); bulk.position.set(1.5, base + 0.43, fz + 0.06); g.add(bulk);
  const dw = archWindow(1.7, 1.15, false); dw.position.set(1.5, base + 1.6, fz + 0.08); g.add(dw);
  // merchandise silhouettes in the window
  for (const [mx, mh, mc] of [[1.05, 0.35, 0xe9604a], [1.5, 0.5, 0xffd36b], [1.95, 0.3, 0x5f8f6a]] as [number, number, number][]) { const it = box(0.3, mh, 0.15, mat(mc)); it.position.set(mx, base + 1.1 + mh / 2 - 0.1, fz - 0.04); g.add(it); }
  stripedAwning(g, W - 1.0, base + 2.2, fz + 0.6, 0xe8874a, 0xfff3e0, 6, 1.2);
  wallLamp(g, -2.1, base + 1.9, fz + 0.12);
  // crates + barrel + planter at the frontage
  for (const [cx, cy] of [[2.8, 0], [2.8, 0.5]] as [number, number][]) { const c = box(0.6, 0.5, 0.6, H.wood); c.position.set(cx, 0.25 + cy + 0.2, fz + 1.0); g.add(c); }
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.65, 10), H.barrel); barrel.position.set(-2.6, 0.33, fz + 1.0); barrel.castShadow = true; g.add(barrel);
  for (const sx of [-1, 1]) for (let k = 0; k < F; k++) { const sw = archWindow(0.9, 1.0, true); sw.rotation.y = (sx * Math.PI) / 2; sw.position.set(sx * (W / 2 + 0.06), base + k * fh + 1.3, -0.2); g.add(sw); }
  const rd = framedDoor(1.0, 1.9); rd.rotation.y = Math.PI; rd.position.set(1.2, base, -fz - 0.02); g.add(rd);
  const rw = archWindow(0.9, 1.0, false); rw.rotation.y = Math.PI; rw.position.set(-1.4, base + 1.3, -fz - 0.06); g.add(rw);
  const chimH = rise + 0.6; const chim = box(0.6, chimH, 0.6, M.brick); chim.position.set(-1.7, base + wallH + chimH / 2 - 0.2, -1.0); g.add(chim);
  const ccap = box(0.95, 0.16, 0.95, H.stone); ccap.position.set(-1.7, base + wallH + chimH - 0.1, -1.0); g.add(ccap);
  // L2: right-hand workshop annex with lean-to roof and loading hatch
  if (level >= 2) {
    const aw = 2.4, ad = 3.4, ah = 2.3, ax = W / 2 + aw / 2 - 0.1;
    const af = box(aw + 0.35, base, ad + 0.35, H.stone); af.position.set(ax, base / 2, -0.2); g.add(af);
    const ab = box(aw, ah, ad, S.tealD); ab.position.set(ax, base + ah / 2, -0.2); g.add(ab);
    const ar = box(aw + 0.9, 0.22, ad + 0.7, H.shingle2); ar.rotation.z = -0.28; ar.position.set(ax + 0.15, base + ah + 0.22, -0.2); g.add(ar);
    const ad2 = framedDoor(1.0, 1.9); ad2.position.set(ax, base, -0.2 + ad / 2 + 0.02); g.add(ad2);
    const aww = archWindow(0.8, 0.8, true); aww.rotation.y = Math.PI / 2; aww.position.set(ax + aw / 2 + 0.06, base + 1.4, -0.2); g.add(aww);
  }
  // L3: upper floor windows + wooden balcony over the entrance, hanging sign
  if (level >= 3) {
    for (const x of [-2.0, 0, 2.0]) { const w = archWindow(0.9, 1.0, x !== 0); w.position.set(x, base + fh + 1.3, fz + 0.08); g.add(w); }
    const b = balconyV2(2.2, 0.9); b.position.set(-1.0, base + fh + 0.62, fz + 0.45); g.add(b);
    const arm = box(0.9, 0.07, 0.07, H.woodDark); arm.position.set(3.3, base + 2.1, fz + 0.5); g.add(arm);
    const hs = sign('SALE', '#c8553d', 0.9, 0.5); hs.position.set(3.3, base + 1.78, fz + 0.5); g.add(hs);
  }
  // L4: corner clock tower on the left of the facade with pyramid roof + flag
  if (level >= 4) {
    const tw = 1.7, th = wallH + 1.7, tx = -W / 2 - 0.2, tz = fz - 0.4;
    const tb = box(tw, th, tw, S.tealD); tb.position.set(tx, base + th / 2, tz); g.add(tb);
    const tcap = pyramid(tw * 0.95, 1.4, H.shingle2); tcap.position.set(tx, base + th + 0.7, tz); g.add(tcap);
    const tw1 = archWindow(0.7, 0.9, false); tw1.position.set(tx, base + th - 1.1, tz + tw / 2 + 0.06); g.add(tw1);
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), H.cream); clock.rotation.x = Math.PI / 2; clock.position.set(tx, base + th - 2.0, tz + tw / 2 + 0.05); g.add(clock);
    const pole = box(0.07, 1.2, 0.07, H.woodDark); pole.position.set(tx, base + th + 1.9, tz); g.add(pole);
    const fl = box(0.6, 0.35, 0.05, S.awnA); fl.position.set(tx + 0.33, base + th + 2.3, tz); g.add(fl);
  }
  return g;
}
