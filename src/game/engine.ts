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
} from './config';
import type { EngineApi, Plot } from './state';

// ── small helpers ──────────────────────────────────────────────────────────
const mat = (color: number | string, opts: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...opts });

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
  if (level >= 2) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0x2e7d4f, { metalness: 0.4 }),
    );
    dome.position.y = 5.1 * s;
    g.add(dome);
  }
  return g;
}

function buildMesh(type: BuildingType, level: number): THREE.Group {
  switch (type) {
    case 'casino': return buildCasino(level);
    case 'mine': return buildMine(level);
    case 'shop': return buildShop(level);
    case 'bank': return buildBank(level);
  }
}

// ── NPC ────────────────────────────────────────────────────────────────────
const NPC_COLORS = [0xe0574f, 0x4f8fe0, 0x53b56d, 0xc99a3c, 0x8e6fc1, 0xd97fa8, 0x5fb8b0];

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
}

// ── the engine ─────────────────────────────────────────────────────────────
interface PlotVisual {
  marker?: THREE.Mesh;
  site?: THREE.Group;         // foundation + scaffold + block stack
  stackBlocks: THREE.Mesh[];
  building?: THREE.Group;
  popT?: number;              // scale-in animation timer
}

export class Engine implements EngineApi {
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
  private requestReward: (b: BuildingType) => void;

  constructor(
    private container: HTMLDivElement,
    cb: {
      onPlotClick: (id: number) => void;
      onBuildClick: (id: number) => void;
      requestReward: (b: BuildingType) => void;
    },
  ) {
    this.onPlotClick = cb.onPlotClick;
    this.onBuildClick = cb.onBuildClick;
    this.requestReward = cb.requestReward;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.bubbleLayer = document.createElement('div');
    this.bubbleLayer.className = 'bubble-layer';
    container.appendChild(this.bubbleLayer);

    this.scene.background = new THREE.Color(0x8fd0f0);
    this.scene.fog = new THREE.Fog(0x8fd0f0, 70, 160);

    this.camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.5, 400);
    this.camera.position.set(0, 30, 42);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, -4);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 90;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    this.buildWorld();
    this.bindEvents();
    this.loop();
  }

  // ── world construction ──────────────────────────────────────────────────
  private buildWorld() {
    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x7fae6a, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(28, 44, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    this.scene.add(sun);

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
    gt.repeat.set(30, 30);
    gt.colorSpace = THREE.SRGBColorSpace;
    gt.magFilter = THREE.NearestFilter;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: gt }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // roads: main E-W + spur to the store
    const roadMat = mat(0x5d6066, { roughness: 1 });
    const road1 = new THREE.Mesh(new THREE.PlaneGeometry(120, 6), roadMat);
    road1.rotation.x = -Math.PI / 2;
    road1.position.y = 0.02;
    road1.receiveShadow = true;
    this.scene.add(road1);
    const road2 = new THREE.Mesh(new THREE.PlaneGeometry(6, 30), roadMat);
    road2.rotation.x = -Math.PI / 2;
    road2.position.set(0, 0.02, -15);
    road2.receiveShadow = true;
    this.scene.add(road2);
    // dashed center line
    for (let x = -55; x <= 55; x += 6) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.4), mat(0xf5edc9));
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.04, 0);
      this.scene.add(dash);
    }

    // starter Blockville Store
    this.scene.add(this.makeStore());

    // decorative trees
    const treeSpots: [number, number][] = [
      [-38, -22], [38, -22], [-38, 24], [38, 24], [-46, 2], [46, 2], [-16, -22], [16, -22], [-30, 26], [30, 26],
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

    // plot markers
    for (const p of PLOT_POSITIONS) {
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 9),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(p.x, 0.06, p.z);
      marker.userData.plotId = p.id;
      this.scene.add(marker);
      this.clickTargets.set(marker.uuid, p.id);

      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(9, 9)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
      );
      border.rotation.x = -Math.PI / 2;
      border.position.set(p.x, 0.07, p.z);
      this.scene.add(border);

      this.plotVisuals.set(p.id, { marker, stackBlocks: [] });
    }
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
      if (p.type && !v.site && !v.building) this.startSite(p, v);
      if (p.type && v.site && !p.done) this.updateStack(p, v);
      if (p.done && v.site && !v.building) this.finishBuilding(p, v);
      if (v.marker) v.marker.visible = !p.type;
    }
    this.plotState = plots;
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
    // pseudo-random-but-stable stack layout, 5 per layer ring around center
    const layer = Math.floor(i / 6);
    const idx = i % 6;
    const ring = [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1], [0.8, 0.8]][idx];
    return new THREE.Vector3(ring[0] + ((layer % 2) * 0.3 - 0.15), 0.4 + layer * 0.82, ring[1] + ((layer % 3) * 0.2 - 0.2));
  }

  private updateStack(p: Plot, v: PlotVisual) {
    while (v.stackBlocks.length < p.progress && v.site) {
      const i = v.stackBlocks.length;
      const pos = this.stackPos(i);
      const colors = [0xe8b04c, 0xd97b3f, 0x9aa7b0, 0x87b9d8];
      const b = box(0.9, 0.8, 0.9, mat(colors[i % colors.length]));
      const target = pos.clone();
      b.position.set(target.x, target.y + 6, target.z); // drop in from above
      b.userData.dropT = 0;
      b.userData.targetY = target.y;
      v.site.add(b);
      v.stackBlocks.push(b);
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
        while (o && !this.clickTargets.has(o.uuid)) o = o.parent;
        if (o) {
          const id = this.clickTargets.get(o.uuid)!;
          const st = this.plotState[id];
          if (st && st.type && !st.done) this.onBuildClick(id);
          else if (!st?.type) this.onPlotClick(id);
          return;
        }
      }
    });
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // ── NPCs ────────────────────────────────────────────────────────────────
  private makeNpcMesh(): THREE.Group {
    const g = new THREE.Group();
    const color = NPC_COLORS[randInt(0, NPC_COLORS.length - 1)];
    const legL = box(0.28, 0.7, 0.28, mat(0x35415c));
    legL.position.set(-0.2, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.2;
    const body = box(0.85, 1.0, 0.5, mat(color));
    body.position.y = 1.2;
    const armL = box(0.2, 0.85, 0.24, mat(color));
    armL.position.set(-0.55, 1.25, 0);
    const armR = armL.clone();
    armR.position.x = 0.55;
    const head = box(0.75, 0.75, 0.75, mat(0xf0c8a0));
    head.position.y = 2.08;
    const hair = box(0.78, 0.2, 0.78, mat(0x3a2e26));
    hair.position.y = 2.46;
    g.add(legL, legR, body, armL, armR, head, hair);
    (g as any).legs = [legL, legR];
    return g;
  }

  private spawnVisit() {
    const done = this.plotState.filter((p) => p.done && p.type);
    if (done.length === 0) return;
    const target = done[randInt(0, done.length - 1)];
    const def = PLOT_POSITIONS.find((d) => d.id === target.id)!;
    // entrance point just in front of the building (toward the road)
    const entrance = new THREE.Vector3(def.x, 0, def.side === 'north' ? def.z + 4.6 : def.z - 4.6);
    // spawn on the road just outside the camera view so walks feel natural but short
    const laneZ = entrance.z > 0 ? 3.2 : -3.2;
    const spawn = new THREE.Vector3(
      def.x + (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 14),
      0,
      laneZ,
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
          const t = (b.userData.dropT = (b.userData.dropT ?? 0) + dt * 4);
          if (t < 1) {
            b.position.y = b.userData.targetY + 6 * (1 - Math.min(1, t));
          }
        }
      }
      if (v.building && v.popT !== undefined && v.popT < 1) {
        v.popT += dt * 2.2;
        const e = 1 - Math.pow(1 - Math.min(1, v.popT), 3);
        const overshoot = 1 + Math.sin(Math.min(1, v.popT) * Math.PI) * 0.12;
        v.building.scale.setScalar(e * overshoot);
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
      const legs: THREE.Mesh[] = (g as any).legs ?? [];
      if (n.state !== 'dwell') {
        const dir = n.target.clone().sub(g.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 0.3) {
          if (n.state === 'walk_in') {
            if (n.building) {
              n.state = 'dwell';
              this.showBubble(n, pickActivity(n.building));
              this.requestReward(n.building);
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
