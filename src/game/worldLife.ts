// ── Blockville town life: lightweight ambient effects ──────────────────────
// Everything here is a few simple meshes with transforms + opacity — no
// particle systems, no physics, no post-processing. Small counts, pooled,
// cleaned up after use.
import * as THREE from 'three';


const GREETINGS = [
  'Hey!', "What's up?", 'Nice hat.', 'You building that?',
  "Haven't seen you around here before.", 'You live here?',
  "Blockville's looking good today.", "Nice place you've got.",
  'Where are you headed?', 'Hey, Blockville!',
  'I forgot why I came here.', 'Do you know where the store is?',
  'I swear this town wasn’t this big yesterday.', 'Nice weather.',
];

export const pickGreeting = () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

export interface AmbientRefs {
  fountainPos: { x: number; z: number };
  chimneyPos: { x: number; y: number; z: number };
  flowerGroups: THREE.Group[];
  treeLeaves: THREE.Object3D[];
  perchSpots: THREE.Vector3[];
}

interface Fx {
  obj: THREE.Object3D;
  t: number;
  life: number;
  kind: 'puff' | 'leaf' | 'sparkle' | 'ring';
}

interface Bird {
  group: THREE.Group;
  vel: THREE.Vector3;
  phase: number;
  perch?: THREE.Vector3;   // assigned when this bird is the one that lands
  landing?: boolean;
  landedAt?: number;
  landingLeft?: number;
  returning?: boolean;
}

interface Butterfly {
  group: THREE.Group;
  anchor: THREE.Vector3;
  phase: number;
  wl: THREE.Mesh;
  wr: THREE.Mesh;
}

export class AmbientLife {
  private scene: THREE.Scene;
  private refs: AmbientRefs;
  private fx: Fx[] = [];
  private birds: Bird[] = [];
  private butterflies: Butterfly[] = [];
  private nextBirdAt = 6;
  private nextLeafAt = 4;
  private nextSmokeAt = 2;
  private nextMomentAt = 18;
  private nextDustAt = 0.5;

  // shared materials / geometries — created once, reused forever
  // Keep the small roadside bird readable when it crosses shadowed street
  // areas; the old material could collapse into a black silhouette.
  private birdMat = new THREE.MeshStandardMaterial({
    color: 0x55758a,
    emissive: 0x182a36,
    emissiveIntensity: 0.32,
    roughness: 1,
  });
  private birdAccentMat = new THREE.MeshStandardMaterial({
    color: 0xe5b04b,
    emissive: 0x5b3510,
    emissiveIntensity: 0.18,
    roughness: 1,
  });
  private wingGeo = new THREE.BoxGeometry(0.5, 0.05, 0.22);
  private bodyGeo = new THREE.BoxGeometry(0.28, 0.22, 0.5);
  private puffGeo = new THREE.SphereGeometry(0.32, 6, 5);
  private smokeMat = new THREE.MeshStandardMaterial({
    color: 0xe8e4dc, transparent: true, opacity: 0.4, depthWrite: false,
  });
  private dustMat = new THREE.MeshStandardMaterial({
    color: 0xcfc4a8, transparent: true, opacity: 0.35, depthWrite: false,
  });
  private leafGeo = new THREE.PlaneGeometry(0.42, 0.42);
  private leafMats: THREE.MeshBasicMaterial[] = [];
  private ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 20);
  private ringMat = new THREE.MeshBasicMaterial({
    color: 0xbfe8ff, transparent: true, opacity: 0.5, depthWrite: false,
  });
  private jet: THREE.Mesh;         // fountain centre jet
  private waterRings: THREE.Mesh[] = [];

  private makeRoadBird() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 8, 6), this.birdMat);
    body.scale.set(1.25, 0.8, 1.45);
    body.position.y = 0.34;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), this.birdMat);
    head.position.set(0, 0.48, 0.27);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 5), this.birdAccentMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.47, 0.49);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x18252d });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMat);
    const eyeR = eyeL.clone();
    eyeL.position.set(-0.11, 0.54, 0.39);
    eyeR.position.set(0.11, 0.54, 0.39);
    const wingL = new THREE.Mesh(this.wingGeo, this.birdAccentMat);
    const wingR = wingL.clone();
    wingL.position.set(-0.25, 0.36, 0.02);
    wingR.position.set(0.25, 0.36, 0.02);
    wingL.rotation.z = -0.28;
    wingR.rotation.z = 0.28;
    g.add(body, head, beak, eyeL, eyeR, wingL, wingR);
    return g;
  }

  constructor(scene: THREE.Scene, refs: AmbientRefs) {
    this.scene = scene;
    this.refs = refs;
    for (const c of [0x6fae4e, 0xd9a441, 0xc96f3f]) {
      this.leafMats.push(new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      }));
    }

    // fountain water: a soft jet + looping ripple rings (self-contained)
    const jetMat = new THREE.MeshStandardMaterial({
      color: 0x9fd4f0, transparent: true, opacity: 0.55, roughness: 0.3,
    });
    this.jet = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 8), jetMat);
    this.jet.position.set(refs.fountainPos.x, 1.5, refs.fountainPos.z);
    scene.add(this.jet);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(refs.fountainPos.x, 0.78, refs.fountainPos.z);
      scene.add(ring);
      this.waterRings.push(ring);
    }

    // a few butterflies around the flowerbeds
    const anchors = refs.flowerGroups.slice(0, 6);
    for (let i = 0; i < Math.min(3, anchors.length); i++) {
      const a = anchors[i * 2].position;
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({
        color: [0xf2b134, 0xb455e0, 0xf26d7d][i % 3],
        side: THREE.DoubleSide, transparent: true, opacity: 0.95,
      });
      const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.22), mat);
      const wr = wl.clone();
      wl.position.x = -0.13;
      wr.position.x = 0.13;
      g.add(wl, wr);
      g.position.set(a.x + (Math.random() - 0.5) * 3, 1.2, a.z + (Math.random() - 0.5) * 2);
      scene.add(g);
      this.butterflies.push({
        group: g, anchor: g.position.clone(), phase: Math.random() * 7, wl, wr,
      });
    }
  }

  // occasional sparkle burst above the fountain (also used on interact)
  sparkle() {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.09),
        new THREE.MeshBasicMaterial({ color: 0xfff4cf, transparent: true, opacity: 0.95 }),
      );
      const a = Math.random() * Math.PI * 2;
      m.position.set(
        this.refs.fountainPos.x + Math.cos(a) * 0.5,
        1.6 + Math.random() * 0.6,
        this.refs.fountainPos.z + Math.sin(a) * 0.5,
      );
      m.userData.vel = new THREE.Vector3(Math.cos(a) * 1.2, 1.6, Math.sin(a) * 1.2);
      this.scene.add(m);
      this.fx.push({ obj: m, t: 0, life: 0.8, kind: 'sparkle' });
    }
  }

  update(dt: number, t: number, walkers: { x: number; z: number }[], playerPos: { x: number; z: number }) {
    // ── fountain water loop ──
    this.jet.scale.y = 1 + Math.sin(t * 3.1) * 0.14;
    this.waterRings.forEach((ring, i) => {
      const p = ((t + i * 0.75) % 2.2) / 2.2;
      ring.scale.setScalar(0.4 + p * 2.1);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - p);
    });

    // ── flowers & trees sway ──
    this.refs.flowerGroups.forEach((g, i) => {
      g.rotation.z = Math.sin(t * 1.2 + i * 1.7) * 0.05;
    });
    this.refs.treeLeaves.forEach((l, i) => {
      l.rotation.z = Math.sin(t * 0.7 + i * 2.1) * 0.035;
    });

    // ── store chimney smoke: a few looping puffs ──
    this.nextSmokeAt -= dt;
    const smokeAlive = this.fx.filter((f) => f.obj.userData.smoke).length;
    if (this.nextSmokeAt <= 0 && smokeAlive < 4) {
      this.nextSmokeAt = 2.4 + Math.random() * 1.4;
      const puff = new THREE.Mesh(this.puffGeo, this.smokeMat.clone());
      puff.position.set(
        this.refs.chimneyPos.x + (Math.random() - 0.5) * 0.2,
        this.refs.chimneyPos.y,
        this.refs.chimneyPos.z,
      );
      puff.userData.smoke = true;
      this.scene.add(puff);
      this.fx.push({ obj: puff, t: 0, life: 3.2, kind: 'puff' });
    }

    // ── dust puffs behind walkers ──
    this.nextDustAt -= dt;
    if (this.nextDustAt <= 0 && walkers.length && this.fx.filter((f) => f.kind === 'puff' && !f.obj.userData.smoke).length < 5) {
      this.nextDustAt = 0.5 + Math.random() * 0.5;
      const w = walkers[Math.floor(Math.random() * walkers.length)];
      const puff = new THREE.Mesh(this.puffGeo, this.dustMat.clone());
      puff.position.set(w.x, 0.25, w.z);
      puff.scale.setScalar(0.4);
      this.scene.add(puff);
      this.fx.push({ obj: puff, t: 0, life: 0.6, kind: 'puff' });
    }

    // ── drifting leaves ──
    this.nextLeafAt -= dt;
    const leavesAlive = this.fx.filter((f) => f.kind === 'leaf').length;
    if (this.nextLeafAt <= 0 && leavesAlive < 3) {
      this.nextLeafAt = 7 + Math.random() * 8;
      const leaf = new THREE.Mesh(this.leafGeo, this.leafMats[Math.floor(Math.random() * 3)]);
      leaf.position.set(-70 + Math.random() * 60, 0.6 + Math.random() * 0.8, -4 + Math.random() * 24);
      leaf.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      leaf.userData.drift = 1.6 + Math.random() * 1.2;
      this.scene.add(leaf);
      this.fx.push({ obj: leaf, t: 0, life: 9, kind: 'leaf' });
    }

    // ── birds: occasionally a small flock crosses the sky; sometimes one
    //    peels off to rest on a roof or treetop for a while ──
    this.nextBirdAt -= dt;
    if (this.nextBirdAt <= 0 && this.birds.length < 6) {
      this.nextBirdAt = 18 + Math.random() * 22;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y = 16 + Math.random() * 10;
      const z = -70 + Math.random() * 140;
      const willLand = this.refs.perchSpots.length > 0 && Math.random() < 0.45;
      const perch = willLand
        ? this.refs.perchSpots[Math.floor(Math.random() * this.refs.perchSpots.length)]
        : undefined;
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const body = new THREE.Mesh(this.bodyGeo, this.birdMat);
        const wl = new THREE.Mesh(this.wingGeo, this.birdMat);
        const wr = new THREE.Mesh(this.wingGeo, this.birdMat);
        wl.position.x = -0.32;
        wr.position.x = 0.32;
        g.add(body, wl, wr);
        g.position.set(-dir * 95, y + i * 0.7, z + i * 1.6);
        g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        this.scene.add(g);
        this.birds.push({
          group: g,
          vel: new THREE.Vector3(dir * (6 + Math.random() * 2), 0, 0),
          phase: Math.random() * 7,
          perch: i === 0 ? perch : undefined,
        });
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      b.phase += dt * 14;
      const flap = Math.sin(b.phase) * 0.7;
      const wl = b.group.children[1] as THREE.Mesh;
      const wr = b.group.children[2] as THREE.Mesh;
      wl.rotation.z = flap;
      wr.rotation.z = -flap;
      if (b.landing && b.perch) {
        // swoop down to the perch, sit a while, then fly off
        const to = new THREE.Vector3().subVectors(b.perch, b.group.position);
        const d = to.length();
        if (!b.returning) {
          if (d > 0.2) {
            to.normalize();
            b.group.position.addScaledVector(to, Math.min(d, 5 * dt));
          } else {
            b.landedAt = t;
            b.landingLeft = 5 + Math.random() * 4;
            b.returning = true;
          }
        } else {
          if (b.landingLeft !== undefined) {
            b.landingLeft -= dt;
            if (b.landingLeft <= 0) {
              b.landingLeft = undefined;
              b.perch = undefined;
              b.landing = false;
              b.vel.set((Math.random() < 0.5 ? -1 : 1) * 7, 0.6, 0);
            }
          }
        }
      } else {
        b.group.position.addScaledVector(b.vel, dt);
        b.group.position.y += Math.sin(b.phase * 0.4) * 0.15 * dt;
      }
      const far = Math.abs(b.group.position.x) > 100 || Math.abs(b.group.position.z) > 120;
      if (far && !b.landing) {
        this.scene.remove(b.group);
        this.birds.splice(i, 1);
      }
    }

    // ── butterflies ──
    for (const bf of this.butterflies) {
      bf.phase += dt;
      bf.group.position.x = bf.anchor.x + Math.sin(bf.phase * 0.55) * 1.6;
      bf.group.position.z = bf.anchor.z + Math.cos(bf.phase * 0.42) * 1.2;
      bf.group.position.y = 1.1 + Math.sin(bf.phase * 1.7) * 0.35;
      bf.group.rotation.y = bf.phase * 0.8;
      const flap = 0.55 + Math.sin(bf.phase * 18) * 0.5;
      bf.wl.rotation.z = flap;
      bf.wr.rotation.z = -flap;
    }

    // ── small random moments: roadside bird, fountain sparkle ──
    this.nextMomentAt -= dt;
    if (this.nextMomentAt <= 0) {
      this.nextMomentAt = 25 + Math.random() * 35;
      const roll = Math.random();
      if (roll < 0.4) {
        this.sparkle();
      } else if (roll < 0.7) {
        // a bird hops quickly across the main road at ground level
        const g = this.makeRoadBird();
        const z0 = Math.random() < 0.5 ? -6 : 6;
        // Keep the bird grounded without z-fighting against the road.
        g.position.set(-30 + Math.random() * 60, 0.025, z0);
        g.userData.hopper = z0 > 0 ? -1 : 1;
        this.scene.add(g);
        this.fx.push({ obj: g, t: 0, life: 3.4, kind: 'puff' });
      } else {
        this.sparkle();
      }
    }
    // ── fx lifetimes ──
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt;
      const p = f.t / f.life;
      if (f.obj.userData.smoke) {
        f.obj.position.y += dt * 0.75;
        f.obj.position.x += dt * 0.18;
        f.obj.scale.setScalar(0.5 + p * 0.9);
        ((f.obj as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.4 * (1 - p);
      } else if (f.kind === 'puff' && f.obj.userData.hopper !== undefined) {
        // roadside hopping bird
        f.obj.position.z += f.obj.userData.hopper * 2.2 * dt;
        f.obj.position.y = Math.abs(Math.sin(f.t * 9)) * 0.05;
        f.obj.rotation.y = f.obj.userData.hopper > 0 ? Math.PI : 0;
      } else if (f.kind === 'puff') {
        f.obj.scale.setScalar(0.4 + p * 0.6);
        ((f.obj as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.35 * (1 - p);
      } else if (f.kind === 'leaf') {
        f.obj.position.x += f.obj.userData.drift * dt;
        f.obj.position.z += Math.sin(f.t * 2.2) * dt * 1.4;
        f.obj.position.y = 0.6 + Math.abs(Math.sin(f.t * 2.8)) * 0.7;
        f.obj.rotation.x += dt * 2.4;
        f.obj.rotation.y += dt * 1.8;
        if (p > 0.85) ((f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - (p - 0.85) / 0.15);
      } else if (f.kind === 'sparkle') {
        const v = f.obj.userData.vel as THREE.Vector3;
        f.obj.position.addScaledVector(v, dt);
        v.y -= dt * 2.4;
        ((f.obj as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - p);
      }
      if (f.t >= f.life) {
        this.scene.remove(f.obj);
        this.fx.splice(i, 1);
      }
    }

    void playerPos; // reserved: future gusts that follow the resident
  }

  dispose() {
    for (const f of this.fx) this.scene.remove(f.obj);
    for (const b of this.birds) this.scene.remove(b.group);
    for (const bf of this.butterflies) this.scene.remove(bf.group);
    for (const r of this.waterRings) this.scene.remove(r);
    this.scene.remove(this.jet);
    this.fx = [];
    this.birds = [];
    this.butterflies = [];
  }
}
