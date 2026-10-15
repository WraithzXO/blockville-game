import * as THREE from 'three';
import type { FaceType, ShirtDesign } from '../game/config';

export function faceTexture(face: FaceType, skin: string): THREE.CanvasTexture {
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

// ── shirt designs: a logo printed on the front of the torso ────────────────
export function shirtTexture(design: ShirtDesign, colorHex: string): THREE.CanvasTexture | null {
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
  } else if (design === 'moon') {
    // crescent moon rocketing up over little stars
    g.fillStyle = '#f5f2e8';
    g.beginPath();
    g.arc(64, 56, 20, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = colorHex;
    g.beginPath();
    g.arc(74, 48, 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f2d54e';
    for (const [sx, sy, r] of [[30, 36, 2.5], [96, 40, 3], [40, 84, 2], [92, 82, 2.5]] as const) {
      g.beginPath();
      g.arc(sx, sy, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px sans-serif';
    g.fillText('TO THE MOON', 64, 110);
  } else if (design === 'whale') {
    // simple whale silhouette spouting
    g.fillStyle = '#3f5f8f';
    g.beginPath();
    g.moveTo(30, 66);
    g.quadraticCurveTo(56, 40, 86, 62);
    g.lineTo(94, 54);
    g.lineTo(92, 68);
    g.lineTo(82, 70);
    g.quadraticCurveTo(56, 80, 30, 66);
    g.closePath();
    g.fill();
    g.fillStyle = '#3f5f8f';
    g.fillRect(62, 38, 4, 12);
    g.fillStyle = '#8fd8ef';
    g.beginPath();
    g.arc(64, 34, 5, 0, Math.PI * 2);
    g.arc(72, 28, 4, 0, Math.PI * 2);
    g.arc(58, 27, 3.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px sans-serif';
    g.fillText('WHALE MODE', 64, 106);
  } else if (design === 'ape') {
    // ape face: brow, muzzle, nostrils
    g.fillStyle = '#7a5636';
    g.beginPath();
    g.arc(64, 58, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#a3805a';
    g.beginPath();
    g.ellipse(64, 66, 13, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4a3520';
    g.fillRect(48, 46, 12, 6);
    g.fillRect(68, 46, 12, 6);
    g.fillStyle = '#4a3520';
    g.beginPath();
    g.arc(59, 66, 2.2, 0, Math.PI * 2);
    g.arc(69, 66, 2.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = 'bold 15px sans-serif';
    g.fillText('TOGETHER STRONG', 64, 108);
  } else if (design === 'brick') {
    g.fillStyle = '#d76a43';
    for (let y = 42; y < 88; y += 14) for (let x = 34 + ((y / 14) % 2) * 8; x < 98; x += 20) g.fillRect(x, y, 16, 9);
    g.strokeStyle = 'rgba(255,255,255,0.42)'; g.lineWidth = 2; g.strokeRect(32, 38, 64, 56);
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.fillText('BRICK BUILDER', 64, 110);
  } else if (design === 'sunset') {
    const grad = g.createLinearGradient(0, 34, 0, 96); grad.addColorStop(0, '#f6c55f'); grad.addColorStop(1, '#cf5e58'); g.fillStyle = grad; g.fillRect(30, 34, 68, 62);
    g.fillStyle = '#fff0b0'; g.beginPath(); g.arc(64, 58, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 14px sans-serif'; g.fillText('SUNSET CLUB', 64, 112);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  return t;
}
