//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, rbox, sign, windowBox, cornice, plinth }  from './BuildingMaterials';
import  { frontPath, entranceSteps, wallLamp, die, hipRoofC }  from './BuildingParts';

export function buildCasino(level: number): THREE.Group {
  const g = new THREE.Group();
  // fixed footprint: levels add architecture (wing, tower), not scale
  const s = level >= 2 ? 1.04 : 1;
  plinth(g, 7.6 * s, 6.6 * s, 0x4d1520);
  // deep-red main hall with a setback upper floor for a stepped silhouette
  const body = rbox(7 * s, 3.2 * s, 6 * s, 0.18, mat(0xa3303f));
  body.position.y = 2.0 * s;
  g.add(body);
  const upper = rbox(5.6 * s, 1.7 * s, 4.8 * s, 0.15, mat(0xb53a4a));
  upper.position.set(0, 4.4 * s, 0);
  g.add(upper);
  // gold cornices between the floors and at the roof
  cornice(g, 7.5 * s, 6.5 * s, 3.66 * s, 0xe0b64a, 0.28);
  cornice(g, 6.1 * s, 5.3 * s, 5.3 * s, 0xe0b64a, 0.26);
  // dark stone base course and fluted gold columns flanking the portal
  const baseC = box(7.3 * s, 0.9, 6.3 * s, mat(0x3a1a20));
  baseC.position.y = 0.45;
  g.add(baseC);
  for (const cx of [-2.05, 2.05]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.1, 10), mat(0xf0d98a, { roughness: 0.45 }));
    col.position.set(cx, 1.65, 3.35);
    col.castShadow = true;
    const cap = box(0.8, 0.2, 0.8, mat(0xe0b64a, { metalness: 0.4, roughness: 0.35 }));
    cap.position.set(cx, 3.2, 3.35);
    g.add(col, cap);
  }
  // hipped slate crown over the upper floor with a gold finial and eave band
  const crown = hipRoofC(6.5 * s, 5.4 * s, 1.9 * s, mat(0x4a1624));
  crown.position.set(0, 5.25 * s, 0);
  g.add(crown);
  const eave = box(6.2 * s, 0.16, 5.1 * s, mat(0xe0b64a, { metalness: 0.5, roughness: 0.3 }));
  eave.position.set(0, 5.27 * s, 0);
  g.add(eave);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 8), mat(0xffd76e, { metalness: 0.6, roughness: 0.3 }));
  finial.position.set(0, 7.15 * s + 0.2, 0);
  g.add(finial);
  // pediment over the grand portal
  const ped0 = new THREE.Shape();
  ped0.moveTo(-2.0, 0); ped0.lineTo(2.0, 0); ped0.lineTo(0, 0.95); ped0.closePath();
  const pg = new THREE.ExtrudeGeometry(ped0, { depth: 0.4, bevelEnabled: false });
  const pedi = new THREE.Mesh(pg, mat(0xe0b64a, { metalness: 0.4, roughness: 0.35 }));
  pedi.position.set(0, 4.9 * s, 3.0);
  pedi.castShadow = true;
  g.add(pedi);
  // hanging burgundy banners with gold bars either side of the marquee
  for (const bx of [-3.35 * s, 3.35 * s]) {
    const ban = box(0.7, 2.2, 0.06, mat(0x9b1c35));
    ban.position.set(bx, 2.2, 3.12);
    const bar = box(0.9, 0.1, 0.1, mat(0xe0b64a, { metalness: 0.5 }));
    bar.position.set(bx, 3.35, 3.14);
    const em = box(0.34, 0.34, 0.07, mat(0xe0b64a, { metalness: 0.4 }));
    em.position.set(bx, 2.5, 3.17);
    em.rotation.z = Math.PI / 4;
    g.add(ban, bar, em);
  }
  // formal planters with clipped hedges at the foot of the steps
  for (const px of [-3.2, 3.2]) {
    const pot = box(1.0, 0.6, 1.0, mat(0x4d1520));
    pot.position.set(px, 0.3, 4.4);
    const hedge = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), mat(0x2f6b3a, { roughness: 0.9 }));
    hedge.position.set(px, 1.0, 4.4);
    hedge.scale.y = 1.15;
    hedge.castShadow = true;
    g.add(pot, hedge);
  }
  // grand entrance: gold portal, dark glass doors, brass handles
  const portal = rbox(3.2, 3.1, 0.5, 0.1, mat(0xe0b64a, { metalness: 0.45, roughness: 0.35 }));
  portal.position.set(0, 1.55, 3.15);
  g.add(portal);
  const door = rbox(2.3, 2.5, 0.18, 0.06, mat(0x101014, { metalness: 0.6, roughness: 0.2 }));
  door.position.set(0, 1.3, 3.35);
  g.add(door);
  for (const hx of [-0.35, 0.35]) {
    const handle = box(0.09, 0.7, 0.09, mat(0xffd76e, { metalness: 0.7, roughness: 0.3 }));
    handle.position.set(hx, 1.25, 3.48);
    g.add(handle);
  }
  // gold-framed windows either side of the doors
  for (const wx of [-2.7, 2.7]) {
    const win = windowBox(1.15, 1.35);
    win.position.set(wx * s, 2.0 * s, 3.06 * s);
    g.add(win);
  }
  // glowing round portholes on the upper floor
  for (const wx of [-1.9, 1.9]) {
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      mat(0xffe08a, { emissive: 0xc98a2d, emissiveIntensity: 0.35 }),
    );
    dot.position.set(wx, 4.45 * s, 2.42 * s);
    g.add(dot);
  }
  // side and rear windows so no wall reads as a blank slab
  for (const sx of [-1, 1]) for (const wz of [-1.5, 1.2]) {
    const sw = windowBox(1.0, 1.3);
    sw.position.set(sx * 3.5 * s, 2.0 * s, wz * s);
    sw.rotation.y = sx * Math.PI / 2;
    g.add(sw);
  }
  for (const wx of [-2.2, 0, 2.2]) {
    const rw = windowBox(1.0, 1.3);
    rw.position.set(wx * s, 2.0 * s, -3.0 * s);
    rw.rotation.y = Math.PI;
    g.add(rw);
  }
  for (const sx of [-1, 1]) {
    const uw = windowBox(0.9, 0.9);
    uw.position.set(sx * 2.8 * s, 4.4 * s, 0);
    uw.rotation.y = sx * Math.PI / 2;
    g.add(uw);
  }
  entranceSteps(g, 3.75, 3.6);
  // red carpet from the street to the doors
  const carpet = box(2.6, 0.06, 2.4, mat(0xb3243c, { roughness: 0.55 }));
  carpet.position.set(0, 0.05, 5.6);
  g.add(carpet);
  // marquee sign inside a dark frame, with two rows of warm bulbs
  const frame = box(5.6 * s, 1.5 * s, 0.25, mat(0x5c1220));
  frame.position.set(0, 3.35 * s, 3.3);
  g.add(frame);
  const marq = sign('CASINO', '#c2185b', 4.9 * s, 1.05 * s);
  marq.position.set(0, 3.35 * s, 3.45);
  g.add(marq);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc94d, emissiveIntensity: 0.9 });
  for (let i = 0; i < 9; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), bulbMat);
    bulb.position.set(-2.8 * s + (i * 5.6 * s) / 8, 2.42 * s, 3.42);
    g.add(bulb);
    const bulb2 = bulb.clone();
    bulb2.position.y = 4.28 * s;
    g.add(bulb2);
  }
  // rooftop dice and a gold beacon pedestal
  const d1 = die(5);
  d1.position.set(1.4 * s, 6.25 * s, 0.4);
  d1.rotation.y = 0.5;
  g.add(d1);
  const d2 = die(3);
  d2.position.set(2.2 * s, 5.9 * s, -0.5);
  d2.rotation.y = -0.4;
  g.add(d2);
  const ped = box(0.7, 0.5, 0.7, mat(0xe0b64a, { metalness: 0.4, roughness: 0.35 }));
  ped.position.set(-2.3 * s, 5.85 * s, 0);
  g.add(ped);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffc400, emissiveIntensity: 1.4 }),
  );
  beacon.position.set(-2.3 * s, 6.3 * s, 0);
  g.add(beacon);
  if (level >= 2) {
    const wing = rbox(2.6 * s, 3.2 * s, 5 * s, 0.14, mat(0xb53a4a));
    wing.position.set(4.6 * s, 1.7 * s, 0);
    g.add(wing);
    const wingRoof = hipRoofC(3.2 * s, 5.5 * s, 1.3 * s, mat(0x4a1624));
    wingRoof.position.set(4.6 * s, 3.3 * s, 0);
    g.add(wingRoof);
    const wingBand = box(3.0 * s, 0.14, 5.2 * s, mat(0xe0b64a, { metalness: 0.5, roughness: 0.3 }));
    wingBand.position.set(4.6 * s, 3.32 * s, 0);
    g.add(wingBand);
    const wwin = windowBox(1.0, 1.3);
    wwin.position.set(4.6 * s, 1.9 * s, 2.52 * s);
    g.add(wwin);
  }
  if (level >= 3) {
    const tower = rbox(1.7, 7.4, 1.7, 0.12, mat(0xe0b64a, { metalness: 0.5, roughness: 0.3 }));
    tower.position.set(-3.5 * s, 3.8, 0);
    g.add(tower);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.95, 1.7, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff176, emissive: 0xffd600, emissiveIntensity: 0.9 }),
    );
    tip.position.set(-3.5 * s, 8.2, 0);
    g.add(tip);
  }
  if (level >= 4) {
    // flagship: tall gold flagpoles with burgundy standards at the front corners
    const poleM = mat(0xe0b64a, { metalness: 0.5, roughness: 0.3 });
    for (const fx of [-3.6, 3.6]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.6, 8), poleM);
      pole.position.set(fx, 3.3, 3.7); pole.castShadow = true;
      const flag = box(0.1, 1.0, 1.3, mat(0xa3303f)); flag.position.set(fx, 5.9, 3.7 + 0.7);
      flag.rotation.set(0, 0, 0);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), poleM); knob.position.set(fx, 6.7, 3.7);
      g.add(pole, flag, knob);
    }
  }
  // velvet-rope entrance: gold posts with a red rope between them
  const ropePostMat = mat(0xe0b64a, { metalness: 0.6, roughness: 0.3 });
  for (const rx of [-1.9, 1.9]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.95, 8), ropePostMat);
    post.position.set(rx, 0.48, 4.0);
    post.castShadow = true;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), ropePostMat);
    ball.position.set(rx, 1.0, 4.0);
    g.add(post, ball);
  }
  const rope = box(3.6, 0.07, 0.07, mat(0xb3243c, { roughness: 0.5 }));
  rope.position.set(0, 0.86, 4.0);
  g.add(rope);
  // warm lamps flanking the grand portal
  wallLamp(g, -2.0, 2.4, 3.12);
  wallLamp(g, 2.0, 2.4, 3.12);
  frontPath(g, 3.9);
  return g;
}


// ---- shared life-pass props ----
