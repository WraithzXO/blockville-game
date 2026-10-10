// Tree entry points. The designed variants, placement and understory live in
// WorldNature.ts; these wrappers keep the Engine's call sites unchanged.
import * as THREE from 'three';
import { buildInsideVegetation, buildOutskirtsVegetation } from './WorldNature';

/** In-town verge trees, shrubs and flowers. Returns crown markers for ambient birds. */
export function buildTownTrees(scene: THREE.Scene): THREE.Object3D[] {
  return buildInsideVegetation(scene);
}

/** Outskirts: clustered groves, groups and lone trees on the real terrain. */
export function buildBoundaryTrees(scene: THREE.Scene): THREE.Object3D[] {
  return buildOutskirtsVegetation(scene);
}
