import * as THREE from 'three';
import { mat, box, rbox, sign, windowBox, cornice, pilasters, plinth, stripedAwning } from '../buildings/BuildingMaterials';
import { entranceSteps, gableBlock, framedWindow, framedDoor } from '../buildings/BuildingParts';
import { STORE_POS, type PlayerLook } from '../game/config';
import { dressBlockvilleStore, dressFurnitureStore, buildFurnitureShowroom } from './StoreDressing';

// ── landmark stores (moved verbatim from Engine, Checkpoint 4) ──────────
// The Blockville Store, the Furniture Store and the walk-in store interior.

export interface StoreCtx {
  storeFadeMats: THREE.MeshStandardMaterial[];
}

export interface StoreInteriorCtx {
  colliders: { x: number; z: number; hw: number; hd: number }[];
  worldObjs: { kind: string; group: THREE.Object3D; label: string; x: number; z: number; coolUntil: number }[];
  makeNpcMesh: (look?: PlayerLook) => THREE.Group;
  onShopkeeper: (keeper: THREE.Group) => void;
  scene: THREE.Scene;
  storeLights?: THREE.Light[];
  furnitureLights?: THREE.Light[];
}

export function makeStore(ctx: StoreCtx): THREE.Group {
    const g = new THREE.Group();
    plinth(g, 9.6, 7.6, 0x8f2c1e);
    // shell fades away while the resident is inside so the interior reads
    const bodyMat = mat(0xd8452f, { transparent: true });
    const body = rbox(9, 4.4, 7, 0.18, bodyMat);
    body.position.y = 2.2;
    g.add(body);
    ctx.storeFadeMats.push(bodyMat);
    pilasters(g, 9, 7, 4.4, 0xb23a26, 0.6);
    // cream cornice under a dark roof with a parapet lip
    cornice(g, 9.5, 7.5, 4.55, 0xfff3e0, 0.3);
    const roofMat = mat(0x7a2a1c, { transparent: true });
    const roof = box(9.7, 0.55, 7.7, roofMat);
    roof.position.y = 4.7;
    g.add(roof);
    ctx.storeFadeMats.push(roofMat);
    // little chimney the smoke puffs drift from
    const chim = box(0.8, 1.2, 0.8, mat(0x8f2c1e));
    chim.position.set(3.4, 5.4, -2);
    g.add(chim);
    const lip = box(9.7, 0.5, 0.35, mat(0x93331f));
    lip.position.set(0, 5.05, 3.68);
    g.add(lip);
    // cream striped awning over the storefront
    stripedAwning(g, 8.8, 3.35, 3.9, 0xfff3e0, 0xe8874a, 8, 1.6);
    // open double doors leave a walk-in doorway at the centre
    const doorMat = mat(0x3a241a, { transparent: true });
    const doorL = rbox(0.95, 2.6, 0.2, 0.06, doorMat);
    doorL.position.set(-1.25, 1.3, 3.55);
    const doorR = rbox(0.95, 2.6, 0.2, 0.06, doorMat);
    doorR.position.set(1.25, 1.3, 3.55);
    g.add(doorL, doorR);
    ctx.storeFadeMats.push(doorMat);
    const win = windowBox(2.6, 1.8);
    win.position.set(-2.9, 1.9, 3.58);
    g.add(win);
    const win2 = windowBox(2.6, 1.8);
    win2.position.set(2.9, 1.9, 3.58);
    g.add(win2);
    // signboard on posts above the awning
    const boardFrame = box(8.2, 1.8, 0.24, mat(0x5c1a10));
    boardFrame.position.set(0, 4.15, 3.75);
    g.add(boardFrame);
    const board = sign('BLOCKVILLE STORE', '#d8452f', 7.6, 1.5);
    board.position.set(0, 4.15, 3.9);
    g.add(board);
    // stacks of blocks for sale outside, in a little pyramid
    const stackCols = [0xe8b04c, 0x4f8fe0, 0x53b56d];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 3 - row; i++) {
        const stack = rbox(0.8, 0.8, 0.8, 0.08, mat(stackCols[row]));
        stack.position.set(4.6 + i * 0.85 + row * 0.42, 0.45 + row * 0.8, 3.2);
        g.add(stack);
      }
    }
    // Landmark detail: framed display bays and warm entry lights make the
    // central store read as a real town anchor from the approach road.
    for (const x of [-3.9, 3.9]) {
      const bay = rbox(1.25, 2.25, 0.16, 0.04, mat(0x6b2118));
      bay.position.set(x, 1.95, 3.72);
      g.add(bay);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.72, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xffd66b, emissive: 0xff9d3f, emissiveIntensity: 0.5 }),
      );
      glow.position.set(x, 2.1, 3.83);
      g.add(glow);
    }
    const storeBell = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd66b, emissive: 0xff8a3d, emissiveIntensity: 0.55 }));
    storeBell.position.set(0, 3.1, 3.72);
    g.add(storeBell);
    // rear and sides: service door with frame + step + lamp, windows, vent
    const rdFrame = box(1.5, 2.55, 0.14, mat(0xfff3e0)); rdFrame.position.set(-2.4, 1.28, -3.52); g.add(rdFrame);
    const rdLeaf = box(1.2, 2.3, 0.12, mat(0x3a241a)); rdLeaf.position.set(-2.4, 1.15, -3.58); g.add(rdLeaf);
    const rdKnob = box(0.12, 0.12, 0.1, mat(0xe8b04c)); rdKnob.position.set(-2.0, 1.15, -3.66); g.add(rdKnob);
    const rdStep = box(1.9, 0.16, 0.7, mat(0xb8afa0)); rdStep.position.set(-2.4, 0.08, -3.95); g.add(rdStep);
    const rdLamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd66b, emissiveIntensity: 0.7 }));
    rdLamp.position.set(-1.2, 2.8, -3.7); g.add(rdLamp);
    for (const wx of [0.9, 3.0]) {
      const rw = windowBox(1.4, 1.3); rw.rotation.y = Math.PI; rw.position.set(wx, 2.1, -3.55); g.add(rw);
      const rs = box(1.7, 0.12, 0.3, mat(0xfff3e0)); rs.position.set(wx, 1.4, -3.65); g.add(rs);
    }
    for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) {
      const sw = windowBox(1.1, 1.3); sw.rotation.y = sx * Math.PI / 2; sw.position.set(sx * 4.55, 2.1, z); g.add(sw);
      const ss = box(0.3, 0.12, 1.4, mat(0xfff3e0)); ss.position.set(sx * 4.65, 1.4, z); g.add(ss);
    }
    for (const [cx2, cy] of [[3.4, 0.45], [3.4, 1.25], [4.1, 0.45]] as [number, number][]) {
      const cr = rbox(0.7, 0.7, 0.7, 0.06, mat(cy > 1 ? 0xe8b04c : 0xb98a52)); cr.position.set(cx2, cy, -4.2); g.add(cr);
    }
    dressBlockvilleStore(g);
    entranceSteps(g, 4.3, 3.2);
    g.position.set(STORE_POS.x, 0, STORE_POS.z);
    // every exterior material joins the fade so the whole shell goes ghostly
    // while the resident is inside (interior lives in a separate group)
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mm of mats) {
          const std = mm as THREE.MeshStandardMaterial;
          if (!ctx.storeFadeMats.includes(std)) {
            std.transparent = true;
            ctx.storeFadeMats.push(std);
          }
        }
      }
    });
    return g;
}

export function makeFurnitureStore(ctx: { fadeMats: THREE.MeshStandardMaterial[]; colliders: { x: number; z: number; hw: number; hd: number }[] }): THREE.Group {
    const g = new THREE.Group();
    const body = rbox(9.2, 4.2, 7.1, 0.18, mat(0xf1e3c6));
    body.position.y = 2.1;
    g.add(body);
    // pitched roof, ridge running along the street frontage, with a
    // parapet-style sign board standing proud of the front eave
    const roof = gableBlock(9.2, 7.1, 0.02, 1.9, mat(0x27456f), 0.4, mat(0x27456f), mat(0xf2c14e));
    roof.position.y = 4.2;
    g.add(roof);
    cornice(g, 9.6, 7.5, 4.15, 0xfff3e0, 0.28);
    // broad front glazing and warm display windows
    for (const x of [-2.8, 2.8]) {
      const win = windowBox(2.35, 1.65);
      win.position.set(x, 1.9, 3.62);
      g.add(win);
    }
    const door = framedDoor(1.2, 2.3);
    door.position.set(0, 0, 3.6);
    g.add(door);
    // side windows and a rear service door so no wall is blank
    for (const sx of [-1, 1]) for (const z of [-1.4, 1.4]) {
      const sw = framedWindow(1.2, 1.3);
      sw.rotation.y = sx * Math.PI / 2;
      sw.position.set(sx * 4.62, 2.0, z);
      g.add(sw);
    }
    // rear: framed service door with step + lamp, a window, and a gable vent
    const rdoor = framedDoor(1.1, 2.1); rdoor.rotation.y = Math.PI; rdoor.position.set(-1.8, 0, -3.58); g.add(rdoor);
    const rstep = box(1.5, 0.14, 0.6, mat(0xcfc6b4)); rstep.position.set(-1.8, 0.07, -3.95); g.add(rstep);
    const rw = framedWindow(1.3, 1.2);
    rw.rotation.y = Math.PI;
    rw.position.set(1.8, 2.0, -3.6);
    g.add(rw);
    const rlamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd66b, emissiveIntensity: 0.8 }));
    rlamp.position.set(-0.6, 2.4, -3.7); g.add(rlamp);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), mat(0xf4ead0)); vent.rotation.x = Math.PI / 2; vent.position.set(0, 5.0, -3.58); g.add(vent);
    const ventIn = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), mat(0x2a3b52)); ventIn.rotation.x = Math.PI / 2; ventIn.position.set(0, 5.0, -3.6); g.add(ventIn);
    const signBoard = box(8.2, 1.65, 0.24, mat(0x213a60));
    signBoard.position.set(0, 4.0, 3.78);
    g.add(signBoard);
    const storeSign = sign('FURNITURE STORE', '#4f8fe0', 7.6, 1.35);
    storeSign.position.set(0, 4.0, 3.92);
    g.add(storeSign);
    stripedAwning(g, 8.3, 3.1, 3.88, 0xfff3e0, 0x72b9d7, 6, 1.2);
    entranceSteps(g, 4.3, 3.0);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffd66b, emissiveIntensity: 0.8 }));
    lamp.position.set(-4.0, 2.9, 3.72);
    g.add(lamp);
    dressFurnitureStore(g, ctx.colliders);
    g.position.set(STORE_POS.x + 13, 0, STORE_POS.z);
    // whole shell fades while the resident walks the showroom
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
          const std = mm as THREE.MeshStandardMaterial;
          if (!std.userData.noFade && !ctx.fadeMats.includes(std)) { std.transparent = true; ctx.fadeMats.push(std); }
        }
      }
    });
    return g;
}

export function buildStoreInterior(ctx: StoreInteriorCtx): void {
    buildFurnitureShowroom({ colliders: ctx.colliders, scene: ctx.scene, storeLights: ctx.furnitureLights });
    const g = new THREE.Group();
    // interior shell — only visible from inside (back faces)
    const inner = new THREE.Mesh(
      new THREE.BoxGeometry(8.8, 4.2, 6.8),
      new THREE.MeshStandardMaterial({ color: 0xf3e2c8, side: THREE.BackSide, roughness: 1 }),
    );
    inner.position.y = 2.1;
    g.add(inner);
    const floor = box(8.6, 0.06, 6.6, mat(0xa5794a));
    floor.position.y = 0.03;
    floor.receiveShadow = true;
    g.add(floor);
    // wood plank floor, brick wainscot and two block-display tables
    for (let i = 0; i < 10; i++) {
      const pl = box(8.6, 0.05, 0.66, mat([0xb98a55, 0xa97d4b, 0xc19260][i % 3])); pl.position.set(0, 0.07, -3.0 + i * 0.66); pl.castShadow = false; g.add(pl);
    }
    for (const [w, d, x, z] of [[8.7, 0.1, 0, -3.36], [0.1, 6.7, -4.36, 0], [0.1, 6.7, 4.36, 0]] as number[][]) {
      const wb = box(w, 1.0, d, mat(0xa6402c)); wb.position.set(x, 0.5, z); g.add(wb);
      const wr = box(w, 0.1, d + 0.04, mat(0xfff3e0)); wr.position.set(x, 1.05, z); g.add(wr);
    }
    for (const sx of [-3.3, 3.3]) {
      const tb = rbox(1.5, 0.12, 1.1, 0.04, mat(0x8a5a33)); tb.position.set(sx, 0.95, 0.3);
      g.add(tb);
      for (const [lx, lz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.4], [0.6, 0.4]]) { const lg = box(0.1, 0.9, 0.1, mat(0x5c3b22)); lg.position.set(sx + lx, 0.45, 0.3 + lz); g.add(lg); }
      for (let r2 = 0; r2 < 2; r2++) for (let i2 = 0; i2 < 2 - r2; i2++) {
        const bl = rbox(0.42, 0.42, 0.42, 0.05, mat([0xe8b04c, 0x4f8fe0, 0x53b56d][(i2 + r2 + (sx > 0 ? 1 : 0)) % 3]));
        bl.position.set(sx - 0.2 + i2 * 0.44 + r2 * 0.22, 1.2 + r2 * 0.43, 0.3); g.add(bl);
      }
      ctx.colliders.push({ x: STORE_POS.x + sx, z: STORE_POS.z + 0.3, hw: 0.8, hd: 0.6 });
    }
    // counter near the front, shopkeeper behind it
    const counter = rbox(3.6, 1.05, 0.9, 0.08, mat(0x8a5a33));
    counter.position.set(0, 0.55, 1.2);
    const top = box(3.8, 0.12, 1.05, mat(0x6f4a28));
    top.position.set(0, 1.13, 1.2);
    g.add(counter, top);
    ctx.colliders.push({ x: STORE_POS.x, z: STORE_POS.z + 1.2, hw: 1.9, hd: 0.6 });
    // shelves along the back wall with colourful products
    for (const sx of [-2.9, 2.9]) {
      const unit = new THREE.Group();
      for (const uy of [0.65, 1.55, 2.45]) {
        const shelf = box(1.9, 0.1, 0.6, mat(0x9a6a3f));
        shelf.position.y = uy;
        unit.add(shelf);
        for (let i = 0; i < 4; i++) {
          const prod = rbox(0.3, 0.3, 0.3, 0.04, mat([0xe8b04c, 0x4f8fe0, 0x53b56d, 0xe0574f][i]));
          prod.position.set(-0.7 + i * 0.47, uy + 0.2, 0);
          unit.add(prod);
        }
      }
      for (const ux of [-0.9, 0.9]) {
        const up = box(0.12, 2.7, 0.12, mat(0x7a5230));
        up.position.set(ux, 1.35, 0);
        unit.add(up);
      }
      unit.position.set(sx, 0, -2.6);
      g.add(unit);
    }
    // crates by the door
    const crateA = rbox(0.9, 0.9, 0.9, 0.06, mat(0xb08a4f));
    crateA.position.set(-3.4, 0.45, 2.4);
    const crateB = rbox(0.75, 0.75, 0.75, 0.06, mat(0x9a7442));
    crateB.position.set(-3.35, 1.28, 2.35);
    crateB.rotation.y = 0.4;
    g.add(crateA, crateB);
    // welcome rug + warm hanging lamps
    const rug = box(3.4, 0.04, 2.0, mat(0xb0452f));
    rug.position.set(0, 0.06, 2.2);
    g.add(rug);
    for (const lx of [-1.8, 1.8]) {
      const cord = box(0.04, 0.7, 0.04, mat(0x3d3428));
      cord.position.set(lx, 3.75, 0.6);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffe9b0, emissive: 0xffdf9a, emissiveIntensity: 1.4 }),
      );
      bulb.position.set(lx, 3.35, 0.6);
      g.add(cord, bulb);
    }
    const warm = new THREE.PointLight(0xffdfae, 42, 18, 1.6);
    warm.position.set(0, 3.2, 0.5);
    warm.visible = false; // switched on by the engine while the resident is inside
    ctx.storeLights?.push(warm);
    g.add(warm);
    // the shopkeeper — greets you and opens the store
    const keeper = ctx.makeNpcMesh({
      skin: '#e8b88a', shirt: '#53b56d', shirtDesign: 'blockville', hat: 'cap', glasses: 'none', face: 'grin',
    });
    keeper.position.set(0, 0, 0.2);
    keeper.rotation.y = Math.PI; // faces the door
    g.add(keeper);
    ctx.onShopkeeper(keeper);
    g.position.set(STORE_POS.x, 0, STORE_POS.z);
    ctx.scene.add(g);
    ctx.worldObjs.push({
      kind: 'shopkeeper', group: keeper, label: 'Talk',
      x: STORE_POS.x, z: STORE_POS.z + 0.2, coolUntil: 0,
    });
}
