//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, rbox, sign }  from './BuildingMaterials';
import  { flagPole, lampPost, crateStack, orePile }  from './BuildingParts';

export function buildMine(level: number): THREE.Group {
  const g = new THREE.Group();
  const rockA = mat(0x6d5f52);
  const rockB = mat(0x7d6e5e);
  const rockC = mat(0x8c7b68);
  const timber = mat(0x5c4430);
  const timberD = mat(0x4a3524);
  const iron = mat(0x6b6f78, { metalness: 0.6, roughness: 0.35 });
  const dark = mat(0x141210);
  const gemMat = () => new THREE.MeshStandardMaterial({ color: 0x8ff0ff, emissive: 0x22d3ee, emissiveIntensity: 0.7 });
  // dirt apron in front of the workings
  const apron = rbox(9.2, 0.14, 6.2, 0.05, mat(0x8a6a45));
  apron.position.set(0, 0.07, 4.1);
  g.add(apron);
  const apron2 = rbox(6.4, 0.16, 4.2, 0.05, mat(0x9a7a52));
  apron2.position.set(0, 0.09, 4.9);
  g.add(apron2);
  // rock-faced cliff: stacked chunky slabs, each with a lighter cap
  const cliff = rbox(6.8, 3.6, 4.2, 0.45, rockA);
  cliff.position.set(0, 1.8, 1.9);
  g.add(cliff);
  const cliff2 = rbox(5.2, 2.2, 3.2, 0.4, rockB);
  cliff2.position.set(0.4, 4.4, 1.2);
  cliff2.rotation.y = 0.14;
  g.add(cliff2);
  const cliff3 = rbox(3.0, 1.5, 2.4, 0.35, rockC);
  cliff3.position.set(-0.5, 5.9, 0.6);
  cliff3.rotation.y = -0.2;
  g.add(cliff3);
  // buttress boulders at both front corners of the cliff
  for (const [bx, bz, s] of [[-3.4, 3.8, 1.0], [3.4, 3.9, 0.85], [-3.6, 1.0, 0.8]] as const) {
    const b = rbox(1.5 * s, 1.5 * s, 1.5 * s, 0.35 * s, rockB);
    b.position.set(bx, 0.75 * s, bz);
    b.rotation.y = bx;
    g.add(b);
  }
  // rock bands on the cliff face (strata)
  for (const [yy, w] of [[1.1, 6.9], [2.5, 6.9]] as const) {
    const band = box(w, 0.12, 0.1, rockC);
    band.position.set(0, yy, 4.03);
    g.add(band);
  }
  // stone surround of the tunnel mouth: voussoir blocks
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const blk = rbox(0.7, 0.85, 0.5, 0.08, i % 2 ? rockC : rockB);
      blk.position.set(sx * 1.72, 0.55 + i * 0.85, 4.18);
      g.add(blk);
    }
  }
  const keystone = rbox(1.0, 0.6, 0.5, 0.08, rockC);
  keystone.position.set(0, 3.0, 4.18);
  g.add(keystone);
  // tunnel: dark mouth, timber posts, lintel and angled braces
  const hole = box(1.9, 2.3, 0.5, dark);
  hole.position.set(0, 1.28, 4.1);
  g.add(hole);
  for (const px of [-1.1, 1.1]) {
    const post = box(0.3, 2.5, 0.34, timber);
    post.position.set(px, 1.4, 4.45);
    g.add(post);
  }
  const lintel = box(2.9, 0.34, 0.4, timber);
  lintel.position.set(0, 2.62, 4.45);
  g.add(lintel);
  const lintel2 = box(3.2, 0.24, 0.3, timberD);
  lintel2.position.set(0, 2.88, 4.5);
  g.add(lintel2);
  for (const s of [-1, 1]) {
    const brace = box(0.2, 0.95, 0.2, timber);
    brace.position.set(s * 0.95, 2.25, 4.5);
    brace.rotation.z = s * 0.7;
    g.add(brace);
  }
  // sign board on two short posts above the entrance
  for (const sx of [-0.9, 0.9]) {
    const sp = box(0.14, 0.6, 0.14, timberD);
    sp.position.set(sx, 3.2, 4.4);
    g.add(sp);
  }
  const board = sign('MINE', '#4a3524', 2.6, 0.8);
  board.position.set(0, 3.7, 4.5);
  g.add(board);
  // hanging lantern and wall lantern at the entrance
  const chain = box(0.04, 0.5, 0.04, iron);
  chain.position.set(-0.95, 2.35, 4.7);
  g.add(chain);
  const lant = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 1.2 }));
  lant.position.set(-0.95, 2.0, 4.7);
  g.add(lant);
  // glowing ore veins in the cliff face
  for (const [vx, vy, vs] of [[-2.6, 1.8, 0.3], [-2.9, 3.0, 0.22], [2.7, 2.2, 0.28], [2.5, 3.4, 0.2]] as const) {
    const v = new THREE.Mesh(new THREE.OctahedronGeometry(vs), gemMat());
    v.position.set(vx, vy, 4.1);
    v.rotation.set(vx, vy, 0);
    g.add(v);
  }
  // headframe: timber A-frame tower beside the cliff with a winding wheel
  const hfH = level >= 3 ? 6.4 : 5.2;
  for (const lz of [1.9, 3.3]) {
    const leg = box(0.48, hfH, 0.48, timber);
    leg.position.set(-4.35, hfH / 2, lz);
    const foot = box(0.9, 0.35, 0.9, rockA);
    foot.position.set(-4.35, 0.17, lz);
    g.add(foot);
    leg.rotation.x = (lz < 2.6 ? 1 : -1) * 0.1;
    g.add(leg);
  }
  for (const [yy, w] of [[1.2, 1.7], [2.6, 1.5], [4.0, 1.3]] as const) {
    if (yy > hfH - 0.8) continue;
    const cr = box(0.22, 0.2, w, timberD);
    cr.position.set(-4.35, yy, 2.6);
    g.add(cr);
  }
  for (const s of [-1, 1]) {
    const dg = box(0.16, 2.0, 0.16, timberD);
    dg.position.set(-4.35, 1.9, 2.6);
    dg.rotation.x = s * 0.78;
    g.add(dg);
  }
  const wheelY = hfH - 0.5;
  const axle = box(0.9, 0.18, 0.18, iron);
  axle.position.set(-4.35, wheelY, 2.6);
  g.add(axle);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.1, 8, 16), iron);
  wheel.position.set(-4.35, wheelY, 2.6);
  wheel.rotation.y = Math.PI / 2;
  g.add(wheel);
  for (let i = 0; i < 3; i++) {
    const sp = box(0.07, 0.07, 1.4, iron);
    sp.position.set(-4.35, wheelY, 2.6);
    sp.rotation.x = (i * Math.PI) / 3;
    g.add(sp);
  }
  // tool shed on the right: plank walls, sloped metal roof, door, window, stove pipe
  const shW = 2.0;
  const shed = rbox(shW, 2.0, 2.2, 0.06, mat(0x8a5a33));
  shed.position.set(4.3, 1.0, 3.4);
  g.add(shed);
  const shBase = box(shW + 0.1, 0.35, 2.3, rockA);
  shBase.position.set(4.3, 0.18, 3.4);
  g.add(shBase);
  for (let i = 0; i < 5; i++) {
    const pl = box(0.03, 1.5, 0.04, timberD);
    pl.position.set(3.55 + i * 0.4, 1.15, 4.52);
    g.add(pl);
  }
  const sroof = box(shW + 0.5, 0.12, 2.9, mat(0x7d8790, { metalness: 0.55, roughness: 0.4 }));
  sroof.position.set(4.3, 2.2, 3.4);
  sroof.rotation.x = 0.2;
  g.add(sroof);
  for (let i = 0; i < 4; i++) {
    const rib = box(0.05, 0.08, 2.95, mat(0x5e6770, { metalness: 0.5 }));
    rib.position.set(3.55 + i * 0.5, 2.28, 3.4);
    rib.rotation.x = 0.2;
    g.add(rib);
  }
  const sdoor = box(0.7, 1.5, 0.08, timberD);
  sdoor.position.set(4.0, 0.9, 4.52);
  g.add(sdoor);
  const sdf = box(0.86, 0.1, 0.12, timber);
  sdf.position.set(4.0, 1.7, 4.53);
  g.add(sdf);
  const sw = box(0.5, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.6 }));
  sw.position.set(4.85, 1.3, 4.52);
  g.add(sw);
  const swf = box(0.62, 0.62, 0.05, timberD);
  swf.position.set(4.85, 1.3, 4.5);
  g.add(swf);
  const pipe = box(0.2, 0.9, 0.2, iron);
  pipe.position.set(4.9, 2.7, 2.7);
  g.add(pipe);
  // rails with sleepers out to the front, and a loaded minecart
  for (let i = 0; i < 7; i++) {
    const sl = box(1.5, 0.07, 0.18, timber);
    sl.position.set(0, 0.2, 4.4 + i * 0.45);
    g.add(sl);
  }
  for (const rx of [-0.5, 0.5]) {
    const rail = box(0.09, 0.09, 3.2, mat(0x9a8f80, { metalness: 0.5 }));
    rail.position.set(rx, 0.28, 5.9);
    g.add(rail);
  }
  const cart = rbox(1.25, 0.7, 0.95, 0.08, mat(0x555f66, { metalness: 0.5, roughness: 0.4 }));
  cart.position.set(0, 0.78, 5.5);
  g.add(cart);
  const cbd = box(1.3, 0.1, 1.0, mat(0x8a5a33));
  cbd.position.set(0, 0.5, 5.5);
  g.add(cbd);
  for (const wx of [-0.5, 0.5]) {
    for (const wz of [5.2, 5.8]) {
      const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 8), iron);
      cw.rotation.z = Math.PI / 2;
      cw.position.set(wx, 0.4, wz);
      g.add(cw);
    }
  }
  for (let i = 0; i < 3; i++) {
    const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.24), gemMat());
    gm.position.set(-0.3 + i * 0.3, 1.2, 5.5);
    g.add(gm);
  }
  // fence rail with posts and a warning board to keep the front readable
  for (const fx of [-3.4, -2.6, -1.8]) {
    const fp = box(0.12, 0.9, 0.12, timberD);
    fp.position.set(fx, 0.5, 6.7);
    g.add(fp);
  }
  const fr = box(1.8, 0.1, 0.08, timber);
  fr.position.set(-2.6, 0.85, 6.7);
  g.add(fr);
  const wb = sign('DANGER', '#a8321f', 1.3, 0.55);
  wb.position.set(-2.6, 0.55, 6.84);
  g.add(wb);
  // props: ore piles, crates, barrel, pickaxe
  orePile(g, 2.9, 5.7);
  crateStack(g, 3.6, 6.1, 0x7a5a38);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.8, 10), mat(0x8a5a33));
  barrel.position.set(-3.2, 0.5, 5.3);
  g.add(barrel);
  const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.06, 10), iron);
  hoop.position.set(-3.2, 0.6, 5.3);
  g.add(hoop);
  const pick = new THREE.Group();
  const ph = box(0.09, 1.5, 0.09, mat(0x8a6a3f));
  ph.position.y = 0.75;
  const px = box(0.8, 0.13, 0.13, mat(0x9aa2ad, { metalness: 0.5 }));
  px.position.set(0.12, 1.45, 0);
  px.rotation.z = -0.35;
  pick.add(ph, px);
  pick.position.set(-1.7, 0.1, 4.7);
  pick.rotation.z = 0.42;
  g.add(pick);
  lampPost(g, 2.1, 6.2, 2.2);

  // LEVEL 2+: ore bin on legs and a second cart on the rails
  if (level >= 2) {
    for (const [lx, lz] of [[-2.9, 6.0], [-1.9, 6.0], [-2.9, 7.0], [-1.9, 7.0]] as const) {
      const lg = box(0.14, 1.4, 0.14, timberD);
      lg.position.set(lx, 0.7, lz - 0.4);
      g.add(lg);
    }
    const bin = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.9, 4), mat(0x7a5a38));
    bin.rotation.x = Math.PI;
    bin.rotation.y = Math.PI / 4;
    bin.position.set(-2.4, 1.85, 6.1);
    g.add(bin);
    const binTop = rbox(1.5, 0.3, 1.5, 0.05, mat(0x8a6a3f));
    binTop.position.set(-2.4, 2.4, 6.1);
    g.add(binTop);
    const cart2 = rbox(1.0, 0.6, 0.8, 0.08, mat(0x555f66, { metalness: 0.5 }));
    cart2.position.set(0, 0.7, 6.9);
    g.add(cart2);
    for (let i = 0; i < 2; i++) {
      const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), gemMat());
      gm.position.set(-0.2 + i * 0.4, 1.1, 6.9);
      g.add(gm);
    }
  }
  // LEVEL 3+: loading platform with ramp at the shed, bigger headframe cap, beacon crystal
  if (level >= 3) {
    const plat = box(2.2, 0.35, 1.4, timber);
    plat.position.set(4.3, 0.3, 5.5);
    g.add(plat);
    const ramp = box(2.0, 0.12, 1.5, timberD);
    ramp.position.set(4.3, 0.2, 6.6);
    ramp.rotation.x = -0.25;
    g.add(ramp);
    const cap = box(0.9, 0.3, 1.9, timberD);
    cap.position.set(-4.35, hfH + 0.1, 2.6);
    g.add(cap);
    const big = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), gemMat());
    big.position.set(-0.5, 7.1, 0.6);
    g.add(big);
  }
  // LEVEL 4: conveyor from the tunnel to the ore bin, engine house with smoke stack, flag on the headframe
  if (level >= 4) {
    const belt = box(0.75, 0.2, 2.6, mat(0x3a3a3f));
    belt.position.set(-2.4, 1.0, 4.9);
    belt.rotation.x = -0.4;
    g.add(belt);
    for (const [bz, by] of [[4.0, 0.45], [5.8, 1.3]] as const) {
      const bl = box(0.1, by, 0.1, iron);
      bl.position.set(-2.9, by / 2, bz);
      g.add(bl);
    }
    const eng = rbox(1.7, 1.7, 1.6, 0.06, mat(0x6d5f52));
    eng.position.set(-4.4, 0.85, 5.6);
    g.add(eng);
    const er = box(2.0, 0.14, 1.9, mat(0x5e6770, { metalness: 0.5 }));
    er.position.set(-4.4, 1.85, 5.6);
    g.add(er);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 2.2, 8), mat(0x8a5a4a));
    stack.position.set(-4.7, 2.7, 5.4);
    g.add(stack);
    for (let i = 0; i < 3; i++) {
      const sm = new THREE.Mesh(new THREE.SphereGeometry(0.28 + i * 0.1, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe8e8ec, transparent: true, opacity: 0.7 - i * 0.15 }));
      sm.position.set(-4.7 + i * 0.25, 4.1 + i * 0.5, 5.4);
      g.add(sm);
    }
    const ew = box(0.5, 0.5, 0.06, new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 0.6 }));
    ew.position.set(-4.4, 1.05, 6.42);
    g.add(ew);
    flagPole(g, -4.35, hfH + 0.2, 2.6, 0xe0574f, 1.6);
  }
  return g;
}

