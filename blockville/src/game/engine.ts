import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  BUILDING_DEFS,
  CONFIG,
  PLOT_POSITIONS,
  STORE_POS,
  pickActivity,
  randInt,
  type BuildingType,
  type FaceType,
  type GlassesType,
  type HatType,
  type PlayerLook,
  type ShirtDesign,
} from './config';
import type { EngineApi, Plot } from './state';

// ── small helpers ──────────────────────────────────────────────────────────
const mat = (color: number | string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });

const UP = new THREE.Vector3(0, 1, 0);

const box = (w: number, h: number, d: number, m: THREE.Material) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

function signTexture(text: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 504, 120);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 64;
  do {
    g.font = `bold ${size}px system-ui, sans-serif`;
    size -= 4;
  } while (g.measureText(text).width > 470 && size > 20);
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sign(text: string, bg: string, w = 6, h = 1.5): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: signTexture(text, bg) }),
  );
  return m;
}

// ── shared detail pieces so buildings read as crafted, not generic ─────────
function windowBox(w = 0.9, h = 1.1): THREE.Group {
  const g = new THREE.Group();
  const frame = box(w + 0.16, h + 0.16, 0.12, mat(0xffffff));
  const glass = box(w, h, 0.14, mat(0x9fd8ef, { roughness: 0.35, metalness: 0.1 }));
  glass.position.z = 0.02;
  g.add(frame, glass);
  return g;
}

function frontPath(g: THREE.Group, z: number) {
  for (let i = 0; i < 3; i++) {
    const slab = box(1.5, 0.1, 0.9, mat(0xb9b2a4));
    slab.position.set(0, 0.05, z + 0.7 + i * 1.1);
    g.add(slab);
  }
}

function entranceSteps(g: THREE.Group, z: number, w = 3) {
  const s1 = box(w, 0.18, 1, mat(0xcfc8b8));
  s1.position.set(0, 0.09, z);
  const s2 = box(w - 0.6, 0.18, 0.8, mat(0xdad3c2));
  s2.position.set(0, 0.27, z - 0.25);
  g.add(s1, s2);
}

// ── faces: a canvas texture applied to the front of the head ───────────────
function faceTexture(face: FaceType, skin: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = skin;
  g.fillRect(0, 0, 128, 128);
  // soft cheek blush for a friendlier look
  g.fillStyle = 'rgba(226,120,110,0.28)';
  for (const cx of [26, 102]) {
    g.beginPath();
    g.arc(cx, 74, 10, 0, Math.PI * 2);
    g.fill();
  }
  // eyebrows
  g.strokeStyle = '#3a2e26';
  g.lineWidth = 5;
  g.lineCap = 'round';
  const browY = face === 'wow' ? 28 : 32;
  g.beginPath();
  g.moveTo(30, browY + (face === 'cool' ? -4 : 0));
  g.lineTo(50, browY - (face === 'cool' ? -4 : 3));
  g.moveTo(78, browY - 3);
  g.lineTo(98, browY);
  g.stroke();
  g.fillStyle = '#26221f';
  // eyes
  if (face === 'chill') {
    g.lineWidth = 7;
    g.strokeStyle = '#26221f';
    g.lineCap = 'round';
    for (const ex of [38, 90]) {
      g.beginPath();
      g.arc(ex, 52, 9, Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
    }
  } else {
    for (const ex of [40, 88]) {
      g.beginPath();
      if (face === 'wink' && ex === 88) {
        // closed winking eye
        g.lineWidth = 7;
        g.strokeStyle = '#26221f';
        g.moveTo(ex - 8, 52);
        g.lineTo(ex + 8, 48);
        g.stroke();
        continue;
      }
      g.arc(ex, 50, face === 'wow' ? 10 : 8, 0, Math.PI * 2);
      g.fill();
    }
  }
  // little nose
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.arc(64, 66, 4.5, 0, Math.PI * 2);
  g.fill();
  // mouth
  g.lineWidth = 7;
  g.strokeStyle = '#26221f';
  g.lineCap = 'round';
  if (face === 'grin') {
    g.fillStyle = '#7c3b34';
    g.beginPath();
    g.moveTo(44, 80);
    g.quadraticCurveTo(64, 106, 84, 80);
    g.closePath();
    g.fill();
    g.stroke();
  } else if (face === 'wow') {
    g.fillStyle = '#7c3b34';
    g.beginPath();
    g.ellipse(64, 88, 9, 12, 0, 0, Math.PI * 2);
    g.fill();
  } else if (face === 'chill') {
    g.beginPath();
    g.arc(64, 78, 14, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  } else if (face === 'cool') {
    // flat, confident smirk
    g.beginPath();
    g.moveTo(46, 80);
    g.quadraticCurveTo(70, 88, 86, 76);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(64, 74, 16, Math.PI * 0.18, Math.PI * 0.82);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function hatMesh(hat: HatType): THREE.Group | null {
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
  }
  return g;
}

// ── glasses: worn on the face, slightly proud of the head front ───────────
function glassesMesh(glasses: GlassesType): THREE.Group | null {
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

// ── shirt designs: a logo printed on the front of the torso ────────────────
function shirtTexture(design: ShirtDesign, colorHex: string): THREE.CanvasTexture | null {
  if (design === 'none') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = colorHex;
  g.fillRect(0, 0, 128, 128);
  g.textAlign = 'center';
  if (design === 'blockville') {
    // little brick stack + ticker
    g.fillStyle = '#c9552f';
    g.fillRect(44, 44, 40, 12);
    g.fillRect(36, 58, 56, 12);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(44, 47, 40, 3);
    g.fillRect(36, 61, 56, 3);
    g.fillStyle = '#ffffff';
    g.font = 'bold 17px sans-serif';
    g.fillText('$BLOCKVILLE', 64, 96);
  } else if (design === 'solana') {
    // three signature gradient bars
    const bars = ['#9945FF', '#14F195'];
    for (const [i, y] of [[0, 46], [1, 62], [0, 78]] as const) {
      const grad = g.createLinearGradient(34, 0, 94, 0);
      grad.addColorStop(0, bars[y === 62 ? 1 : 0]);
      grad.addColorStop(1, bars[y === 62 ? 0 : 1]);
      g.fillStyle = grad;
      const skew = i === 1 ? 0 : i === 0 ? -6 : 6;
      g.beginPath();
      g.moveTo(34 + skew, y);
      g.lineTo(94 + skew, y);
      g.lineTo(88 + skew, y + 9);
      g.lineTo(28 + skew, y + 9);
      g.closePath();
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px sans-serif';
    g.fillText('SOLANA', 64, 102);
  } else if (design === 'pumpfun') {
    g.fillStyle = '#14F195';
    g.beginPath();
    g.arc(64, 58, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0f2e1d';
    g.font = 'bold 26px sans-serif';
    g.fillText('P', 64, 67);
    g.fillStyle = '#ffffff';
    g.font = 'bold 17px sans-serif';
    g.fillText('PUMP.FUN', 64, 98);
  } else if (design === 'diamond') {
    g.fillStyle = '#5ad1e6';
    g.beginPath();
    g.moveTo(64, 34);
    g.lineTo(88, 56);
    g.lineTo(64, 92);
    g.lineTo(40, 56);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(40, 56);
    g.lineTo(88, 56);
    g.moveTo(64, 34);
    g.lineTo(56, 56);
    g.lineTo(64, 92);
    g.moveTo(64, 34);
    g.lineTo(72, 56);
    g.lineTo(64, 92);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px sans-serif';
    g.fillText('DIAMOND HANDS', 64, 108);
  } else if (design === 'bolt') {
    g.fillStyle = '#f2d54e';
    g.beginPath();
    g.moveTo(70, 32);
    g.lineTo(50, 66);
    g.lineTo(63, 66);
    g.lineTo(56, 96);
    g.lineTo(80, 58);
    g.lineTo(66, 58);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px sans-serif';
    g.fillText('DEGEN', 64, 112);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// ── building meshes (each type has a distinct identity) ───────────────────
function buildCasino(level: number): THREE.Group {
  const g = new THREE.Group();
  const s = 1 + (level - 1) * 0.18;
  const body = box(7 * s, 4.2 * s, 6 * s, mat(0x7a1f2b)); // deep casino red
  body.position.y = 2.1 * s;
  g.add(body);
  const roof = box(7.4 * s, 0.7 * s, 6.4 * s, mat(0xe0b64a, { metalness: 0.4, roughness: 0.35 }));
  roof.position.y = 4.55 * s;
  g.add(roof);
  // marquee
  const marq = sign('CASINO', '#c2185b', 5 * s, 1.2 * s);
  marq.position.set(0, 3.4 * s, 3.05 * s);
  g.add(marq);
  // doors
  const door = box(2.4, 2.4, 0.15, mat(0x111111, { metalness: 0.6, roughness: 0.2 }));
  door.position.set(0, 1.2, 3.02 * s);
  g.add(door);
  // gold-framed windows either side of the doors
  for (const wx of [-2.6, 2.6]) {
    const win = windowBox(1.1, 1.3);
    win.position.set(wx * s, 2.1 * s, 3.02 * s);
    g.add(win);
  }
  entranceSteps(g, 3.7, 3.4);
  // string of warm bulbs under the roof edge
  for (let i = 0; i < 7; i++) {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc94d, emissiveIntensity: 0.9 }),
    );
    bulb.position.set(-3.3 + i * 1.1, 3.9 * s, 3.35 * s);
    g.add(bulb);
  }
  // rooftop beacon
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffc400, emissiveIntensity: 1.4 }),
  );
  beacon.position.set(0, 5.4 * s, 0);
  g.add(beacon);
  if (level >= 2) {
    const wing = box(2.4 * s, 3 * s, 5 * s, mat(0x8d2533));
    wing.position.set(4.4 * s, 1.5 * s, 0);
    g.add(wing);
  }
  if (level >= 3) {
    const tower = box(1.6, 6.5, 1.6, mat(0xe0b64a, { metalness: 0.5, roughness: 0.3 }));
    tower.position.set(-3.4 * s, 3.2 * s, 0);
    g.add(tower);
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff176, emissive: 0xffd600, emissiveIntensity: 0.9 }),
    );
    tip.position.set(-3.4 * s, 7.2, 0);
    g.add(tip);
  }
  frontPath(g, 3.9);
  return g;
}

function buildMine(level: number): THREE.Group {
  const g = new THREE.Group();
  const mound = new THREE.Mesh(
    new THREE.ConeGeometry(5.2, 4.6, 7),
    mat(0x6d5a48),
  );
  mound.position.y = 2.3;
  mound.castShadow = true;
  g.add(mound);
  // entrance frame
  const frame = box(2.6, 2.6, 0.6, mat(0x4a3524));
  frame.position.set(0, 1.2, 4.1);
  g.add(frame);
  const hole = box(1.7, 1.9, 0.3, mat(0x141210));
  hole.position.set(0, 1.05, 4.25);
  g.add(hole);
  // rails out of the entrance
  const railL = box(2.2, 0.08, 2.4, mat(0x9a8f80, { metalness: 0.4 }));
  railL.position.set(0, 0.12, 5.3);
  g.add(railL);
  // minecart with a diamond
  const cart = box(1.2, 0.8, 0.9, mat(0x555f66, { metalness: 0.5, roughness: 0.4 }));
  cart.position.set(0, 0.55, 5.6);
  g.add(cart);
  const gem = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.42),
    new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.7 }),
  );
  gem.position.set(0, 1.15, 5.6);
  g.add(gem);
  // rocks scattered
  for (let i = 0; i < 4; i++) {
    const rock = box(0.8, 0.6, 0.8, mat(0x7b6a58));
    const a = (i / 4) * Math.PI * 2 + 0.4;
    rock.position.set(Math.cos(a) * 4.6, 0.3, Math.sin(a) * 4.6);
    rock.rotation.y = i;
    g.add(rock);
  }
  const board = sign('MINE', '#4a3524', 3.4, 1);
  board.position.set(0, 4.4, 3.4);
  g.add(board);
  // timber posts flanking the entrance, with a glowing lantern
  for (const px of [-2.1, 2.1]) {
    const post = box(0.28, 2.6, 0.28, mat(0x5c4430));
    post.position.set(px, 1.3, 4.6);
    g.add(post);
  }
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.45, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0xffb300, emissiveIntensity: 1.1 }),
  );
  lamp.position.set(-2.1, 2.9, 4.6);
  g.add(lamp);
  // tailings pile beside the mound
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.5, 6), mat(0x5d4d3e));
  tail.position.set(4.2, 0.75, 2.4);
  tail.castShadow = true;
  g.add(tail);
  if (level >= 2) {
    const derrick = box(0.5, 3, 0.5, mat(0x4a3524));
    derrick.position.set(-3.6, 1.5, 2.5);
    g.add(derrick);
  }
  if (level >= 3) {
    const gem2 = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7),
      new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.9 }),
    );
    gem2.position.set(3.6, 1.2, 3.2);
    g.add(gem2);
  }
  return g;
}

function buildShop(level: number): THREE.Group {
  const g = new THREE.Group();
  const s = 1 + (level - 1) * 0.15;
  const body = box(6.4 * s, 3.6 * s, 5.4 * s, mat(0xf2e3c8));
  body.position.y = 1.8 * s;
  g.add(body);
  const roof = box(6.8 * s, 0.5 * s, 5.8 * s, mat(0xb4552e));
  roof.position.y = 3.85 * s;
  g.add(roof);
  // striped awning
  for (let i = 0; i < 6; i++) {
    const stripe = box((6.4 * s) / 6, 0.12, 1.4, mat(i % 2 ? 0xe8874a : 0xfff3e0));
    stripe.position.set(-6.4 * s / 2 + (i + 0.5) * ((6.4 * s) / 6), 2.5 * s, 3.2);
    stripe.rotation.x = 0.35;
    g.add(stripe);
  }
  const door = box(1.8, 2.2, 0.15, mat(0x6b4423));
  door.position.set(-1.4, 1.1, 2.72 * s);
  g.add(door);
  const win = box(2.4, 1.6, 0.15, mat(0x9fd8ef));
  win.position.set(1.3, 1.6, 2.72 * s);
  g.add(win);
  // crates of materials outside
  const crate = box(0.9, 0.9, 0.9, mat(0x9a6b3f));
  crate.position.set(3.4, 0.45, 2.6);
  g.add(crate);
  const crate2 = crate.clone();
  crate2.position.set(4.3, 0.45, 2.2);
  g.add(crate2);
  const board = sign('SHOP', '#e8874a', 4.4, 1.2);
  board.position.set(0, 3.1 * s, 2.78 * s);
  g.add(board);
  // produce crates on a window sill
  const sill = box(2.6, 0.18, 0.5, mat(0x8a5a33));
  sill.position.set(1.3, 0.75, 2.95 * s);
  g.add(sill);
  const goods = [0xe0574f, 0x53b56d, 0xe8b04c];
  for (let i = 0; i < 3; i++) {
    const item = box(0.4, 0.4, 0.4, mat(goods[i]));
    item.position.set(0.7 + i * 0.6, 1.04, 2.95 * s);
    g.add(item);
  }
  entranceSteps(g, 3.15, 2.6);
  if (level >= 2) {
    const ext = box(2.2 * s, 2.6 * s, 4 * s, mat(0xf2e3c8));
    ext.position.set(4.2 * s, 1.3 * s, 0);
    g.add(ext);
  }
  return g;
}

function buildBank(level: number): THREE.Group {
  const g = new THREE.Group();
  const s = 1 + (level - 1) * 0.15;
  const body = box(7.2 * s, 4.6 * s, 6 * s, mat(0xf4f1e8));
  body.position.y = 2.3 * s;
  g.add(body);
  const cornice = box(7.8 * s, 0.5 * s, 6.6 * s, mat(0xd9d2c0));
  cornice.position.y = 4.85 * s;
  g.add(cornice);
  // columns
  for (let i = 0; i < 4; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 3.4 * s, 10), mat(0xffffff));
    col.position.set(-2.4 + i * 1.6, 1.7 * s, 3.2);
    col.castShadow = true;
    g.add(col);
  }
  // steps
  const steps = box(5, 0.35, 1.4, mat(0xd9d2c0));
  steps.position.set(0, 0.18, 3.8);
  g.add(steps);
  // gold emblem
  const emblem = new THREE.Mesh(
    new THREE.CircleGeometry(0.75, 24),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.7, roughness: 0.25 }),
  );
  emblem.position.set(0, 3.4 * s, 3.06 * s);
  g.add(emblem);
  const board = sign('BANK', '#2e7d4f', 4.6, 1.2);
  board.position.set(0, 4.4 * s, 3.06 * s);
  g.add(board);
  // tall windows between the columns
  for (const wx of [-1.6, 1.6]) {
    const win = windowBox(0.85, 1.9);
    win.position.set(wx * s, 2.2 * s, 3.05 * s);
    g.add(win);
  }
  if (level >= 2) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0x2e7d4f, { metalness: 0.4 }),
    );
    dome.position.y = 5.1 * s;
    g.add(dome);
  }
  frontPath(g, 4.6);
  return g;
}

function buildMesh(type: BuildingType, level: number): THREE.Group {
  switch (type) {
    case 'casino': return buildCasino(level);
    case 'mine': return buildMine(level);
    case 'shop': return buildShop(level);
    case 'bank': return buildBank(level);
    case 'cafe': return buildCafe(level);
    case 'arcade': return buildArcade(level);
    case 'bakery': return buildBakery(level);
    case 'park': return buildPark(level);
  }
}

function buildCafe(level: number): THREE.Group {
  const g = new THREE.Group();
  const s = 1 + (level - 1) * 0.15;
  const body = box(5.6 * s, 3.2 * s, 5, mat(0xe8d5b7));          // warm cream walls
  body.position.y = 1.6 * s;
  g.add(body);
  const roof = box(6 * s, 0.5 * s, 5.4, mat(0x7a4e2d));          // coffee-brown roof
  roof.position.y = 3.45 * s;
  g.add(roof);
  // brown-and-cream awning
  for (let i = 0; i < 5; i++) {
    const stripe = box((5.6 * s) / 5, 0.12, 1.3, mat(i % 2 ? 0x7a4e2d : 0xfff3e0));
    stripe.position.set(-5.6 * s / 2 + (i + 0.5) * ((5.6 * s) / 5), 2.25 * s, 2.9);
    stripe.rotation.x = 0.35;
    g.add(stripe);
  }
  const door = box(1.6, 2.1, 0.15, mat(0x5c3a21));
  door.position.set(-1.2, 1.05, 2.55 * s);
  g.add(door);
  const win = windowBox(1.8, 1.3);
  win.position.set(1.2, 1.6 * s, 2.55 * s);
  g.add(win);
  // steaming cup sign
  const board = sign('☕ CAFE', '#7a4e2d', 3.8, 1.1);
  board.position.set(0, 3 * s, 2.6 * s);
  g.add(board);
  // little round tables with umbrellas out front
  for (const tx of [-2.6, 2.6]) {
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 8), mat(0x8a5a33));
    table.position.set(tx, 0.75, 4.2);
    const leg = box(0.12, 0.7, 0.12, mat(0x5c3a21));
    leg.position.set(tx, 0.35, 4.2);
    const umb = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.5, 8), mat(0xe0574f));
    umb.position.set(tx, 1.6, 4.2);
    g.add(table, leg, umb);
  }
  // chimney with steam puff
  const chim = box(0.6, 1.2, 0.6, mat(0x9c6b45));
  chim.position.set(-2 * s, 4.2 * s, -1);
  g.add(chim);
  if (level >= 2) {
    const board2 = sign('BLOCKVILLE ROASTS', '#7a4e2d', 5, 0.9);
    board2.position.set(0, 4.6 * s, 2.6);
    g.add(board2);
  }
  frontPath(g, 3.2);
  return g;
}

function buildArcade(level: number): THREE.Group {
  const g = new THREE.Group();
  const s = 1 + (level - 1) * 0.15;
  const body = box(6.2 * s, 3.8 * s, 5.2 * s, mat(0x2b2440));     // midnight purple
  body.position.y = 1.9 * s;
  g.add(body);
  const roof = box(6.6 * s, 0.45 * s, 5.6 * s, mat(0xb455e0, { emissive: 0x7b2ea0, emissiveIntensity: 0.35 }));
  roof.position.y = 4.05 * s;
  g.add(roof);
  // glowing neon sign
  const board = sign('ARCADE', '#7b2ea0', 4.6, 1.2);
  board.position.set(0, 3.3 * s, 2.7 * s);
  g.add(board);
  const door = box(2.2, 2.3, 0.15, mat(0x120f1e, { metalness: 0.5, roughness: 0.3 }));
  door.position.set(0, 1.15, 2.65 * s);
  g.add(door);
  // pixel-style neon windows
  for (const wx of [-2.4, 2.4]) {
    const win = box(1.2, 1.2, 0.15, mat(0x67e8f9, { emissive: 0x22d3ee, emissiveIntensity: 0.6 }));
    win.position.set(wx * s, 2.1 * s, 2.65 * s);
    g.add(win);
  }
  // cabinet machines lined up outside
  for (let i = 0; i < 2 + level; i++) {
    const cab = box(0.9, 1.9, 0.8, mat(i % 2 ? 0xe0574f : 0x4f8fe0));
    cab.position.set(-2.4 + i * 1.1, 0.95, 3.4);
    const screen = box(0.7, 0.5, 0.1, mat(0xaff3ff, { emissive: 0x67e8f9, emissiveIntensity: 0.8 }));
    screen.position.set(-2.4 + i * 1.1, 1.45, 3.82);
    g.add(cab, screen);
  }
  entranceSteps(g, 3.3, 3);
  if (level >= 3) {
    const marquee = box(3, 0.6, 0.6, mat(0xf2b134, { emissive: 0xffc94d, emissiveIntensity: 0.7 }));
    marquee.position.set(0, 4.8 * s, 2.7 * s);
    g.add(marquee);
  }
  frontPath(g, 3.9);
  return g;
}

function buildBakery(level: number): THREE.Group {
  const g = new THREE.Group();
  const s = 1 + (level - 1) * 0.15;
  const body = box(5.8 * s, 3.4 * s, 5.2 * s, mat(0xf7d9e0));    // soft pastel pink
  body.position.y = 1.7 * s;
  g.add(body);
  // sloped roof from two slabs
  const roofL = box(3.2 * s, 0.4 * s, 5.6 * s, mat(0xa8543c));
  roofL.rotation.z = 0.22;
  roofL.position.set(-1.5 * s, 4.1 * s, 0);
  const roofR = roofL.clone();
  roofR.rotation.z = -0.22;
  roofR.position.x = 1.5 * s;
  g.add(roofL, roofR);
  const door = box(1.6, 2.1, 0.15, mat(0x8a4a35));
  door.position.set(-1.1, 1.05, 2.65 * s);
  g.add(door);
  // display window with bread
  const win = box(2.2, 1.5, 0.15, mat(0x9fd8ef));
  win.position.set(1.2, 1.7 * s, 2.65 * s);
  g.add(win);
  const breads = [0xd9a441, 0xc98a3c, 0xe8b04c];
  for (let i = 0; i < 3; i++) {
    const loaf = box(0.5, 0.32, 0.4, mat(breads[i]));
    loaf.position.set(0.6 + i * 0.6, 1.05, 2.85 * s);
    g.add(loaf);
  }
  const board = sign('BAKERY', '#a8543c', 4, 1.1);
  board.position.set(0, 3.1 * s, 2.68 * s);
  g.add(board);
  // brick chimney
  const chim = box(0.7, 1.6, 0.7, mat(0xb4552e));
  chim.position.set(2 * s, 4.4 * s, -1.2);
  g.add(chim);
  entranceSteps(g, 3.3, 2.4);
  if (level >= 2) {
    const ext = box(2, 2.4 * s, 3.6 * s, mat(0xf7d9e0));
    ext.position.set(3.8 * s, 1.2 * s, 0);
    g.add(ext);
  }
  frontPath(g, 3.4);
  return g;
}

function buildPark(level: number): THREE.Group {
  const g = new THREE.Group();
  // lawn slab
  const lawn = box(9, 0.12, 9, mat(0x6dbb5a));
  lawn.position.y = 0.06;
  lawn.receiveShadow = true;
  g.add(lawn);
  // central fountain
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.7, 12), mat(0xb9b2a4));
  basin.position.y = 0.35;
  basin.castShadow = true;
  g.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.5, 12), mat(0x6fc4e8, { roughness: 0.3 }));
  water.position.y = 0.55;
  g.add(water);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8), mat(0xb9b2a4));
  spout.position.y = 1.1;
  g.add(spout);
  const jet = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 1.1, 8),
    new THREE.MeshStandardMaterial({ color: 0xafe8f8, transparent: true, opacity: 0.8, roughness: 0.2 }),
  );
  jet.position.y = 2.1;
  g.add(jet);
  // hedges, trees and a bench or two
  for (const [hx, hz] of [[-3.4, -3.4], [3.4, -3.4], [-3.4, 3.4], [3.4, 3.4]] as const) {
    const hedge = box(1.6, 1, 1.6, mat(0x4e9e4e));
    hedge.position.set(hx, 0.6, hz);
    g.add(hedge);
  }
  for (const [tx, tz] of [[-3.4, 0], [3.4, 0], [0, -3.4]] as const) {
    const trunk = box(0.5, 1.6, 0.5, mat(0x7a5230));
    trunk.position.set(tx, 0.8, tz);
    const leaf = box(1.8, 1.8, 1.8, mat(0x4e9e4e));
    leaf.position.set(tx, 2.5, tz);
    const leaf2 = box(1.1, 1, 1.1, mat(0x5cb85c));
    leaf2.position.set(tx, 3.6, tz);
    g.add(trunk, leaf, leaf2);
  }
  for (const bx of [-1.8, 1.8]) {
    const bench = box(1.6, 0.18, 0.5, mat(0x8a6a3f));
    bench.position.set(bx, 0.55, 3.6);
    const back = box(1.6, 0.5, 0.12, mat(0x8a6a3f));
    back.position.set(bx, 0.85, 3.82);
    g.add(bench, back);
  }
  if (level >= 2) {
    const flowerbed = box(2.4, 0.3, 1, mat(0x8a5a33));
    flowerbed.position.set(0, 0.25, -1.4);
    g.add(flowerbed);
    for (let i = 0; i < 4; i++) {
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), mat(0xf26d7d));
      fl.position.set(-0.9 + i * 0.6, 0.55, -1.4);
      g.add(fl);
    }
  }
  if (level >= 3) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffe9a8, emissiveIntensity: 0.8 }),
    );
    lamp.position.set(0, 3.4, 0);
    const lamppost = box(0.15, 2.6, 0.15, mat(0x3d4450, { metalness: 0.4 }));
    lamppost.position.set(0, 1.3, 0);
    g.add(lamp, lamppost);
  }
  return g;
}

// ── NPC ────────────────────────────────────────────────────────────────────
const NPC_COLORS = [0xe0574f, 0x4f8fe0, 0x53b56d, 0xc99a3c, 0x8e6fc1, 0xd97fa8, 0x5fb8b0];
const NPC_HATS: HatType[] = ['none', 'none', 'none', 'cap', 'beanie', 'party', 'headphones'];
const NPC_GLASSES: GlassesType[] = ['none', 'none', 'none', 'none', 'round', 'shades'];
const NPC_DESIGNS: ShirtDesign[] = ['none', 'none', 'blockville', 'solana', 'pumpfun', 'diamond', 'bolt'];
const NPC_FACES: FaceType[] = ['smile', 'grin', 'chill', 'wow', 'wink', 'cool'];

// ── characters ─────────────────────────────────────────────────────────────
// Exported so the customise-menu preview renders the exact same mesh the
// player walks around with. Limb pivots sit at hip/shoulder for walk cycles.
export function makeCharacterMesh(look?: PlayerLook): THREE.Group {
  const g = new THREE.Group();
  const shirt = look
    ? new THREE.Color(look.shirt).getHex()
    : NPC_COLORS[randInt(0, NPC_COLORS.length - 1)];
  const skin = look ? look.skin : ['#f5d5b5', '#f0c8a0', '#c98850', '#8d5a3a'][randInt(0, 3)];
  const design: ShirtDesign = look ? look.shirtDesign : NPC_DESIGNS[randInt(0, NPC_DESIGNS.length - 1)];
  const face: FaceType = look ? look.face : NPC_FACES[randInt(0, NPC_FACES.length - 1)];
  const hat: HatType = look ? look.hat : NPC_HATS[randInt(0, NPC_HATS.length - 1)];
  const glasses: GlassesType = look ? look.glasses : NPC_GLASSES[randInt(0, NPC_GLASSES.length - 1)];

  const skinMat = mat(new THREE.Color(skin).getHex());
  const shirtMat = mat(shirt);
  const pantsMat = mat(0x35415c);
  const shoeMat = mat(0x23262f, { roughness: 0.6 });

  // legs: pant-coloured with a foot that swings with the stride
  const legGeo = new THREE.BoxGeometry(0.3, 0.72, 0.3);
  legGeo.translate(0, -0.36, 0);            // pivot at the hip
  const makeLeg = (sideX: number) => {
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.set(sideX, 0.74, 0);
    leg.castShadow = true;
    const foot = box(0.32, 0.15, 0.44, shoeMat);
    foot.position.set(0, -0.66, 0.07);
    leg.add(foot);
    return leg;
  };
  const legL = makeLeg(-0.2);
  const legR = makeLeg(0.2);

  // torso with an optional printed design on the front (+Z) and back (-Z)
  const designTex = shirtTexture(design, look ? look.shirt : `#${shirt.toString(16).padStart(6, '0')}`);
  const bodyMats = designTex
    ? (() => {
        const front = new THREE.MeshStandardMaterial({ map: designTex, roughness: 0.85 });
        const back = new THREE.MeshStandardMaterial({ map: designTex, roughness: 0.85 });
        return [shirtMat, shirtMat, shirtMat, shirtMat, front, back];
      })()
    : shirtMat;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, 0.52), bodyMats);
  body.position.y = 1.27;
  body.castShadow = true;
  // shirt hem for a cleaner silhouette
  const hem = box(0.92, 0.1, 0.54, mat(new THREE.Color(shirt).offsetHSL(0, 0, -0.08).getHex()));
  hem.position.y = 0.79;
  // collar
  const collar = box(0.62, 0.09, 0.56, mat(new THREE.Color(shirt).offsetHSL(0, 0, 0.09).getHex()));
  collar.position.set(0, 1.82, -0.02);

  // arms: pivoted at the shoulder — sleeve + skin forearm + hand
  const makeArm = (sideX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(sideX, 1.7, 0);
    const sleeve = box(0.24, 0.52, 0.27, shirtMat);
    sleeve.position.y = -0.2;
    const forearm = box(0.2, 0.36, 0.22, skinMat);
    forearm.position.y = -0.6;
    const hand = box(0.21, 0.18, 0.23, skinMat);
    hand.position.y = -0.86;
    pivot.add(sleeve, forearm, hand);
    return pivot;
  };
  const armL = makeArm(-0.57);
  const armR = makeArm(0.57);

  // neck joins head to torso
  const neck = box(0.24, 0.14, 0.24, skinMat);
  neck.position.y = 1.9;

  // head with a real face on the front (+Z), plain skin on the other sides
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(face, skin), roughness: 0.85 });
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.76, 0.78),
    [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat],
  );
  head.castShadow = true;
  head.position.y = 2.28;
  // ears
  const earGeo = new THREE.BoxGeometry(0.08, 0.2, 0.2);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-0.44, 2.28, 0);
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(0.44, 2.28, 0);
  // hair: top, back and a small fringe over the forehead
  const hairColor = [0x3a2e26, 0x1f1a17, 0x6b4a2f, 0x8a6a3f, 0xb5915a][randInt(0, 4)];
  const hairMat = mat(hairColor);
  const hairTop = box(0.84, 0.18, 0.82, hairMat);
  hairTop.position.y = 2.68;
  const hairBack = box(0.84, 0.5, 0.16, hairMat);
  hairBack.position.set(0, 2.4, -0.34);
  const fringe = box(0.84, 0.12, 0.1, hairMat);
  fringe.position.set(0, 2.56, 0.37);
  g.add(legL, legR, body, hem, collar, armL, armR, neck, head, earL, earR, hairTop, hairBack, fringe);
  const h = hatMesh(hat);
  if (h) {
    h.position.y = 2.78;
    g.add(h);
  }
  const gl = glassesMesh(glasses);
  if (gl) {
    gl.position.y = 2.3;
    g.add(gl);
  }
  g.userData.legs = [legL, legR];
  g.userData.arms = [armL, armR];
  return g;
}

interface Npc {
  group: THREE.Group;
  state: 'walk_in' | 'dwell' | 'walk_out';
  target: THREE.Vector3;
  exit: THREE.Vector3;
  dwellLeft: number;
  bubble?: HTMLDivElement;
  speed: number;
  phase: number;
  building: BuildingType | null;
  plotId?: number;       // which plot they are visiting (for ownership checks)
}

// ── the engine ─────────────────────────────────────────────────────────────
interface PlotVisual {
  marker?: THREE.Mesh;
  clickPlane?: THREE.Mesh;    // dedicated invisible click target (no overlaps)
  site?: THREE.Group;         // foundation + scaffold + block stack
  stackBlocks: THREE.Mesh[];
  building?: THREE.Group;
  popT?: number;              // scale-in animation timer
  buildLevel?: number;        // level the current mesh was built for
}

export class Engine implements EngineApi {
  private clouds: THREE.Group[] = [];
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private plotVisuals = new Map<number, PlotVisual>();
  private clickTargets = new Map<string, number>(); // object uuid -> plot id
  private npcs: Npc[] = [];
  private bubbleLayer: HTMLDivElement;
  private nextVisitAt = 2;
  private plotState: Plot[] = [];
  private npcTarget: number = CONFIG.baseNpcs;
  private wanderers = 0;

  private onPlotClick: (id: number) => void;
  private onBuildClick: (id: number) => void;
  private onStoreClick: () => void;
  private onNearby: (id: number | null) => void;
  private onTooFar: () => void;
  private requestReward: (b: BuildingType, level: number, plotId: number) => void;
  private storeClickPlane?: THREE.Mesh;
  private player?: THREE.Group;
  private playerLook: PlayerLook;
  private keys = new Set<string>();
  private vel = new THREE.Vector2(); // smoothed WASD velocity (x, z)
  private inputEnabled = true;
  private nearbyId: number | null = null;
  private nearbyClock = 0;
  private plotPos = new Map<number, { x: number; z: number }>();

  constructor(
    private container: HTMLDivElement,
    cb: {
      onPlotClick: (id: number) => void;
      onBuildClick: (id: number) => void;
      onStoreClick: () => void;
      requestReward: (b: BuildingType, level: number, plotId: number) => void;
      onNearby: (id: number | null) => void;
      onTooFar: () => void;
    },
    look: PlayerLook,
  ) {
    this.onPlotClick = cb.onPlotClick;
    this.onBuildClick = cb.onBuildClick;
    this.onStoreClick = cb.onStoreClick;
    this.requestReward = cb.requestReward;
    this.onNearby = cb.onNearby;
    this.onTooFar = cb.onTooFar;
    this.playerLook = look;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.bubbleLayer = document.createElement('div');
    this.bubbleLayer.className = 'bubble-layer';
    container.appendChild(this.bubbleLayer);

    this.scene.fog = new THREE.Fog(0xbfe0f5, 100, 320);

    this.camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.5, 400);
    this.camera.position.set(0, 30, 42);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 4, -8);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 170;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    this.buildWorld();
    this.bindEvents();
    // third-person start: camera sits behind the resident by the store
    if (this.player) {
      this.controls.target.copy(this.player.position);
      this.controls.target.y = 1.3;
      this.camera.position.set(this.player.position.x, 14, this.player.position.z + 16);
    }
    this.loop();
  }

  // ── world construction ──────────────────────────────────────────────────
  private buildWorld() {
    const hemi = new THREE.HemisphereLight(0xd8edff, 0x83b46e, 1.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffeecb, 1.6);
    sun.position.set(28, 44, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -95;
    sun.shadow.camera.right = 95;
    sun.shadow.camera.top = 95;
    sun.shadow.camera.bottom = -95;
    this.scene.add(sun);

    // gradient sky dome with a soft sun glow — slight detail, still stylised
    const sc = document.createElement('canvas');
    sc.width = 16;
    sc.height = 256;
    const sg = sc.getContext('2d')!;
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#5ea7e8');   // deeper blue overhead
    grad.addColorStop(0.55, '#9cccf2');
    grad.addColorStop(1, '#d9ecf9');   // pale horizon
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 16, 256);
    const skyTex = new THREE.CanvasTexture(sc);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(280, 24, 12),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    this.scene.add(sky);
    // a soft sun disc
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(14, 24),
      new THREE.MeshBasicMaterial({ color: 0xfff4cf, transparent: true, opacity: 0.9, fog: false }),
    );
    sunDisc.position.set(-100, 40, -220);
    sunDisc.lookAt(0, 0, 0);
    this.scene.add(sunDisc);
    // a handful of low-poly clouds drifting slowly
    this.clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, fog: false });
    for (let i = 0; i < 7; i++) {
      const cl = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(new THREE.BoxGeometry(6 - p * 0.8, 2.2, 3.4 - p * 0.4), cloudMat);
        puff.position.set(p * 2.4 - puffs, (p % 2) * 0.9, 0);
        cl.add(puff);
      }
      if (i < 3) {
        // a few low, far clouds that peek into the default town view
        cl.position.set(-180 + i * 90, 5 + (i % 2) * 3, -100 - i * 12);
      } else {
        cl.position.set(-150 + i * 46, 24 + (i % 3) * 8, -55 - (i % 4) * 38);
      }
      this.scene.add(cl);
      this.clouds.push(cl);
    }

    // ground with a subtle stylised grid
    const gc = document.createElement('canvas');
    gc.width = gc.height = 256;
    const g2 = gc.getContext('2d')!;
    g2.fillStyle = '#8fc978';
    g2.fillRect(0, 0, 256, 256);
    g2.fillStyle = '#84bd6e';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g2.fillRect(x * 64, y * 64, 64, 64);
    const gt = new THREE.CanvasTexture(gc);
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.repeat.set(24, 28);
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.magFilter = THREE.NearestFilter;
    // the town ground ends at the fence — beyond it a darker, muted plain
    // makes the world edge read as intentional rather than empty
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x6f9a5e, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.set(0, -0.05, 70);
    outer.receiveShadow = true;
    this.scene.add(outer);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(190, 228), new THREE.MeshStandardMaterial({ map: gt }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 70);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // roads: main E-W + spur to the store + Wave-1 cross streets running south
    const roadMat = mat(0x5d6066, { roughness: 1 });
    for (const r of [
      { w: 172, d: 6, x: 0, z: 0 },
      { w: 6, d: 34, x: 0, z: -17 },
      { w: 172, d: 6, x: 0, z: 18 },
      { w: 6, d: 30, x: -34, z: 9 },
      { w: 6, d: 30, x: 34, z: 9 },
      ...[34, 66, 98, 130, 162].map((z) => ({ w: 172, d: 6, x: 0, z })),
    ]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(r.x, 0.02, r.z);
      road.receiveShadow = true;
      this.scene.add(road);
    }
    // light sidewalks hugging the main streets
    const walkMat = mat(0xcfc8b8, { roughness: 1 });
    for (const w of [
      { w: 172, d: 2, x: 0, z: 4.2 }, { w: 172, d: 2, x: 0, z: -4.2 },
      { w: 172, d: 2, x: 0, z: 22.2 }, { w: 172, d: 2, x: 0, z: 13.8 },
    ]) {
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.d), walkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(w.x, 0.03, w.z);
      walk.receiveShadow = true;
      this.scene.add(walk);
    }
    // dashed center line
    for (let x = -82; x <= 82; x += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.4), mat(0xf5edc9));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.04, 0);
      this.scene.add(dash);
    }

    // ── town fence: posts and rails ringing the whole town, with wooden
    // gate arches where the main road leaves town east and west ──
    const postMat = mat(0x8a6a3f, { roughness: 0.9 });
    const railMat = mat(0x9c7a4a, { roughness: 0.9 });
    const f = CONFIG.fence;
    const gateHalf = 4.2;   // the main road passes through here
    const addPost = (x: number, z: number) => {
      const post = box(0.28, 1.5, 0.28, postMat);
      post.position.set(x, 0.75, z);
      this.scene.add(post);
    };
    const addRail = (x1: number, z1: number, x2: number, z2: number, y: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.1), railMat);
      rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      rail.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      rail.castShadow = true;
      this.scene.add(rail);
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
      this.scene.add(pillarA, pillarB, beam, welcome);
    }

    // starter Blockville Store
    this.scene.add(this.makeStore());

    // store click target (invisible plane in front of the storefront)
    const storePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    storePlane.rotation.x = -Math.PI / 2;
    storePlane.position.set(STORE_POS.x, 0.9, STORE_POS.z + 4.6);
    this.scene.add(storePlane);
    this.storeClickPlane = storePlane;

    // decorative trees — kept well clear of every road and plot
    const treeSpots: [number, number][] = [
      [-42, -22], [42, -22], [-46, -8], [46, -8], [-16, -30], [16, -30],
      [-44, 14], [44, 14], [-42, 28], [42, 28],
    ];
    for (const [x, z] of treeSpots) {
      const t = new THREE.Group();
      const trunk = box(0.7, 1.6, 0.7, mat(0x7a5230));
      trunk.position.y = 0.8;
      const leaf = box(2.2, 2.2, 2.2, mat(0x4e9e4e));
      leaf.position.y = 2.6;
      const leaf2 = box(1.4, 1.2, 1.4, mat(0x5cb85c));
      leaf2.position.y = 3.9;
      t.add(trunk, leaf, leaf2);
      t.position.set(x, 0, z);
      this.scene.add(t);
    }

    // welcoming touches: flowerbeds, bushes and street lamps along the main road
    const flowerColors = [0xf26d7d, 0xf2b134, 0xb455e0, 0xfff3e0, 0x5fb8b0];
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = -52 + Math.floor(i / 2) * 8 + ((i % 4) ? 2 : 0);
      const z = side * 5.6;
      const clump = new THREE.Group();
      for (let f = 0; f < 3; f++) {
        const stem = box(0.1, 0.5, 0.1, mat(0x3f7d3a));
        stem.position.set(f * 0.5 - 0.5, 0.25, 0);
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 6, 6),
          mat(flowerColors[(i + f) % flowerColors.length]),
        );
        head.position.set(f * 0.5 - 0.5, 0.55, 0);
        clump.add(stem, head);
      }
      clump.position.set(x, 0, z);
      this.scene.add(clump);
    }
    for (const bx of [-30, -18, 18, 30]) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(1.1, 7, 6), mat(0x55a24f));
      bush.position.set(bx, 0.7, -5.4);
      bush.castShadow = true;
      this.scene.add(bush);
    }
    for (const lx of [-40, -14, 14, 40]) {
      for (const lz of [-4.6, 4.6]) {
        const pole = box(0.18, 3.4, 0.18, mat(0x3d4450, { metalness: 0.4 }));
        pole.position.set(lx, 1.7, lz);
        const lampHead = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffe9a8, emissiveIntensity: 0.7 }),
        );
        lampHead.position.set(lx, 3.55, lz);
        this.scene.add(pole, lampHead);
      }
    }

    // plot markers
    for (const p of PLOT_POSITIONS) {
      this.plotPos.set(p.id, { x: p.x, z: p.z });
      // invisible click plane — one per plot, sized to leave a clear gap between plots
      const clickPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      clickPlane.rotation.x = -Math.PI / 2;
      clickPlane.position.set(p.x, 1.1, p.z);
      clickPlane.userData.plotId = p.id;
      this.scene.add(clickPlane);
      this.clickTargets.set(clickPlane.uuid, p.id);

      // visual marker (not clickable)
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 9),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(p.x, 0.06, p.z);
      this.scene.add(marker);

      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(9, 9)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
      );
      border.rotation.x = -Math.PI / 2;
      border.position.set(p.x, 0.07, p.z);
      this.scene.add(border);

      this.plotVisuals.set(p.id, { marker, stackBlocks: [] });
    }

    // the player's resident, standing by the store
    this.spawnPlayer();
  }

  private spawnPlayer() {
    if (this.player) {
      this.scene.remove(this.player);
      this.player = undefined;
    }
    const g = this.makeNpcMesh(this.playerLook);
    g.position.set(STORE_POS.x + 4.5, 0, STORE_POS.z + 5.5);
    g.rotation.y = 0.4;   // angled toward the default camera
    this.scene.add(g);
    this.player = g;
  }

  private makeStore(): THREE.Group {
    const g = new THREE.Group();
    const body = box(9, 4.4, 7, mat(0xd8452f));
    body.position.y = 2.2;
    g.add(body);
    const roof = box(9.6, 0.6, 7.6, mat(0x7a2a1c));
    roof.position.y = 4.7;
    g.add(roof);
    const aw = box(9.2, 0.25, 2.4, mat(0xfff3e0));
    aw.position.set(0, 3.4, 4.2);
    aw.rotation.x = 0.3;
    g.add(aw);
    const door = box(2.2, 2.6, 0.2, mat(0x3a241a));
    door.position.set(0, 1.3, 3.55);
    g.add(door);
    const win = box(2.6, 1.8, 0.2, mat(0x9fd8ef));
    win.position.set(-2.9, 1.9, 3.55);
    g.add(win);
    const board = sign('BLOCKVILLE STORE', '#d8452f', 7.6, 1.5);
    board.position.set(0, 3.9, 3.6);
    g.add(board);
    // stacks of blocks for sale outside
    for (let i = 0; i < 3; i++) {
      const stack = box(0.8, 0.8, 0.8, mat(0xe8b04c));
      stack.position.set(5.2, 0.4 + (i % 2) * 0.8, 2 + i * 0.4);
      g.add(stack);
    }
    g.position.set(STORE_POS.x, 0, STORE_POS.z);
    return g;
  }

  // ── state sync from React ───────────────────────────────────────────────
  sync(plots: Plot[], npcTarget: number) {
    this.npcTarget = npcTarget;
    for (const p of plots) {
      const v = this.plotVisuals.get(p.id);
      if (!v) continue;
      // a plot can arrive already finished (community buildings, purchased
      // plots) or as an empty claim — build whichever visual is missing
      if (p.type && !v.site && !v.building) {
        if (p.done) this.finishBuilding(p, v);
        else this.startSite(p, v);
      }
      if (p.type && v.site && !p.done) this.updateStack(p, v);
      if (p.done && v.site && !v.building) this.finishBuilding(p, v);
      if (p.done && v.building && v.buildLevel !== p.level) this.rebuildLevel(p, v);
      if (v.marker) v.marker.visible = !p.type;
    }
    this.plotState = plots;
  }

  // swap in the mesh for a newly upgraded level, with the same rise-in feel
  private rebuildLevel(p: Plot, v: PlotVisual) {
    if (v.building) this.scene.remove(v.building);
    const def = PLOT_POSITIONS.find((d) => d.id === p.id)!;
    const mesh = buildMesh(p.type!, p.level);
    mesh.position.set(def.x, 0, def.z);
    mesh.rotation.y = def.side === 'north' ? 0 : Math.PI;
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    v.building = mesh;
    v.buildLevel = p.level;
    v.popT = 0;
  }

  private startSite(p: Plot, v: PlotVisual) {
    const def = PLOT_POSITIONS.find((d) => d.id === p.id)!;
    const g = new THREE.Group();
    const slab = box(9, 0.35, 9, mat(0xb9b2a4));
    slab.position.y = 0.18;
    slab.receiveShadow = true;
    g.add(slab);
    // scaffold poles
    for (const [sx, sz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]] as const) {
      const pole = box(0.22, 5.4, 0.22, mat(0x8a6a3f));
      pole.position.set(sx, 2.7, sz);
      g.add(pole);
    }
    const beam = box(7.8, 0.22, 0.22, mat(0x8a6a3f));
    beam.position.set(0, 5.2, -3.6);
    g.add(beam);
    const beam2 = beam.clone();
    beam2.position.z = 3.6;
    g.add(beam2);
    // material pallet
    const pallet = box(1.6, 1, 1.6, mat(0xe8b04c));
    pallet.position.set(-3.4, 0.85, -2.8);
    g.add(pallet);
    // sign of what's coming
    if (p.type) {
      const b = sign(`${BUILDING_DEFS[p.type].name.toUpperCase()} — COMING SOON`, '#33404d', 7.5, 1.1);
      b.position.set(0, 3.1, 4.7);
      g.add(b);
    }
    g.position.set(def.x, 0, def.z);
    this.scene.add(g);
    v.site = g;
    v.stackBlocks = [];
  }

  private stackPos(i: number): THREE.Vector3 {
    // orderly courses of blocks laid like brickwork: a solid footprint per layer
    const layer = Math.floor(i / 8);
    const idx = i % 8;
    const ring = [
      [-1.15, -1.15], [0, -1.15], [1.15, -1.15],
      [-1.15, 0], [1.15, 0],
      [-1.15, 1.15], [0, 1.15], [1.15, 1.15],
    ][idx];
    // alternate layers shift half a block, like real courses of bricks
    const shift = layer % 2 ? 0.55 : 0;
    return new THREE.Vector3(ring[0] + shift * ((idx % 2) ? 0 : 1), 0.42 + layer * 0.84, ring[1]);
  }

  private updateStack(p: Plot, v: PlotVisual) {
    let queued = 0;
    while (v.stackBlocks.length < p.progress && v.site) {
      const i = v.stackBlocks.length;
      const pos = this.stackPos(i);
      // two-tone courses read as intentional brickwork rather than random blocks
      const course = Math.floor(i / 8);
      const color = course % 2 ? 0xd97b3f : 0xe8b04c;
      const b = box(1.05, 0.8, 1.05, mat(color));
      const target = pos.clone();
      b.position.set(target.x, target.y + 3.2, target.z); // drop in from above
      b.rotation.y = (Math.random() - 0.5) * 0.12;        // slight tilt while falling
      b.visible = false;                                   // appears when its turn comes
      b.userData.dropT = 0;
      b.userData.delay = queued * 0.14;                    // stagger a queued batch
      b.userData.targetY = target.y;
      b.userData.landed = false;
      v.site.add(b);
      v.stackBlocks.push(b);
      queued++;
    }
  }

  private finishBuilding(p: Plot, v: PlotVisual) {
    const def = PLOT_POSITIONS.find((d) => d.id === p.id)!;
    if (v.site) {
      this.scene.remove(v.site);
      v.site = undefined;
      v.stackBlocks = [];
    }
    const mesh = buildMesh(p.type!, p.level);
    mesh.position.set(def.x, 0, def.z);
    // face the road
    mesh.rotation.y = def.side === 'north' ? 0 : Math.PI;
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    v.building = mesh;
    v.buildLevel = p.level;
    v.popT = 0;
  }

  // ── interaction ─────────────────────────────────────────────────────────
  private bindEvents() {
    const dom = this.renderer.domElement;
    let downAt = 0;
    dom.addEventListener('pointerdown', () => (downAt = performance.now()));
    dom.addEventListener('pointerup', (e) => {
      if (performance.now() - downAt > 220) return; // drag = rotate, not click
      const r = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      const hits = this.raycaster.intersectObjects(this.scene.children, true);
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object;
        while (o && !(this.clickTargets.has(o.uuid) || o === this.storeClickPlane)) o = o.parent;
        if (o === this.storeClickPlane) {
          this.onStoreClick();
          return;
        }
        if (o) {
          const id = this.clickTargets.get(o.uuid)!;
          const st = this.plotState[id];
          // you have to walk up to a plot to interact with it
          if (!this.plotPos.has(id) || this.nearPlotDist(id) > CONFIG.interactRadius) {
            this.onTooFar();
            return;
          }
          if (st && st.type && !st.done) this.onBuildClick(id);
          else if (!st?.type || st.owner === 'you') this.onPlotClick(id);
          return;
        }
      }
    });
    // WASD / arrows walk the resident — camera-relative, ignored while typing
    const walkKey = (k: string) =>
      ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k);
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing =
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing || !this.inputEnabled || e.repeat) return;
      const k = e.key.toLowerCase();
      // E interacts with the plot you're standing next to
      if (k === 'e' && this.nearbyId !== null) {
        const st = this.plotState[this.nearbyId];
        if (st && st.type && !st.done) this.onBuildClick(this.nearbyId);
        else if (!st?.type || st.owner === 'you') this.onPlotClick(this.nearbyId);
        return;
      }
      if (walkKey(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', this.onResize);
  }

  // modals pause movement so keys never fight with form inputs
  setInputEnabled(v: boolean) {
    this.inputEnabled = v;
    if (!v) this.keys.clear();
  }

  private nearPlotDist(id: number): number {
    if (!this.player) return Infinity;
    const p = this.plotPos.get(id);
    if (!p) return Infinity;
    const dx = this.player.position.x - p.x;
    const dz = this.player.position.z - p.z;
    return Math.hypot(dx, dz);
  }

  // keep the resident out of solid buildings (sites stay walkable)
  private resolveCollisions(pos: THREE.Vector3) {
    const pad = 0.45;
    const check = (cx: number, cz: number, hw: number, hd: number) => {
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const px = hw + pad - Math.abs(dx);
      const pz = hd + pad - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) pos.x = cx + Math.sign(dx || 1) * (hw + pad);
        else pos.z = cz + Math.sign(dz || 1) * (hd + pad);
      }
    };
    check(STORE_POS.x, STORE_POS.z, 4.8, 3.8);
    for (const p of this.plotState) {
      if (!p.done || !p.type) continue;
      const d = this.plotPos.get(p.id);
      if (d) check(d.x, d.z, 4.3, 4.3);
    }
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ── NPCs ────────────────────────────────────────────────────────────────
  private makeNpcMesh(look?: PlayerLook): THREE.Group {
    return makeCharacterMesh(look);
  }

  setLook(look: PlayerLook) {
    this.playerLook = look;
    // keep the resident where they were standing — only the look changes
    const pos = this.player?.position.clone();
    const rot = this.player?.rotation.y ?? 0.4;
    this.spawnPlayer();
    if (this.player && pos) {
      this.player.position.copy(pos);
      this.player.rotation.y = rot;
    }
  }

  // world -> CSS pixel position (used by dev tooling and tests)
  screenPos(x: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, 1, z).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-v.y * 0.5 + 0.5) * this.container.clientHeight,
    };
  }

  // dev/testing: move the camera to a given distance from its target
  setCamDist(dist: number) {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
  }

  camDistance(): number {
    return this.camera.position.distanceTo(this.controls.target);
  }

  playerPos(): { x: number; z: number } {
    return this.player ? { x: this.player.position.x, z: this.player.position.z } : { x: 0, z: 0 };
  }

  // drop a decorative garden on one of the player's plots — ×1.2 fee yield
  placeGardenVisual(plotId: number) {
    if (this.gardenVisuals.has(plotId)) return;
    const pos = this.plotPos.get(plotId);
    if (!pos) return;
    const g = new THREE.Group();
    // raised flower beds with blooms
    const bedMat = mat(0x8a5a33);
    const bloomColors = [0xf26d7d, 0xf2b134, 0xb455e0, 0xfff3e0, 0xe0579f];
    for (let b = 0; b < 2; b++) {
      const bed = box(3.2, 0.4, 1.1, bedMat);
      bed.position.set(-1.4 + b * 2.8, 0.2, 0);
      g.add(bed);
      for (let i = 0; i < 4; i++) {
        const stem = box(0.08, 0.5, 0.08, mat(0x3f7d3a));
        stem.position.set(bed.position.x - 1.2 + i * 0.8, 0.6, bed.position.z);
        const bloom = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 6, 6),
          mat(bloomColors[(plotId + b * 2 + i) % bloomColors.length]),
        );
        bloom.position.set(stem.position.x, 0.9, bed.position.z);
        g.add(stem, bloom);
      }
    }
    // a small tree and a stone path
    const trunk = box(0.4, 1.4, 0.4, mat(0x7a5230));
    trunk.position.set(2.6, 0.7, -1.6);
    const leaf = box(1.7, 1.7, 1.7, mat(0x4e9e4e));
    leaf.position.set(2.6, 2.2, -1.6);
    const leaf2 = box(1.1, 1.1, 1.1, mat(0x5cb85c));
    leaf2.position.set(2.6, 3.2, -1.6);
    g.add(trunk, leaf, leaf2);
    for (let i = 0; i < 3; i++) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 7), mat(0xb9b2a4));
      stone.position.set(-2.4 + i * 0.9, 0.05, 1.9);
      g.add(stone);
    }
    // friendly garden gnome
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 8), mat(0x4f8fe0));
    body.position.set(0.4, 0.3, 2.0);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat(0xf0c8a0));
    headM.position.set(0.4, 0.65, 2.0);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.3, 8), mat(0xe0574f));
    cap.position.set(0.4, 0.88, 2.0);
    g.add(body, headM, cap);
    // gardens sit beside the building entrance
    const def = PLOT_POSITIONS.find((d) => d.id === plotId);
    const front = def && def.side === 'north' ? 1 : -1;
    g.position.set(pos.x, 0, pos.z + front * 3.1);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this.scene.add(g);
    this.gardenVisuals.set(plotId, g);
  }

  private gardenVisuals = new Map<number, THREE.Group>();

  // dev/testing: place the resident at a world position instantly
  teleport(x: number, z: number) {
    if (this.player) {
      this.player.position.set(x, 0, z);
      this.controls.target.set(x, 1.3, z);
    }
  }
  private spawnVisit() {
    const done = this.plotState.filter((p) => p.done && p.type);
    if (done.length === 0) return;
    // Visitors favour the player's own buildings (~40% of visits) so the
    // core loop — build it, people come, fees flow — stays front and centre.
    const mine = done.filter((p) => p.owner === 'you');
    const target =
      mine.length && Math.random() < 0.4 ? mine[randInt(0, mine.length - 1)] : done[randInt(0, done.length - 1)];
    const def = PLOT_POSITIONS.find((d) => d.id === target.id)!;
    // entrance point just in front of the building (toward the road)
    const entrance = new THREE.Vector3(def.x, 0, def.side === 'north' ? def.z + 4.6 : def.z - 4.6);
    // spawn along the same building row so walks stay on the frontage
    const spawn = new THREE.Vector3(
      def.x + (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 14),
      0,
      entrance.z,
    );
    const mesh = this.makeNpcMesh();
    mesh.position.copy(spawn);
    this.scene.add(mesh);
    const npc: Npc = {
      group: mesh,
      state: 'walk_in',
      target: entrance,
      exit: spawn,
      dwellLeft: CONFIG.bubbleTimeMin + Math.random() * (CONFIG.bubbleTimeMax - CONFIG.bubbleTimeMin),
      speed: 4.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      building: target.type,
      plotId: target.id,
    };
    this.npcs.push(npc);
  }

  private spawnWanderer() {
    const mesh = this.makeNpcMesh();
    const z = 3.2 * (Math.random() < 0.5 ? 1 : -1);
    mesh.position.set(-40 + Math.random() * 80, 0, z);
    this.scene.add(mesh);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const npc: Npc = {
      group: mesh,
      state: 'walk_in',
      target: new THREE.Vector3(dir > 0 ? 48 : -48, 0, z),
      exit: new THREE.Vector3(dir > 0 ? -48 : 48, 0, z),
      dwellLeft: 0,
      speed: 2.0 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      building: null,
    };
    this.npcs.push(npc);
  }

  private showBubble(npc: Npc, text: string) {
    const el = document.createElement('div');
    el.className = 'npc-bubble';
    el.textContent = text;
    this.bubbleLayer.appendChild(el);
    npc.bubble = el;
  }

  private removeNpc(npc: Npc, index: number) {
    if (npc.bubble) npc.bubble.remove();
    this.scene.remove(npc.group);
    this.npcs.splice(index, 1);
  }

  // ── per-frame ───────────────────────────────────────────────────────────
  private step(dt: number) {
    // block drop-in animation
    for (const [, v] of this.plotVisuals) {
      if (v.site) {
        for (const b of v.stackBlocks) {
          // queued blocks wait their turn, then drop smoothly into place
          if (b.userData.delay > 0) {
            b.userData.delay -= dt;
            b.visible = b.userData.delay <= 0;
            if (!b.visible) continue;
          }
          const t = (b.userData.dropT = (b.userData.dropT ?? 0) + dt * 2.2);
          const targetY = b.userData.targetY;
          if (t < 1) {
            // smooth ease-in-out fall
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            b.position.y = targetY + 3.2 * (1 - e);
          } else if (!b.userData.landed) {
            b.userData.landed = true;
            b.userData.bounceT = 0;
          } else if (b.userData.bounceT < 1) {
            // impact: small squash-and-settle so blocks feel weighted
            b.userData.bounceT = Math.min(1, b.userData.bounceT + dt * 5);
            const bt = b.userData.bounceT;
            const sq = Math.sin(bt * Math.PI) * 0.16;
            b.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
            b.position.y = targetY + Math.sin(bt * Math.PI) * 0.18;
            b.rotation.y *= Math.max(0, 1 - dt * 7);
            if (bt >= 1) {
              b.scale.set(1, 1, 1);
              b.rotation.y = 0;
              b.position.y = targetY;
            }
          }
        }
      }
      if (v.building && v.popT !== undefined && v.popT < 1) {
        v.popT += dt * 1.7;
        const e = 1 - Math.pow(1 - Math.min(1, v.popT), 3);
        const overshoot = 1 + Math.sin(Math.min(1, v.popT) * Math.PI) * 0.07;
        v.building.scale.setScalar(e * overshoot);
        // rise out of the ground instead of popping out of nowhere
        v.building.position.y = -(1 - e) * 1.4;
        if (v.popT >= 1) {
          v.building.scale.setScalar(1);
          v.building.position.y = 0;
        }
      }
    }

    // NPC visits scheduler
    this.nextVisitAt -= dt;
    if (this.nextVisitAt <= 0) {
      this.nextVisitAt = CONFIG.npcIntervalMin + Math.random() * (CONFIG.npcIntervalMax - CONFIG.npcIntervalMin);
      const visitors = this.npcs.filter((n) => n.building).length;
      const builtCount = this.plotState.filter((p) => p.done).length;
      const wantVisitors = Math.max(1, Math.min(10, Math.round(builtCount * CONFIG.npcPerBuilding)));
      if (builtCount > 0 && visitors < wantVisitors) this.spawnVisit();
      else if (builtCount === 0 && this.wanderers < 2) {
        this.wanderers++;
        this.spawnWanderer();
      }
    }

    // NPC movement
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      const g = n.group;
      const legs: THREE.Mesh[] = g.userData.legs ?? [];
      if (n.state !== 'dwell') {
        const dir = n.target.clone().sub(g.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 0.3) {
          if (n.state === 'walk_in') {
            if (n.building) {
              n.state = 'dwell';
              this.showBubble(n, pickActivity(n.building));
              // only the player's own buildings pay them fees — resident
              // buildings are visual flavour for the town economy
              const plot = this.plotState.find((q) => q.id === n.plotId);
              if (plot?.owner === 'you') this.requestReward(n.building, plot.level, plot.id);
            } else {
              this.removeNpc(n, i); // wanderer reached map edge
              this.wanderers = Math.max(0, this.wanderers - 1);
              continue;
            }
          } else {
            this.removeNpc(n, i);
            continue;
          }
        } else {
          dir.normalize();
          g.position.addScaledVector(dir, n.speed * dt);
          g.rotation.y = Math.atan2(dir.x, dir.z);
          n.phase += dt * 9;
          const sw = Math.sin(n.phase) * 0.5;
          if (legs.length === 2) {
            legs[0].rotation.x = sw;
            legs[1].rotation.x = -sw;
          }
          g.position.y = Math.abs(Math.sin(n.phase)) * 0.06;
        }
      } else {
        n.dwellLeft -= dt;
        if (n.dwellLeft <= 0) {
          if (n.bubble) {
            n.bubble.remove();
            n.bubble = undefined;
          }
          n.state = 'walk_out';
          const t = n.target;
          n.target = n.exit;
          n.exit = t;
        }
      }

      // bubble follows head
      if (n.bubble) {
        const head = new THREE.Vector3(g.position.x, g.position.y + 3.1, g.position.z);
        head.project(this.camera);
        const x = (head.x * 0.5 + 0.5) * this.container.clientWidth;
        const y = (-head.y * 0.5 + 0.5) * this.container.clientHeight;
        n.bubble.style.left = `${x}px`;
        n.bubble.style.top = `${y}px`;
      }
    }

    // ── your resident: WASD walk + third-person camera follow ──
    if (this.player) {
      const p = this.player;
      const legs: THREE.Mesh[] = p.userData.legs ?? [];
      const arms: THREE.Mesh[] = p.userData.arms ?? [];
      let mx = 0;
      let mz = 0;
      let moving = false;
      if (this.inputEnabled) {
        const fwd =
          (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) -
          (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
        const side =
          (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
          (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
        if (fwd || side) {
          // camera-relative: W walks away from the camera, A/D strafe
          const view = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
          view.y = 0;
          view.normalize();
          const right = new THREE.Vector3().crossVectors(view, UP).normalize();
          const dir = view.multiplyScalar(fwd).add(right.multiplyScalar(side)).normalize();
          mx = dir.x;
          mz = dir.z;
          moving = true;
        }
      }
      // smooth acceleration / deceleration instead of instant start-stop
      const rate = moving ? 9 : 13;
      this.vel.x += (mx - this.vel.x) * Math.min(1, dt * rate);
      this.vel.y += (mz - this.vel.y) * Math.min(1, dt * rate);
      const speed = this.vel.length();
      if (speed > 0.01) {
        const nx = p.position.x + this.vel.x * CONFIG.walkSpeed * dt;
        const nz = p.position.z + this.vel.y * CONFIG.walkSpeed * dt;
        const r = CONFIG.worldRect;
        p.position.x = THREE.MathUtils.clamp(nx, r.minX, r.maxX);
        p.position.z = THREE.MathUtils.clamp(nz, r.minZ, r.maxZ);
        this.resolveCollisions(p.position);
        if (moving) {
          // face where you're heading, turning smoothly
          const targetYaw = Math.atan2(mx, mz);
          let d = targetYaw - p.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          p.rotation.y += d * Math.min(1, dt * 12);
        }
        // walk cycle scales with actual speed
        const sw = Math.sin(this.clock.elapsedTime * 11) * 0.55 * Math.min(1, speed * 1.6);
        if (legs.length === 2) {
          legs[0].rotation.x = sw;
          legs[1].rotation.x = -sw;
        }
        if (arms.length === 2) {
          arms[0].rotation.x = -sw * 0.65;
          arms[1].rotation.x = sw * 0.65;
        }
      } else {
        this.vel.set(0, 0);
        // limbs ease back to rest, gentle idle breathing
        for (const l of [...legs, ...arms]) l.rotation.x *= Math.max(0, 1 - dt * 10);
        p.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 1.6)) * 0.06;
      }

      // camera glides after the resident — the offset stays locked, so the
      // follow distance only ever changes when you scroll to zoom
      const want = new THREE.Vector3(p.position.x, 1.3, p.position.z);
      const before = this.controls.target.clone();
      this.controls.target.lerp(want, 1 - Math.exp(-5 * dt));
      this.camera.position.add(new THREE.Vector3().subVectors(this.controls.target, before));

      // which plot is the resident close enough to interact with?
      this.nearbyClock -= dt;
      if (this.nearbyClock <= 0) {
        this.nearbyClock = 0.15;
        let best: number | null = null;
        let bestD: number = CONFIG.interactRadius;
        for (const p2 of this.plotState) {
          const d = this.nearPlotDist(p2.id);
          if (d < bestD) {
            bestD = d;
            best = p2.id;
          }
        }
        if (best !== this.nearbyId) {
          this.nearbyId = best;
          this.onNearby(best);
        }
        // highlight the plot you're standing at
        for (const [id, v] of this.plotVisuals) {
          if (!v.marker) continue;
          const near = id === best;
          const m = v.marker.material as THREE.MeshBasicMaterial;
          m.opacity = near ? 0.42 : 0.25;
          m.color.set(near ? 0xffd76a : 0xffffff);
        }
      }
    }

    // clouds drift lazily across the sky
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.6;
      if (cl.position.x > 190) cl.position.x = -190;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.step(dt);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.bubbleLayer.remove();
  }
}
