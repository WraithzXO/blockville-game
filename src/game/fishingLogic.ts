// Pure fishing rules (no three.js, no DOM) so they can be unit-tested.
// Every cast resolves to either junk (worth nothing) or a fish (pays $BLOCKVILLE).

export interface Catch {
  kind: 'junk' | 'fish';
  name: string;
  icon: string;
  /** $BLOCKVILLE paid out; 0 for junk */
  reward: number;
}

export const JUNK_CHANCE = 0.7; // 70% boot / rusty can, 30% fish

const JUNK: Catch[] = [
  { kind: 'junk', name: 'Old Boot', icon: '🥾', reward: 0 },
  { kind: 'junk', name: 'Rusty Can', icon: '🥫', reward: 0 },
];

// weights inside the 30% fish share
const FISH: { weight: number; catch: Catch }[] = [
  { weight: 60, catch: { kind: 'fish', name: 'Silver Minnow', icon: '🐟', reward: 25 } },
  { weight: 30, catch: { kind: 'fish', name: 'Lake Carp', icon: '🐠', reward: 75 } },
  { weight: 10, catch: { kind: 'fish', name: 'Golden Koi', icon: '✨', reward: 250 } },
];

/** r1 picks junk vs fish, r2 picks which one. Both in [0, 1). */
export function rollCatch(r1: number, r2: number): Catch {
  if (r1 < JUNK_CHANCE) return JUNK[Math.min(JUNK.length - 1, Math.floor(r2 * JUNK.length))];
  const total = FISH.reduce((a, f) => a + f.weight, 0);
  let t = r2 * total;
  for (const f of FISH) {
    if (t < f.weight) return f.catch;
    t -= f.weight;
  }
  return FISH[0].catch;
}

/** Ping-pong marker position 0..1 for elapsed seconds at a given speed (laps per second). */
export function markerAt(elapsed: number, speed: number): number {
  const p = (elapsed * speed) % 2;
  return p <= 1 ? p : 2 - p;
}

export function inZone(marker: number, zoneCenter: number, zoneWidth: number): boolean {
  return Math.abs(marker - zoneCenter) <= zoneWidth / 2;
}

// Catch limit: at most MAX_CATCHES landed catches (fish AND junk) in any rolling window.
export const MAX_CATCHES = 20;
export const CATCH_WINDOW_MS = 15 * 60 * 1000;

/** Drop timestamps older than the window. */
export function pruneCatches(times: number[], now: number): number[] {
  return times.filter((t) => now - t < CATCH_WINDOW_MS && t <= now);
}

export function catchesLeft(times: number[], now: number): number {
  return Math.max(0, MAX_CATCHES - pruneCatches(times, now).length);
}

/** Milliseconds until the oldest counted catch expires (0 when under the cap). */
export function msUntilNextCatch(times: number[], now: number): number {
  const live = pruneCatches(times, now).sort((a, b) => a - b);
  if (live.length < MAX_CATCHES) return 0;
  return Math.max(0, live[live.length - MAX_CATCHES] + CATCH_WINDOW_MS - now);
}
