// "World Expansion 3" teaser: a pitch-black entranceway cut into the mountain face on the far (east) shore of the
// lake, with a sign above it. Decorative only: no collision, no gameplay. A level, terrain-grounded staircase climbs
// from the dry beach to the doorway floor, with a diamond minecart at its foot.
// The face there is a smooth slope (x ~= 346 + 0.6 * y), so the whole group leans with it and the black recess is
// pushed deep into the rock, which keeps the doorway from clipping or floating off the cliff.
import * as THREE from 'three';
import { signTexture } from '../buildings/BuildingMaterials';
import { meshH } from './WorldTerrain';

const FACE_X = 345.2, FACE_Z = 6, LEAN = Math.atan(0.6), YAW = Math.atan(0.2);   // the face also runs away from the lake as z grows (~0.2 per unit)

export function buildWorldExpansionPortal(scene: THREE.Scene): THREE.Group {
  const root = new THREE.Group();
  root.name = 'world-expansion-3-entrance';
  root.position.set(FACE_X, 0, FACE_Z);
  root.rotation.y = YAW;          // follow the face along the shore
  const g = new THREE.Group();
  g.rotation.z = -LEAN;           // top leans into the mountain, like the slope
  root.add(g);
  // local +x = into the mountain, local -x = out over the lake, local y = up the slope, local z = along the shore
  const rock = new THREE.MeshStandardMaterial({ color: 0x59564f, roughness: 1, flatShading: true });
  const rockDark = new THREE.MeshStandardMaterial({ color: 0x3f3d39, roughness: 1, flatShading: true });
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const W = 11, H = 11, R = W / 2;

  // black recess: rectangular body plus a half-round head, sunk 8 units into the rock
  const body = new THREE.Mesh(new THREE.BoxGeometry(8, H - R, W), black);
  body.position.set(4 - 0.05, (H - R) / 2, 0);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 8, 20, 1, false, 0, Math.PI), black);
  head.rotation.z = Math.PI / 2;            // axis along x
  head.rotation.y = 0;
  head.position.set(4 - 0.05, H - R, 0);
  // CylinderGeometry half (thetaLength PI) after rotation: rebuild as a full cylinder for a clean arch
  head.geometry.dispose();
  head.geometry = new THREE.CylinderGeometry(R, R, 8, 24);
  g.add(body, head);

  // chunky stone surround (low-poly, same flat-shaded rock language as the mountains)
  const stone = (w: number, h: number, d: number, x: number, y: number, z: number, m = rock) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    s.position.set(x, y, z); s.castShadow = true; s.receiveShadow = true; g.add(s); return s;
  };
  for (const side of [-1, 1]) {
    stone(1.6, H - R, 1.8, -0.5, (H - R) / 2, side * (R + 0.9));
    stone(1.2, 1.4, 2.2, -0.9, 0.7, side * (R + 1.0), rockDark);
  }
  // arch ring of voussoir blocks
  const blocks = 11;
  for (let i = 0; i <= blocks; i++) {
    const a = (i / blocks) * Math.PI;                      // 0 .. PI across the top
    const bz = Math.cos(a) * (R + 0.8), by = H - R + Math.sin(a) * (R + 0.8);
    const b = stone(1.6, 1.7, 1.9, -0.5, by, bz, i % 2 ? rockDark : rock);
    b.rotation.x = -(a - Math.PI / 2) * -1 + Math.PI / 2 * 0;  // blocks fan around the arch
    b.rotation.x = a - Math.PI / 2;
  }
  // staircase + landing, built in the ROOT frame (yaw only, no lean) so every step is level and axis-aligned with the
  // doorway. Each block is a solid column whose bottom is cut to the lowest sampled terrain under its footprint, so
  // nothing floats and nothing hangs over the water.
  const YAWc = Math.cos(YAW), YAWs = Math.sin(YAW);
  const wx = (lx: number, lz: number) => FACE_X + lx * YAWc + lz * YAWs;
  const wz = (lx: number, lz: number) => FACE_Z - lx * YAWs + lz * YAWc;
  const lowAndHigh = (x0: number, x1: number, z0: number, z1: number) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const hgt = meshH(wx(x0 + (x1 - x0) * i / 4, z0 + (z1 - z0) * j / 4), wz(x0 + (x1 - x0) * i / 4, z0 + (z1 - z0) * j / 4));
      lo = Math.min(lo, hgt); hi = Math.max(hi, hgt);
    }
    return { lo, hi };
  };
  const stoneMat = [new THREE.MeshStandardMaterial({ color: 0x6b675d, roughness: 1, flatShading: true }), new THREE.MeshStandardMaterial({ color: 0x5a574f, roughness: 1, flatShading: true })];
  const capMat = new THREE.MeshStandardMaterial({ color: 0x8c8676, roughness: 1, flatShading: true });
  /** solid block with its top at world `top`, spanning root-local x0..x1, z0..z1, down to the terrain */
  const column = (x0: number, x1: number, z0: number, z1: number, top: number) => {
    const { lo } = lowAndHigh(x0, x1, z0, z1);
    const bottom = lo - 0.3, capH = 0.14;
    let y = bottom, c = 0;
    while (y < top - capH - 0.01) {                         // stacked courses, so tall plinths read as masonry
      const h = Math.min(1.1, top - capH - y);
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), stoneMat[c++ % 2]);
      m.position.set((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; root.add(m);
      y += h;
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.06, capH, z1 - z0 + 0.06), capMat);
    cap.position.set((x0 + x1) / 2, top - capH / 2, (z0 + z1) / 2); cap.receiveShadow = true; root.add(cap);
  };
  // 8 uniform steps (rise 0.37, run 1.0) climb along the shore from the dry beach to the doorway floor (y = 0)
  const STEPS = 8, RISE = 0.37, RUN = 1.0, Z0 = -15, SX0 = -4, SX1 = -1.8;
  for (let k = 1; k <= STEPS; k++) column(SX0, SX1, Z0 + (k - 1) * RUN, Z0 + k * RUN, -(STEPS - k) * RISE);
  const LZ = Z0 + STEPS * RUN;                              // -7: where the last step meets the landing
  column(SX0, SX1, LZ, -5.4, 0);                            // connector, clear of the arch's side stones
  column(SX0, -0.1, -5.4, -2, 0);                           // landing in front of the doorway

  // Minecraft-style minecart on short rails at the foot of the stairs, beside them on the beach
  {
    const CX = -6, CZ = -17.5, LEN = 1.7, WID = 1.15;
    const { lo, hi } = lowAndHigh(CX - 0.7, CX + 0.7, CZ - 1.4, CZ + 1.4);
    const railTop = hi + 0.25;
    const iron = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.6, metalness: 0.4, flatShading: true });
    const ironDark = new THREE.MeshStandardMaterial({ color: 0x2f3237, roughness: 0.7, metalness: 0.3, flatShading: true });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1, flatShading: true });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
    };
    // sleepers reach down to the lowest terrain under the track, rails on top
    const sleeperH = railTop - 0.12 - (lo - 0.1);
    for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(1.5, sleeperH, 0.22), wood, CX, (lo - 0.1) + sleeperH / 2, CZ - 1.25 + i * 0.5);
    for (const sx of [-0.5, 0.5]) add(new THREE.BoxGeometry(0.1, 0.12, 3.0), iron, CX + sx, railTop - 0.06, CZ);
    const floorY = railTop + 0.38;                           // cart body sits on its wheels
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.55, 0.55]) {
      const wheel = add(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8), ironDark, CX + sx, railTop + 0.2, CZ + sz);
      wheel.rotation.z = Math.PI / 2;
    }
    add(new THREE.BoxGeometry(WID, 0.12, LEN), ironDark, CX, floorY, CZ);
    add(new THREE.BoxGeometry(0.1, 0.62, LEN), iron, CX - WID / 2 + 0.05, floorY + 0.3, CZ);
    add(new THREE.BoxGeometry(0.1, 0.62, LEN), iron, CX + WID / 2 - 0.05, floorY + 0.3, CZ);
    add(new THREE.BoxGeometry(WID, 0.62, 0.1), iron, CX, floorY + 0.3, CZ - LEN / 2 + 0.05);
    add(new THREE.BoxGeometry(WID, 0.62, 0.1), iron, CX, floorY + 0.3, CZ + LEN / 2 - 0.05);
    add(new THREE.BoxGeometry(WID + 0.12, 0.08, 0.12), ironDark, CX, floorY + 0.64, CZ - LEN / 2 + 0.05);   // rim trim
    add(new THREE.BoxGeometry(WID + 0.12, 0.08, 0.12), ironDark, CX, floorY + 0.64, CZ + LEN / 2 - 0.05);
    // heaped diamonds: bright faceted gems that read from the normal camera distance
    const gemMat = new THREE.MeshStandardMaterial({ color: 0x4de8ff, emissive: 0x19b8d8, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1, flatShading: true });
    const gemPale = new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x5fd8f0, emissiveIntensity: 0.7, roughness: 0.2, flatShading: true });
    const gems: [number, number, number, number, number][] = [   // x, z, y-offset, size, yaw
      [-0.22, -0.5, 0.45, 0.3, 0.3], [0.22, -0.45, 0.5, 0.3, 1.1], [0.0, -0.1, 0.62, 0.34, 0.7],
      [-0.25, 0.25, 0.5, 0.3, 1.9], [0.24, 0.2, 0.56, 0.32, 0.2], [0.0, 0.55, 0.46, 0.3, 2.4], [-0.05, 0.28, 0.76, 0.28, 0.9],
    ];
    gems.forEach(([gx, gz, gy, gs, ry], i) => {
      const gem = add(new THREE.OctahedronGeometry(gs, 0), i % 3 === 0 ? gemPale : gemMat, CX + gx, floorY + gy, CZ + gz);
      gem.scale.y = 1.35; gem.rotation.y = ry;
    });
  }

  // sign board above the arch: weathered planks, two hanging chains, glowing lettering
  const SW = 17, SH = 2.7;
  const signY = H + 3.4;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.5, SH + 0.5, SW + 0.5), new THREE.MeshStandardMaterial({ color: 0x4b3320, roughness: 0.9 }));
  board.position.set(-0.7, signY, 0);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SH),
    new THREE.MeshBasicMaterial({ map: signTexture('WORLD EXPANSION 3: COMING SOON.', '#1b1b1f', '#ffd66b', SW / SH) }),
  );
  face.rotation.y = -Math.PI / 2;           // plane normal toward -x (out to the lake)
  face.position.set(-0.97, signY, 0);
  g.add(board, face);
  for (const side of [-1, 1]) stone(0.35, 3.0, 0.35, -0.7, H + 1.2 + 0.2, side * (SW / 2 - 1.2), new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.8 }));

  // two warm lanterns flanking the doorway read from across the lake
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0xffc04d }));
    lamp.position.set(-1.1, H - 1.2, side * (R + 2.1));
    g.add(lamp);
  }
  scene.add(root);
  return root;
}
