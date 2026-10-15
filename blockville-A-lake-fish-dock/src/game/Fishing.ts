// Dock fishing mini-game. Stand at the end of the dock and press E (or tap the action button):
//   cast -> wait for a bite -> press E when the bobber dips -> stop the moving marker in the green zone.
// Fish pay $BLOCKVILLE; a boot or rusty can pays nothing. Owned by the engine, which calls update()
// each frame and press() on E. Movement cancels the cast. No new gameplay state outside this file.
import * as THREE from 'three';
import { WATER_Y, lakeRipple } from '../world/WorldTerrain';
import { fishSpot, castTarget } from './fishSpot';
import { rollCatch, markerAt, inZone, pruneCatches, catchesLeft, msUntilNextCatch, type Catch } from './fishingLogic';

type Phase = 'idle' | 'waiting' | 'bite' | 'reel' | 'result';

export interface FishingHooks {
  onFish: (amount: number, source: string) => void;
  onToast: (text: string) => void;
  onCast?: (x: number, z: number) => void;
}

const BITE_WINDOW = 1.4;
const ZONE_W = 0.3;
const MARKER_SPEED = 0.95;
const REEL_TIME = 5;
const STORE_KEY = 'blockville.fishing.catches';

function loadCatches(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(v) ? v.filter((n) => typeof n === 'number') : [];
  } catch { return []; }
}
function saveCatches(a: number[]) { try { localStorage.setItem(STORE_KEY, JSON.stringify(a)); } catch { /* ignore */ } }

export class Fishing {
  private phase: Phase = 'idle';
  private catches: number[] = loadCatches();
  private t = 0;
  private waitFor = 3;
  private catchRoll!: Catch;
  private zoneC = 0.5;
  private bobber: THREE.Mesh;
  private line: THREE.Line;
  private linePos = new Float32Array(6);
  private panel: HTMLDivElement;
  private title: HTMLDivElement;
  private bar: HTMLDivElement;
  private zone: HTMLDivElement;
  private marker: HTMLDivElement;
  private hint: HTMLDivElement;
  private bx = 0;
  private bz = 0;
  private hand = new THREE.Vector3();
  private sx = 0;
  private sz = 0;
  private castT = 1;
  // held rod: parented to the player's right arm while a cast is active
  private rod = new THREE.Group();
  private rodTip = new THREE.Object3D();
  private rodOwner: THREE.Object3D | null = null;
  private tipPos = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private hooks: FishingHooks) {
    // rod: cork grip, bamboo shaft, thin tapering tip and a small reel. Built along +Z, tilted up in the grip.
    const cork = new THREE.MeshStandardMaterial({ color: 0xb98a55, roughness: 0.9 });
    const cane = new THREE.MeshStandardMaterial({ color: 0x7a4f2a, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.5, roughness: 0.4 });
    const part = (geo: THREE.BufferGeometry, m: THREE.Material, z: number) => {
      const o = new THREE.Mesh(geo, m); o.rotation.x = Math.PI / 2; o.position.z = z; o.castShadow = true; this.rod.add(o); return o;
    };
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), cork, 0.05);
    part(new THREE.CylinderGeometry(0.04, 0.06, 1.7, 8), cane, 1.1);
    part(new THREE.CylinderGeometry(0.014, 0.04, 1.5, 6), cane, 2.7);
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10), steel);
    reel.rotation.z = Math.PI / 2; reel.position.set(-0.09, -0.07, 0.3); this.rod.add(reel);
    this.rodTip.position.z = 3.45;
    this.rod.add(this.rodTip);
    this.rod.rotation.x = 0.55;
    this.rod.visible = false;
    this.bobber = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8392f, emissive: 0x551008, roughness: 0.5 }),
    );
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.4),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    );
    cap.position.y = 0.04;
    this.bobber.add(cap);
    this.bobber.visible = false;
    this.bobber.castShadow = false;
    scene.add(this.bobber);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf2f2e8, transparent: true, opacity: 0.85 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    this.panel = document.createElement('div');
    this.panel.className = 'bv-fishing';
    this.panel.hidden = true;
    this.panel.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:calc(120px + env(safe-area-inset-bottom, 0px))', 'transform:translateX(-50%)',
      'min-width:280px', 'padding:12px 16px', 'border-radius:14px', 'background:rgba(15,23,42,0.78)',
      'border:2px solid rgba(255,255,255,0.45)', 'color:#fff', 'font:600 15px system-ui,sans-serif',
      'text-align:center', 'z-index:41', 'user-select:none', '-webkit-user-select:none', 'cursor:pointer',
    ].join(';');
    this.title = document.createElement('div');
    this.bar = document.createElement('div');
    this.bar.style.cssText = 'position:relative;height:18px;margin:10px 0 6px;border-radius:9px;background:rgba(255,255,255,0.18);overflow:hidden;display:none';
    this.zone = document.createElement('div');
    this.zone.style.cssText = 'position:absolute;top:0;bottom:0;background:#4ade80;opacity:0.9';
    this.marker = document.createElement('div');
    this.marker.style.cssText = 'position:absolute;top:-2px;bottom:-2px;width:5px;margin-left:-2px;background:#fff;border-radius:3px;box-shadow:0 0 6px #fff';
    this.bar.append(this.zone, this.marker);
    this.hint = document.createElement('div');
    this.hint.style.cssText = 'font:500 12px system-ui,sans-serif;opacity:0.75';
    this.panel.append(this.title, this.bar, this.hint);
    this.panel.addEventListener('click', (e) => { e.preventDefault(); this.press(); });
    document.body.appendChild(this.panel);
  }

  get active(): boolean { return this.phase !== 'idle'; }

  /** Fishable from the whole dock and the dry shore within casting range of the water (see fishSpot.ts). */
  static canFishAt(x: number, z: number): boolean {
    return fishSpot(x, z) !== null;
  }

  /** E pressed. Returns true if fishing consumed the press. */
  press(player?: THREE.Object3D): boolean {
    switch (this.phase) {
      case 'idle':
        if (!player || !Fishing.canFishAt(player.position.x, player.position.z)) return false;
        if (catchesLeft(this.catches, Date.now()) <= 0) {
          const mins = Math.ceil(msUntilNextCatch(this.catches, Date.now()) / 60000);
          this.hooks.onToast(`🎣 The fish need a rest. Max 20 catches per 15 minutes. Try again in ~${mins} min.`);
          return true;
        }
        this.cast(player);
        return true;
      case 'waiting':
        this.finish('😬 Reeled in too early — nothing on the hook.');
        return true;
      case 'bite':
        this.phase = 'reel';
        this.t = 0;
        this.catchRoll = rollCatch(Math.random(), Math.random());
        this.zoneC = ZONE_W / 2 + Math.random() * (1 - ZONE_W);
        this.zone.style.left = `${(this.zoneC - ZONE_W / 2) * 100}%`;
        this.zone.style.width = `${ZONE_W * 100}%`;
        this.bar.style.display = 'block';
        this.render();
        return true;
      case 'reel': {
        const hit = inZone(markerAt(this.t, MARKER_SPEED), this.zoneC, ZONE_W);
        this.land(hit);
        return true;
      }
      default:
        return true;
    }
  }

  cancel() {
    if (this.phase === 'idle') return;
    this.reset();
  }

  /** label for the action button / E prompt, or null when not applicable */
  label(player?: THREE.Object3D): string | null {
    if (this.phase === 'waiting') return 'Reel in';
    if (this.phase === 'bite') return 'Hook it!';
    if (this.phase === 'reel') return 'Pull!';
    if (this.phase === 'result') return null;
    if (!player || !Fishing.canFishAt(player.position.x, player.position.z)) return null;
    const left = catchesLeft(this.catches, Date.now());
    return left > 0 ? 'Fish' : 'Fish (resting)';
  }

  private cast(player: THREE.Object3D) {
    const spot = fishSpot(player.position.x, player.position.z)!;
    player.rotation.y = Math.atan2(spot.dirX, spot.dirZ); // face the nearest water (character forward is +z at yaw 0)
    const tg = castTarget(player.position.x, player.position.z, spot, Math.random(), Math.random());
    this.bx = tg.x; this.bz = tg.z;
    this.sx = player.position.x; this.sz = player.position.z;
    this.castT = 0;
    this.hooks.onCast?.(tg.x, tg.z);
    this.waitFor = 2 + Math.random() * 3.5;
    this.phase = 'waiting';
    this.t = 0;
    this.bobber.visible = true;
    this.line.visible = true;
    this.render();
  }

  private land(hit: boolean) {
    const c = this.catchRoll;
    if (hit) {
      this.catches = pruneCatches(this.catches, Date.now());
      this.catches.push(Date.now());
      saveCatches(this.catches);
    }
    if (!hit) {
      this.finish('💨 It got away!');
    } else if (c.kind === 'fish') {
      this.finish(`${c.icon} ${c.name}! +${c.reward} $BLOCKVILLE`);
      this.hooks.onFish(c.reward, `caught a ${c.name}`);
    } else {
      this.finish(`${c.icon} Just an ${c.name}. Worth nothing.`);
      this.hooks.onToast(`${c.icon} You reeled in an ${c.name}. Nothing of value.`);
    }
  }

  private finish(msg: string) {
    this.phase = 'result';
    this.t = 0;
    this.bar.style.display = 'none';
    this.title.textContent = msg;
    this.hint.textContent = '';
    this.panel.hidden = false;
    this.bobber.visible = false;
    this.line.visible = false;
  }

  private reset() {
    this.phase = 'idle';
    this.panel.hidden = true;
    this.bar.style.display = 'none';
    this.bobber.visible = false;
    this.line.visible = false;
    this.rod.visible = false;
    const arms = (this.rodOwner?.userData.arms as THREE.Object3D[] | undefined) ?? [];
    if (arms[0]) arms[0].rotation.z = 0;
  }

  /** Put the rod in the right hand and pose both arms: grip forward, flick on cast, tug on a bite, shake while reeling. */
  private pose(player: THREE.Object3D, time: number) {
    const arms = (player.userData.arms as THREE.Object3D[] | undefined) ?? [];
    if (arms.length !== 2) return;
    if (this.rodOwner !== player) {
      this.rod.removeFromParent();
      arms[1].add(this.rod);
      this.rod.position.set(0.02, -1.22, 0.06);
      this.rodOwner = player;
    }
    this.rod.visible = true;
    const k = this.castT;
    let a = -1.0;
    if (k < 1) a -= 0.9 * Math.sin(Math.PI * k) * (k < 0.5 ? 1 : 0.6); // wind up, then flick forward
    if (this.phase === 'bite') a += Math.sin(time * 38) * 0.07 - 0.12;
    if (this.phase === 'reel') a += Math.sin(time * 16) * 0.08;
    arms[1].rotation.x = a;
    arms[0].rotation.x = -0.55 + (this.phase === 'reel' ? Math.sin(time * 16 + 1.5) * 0.12 : 0);
    arms[0].rotation.z = 0.12;
  }

  private render() {
    this.panel.hidden = false;
    if (this.phase === 'waiting') { this.title.textContent = '🎣 Waiting for a bite…'; this.hint.textContent = 'Press E when the bobber dips'; }
    if (this.phase === 'bite') { this.title.textContent = '❗ Something is biting!'; this.hint.textContent = 'Press E now'; }
    if (this.phase === 'reel') { this.title.textContent = '🐟 Stop the marker in the green'; this.hint.textContent = 'Press E to pull'; }
  }

  update(dt: number, time: number, player?: THREE.Object3D) {
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'result') {
      if (this.t > 2.4) this.reset();
      return;
    }
    if (this.phase === 'waiting' && this.t >= this.waitFor) {
      this.phase = 'bite';
      this.t = 0;
      this.render();
    } else if (this.phase === 'bite' && this.t >= BITE_WINDOW) {
      this.finish('🫥 Too slow — it spat the hook.');
    } else if (this.phase === 'reel') {
      this.marker.style.left = `${markerAt(this.t, MARKER_SPEED) * 100}%`;
      if (this.t > REEL_TIME) this.finish('💨 It got away!');
    }
    // bobber rides the water; dips hard on a bite, jitters while reeling
    const dip = this.phase === 'bite' ? -0.22 + Math.sin(time * 40) * 0.05 : this.phase === 'reel' ? Math.sin(time * 22) * 0.07 : 0;
    // short cast arc from the hand to the water, then ride the rippling surface
    this.castT = Math.min(1, this.castT + dt / 0.6);
    const k = this.castT, ease = k * k * (3 - 2 * k);
    const bxn = this.sx + (this.bx - this.sx) * ease, bzn = this.sz + (this.bz - this.sz) * ease;
    const surf = lakeRipple(this.bx, this.bz, time);
    const arc = Math.sin(Math.PI * k) * 2.2;
    this.bobber.position.set(bxn, surf + 0.05 + (k < 1 ? arc + (1 - k) * 1.2 : Math.sin(time * 2.2) * 0.03 + dip), bzn);
    if (player) {
      this.pose(player, time);
      player.updateMatrixWorld(true);
      this.rodTip.getWorldPosition(this.tipPos);
      const a = this.linePos;
      a[0] = this.tipPos.x; a[1] = this.tipPos.y; a[2] = this.tipPos.z;
      a[3] = this.bobber.position.x; a[4] = this.bobber.position.y + 0.15; a[5] = this.bobber.position.z;
      (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  dispose() {
    this.panel.remove();
    this.rod.removeFromParent();
    this.scene.remove(this.bobber, this.line);
  }
}
