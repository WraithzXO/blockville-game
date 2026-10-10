// Building factory: the single entry point the Engine uses to create plot buildings.
import * as THREE from 'three';
import type { BuildingType } from '../game/config';
import { buildCasino } from './Casino';
import { buildMine } from './Mine';
import { buildArcade } from './Arcade';
import { buildHouse } from './House';
import { buildPark } from './Park';
import { buildShopV3 } from './Shop';
import { buildBankV3 } from './Bank';
import { buildCafeV3 } from './Cafe';
import { buildBakeryV3 } from './Bakery';
import { PAVED_Z_BANDS, CROSS_STREETS } from '../game/config';

export function buildMesh(type: BuildingType, level: number): THREE.Group {
  let g: THREE.Group;
  switch (type) {
    case 'house': g = buildHouse(level); break;
    case 'casino': g = buildCasino(level); break;
    case 'mine': g = buildMine(level); break;
    case 'shop': g = buildShopV3(level); break;
    case 'bank': g = buildBankV3(level); break;
    case 'cafe': g = buildCafeV3(level); break;
    case 'arcade': g = buildArcade(level); break;
    case 'bakery': g = buildBakeryV3(level); break;
    case 'park': g = buildPark(level); break;
  }
  return g;
}

export function constrainBuildingToPlot(mesh: THREE.Group) {
  mesh.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const maxWidth = 11.2;
  const maxDepth = 12.2;
  const fit = Math.min(1, maxWidth / Math.max(size.x, 0.01), maxDepth / Math.max(size.z, 0.01));
  if (fit < 1) mesh.scale.multiplyScalar(fit);
  mesh.userData.fitScale = mesh.scale.x;
}

// Sit the building back from the road: every plot has a real front yard, so
// even deep frontages (the mine's dirt apron) keep clear of the asphalt.
export const FRONT_MARGIN = 4.0;   // default max |z| the frontage may reach from the plot centre
export const BACK_MARGIN = 8.2;    // default max |z| the rear may reach (historic depth cap 12.2 minus front 4.0)
const CLEAR = 0.6;                 // keep-out gap between any footprint and a paved edge

// How far a building on this plot may reach toward its street (front), away
// from it (back) and sideways (halfWidth), derived from the paved bands and
// north-south streets. Rows far from pavement keep the historic margins, so
// only genuinely cramped plots are affected.
export function plotRoom(def: { x: number; z: number; side: 'north' | 'south' }) {
  const frontSign = def.side === 'north' ? 1 : -1;
  let front = FRONT_MARGIN, back = BACK_MARGIN;
  for (const [a, b] of PAVED_Z_BANDS) {
    if (frontSign > 0 ? a >= def.z : b <= def.z) {
      const dist = frontSign > 0 ? a - def.z : def.z - b;
      front = Math.min(front, dist - CLEAR);
    }
    if (frontSign > 0 ? b <= def.z : a >= def.z) {
      const dist = frontSign > 0 ? def.z - b : a - def.z;
      back = Math.min(back, dist - CLEAR);
    }
  }
  let halfWidth = 5.6;
  const zLo = def.z - back, zHi = def.z + front;
  for (const c of CROSS_STREETS) {
    if (zLo < c.z1 + CLEAR && zHi > c.z0 - CLEAR) {
      halfWidth = Math.min(halfWidth, Math.abs(def.x - c.x) - 3 - CLEAR);
    }
  }
  return { front: Math.max(0, front), back: Math.max(0, back), halfWidth: Math.max(0, halfWidth) };
}

// Constrain + uniformly fit a freshly built mesh to its plot's room, measured
// in local space with the mesh still at the origin. Returns the local front /
// back extents (toward +z) after fitting.
export function fitToPlot(mesh: THREE.Group, def: { x: number; z: number; side: 'north' | 'south' }) {
  constrainBuildingToPlot(mesh);
  const room = plotRoom(def);
  mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  bb.getSize(size);
  const fit = Math.min(
    1,
    (room.front + room.back) / Math.max(size.z, 0.01),
    (room.halfWidth * 2) / Math.max(size.x, 0.01),
  );
  if (fit < 1) {
    mesh.scale.multiplyScalar(fit);
    mesh.userData.fitScale = mesh.scale.x;
    mesh.updateMatrixWorld(true);
  }
  const fitted = new THREE.Box3().setFromObject(mesh);
  return { front: fitted.max.z, back: -fitted.min.z, minX: fitted.min.x, maxX: fitted.max.x };
}

export function placeOnPlot(mesh: THREE.Group, def: { x: number; z: number; side: 'north' | 'south' }) {
  const sign = def.side === 'north' ? 1 : -1;
  const room = plotRoom(def);
  const { front: fz, back: bz, minX, maxX } = fitToPlot(mesh, def);
  // Satisfy both the front-yard rule (historic: natural reach up to room.front)
  // and the back clearance with one shift; fitToPlot already guaranteed the
  // footprint depth fits the room, so a single shift can satisfy both.
  const s = sign > 0
    ? Math.max(room.front - fz, Math.min(0, bz - room.back))
    : Math.max(fz - room.front, Math.min(0, room.back - bz));
  mesh.position.set(def.x, 0, def.z + s);
  mesh.rotation.y = def.side === 'north' ? 0 : Math.PI;
  // side clearance: only center when the footprint would cross a street edge
  if (Math.max(-minX, maxX) > room.halfWidth) {
    mesh.position.x = def.x - sign * (minX + maxX) / 2;
  }
}

// ---- shared residential architecture kit ---------------------------------
// Materials are created once and shared by every house instance.
