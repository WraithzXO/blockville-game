import * as THREE from 'three';
import { mat, box } from '../buildings/BuildingMaterials';
import type { FurniturePlacement } from '../game/state';
import { FURNITURE_DEFS } from '../game/config';
import { makeFurnitureModel } from '../furniture/FurnitureModels';

// ── real 3D House interior (moved verbatim from Engine, Checkpoint 4) ────
// Rebuilds the room shell + furniture into the given interior group.
export function rebuildHouseInterior(g: THREE.Group, paint: string, placements: FurniturePlacement[]) {
    while (g.children.length) g.remove(g.children[g.children.length - 1]);
    // the world's lights are hidden while inside, so the room carries its own
    const amb = new THREE.AmbientLight(0xfff1dc, 1.1);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(6, 14, 4);
    const warm = new THREE.PointLight(0xffd9a0, 50, 50, 1.4);
    warm.position.set(0, 5, -7);
    g.add(amb, sun, warm);
    const wallMat = mat(Number.parseInt(paint.replace('#', ''), 16) || 0xead8b8);
    const floorMat = mat(0x6f4a35);
    const trimMat = mat(0x3e2b25);
    const windowMat = mat(0x7fc7db, { emissive: 0x254c62, emissiveIntensity: 0.35 });
    // the resident now walks the room in first person, so the shell must
    // render from the inside too (boxes are single-sided by default)
    for (const m of [wallMat, floorMat, trimMat, windowMat]) m.side = THREE.DoubleSide;
    // interior is built 2x the old footprint (30 x 24); the exterior is untouched
    const W = 30, D = 24, H = 6.4, hw = W / 2, hd = D / 2;
    const floor = box(W, 0.35, D, floorMat); floor.position.y = -0.18; g.add(floor);
    const back = box(W, H, 0.35, wallMat); back.position.set(0, H / 2, -hd); g.add(back);
    const left = box(0.35, H, D, wallMat); left.position.set(-hw, H / 2, 0); g.add(left);
    const right = box(0.35, H, D, wallMat); right.position.set(hw, H / 2, 0); g.add(right);
    // front wall: two side pieces + a lintel above the door, so the door sits in solid wall
    const doorW = 2.2, doorH = 3.5, frameW = 0.25;
    const sideW = hw - (doorW / 2 + frameW);
    const frontL = box(sideW, H, 0.35, wallMat); frontL.position.set(-(hw - sideW / 2), H / 2, hd); g.add(frontL);
    const frontR = box(sideW, H, 0.35, wallMat); frontR.position.set(hw - sideW / 2, H / 2, hd); g.add(frontR);
    const lintel = box(doorW + frameW * 2, H - doorH - frameW, 0.35, wallMat); lintel.position.set(0, doorH + frameW + (H - doorH - frameW) / 2, hd); g.add(lintel);
    const frameTop = box(doorW + frameW * 2, frameW, 0.42, trimMat); frameTop.position.set(0, doorH + frameW / 2, hd); g.add(frameTop);
    for (const sx of [-1, 1]) { const post = box(frameW, doorH, 0.42, trimMat); post.position.set(sx * (doorW / 2 + frameW / 2), doorH / 2, hd); g.add(post); }
    const beam = box(W + 0.4, 0.3, 0.35, trimMat); beam.position.set(0, H - 0.15, -hd + 0.2); g.add(beam);
    const roof = box(W + 0.6, 0.3, D + 0.6, mat(0x4a3440)); roof.position.y = H + 0.15; g.add(roof);
    for (const wx of [-7.2, 7.2]) {
      const window = box(3.2, 2.1, 0.18, windowMat); window.position.set(wx, 3.0, -hd + 0.22); g.add(window);
      const crossV = box(0.12, 2.2, 0.24, trimMat); crossV.position.set(wx, 3.0, -hd + 0.35); g.add(crossV);
      const crossH = box(3.3, 0.12, 0.24, trimMat); crossH.position.set(wx, 3.0, -hd + 0.35); g.add(crossH);
    }
    const door = box(doorW, doorH, 0.22, mat(0x50352a)); door.position.set(0, doorH / 2, hd - 0.02); g.add(door);
    const doorKnob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(0xe1b85b)); doorKnob.position.set(0.65, 1.75, hd - 0.2); g.add(doorKnob);
    // the house starts empty: every piece of furniture comes from the player's purchases
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffe5a6, emissive: 0xffc95c, emissiveIntensity: 1.4 })); lamp.position.set(0, 5.4, 0); g.add(lamp);
    const light = new THREE.PointLight(0xffdfae, 60, 50, 1.4); light.position.set(0, 5, 0); g.add(light);
    const byId = new Map(placements.map((p) => [p.id, p]));
    for (const placement of byId.values()) {
      const fg = makeFurnitureModel(placement.itemId, FURNITURE_DEFS.find((d) => d.id === placement.itemId)?.color);
      if (!fg) continue;
      fg.position.set(THREE.MathUtils.clamp(placement.x * 2, -13, 13), 0, THREE.MathUtils.clamp(placement.z * 2, -10, 9));
      fg.rotation.y = placement.rotation;
      g.add(fg);
    }
}
