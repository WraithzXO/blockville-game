// Extracted verbatim from Engine.buildWorld (Checkpoint 2, world/environment
// extraction). Behaviour-preserving: no visual or gameplay change intended.
import * as THREE from 'three';

export function buildSkyAndLights(scene: THREE.Scene): THREE.Group[] {
      // Lighting pass: a warm key sun with a cool sky fill and a warm grass
      // bounce keeps shadows readable (never black) while forms stay modelled.
      const hemi = new THREE.HemisphereLight(0xa9c4f2, 0xa89a62, 0.82);
      scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xffd8a0, 2.75);
      // the shadow frustum is centred on the town (z -34..202), not the origin
      sun.target.position.set(0, 0, 84);
      sun.position.set(-78, 40, 84 + 34);   // low sun from the left: long shadows, warm rim light
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 200;
      sun.shadow.camera.left = -125;
      sun.shadow.camera.right = 125;
      sun.shadow.camera.top = 125;
      sun.shadow.camera.bottom = -125;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.06;
      sun.shadow.radius = 3.2;
      scene.add(sun, sun.target);

      // gradient sky dome with a soft sun glow — slight detail, still stylised
      const sc = document.createElement('canvas');
      sc.width = 16;
      sc.height = 256;
      const sg = sc.getContext('2d')!;
      const grad = sg.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#6a98d6');   // soft blue overhead
      grad.addColorStop(0.45, '#a8bfe4');
      grad.addColorStop(0.7, '#e9c6c4');
      grad.addColorStop(0.88, '#f7cfa8');
      grad.addColorStop(1, '#fbdcb4');   // warm peach horizon haze (matches fog)
      sg.fillStyle = grad;
      sg.fillRect(0, 0, 16, 256);
      const skyTex = new THREE.CanvasTexture(sc);
      skyTex.colorSpace = THREE.SRGBColorSpace;
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(620, 32, 16),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
      );
      scene.add(sky);
      // a soft sun disc
      const sunDisc = new THREE.Mesh(
        new THREE.CircleGeometry(9, 24),
        new THREE.MeshBasicMaterial({ color: 0xfff4cf, transparent: true, opacity: 0.55, fog: false }),
      );
      sunDisc.position.set(-330, 52, -60);
      sunDisc.lookAt(0, 0, 0);
      scene.add(sunDisc);
      // a handful of low-poly clouds drifting slowly
      const clouds: THREE.Group[] = [];
      // soft, faceted cumulus: rounded icosahedron puffs, flat-shaded, bright and slightly
      // cool underneath so they read as clean low-poly clouds rather than boxes.
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xcfdcee, emissiveIntensity: 0.38, roughness: 1, flatShading: true, fog: false,
      });
      const puffGeo = new THREE.IcosahedronGeometry(1, 1);
      for (let i = 0; i < 7; i++) {
        const cl = new THREE.Group();
        const puffs = 5 + (i % 3);
        for (let p = 0; p < puffs; p++) {
          const t = puffs === 1 ? 0 : p / (puffs - 1) - 0.5;           // -0.5 .. 0.5 across the cloud
          const r = 3.6 - Math.abs(t) * 3.2 + ((p * 7 + i) % 3) * 0.35;  // biggest in the middle
          const puff = new THREE.Mesh(puffGeo, cloudMat);
          puff.scale.set(r * 1.15, r * 0.9, r);
          puff.position.set(t * 15, r * 0.42 + (p % 2) * 0.5, ((p + i) % 3 - 1) * 0.9);
          cl.add(puff);
          // a second, slightly smaller puff tucked beneath each crown so the
          // underside is rounded instead of a chopped flat plane
          const under = new THREE.Mesh(puffGeo, cloudMat);
          under.scale.set(r * 0.9, r * 0.55, r * 0.9);
          under.position.set(t * 15 + ((p * 5 + i) % 3 - 1) * 1.2, r * 0.08, ((p + i) % 3 - 1) * 0.9 + ((p % 2) - 0.5) * 1.4);
          cl.add(under);
        }
        cl.scale.setScalar(1.3);
        if (i < 3) {
          // a few low, far clouds that peek into the default town view
          cl.position.set(-180 + i * 90, 5 + (i % 2) * 3, -100 - i * 12);
        } else {
          cl.position.set(-150 + i * 46, 24 + (i % 3) * 8, -55 - (i % 4) * 38);
        }
        scene.add(cl);
        clouds.push(cl);
      }
  return clouds;
}

let blobTex: THREE.CanvasTexture | null = null;
// Cheap ambient-occlusion stand-in: a soft dark radial decal under an object
// so it sits on the ground instead of floating. One shared texture/material.
export function addContactShadow(scene: THREE.Scene, x: number, z: number, radius: number, opacity = 0.34): void {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(20,32,18,1)');
    gr.addColorStop(0.55, 'rgba(20,32,18,0.55)');
    gr.addColorStop(1, 'rgba(20,32,18,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    blobTex = new THREE.CanvasTexture(c);
    blobTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.045, z);
  m.renderOrder = 1;
  scene.add(m);
}
