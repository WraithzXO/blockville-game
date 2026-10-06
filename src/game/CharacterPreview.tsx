import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildCharacter } from './engine';
import type { PlayerLook } from './config';

// A small self-contained 3D viewport that shows the player's resident while
// they customise it. Slowly auto-rotates; drag to spin manually.
export default function CharacterPreview({ look }: { look: PlayerLook }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const remountRef = useRef<((look: PlayerLook) => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 2.1, 7.2);
    camera.lookAt(0, 1.35, 0);

    scene.add(new THREE.HemisphereLight(0xcfe9ff, 0x8a7a5a, 1.1));
    const key = new THREE.DirectionalLight(0xfff2d8, 1.6);
    key.position.set(3, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 0.6);
    rim.position.set(-4, 3, -4);
    scene.add(rim);

    // soft pedestal so the character feels grounded
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.9, 0.35, 28),
      new THREE.MeshStandardMaterial({ color: 0x2a3542, roughness: 0.8 }),
    );
    disc.position.y = -0.18;
    scene.add(disc);

    let character: THREE.Group | null = null;
    remountRef.current = (next: PlayerLook) => {
      if (character) scene.remove(character);
      character = buildCharacter(next);
      scene.add(character);
    };
    remountRef.current(look);

    let spin = -0.5;          // face slightly toward the camera
    let autoSpin = true;
    let dragging = false;
    let lastX = 0;

    const dom = renderer.domElement;
    dom.style.cursor = 'grab';
    dom.addEventListener('pointerdown', (e) => {
      dragging = true;
      autoSpin = false;
      lastX = e.clientX;
      dom.style.cursor = 'grabbing';
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      spin += (e.clientX - lastX) * 0.012;
      lastX = e.clientX;
    });
    const endDrag = () => {
      dragging = false;
      dom.style.cursor = 'grab';
      window.setTimeout(() => (autoSpin = true), 2500);
    };
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (autoSpin && !dragging) spin += dt * 0.7;
      if (character) character.rotation.y = spin;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      dom.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rebuild the character whenever the look changes
  useEffect(() => {
    remountRef.current?.(look);
  }, [look]);

  return <div className="char-preview" ref={hostRef} data-testid="char-preview" />;
}
