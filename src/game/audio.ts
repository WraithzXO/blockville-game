// Minimal WebAudio layer for the Settings menu.
// One shared AudioContext, two real gain nodes (master → destination,
// sfx → master). The Settings sliders write these gains directly, so the
// controls genuinely shape the output. No audio assets, no dependencies.

export type SfxName = 'click' | 'buy' | 'toast' | 'build' | 'error';

export interface AudioVolumes { master: number; sfx: number }

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let volumes: AudioVolumes = { master: 0.7, sfx: 0.8 };

const clamp01 = (v: unknown): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  return Math.min(1, Math.max(0, n));
};

export const getVolumes = (): AudioVolumes => ({ ...volumes });

// Lazily create the context on the first user gesture (browser autoplay policy).
function ensure(): boolean {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    masterGain = ctx.createGain();
    sfxGain = ctx.createGain();
    sfxGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    applyVolumes(volumes);
    return true;
  } catch {
    ctx = null;
    return false;
  }
}

function applyVolumes(v: AudioVolumes): void {
  if (masterGain) masterGain.gain.value = clamp01(v.master);
  if (sfxGain) sfxGain.gain.value = clamp01(v.sfx);
}

export function setVolumes(v: Partial<AudioVolumes>): AudioVolumes {
  volumes = { master: clamp01(v.master ?? volumes.master), sfx: clamp01(v.sfx ?? volumes.sfx) };
  applyVolumes(volumes);
  return getVolumes();
}

// Resume a suspended context (autoplay policy) when called from a gesture.
export function resumeAudio(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
}

// One short synthesized blip per name. Guarded: no context → silent no-op.
export function sfx(name: SfxName): void {
  if (!ensure() || !ctx || !sfxGain) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(sfxGain);
  const blip = (type: OscillatorType, freq: number, at: number, dur: number, vol: number) => {
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t + at);
    gain.gain.setValueAtTime(0.0001, t + at);
    gain.gain.exponentialRampToValueAtTime(vol, t + at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
    osc.start(t + at);
    osc.stop(t + at + dur + 0.02);
  };
  switch (name) {
    case 'click': blip('square', 620, 0, 0.05, 0.12); break;
    case 'buy': blip('sine', 520, 0, 0.07, 0.16); blip('sine', 780, 0.08, 0.09, 0.16); break;
    case 'toast': blip('sine', 440, 0, 0.08, 0.09); break;
    case 'build': blip('triangle', 150, 0, 0.1, 0.2); break;
    case 'error': blip('sawtooth', 170, 0, 0.13, 0.12); break;
  }
}
