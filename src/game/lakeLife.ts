// Lake ambience: a few shoals of low-poly fish just under the rippled surface, the sun glint,
// and the sway/bob of the reeds, lily pads, seagrass and the moored rowboat.
// Owned and driven by AmbientLife.update — there is no second update loop. Two InstancedMeshes
// (fish, glint), seeded placement, zero per-frame allocations.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAKE, lakeQ, lakeRipple, mulberry32 } from '../world/WorldTerrain';
import type { LakeSway } from '../world/WorldLake';

const FISH_PER_SHOAL = [9, 8, 6, 1, 1, 1];            // three shoals + three solo koi = 26 fish
const SHOALS = [
  { rr: 0.52, w: 0.045, a0: 0.4, dir: 1 },            // deep water, slow lap
  { rr: 0.66, w: -0.06, a0: 2.6, dir: -1 },           // follows the middle shallows the other way
  { rr: 0.72, w: 0.035, a0: 4.4, dir: 1 },            // hugs the shallows
  { rr: 0.45, w: 0.025, a0: 1.2, dir: 1 },
  { rr: 0.6, w: -0.03, a0: 3.5, dir: 1 },
  { rr: 0.68, w: 0.028, a0: 5.4, dir: 1 },
];
const FLEE_R = 7;                                      // metres: walking this close scatters the shoal
const MAX_Q = 0.86;                                    // fish never swim past this normalised radius
const SILVER = [0xcfe3e6, 0xa8cfd2, 0xb9d6c9], GOLD = [0xf2c04a, 0xe9a23a], KOI = [0xf28a3c, 0xf4efe6, 0xe8563a];

interface Rig { x: number; z: number; h: number; spd: number; ph: number; shoal: number; ox: number; oz: number; flee: number; fx: number; fz: number; sc: number; depth: number; }

function fishGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, tone: number, sy = 1) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    const pos = n.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const v = tone * (pos.getY(i) < 0 ? 1 : 0.8 * sy);   // pale belly, darker back
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    n.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(n);
  };
  const body = new THREE.SphereGeometry(0.5, 6, 4); body.scale(1, 0.42, 0.3); put(body, 1);
  const tail = new THREE.ConeGeometry(0.2, 0.4, 4); tail.scale(1, 1, 0.2); tail.rotateZ(Math.PI / 2); tail.translate(-0.68, 0, 0); put(tail, 0.78);
  const dors = new THREE.ConeGeometry(0.1, 0.26, 3); dors.scale(1, 1, 0.25); dors.rotateZ(-0.5); dors.translate(-0.02, 0.2, 0); put(dors, 0.7);
  return mergeGeometries(parts, false)!;
}

export class LakeLife {
  private fish: THREE.InstancedMesh;
  private glint: THREE.InstancedMesh;
  private rigs: Rig[] = [];
  private dummy = new THREE.Object3D();
  private glintPts: { x: number; z: number; s: number; ph: number }[] = [];
  private sway: LakeSway[] | undefined;
  /** worst case over the whole run: fish top relative to the local rippled surface (must stay < 0) */
  private maxTopRel = -Infinity;

  constructor(private scene: THREE.Scene) {
    const rnd = mulberry32(9137);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, emissive: 0x2a3d46, emissiveIntensity: 0.55 });
    const total = FISH_PER_SHOAL.reduce((a, b) => a + b, 0);
    this.fish = new THREE.InstancedMesh(fishGeometry(), mat, total);
    this.fish.frustumCulled = false;
    this.fish.castShadow = false;
    const c = new THREE.Color();
    let id = 0;
    FISH_PER_SHOAL.forEach((n, s) => {
      for (let i = 0; i < n; i++, id++) {
        const koi = s >= 3, pal = koi ? KOI : s === 2 ? GOLD : SILVER;
        const a = rnd() * Math.PI * 2, r = koi ? 0 : 0.6 + rnd() * 2.6;
        const sc = koi ? 1.5 + rnd() * 0.3 : 0.75 + rnd() * 0.35;
        const ctr = this.center(s, 0);
        this.rigs.push({
          x: ctr[0] + Math.cos(a) * r, z: ctr[1] + Math.sin(a) * r, h: rnd() * Math.PI * 2,
          spd: koi ? 0.6 + rnd() * 0.3 : 1.0 + rnd() * 0.7, ph: rnd() * 6.28, shoal: s,
          ox: Math.cos(a) * r, oz: Math.sin(a) * r, flee: 0, fx: 0, fz: 0, sc, depth: 0.05 + 0.34 * sc,
        });
        c.setHex(pal[Math.floor(rnd() * pal.length)]);
        this.fish.setColorAt(id, c);
      }
    });
    this.fish.instanceColor!.needsUpdate = true;
    scene.add(this.fish);

    // sun glint: twinkling diamonds in a band toward the sun (sun sits west-south-west of the town)
    const dx = -78, dz = 34, dl = Math.hypot(dx, dz), ux = dx / dl, uz = dz / dl;
    for (let i = 0; i < 60 && this.glintPts.length < 22; i++) {
      const s = -30 + rnd() * 60, lat = (rnd() - 0.5) * 12;
      const x = LAKE.x + ux * s - uz * lat, z = LAKE.z + uz * s + ux * lat;
      if (lakeQ(x, z) > 0.9) continue;
      this.glintPts.push({ x, z, s: 0.5 + rnd() * 0.7, ph: rnd() * 6.28 });
    }
    const gg = new THREE.CircleGeometry(0.5, 4); gg.rotateX(-Math.PI / 2); gg.scale(1, 1, 0.32);   // a thin diamond glint
    this.glint = new THREE.InstancedMesh(gg, new THREE.MeshBasicMaterial({
      color: 0xfff1c4, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    }), this.glintPts.length);
    this.glint.frustumCulled = false;
    this.glint.renderOrder = 3;
    scene.add(this.glint);
  }

  private center(s: number, t: number): [number, number] {
    const sh = SHOALS[s], a = sh.a0 + t * sh.w;
    let x = LAKE.x + Math.cos(a) * LAKE.a * sh.rr, z = LAKE.z + Math.sin(a) * LAKE.b * sh.rr;
    for (let k = 0; k < 4 && lakeQ(x, z) > 0.8; k++) { x = LAKE.x + (x - LAKE.x) * 0.88; z = LAKE.z + (z - LAKE.z) * 0.88; }
    return [x, z];
  }

  /** Scatter every fish within `r` of (x, z) — called for casts, and used for walkers on the dock. */
  scatter(x: number, z: number, r: number) {
    for (const f of this.rigs) {
      if (Math.hypot(f.x - x, f.z - z) < r) { f.flee = 2.2 + Math.random() * 0.8; f.fx = x; f.fz = z; }
    }
  }

  stats() {
    return { fish: this.rigs.length, instances: this.fish.count, maxTopRelToSurface: +this.maxTopRel.toFixed(3), glints: this.glintPts.length, sway: this.sway?.length ?? 0 };
  }

  update(dt: number, player: { x: number; z: number }) {
    // far from the lake: nothing is on screen, spend nothing
    if (Math.abs(player.x - LAKE.x) > 170 || Math.abs(player.z - LAKE.z) > 120) return;
    const t = performance.now() * 0.001;           // same clock as the water mesh ripple
    const step = Math.min(dt, 0.05);
    const nearWater = lakeQ(player.x, player.z) < 1.5;

    for (let i = 0; i < this.rigs.length; i++) {
      const f = this.rigs[i];
      if (nearWater) {
        const d = Math.hypot(f.x - player.x, f.z - player.z);
        if (d < FLEE_R && f.flee <= 0.4) { f.flee = 2.0; f.fx = player.x; f.fz = player.z; }
      }
      const ctr = this.center(f.shoal, t);
      let want: number, spd = f.spd * (1 + 0.25 * Math.sin(t * 1.3 + f.ph)), turn = 1.8;
      if (f.flee > 0) {
        f.flee -= step;
        want = Math.atan2(f.z - f.fz, f.x - f.fx);   // directly away from the disturbance
        spd *= 3.4; turn = 6;
      } else {
        const tx = ctr[0] + f.ox, tz = ctr[1] + f.oz;
        const dd = Math.hypot(tx - f.x, tz - f.z);
        want = dd > 0.9 ? Math.atan2(tz - f.z, tx - f.x) : f.h + 0.6 * Math.sin(t * 0.7 + f.ph);
        if (dd > 6) spd *= 1.6;                      // regroup briskly after a scatter
      }
      if (lakeQ(f.x, f.z) > MAX_Q - 0.04) want = Math.atan2(LAKE.z - f.z, LAKE.x - f.x);   // turn back from the shallows edge
      let dh = want - f.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const mx = turn * step;
      f.h += Math.max(-mx, Math.min(mx, dh));       // soft turn, never an instant flip
      const nx = f.x + Math.cos(f.h) * spd * step, nz = f.z + Math.sin(f.h) * spd * step;
      if (lakeQ(nx, nz) < MAX_Q) { f.x = nx; f.z = nz; }
      else f.h = Math.atan2(LAKE.z - f.z, LAKE.x - f.x);

      const surf = lakeRipple(f.x, f.z, t);
      const y = surf - f.depth + 0.015 * Math.sin(t * 2 + f.ph);
      const topRel = y + 0.34 * f.sc - surf;
      if (topRel > this.maxTopRel) this.maxTopRel = topRel;
      const wob = Math.sin(t * (4.5 + spd * 2) + f.ph) * 0.2;   // tail-beat sway, faster when fleeing
      const d = this.dummy;
      d.position.set(f.x, y, f.z);
      d.rotation.set(Math.sin(t * 1.7 + f.ph) * 0.05, -f.h + wob, 0, 'YXZ');
      d.scale.setScalar(f.sc);
      d.updateMatrix();
      this.fish.setMatrixAt(i, d.matrix);
    }
    this.fish.instanceMatrix.needsUpdate = true;

    // glint: each diamond twinkles on its own beat
    for (let i = 0; i < this.glintPts.length; i++) {
      const g = this.glintPts[i];
      const k = Math.max(0, Math.sin(t * (1.1 + (i % 3) * 0.4) + g.ph));
      const d = this.dummy;
      d.position.set(g.x, lakeRipple(g.x, g.z, t) + 0.1, g.z);
      d.rotation.set(0, 0.5 + i, 0);
      d.scale.set(g.s * 0.9 * k * k * k, 1, g.s * 0.9 * k * k * k);
      d.updateMatrix();
      this.glint.setMatrixAt(i, d.matrix);
    }
    this.glint.instanceMatrix.needsUpdate = true;

    // reeds, pads, seagrass and the rowboat ride the same ripple
    if (!this.sway) this.sway = this.scene.userData.lakeSway as LakeSway[] | undefined;
    if (this.sway) for (const s of this.sway) {
      const o = s.obj, p = s.phase;
      if (s.kind === 'reed') { o.rotation.z = Math.sin(t * 1.1 + p) * 0.04; o.rotation.x = Math.cos(t * 0.9 + p) * 0.03; }
      else if (s.kind === 'weed') { o.rotation.z = Math.sin(t * 0.9 + p) * 0.1; o.rotation.x = Math.cos(t * 0.8 + p) * 0.08; }
      else if (s.kind === 'pad') { o.position.y = lakeRipple(o.position.x, o.position.z, t) + 0.03; o.rotation.y = Math.sin(t * 0.3 + p) * 0.08; }
      else { o.position.y = lakeRipple(o.position.x, o.position.z, t) - 0.04; o.rotation.set(Math.sin(t * 0.9 + 1) * 0.02, s.baseRot + Math.sin(t * 0.5) * 0.02, Math.sin(t * 1.2) * 0.03); }
    }
  }

  dispose() {
    this.scene.remove(this.fish, this.glint);
    this.fish.geometry.dispose(); this.glint.geometry.dispose();
  }
}
