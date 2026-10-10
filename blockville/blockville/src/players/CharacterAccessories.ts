import * as THREE from 'three';
import { mat, box } from '../buildings/BuildingMaterials';
import type { GlassesType, HatType } from '../game/config';

export function hatMesh(hat: HatType): THREE.Group | null {
  if (hat === 'none') return null;
  const g = new THREE.Group();
  if (hat === 'cap') {
    const dome = box(0.78, 0.26, 0.78, mat(0xd8452f));
    dome.position.y = 0.13;
    const brim = box(0.7, 0.07, 0.34, mat(0xb93a27));
    brim.position.set(0, 0.03, 0.5);
    g.add(dome, brim);
  } else if (hat === 'beanie') {
    const dome = box(0.8, 0.34, 0.8, mat(0x5fb8b0));
    dome.position.y = 0.15;
    const rim = box(0.84, 0.12, 0.84, mat(0x47908b));
    rim.position.y = 0.02;
    g.add(dome, rim);
  } else if (hat === 'crown') {
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.28, 8),
      mat(0xe0b64a, { metalness: 0.6, roughness: 0.3 }),
    );
    band.position.y = 0.14;
    g.add(band);
    for (let i = 0; i < 4; i++) {
      const spike = box(0.14, 0.24, 0.14, mat(0xe0b64a, { metalness: 0.6, roughness: 0.3 }));
      const a = (i / 4) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.32, 0.38, Math.sin(a) * 0.32);
      g.add(spike);
    }
  } else if (hat === 'tophat') {
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.06, 14),
      mat(0x1c1c22, { roughness: 0.5 }),
    );
    brim.position.y = 0.03;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.5, 14),
      mat(0x1c1c22, { roughness: 0.5 }),
    );
    tube.position.y = 0.3;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.1, 14),
      mat(0xe0b64a),
    );
    band.position.y = 0.14;
    g.add(brim, tube, band);
  } else if (hat === 'party') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 10), mat(0xe0579f));
    cone.position.y = 0.3;
    cone.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.1, 10), mat(0xf2d54e));
    stripe.position.y = 0.18;
    const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), mat(0xfff3e0));
    pompom.position.y = 0.58;
    g.add(cone, stripe, pompom);
  } else if (hat === 'headphones') {
    const band = box(0.86, 0.09, 0.12, mat(0x2f3542, { roughness: 0.5 }));
    band.position.y = 0.42;
    const armL = box(0.09, 0.3, 0.12, mat(0x2f3542, { roughness: 0.5 }));
    armL.position.set(-0.42, 0.28, 0);
    const armR = armL.clone();
    armR.position.x = 0.42;
    const cupL = box(0.16, 0.26, 0.24, mat(0xe0574f, { roughness: 0.5 }));
    cupL.position.set(-0.44, 0.1, 0);
    const cupR = cupL.clone();
    cupR.position.x = 0.44;
    g.add(band, armL, armR, cupL, cupR);
  } else if (hat === 'horns') {
    for (const sx of [-0.26, 0.26]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), mat(0xb03a48));
      horn.position.set(sx, 0.24, 0);
      horn.rotation.z = sx < 0 ? 0.35 : -0.35;
      horn.castShadow = true;
      g.add(horn);
    }
  } else if (hat === 'halo') {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.05, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd54e, emissiveIntensity: 0.9 }),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.5;
    g.add(halo);
  } else if (hat === 'cowboy') {
    // wide brim + creased dome + hat band
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16),
      mat(0x9a6a3a, { roughness: 0.85 }),
    );
    brim.position.y = 0.03;
    const dome = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.36, 0.3, 12),
      mat(0x9a6a3a, { roughness: 0.85 }),
    );
    dome.position.y = 0.2;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.37, 0.37, 0.09, 12),
      mat(0x6b4226),
    );
    band.position.y = 0.09;
    g.add(brim, dome, band);
  } else if (hat === 'wizard') {
    // tall slightly-bent cone with a star band
    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.6, 0.06, 14),
      mat(0x4f3f8f),
    );
    brim.position.y = 0.03;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.75, 12), mat(0x4f3f8f));
    cone.position.y = 0.44;
    cone.rotation.z = 0.16;
    cone.castShadow = true;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.33, 0.1, 12),
      mat(0xf2d54e),
    );
    band.position.y = 0.1;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), mat(0xf2d54e, { metalness: 0.4, roughness: 0.4 }));
    star.position.set(0.2, 0.34, 0.16);
    g.add(brim, cone, band, star);
  }
  return g;
}

// ── glasses: worn on the face, slightly proud of the head front ───────────
export function glassesMesh(glasses: GlassesType): THREE.Group | null {
  if (glasses === 'none') return null;
  const g = new THREE.Group();
  if (glasses === 'round') {
    const rim = new THREE.MeshStandardMaterial({ color: 0x3d4450, roughness: 0.4, metalness: 0.4 });
    for (const ex of [-0.17, 0.17]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 16), rim);
      lens.position.set(ex, 0.05, 0.4);
      const glass = new THREE.Mesh(
        new THREE.CircleGeometry(0.12, 12),
        new THREE.MeshStandardMaterial({ color: 0xbfe6f5, transparent: true, opacity: 0.45 }),
      );
      glass.position.set(ex, 0.05, 0.405);
      g.add(lens, glass);
    }
    const bridge = box(0.12, 0.03, 0.03, rim);
    bridge.position.set(0, 0.05, 0.41);
    g.add(bridge);
  } else if (glasses === 'shades') {
    const band = box(0.62, 0.16, 0.08, mat(0x16181d, { roughness: 0.25 }));
    band.position.set(0, 0.05, 0.38);
    const shine = box(0.2, 0.05, 0.02, mat(0x8fb8c8, { roughness: 0.15 }));
    shine.position.set(-0.1, 0.09, 0.43);
    g.add(band, shine);
  } else if (glasses === 'visor') {
    const shield = box(0.66, 0.2, 0.1, mat(0xe0b64a, { metalness: 0.7, roughness: 0.2 }));
    shield.position.set(0, 0.05, 0.38);
    const lens = box(0.5, 0.1, 0.02, mat(0x1a2b4a, { roughness: 0.1 }));
    lens.position.set(0, 0.04, 0.44);
    g.add(shield, lens);
  }
  return g;
}
