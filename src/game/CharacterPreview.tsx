import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { makeCharacterMesh } from '../players/CharacterBuilder';
import type { PlayerLook } from './config';

// Live turntable preview of your resident, rendered with the same mesh the
// game world uses — what you see here is exactly who you'll walk around as.
export default function CharacterPreview({ look }: { look: PlayerLook }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    mesh?: THREE.Group;
    raf: number;
    disposed: boolean;
  } | null>(null);

  // one renderer/scene for the lifetime of the modal
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xd8edff, 0x83b46e, 1.1));
    const sun = new THREE.DirectionalLight(0xffeecb, 1.6);
    sun.position.set(3, 6, 4);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(38, host.clientWidth / host.clientHeight, 0.1, 50);
    camera.position.set(0, 2.6, 6.4);
    camera.lookAt(0, 1.3, 0);

    // little display platform
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.7, 0.3, 28),
      new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.9 }),
    );
    disc.position.y = -0.16;
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.62, 0.05, 10, 40),
      new THREE.MeshStandardMaterial({ color: 0xe0b64a, metalness: 0.5, roughness: 0.35 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    scene.add(ring);

    const st = { renderer, scene, camera, raf: 0, disposed: false, mesh: undefined as THREE.Group | undefined };
    sceneRef.current = st;

    const clock = new THREE.Clock();
    const tick = () => {
      if (st.disposed) return;
      st.raf = requestAnimationFrame(tick);
      if (st.mesh) st.mesh.rotation.y += clock.getDelta() * 0.9;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      st.disposed = true;
      cancelAnimationFrame(st.raf);
      if (st.mesh) scene.remove(st.mesh);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // swap the mesh whenever the look changes
  useEffect(() => {
    const st = sceneRef.current;
    if (!st) return;
    if (st.mesh) st.scene.remove(st.mesh);
    st.mesh = makeCharacterMesh(look);
    st.mesh.rotation.y = 0.6;
    st.scene.add(st.mesh);
  }, [look]);

  return <div className="char-preview" ref={hostRef} data-testid="char-preview" />;
}
