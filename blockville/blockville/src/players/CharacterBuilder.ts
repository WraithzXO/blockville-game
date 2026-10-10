import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mat, box, rbox } from '../buildings/BuildingMaterials';
import { randInt, type FaceType, type GlassesType, type HatType, type PlayerLook, type ShirtDesign } from '../game/config';
import { faceTexture, shirtTexture } from './CharacterTextures';
import { hatMesh, glassesMesh } from './CharacterAccessories';

// ── NPC ────────────────────────────────────────────────────────────────────
const NPC_COLORS = [0xe0574f, 0x4f8fe0, 0x53b56d, 0xc99a3c, 0x8e6fc1, 0xd97fa8, 0x5fb8b0];
const NPC_HATS: HatType[] = ['none', 'none', 'none', 'cap', 'beanie', 'party', 'headphones', 'cowboy'];
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

  const skinMat = mat(new THREE.Color(skin).getHex(), { roughness: 0.7 });
  const skinShade = mat(new THREE.Color(skin).offsetHSL(0, 0, -0.13).getHex(), { roughness: 0.7 });
  const shirtCol = new THREE.Color(shirt);
  const shirtMat = mat(shirt);
  const shirtDark = mat(shirtCol.clone().offsetHSL(0, 0, -0.11).getHex());
  const shirtLite = mat(shirtCol.clone().offsetHSL(0, 0, 0.09).getHex());
  const pantsMat = mat(0x3a4664);
  const shoeMat = mat(0x262a33, { roughness: 0.5 });
  const soleMat = mat(0xd8d3c8, { roughness: 0.9 });
  const beltMat = mat(0x4a3527, { roughness: 0.6 });
  const buckleMat = mat(0xd4af37, { metalness: 0.6, roughness: 0.3 });

  // legs: rounded, pivoted at the hip, with a shoe and a light sole
  const makeLeg = (sideX: number) => {
    const leg = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.74, 0.34, 2, 0.09), pantsMat);
    leg.geometry.translate(0, -0.37, 0);       // pivot at the hip
    leg.position.set(sideX, 0.74, 0);
    leg.castShadow = true;
    const shoe = rbox(0.36, 0.17, 0.5, 0.06, shoeMat);
    shoe.position.set(0, -0.66, 0.08);
    leg.add(shoe);
    const sole = box(0.38, 0.05, 0.52, soleMat);
    sole.position.set(0, -0.75, 0.08);
    leg.add(sole);
    return leg;
  };
  const legL = makeLeg(-0.21);
  const legR = makeLeg(0.21);

  // torso with an optional printed design on the front (+Z) and back (-Z)
  const designTex = shirtTexture(design, look ? look.shirt : `#${shirt.toString(16).padStart(6, '0')}`);
  const bodyMats = designTex
    ? (() => {
        const front = new THREE.MeshStandardMaterial({ map: designTex, roughness: 0.85 });
        const back = new THREE.MeshStandardMaterial({ map: designTex, roughness: 0.85 });
        return [shirtMat, shirtMat, shirtMat, shirtMat, front, back];
      })()
    : shirtMat;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.06, 0.56), bodyMats);
  body.position.y = 1.27;
  body.castShadow = true;
  // shoulder caps round off the top corners of the torso
  for (const sx of [-0.37, 0.37]) {
    const cap = rbox(0.32, 0.2, 0.6, 0.08, shirtMat);
    cap.position.set(sx, 1.73, 0);
    g.add(cap);
  }
  // shirt hem, collar and a belt with a brass buckle
  const hem = box(0.96, 0.1, 0.58, shirtDark);
  hem.position.y = 0.79;
  const collar = box(0.64, 0.09, 0.58, shirtLite);
  collar.position.set(0, 1.82, -0.02);
  const belt = box(0.96, 0.13, 0.58, beltMat);
  belt.position.y = 0.92;
  const buckle = box(0.16, 0.1, 0.06, buckleMat);
  buckle.position.set(0, 0.92, 0.3);
  g.add(hem, collar, belt, buckle);

  // arms: pivoted at the shoulder — shoulder cap, sleeve, cuff, forearm, hand
  const makeArm = (sideX: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(sideX, 1.7, 0);
    const sleeve = rbox(0.27, 0.54, 0.29, 0.09, shirtMat);
    sleeve.position.y = -0.2;
    const cuff = box(0.28, 0.08, 0.3, shirtDark);
    cuff.position.y = -0.49;
    const forearm = rbox(0.21, 0.36, 0.23, 0.07, skinMat);
    forearm.position.y = -0.64;
    const hand = rbox(0.22, 0.2, 0.24, 0.07, skinMat);
    hand.position.y = -0.89;
    pivot.add(sleeve, cuff, forearm, hand);
    return pivot;
  };
  const armL = makeArm(-0.58);
  const armR = makeArm(0.58);

  // neck joins head to torso
  const neck = rbox(0.26, 0.16, 0.26, 0.05, skinShade);
  neck.position.y = 1.9;

  // rounded head with a real face on the front (+Z), plain skin elsewhere
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(face, skin), roughness: 0.8 });
  const head = new THREE.Mesh(
    new RoundedBoxGeometry(0.82, 0.78, 0.8, 3, 0.16),
    [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat],
  );
  head.castShadow = true;
  head.position.y = 2.3;
  // ears and a little nose for profile readability
  const earGeo = new RoundedBoxGeometry(0.1, 0.22, 0.2, 2, 0.03);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-0.45, 2.28, 0);
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(0.45, 2.28, 0);
  const nose = rbox(0.1, 0.12, 0.09, 0.03, skinShade);
  nose.position.set(0, 2.24, 0.42);
  // hair: rounded cap, back panel, sideburns and a fringe over the forehead
  const hairColor = [0x3a2e26, 0x1f1a17, 0x6b4a2f, 0x8a6a3f, 0xb5915a][randInt(0, 4)];
  const hairMat = mat(hairColor);
  const hairTop = rbox(0.9, 0.22, 0.88, 0.08, hairMat);
  hairTop.position.y = 2.72;
  const hairBack = rbox(0.88, 0.58, 0.2, 0.06, hairMat);
  hairBack.position.set(0, 2.42, -0.36);
  for (const sx of [-0.42, 0.42]) {
    const side = rbox(0.14, 0.42, 0.52, 0.05, hairMat);
    side.position.set(sx, 2.4, -0.08);
    g.add(side);
  }
  const fringe = rbox(0.88, 0.14, 0.14, 0.05, hairMat);
  fringe.position.set(0, 2.6, 0.36);
  g.add(legL, legR, body, armL, armR, neck, head, earL, earR, nose, hairTop, hairBack, fringe);
  const h = hatMesh(hat);
  if (h) {
    h.position.y = 2.82;
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
