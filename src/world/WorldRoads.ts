// Extracted verbatim from Engine.buildWorld (Checkpoint 2, world/environment
// extraction). Behaviour-preserving: no visual or gameplay change intended.
import * as THREE from 'three';
import { mat, box } from '../buildings/BuildingMaterials';
import { benchSeat, civicLamp } from '../buildings/BuildingParts';
import { SOUTH_ROADS } from '../game/config';

export function buildRoads(scene: THREE.Scene): void {
      // roads: main E-W + spur to the store + Wave-1 cross streets running south
      const roadMat = mat(0x565b63, { roughness: 1 });
      // Flat layers sit only centimetres apart: polygon offset stops grass and
      // sidewalks z-fighting through the asphalt at distance.
      const layer = <T extends THREE.Material>(m: T, n: number): T => { m.polygonOffset = true; m.polygonOffsetFactor = -n; m.polygonOffsetUnits = -n * 2; return m; };
      layer(roadMat, 1);
      const gapRuns = (half: number, gaps: number[]): Array<[number, number]> => {
        const out: Array<[number, number]> = []; let a = -half;
        for (const g of [...gaps].sort((p, q) => p - q)) { out.push([a, g - 3.4]); a = g + 3.4; }
        out.push([a, half]); return out;
      };
      // the E-W streets south of the main road, one every two plot rows
      const southRoads = SOUTH_ROADS;
      for (const r of [
        { w: 270, d: 6, x: 0, z: 0 },
        { w: 6, d: 34, x: 0, z: -17 },
        { w: 270, d: 6, x: 0, z: 18 },
        { w: 6, d: 12, x: -34, z: 9 },
        { w: 6, d: 12, x: 34, z: 9 },
        { w: 6, d: 12, x: 0, z: 9 },
        ...southRoads.map((z) => ({ w: 270, d: 6, x: 0, z })),
      ]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(r.x, 0.02, r.z);
        road.receiveShadow = true;
        scene.add(road);
      }
      // light sidewalks hugging the main streets
      const walkMat = layer(mat(0xcfc8b8, { roughness: 1 }), 2);
      const walkDefs: Array<{ d: number; z: number; gaps: number[] }> = [
        { d: 2, z: -4.2, gaps: [0] }, { d: 2, z: 4.2, gaps: [-34, 0, 34] },
        { d: 2, z: 13.8, gaps: [-34, 0, 34] }, { d: 2, z: 22.2, gaps: [] },
        ...southRoads.flatMap((z) => [
          { d: 1.4, z: z - 3.7, gaps: [] as number[] }, { d: 1.4, z: z + 3.7, gaps: [] as number[] },
        ]),
      ];
      for (const w of walkDefs) {
        for (const [a, b] of gapRuns(135, w.gaps)) {
          const walk = new THREE.Mesh(new THREE.PlaneGeometry(b - a, w.d), walkMat);
          walk.rotation.x = -Math.PI / 2;
          walk.position.set((a + b) / 2, 0.03, w.z);
          walk.receiveShadow = true;
          scene.add(walk);
        }
      }
      // Street furniture: lamps staggered along the paved edges of the two main
      // streets (clear of the plaza), plus a few benches. Sparse and regular so
      // it guides the eye along the road without cluttering plots.
      {
        const street = new THREE.Group();
        for (let x = -80; x <= 80; x += 20) {
          if (Math.abs(x) < 12) continue;
          civicLamp(street, x, 4.2, 2.6);
          civicLamp(street, x, 13.8, 2.6);
          const xo = x + 10;
          if (Math.abs(xo) >= 12 && xo <= 85) { civicLamp(street, xo, -4.2, 2.6); civicLamp(street, xo, 22.2, 2.6); }
        }
        // benches on the sidewalk, clear of the cross streets (x = +/-34) and of the lamp posts (multiples of 20)
        for (const x of [-46, 46]) benchSeat(street, x, 4.9);
        for (const x of [-50, 50]) benchSeat(street, x, 13.1);
        // expanded east/west blocks: lamps on the plot-gap lines so none stands in front of an entrance
        for (const sx of [-1, 1]) for (const ax of [97.5, 112.5, 127.5]) {
          civicLamp(street, sx * ax, 4.2, 2.6); civicLamp(street, sx * ax, 13.8, 2.6);
        }
        scene.add(street);
      }
      // Dashed center lines on every east-west road and the two cross streets.
      // They sit just above the road surface, follow the existing grid, and stay
      // clear of plot footprints at the road edges.
      const markingMat = layer(mat(0xf5edc9, { roughness: 1 }), 3);
      for (const z of [0, 18, ...southRoads]) {
        for (let x = -131; x <= 131; x += 6) {
          if ([-34, 0, 34].some((c) => Math.abs(x - c) < 5)) continue; // keep intersections clear
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.28), markingMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(x, 0.045, z);
          scene.add(dash);
        }
      }
      // Solid road-edge lines (broken at junctions) and a few manhole covers:
      // restrained detail that makes the asphalt read as a real street.
      {
        const edgeDefs: Array<{ z: number; gaps: number[] }> = [
          { z: -2.55, gaps: [0] }, { z: 2.55, gaps: [-34, 0, 34] },
          { z: 15.45, gaps: [-34, 0, 34] }, { z: 20.55, gaps: [] },
          ...southRoads.flatMap((z) => [{ z: z - 2.55, gaps: [] as number[] }, { z: z + 2.55, gaps: [] as number[] }]),
        ];
        for (const e of edgeDefs) for (const [a, b] of gapRuns(88, e.gaps)) {
          const ln = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 0.14), markingMat);
          ln.rotation.x = -Math.PI / 2;
          ln.position.set((a + b) / 2, 0.044, e.z);
          scene.add(ln);
        }
        const holeMat = layer(mat(0x3a3e44, { roughness: 1 }), 4);
        for (const [mx, mz] of [[-22, 1], [26, -1], [-50, 19], [52, 17], [-14, 35], [40, 70]]) {
          const hole = new THREE.Mesh(new THREE.CircleGeometry(0.48, 10), holeMat);
          hole.rotation.x = -Math.PI / 2;
          hole.position.set(mx, 0.05, mz);
          scene.add(hole);
        }
      }
      for (const x of [-34, 0, 34]) {
        for (const z of x === 0 ? [-30, -24, -18, -12, 9] : [9]) {
          const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 2.4), markingMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(x, 0.045, z);
          scene.add(dash);
        }
      }

      // Raised curbs and compact crosswalks make the existing road grid read as
      // streets without changing collision or plot access.
      const curbMat = layer(mat(0xb8b2a5, { roughness: 1 }), 2);
      for (const z of [0, 18, ...southRoads]) {
        for (const side of [-1, 1]) {
          const inner = (z === 0 && side === 1) || (z === 18 && side === -1);
          const gaps = inner ? [-34, 0, 34] : z === 0 ? [0] : [];
          for (const [a, b] of gapRuns(135, gaps)) {
            const curb = box(b - a, 0.12, 0.22, curbMat);
            curb.position.set((a + b) / 2, 0.10, z + side * 3.12);
            scene.add(curb);
          }
        }
      }
      for (const x of [-34, 0, 34]) {
        for (const side of [-1, 1]) {
          const curb = box(0.22, 0.12, 11.2, curbMat);
          curb.position.set(x + side * 3.12, 0.10, 9);
          scene.add(curb);
        }
      }
      const crosswalkMat = layer(mat(0xf1e4bd, { roughness: 1 }), 3);
      for (const x of [-34, 0, 34]) {
        for (let i = -2; i <= 2; i++) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 5.1), crosswalkMat);
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(x + i * 1.0, 0.052, 0);
          scene.add(stripe);
        }
      }
      // crosswalks only exist where a street actually crosses (the x=0 spur
      // meets the second main road; the three crossings sit on the main road)
      for (const z of [18]) {
        for (let i = -2; i <= 2; i++) {
          const stripe = new THREE.Mesh(new THREE.PlaneGeometry(5.1, 0.62), crosswalkMat);
          stripe.rotation.x = -Math.PI / 2;
          stripe.position.set(0, 0.052, z + i * 1.0);
          scene.add(stripe);
        }
      }
}
