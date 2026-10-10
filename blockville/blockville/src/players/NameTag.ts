import * as THREE from 'three';

// compact floating name tag (always faces the camera)
export function makeNameTag(name: string, color = '#fff6dd'): { sprite: THREE.Sprite; tex: THREE.CanvasTexture; mat: THREE.SpriteMaterial } {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  let g = c.getContext('2d')!;
  g.font = 'bold 28px system-ui, sans-serif';
  // long labels (e.g. "Plot owned by <name>") widen the canvas instead of clipping
  const need = Math.ceil(g.measureText(name).width + 28);
  const CW = Math.max(256, need);
  c.width = CW;
  g = c.getContext('2d')!;
  g.font = 'bold 28px system-ui, sans-serif';
  const textWidth = Math.min(CW - 28, need);
  // dark pill behind the text so it reads against any backdrop
  const bx = (CW - textWidth) / 2;
  g.fillStyle = 'rgba(24, 16, 10, 0.78)';
  g.beginPath();
  g.moveTo(bx + 12, 12);
  g.lineTo(bx + textWidth - 12, 12);
  g.quadraticCurveTo(bx + textWidth, 12, bx + textWidth, 22);
  g.lineTo(bx + textWidth, 42);
  g.quadraticCurveTo(bx + textWidth, 52, bx + textWidth - 12, 52);
  g.lineTo(bx + 12, 52);
  g.quadraticCurveTo(bx, 52, bx, 42);
  g.lineTo(bx, 22);
  g.quadraticCurveTo(bx, 12, bx + 12, 12);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(name, CW / 2, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set((textWidth / 256) * 2.6, 0.65, 1);
  sprite.center.set(0.5, 0);
  return { sprite, tex, mat };
}
