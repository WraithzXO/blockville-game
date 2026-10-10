// Extracted verbatim from Engine.buildWorld (Checkpoint 2, world/environment
// extraction). Behaviour-preserving: no visual or gameplay change intended.
import * as THREE from 'three';
import { mat } from '../buildings/BuildingMaterials';

/** The town lawn texture, shared so the surrounding hills can use the very same grass. */
export let townGrassTexture: THREE.CanvasTexture | null = null;
/** World units covered by one repeat of the lawn texture (town ground: 306/19 x 352/21). */
export const GRASS_TILE = { x: 306 / 19, z: 352 / 21 };

export function buildGround(scene: THREE.Scene): void {
      // ground with a subtle stylised grid
      const gc = document.createElement('canvas');
      gc.width = gc.height = 256;
      const g2 = gc.getContext('2d')!;
      // richer stylised turf: tonal patches, mown stripes, grass flecks, tiny
      // flowers and a few pebbles. Seeded so every client sees the same ground.
      gc.width = gc.height = 512;
      let gseed = 7;
      const gr = () => { gseed = (gseed * 16807) % 2147483647; return gseed / 2147483647; };
      g2.fillStyle = '#8fc978';
      g2.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 8; i++) { g2.fillStyle = i % 2 ? 'rgba(112,180,92,0.18)' : 'rgba(168,214,120,0.16)'; g2.fillRect(0, i * 64, 512, 32); }
      for (let i = 0; i < 26; i++) {
        g2.fillStyle = ['rgba(98,168,84,0.28)', 'rgba(176,214,118,0.26)', 'rgba(120,186,104,0.25)'][i % 3];
        const w = 40 + gr() * 80, h = 30 + gr() * 60, x = gr() * 512, y = gr() * 512;
        for (const [ox, oy] of [[0, 0], [-512, 0], [512, 0], [0, -512], [0, 512]]) g2.fillRect(Math.floor((x + ox) / 8) * 8, Math.floor((y + oy) / 8) * 8, Math.floor(w / 8) * 8, Math.floor(h / 8) * 8);
      }
      for (let i = 0; i < 9; i++) { g2.fillStyle = i % 3 ? 'rgba(196,170,112,0.22)' : 'rgba(86,150,76,0.3)'; const cx = Math.floor(gr() * 120) * 4, cy = Math.floor(gr() * 120) * 4; g2.fillRect(cx, cy, 20, 12); g2.fillRect(cx + 8, cy - 8, 12, 8); }
      for (let i = 0; i < 40; i++) { const cx = Math.floor(gr() * 126) * 4, cy = Math.floor(gr() * 126) * 4; g2.fillStyle = '#5fa04e'; g2.fillRect(cx, cy, 4, 4); g2.fillRect(cx + 4, cy + 4, 4, 4); g2.fillRect(cx - 4, cy + 4, 4, 4); }
      for (let i = 0; i < 420; i++) { g2.fillStyle = gr() > 0.5 ? '#6fae5c' : '#a7d985'; g2.fillRect(Math.floor(gr() * 128) * 4, Math.floor(gr() * 128) * 4, 4, 8); }
      for (let i = 0; i < 20; i++) { g2.fillStyle = ['#fff3a8', '#ffffff', '#f6a6c4', '#ffd36b'][i % 4]; const fx = Math.floor(gr() * 128) * 4, fy = Math.floor(gr() * 128) * 4; g2.fillRect(fx, fy, 4, 4); }
      for (let i = 0; i < 8; i++) { g2.fillStyle = '#b9b2a0'; g2.fillRect(Math.floor(gr() * 128) * 4, Math.floor(gr() * 128) * 4, 8, 4); }
      const gt = new THREE.CanvasTexture(gc);
      townGrassTexture = gt;
      gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
      gt.repeat.set(19, 21);
      gt.colorSpace = THREE.SRGBColorSpace;
      gt.magFilter = THREE.NearestFilter;
      // the town ground ends at the fence — beyond it a darker, muted plain
      // makes the world edge read as intentional rather than empty
      // (a window is cut out over the east wilderness, where the terrain dips down to the lake)
      const outerShape = new THREE.Shape();
      outerShape.moveTo(-700, -700); outerShape.lineTo(700, -700); outerShape.lineTo(700, 700); outerShape.lineTo(-700, 700); outerShape.closePath();
      const hole = new THREE.Path();
      hole.moveTo(138, -60); hole.lineTo(138, 180); hole.lineTo(440, 180); hole.lineTo(440, -60); hole.closePath();
      outerShape.holes.push(hole);
      const outer = new THREE.Mesh(
        new THREE.ShapeGeometry(outerShape),
        new THREE.MeshStandardMaterial({ color: 0x6f9a5e, roughness: 1, side: THREE.DoubleSide }),
      );
      outer.rotation.x = -Math.PI / 2;
      outer.position.set(0, -0.05, 70);
      // Far scenery should never receive the small shadow-map frustum. On a
      // huge plane that can produce a black horizon patch as the camera turns.
      outer.receiveShadow = false;
      scene.add(outer);
      // sized to cover the expanded plot grid: rows reach z=189 and the fence
      // ring sits at z=202, so the textured ground must reach past both
      const groundGeo = new THREE.PlaneGeometry(306, 352, 61, 70);
      {
        // broad soft light/dark and warm/cool drifts so big lawns stop tiling
        const pos = groundGeo.attributes.position, col: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i);
          const n = Math.sin(x * 0.09 + 1.3) * Math.cos(y * 0.07) * 0.5 + Math.sin(x * 0.21 + y * 0.17) * 0.5;
          const patch = Math.sin(x * 0.33 + 2.1) * Math.sin(y * 0.29 - 0.7) + Math.sin((x + y) * 0.13);
          const v = 0.93 + n * 0.1 + patch * 0.035;
          col.push(v + n * 0.03, v + 0.03, v - n * 0.05);
        }
        groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      }
      const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: gt, vertexColors: true }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, 0, 79);
      ground.receiveShadow = true;
      scene.add(ground);

      // ── welcoming spawn commons + readable pedestrian paths ───────────────
      // These are deliberately flat, decorative meshes: they add visual
      // hierarchy without introducing new collision bodies or changing plot
      // access. The store and main road now read as the town's front door.
      const plazaMat = mat(0xd9c7a2, { roughness: 1 });
      const plaza = new THREE.Mesh(new THREE.CircleGeometry(11, 12), plazaMat);
      plaza.rotation.x = -Math.PI / 2;
      plaza.scale.set(1.25, 0.78, 1);
      plaza.position.set(0, 0.035, -13.5);
      plaza.receiveShadow = true;
      scene.add(plaza);
      const spawnWalkMat = mat(0xc5b79d, { roughness: 1 });
      for (const path of [
        { w: 4.2, d: 12, x: 0, z: -6.5 },
        { w: 4.2, d: 9, x: 0, z: -21.5 },
        { w: 20, d: 2.8, x: 0, z: -13.5 },
      ]) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(path.w, path.d), spawnWalkMat);
        p.rotation.x = -Math.PI / 2;
        p.position.set(path.x, 0.045, path.z);
        p.receiveShadow = true;
        scene.add(p);
      }
      // Small square pavers give the central walk a hand-built pixel-town feel.
      const paverMat = mat(0xe9dcc1, { roughness: 1 });
      for (let x = -8; x <= 8; x += 4) {
        const paver = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.8), paverMat);
        paver.position.set(x, 0.09, -13.5);
        paver.receiveShadow = true;
        scene.add(paver);
      }
      // (spawn planters removed: they straddled the corners of the two plots flanking the plaza walk)

      // Mown-grass bands and stepping-stone accents break up the long grid
      // while keeping the open strips around plots visually navigable.
      const meadowMat = mat(0xa6d17f, { roughness: 1 });
      for (const z of [31, 63, 95, 127, 159]) {
        for (const x of [-76, 76]) {
          const meadow = new THREE.Mesh(new THREE.CircleGeometry(5.5, 8), meadowMat);
          meadow.rotation.x = -Math.PI / 2;
          meadow.scale.set(1.5, 0.6, 1);
          meadow.position.set(x, 0.028, z);
          meadow.receiveShadow = true;
          scene.add(meadow);
        }
      }
      // (grey stepping-stone slabs removed: they read as unexplained concrete blocks lying on the lawn)
}
