//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, rbox, sign, plinth }  from './BuildingMaterials';
import  { frontPath, entranceSteps, wallLamp, hipRoofC, benchSeat }  from './BuildingParts';

export function buildArcade(level: number): THREE.Group {
  const g = new THREE.Group();
  const neon = (c: number, e: number, i = 1) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: i });
  const cyan = neon(0x9ff3ff, 0x22d3ee, 1.1);
  const pink = neon(0xff9bd2, 0xe0579f, 0.9);
  const wallM = mat(0x9a7cf0);
  const baseM = mat(0x5a45b0);
  plinth(g, 6.6, 5.6, 0x2a2150);
  // main hall: violet walls on a darker base band
  const body = rbox(6.2, 3.6, 5.2, 0.14, wallM);
  body.position.y = 1.8 + 0.2;
  g.add(body);
  const band = box(6.3, 0.95, 5.3, baseM);
  band.position.y = 0.2 + 0.48;
  g.add(band);
  // pixel checker band under the roofline (arcade motif)
  for (let i = 0; i < 10; i++) {
    const sq = box(0.5, 0.5, 0.1, i % 2 ? pink : cyan);
    sq.position.set(-2.7 + i * 0.6, 3.45, 2.64);
    g.add(sq);
  }
  // roof slab + stepped pixel crown
  const roof = box(6.6, 0.3, 5.6, mat(0x2a2150));
  roof.position.y = 3.95;
  g.add(roof);
  const hipM = mat(0x4b3a9a);
  const hip = hipRoofC(6.5, 5.4, 1.1, hipM);
  hip.position.set(0, 4.1, -0.15);
  g.add(hip);
  for (const [cx, w, h] of [[0, 4.8, 1.5], [-2.55, 1.1, 0.7], [2.55, 1.1, 0.7]] as const) {
    const st = box(w, h, 0.5, wallM);
    st.position.set(cx, 4.2 + h / 2, 2.35);
    g.add(st);
    const cap = box(w + 0.2, 0.16, 0.65, baseM);
    cap.position.set(cx, 4.2 + h + 0.08, 2.35);
    g.add(cap);
  }
  // marquee sign on the crown
  const frame = box(4.5, 1.2, 0.18, mat(0x1a1530));
  frame.position.set(0, 4.95, 2.65);
  g.add(frame);
  const board = sign('ARCADE', '#7b2ea0', 4.2, 1.0);
  board.position.set(0, 4.95, 2.78);
  g.add(board);
  for (const bx of [-2.05, 2.05]) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), neon(0xfff3a0, 0xf2d54e, 1));
    bulb.position.set(bx, 4.95, 2.8);
    g.add(bulb);
  }
  // framed double door with glowing jambs
  const door = rbox(2.2, 2.35, 0.16, 0.05, mat(0x120f1e, { metalness: 0.4, roughness: 0.35 }));
  door.position.set(0, 1.4, 2.66);
  g.add(door);
  for (const jx of [-1.25, 1.25]) {
    const jamb = box(0.14, 2.55, 0.2, cyan);
    jamb.position.set(jx, 1.48, 2.7);
    g.add(jamb);
  }
  const header = box(2.65, 0.14, 0.2, cyan);
  header.position.set(0, 2.78, 2.7);
  g.add(header);
  // framed windows with a sill and a glowing screen behind the glass
  for (const wx of [-2.2, 2.2]) {
    const wf = box(1.5, 1.5, 0.12, mat(0x1a1530));
    wf.position.set(wx, 2.0, 2.64);
    g.add(wf);
    const pane = box(1.2, 1.2, 0.1, neon(0x7ee8ff, 0x22d3ee, 0.55));
    pane.position.set(wx, 2.0, 2.7);
    g.add(pane);
    const sill = box(1.7, 0.14, 0.34, baseM);
    sill.position.set(wx, 1.2, 2.78);
    g.add(sill);
  }
  // cabinets by the entrance
  const tops = [0x53b56d, 0xe0574f, 0x4f8fe0, 0xf2d54e];
  for (let i = 0; i < 4; i++) {
    const cab = rbox(0.8, 1.7, 0.7, 0.08, mat(i % 2 ? 0xe0574f : 0x4f8fe0));
    cab.position.set(-2.4 + i * 0.95, 0.95, 3.5);
    g.add(cab);
    const scr = box(0.55, 0.4, 0.08, cyan);
    scr.position.set(-2.4 + i * 0.95, 1.4, 3.88);
    g.add(scr);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), neon(tops[i], tops[i], 0.9));
    top.position.set(-2.4 + i * 0.95, 1.95, 3.5);
    g.add(top);
  }
  // LEVEL 2+: game-room wing on the right with its own window and pennant roof
  if (level >= 2) {
    const w = rbox(2.2, 2.6, 3.8, 0.1, wallM);
    w.position.set(4.1, 1.5, -0.2);
    g.add(w);
    const wr = hipRoofC(2.7, 4.2, 0.9, mat(0x4b3a9a));
    wr.position.set(4.1, 2.8, -0.2);
    g.add(wr);
    const ww = box(1.0, 1.0, 0.1, neon(0x7ee8ff, 0x22d3ee, 0.55));
    ww.position.set(4.1, 1.7, 1.75);
    g.add(ww);
    const pole = box(0.08, 1.2, 0.08, mat(0x1a1530));
    pole.position.set(4.1, 3.7, -0.2);
    g.add(pole);
    const flag = box(0.7, 0.4, 0.04, pink);
    flag.position.set(4.45, 4.05, -0.2);
    g.add(flag);
  }
  // LEVEL 3+: matching left wing with a claw-machine window display
  if (level >= 3) {
    const w = rbox(2.2, 2.6, 3.8, 0.1, wallM);
    w.position.set(-4.1, 1.5, -0.2);
    g.add(w);
    const wr = hipRoofC(2.7, 4.2, 0.9, mat(0x4b3a9a));
    wr.position.set(-4.1, 2.8, -0.2);
    g.add(wr);
    const dp = box(1.2, 1.1, 0.1, neon(0xffd2ec, 0xe0579f, 0.5));
    dp.position.set(-4.1, 1.7, 1.75);
    g.add(dp);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), neon(0xf2d54e, 0xf2d54e, 0.8));
    ball.position.set(-4.1, 1.55, 1.82);
    g.add(ball);
  }
  // LEVEL 4: rear tower with a pixel space-invader sign above the hall
  if (level >= 4) {
    const tw = rbox(2.6, 2.4, 2.4, 0.1, baseM);
    tw.position.set(0, 5.4, -1.2);
    g.add(tw);
    const inv = [
      '0010000100', '0001001000', '0011111100', '0110110110', '1111111111', '1011111101', '1010000101', '0001001000',
    ];
    inv.forEach((row, ry) => {
      for (let cx = 0; cx < row.length; cx++) {
        if (row[cx] !== '1') continue;
        const px = box(0.2, 0.2, 0.1, cx % 2 ? cyan : pink);
        px.position.set(-0.9 + cx * 0.2, 6.2 - ry * 0.2, 0.05);
        g.add(px);
      }
    });
    const trim = box(2.9, 0.18, 2.7, mat(0x2a2150));
    trim.position.set(0, 6.7, -1.2);
    g.add(trim);
  }
  // entrance canopy: pink/violet striped marquee awning on two posts
  for (let i = 0; i < 6; i++) {
    const st = box(0.55, 0.12, 1.5, i % 2 ? pink : mat(0x6b4fd0));
    st.position.set(-1.38 + i * 0.55, 2.95 - 0.0, 3.35);
    st.rotation.x = 0.18;
    g.add(st);
  }
  for (const px of [-1.55, 1.55]) {
    const post = box(0.12, 2.6, 0.12, mat(0x1a1530));
    post.position.set(px, 1.35, 3.95);
    g.add(post);
  }
  // machine silhouettes visible through the side windows
  for (const wx of [-2.2, 2.2]) {
    const m1 = box(0.4, 0.8, 0.1, mat(0x1a1530));
    m1.position.set(wx - 0.28, 1.75, 2.76);
    g.add(m1);
    const m2 = box(0.4, 0.65, 0.1, mat(0x1a1530));
    m2.position.set(wx + 0.28, 1.68, 2.76);
    g.add(m2);
    const scr = box(0.26, 0.2, 0.05, pink);
    scr.position.set(wx - 0.28, 1.95, 2.82);
    g.add(scr);
  }
  // poster boards on the front wall flanking the door (above the cabinets)
  for (const [px, c] of [[-2.9, 0xf2d54e], [2.9, 0x4fd9c3]] as const) {
    const pb = box(0.7, 1.0, 0.06, mat(0x1a1530));
    pb.position.set(px, 2.6, 2.66);
    g.add(pb);
    const pf = box(0.56, 0.84, 0.05, mat(c));
    pf.position.set(px, 2.6, 2.7);
    g.add(pf);
  }
  // side windows and rear service door so no wall is blank
  for (const sx of [-3.12, 3.12]) {
    for (const wz of [-1, 1]) {
      const sw = box(0.1, 1.0, 1.0, neon(0x7ee8ff, 0x22d3ee, 0.4));
      sw.position.set(sx, 2.0, wz);
      g.add(sw);
      const sf = box(0.08, 1.2, 1.2, mat(0x1a1530));
      sf.position.set(sx - Math.sign(sx) * 0.02, 2.0, wz);
      g.add(sf);
    }
  }
  const rd = box(1.1, 2.0, 0.1, mat(0x1a1530));
  rd.position.set(0, 1.2, -2.62);
  g.add(rd);
  const rw = box(1.0, 0.9, 0.08, neon(0x7ee8ff, 0x22d3ee, 0.4));
  rw.position.set(2.0, 2.2, -2.62);
  g.add(rw);
  // ---- DETAIL PASS 2x: corner posts, eave trim, kiosk, blade sign, light string, murals ----
  {
    const dark = mat(0x1a1530);
    const violetM = mat(0x6b4fd0);
    // corner posts with glowing caps (front corners and rear corners)
    for (const cx of [-3.12, 3.12]) {
      for (const cz of [2.62, -2.62]) {
        const post = box(0.3, 3.7, 0.3, baseM);
        post.position.set(cx, 2.05, cz);
        g.add(post);
        const cap = box(0.4, 0.14, 0.4, cyan);
        cap.position.set(cx, 3.95, cz);
        g.add(cap);
      }
    }
    // eave trim: fascia band + gutter lip front and back, and downpipes at front corners
    for (const ez of [2.82, -2.82]) {
      const fascia = box(6.9, 0.2, 0.14, dark);
      fascia.position.set(0, 3.82, ez);
      g.add(fascia);
    }
    for (const dx of [-3.2, 3.2]) {
      const pipe = box(0.1, 3.6, 0.1, mat(0x9aa2ad, { metalness: 0.5 }));
      pipe.position.set(dx, 1.9, 2.82);
      g.add(pipe);
    }
    // horizontal stripe panels on the lower wall (pink + cyan pinstripes above the base band)
    for (const [yy, m] of [[1.28, pink], [1.42, cyan]] as const) {
      const strip = box(6.3, 0.07, 0.08, m);
      strip.position.set(0, yy, 2.62);
      g.add(strip);
    }
    // ticket kiosk beside the door (left): booth with a glowing window and a little roof
    const kb = rbox(1.0, 1.5, 0.7, 0.06, mat(0xf2d54e));
    kb.position.set(-3.75, 0.8, 3.2);
    g.add(kb);
    const kw = box(0.7, 0.45, 0.06, cyan);
    kw.position.set(-3.75, 1.1, 3.58);
    g.add(kw);
    const kr = box(1.2, 0.12, 0.9, pink);
    kr.position.set(-3.75, 1.62, 3.2);
    g.add(kr);
    // OPEN sign hanging in the door glass area
    const open = sign('OPEN', '#1a8f5a', 0.9, 0.34);
    open.position.set(1.7, 2.35, 2.74);
    g.add(open);
    // blade sign on a bracket at the right front corner (readable from both sides)
    const arm = box(0.9, 0.08, 0.08, dark);
    arm.position.set(3.55, 3.2, 2.7);
    g.add(arm);
    const blade = box(0.08, 0.9, 0.9, dark);
    blade.position.set(3.95, 2.7, 2.7);
    g.add(blade);
    for (const s of [1, -1]) {
      const bs = sign('GAMES', '#e0579f', 0.8, 0.8);
      bs.position.set(3.95 + s * 0.06, 2.7, 2.7);
      bs.rotation.y = s * Math.PI / 2;
      g.add(bs);
    }
    // string of bulbs along the canopy front edge
    for (let i = 0; i < 7; i++) {
      const col = [0xfff3a0, 0xff9bd2, 0x9ff3ff][i % 3];
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), neon(col, col, 1.2));
      bulb.position.set(-1.6 + i * 0.53, 2.82 - 0.04 * Math.abs(i - 3) * 0.4 - 0.1, 4.12);
      g.add(bulb);
    }
    // pixel mural on both side walls (checker blocks in violet/pink/cyan)
    for (const sx of [-3.16, 3.16]) {
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 2; j++) {
          const c = (i + j) % 2 ? pink : cyan;
          const px = box(0.06, 0.28, 0.28, c);
          px.position.set(sx, 0.75 + j * 0.3, -0.4 + i * 0.3 - 0.45);
          g.add(px);
        }
      }
    }
    // rooftop: vents, small dish antenna and a rooftop pixel star
    for (const vx of [-1.8, 1.9]) {
      const vent = box(0.7, 0.45, 0.7, mat(0x3a3068));
      vent.position.set(vx, 4.3, -1.3);
      g.add(vent);
      const vc = box(0.8, 0.08, 0.8, dark);
      vc.position.set(vx, 4.55, -1.3);
      g.add(vc);
    }
    const mast = box(0.07, 1.4, 0.07, dark);
    mast.position.set(1.0, 4.9, -1.6);
    g.add(mast);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 8), mat(0xdfe6ee));
    dish.position.set(1.0, 5.55, -1.5);
    dish.rotation.x = -1.2;
    g.add(dish);
    const star = box(0.34, 0.34, 0.12, neon(0xfff3a0, 0xf2d54e, 1.3));
    star.position.set(0, 6.55, 2.35);
    star.rotation.z = Math.PI / 4;
    g.add(star);
    // doormat + floor decals in front of the door
    const matt = box(1.6, 0.04, 0.8, violetM);
    matt.position.set(0, 0.22, 3.55);
    g.add(matt);
    // planters flanking the steps with glowing flowers
    for (const px of [-1.9, 1.9]) {
      const pot = rbox(0.6, 0.5, 0.6, 0.06, mat(0x4b3a9a));
      pot.position.set(px, 0.3, 4.15);
      g.add(pot);
      for (let k = 0; k < 3; k++) {
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 6), neon(k % 2 ? 0xff9bd2 : 0xfff3a0, k % 2 ? 0xe0579f : 0xf2d54e, 0.5));
        fl.position.set(px - 0.15 + k * 0.15, 0.7 + (k % 2) * 0.08, 4.15);
        g.add(fl);
      }
    }
    // cabinet detail: joystick + buttons on the front cabinets
    for (let i = 0; i < 4; i++) {
      const cx = -2.4 + i * 0.95;
      const stick = box(0.05, 0.22, 0.05, dark);
      stick.position.set(cx - 0.12, 1.05, 3.92);
      g.add(stick);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), neon(0xff4f6a, 0xff4f6a, 0.7));
      ball.position.set(cx - 0.12, 1.2, 3.92);
      g.add(ball);
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), neon(0xf2d54e, 0xf2d54e, 0.7));
      btn.position.set(cx + 0.14, 1.1, 3.93);
      btn.rotation.x = Math.PI / 2;
      g.add(btn);
    }
    // trash bin by the bench
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.65, 8), mat(0x3a3068));
    bin.position.set(4.1, 0.55, 4.6);
    g.add(bin);
  }
  wallLamp(g, -3.0, 2.3, 2.8);
  wallLamp(g, 3.0, 2.3, 2.8);
  entranceSteps(g, 3.35, 3);
  benchSeat(g, 3.2, 4.4, 0x5a45b0);
  frontPath(g, 3.9);
  // gold token sign on a bracket at the left front corner (mirrors the GAMES blade)
  {
    const coinM = mat(0xf2c230, { roughness: 0.5 });
    const arm = box(0.1, 0.1, 0.8, mat(0x2a2038));
    arm.position.set(-3.95, 3.35, 2.4);
    g.add(arm);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), coinM);
    coin.rotation.z = Math.PI / 2;
    coin.position.set(-3.95, 2.8, 2.8);
    g.add(coin);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.14, 12), mat(0xc9961a, { roughness: 0.6 }));
    rim.rotation.z = Math.PI / 2;
    rim.position.copy(coin.position);
    g.add(rim);
  }
  return g;
}

