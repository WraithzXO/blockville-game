// Extra surface detail for the dirt trail to the lake and the beach sand. Own seeded stream, instanced meshes, and
// everything is placed on the rendered surface (meshH) and kept clear of the dock, the lake and the walking line.
// Purely visual: no collision, no gameplay.
import * as THREE from 'three';
import { DOCK, WATER_Y, lakeQ, meshH, mulberry32, trailZ, fbm } from './WorldTerrain';

const onDock = (x: number, z: number) => x >= DOCK.x0 - 1.5 && x <= DOCK.x1 + 1 && Math.abs(z - DOCK.z) <= DOCK.hw + 1.5;
const pathZ = (x: number) => trailZ(Math.min(x, 262)) + (x >= 236 ? 0.4 * Math.sin(x * 0.35) : 0);

export function buildTrailAndBeachDetail(scene: THREE.Scene): void {
  const r = mulberry32(31337);
  const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; z: number; y?: number; s: [number, number, number]; ry?: number; rx?: number; rz?: number }[], cast = false) => {
    if (!items.length) return;
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      e.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0); qt.setFromEuler(e);
      p.set(it.x, (it.y ?? meshH(it.x, it.z)) + 0, it.z); sc.set(...it.s);
      im.setMatrixAt(i, m4.compose(p, qt, sc));
    });
    im.castShadow = cast; im.receiveShadow = true; scene.add(im);
  };
  const flat = (c: number, o: Record<string, unknown> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true, ...o });
  const dry = (x: number, z: number) => meshH(x, z) >= WATER_Y + 0.35 && lakeQ(x, z) > 1.05 && !onDock(x, z);

  // ── dirt trail ───────────────────────────────────────────────────────────
  // 1. edge stones: low rounded rocks in loose clusters along both sides of the path
  const edge: { x: number; z: number; s: [number, number, number]; ry: number }[] = [];
  const grass: { x: number; z: number; s: [number, number, number]; ry: number }[] = [];
  const patches: { x: number; z: number; y: number; s: [number, number, number]; ry: number; rx: number }[] = [];
  for (let x = 168; x < 262; x += 0.9 + r() * 1.6) {
    const t = Math.min(1, (x - 168) / 40);
    const zc = pathZ(x), half = 2.5 + (fbm(x * 0.3, 1) - 0.5) * 0.8;
    for (const side of [-1, 1]) {
      if (r() < 0.55) {
        const z = zc + side * (half + 0.1 + r() * 0.9);
        if (dry(x, z) || x < 236) { const k = 0.35 + r() * 0.6; edge.push({ x, z, s: [k * 1.2, k * 0.7, k], ry: r() * 6 }); if (r() < 0.4) edge.push({ x: x + 0.3, z: z + side * 0.3, s: [k * 0.6, k * 0.5, k * 0.6], ry: r() * 6 }); }
      }
      if (r() < 0.8 * t) { const z = zc + side * (half - 0.4 + r() * 1.6); grass.push({ x, z, s: [0.7 + r() * 0.7, 0.7 + r() * 1.1, 0.7 + r() * 0.7], ry: r() * 6 }); }
    }
    // dark packed-earth and light dust patches on the tread so it never reads as one flat colour
    if (r() < 0.6) { const z = zc + (r() - 0.5) * half * 1.5; patches.push({ x, z, y: meshH(x, z) + 0.125, s: [0.8 + r() * 1.8, 0.8 + r() * 1.4, 1], ry: r() * 6, rx: -Math.PI / 2 }); }
  }
  const stoneGeo = new THREE.DodecahedronGeometry(0.5, 0);
  inst(stoneGeo, flat(0x8e887b), edge, true);
  inst(stoneGeo, flat(0xa39d90), edge.slice(0, edge.length >> 1).map((s) => ({ ...s, x: s.x + 0.2, s: [s.s[0] * 0.5, s.s[1] * 0.5, s.s[2] * 0.5] as [number, number, number] })), false);
  // grass tufts: two crossed blades (cones) per tuft
  const tuftG = new THREE.ConeGeometry(0.16, 0.7, 4);
  inst(tuftG, flat(0x5f9c4a), grass.map((g) => ({ ...g, y: meshH(g.x, g.z) + 0.3 })));
  inst(tuftG, flat(0x7bb35a), grass.map((g) => ({ ...g, x: g.x + 0.13, z: g.z + 0.1, y: meshH(g.x, g.z) + 0.25, s: [g.s[0] * 0.8, g.s[1] * 0.75, g.s[2] * 0.8] as [number, number, number] })));
  const patchG = new THREE.CircleGeometry(0.5, 9);
  const dark = flat(0x6f5230, { transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const dust = flat(0xc29d66, { transparent: true, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  inst(patchG, dark, patches.filter((_, i) => i % 2 === 0));
  inst(patchG, dust, patches.filter((_, i) => i % 2 === 1));
  // wheel-rut pebbles (small light stones inside the tread)
  const pebs: { x: number; z: number; s: [number, number, number]; ry: number }[] = [];
  for (let x = 175; x < 258; x += 0.6 + r() * 1.1) { const z = pathZ(x) + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 1.3); pebs.push({ x, z, s: [0.18 + r() * 0.2, 0.1 + r() * 0.1, 0.18 + r() * 0.2], ry: r() * 6 }); }
  inst(new THREE.DodecahedronGeometry(1, 0), flat(0xb5ad9b), pebs);

  // 2. waymarkers: wooden posts with a lantern
  const postMat = flat(0x6b4a2b), lampMat = new THREE.MeshBasicMaterial({ color: 0xffc04d });
  const postAt = (x: number, side: number, lamp: boolean) => {
    const z = pathZ(x) + side * 3.6, y = meshH(x, z);
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.7, 0.22), postMat); post.position.y = 0.85; post.castShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), postMat); cap.position.y = 1.72;
    g.add(post, cap);
    if (lamp) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.26), lampMat); l.position.y = 1.95; g.add(l); }
    g.position.set(x, y, z); scene.add(g);
  };
  [186, 206, 226, 246].forEach((x, i) => postAt(x, i % 2 ? 1 : -1, true));

  // ── beach sand ───────────────────────────────────────────────────────────
  const rock: { x: number; z: number; s: [number, number, number]; ry: number; rx: number }[] = [];
  const reeds: { x: number; z: number; s: [number, number, number]; ry: number }[] = [];
  const dune: { x: number; z: number; s: [number, number, number]; ry: number }[] = [];
  const logs: { x: number; z: number; s: [number, number, number]; ry: number; rz: number }[] = [];
  const stars: { x: number; z: number; s: [number, number, number]; ry: number; rx: number }[] = [];
  const ripples: { x: number; z: number; y: number; s: [number, number, number]; ry: number; rx: number }[] = [];
  const dkey = (x: number, z: number) => Math.hypot(x - DOCK.x0, z - DOCK.z) < 7;
  for (let i = 0; i < 1400 && (rock.length < 40 || reeds.length < 90 || dune.length < 140); i++) {
    const x = 238 + r() * 125, z = -46 + r() * 104;
    const q = lakeQ(x, z);
    if (onDock(x, z) || dkey(x, z) || Math.abs(z - pathZ(x)) < 2.4 && x < 262) continue;
    if (q > 1.03 && q < 1.12 && meshH(x, z) > WATER_Y + 0.2 && reeds.length < 90) { reeds.push({ x, z, s: [0.8 + r() * 0.6, 0.9 + r() * 1.2, 0.8 + r() * 0.6], ry: r() * 6 }); continue; }
    if (q > 1.12 && q < 1.5 && dry(x, z)) {
      const roll = r();
      if (roll < 0.12 && rock.length < 40) { const k = 0.4 + r() * 0.8; rock.push({ x, z, s: [k * 1.3, k * 0.8, k], ry: r() * 6, rx: r() * 0.4 }); if (r() < 0.6) rock.push({ x: x + 0.7, z: z + 0.4, s: [k * 0.6, k * 0.5, k * 0.55], ry: r() * 6, rx: r() * 0.4 }); }
      else if (roll < 0.5 && q > 1.28 && dune.length < 140) dune.push({ x, z, s: [0.8 + r() * 0.8, 0.8 + r() * 1.2, 0.8 + r() * 0.8], ry: r() * 6 });
      else if (roll < 0.56 && logs.length < 9) logs.push({ x, z, s: [1, 1, 0.8 + r() * 1.4], ry: r() * 6, rz: r() * 0.15 });
      else if (roll < 0.62 && stars.length < 10) stars.push({ x, z, s: [0.9, 0.9, 0.9], ry: r() * 6, rx: -Math.PI / 2 });
      else if (roll < 0.9 && ripples.length < 80) ripples.push({ x, z, y: meshH(x, z) + 0.11, s: [1.5 + r() * 2.5, 0.35 + r() * 0.25, 1], ry: r() * 6, rx: -Math.PI / 2 });
    }
  }
  inst(stoneGeo, flat(0x8a857a), rock.map((k) => ({ ...k, y: meshH(k.x, k.z) + k.s[1] * 0.25 })), true);
  // reeds: tall thin cones in bunches with brown cattail heads
  const reedG = new THREE.ConeGeometry(0.06, 1.6, 4);
  inst(reedG, flat(0x6f9b4e), reeds.map((k) => ({ ...k, y: meshH(k.x, k.z) + 0.75 })));
  inst(reedG, flat(0x8aae5c), reeds.map((k) => ({ ...k, x: k.x + 0.18, z: k.z - 0.12, y: meshH(k.x, k.z) + 0.6, s: [k.s[0], k.s[1] * 0.8, k.s[2]] as [number, number, number] })));
  inst(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 6), flat(0x5a3d22), reeds.filter((_, i) => i % 3 === 0).map((k) => ({ ...k, x: k.x + 0.04, y: meshH(k.x, k.z) + 1.35, s: [1, 1, 1] as [number, number, number] })));
  // dune grass up the back of the beach
  const duneG = new THREE.ConeGeometry(0.12, 0.8, 4);
  inst(duneG, flat(0x9bb25a), dune.map((k) => ({ ...k, y: meshH(k.x, k.z) + 0.35 })));
  inst(duneG, flat(0xb7c46f), dune.map((k) => ({ ...k, x: k.x + 0.15, z: k.z + 0.12, y: meshH(k.x, k.z) + 0.3, s: [k.s[0] * 0.8, k.s[1] * 0.8, k.s[2] * 0.8] as [number, number, number] })));
  // driftwood logs (pale, weathered) with a forked branch
  const logG = new THREE.CylinderGeometry(0.14, 0.17, 1, 7); logG.rotateX(Math.PI / 2);
  const wood = flat(0xb7a688);
  inst(logG, wood, logs.map((k) => ({ ...k, y: meshH(k.x, k.z) + 0.15 })), true);
  inst(logG, wood, logs.map((k) => ({ ...k, x: k.x + Math.sin(k.ry) * 0.5, z: k.z + Math.cos(k.ry) * 0.5, ry: k.ry + 0.9, s: [0.55, 0.55, 0.45] as [number, number, number], y: meshH(k.x, k.z) + 0.3 })));
  // starfish (flat 5-point pads) and sand ripple streaks
  const star = new THREE.CircleGeometry(0.2, 5);
  inst(star, flat(0xe0794a, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), stars.map((k) => ({ ...k, y: meshH(k.x, k.z) + 0.115 })));
  const rippleG = new THREE.CircleGeometry(0.5, 10);
  inst(rippleG, flat(0xcdb98a, { transparent: true, opacity: 0.45, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), ripples);
  // stepping slabs on the sand footpath from the trail end to the dock root
  const slabs: { x: number; z: number; s: [number, number, number]; ry: number }[] = [];
  for (let x = 258; x < DOCK.x0 - 2; x += 1.9 + r() * 0.5) { const z = pathZ(x) + (r() - 0.5) * 0.7; slabs.push({ x, z, s: [0.95 + r() * 0.3, 0.1, 0.8 + r() * 0.3], ry: r() * 3 }); }
  inst(new THREE.BoxGeometry(1, 1, 1), flat(0x9a9488), slabs.map((k) => ({ ...k, y: meshH(k.x, k.z) + 0.1 })), false);
}
