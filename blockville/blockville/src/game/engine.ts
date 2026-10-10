import { makeYardFeature, makeYardFence, type FenceBlock } from '../plots/PlotDecor';
import { featureRect, type PlacedFeature } from '../plots/PlotLayout';
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
  type PlayerLook,
} from './config';
import type { EngineApi, Plot, FurniturePlacement } from './state';
import { AmbientLife, pickGreeting } from './worldLife';

// ── small helpers ──────────────────────────────────────────────────────────
import { mat, box, rbox, sign } from '../buildings/BuildingMaterials';
import { rebuildHouseInterior } from '../houses/HouseInterior';
import { makeStore, makeFurnitureStore, buildStoreInterior } from '../stores/StoreLandmarks';
import { buildMesh, placeOnPlot, constrainBuildingToPlot, FRONT_MARGIN } from '../buildings/BuildingFactory';
import { terrainH } from '../world/WorldTerrain';
import { buildSkyAndLights } from '../world/WorldSky';
import { buildGround } from '../world/WorldGround';
import { buildRoads } from '../world/WorldRoads';
import { buildFence } from '../world/WorldFence';
import { buildTownTrees, buildBoundaryTrees } from '../world/WorldTrees';
import { canWalk, groundY } from '../world/WorldTerrain';
import { buildWildernessVegetation } from '../world/WorldNature';
import { buildWindmill, buildHills, buildWilderness, buildHorizonRing, buildWelcomeGlows, buildFlowerbeds } from '../world/WorldBeyond';
import { makeCharacterMesh } from '../players/CharacterBuilder';
import { makeNameTag } from '../players/NameTag';


const UP = new THREE.Vector3(0, 1, 0);


interface Npc {
  group: THREE.Group;
  tag: THREE.Sprite;
  tagTex: THREE.CanvasTexture;
  tagMat: THREE.SpriteMaterial;
  state: 'walk_in' | 'dwell' | 'walk_out' | 'greet' | 'pause' | 'sit';
  target: THREE.Vector3;
  exit: THREE.Vector3;
  dwellLeft: number;
  bubble?: HTMLDivElement;
  speed: number;
  phase: number;
  building: BuildingType | null;
  plotId?: number;       // which plot they are visiting (for ownership checks)
  prevState?: Npc['state'];   // where a greeted/paused NPC resumes to
  greetCoolUntil: number;     // seconds — this NPC won't greet again before
  pauseLeft: number;          // ambient stop-and-look timer
  sitBench?: TownObj;         // bench an ambient NPC is sitting on
  waveT: number;              // remaining wave time while dwelling (0 = off)
  avoidSide?: number;         // +1 / -1: which way this NPC prefers to step around obstacles
  stuckT?: number;            // seconds spent making almost no progress
  detourT?: number;           // remaining seconds of a stuck-recovery sidestep
  detourDir?: THREE.Vector3;  // direction of that sidestep
}

// Wall-clock cooldowns persisted across refreshes (bins/mailboxes), keyed by position.
const CD_KEY = 'bv_obj_cd_v1';
function cdLoad(): Record<string, number> { try { return JSON.parse(localStorage.getItem(CD_KEY) || '{}'); } catch { return {}; } }
function cdKey(o: { kind: string; x: number; z: number }) { return `${o.kind}:${o.x.toFixed(1)},${o.z.toFixed(1)}`; }
function cdRemainingSec(o: { kind: string; x: number; z: number }) { const t = cdLoad()[cdKey(o)] || 0; return Math.max(0, Math.ceil((t - Date.now()) / 1000)); }
function cdStart(o: { kind: string; x: number; z: number }, sec: number) { const m = cdLoad(); m[cdKey(o)] = Date.now() + sec * 1000; try { localStorage.setItem(CD_KEY, JSON.stringify(m)); } catch { /* ignore */ } }
function cdText(sec: number) { const m = Math.floor(sec / 60), s = sec % 60; return m > 0 ? `${m}m ${s}s` : `${s}s`; }

// ── small interactive world objects (benches, mailboxes, signs, …) ──────────
type ObjKind = 'bench' | 'fountain' | 'mailbox' | 'sign' | 'trash' | 'notice' | 'shopkeeper';
interface TownObj {
  kind: ObjKind;
  group: THREE.Group;
  label: string;            // prompt verb: Sit / Open / Read / Kick / Talk…
  x: number;
  z: number;
  coolUntil: number;        // seconds of clock.elapsedTime
  data?: {
    text?: string;          // street-sign text
    lid?: THREE.Mesh;       // mailbox lid to animate
    can?: THREE.Object3D;   // trash can to wobble
    seat?: THREE.Vector3;   // bench seat position
    faceYaw?: number;       // direction to face when sitting
  };
}

// ── the engine ─────────────────────────────────────────────────────────────
interface PlotVisual {
  marker?: THREE.Mesh;
  clickPlane?: THREE.Mesh;    // dedicated invisible click target (no overlaps)
  site?: THREE.Group;         // foundation + scaffold + block stack
  stackBlocks: THREE.Mesh[];
  building?: THREE.Group;
  popT?: number;              // scale-in animation timer
  buildLevel?: number;        // level the current mesh was built for
  tag?: THREE.Sprite;         // "Plot owned by X" label
  tagTex?: THREE.CanvasTexture;
  tagMat?: THREE.SpriteMaterial;
}

// ── other connected players ────────────────────────────────────────────────
interface RemotePlayer {
  group: THREE.Group;
  tag: THREE.Sprite;
  tagTex: THREE.CanvasTexture;
  tagMat: THREE.SpriteMaterial;
  target: THREE.Vector3;      // latest server position — the mesh eases toward it
  yaw: number;                // latest server facing
  phase: number;              // leg/arm swing phase while walking
  lookKey: string;            // detect look changes without rebuilding meshes blindly
}

// compact floating name tag (always faces the camera)

export class Engine implements EngineApi {
  private clouds: THREE.Group[] = [];
  private renderer: THREE.WebGLRenderer;
  private resizeObserver?: ResizeObserver;
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
  private wanderers = 0;

  private onPlotClick: (id: number) => void;
  private onBuildClick: (id: number) => void;
  private onStoreClick: () => void;
  private onFurnitureStoreClick: () => void;
  private onArcadeOpen: () => void;
  private onNearby: (id: number | null) => void;
  private onTooFar: () => void;
  private onPrompt: (text: string | null) => void;
  private onToast: (text: string) => void;
  private onFound: (amount: number, source: string) => void;
  private onNoticeOpen: () => void;
  private onHouseEnter: (plot: number) => void;
  private onHouseExit: () => void;
  private requestReward: (b: BuildingType, level: number, plotId: number) => void;
  private storeClickPlane?: THREE.Mesh;
  private furnitureStoreClickPlane?: THREE.Mesh;
  private player?: THREE.Group;
  private playerLook: PlayerLook;
  private keys = new Set<string>();
  private vel = new THREE.Vector2(); // smoothed WASD velocity (x, z)
  private speedMult = 1;             // Speed Boots multiplier
  private inputEnabled = true;
  private nearbyId: number | null = null;
  private nearbyClock = 0;
  private plotPos = new Map<number, { x: number; z: number }>();
  private worldObjs: TownObj[] = [];
  private objColliders: { x: number; z: number; hw: number; hd: number }[] = [];
  private nearObj: TownObj | null = null;
  private nearObjDist = Infinity;
  private fpYaw = Math.PI;    // first-person look direction while inside a House
  private fpPitch = -0.05;
  private ambient?: AmbientLife;
  private flowerGroups: THREE.Group[] = [];
  private treeLeaves: THREE.Object3D[] = [];
  private storeFadeMats: THREE.MeshStandardMaterial[] = [];
  private insideStore = false;
  private furnitureFadeMats: THREE.MeshStandardMaterial[] = [];
  private insideFurnitureStore = false;
  private sitting: TownObj | null = null;
  private shopTalkAt = 0;
  private shopkeeper?: THREE.Group;
  private greetGlobalUntil = 0;
  private objFx: { mesh: THREE.Object3D; t: number; kind: 'lid' | 'wobble' }[] = [];
  private interiorGroup: THREE.Group | null = null;
  private interiorMode = false;
  private savedExit: { player: THREE.Vector3; cam: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private savedVisibility = new Map<THREE.Object3D, boolean>();
  private remotes = new Map<string, RemotePlayer>();
  private selfTag: THREE.Sprite | null = null;
  private selfTagTex: THREE.CanvasTexture | null = null;
  private selfTagMat: THREE.SpriteMaterial | null = null;
  private playerName = '';

  constructor(
    private container: HTMLDivElement,
    cb: {
      onPlotClick: (id: number) => void;
      onBuildClick: (id: number) => void;
      onStoreClick: () => void;
      onFurnitureStoreClick: () => void;
      onArcadeOpen: () => void;
      requestReward: (b: BuildingType, level: number, plotId: number) => void;
      onNearby: (id: number | null) => void;
      onTooFar: () => void;
      onPrompt: (text: string | null) => void;
      onToast: (text: string) => void;
      onFound: (amount: number, source: string) => void;
      onNoticeOpen: () => void;
      onHouseEnter: (plot: number) => void;
      onHouseExit: () => void;
    },
    look: PlayerLook,
  ) {
    this.onPlotClick = cb.onPlotClick;
    this.onBuildClick = cb.onBuildClick;
    this.onStoreClick = cb.onStoreClick;
    this.onFurnitureStoreClick = cb.onFurnitureStoreClick;
    this.onArcadeOpen = cb.onArcadeOpen;
    this.requestReward = cb.requestReward;
    this.onNearby = cb.onNearby;
    this.onTooFar = cb.onTooFar;
    this.onPrompt = cb.onPrompt;
    this.onToast = cb.onToast;
    this.onFound = cb.onFound;
    this.onNoticeOpen = cb.onNoticeOpen;
    this.onHouseEnter = cb.onHouseEnter;
    this.onHouseExit = cb.onHouseExit;
    this.playerLook = look;

    // Keep the drawing buffer available for browser screenshots and capture
    // tools. This does not change the scene or gameplay, but prevents a
    // captured frame from becoming blank after the render loop advances.
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'low-power',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.bubbleLayer = document.createElement('div');
    this.bubbleLayer.className = 'bubble-layer';
    container.appendChild(this.bubbleLayer);

    // Keep the far background deterministic even when the camera looks away
    // from the textured sky dome. The outer ground is deliberately not used
    // as a horizon or shadow catcher (see buildWorld), so it cannot turn into
    // a direction-dependent black silhouette.
    this.scene.background = new THREE.Color(0xe8d0cc);
    this.scene.fog = new THREE.Fog(0xe8d0cc, 150, 560);

    this.camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.5, 800);
    // Keep a readable third-person composition from the first rendered frame.
    // The follow loop preserves this offset while the resident walks, so the
    // player stays visible without losing the surrounding town context.
    this.camera.position.set(0, 12, 16);
    this.resizeRenderer();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.5, -8);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.32;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 170;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

    this.buildWorld();
    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.resizeRenderer());
    this.resizeObserver.observe(container);
    // third-person start: camera sits behind the resident by the store
    if (this.player) {
      // debug query params: /?sx&sz&flip=1 for inspecting the world
      const q2 = new URLSearchParams(location.search);
      const flip = q2.get('flip') === '1';
      const camd = Number(q2.get('camd') ?? 16);
      this.controls.target.copy(this.player.position);
      this.controls.target.y = 1.5;
      const elevation = Math.max(8, camd * 0.72);
      this.camera.position.set(this.player.position.x, elevation, this.player.position.z + (flip ? -camd : camd));
    }
    this.loop();
  }

  // ── real 3D House interior ─────────────────────────────────────────────
  setInterior(plot: number | null, paint: string, placements: FurniturePlacement[]) {
    if (plot === null) {
      if (!this.interiorMode) return;
      this.interiorMode = false;
      if (this.player) this.player.visible = true;
      this.controls.enabled = true;
      for (const [o, visible] of this.savedVisibility) o.visible = visible;
      this.savedVisibility.clear();
      if (this.interiorGroup) { this.scene.remove(this.interiorGroup); this.interiorGroup = null; }
      // step back outside the SAME house you entered — not the town plaza.
      // The saved world position is restored, then collisions push the
      // resident clear of the building footprint if they entered from close by.
      if (this.player && this.savedExit) {
        this.player.position.copy(this.savedExit.player);
        this.resolveCollisions(this.player.position);
        this.camera.position.copy(this.savedExit.cam);
        this.controls.target.copy(this.savedExit.target);
      } else if (this.player) {
        this.player.position.set(0, 0, 8);
        this.camera.position.set(0, 8.5, 21.5);
        this.controls.target.set(0, 1.3, 8);
      }
      this.savedExit = null;
      return;
    }
    if (!this.interiorMode) {
      this.interiorMode = true;
      if (this.player) {
        this.savedExit = {
          player: this.player.position.clone(),
          cam: this.camera.position.clone(),
          target: this.controls.target.clone(),
        };
      }
      for (const o of this.scene.children) {
        if (o !== this.player) { this.savedVisibility.set(o, o.visible); o.visible = false; }
      }
      this.interiorGroup = new THREE.Group();
      this.scene.add(this.interiorGroup);
      if (this.player) this.player.position.set(0, 0, 8.6);
      // first person: enter facing away from the door (door is +z, so look toward -z)
      this.fpYaw = Math.PI;
      if (this.player) this.player.rotation.y = Math.PI;
      this.fpPitch = -0.05;
      if (this.player) this.player.visible = false;
      this.controls.enabled = false;
      this.camera.position.set(0, 2.0, 8.6);
      this.camera.lookAt(0, 1.7, 0);
      this.camera.fov = 52.8; this.camera.updateProjectionMatrix();
    }
    const g = this.interiorGroup!;
    rebuildHouseInterior(g, paint, placements);
  }

  // ── world construction ──────────────────────────────────────────────────
  private buildWorld() {
    this.clouds = buildSkyAndLights(this.scene);

    buildGround(this.scene);

    buildRoads(this.scene);

    buildFence(this.scene);

    // starter Blockville Store
    this.scene.add(makeStore({ storeFadeMats: this.storeFadeMats }));

    // physical Furniture Store beside the central Blockville Store
    this.scene.add(makeFurnitureStore({ fadeMats: this.furnitureFadeMats, colliders: this.objColliders }));
    const furniturePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    furniturePlane.rotation.x = -Math.PI / 2;
    furniturePlane.position.set(STORE_POS.x + 13, 0.9, STORE_POS.z + 4.6);
    this.scene.add(furniturePlane);
    this.furnitureStoreClickPlane = furniturePlane;

    // store click target (invisible plane in front of the storefront)
    const storePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    storePlane.rotation.x = -Math.PI / 2;
    storePlane.position.set(STORE_POS.x, 0.9, STORE_POS.z + 4.6);
    this.scene.add(storePlane);
    this.storeClickPlane = storePlane;

    this.treeLeaves.push(...buildTownTrees(this.scene));

    buildWindmill(this.scene);
    buildHills(this.scene);
    buildWilderness(this.scene);
    buildWildernessVegetation(this.scene);

    buildHorizonRing(this.scene);

    this.treeLeaves.push(...buildBoundaryTrees(this.scene));

    buildWelcomeGlows(this.scene);

    this.flowerGroups.push(...buildFlowerbeds(this.scene));

    // ── town life: interactive objects, store interior, ambient effects ──
    this.buildTownObjects();
    buildStoreInterior({
      colliders: this.objColliders,
      worldObjs: this.worldObjs,
      makeNpcMesh: (look) => this.makeNpcMesh(look),
      onShopkeeper: (keeper) => { this.shopkeeper = keeper; },
      scene: this.scene,
    });
    const perches = this.treeLeaves.map((l) => {
      const wp = new THREE.Vector3();
      l.getWorldPosition(wp);
      wp.y += 0.9;
      return wp;
    });
    perches.push(new THREE.Vector3(STORE_POS.x, 5.3, STORE_POS.z));
    this.ambient = new AmbientLife(this.scene, {
      fountainPos: { x: 0, z: -10 },
      chimneyPos: { x: STORE_POS.x + 3.4, y: 5.75, z: STORE_POS.z - 2 },
      flowerGroups: this.flowerGroups,
      treeLeaves: this.treeLeaves,
      perchSpots: perches,
    });

    // plot markers — clipped so no marker or border ever covers a road or sidewalk
    const paved: Array<[number, number]> = [[-5.2, 5.2], [12.8, 23.2], ...[-72, -36, 36, 72, 108, 144, 180, 216].map((z): [number, number] => [z - 4.4, z + 4.4])];
    for (const p of PLOT_POSITIONS) {
      this.plotPos.set(p.id, { x: p.x, z: p.z });
      // invisible click plane — one per plot, sized to leave a clear gap between plots
      const clickPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 9),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      clickPlane.rotation.x = -Math.PI / 2;
      clickPlane.position.set(p.x, 1.1, p.z);
      clickPlane.userData.plotId = p.id;
      this.scene.add(clickPlane);
      this.clickTargets.set(clickPlane.uuid, p.id);

      // visual marker (not clickable)
      let zLo = p.z - 4.5, zHi = p.z + 4.5;
      for (const [a, b] of paved) {
        if (b <= zLo || a >= zHi) continue;
        if ((a + b) / 2 < p.z) zLo = Math.max(zLo, b); else zHi = Math.min(zHi, a);
      }
      const mH = zHi - zLo, mZ = (zHi + zLo) / 2;
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(9, mH),
        new THREE.MeshBasicMaterial({ color: 0xf2e2a8, transparent: true, opacity: 0.18 }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(p.x, 0.06, mZ);
      this.scene.add(marker);

      const border = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(9, mH)),
        new THREE.LineBasicMaterial({ color: 0xf7d46b, transparent: true, opacity: 0.9 }),
      );
      border.rotation.x = -Math.PI / 2;
      border.position.set(p.x, 0.07, mZ);
      this.scene.add(border);

      this.plotVisuals.set(p.id, { marker, stackBlocks: [] });
    }

    // the player's resident, standing by the store
    this.spawnPlayer();
  }

  private spawnPlayer() {
    if (this.player) {
      this.scene.remove(this.player);
      this.player = undefined;
    }
    const g = this.makeNpcMesh(this.playerLook);
    // optional debug override: /?sx=3&sz=66 spawns the resident anywhere
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const sx = q?.get('sx');
    const sz = q?.get('sz');
    if (sx && sz) g.position.set(Number(sx), 0, Number(sz));
    else g.position.set(STORE_POS.x + 4.5, 0, STORE_POS.z + 5.5);
    g.rotation.y = 0.4;   // angled toward the default camera
    if (this.interiorMode) g.visible = false;   // first person: never show our own body
    this.scene.add(g);
    this.player = g;
    this.attachSelfTag();
  }

  // name tag above the local player's own resident (green — "you" colour)
  private attachSelfTag() {
    if (!this.player) return;
    this.detachSelfTag();
    const made = makeNameTag(this.playerName || 'Resident', '#9dffb0');
    this.selfTag = made.sprite;
    this.selfTagTex = made.tex;
    this.selfTagMat = made.mat;
    made.sprite.position.y = 2.35;
    this.player.add(made.sprite);
  }

  private detachSelfTag() {
    if (this.selfTag) {
      this.selfTag.parent?.remove(this.selfTag);
      this.selfTagMat?.dispose();
      this.selfTagTex?.dispose();
      this.selfTag = null;
      this.selfTagTex = null;
      this.selfTagMat = null;
    }
  }

  // ── interactive town objects: plaza, benches, mailboxes, signs, cans ──────
  private buildTownObjects() {
    const addObj = (o: TownObj, col?: { hw: number; hd: number }) => {
      this.worldObjs.push(o);
      if (col) this.objColliders.push({ x: o.x, z: o.z, hw: col.hw, hd: col.hd });
    };
    const shadow = (g: THREE.Object3D) =>
      g.traverse((o2) => {
        if ((o2 as THREE.Mesh).isMesh) o2.castShadow = true;
      });

    // stone plaza around the fountain, between the store and the main road
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.6, 0.08, 28), mat(0xb9b2a4));
    plaza.position.set(0, 0.04, -10);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    const fg = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.35, 0.7, 18), mat(0x9aa3ad));
    basin.position.y = 0.35;
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(1.92, 1.92, 0.12, 18),
      mat(0x7ec3e8, { transparent: true, opacity: 0.85, roughness: 0.2 }),
    );
    water.position.y = 0.62;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.2, 10), mat(0x9aa3ad));
    pedestal.position.y = 1.1;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.62, 0.35, 14), mat(0x9aa3ad));
    bowl.position.y = 1.85;
    fg.add(basin, water, pedestal, bowl);
    fg.position.set(0, 0, -10);
    shadow(fg);
    this.scene.add(fg);
    addObj({ kind: 'fountain', group: fg, label: 'Interact', x: 0, z: -10, coolUntil: 0 }, { hw: 2.45, hd: 2.45 });

    // benches facing the fountain
    for (const [bx, faceYaw] of [[-4.9, Math.PI / 2], [4.9, -Math.PI / 2]] as const) {
      const bg = new THREE.Group();
      const seat = box(2.2, 0.14, 0.6, mat(0x9a6a3f));
      seat.position.y = 0.55;
      const back = box(2.2, 0.55, 0.12, mat(0x9a6a3f));
      back.position.set(0, 0.92, -0.3);
      const legL = box(0.14, 0.55, 0.55, mat(0x5c4326));
      legL.position.set(-0.95, 0.28, 0);
      const legR = legL.clone();
      legR.position.x = 0.95;
      bg.add(seat, back, legL, legR);
      bg.position.set(bx, 0, -10);
      bg.rotation.y = faceYaw;
      shadow(bg);
      this.scene.add(bg);
      addObj(
        {
          kind: 'bench', group: bg, label: 'Sit', x: bx, z: -10, coolUntil: 0,
          data: { seat: new THREE.Vector3(bx + (bx < 0 ? 0.3 : -0.3), 0, -10), faceYaw },
        },
        { hw: 1.25, hd: 0.55 },
      );
    }

    // town noticeboard by the plaza
    const nb = new THREE.Group();
    const postL = box(0.16, 2.5, 0.16, mat(0x7a5230));
    postL.position.set(-1.05, 1.25, 0);
    const postR = postL.clone();
    postR.position.x = 1.05;
    const board = box(2.6, 1.7, 0.12, mat(0x8a5a33));
    board.position.y = 1.8;
    nb.add(postL, postR, board);
    const papers: [number, number, number][] = [[-0.7, 2.0, 0xfff3e0], [0.15, 1.75, 0xd8ecf9], [0.55, 2.05, 0xf2d7a8]];
    for (const [px, py, col] of papers) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.6), new THREE.MeshBasicMaterial({ color: col }));
      p.position.set(px, py, 0.08);
      p.rotation.z = (Math.random() - 0.5) * 0.2;
      nb.add(p);
    }
    const nbHead = sign('TOWN NOTICEBOARD', '#33404d', 2.9, 0.6);
    nbHead.position.set(0, 2.85, 0.02);
    nb.add(nbHead);
    nb.position.set(-6.8, 0, -6.6);
    nb.rotation.y = 0.55;
    shadow(nb);
    this.scene.add(nb);
    addObj({ kind: 'notice', group: nb, label: 'Read', x: -6.8, z: -6.6, coolUntil: 0 }, { hw: 1.5, hd: 0.4 });

    // mailboxes near residential rows
    const mailboxSpots: [number, number][] = [[-19.5, -7.2], [19.5, 7.2], [-7.5, 42.2], [7.5, 101.8]];
    for (const [mx, mz] of mailboxSpots) {
      const mg = new THREE.Group();
      const post = box(0.14, 1.15, 0.14, mat(0x5c4326));
      post.position.y = 0.57;
      const bodyM = rbox(0.6, 0.45, 0.42, 0.1, mat(0x4f8fe0));
      bodyM.position.y = 1.35;
      const lid = rbox(0.6, 0.14, 0.44, 0.06, mat(0x3d6fae));
      lid.geometry.translate(0, 0, 0.2);
      lid.position.set(0, 1.58, -0.2);
      const flag = box(0.06, 0.3, 0.06, mat(0xe0574f));
      flag.position.set(0.32, 1.7, 0);
      mg.add(post, bodyM, lid, flag);
      mg.position.set(mx, 0, mz);
      shadow(mg);
      this.scene.add(mg);
      addObj(
        { kind: 'mailbox', group: mg, label: 'Open', x: mx, z: mz, coolUntil: 0, data: { lid } },
        { hw: 0.5, hd: 0.5 },
      );
    }

    // street signs at the main intersections
    const signs: [number, number, number, string][] = [
      // at the true ends of the two main streets (just inside the gate fence), facing along the road
      [-130, -6.6, Math.PI / 2, CONFIG.streetNames[0]],
      [130, -6.6, -Math.PI / 2, CONFIG.streetNames[1]],
      [-130, 24.6, Math.PI / 2, CONFIG.streetNames[2]],
      [130, 24.6, -Math.PI / 2, CONFIG.streetNames[3]],
    ];
    for (const [sx, sz, yaw, name] of signs) {
      const sg = new THREE.Group();
      const pole = box(0.14, 2.45, 0.14, mat(0x3d4450, { metalness: 0.4 }));
      pole.position.y = 1.225;
      // A shallow backing gives the sign a real block thickness. The text
      // plate sits slightly forward, so the pole terminates under the board
      // instead of visibly cutting through it.
      const backing = box(2.75, 0.78, 0.14, mat(0x244f37));
      backing.position.set(0, 2.62, -0.02);
      const plate = sign(name, '#2e6f46', 2.6, 0.66);
      plate.position.set(0, 2.62, 0.056);
      const plateBack = sign(name, '#2e6f46', 2.6, 0.66);
      plateBack.position.set(0, 2.62, -0.096);
      plateBack.rotation.y = Math.PI;
      sg.add(pole, backing, plate, plateBack);
      sg.position.set(sx, 0, sz);
      sg.rotation.y = yaw;
      shadow(sg);
      this.scene.add(sg);
      addObj({ kind: 'sign', group: sg, label: 'Read', x: sx, z: sz, coolUntil: 0, data: { text: name } });
    }

    // Deliberate roadside planting pockets keep the open strips alive without
    // spamming the town with props or narrowing the walkable roads.
    const shrubMat = mat(0x3f8a4d, { roughness: 1 });
    for (const [x, z] of [[-6.5, 26], [6.5, 26], [-6.5, 58], [6.5, 58], [-6.5, 122], [6.5, 122]] as [number, number][]) {
      const bed = box(2.2, 0.18, 1.1, mat(0x9a6a45));
      bed.position.set(x, 0.10, z);
      const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), shrubMat);
      shrub.position.set(x, 0.72, z);
      shrub.scale.set(1.2, 0.82, 0.85);
      shrub.castShadow = true;
      this.scene.add(bed, shrub);
    }

    // trash cans along the roads
    const canSpots: [number, number][] = [
      [-43.8, 6.3], [43.8, 6.3], [-52.2, 11.8], [52.2, 11.8], [-37.5, 42.2], [37.5, 100.4],
    ];
    for (const [cx, cz] of canSpots) {
      const cg = new THREE.Group();
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.95, 10), mat(0x4e6e52));
      can.position.y = 0.48;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.1, 10), mat(0x3d5a42));
      lid.position.y = 1.0;
      cg.add(can, lid);
      cg.position.set(cx, 0, cz);
      shadow(cg);
      this.scene.add(cg);
      addObj({ kind: 'trash', group: cg, label: 'Kick', x: cx, z: cz, coolUntil: 0, data: { can: cg } }, { hw: 0.5, hd: 0.5 });
    }
  }

  private standUp() {
    const s = this.sitting;
    this.sitting = null;
    if (s?.data?.seat && this.player) {
      const yaw = s.data.faceYaw ?? 0;
      this.player.position.x += Math.sin(yaw) * 1.0;
      this.player.position.z += Math.cos(yaw) * 1.0;
      this.player.position.y = 0;
    }
  }

  // ── world-object interaction (E) ──────────────────────────────────────────
  private useObject(o: TownObj) {
    const now = this.clock.elapsedTime;
    switch (o.kind) {
      case 'bench':
        this.sitting = o;
        break;
      case 'fountain': {
        if (now < o.coolUntil) break;
        o.coolUntil = now + CONFIG.town.fountainCooldownSec;
        this.ambient?.sparkle();
        const line = ['The water is cold.', 'You toss a block in. It sinks.', 'Ripples spread across the water.'][randInt(0, 2)];
        this.onToast(line);
        break;
      }
      case 'mailbox': {
        if (o.data?.lid) this.objFx.push({ mesh: o.data.lid, t: 0, kind: 'lid' });
        const mr = cdRemainingSec(o);
        if (mr > 0 || now < o.coolUntil) {
          this.onToast(`Mailbox is empty. Check back in ${cdText(mr || Math.ceil(o.coolUntil - now))}.`);
          break;
        }
        o.coolUntil = now + CONFIG.town.mailbox.cooldownSec;
        cdStart(o, CONFIG.town.mailbox.cooldownSec);
        if (Math.random() < CONFIG.town.mailbox.rewardChance) {
          this.onFound(randInt(CONFIG.town.mailbox.rewardMin, CONFIG.town.mailbox.rewardMax), 'mailbox');
        } else {
          this.onToast('Nothing today.');
        }
        break;
      }
      case 'trash': {
        if (o.data?.can) this.objFx.push({ mesh: o.data.can, t: 0, kind: 'wobble' });
        const tr = cdRemainingSec(o);
        if (tr > 0 || now < o.coolUntil) {
          this.onToast(`This bin was kicked recently. Try again in ${cdText(tr || Math.ceil(o.coolUntil - now))}.`);
          break;
        }
        o.coolUntil = now + CONFIG.town.trash.cooldownSec;
        cdStart(o, CONFIG.town.trash.cooldownSec);
        if (Math.random() < CONFIG.town.trash.rewardChance) {
          this.onFound(randInt(CONFIG.town.trash.rewardMin, CONFIG.town.trash.rewardMax), 'trash can');
        } else {
          this.onToast('Nothing but rubbish.');
        }
        break;
      }
      case 'sign':
        this.onToast(o.data?.text ?? '…');
        break;
      case 'notice':
        this.onNoticeOpen();
        break;
      case 'shopkeeper': {
        if (now < this.shopTalkAt) break;
        this.shopTalkAt = now + 3;
        const lines = ['Welcome!', 'Take a look.', 'Need something?'];
        const el = document.createElement('div');
        el.className = 'npc-bubble';
        el.textContent = lines[randInt(0, lines.length - 1)];
        const head = new THREE.Vector3(STORE_POS.x, 2.7, STORE_POS.z + 0.2).project(this.camera);
        el.style.left = `${(head.x * 0.5 + 0.5) * this.container.clientWidth}px`;
        el.style.top = `${(-head.y * 0.5 + 0.5) * this.container.clientHeight}px`;
        this.bubbleLayer.appendChild(el);
        window.setTimeout(() => el.remove(), 1200);
        window.setTimeout(() => this.onStoreClick(), 700);
        break;
      }
    }
  }

  // ── state sync from React ───────────────────────────────────────────────
  sync(plots: Plot[], _npcTarget: number) {
    for (const p of plots) {
      const v = this.plotVisuals.get(p.id);
      if (!v) continue;
      // a plot can arrive already finished (community buildings, purchased
      // plots) or as an empty claim — build whichever visual is missing
      if (p.type && !v.site && !v.building) {
        if (p.done) this.finishBuilding(p, v);
        else this.startSite(p, v);
      }
      if (p.type && v.site && !p.done) this.updateStack(p, v);
      if (p.done && v.site && !v.building) this.finishBuilding(p, v);
      if (p.done && v.building && v.buildLevel !== p.level) this.rebuildLevel(p, v);
      if (v.marker) v.marker.visible = !p.type;
      this.updatePlotTag(p, v);
    }
    this.plotState = plots;
  }

  // floating "Plot owned by X" label above claimed plots (unclaimed: none)
  private updatePlotTag(p: Plot, v: PlotVisual) {
    const label = p.ownerName ? `Plot owned by ${p.ownerName}` : null;
    if (!label) {
      if (v.tag) {
        this.scene.remove(v.tag);
        v.tagTex?.dispose();
        v.tagMat?.dispose();
        v.tag = undefined; v.tagTex = undefined; v.tagMat = undefined;
      }
      return;
    }
    if (v.tag && v.tag.userData.label === label) return;   // unchanged
    if (v.tag) {                                           // owner changed — redraw
      this.scene.remove(v.tag);
      v.tagTex?.dispose();
      v.tagMat?.dispose();
      v.tag = undefined; v.tagTex = undefined; v.tagMat = undefined;
    }
    const pos = this.plotPos.get(p.id);
    if (!pos) return;
    const made = makeNameTag(label, '#ffd98a');
    made.sprite.userData.label = label;
    made.sprite.position.set(pos.x, p.done ? 5.2 : 2.6, pos.z);
    this.scene.add(made.sprite);
    v.tag = made.sprite; v.tagTex = made.tex; v.tagMat = made.mat;
  }

  // swap in the mesh for a newly upgraded level, with the same rise-in feel
  private rebuildLevel(p: Plot, v: PlotVisual) {
    if (v.building) this.scene.remove(v.building);
    const def = PLOT_POSITIONS.find((d) => d.id === p.id)!;
    const mesh = buildMesh(p.type!, p.level);
    placeOnPlot(mesh, def);
    mesh.updateMatrixWorld(true);
    mesh.userData.footprint = new THREE.Box3().setFromObject(mesh);   // final footprint (before the pop-in scale)
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    v.building = mesh;
    v.buildLevel = p.level;
    v.popT = 0;
    this.refreshDecor(p.id);
  }

  private startSite(p: Plot, v: PlotVisual) {
    const def = PLOT_POSITIONS.find((d) => d.id === p.id)!;
    const g = new THREE.Group();
    g.userData.poles = [] as THREE.Mesh[];
    const slab = box(9, 0.35, 9, mat(0xb9b2a4));
    slab.position.y = 0.18;
    slab.receiveShadow = true;
    g.add(slab);
    // scaffold poles
    for (const [sx, sz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]] as const) {
      const pole = box(0.22, 5.4, 0.22, mat(0x8a6a3f));
      pole.position.set(sx, 2.7, sz);
      g.add(pole);
      g.userData.poles.push(pole);
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
      // translucent ghost of the finished building — shows what you're
      // building toward, and solidifies as the walls go up
      const ghost = buildMesh(p.type, p.level);
      constrainBuildingToPlot(ghost);
      ghost.updateMatrixWorld(true);
      const gbb = new THREE.Box3().setFromObject(ghost);
      ghost.position.z = -(Math.max(0, gbb.max.z - FRONT_MARGIN));   // keep the front yard clear
      const ghostMats: THREE.MeshStandardMaterial[] = [];
      ghost.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          // some meshes carry material arrays (e.g. dice faces) — handle both
          const src = m.material as THREE.Material | THREE.Material[];
          const ghostify = (mm: THREE.Material) => {
            const c = (mm as THREE.MeshStandardMaterial).clone();
            c.transparent = true;
            c.opacity = 0.1;
            c.depthWrite = false;
            ghostMats.push(c as THREE.MeshStandardMaterial);
            return c;
          };
          m.material = Array.isArray(src) ? (src.map(ghostify) as THREE.Material[]) : ghostify(src);
          m.castShadow = false;
          m.receiveShadow = false;
        }
      });
      g.add(ghost);
      g.userData.ghostMats = ghostMats;
      // a little tower crane that swings a hook while you build
      const crane = new THREE.Group();
      const mast = box(0.26, 6.8, 0.26, mat(0xd97b3f));
      mast.position.set(3.95, 3.4, -3.95);
      crane.add(mast);
      const jib = new THREE.Group();
      const jibArm = box(4.4, 0.2, 0.2, mat(0xd97b3f));
      jibArm.position.x = 1.9;
      jib.add(jibArm);
      const counter = box(0.7, 0.5, 0.5, mat(0x555f66));
      counter.position.set(-0.8, -0.1, 0);
      jib.add(counter);
      const cab = box(0.55, 0.55, 0.55, mat(0x555f66));
      jib.add(cab);
      const cable = box(0.05, 1.5, 0.05, mat(0x3d4450));
      cable.position.set(3.7, -0.85, 0);
      const hook = box(0.42, 0.42, 0.42, mat(0xe8b04c));
      hook.position.set(3.7, -1.75, 0);
      jib.add(cable, hook);
      jib.position.set(3.95, 6.9, -3.95);
      crane.add(jib);
      g.add(crane);
      g.userData.craneJib = jib;
      g.userData.craneHook = hook;
      g.userData.craneT = Math.random() * 6;
    }
    // south-side plots face the road at -z: rotate the whole site (ghost,
    // COMING SOON sign, crane) so it faces the street like the finished building
    if (def.side === 'south') g.rotation.y = Math.PI;
    g.position.set(def.x, 0, def.z);
    this.scene.add(g);
    v.site = g;
    v.stackBlocks = [];
  }

  private stackPos(i: number): THREE.Vector3 {
    // orderly courses of blocks laid like brickwork: a solid footprint per layer
    const layer = Math.floor(i / 8);
    const idx = i % 8;
    const ring = [
      [-1.15, -1.15], [0, -1.15], [1.15, -1.15],
      [-1.15, 0], [1.15, 0],
      [-1.15, 1.15], [0, 1.15], [1.15, 1.15],
    ][idx];
    // alternate layers shift half a block, like real courses of bricks
    const shift = layer % 2 ? 0.55 : 0;
    return new THREE.Vector3(ring[0] + shift * ((idx % 2) ? 0 : 1), 0.42 + layer * 0.84, ring[1]);
  }

  private updateStack(p: Plot, v: PlotVisual) {
    let queued = 0;
    while (v.stackBlocks.length < p.progress && v.site) {
      const i = v.stackBlocks.length;
      const pos = this.stackPos(i);
      // two-tone courses read as intentional brickwork rather than random blocks
      const course = Math.floor(i / 8);
      const color = course % 2 ? 0xd97b3f : 0xe8b04c;
      const b = box(1.05, 0.8, 1.05, mat(color));
      const target = pos.clone();
      b.position.set(target.x, target.y + 3.2, target.z); // drop in from above
      b.rotation.y = (Math.random() - 0.5) * 0.12;        // slight tilt while falling
      b.visible = false;                                   // appears when its turn comes
      b.userData.dropT = 0;
      b.userData.delay = queued * 0.14;                    // stagger a queued batch
      b.userData.targetY = target.y;
      b.userData.landed = false;
      v.site.add(b);
      v.stackBlocks.push(b);
      queued++;
    }
    // scaffold grows and the ghost solidifies as the build progresses
    const ud = v.site?.userData;
    if (ud && p.type) {
      const prog = Math.min(1, p.progress / BUILDING_DEFS[p.type].cost);
      if (ud.lastProg !== prog) {
        ud.lastProg = prog;
        for (const pole of ud.poles as THREE.Mesh[]) {
          const h = 5.4 * (0.45 + 0.55 * prog);
          pole.scale.y = h / 5.4;
          pole.position.y = h / 2;
        }
        for (const gm of ud.ghostMats as THREE.MeshStandardMaterial[]) gm.opacity = 0.1 + 0.22 * prog;
      }
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
    // face the road, sat back into its front yard
    placeOnPlot(mesh, def);
    mesh.updateMatrixWorld(true);
    mesh.userData.footprint = new THREE.Box3().setFromObject(mesh);   // final footprint (before the pop-in scale)
    mesh.scale.setScalar(0.01);
    this.scene.add(mesh);
    v.building = mesh;
    v.buildLevel = p.level;
    v.popT = 0;
    this.refreshDecor(p.id);
    this.spawnPuff(def.x, 1.2, def.z);
  }

  // ── interaction ─────────────────────────────────────────────────────────
  private bindEvents() {
    const dom = this.renderer.domElement;
    let downAt = 0;
    let fpDrag: { x: number; y: number } | null = null;
    dom.addEventListener('pointerdown', (e) => {
      downAt = performance.now();
      if (this.interiorMode) fpDrag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!fpDrag || !this.interiorMode) return;
      // look around: drag turns your view (and your resident) in the room
      this.fpYaw -= (e.clientX - fpDrag.x) * 0.005;
      this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - (e.clientY - fpDrag.y) * 0.004, -0.9, 1.0);
      fpDrag = { x: e.clientX, y: e.clientY };
      if (this.player) this.player.rotation.y = this.fpYaw;
    });
    window.addEventListener('pointerup', () => (fpDrag = null));
    window.addEventListener('pointercancel', () => (fpDrag = null));
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
        while (o && !(this.clickTargets.has(o.uuid) || o === this.storeClickPlane || o === this.furnitureStoreClickPlane)) o = o.parent;
        if (o === this.storeClickPlane) {
          this.onStoreClick();
          return;
        }
        if (o === this.furnitureStoreClickPlane) {
          this.onFurnitureStoreClick();
          return;
        }
        if (o) {
          const id = this.clickTargets.get(o.uuid)!;
          const st = this.plotState[id];
          if (st?.type === 'arcade' && st.done) { this.onArcadeOpen(); return; }
          // you have to walk up to a plot to interact with it
          if (!this.plotPos.has(id) || this.nearPlotDist(id) > CONFIG.interactRadius) {
            this.onTooFar();
            return;
          }
          if (st && st.type && !st.done) this.onBuildClick(id);
          else if (!st?.type || st.owner === 'you') this.onPlotClick(id);
          return;
        }
      }
    });
    // WASD / arrows walk the resident — camera-relative, ignored while typing
    const walkKey = (k: string) =>
      ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k);
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      const typing =
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing || !this.inputEnabled || e.repeat) return;
      const k = e.key.toLowerCase();
      // E: stand up first, otherwise interact with the nearest thing —
      // world objects win when the resident is closer to them than to a plot
      if (k === 'e') {
        if (this.interiorMode) { this.onHouseExit(); return; }
        if (this.sitting) {
          this.standUp();
          return;
        }
        const furnitureDist = this.player ? Math.hypot(this.player.position.x - (STORE_POS.x + 13), this.player.position.z - STORE_POS.z) : Infinity;
        if (furnitureDist <= 6.2) {
          this.onFurnitureStoreClick();
          return;
        }
        if (this.nearObj) {
          const plotD = this.nearbyId !== null ? this.nearPlotDist(this.nearbyId) : Infinity;
          if (this.nearObjDist <= plotD) {
            this.useObject(this.nearObj);
            return;
          }
        }
        if (this.nearbyId !== null) {
          const st = this.plotState[this.nearbyId];
          if (st?.type === 'arcade' && st.done) { this.onArcadeOpen(); return; }
          if (st?.type === 'house' && st.done) { this.onHouseEnter(this.nearbyId); return; }
          if (st && st.type && !st.done) this.onBuildClick(this.nearbyId);
          else if (!st?.type || st.owner === 'you') this.onPlotClick(this.nearbyId);
        }
        return;
      }
      if (walkKey(k)) {
        if (this.sitting) this.standUp(); // any move key stands you up
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('resize', this.onResize);
  }

  // modals pause movement so keys never fight with form inputs
  setInputEnabled(v: boolean) {
    this.inputEnabled = v;
    if (!v) this.keys.clear();
  }

  private nearPlotDist(id: number): number {
    if (!this.player) return Infinity;
    const p = this.plotPos.get(id);
    if (!p) return Infinity;
    const dx = this.player.position.x - p.x;
    const dz = this.player.position.z - p.z;
    return Math.hypot(dx, dz);
  }

  // keep the resident out of solid buildings (sites stay walkable)
  private resolveCollisions(pos: THREE.Vector3) {
    const pad = 0.45;
    const check = (cx: number, cz: number, hw: number, hd: number) => {
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const px = hw + pad - Math.abs(dx);
      const pz = hd + pad - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) pos.x = cx + Math.sign(dx || 1) * (hw + pad);
        else pos.z = cz + Math.sign(dz || 1) * (hd + pad);
      }
    };
    // store walls as four thin strips with an open doorway at the front
    // centre — the one building in town you can walk into
    if (Math.abs(pos.x - STORE_POS.x) > 0.95) {
      const side = pos.x < STORE_POS.x ? -1 : 1;
      check(STORE_POS.x + side * 2.9, STORE_POS.z + 3.5, 2.0, 0.42);
    }
    check(STORE_POS.x, STORE_POS.z - 3.5, 4.8, 0.42);
    check(STORE_POS.x - 4.8, STORE_POS.z, 0.42, 3.8);
    check(STORE_POS.x + 4.8, STORE_POS.z, 0.42, 3.8);
    // Furniture Store shell beside the central shop, with a front doorway.
    const furnitureX = STORE_POS.x + 13;
    if (Math.abs(pos.x - furnitureX) > 0.9) {
      const side = pos.x < furnitureX ? -1 : 1;
      check(furnitureX + side * 2.9, STORE_POS.z + 3.5, 2.0, 0.42);
    }
    check(furnitureX, STORE_POS.z - 3.5, 4.8, 0.42);
    check(furnitureX - 4.8, STORE_POS.z, 0.42, 3.8);
    check(furnitureX + 4.8, STORE_POS.z, 0.42, 3.8);
    for (const c of this.objColliders) check(c.x, c.z, c.hw, c.hd);
    for (const p of this.plotState) {
      if (!p.done || !p.type) continue;
      const d = this.plotPos.get(p.id);
      if (d) check(d.x, d.z, 4.3, 4.3);
    }
  }


  // is a point inside a solid prop (bin, bench, fountain, sign…) with a little NPC clearance?
  private npcBlockedAt(x: number, z: number): boolean {
    for (const c of this.objColliders) if (Math.abs(x - c.x) < c.hw + 0.55 && Math.abs(z - c.z) < c.hd + 0.55) return true;
    return false;   // buildings are already handled by keepNpcOutOfBuildings
  }

  // desired heading, bent to the free side when something solid is right ahead
  private npcSteer(pos: THREE.Vector3, dir: THREE.Vector3, side: number): THREE.Vector3 {
    const look = 1.4;
    if (!this.npcBlockedAt(pos.x + dir.x * look, pos.z + dir.z * look)) return dir.clone();
    for (const a of [0.7, 1.2, 1.7]) for (const s of [side, -side]) {
      const c = Math.cos(a * s), sn = Math.sin(a * s);
      const d = new THREE.Vector3(dir.x * c - dir.z * sn, 0, dir.x * sn + dir.z * c);
      if (!this.npcBlockedAt(pos.x + d.x * look, pos.z + d.z * look)) return d;
    }
    return dir.clone();
  }

  // NPCs follow straight lines along the building rows, so instead of the
  // resident's min-axis push they are slid out toward the street side of any
  // solid building they touch, then run through the shared wall/prop colliders.
  private keepNpcOutOfBuildings(pos: THREE.Vector3) {
    const half = 4.3 + 0.35;
    for (const p of this.plotState) {
      if (!p.done || !p.type) continue;
      const d = this.plotPos.get(p.id);
      if (!d) continue;
      const dx = pos.x - d.x;
      const dz = pos.z - d.z;
      if (Math.abs(dx) < half && Math.abs(dz) < half) {
        const def = PLOT_POSITIONS.find((q) => q.id === p.id);
        const front = def && def.side === 'north' ? 1 : -1;
        pos.z = d.z + (Math.abs(dz) < 0.05 ? front : Math.sign(dz)) * half;
      }
    }
    this.resolveCollisions(pos);
  }

  private resizeRenderer() {
    const w = Math.max(1, this.container.clientWidth || this.container.getBoundingClientRect().width || window.innerWidth);
    const h = Math.max(1, this.container.clientHeight || this.container.getBoundingClientRect().height || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // Keep CSS layout responsive; only update the drawing buffer here.
    this.renderer.setSize(w, h, false);
  }

  private onResize = () => this.resizeRenderer();

  // ── NPCs ────────────────────────────────────────────────────────────────
  private makeNpcMesh(look?: PlayerLook): THREE.Group {
    return makeCharacterMesh(look);
  }

  setLook(look: PlayerLook) {
    this.playerLook = look;
    // keep the resident where they were standing — only the look changes
    const pos = this.player?.position.clone();
    const rot = this.player?.rotation.y ?? 0.4;
    this.spawnPlayer();
    if (this.player && pos) {
      this.player.position.copy(pos);
      this.player.rotation.y = rot;
    }
  }

  setSpeedMult(mult: number) {
    this.speedMult = mult;
  }

  get currentSpeedMult() {
    return this.speedMult;
  }

  // world -> CSS pixel position (used by dev tooling and tests)
  screenPos(x: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, 1, z).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-v.y * 0.5 + 0.5) * this.container.clientHeight,
    };
  }

  // dev/testing: move the camera to a given distance from its target
  setCamDist(dist: number) {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
  }

  camDistance(): number {
    return this.camera.position.distanceTo(this.controls.target);
  }

  // dev/testing: current store shell opacity while inside
  shellOpacity(): number[] {
    return this.storeFadeMats.map((m) => Number(m.opacity.toFixed(3)));
  }

  insideStoreNow(): boolean {
    return this.insideStore;
  }

  playerPos(): { x: number; z: number; ry: number } {
    // while inside a House the player mesh carries local room coordinates —
    // report the saved world position so the network keeps you where you were
    if (this.interiorMode && this.savedExit) {
      return { x: this.savedExit.player.x, z: this.savedExit.player.z, ry: this.player?.rotation.y ?? 0 };
    }
    return this.player
      ? { x: this.player.position.x, z: this.player.position.z, ry: this.player.rotation.y }
      : { x: 0, z: 0, ry: 0 };
  }

  // Capture the latest fully rendered game frame for screenshots and browser
  // capture tooling. Rendering remains unchanged; callers receive a data URL
  // only after the normal render loop has produced the current frame.
  captureScreenshot(): string {
    return this.renderer.domElement.toDataURL('image/png');
  }

  // ── other connected players ──────────────────────────────────────────────
  // Join: create their character with a name tag. Look changes rebuild the
  // mesh in place. Positions ease toward the latest server value so movement
  // feels smooth even at the ~10 Hz update rate.
  upsertRemote(id: string, name: string, look: PlayerLook | null, x: number, z: number, ry = 0) {
    const existing = this.remotes.get(id);
    const lookKey = JSON.stringify(look ?? null);
    if (existing) {
      existing.target.set(x, 0, z);
      existing.yaw = ry;
      if (existing.lookKey !== lookKey) this.rebuildRemote(id, name, look, lookKey);
      else if (existing.tag.userData.name !== name) {
        this.retagRemote(existing, name);
      }
      return;
    }
    const group = makeCharacterMesh(look ?? undefined);
    group.position.set(x, 0, z);
    group.rotation.y = ry;
    const made = makeNameTag(name || 'Resident');
    made.sprite.position.y = 2.35;
    made.sprite.userData.name = name;
    group.add(made.sprite);
    this.scene.add(group);
    this.remotes.set(id, {
      group,
      tag: made.sprite,
      tagTex: made.tex,
      tagMat: made.mat,
      target: new THREE.Vector3(x, 0, z),
      yaw: ry,
      phase: 0,
      lookKey,
    });
  }

  moveRemote(id: string, x: number, z: number, ry = 0) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.target.set(x, 0, z);
    r.yaw = ry;
  }

  // look-only update — rebuild the mesh, keep the current position
  updateRemoteLook(id: string, look: PlayerLook | null) {
    const r = this.remotes.get(id);
    if (!r) return;
    const lookKey = JSON.stringify(look ?? null);
    if (r.lookKey === lookKey) return;
    const pos = r.group.position.clone();
    const rot = r.group.rotation.y;
    this.scene.remove(r.group);
    const group = makeCharacterMesh(look ?? undefined);
    group.position.copy(pos);
    group.rotation.y = rot;
    this.scene.add(group);
    r.group = group;
    r.lookKey = lookKey;
    this.retagRemote(r, String(r.tag.userData.name ?? 'Resident'));
  }

  remoteName(id: string): string | null {
    const r = this.remotes.get(id);
    return r ? String(r.tag.userData.name ?? '') || null : null;
  }

  renameRemote(id: string, name: string) {
    const r = this.remotes.get(id);
    if (r) this.retagRemote(r, name);
  }

  removeRemote(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.group);
    r.tagMat.dispose();
    r.tagTex.dispose();
    this.remotes.delete(id);
  }

  setSelfName(name: string) {
    this.playerName = name;
    this.attachSelfTag();
  }

  private retagRemote(r: RemotePlayer, name: string) {
    r.group.remove(r.tag);
    r.tagMat.dispose();
    r.tagTex.dispose();
    const made = makeNameTag(name || 'Resident');
    made.sprite.position.y = 2.35;
    made.sprite.userData.name = name;
    r.group.add(made.sprite);
    r.tag = made.sprite;
    r.tagTex = made.tex;
    r.tagMat = made.mat;
  }

  private rebuildRemote(id: string, name: string, look: PlayerLook | null, lookKey: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    const pos = r.group.position.clone();
    const rot = r.group.rotation.y;
    this.scene.remove(r.group);
    const group = makeCharacterMesh(look ?? undefined);
    group.position.copy(pos);
    group.rotation.y = rot;
    this.scene.add(group);
    r.group = group;
    r.lookKey = lookKey;
    // tag lives on the old group — reattach it to the fresh one
    this.retagRemote(r, r.tag.userData.name ?? name);
  }

  // ease remote meshes toward their latest server positions and swing limbs
  private stepRemotes(dt: number) {
    for (const [, r] of this.remotes) {
      const dist = r.group.position.distanceTo(r.target);
      if (dist > 12) {
        // teleport-sized jump (reconnect, respawn) — snap instead of glide
        r.group.position.copy(r.target);
      } else if (dist > 0.02) {
        const k = Math.min(1, dt * 9);
        r.group.position.x += (r.target.x - r.group.position.x) * k;
        r.group.position.z += (r.target.z - r.group.position.z) * k;
        r.phase += dt * 11;
        const swing = Math.sin(r.phase) * 0.62;
        const legs = r.group.userData.legs as THREE.Mesh[] | undefined;
        const arms = r.group.userData.arms as THREE.Mesh[] | undefined;
        if (legs) {
          legs[0].rotation.x = swing;
          legs[1].rotation.x = -swing;
        }
        if (arms) {
          arms[0].rotation.x = -swing * 0.7;
          arms[1].rotation.x = swing * 0.7;
        }
      } else {
        const legs = r.group.userData.legs as THREE.Mesh[] | undefined;
        const arms = r.group.userData.arms as THREE.Mesh[] | undefined;
        if (legs) {
          legs[0].rotation.x *= 0.8;
          legs[1].rotation.x *= 0.8;
        }
        if (arms) {
          arms[0].rotation.x *= 0.8;
          arms[1].rotation.x *= 0.8;
        }
      }
      // face movement direction, eased
      let dy = r.yaw - r.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      r.group.rotation.y += dy * Math.min(1, dt * 10);
    }
  }

  // mirror a plot's placed yard features (garden bed, statue, fence ...) into the world.
  // Features live in plot-local (u along the street, v toward the street) coordinates.
  setPlotDecor(plotId: number, features: PlacedFeature[]) {
    const pos = this.plotPos.get(plotId);
    if (!pos) return;
    this.decorFeatures.set(plotId, features);
    const hasFence = features.some((f) => f.kind === 'fence');
    const sig = features.map((f) => f.id + f.kind + f.u + ',' + f.v).join('|') + (hasFence ? JSON.stringify(this.buildingBlockLocal(plotId)) : '');
    const old = this.gardenVisuals.get(plotId);
    if (old && old.userData.sig === sig) return;
    if (old) this.scene.remove(old);
    this.gardenVisuals.delete(plotId);
    if (!features.length) return;
    const def = PLOT_POSITIONS.find((d) => d.id === plotId);
    const g = new THREE.Group();
    g.userData.sig = sig;
    for (const f of features) {
      if (f.kind === 'fence') {
        // sections that would pass through the building OR any other placed yard piece (bench, lamp, planter...) are left out,
        // so nothing ever clips into the pickets
        const blocks: FenceBlock[] = [];
        const bb = this.buildingBlockLocal(plotId);
        if (bb) blocks.push(bb);
        for (const o of features) if (o.kind !== 'fence') { const r = featureRect(o); blocks.push({ u0: o.u - r.hw + 0.2, u1: o.u + r.hw - 0.2, v0: o.v - r.hd + 0.2, v1: o.v + r.hd - 0.2 }); }   // exact footprint (the fence adds its own 0.2 pad)
        g.add(makeYardFence(blocks));
        continue;
      }
      const m = makeYardFeature(f.kind);
      m.position.set(f.u, 0, f.v);
      g.add(m);
    }
    g.position.set(pos.x, 0, pos.z);
    if (def && def.side === 'south') g.rotation.y = Math.PI;
    this.scene.add(g);
    this.gardenVisuals.set(plotId, g);
  }

  private gardenVisuals = new Map<number, THREE.Group>();
  private decorFeatures = new Map<number, PlacedFeature[]>();
  private refreshDecor(id: number) { const f = this.decorFeatures.get(id); if (f) this.setPlotDecor(id, f); }

  // the plot's building footprint in plot-local (u along the street, v toward the street) coordinates,
  // so the yard fence can stop at the building instead of cutting through it
  private buildingBlockLocal(plotId: number): FenceBlock | null {
    const v = this.plotVisuals.get(plotId)?.building;
    const pos = this.plotPos.get(plotId);
    const def = PLOT_POSITIONS.find((d) => d.id === plotId);
    if (!v || !pos || !def) return null;
    v.updateMatrixWorld(true);
    const bb = (v.userData.footprint as THREE.Box3 | undefined) ?? new THREE.Box3().setFromObject(v);
    const s = def.side === 'south' ? -1 : 1;
    const u0 = (bb.min.x - pos.x) * s, u1 = (bb.max.x - pos.x) * s;
    const v0 = (bb.min.z - pos.z) * s, v1 = (bb.max.z - pos.z) * s;
    return { u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1) };
  }

  // pooled dust puffs for block landings and build completions
  private puffs: { mesh: THREE.Mesh; t: number }[] = [];
  private puffGeo = new THREE.SphereGeometry(0.3, 8, 6);

  private spawnPuff(x: number, y: number, z: number) {
    if (this.puffs.length >= 14) return;
    const m = new THREE.Mesh(
      this.puffGeo,
      new THREE.MeshStandardMaterial({ color: 0xf5f0e6, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    m.position.set(x, y, z);
    this.scene.add(m);
    this.puffs.push({ mesh: m, t: 0 });
  }

  // dev/testing: lay out every building type at levels 1..4 for visual review
  devShowcase(ox: number, oz: number) {
    const types: BuildingType[] = ['house', 'shop', 'cafe', 'bakery', 'bank', 'arcade', 'casino', 'mine', 'park'];
    types.forEach((t, i) => {
      for (let lv = 1; lv <= 4; lv++) {
        const m = buildMesh(t, lv);
        m.position.set(ox + (lv - 1) * 14, 0, oz + i * 30); m.rotation.y = Math.PI;
        this.scene.add(m);
      }
    });
  }
  // dev/testing: place the resident at a world position instantly
  // dev/testing: park the resident and aim the camera (dev hook only)
  devMeasure() {
    const out: string[] = [];
    for (const t of ['house','shop','bank','cafe','bakery','arcade','casino','mine'] as BuildingType[]) for (let l = 1; l <= 4; l++) {
      const m = buildMesh(t, l); m.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m); const sz = new THREE.Vector3(); bb.getSize(sz);
      const fit = Math.min(1, 11.2 / sz.x, 12.2 / sz.z);
      out.push(`${t} L${l} w=${sz.x.toFixed(1)} d=${sz.z.toFixed(1)} h=${sz.y.toFixed(1)} fit=${fit.toFixed(2)} zMin=${bb.min.z.toFixed(1)} zMax=${bb.max.z.toFixed(1)}`);
    }
    return out;
  }
  devView(x: number, z: number, ang: number, dist: number, elev: number) {
    this.teleport(x, z);
    this.controls.target.set(x, 2.2, z);
    this.camera.position.set(x + Math.sin(ang) * dist, elev, z + Math.cos(ang) * dist);
    this.controls.update();
  }
  devNpcs() { return this.npcs.map((n) => ({ x: n.group.position.x, z: n.group.position.z, s: n.state })); }

  devPlotInfo(id: number) {
    const p = this.plotState.find((q) => q.id === id);
    const v = this.plotVisuals.get(id);
    if (!p || !v?.building) return { tag: v?.tag?.userData.label ?? null, type: p?.type ?? null, mesh: null };
    const bb = new THREE.Box3().setFromObject(v.building);
    const sz = new THREE.Vector3(); bb.getSize(sz);
    const c = bb.getCenter(new THREE.Vector3());
    return { tag: v.tag?.userData.label ?? null, type: p.type, level: p.level, pos: { x: +c.x.toFixed(1), y: +c.y.toFixed(1), z: +c.z.toFixed(1) }, mesh: { w: +sz.x.toFixed(1), h: +sz.y.toFixed(1), d: +sz.z.toFixed(1) }, visible: v.building.visible };
  }
  teleport(x: number, z: number) {
    if (this.player) {
      this.player.position.set(x, x > CONFIG.worldRect.maxX ? groundY(x, z) : 0, z);
      this.controls.target.set(x, 1.3, z);
    }
  }
  private spawnVisit() {
    const done = this.plotState.filter((p) => p.done && p.type);
    if (done.length === 0) return;
    // Visitors favour the player's own buildings (~40% of visits) so the
    // core loop — build it, people come, fees flow — stays front and centre.
    const mine = done.filter((p) => p.owner === 'you');
    const target =
      mine.length && Math.random() < 0.4 ? mine[randInt(0, mine.length - 1)] : done[randInt(0, done.length - 1)];
    const def = PLOT_POSITIONS.find((d) => d.id === target.id)!;
    // entrance point just in front of the building (toward the road)
    const entrance = new THREE.Vector3(def.x, 0, def.side === 'north' ? def.z + 4.6 : def.z - 4.6);
    // spawn along the same building row so walks stay on the frontage
    const spawn = new THREE.Vector3(
      def.x + (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 14),
      0,
      entrance.z,
    );
    const mesh = this.makeNpcMesh();
    mesh.position.copy(spawn);
    const npcTag = makeNameTag('NPC', '#ffd66b');
    npcTag.sprite.position.y = 2.35;
    npcTag.sprite.renderOrder = 12;
    npcTag.sprite.frustumCulled = false;
    mesh.add(npcTag.sprite);
    this.scene.add(mesh);
    const npc: Npc = {
      group: mesh,
      tag: npcTag.sprite,
      tagTex: npcTag.tex,
      tagMat: npcTag.mat,
      state: 'walk_in',
      target: entrance,
      exit: spawn,
      dwellLeft: CONFIG.bubbleTimeMin + Math.random() * (CONFIG.bubbleTimeMax - CONFIG.bubbleTimeMin),
      speed: 4.5 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      building: target.type,
      plotId: target.id,
      greetCoolUntil: 0,
      pauseLeft: 0,
      waveT: 0,
    };
    this.npcs.push(npc);
  }

  private spawnWanderer() {
    const mesh = this.makeNpcMesh();
    const z = 3.2 * (Math.random() < 0.5 ? 1 : -1);
    mesh.position.set(-40 + Math.random() * 80, 0, z);
    const npcTag = makeNameTag('NPC', '#ffd66b');
    npcTag.sprite.position.y = 2.35;
    npcTag.sprite.renderOrder = 12;
    npcTag.sprite.frustumCulled = false;
    mesh.add(npcTag.sprite);
    this.scene.add(mesh);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const npc: Npc = {
      group: mesh,
      tag: npcTag.sprite,
      tagTex: npcTag.tex,
      tagMat: npcTag.mat,
      state: 'walk_in',
      target: new THREE.Vector3(dir > 0 ? 48 : -48, 0, z),
      exit: new THREE.Vector3(dir > 0 ? -48 : 48, 0, z),
      dwellLeft: 0,
      speed: 2.0 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      building: null,
      greetCoolUntil: 0,
      pauseLeft: 0,
      waveT: 0,
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

  // NPCs may only leave the world once the player can't see them; if one reaches its
  // exit while still on screen it simply keeps walking a little further (bounded).
  private keepWalkingIfSeen(n: Npc, dir: THREE.Vector3): boolean {
    const ext = (n as unknown as { exitExt?: number }).exitExt ?? 0;
    if (ext >= 6) return false;
    const p = n.group.position.clone();
    p.y = 1.5;
    const ndc = p.project(this.camera);
    const seen = ndc.z < 1 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1;
    if (!seen) return false;
    const away = new THREE.Vector3(Math.sign(n.group.position.x) || 1, 0, 0);   // continue outward along the street
    n.target = n.group.position.clone().addScaledVector(away, 18);
    n.target.y = 0;
    n.state = 'walk_out';
    (n as unknown as { exitExt?: number }).exitExt = ext + 1;
    return true;
  }

  private removeNpc(npc: Npc, index: number) {
    if (npc.bubble) npc.bubble.remove();
    this.scene.remove(npc.group);
    npc.tagMat.dispose();
    npc.tagTex.dispose();
    this.npcs.splice(index, 1);
  }

  // ── per-frame ───────────────────────────────────────────────────────────
  private step(dt: number) {
    this.stepRemotes(dt);

    // mailbox lids easing open, kicked cans wobbling still
    for (let i = this.objFx.length - 1; i >= 0; i--) {
      const f = this.objFx[i];
      f.t += dt;
      if (f.kind === 'lid') {
        f.mesh.rotation.x = -1.9 * Math.min(1, f.t * 3.2);
        if (f.t > 2.0) {
          f.mesh.rotation.x = 0;
          this.objFx.splice(i, 1);
        }
      } else {
        const decay = Math.max(0, 1 - f.t * 1.6);
        f.mesh.rotation.z = Math.sin(f.t * 15) * 0.28 * decay;
        if (f.t > 1.2) {
          f.mesh.rotation.z = 0;
          this.objFx.splice(i, 1);
        }
      }
    }

    // block drop-in animation
    for (const [, v] of this.plotVisuals) {
      if (v.site) {
        for (const b of v.stackBlocks) {
          // queued blocks wait their turn, then drop smoothly into place
          if (b.userData.delay > 0) {
            b.userData.delay -= dt;
            b.visible = b.userData.delay <= 0;
            if (!b.visible) continue;
          }
          const t = (b.userData.dropT = (b.userData.dropT ?? 0) + dt * 2.2);
          const targetY = b.userData.targetY;
          if (t < 1) {
            // smooth ease-in-out fall
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            b.position.y = targetY + 3.2 * (1 - e);
          } else if (!b.userData.landed) {
            b.userData.landed = true;
            b.userData.bounceT = 0;
            const wp = new THREE.Vector3();
            b.getWorldPosition(wp);
            this.spawnPuff(wp.x, wp.y + 0.3, wp.z);
          } else if (b.userData.bounceT < 1) {
            // impact: small squash-and-settle so blocks feel weighted
            b.userData.bounceT = Math.min(1, b.userData.bounceT + dt * 5);
            const bt = b.userData.bounceT;
            const sq = Math.sin(bt * Math.PI) * 0.16;
            b.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
            b.position.y = targetY + Math.sin(bt * Math.PI) * 0.18;
            b.rotation.y *= Math.max(0, 1 - dt * 7);
            if (bt >= 1) {
              b.scale.set(1, 1, 1);
              b.rotation.y = 0;
              b.position.y = targetY;
            }
          }
        }
        // the site crane swings its hook while the crew works
        const sud = v.site.userData;
        if (sud.craneJib) {
          sud.craneT += dt;
          sud.craneJib.rotation.y = Math.sin(sud.craneT * 0.45) * 0.9;
          sud.craneHook.position.y = -1.75 - Math.abs(Math.sin(sud.craneT * 0.8)) * 0.55;
        }
      }
      if (v.building && v.popT !== undefined && v.popT < 1) {
        v.popT += dt * 1.7;
        const e = 1 - Math.pow(1 - Math.min(1, v.popT), 3);
        const overshoot = 1 + Math.sin(Math.min(1, v.popT) * Math.PI) * 0.07;
        const fit = (v.building.userData.fitScale as number | undefined) ?? 1;
        v.building.scale.setScalar(e * overshoot * fit);
        // rise out of the ground instead of popping out of nowhere
        v.building.position.y = -(1 - e) * 1.4;
        if (v.popT >= 1) {
          v.building.scale.setScalar(fit);
          v.building.position.y = 0;
        }
      }
    }

    // dust puffs fade out and are recycled
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const pf = this.puffs[i];
      pf.t += dt * 2.6;
      pf.mesh.scale.setScalar(0.5 + pf.t * 1.6);
      (pf.mesh.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - pf.t);
      if (pf.t >= 1) {
        this.scene.remove(pf.mesh);
        (pf.mesh.material as THREE.Material).dispose();
        this.puffs.splice(i, 1);
      }
    }

    // NPC visits scheduler
    this.nextVisitAt -= dt;
    if (this.nextVisitAt <= 0) {
      this.nextVisitAt = CONFIG.npcIntervalMin + Math.random() * (CONFIG.npcIntervalMax - CONFIG.npcIntervalMin);
      const visitors = this.npcs.filter((n) => n.building).length;
      const builtCount = this.plotState.filter((p) => p.done).length;
      const wantVisitors = Math.max(1, Math.min(10, Math.round(builtCount * CONFIG.npcPerBuilding)));
      // visitors pause while the resident is inside a House: new NPC groups
      // would be added after the interior visibility snapshot and show through
      if (!this.interiorMode && builtCount > 0 && visitors < wantVisitors) this.spawnVisit();
      if (this.wanderers < 2) {
        // the main street always has a little foot traffic, even before the
        // player builds anything — the starting area should never feel dead
        this.wanderers++;
        this.spawnWanderer();
      }
    }

    // NPC movement
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      const g = n.group;
      const legs: THREE.Mesh[] = g.userData.legs ?? [];
      if (n.state === 'walk_in' || n.state === 'walk_out') {
        const dir = n.target.clone().sub(g.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 0.3) {
          if (n.state === 'walk_in') {
            if (n.building) {
              n.state = 'dwell';
              this.showBubble(n, pickActivity(n.building));
              n.waveT = Math.random() < 0.18 ? 1.3 : 0;   // occasional friendly wave
              // only the player's own buildings pay them fees — resident
              // buildings are visual flavour for the town economy
              const plot = this.plotState.find((q) => q.id === n.plotId);
              if (plot?.owner === 'you') this.requestReward(n.building, plot.level, plot.id);
            } else {
              if (this.keepWalkingIfSeen(n, dir)) continue;
              this.removeNpc(n, i); // wanderer reached map edge, out of sight
              this.wanderers = Math.max(0, this.wanderers - 1);
              continue;
            }
          } else {
            if (this.keepWalkingIfSeen(n, dir)) continue;
            if (!n.building) this.wanderers = Math.max(0, this.wanderers - 1);
            this.removeNpc(n, i);
            continue;
          }
        } else {
          dir.normalize();
          // lightweight obstacle avoidance: look a step ahead and bend around props / buildings
          if (n.avoidSide === undefined) n.avoidSide = Math.random() < 0.5 ? 1 : -1;
          const steer = dist > 2.5 ? this.npcSteer(g.position, dir, n.avoidSide) : dir.clone();
          // stuck recovery: little real progress for a while -> sidestep briefly, then carry on
          if (n.detourT && n.detourT > 0 && n.detourDir) { n.detourT -= dt; steer.copy(n.detourDir); }
          const before = g.position.clone();
          g.position.addScaledVector(steer, n.speed * dt);
          // gentle separation so walkers don't stack into one clump
          for (const o of this.npcs) {
            if (o === n || (o.state !== 'walk_in' && o.state !== 'walk_out')) continue;
            const sx = g.position.x - o.group.position.x, sz = g.position.z - o.group.position.z;
            const sd = Math.hypot(sx, sz);
            if (sd > 0.001 && sd < 0.8) { const k = ((0.8 - sd) / sd) * 1.5 * dt; g.position.x += sx * k; g.position.z += sz * k; }
          }
          this.keepNpcOutOfBuildings(g.position);
          const moved = Math.hypot(g.position.x - before.x, g.position.z - before.z);
          if (moved < n.speed * dt * 0.3) {
            n.stuckT = (n.stuckT ?? 0) + dt;
            if (n.stuckT > 0.6 && !(n.detourT && n.detourT > 0)) {
              n.avoidSide = -(n.avoidSide ?? 1);
              n.detourT = 1.1;
              n.detourDir = new THREE.Vector3(-dir.z * n.avoidSide, 0, dir.x * n.avoidSide).multiplyScalar(0.9).addScaledVector(dir, 0.45).normalize();
              n.stuckT = 0;
            }
          } else n.stuckT = Math.max(0, (n.stuckT ?? 0) - dt * 2);
          g.rotation.y = Math.atan2(steer.x, steer.z);
          n.phase += dt * 9;
          const sw = Math.sin(n.phase) * 0.5;
          if (legs.length === 2) {
            legs[0].rotation.x = sw;
            legs[1].rotation.x = -sw;
          }
          g.position.y = Math.abs(Math.sin(n.phase)) * 0.06;
          // a small chance to notice the resident walking past
          const nowT = this.clock.elapsedTime;
          if (
            this.player &&
            nowT > n.greetCoolUntil &&
            nowT > this.greetGlobalUntil &&
            g.position.distanceTo(this.player.position) < CONFIG.town.greetRange &&
            Math.random() < CONFIG.town.greetChance * dt
          ) {
            n.prevState = n.state;
            n.state = 'greet';
            n.dwellLeft = CONFIG.town.greetTimeSec;
            n.greetCoolUntil = nowT + CONFIG.town.greetNpcCooldown;
            this.greetGlobalUntil = nowT + CONFIG.town.greetGlobalCooldown;
            this.showBubble(n, pickGreeting());
          } else if (Math.random() < 0.045 * dt) {
            // any townsfolk sometimes stop to look around — or rest on
            // a bench if they happen to be passing one
            n.prevState = n.state;
            const bench = this.worldObjs.find(
              (o) => o.kind === 'bench' && Math.hypot(g.position.x - o.x, g.position.z - o.z) < 2.4,
            );
            if (bench && bench.data?.seat && Math.random() < 0.5) {
              n.state = 'sit';
              n.sitBench = bench;
              n.dwellLeft = 4 + Math.random() * 2;
              g.position.set(bench.data.seat.x, 0.32, bench.data.seat.z);
              g.rotation.y = bench.data.faceYaw ?? 0;
            } else {
              n.state = 'pause';
              n.pauseLeft = 1.2 + Math.random() * 1.4;
            }
          }
        }
      } else if (n.state === 'greet') {
        // stopped, turning toward the resident, saying a quick hello
        if (this.player) {
          const dx = this.player.position.x - g.position.x;
          const dz = this.player.position.z - g.position.z;
          const want = Math.atan2(dx, dz);
          let d2 = want - g.rotation.y;
          while (d2 > Math.PI) d2 -= Math.PI * 2;
          while (d2 < -Math.PI) d2 += Math.PI * 2;
          g.rotation.y += d2 * Math.min(1, dt * 8);
        }
        n.dwellLeft -= dt;
        if (n.dwellLeft <= 0) {
          if (n.bubble) {
            n.bubble.remove();
            n.bubble = undefined;
          }
          n.state = n.prevState ?? 'walk_out';
        }
      } else if (n.state === 'pause') {
        n.pauseLeft -= dt;
        n.phase += dt;
        g.rotation.y += Math.sin(n.phase) * dt * 0.9;
        if (n.pauseLeft <= 0) n.state = n.prevState ?? 'walk_out';
      } else if (n.state === 'sit') {
        // resting on a bench, legs bent
        if (legs.length === 2) {
          legs[0].rotation.x = -1.35;
          legs[1].rotation.x = -1.35;
        }
        n.dwellLeft -= dt;
        if (n.dwellLeft <= 0) {
          if (n.sitBench) {
            g.position.set(n.sitBench.x + (n.sitBench.x < 0 ? 1.2 : -1.2), 0, n.sitBench.z);
            n.sitBench = undefined;
          }
          n.state = n.prevState ?? 'walk_out';
        }
      } else {
        n.dwellLeft -= dt;
        // an occasional little wave while they do their business
        const armsW: THREE.Mesh[] = g.userData.arms ?? [];
        if (n.waveT > 0) {
          n.waveT -= dt;
          if (armsW.length === 2) armsW[1].rotation.x = -2.3 + Math.sin(this.clock.elapsedTime * 10) * 0.25;
        } else if (armsW.length === 2 && armsW[1].rotation.x !== 0) {
          armsW[1].rotation.x *= Math.max(0, 1 - dt * 6);
        }
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
        // Behind the camera (z > 1) or off-screen projections mirror onto random
        // spots of the view, so hide the bubble unless the NPC is truly in frame.
        const inFrame = head.z < 1 && Math.abs(head.x) < 1.05 && Math.abs(head.y) < 1.05 && g.visible && !this.interiorMode;
        n.bubble.style.display = inFrame ? '' : 'none';
        n.bubble.style.left = `${x}px`;
        n.bubble.style.top = `${y}px`;
      }
    }

    // ── your resident: WASD walk + third-person camera follow ──
    if (this.player) {
      const p = this.player;
      const legs: THREE.Mesh[] = p.userData.legs ?? [];
      const arms: THREE.Mesh[] = p.userData.arms ?? [];
      let mx = 0;
      let mz = 0;
      let moving = false;
      if (this.inputEnabled) {
        const fwd =
          (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) -
          (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
        const side =
          (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
          (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
        if (fwd || side) {
          // camera-relative: W walks away from the camera, A/D strafe
          const view = this.interiorMode
            ? new THREE.Vector3(Math.sin(this.fpYaw), 0, Math.cos(this.fpYaw))
            : new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
          view.y = 0;
          view.normalize();
          const right = new THREE.Vector3().crossVectors(view, UP).normalize();
          const dir = view.multiplyScalar(fwd).add(right.multiplyScalar(side)).normalize();
          mx = dir.x;
          mz = dir.z;
          moving = true;
        }
      }
      // smooth acceleration / deceleration instead of instant start-stop
      const rate = moving ? 9 : 13;
      this.vel.x += (mx - this.vel.x) * Math.min(1, dt * rate);
      this.vel.y += (mz - this.vel.y) * Math.min(1, dt * rate);
      const speed = this.vel.length();
      if (speed > 0.01) {
        const nx = p.position.x + this.vel.x * CONFIG.walkSpeed * this.speedMult * dt;
        const nz = p.position.z + this.vel.y * CONFIG.walkSpeed * this.speedMult * dt;
        if (this.interiorMode) {
          // Keep the resident inside the actual 3D room. The doorway is the only exit path (E).
          p.position.x = THREE.MathUtils.clamp(nx, -14.2, 14.2);
          p.position.z = THREE.MathUtils.clamp(nz, -11.2, 11.0);
        } else {
          // town rectangle, the open east gate, or the wilderness beyond it (never into the lake)
          const px = p.position.x, pz = p.position.z;
          if (canWalk(nx, pz)) p.position.x = nx;
          if (canWalk(p.position.x, nz)) p.position.z = nz;
          this.resolveCollisions(p.position);
          const gy = groundY(p.position.x, p.position.z);
          p.position.y += ((p.position.x > CONFIG.worldRect.maxX ? gy : 0) - p.position.y) * Math.min(1, dt * 14);
          void px; void pz;
        }
        if (moving && !this.interiorMode) {
          // face where you're heading, turning smoothly
          const targetYaw = Math.atan2(mx, mz);
          let d = targetYaw - p.rotation.y;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          p.rotation.y += d * Math.min(1, dt * 12);
        }
        // walk cycle scales with actual speed
        const sw = Math.sin(this.clock.elapsedTime * 11) * 0.55 * Math.min(1, speed * 1.6);
        if (legs.length === 2) {
          legs[0].rotation.x = sw;
          legs[1].rotation.x = -sw;
        }
        if (arms.length === 2) {
          arms[0].rotation.x = -sw * 0.65;
          arms[1].rotation.x = sw * 0.65;
        }
      } else {
        this.vel.set(0, 0);
        // limbs ease back to rest, gentle idle breathing
        for (const l of [...legs, ...arms]) l.rotation.x *= Math.max(0, 1 - dt * 10);
        p.position.y = Math.abs(Math.sin(this.clock.elapsedTime * 1.6)) * 0.06;
      }

      if (this.interiorMode) {
        // first person: camera at head height, looking where you look
        this.camera.position.set(p.position.x, 2.0, p.position.z);
        if (this.camera.fov !== 52.8) { this.camera.fov = 52.8; this.camera.updateProjectionMatrix(); }
        const cp = Math.cos(this.fpPitch);
        this.camera.lookAt(
          p.position.x + Math.sin(this.fpYaw) * cp * 4,
          1.55 + Math.sin(this.fpPitch) * 4,
          p.position.z + Math.cos(this.fpYaw) * cp * 4,
        );
      } else {
        // camera glides after the resident — the offset stays locked, so the
        // follow distance only ever changes when you scroll to zoom
        const want = new THREE.Vector3(p.position.x, 1.5, p.position.z);
        const before = this.controls.target.clone();
        this.controls.target.lerp(want, 1 - Math.exp(-5 * dt));
        this.camera.position.add(new THREE.Vector3().subVectors(this.controls.target, before));
      }

      // the store shell fades while the resident is inside so the interior reads
      const inStore =
        Math.abs(p.position.x - STORE_POS.x) < 4.4 && Math.abs(p.position.z - STORE_POS.z) < 3.4;
      if (inStore !== this.insideStore) this.insideStore = inStore;
      const targetOp = this.insideStore ? 0.14 : 1;
      for (const m of this.storeFadeMats) m.opacity += (targetOp - m.opacity) * Math.min(1, dt * 8);
      this.insideFurnitureStore = Math.abs(p.position.x - (STORE_POS.x + 13)) < 4.4 && Math.abs(p.position.z - STORE_POS.z) < 3.4;
      const furnOp = this.insideFurnitureStore ? 0.14 : 1;
      for (const m of this.furnitureFadeMats) m.opacity += (furnOp - m.opacity) * Math.min(1, dt * 8);

      // the shopkeeper idles gently behind the counter
      if (this.shopkeeper) {
        this.shopkeeper.rotation.y = Math.PI + Math.sin(this.clock.elapsedTime * 1.1) * 0.08;
      }

      // which plot is the resident close enough to interact with?
      this.nearbyClock -= dt;
      if (this.nearbyClock <= 0) {
        this.nearbyClock = 0.15;
        let best: number | null = null;
        let bestD: number = CONFIG.interactRadius;
        for (const p2 of this.plotState) {
          const d = this.nearPlotDist(p2.id);
          if (d < bestD) {
            bestD = d;
            best = p2.id;
          }
        }
        if (best !== this.nearbyId) {
          this.nearbyId = best;
          this.onNearby(best);
        }
        // highlight the plot you're standing at
        for (const [id, v] of this.plotVisuals) {
          if (!v.marker) continue;
          const near = id === best;
          const m = v.marker.material as THREE.MeshBasicMaterial;
          m.opacity = near ? 0.42 : 0.18;
          m.color.set(near ? 0xffd76a : 0xf2e2a8);
        }
        // nearest interactive world object — bench, mailbox, sign, keeper…
        let bestObj: TownObj | null = null;
        let bestObjD: number = CONFIG.town.interactObjRadius;
        for (const o of this.worldObjs) {
          const d = Math.hypot(p.position.x - o.x, p.position.z - o.z);
          if (d < bestObjD) {
            bestObjD = d;
            bestObj = o;
          }
        }
        this.nearObj = bestObj;
        this.nearObjDist = bestObjD;
        const furnitureDist = Math.hypot(p.position.x - (STORE_POS.x + 13), p.position.z - STORE_POS.z);
        if (furnitureDist <= 6.2 && (best === null || furnitureDist < bestD)) this.onPrompt('E — Open Furniture Store');
        else this.onPrompt(bestObj && (best === null || bestObjD < bestD) ? bestObj.label : null);
      }

      // seated on a bench: hold the pose until a key stands you up
      if (this.sitting?.data?.seat) {
        const seat = this.sitting.data.seat;
        p.position.set(seat.x, 0.32, seat.z);
        const want = this.sitting.data.faceYaw ?? p.rotation.y;
        let d3 = want - p.rotation.y;
        while (d3 > Math.PI) d3 -= Math.PI * 2;
        while (d3 < -Math.PI) d3 += Math.PI * 2;
        p.rotation.y += d3 * Math.min(1, dt * 10);
        for (const l of legs) l.rotation.x = -1.35;
        for (const a of arms) a.rotation.x = -0.3;
      }
    }

    // clouds drift lazily across the sky
    for (const cl of this.clouds) {
      cl.position.x += dt * 0.6;
      if (cl.position.x > 190) cl.position.x = -190;
      // keep every cloud clear of the rolling hills beneath it (sample across its width)
      if (cl.userData.baseY === undefined) cl.userData.baseY = cl.position.y;
      const cx = cl.position.x, cz = cl.position.z;
      const under = Math.max(terrainH(cx, cz), terrainH(cx - 22, cz), terrainH(cx + 22, cz));
      const want = Math.max(cl.userData.baseY as number, under + 14);
      cl.position.y += (want - cl.position.y) * Math.min(1, dt * 2);
    }

    // ambient town life: birds, butterflies, leaves, smoke, fountain, dust
    if (this.ambient) {
      const walkers = this.npcs
        .filter((n) => n.state === 'walk_in' || n.state === 'walk_out')
        .map((n) => ({ x: n.group.position.x, z: n.group.position.z }));
      this.ambient.update(
        dt,
        this.clock.elapsedTime,
        walkers,
        this.player ? { x: this.player.position.x, z: this.player.position.z } : { x: 0, z: 0 },
      );
    }

    if (this.interiorMode) {
      // anything spawned into the world after entry (wanderers, remote players,
      // ambient effects) shares the interior's coordinates — keep it hidden
      for (const o of this.scene.children) {
        if (o === this.interiorGroup || o === this.player || !o.visible) continue;
        if (!this.savedVisibility.has(o)) this.savedVisibility.set(o, true);
        o.visible = false;
      }
    } else {
      this.controls.update();   // first person drives the camera itself
    }
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
    this.ambient?.dispose();
    this.interiorGroup?.clear();
    for (const [, r] of this.remotes) {
      r.tagMat.dispose();
      r.tagTex.dispose();
    }
    this.remotes.clear();
    this.detachSelfTag();
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.onResize);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.bubbleLayer.remove();
  }
}
