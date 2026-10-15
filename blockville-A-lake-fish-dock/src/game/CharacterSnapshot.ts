import * as THREE from 'three';
import { makeCharacterMesh } from '../players/CharacterBuilder';
import type { PlayerLook } from './config';

// One-shot offscreen character snapshot (earnings-card chunk): renders the
// SAME mesh the game world uses into a small transparent PNG data URL. Used
// by the earnings card avatar and by the share image, so both show the
// player's actual look — never a placeholder graphic.
//
// The renderer is created, used once and torn down immediately (dispose +
// forceContextLoss) so a HUD card never holds a second live WebGL context.

export function renderCharacterSnapshot(look: PlayerLook, width = 96, height = 120): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xd8edff, 0x83b46e, 1.1));
  const sun = new THREE.DirectionalLight(0xffeecb, 1.6);
  sun.position.set(3, 6, 4);
  scene.add(sun);

  // same framing as CharacterPreview, scaled for the small canvas
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
  camera.position.set(0, 2.7, 7.0);
  camera.lookAt(0, 1.45, 0);

  const mesh = makeCharacterMesh(look);
  mesh.rotation.y = 0.6;
  scene.add(mesh);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');

  scene.remove(mesh);
  renderer.dispose();
  try { renderer.forceContextLoss(); } catch { /* already released */ }
  return url;
}
