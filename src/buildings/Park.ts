//# Building primitives and materials shared by every building and the Engine.
import * as THREE from 'three';

import  { mat, box, rbox }  from './BuildingMaterials';


export function buildPark(level: number): THREE.Group {
  const g = new THREE.Group();
  // lawn slab with a cross of gravel paths
  const lawn = box(9, 0.12, 9, mat(0x6dbb5a));
  lawn.position.y = 0.06;
  lawn.receiveShadow = true;
  g.add(lawn);
  for (const [pw, pd, px, pz] of [[1.6, 9, 0, 0], [9, 1.6, 0, 0]] as const) {
    const path = box(pw, 0.05, pd, mat(0xcfc8b8));
    path.position.set(px, 0.14, pz);
    g.add(path);
  }
  // two-tier fountain in the middle
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.9, 0.7, 12), mat(0xb9b2a4));
  basin.position.y = 0.35;
  basin.castShadow = true;
  g.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.5, 12), mat(0x6fc4e8, { roughness: 0.3 }));
  water.position.y = 0.6;
  g.add(water);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 10), mat(0xb9b2a4));
  pedestal.position.y = 1.0;
  g.add(pedestal);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.3, 12), mat(0xcfc8b8));
  bowl.position.y = 1.45;
  bowl.castShadow = true;
  g.add(bowl);
  const bowlWater = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 12), mat(0x8fd8f0, { roughness: 0.25 }));
  bowlWater.position.y = 1.62;
  g.add(bowlWater);
  const jet = new THREE.Mesh(
    new THREE.ConeGeometry(0.28, 1.2, 8),
    new THREE.MeshStandardMaterial({ color: 0xafe8f8, transparent: true, opacity: 0.8, roughness: 0.2 }),
  );
  jet.position.y = 2.4;
  g.add(jet);
  // ring of flowers around the basin
  const flowerCols = [0xf26d7d, 0xf2d54e, 0xe0574f, 0xc78ae0];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 6), mat(flowerCols[i % 4]));
    fl.position.set(Math.cos(a) * 2.5, 0.3, Math.sin(a) * 2.5);
    g.add(fl);
  }
  // hedges on the corners
  for (const [hx, hz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]] as const) {
    const hedge = rbox(1.7, 1.05, 1.7, 0.2, mat(0x4e9e4e));
    hedge.position.set(hx, 0.62, hz);
    g.add(hedge);
  }
  // trees of varied heights
  const treeSpots: [number, number, number][] = [[-3.5, 0, 1], [3.5, 0, 1.25], [0, -3.5, 0.85], [0, 3.5, 1.1]];
  for (const [tx, tz, k] of treeSpots) {
    const trunk = box(0.5, 1.5 * k, 0.5, mat(0x7a5230));
    trunk.position.set(tx, 0.75 * k, tz);
    trunk.castShadow = true;
    g.add(trunk);
    const leaf = rbox(1.9 * k, 1.9 * k, 1.9 * k, 0.3, mat(0x4e9e4e));
    leaf.position.set(tx, 2.4 * k, tz);
    g.add(leaf);
    const leaf2 = rbox(1.15 * k, 1.0 * k, 1.15 * k, 0.2, mat(0x5cb85c));
    leaf2.position.set(tx, 3.5 * k, tz);
    g.add(leaf2);
  }
  // benches facing the fountain
  for (const bx of [-1.9, 1.9]) {
    const bench = rbox(1.7, 0.16, 0.55, 0.05, mat(0x8a6a3f));
    bench.position.set(bx, 0.55, 3.2);
    g.add(bench);
    const back = box(1.7, 0.5, 0.12, mat(0x8a6a3f));
    back.position.set(bx, 0.85, 3.42);
    g.add(back);
    for (const lx of [bx - 0.7, bx + 0.7]) {
      const bleg = box(0.12, 0.5, 0.4, mat(0x6b5230));
      bleg.position.set(lx, 0.28, 3.2);
      g.add(bleg);
    }
  }
  // lampposts on two corners
  for (const [lx, lz] of [[-3.5, -3.5], [3.5, 3.5]] as const) {
    const lamppost = box(0.15, 2.7, 0.15, mat(0x3d4450, { metalness: 0.4 }));
    lamppost.position.set(lx * 0.72, 1.35, lz * 0.72);
    g.add(lamppost);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffe9a8, emissiveIntensity: 0.8 }),
    );
    lamp.position.set(lx * 0.72, 2.9, lz * 0.72);
    g.add(lamp);
  }
  if (level >= 2) {
    // duck pond extension
    const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 0.25, 12), mat(0x6fc4e8, { roughness: 0.3 }));
    pond.position.set(-2.6, 0.2, -2.6);
    g.add(pond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 16), mat(0xb9b2a4));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(-2.6, 0.3, -2.6);
    g.add(rim);
  }
  if (level >= 3) {
    // flower bed with a little wooden arch
    const bed = box(2.6, 0.3, 1.0, mat(0x8a5a33));
    bed.position.set(2.8, 0.28, -1.6);
    g.add(bed);
    for (let i = 0; i < 4; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), mat(flowerCols[i]));
      fl.position.set(2.1 + i * 0.45, 0.58, -1.6);
      g.add(fl);
    }
    for (const ax of [1.4, 4.2]) {
      const post2 = box(0.16, 2.2, 0.16, mat(0x7a5230));
      post2.position.set(ax - 2.8, 1.1, -1.6);
      g.add(post2);
    }
    const arch = box(3.0, 0.16, 0.16, mat(0x7a5230));
    arch.position.set(2.8, 2.15, -1.6);
    g.add(arch);
  }
  return g;
}
