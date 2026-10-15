//# Large "Powered by ZeroTwo.ai" billboard standing behind the two stores.
// Sponsor-style roadside board: timber posts, framed panel, canvas face with
// the official ZeroTwo mark. Purely cosmetic — no interactables, no fade.
import * as THREE from 'three';
import { mat, box } from '../buildings/BuildingMaterials';
import { STORE_POS } from '../game/config';
import { addContactShadow } from '../world/WorldSky';

// Official ZeroTwo logo mark, taken from zerotwo.ai (viewBox "430 610 1190 835").
const LOGO_VIEW = { x: 430, y: 610, w: 1190, h: 835 };
const LOGO_PATHS = [
  'M 1176.42 1256.35 C 1195.58 1236.49 1216.86 1216.18 1236.6 1196.69 L 1354.48 1080.43 C 1376.19 1058.99 1418.34 1020.78 1434.17 997.22 C 1448.59 975.314 1457.26 950.128 1459.38 923.988 C 1468.9 798.901 1437.85 680.913 1323.82 618.351 C 1247.17 619.011 1173.95 650.202 1120.37 705.015 C 1057.29 768.67 1025.86 851.57 1018.59 939.981 C 1015.79 973.99 1018.02 1006.81 1016.87 1040.45 C 1014.31 1115.05 988.097 1187.22 930.592 1237.2 C 897.259 1266.67 854.413 1283.13 809.919 1283.56 C 673.377 1284.71 592.682 1149.35 595.108 1024.97 C 596.592 948.851 616.715 876.748 670.865 821.076 C 745.025 744.832 867.121 745.989 940.217 822.517 C 961.769 845.081 980.314 873.179 988.833 903.685 L 990.668 907.95 L 991.692 907.722 L 992.303 903.662 C 997.14 844.743 1023.26 785.503 1055.95 736.927 C 934.169 593.153 727.532 574.907 584.757 697.198 C 409.448 847.357 388.74 1135.58 539.033 1309.66 C 599.647 1380.77 686.222 1424.63 779.411 1431.45 C 998.199 1446.87 1158.69 1271.9 1176.42 1256.35 Z',
  'M 1138.34 1286.38 C 1161.71 1287.05 1188.04 1286.43 1211.61 1286.41 L 1354.03 1286.42 L 1516.91 1286.64 C 1547.42 1286.64 1580.35 1287.26 1610.71 1286.3 C 1609.94 1334.25 1610.69 1384.23 1610.74 1432.33 L 1466.75 1432.32 L 992.36 1432.28 L 1138.34 1286.38 Z',
];

// The billboard face: dark brand panel, ZeroTwo mark left, wordmark right.
function billboardTexture(): THREE.CanvasTexture {
  const W = 2048, H = 896;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#10182b';
  g.fillRect(0, 0, W, H);
  // soft vignette so the panel reads as lit glass rather than flat colour
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.72);
  grad.addColorStop(0, 'rgba(90,110,170,0.16)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 10;
  g.strokeRect(16, 16, W - 32, H - 32);

  // ZeroTwo mark: scale the viewBox to a 300px-tall lockup on the left
  const markH = 300;
  const s = markH / LOGO_VIEW.h;
  const markW = LOGO_VIEW.w * s;
  const mx = 150;
  g.save();
  // paths are in viewBox coordinates (x 430..1620, y 610..1445) — shift by
  // the viewBox origin so the mark really starts at mx / the vertical centre
  g.translate(mx - LOGO_VIEW.x * s, (H - markH) / 2 - LOGO_VIEW.y * s);
  g.scale(s, s);
  g.fillStyle = '#ffffff';
  for (const d of LOGO_PATHS) g.fill(new Path2D(d));
  g.restore();

  // "POWERED BY" eyebrow + wordmark, vertically centred beside the mark.
  // The wordmark is sized to actually fit the remaining panel width.
  const tx = mx + markW + 90;
  let size = Math.floor(H * 0.24);
  g.font = `bold ${size}px system-ui, sans-serif`;
  while (tx + g.measureText('ZeroTwo.ai').width > W - 120 && size > 40) {
    size -= 4;
    g.font = `bold ${size}px system-ui, sans-serif`;
  }
  const wordY = H / 2 + size * 0.36;
  g.fillStyle = '#9aa7c7';
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `bold ${Math.floor(size * 0.28)}px system-ui, sans-serif`;
  g.save();
  g.translate(tx, wordY - size * 0.78);
  // manual letterspacing: canvas has no letterSpacing in all targets
  let cx = 0;
  for (const ch of 'POWERED BY') {
    g.fillText(ch, cx, 0);
    cx += g.measureText(ch).width + 14;
  }
  g.restore();
  g.fillStyle = '#ffffff';
  g.font = `bold ${size}px system-ui, sans-serif`;
  g.fillText('ZeroTwo', tx, wordY);
  // accent-coloured ".ai"
  const zw = g.measureText('ZeroTwo').width;
  g.fillStyle = '#8b7cf6';
  g.fillText('.ai', tx + zw, H / 2 + 130);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function makeStoreBillboard(colliders: { x: number; z: number; hw: number; hd: number }[]): THREE.Group {
  const g = new THREE.Group();
  // centred behind the Blockville Store (x=0) and Furniture Store (x=+13),
  // clear of both rear walls (stores are ~7 deep, rears end near z-25.6)
  const BX = STORE_POS.x + 6.5, BZ = STORE_POS.z - 7;
  const POST_H = 8.4;
  for (const px of [-7.2, 7.2]) {
    const post = box(0.55, POST_H, 0.55, mat(0x5c3b22));
    post.position.set(px, POST_H / 2, 0);
    g.add(post);
    const cap = box(0.8, 0.3, 0.8, mat(0x4a2f1a));
    cap.position.set(px, POST_H + 0.15, 0);
    g.add(cap);
    colliders.push({ x: BX + px, z: BZ, hw: 0.4, hd: 0.4 });
  }
  // timber frame + face; the face carries the canvas artwork
  const frame = box(16.6, 7.5, 0.4, mat(0x6f4a2e));
  frame.position.set(0, 6.7, 0);
  g.add(frame);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(15.8, 6.7),
    new THREE.MeshBasicMaterial({ map: billboardTexture(), side: THREE.DoubleSide }),
  );
  face.position.set(0, 6.7, 0.23);
  g.add(face);
  // back face so the board isn't invisible from the north fence line
  const back = box(15.8, 6.7, 0.12, mat(0x8a6240));
  back.position.set(0, 6.7, -0.26);
  g.add(back);
  // low skirt between the posts so the board reads as planted, not floating
  const skirt = box(15.0, 0.35, 0.7, mat(0x8a6240));
  skirt.position.set(0, 0.2, 0);
  g.add(skirt);
  addContactShadow(g, 0, 0, 8, 0.35);
  g.position.set(BX, 0, BZ);
  return g;
}
