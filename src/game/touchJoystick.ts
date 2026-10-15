// On-screen thumb joystick for touch devices. Plain DOM + CSS, no dependencies.
// Outputs an analogue vector: x = strafe right (+), y = walk forward (+).
// Only created when the device is touch / coarse-pointer, so desktop has no element.

export type JoyVector = { x: number; y: number };

const DEADZONE = 0.12;
const RADIUS = 56; // px the knob can travel from centre
const CSS_ID = 'bv-joystick-style';
const ROOT_CLASS = 'bv-joystick';

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

const CSS = `
.${ROOT_CLASS} {
  position: fixed;
  left: calc(20px + env(safe-area-inset-left, 0px));
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  width: 136px; height: 136px; border-radius: 50%;
  background: rgba(15, 23, 42, 0.35);
  border: 2px solid rgba(255, 255, 255, 0.35);
  touch-action: none; user-select: none; -webkit-user-select: none;
  z-index: 40; pointer-events: auto;
}
.${ROOT_CLASS} .bv-joy-knob {
  position: absolute; left: 50%; top: 50%; width: 56px; height: 56px;
  margin: -28px 0 0 -28px; border-radius: 50%;
  background: rgba(255, 255, 255, 0.55); border: 2px solid rgba(255, 255, 255, 0.85);
  pointer-events: none;
}
`;

export class TouchJoystick {
  private root: HTMLDivElement;
  private knob: HTMLDivElement;
  private pointerId: number | null = null;
  private cx = 0;
  private cy = 0;
  private enabledCheck: () => boolean;
  private onChange: (v: JoyVector) => void;

  constructor(parent: HTMLElement, onChange: (v: JoyVector) => void, enabledCheck: () => boolean) {
    this.onChange = onChange;
    this.enabledCheck = enabledCheck;
    if (!document.getElementById(CSS_ID)) {
      const style = document.createElement('style');
      style.id = CSS_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    // replace any joystick left by an earlier engine instance
    parent.querySelectorAll(`.${ROOT_CLASS}`).forEach((el) => el.remove());
    this.root = document.createElement('div');
    this.root.className = ROOT_CLASS;
    this.root.setAttribute('aria-label', 'Move joystick');
    this.knob = document.createElement('div');
    this.knob.className = 'bv-joy-knob';
    this.root.appendChild(this.knob);
    parent.appendChild(this.root);

    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    this.root.addEventListener('pointerup', this.onUp);
    this.root.addEventListener('pointercancel', this.onUp);
    this.root.addEventListener('lostpointercapture', this.onUp);
  }

  private emit(x: number, y: number) {
    this.onChange({ x, y });
  }

  private reset() {
    this.pointerId = null;
    this.knob.style.transform = 'translate(0px, 0px)';
    this.emit(0, 0);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabledCheck()) return;
    e.preventDefault();
    const r = this.root.getBoundingClientRect();
    this.cx = r.left + r.width / 2;
    this.cy = r.top + r.height / 2;
    this.pointerId = e.pointerId;
    this.root.setPointerCapture(e.pointerId);
    this.updateFrom(e);
  };

  private onMove = (e: PointerEvent) => {
    if (this.pointerId !== e.pointerId) return;
    this.updateFrom(e);
  };

  private onUp = (e: PointerEvent) => {
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    if (this.root.hasPointerCapture?.(e.pointerId)) this.root.releasePointerCapture(e.pointerId);
    this.reset();
  };

  private updateFrom(e: PointerEvent) {
    if (!this.enabledCheck()) return this.reset();
    let dx = (e.clientX - this.cx) / RADIUS;
    let dy = (e.clientY - this.cy) / RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    this.knob.style.transform = `translate(${dx * RADIUS}px, ${dy * RADIUS}px)`;
    const mag = Math.hypot(dx, dy);
    if (mag < DEADZONE) return this.emit(0, 0);
    // rescale so the output runs 0..1 just outside the deadzone
    const scale = (mag - DEADZONE) / (1 - DEADZONE) / mag;
    this.emit(dx * scale, -dy * scale); // screen up is forward
  }

  /** Clear any held input (used when modals open). */
  clear() {
    if (this.pointerId !== null) this.reset();
  }

  destroy() {
    this.root.remove();
  }
}
