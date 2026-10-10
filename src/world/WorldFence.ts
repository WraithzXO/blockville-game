// Extracted verbatim from Engine.buildWorld (Checkpoint 2, world/environment
// extraction). Behaviour-preserving: no visual or gameplay change intended.
import * as THREE from 'three';
import { mat, box, signTexture } from '../buildings/BuildingMaterials';
import { CONFIG } from '../game/config';

export function buildFence(scene: THREE.Scene): void {
      // ── town fence: posts and rails ringing the whole town, with wooden
      // gate arches where the main road leaves town east and west ──
      const postMat = mat(0x8a6a3f, { roughness: 0.9 });
      const railMat = mat(0x9c7a4a, { roughness: 0.9 });
      const f = CONFIG.fence;
      const gateHalf = 4.2;   // the main road passes through here
      const addPost = (x: number, z: number) => {
        const post = box(0.28, 1.5, 0.28, postMat);
        post.position.set(x, 0.75, z);
        post.castShadow = true;
        scene.add(post);
      };
      const addRail = (x1: number, z1: number, x2: number, z2: number, y: number) => {
        const len = Math.hypot(x2 - x1, z2 - z1);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.1), railMat);
        rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
        rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
        rail.castShadow = true;
        scene.add(rail);
      };
      // north + south sides
      for (const z of [f.minZ, f.maxZ]) {
        for (let x = f.minX; x <= f.maxX; x += 5) addPost(x, z);
        for (const y of [0.55, 1.1]) addRail(f.minX, z, f.maxX, z, y);
      }
      // east + west sides with a gate gap on the main road (z ≈ 0)
      for (const x of [f.minX, f.maxX]) {
        for (let z = f.minZ; z <= f.maxZ; z += 5) {
          if (Math.abs(z) < gateHalf) continue;   // leave the gate open
          addPost(x, z);
        }
        for (const y of [0.55, 1.1]) {
          addRail(x, f.minZ, x, -gateHalf, y);
          addRail(x, gateHalf, x, f.maxZ, y);
        }
        // gate arch over the road
        const pillarA = box(0.5, 4.2, 0.5, postMat);
        pillarA.position.set(x, 2.1, -gateHalf - 0.4);
        const pillarB = box(0.5, 4.2, 0.5, postMat);
        pillarB.position.set(x, 2.1, gateHalf + 0.4);
        const beam = box(0.7, 0.6, gateHalf * 2 + 1.2, railMat);
        beam.position.set(x, 4.3, 0);
        const welcome = new THREE.Mesh(
          new THREE.PlaneGeometry(6.4, 0.55),
          new THREE.MeshBasicMaterial({ map: signTexture('WELCOME TO BLOCKVILLE', '#7a5230'), transparent: false }),
        );
        welcome.position.set(x > 0 ? x - 0.4 : x + 0.4, 4.3, 0);
        welcome.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
        scene.add(pillarA, pillarB, beam, welcome);
      }
}
