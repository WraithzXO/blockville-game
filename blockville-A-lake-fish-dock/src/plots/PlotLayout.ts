import type { BuildingType } from '../game/config';

// ── Plot attachment layout ─────────────────────────────────────────────
// A reusable slot allocator for everything a player can add to a plot's
// yard (garden bed, statue, fence sections, bench, lamp, planter, mailbox,
// and any future kind: add one entry to DECOR_KINDS).
//
// Coordinates are plot-local: u runs along the street, v runs from the
// building toward the street (v > 0 is the front yard). The allocator knows
// the usable plot rectangle, the building's keep-out zone, the entrance path,
// and every already-reserved footprint, so features can never overlap each
// other, the building, or the plot edge.

export type PlotFeatureKind = 'garden' | 'bench' | 'lamp' | 'planter' | 'mailbox' | 'statue' | 'fence';

export interface PlacedFeature { id: string; kind: PlotFeatureKind; u: number; v: number; }

interface KindSpec {
  hw: number;           // half extent along u
  hd: number;           // half extent along v
  gap: number;          // clearance kept to every neighbour
  anchors: [number, number][];   // preferred spots in priority order
  scan?: boolean;       // fall back to scanning the free yard
  pathSafe?: boolean;   // may sit in the entrance corridor
}

export const DECOR_KINDS: Record<PlotFeatureKind, KindSpec> = {
  // one fence = the whole yard (rendered as a full ring inside the plot by makeYardFence); it reserves no slot
  fence: { hw: 0, hd: 0, gap: 0, anchors: [] },
  mailbox: { hw: 0.3, hd: 0.3, gap: 0.2, anchors: [[1.9, 5.0], [-1.9, 5.0], [4.4, 4.4], [-4.4, 4.4]], pathSafe: true },
  lamp: { hw: 0.3, hd: 0.3, gap: 0.2, anchors: [[4.3, 3.2], [-4.3, 3.2], [4.3, 0.5], [-4.3, 0.5]], scan: true },
  planter: { hw: 0.75, hd: 0.45, gap: 0.2, anchors: [[5.0, 1.6], [-5.0, 1.6], [5.0, -0.6], [-5.0, -0.6]], scan: true },
  bench: { hw: 1.0, hd: 0.45, gap: 0.25, anchors: [[5.85, -2.4], [-5.85, -2.4], [0, -7.0], [-3, -7.0], [3, -7.0]], scan: true },
  statue: { hw: 0.65, hd: 0.65, gap: 0.3, anchors: [[5.4, 4.0], [-5.4, 4.0], [5.4, -4.4], [-5.4, -4.4]], scan: true },
  garden: { hw: 1.3, hd: 1.15, gap: 0.3, anchors: [], scan: true },
};

export const DECOR_LABEL: Record<PlotFeatureKind, string> = {
  garden: 'Garden bed', bench: 'Bench', lamp: 'Street lamp', planter: 'Planter box', mailbox: 'Mailbox', statue: 'Builder statue', fence: 'Yard fence',
};

// building keep-out half-extents (matches the existing footprints: the mine
// is the widest, the bank/park slightly wider than a house)
const KEEP_HW: Partial<Record<BuildingType, number>> = { house: 3.7, bank: 5.2, mine: 6.2, park: 4.9 };
const DEFAULT_HW = 4.4;
const USABLE_HW = 6.9;           // plots are 13-15 wide — stay clear of the neighbours
const V_MAX = 5.3, V_MIN = -7.4; // street edge .. back edge (front yard is v > 0)
const MAX_FEATURES = 14;

interface Rect { u: number; v: number; hw: number; hd: number; }

const overlaps = (a: Rect, b: Rect, gap: number) =>
  Math.abs(a.u - b.u) < a.hw + b.hw + gap && Math.abs(a.v - b.v) < a.hd + b.hd + gap;

function keepOuts(type: BuildingType | null): Rect[] {
  const hw = KEEP_HW[type ?? 'house'] ?? DEFAULT_HW;
  return [
    { u: 0, v: -1.2, hw, hd: 5.2 },           // the building itself (mesh is centred 1.2 behind the plot centre)
    { u: 0, v: 4.7, hw: 1.5, hd: 0.7 },       // entrance steps
    { u: 0, v: 5.2, hw: 0.9, hd: 0.8 },       // entrance path to the street
  ];
}

export function featureRect(f: { kind: PlotFeatureKind; u: number; v: number }): Rect {
  const s = DECOR_KINDS[f.kind];
  return { u: f.u, v: f.v, hw: s.hw, hd: s.hd };
}

function fits(r: Rect, spec: KindSpec, type: BuildingType | null, placed: PlacedFeature[]): boolean {
  if (Math.abs(r.u) + r.hw > USABLE_HW + (spec.gap === 0 ? 0.1 : 0)) return false;
  if (r.v + r.hd > V_MAX + 0.3 || r.v - r.hd < V_MIN) return false;
  for (const k of keepOuts(type)) {
    if (spec.pathSafe && k.hw <= 1.5 && k.v >= 4.7 && k.hd < 1.1 && r.u > 1.2) continue; // mailbox beside the path
    if (overlaps(r, k, 0.15)) return false;
  }
  for (const p of placed) if (overlaps(r, featureRect(p), Math.max(spec.gap, DECOR_KINDS[p.kind].gap))) return false;
  return true;
}

/** Find a free slot for `kind`, or null when the yard is full. Deterministic. */
export function allocateSlot(type: BuildingType | null, placed: PlacedFeature[], kind: PlotFeatureKind): { u: number; v: number } | null {
  if (placed.length >= MAX_FEATURES) return null;
  const spec = DECOR_KINDS[kind];
  if (kind === 'fence') return placed.some((p) => p.kind === 'fence') ? null : { u: 0, v: 0 };
  const tryAt = (u: number, v: number) => (fits({ u, v, hw: spec.hw, hd: spec.hd }, spec, type, placed) ? { u, v } : null);
  // gardens prefer the side yards (beside the building), nearest the street first
  if (kind === 'garden') {
    const hw = (KEEP_HW[type ?? 'house'] ?? DEFAULT_HW);
    const uSide = hw + spec.hw + 0.25;
    for (const v of [2.4, 0.6, -1.4, -3.4]) for (const sx of [1, -1]) {
      const r = tryAt(sx * uSide, v);
      if (r) return r;
    }
  }
  for (const [u, v] of spec.anchors) { const r = tryAt(u, v); if (r) return r; }
  if (spec.scan) {
    for (let v = V_MAX - spec.hd; v >= V_MIN + spec.hd; v -= 0.5) {
      for (let i = 0; i < 26; i++) {
        const u = (i % 2 ? -1 : 1) * Math.ceil(i / 2) * 0.6 * (i === 0 ? 0 : 1);
        const r = tryAt(u, v);
        if (r) return r;
      }
    }
  }
  return null;
}
