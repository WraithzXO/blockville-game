import * as THREE from 'three';

// Compact floating name tag (always faces the camera).
// The label is drawn at 4x resolution for crisp edges, and the sprite width is
// taken from the canvas aspect ratio so the text is never squashed or stretched.
const SUPER = 4;          // text supersampling factor
const BASE_H = 64;        // logical tag height (px) used for world sizing
const WORLD_H = 0.65;     // world height of the tag sprite (unchanged from before)
const PAD = 14;           // logical horizontal padding either side of the text

export function makeNameTag(name: string, color = '#fff6dd'): { sprite: THREE.Sprite; tex: THREE.CanvasTexture; mat: THREE.SpriteMaterial } {
  const H = BASE_H * SUPER;
  const font = (px: number) => `bold ${px}px system-ui, sans-serif`;
  const c = document.createElement('canvas');
  let g = c.getContext('2d')!;
  g.font = font(28 * SUPER);
  const textW = Math.ceil(g.measureText(name).width);
  // long labels (e.g. "Plot owned by <name>") widen the canvas instead of clipping
  const CW = Math.max(256 * SUPER, textW + 2 * PAD * SUPER);
  c.width = CW;
  c.height = H;
  g = c.getContext('2d')!;
  g.font = font(28 * SUPER);

  // dark pill behind the text so it reads against any backdrop
  const x0 = (CW - (textW + 2 * PAD * SUPER)) / 2 + PAD * SUPER / 2;
  const x1 = CW - x0;
  const y0 = 12 * SUPER;
  const y1 = 52 * SUPER;
  const r = 12 * SUPER;
  g.fillStyle = 'rgba(24, 16, 10, 0.78)';
  g.beginPath();
  g.moveTo(x0 + r, y0);
  g.lineTo(x1 - r, y0);
  g.quadraticCurveTo(x1, y0, x1, y0 + r);
  g.lineTo(x1, y1 - r);
  g.quadraticCurveTo(x1, y1, x1 - r, y1);
  g.lineTo(x0 + r, y1);
  g.quadraticCurveTo(x0, y1, x0, y1 - r);
  g.lineTo(x0, y0 + r);
  g.quadraticCurveTo(x0, y0, x0 + r, y0);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, CW / 2, H / 2 + 1 * SUPER);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  // width follows the canvas aspect exactly: no distortion for any name length
  sprite.scale.set(WORLD_H * (CW / H), WORLD_H, 1);
  sprite.center.set(0.5, 0);
  return { sprite, tex, mat };
}
