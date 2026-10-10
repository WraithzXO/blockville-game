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
export const FRONT_MARGIN = 4.0;   // max |z| the frontage may reach from the plot centre
export function placeOnPlot(mesh: THREE.Group, def: { x: number; z: number; side: 'north' | 'south' }) {
  const sign = def.side === 'north' ? 1 : -1;
  constrainBuildingToPlot(mesh);
  // measure in local space (mesh still at the origin) so the shift is not
  // polluted by the plot position itself
  mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(mesh);
  const over = Math.max(0, bb.max.z - FRONT_MARGIN);
  mesh.position.set(def.x, 0, def.z - sign * over);
  mesh.rotation.y = def.side === 'north' ? 0 : Math.PI;
}

// ---- shared residential architecture kit ---------------------------------
// Materials are created once and shared by every house instance.
