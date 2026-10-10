// Props audit: every planted prop must sit on the surface the hills mesh
// actually renders (meshH), never float above it or sink under it; nothing in
// the lake, nothing on the trail, and nothing inside the fence overlapping
// roads, sidewalks or plots. Regression spec for the Phase 3 prop-grounding fix.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(new URL('..', import.meta.url).pathname, 'package.json'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${detail}`); } };

const dir = mkdtempSync(path.join(tmpdir(), 'bv-props-'));
// kit() paints its blob decal on a <canvas>; node has no DOM, so stub the two
// calls it makes. Textures are irrelevant to placement, which is what we audit.
globalThis.document = {
  createElement() {
    return {
      width: 0, height: 0,
      getContext() {
        const grad = { addColorStop() {} };
        return { createRadialGradient: () => grad, set fillStyle(_) {}, fillRect() {} };
      },
    };
  },
};
const bundle = async (entry, out) => {
  const r = spawnSync(require.resolve('esbuild/bin/esbuild'), [entry, '--bundle', '--format=esm', `--outfile=${out}`], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  if (r.status !== 0) { console.error('esbuild failed', r.stderr); process.exit(1); }
  return await import(out);
};

const nature = await bundle('src/world/WorldNature.ts', path.join(dir, 'wn.mjs'));
const { meshH, terrainH, WATER_Y, trailZ, LAKE } = await bundle('src/world/WorldTerrain.ts', path.join(dir, 'wt.mjs'));
const cfg = await bundle('src/game/config.ts', path.join(dir, 'cfg.mjs'));

// minimal fake scene: just collects what the builders add
const scene = { objs: [], add(o) { this.objs.push(o); } };
const perches1 = nature.buildInsideVegetation(scene);
nature.buildOutskirtsVegetation(scene);
nature.buildWildernessVegetation(scene);

// decode every InstancedMesh instance into {x,y,z,s}
const props = [];
for (const o of scene.objs) {
  if (!o.isInstancedMesh) continue;
  const e = o.matrix.elements; // identity parent
  const m = new (o.matrix.constructor)();
  for (let i = 0; i < o.count; i++) {
    o.getMatrixAt(i, m);
    const t = m.elements;
    const sx = Math.hypot(t[0], t[1], t[2]);
    props.push({ x: t[12] + e[12], y: t[13] + e[13], z: t[14] + e[14], s: sx, kind: o.name || 'other' });
  }
}
// grounding blobs (transparent quads) are instanced planes, not named props
const blobs = props.filter((p) => p.kind === 'other');
const body = (p) => p.kind === 'trees' ? 0.45 * p.s      // trunk + flare, crowns may overhang
  : p.kind === 'bushes' ? 1.15 * p.s
  : p.kind === 'rocks' ? 1.1 * p.s
  : p.kind === 'tufts' || p.kind === 'flowers' ? 0.5 * p.s
  : 0;
check('props were built', props.length > 500, `count=${props.length}`);

const f = cfg.CONFIG.fence;
const inside = (x, z) => x >= f.minX - 0.5 && x <= f.maxX + 0.5 && z >= f.minZ - 0.5 && z <= f.maxZ + 0.5;

// 1. grounding vs the rendered surface (props are sunk 0.02-0.18 by design)
let floaters = 0, sinkers = 0, worstFloat = 0, worstSink = 0;
for (const p of props) {
  if (p.kind === 'other') continue;               // decals are checked separately below
  if (inside(p.x, p.z)) continue;                 // town is flat (terrainH == 0 == meshH)
  const g = meshH(p.x, p.z);
  const d = p.y - g;                              // negative = sunk by design
  if (d > 0.08) { floaters++; worstFloat = Math.max(worstFloat, d); }
  if (d < -0.55) { sinkers++; worstSink = Math.min(worstSink, d); }
}
check('no floating props (base above the rendered surface)', floaters === 0, `floaters=${floaters} worst=+${worstFloat.toFixed(3)}`);
check('no deeply sunken props (base >0.55 under the surface)', sinkers === 0, `sinkers=${sinkers} worst=${worstSink.toFixed(3)}`);

// 2. nothing planted in the lake
const inWater = props.filter((p) => p.y < WATER_Y + 0.05 && Math.hypot((p.x - LAKE.x) / LAKE.a, (p.z - LAKE.z) / LAKE.b) < 1.2).length;
check('no props in the lake water', inWater === 0, `count=${inWater}`);

// 3. the trail stays open: nothing within its corridor (centre ±2.6)
let onTrail = 0;
for (const p of props) {
  if (p.x >= 148 && p.x <= 262 && Math.abs(p.z - trailZ(p.x)) < 2.6) onTrail++;
}
check('nothing stands on the dirt trail', onTrail === 0, `count=${onTrail}`);

// 4. inside the fence: props clear of paved bands, cross streets and plot footprints
const inPlots = (x, z, pad) => cfg.PLOT_POSITIONS.some((pl) => Math.abs(x - pl.x) < 4.5 + pad && Math.abs(z - pl.z) < 4.5 + pad);
const onPaved = (x, z, pad) => cfg.PAVED_Z_BANDS.some(([a, b]) => z > a - pad && z < b + pad) ||
  cfg.CROSS_STREETS.some((c) => Math.abs(x - c.x) < 3.2 + pad && z > c.z0 - pad && z < c.z1 + pad);
const townProps = props.filter((p) => inside(p.x, p.z));
let badTown = 0, worst = '';
for (const p of townProps) {
  const pad = Math.min(2.2, body(p));
  if (inPlots(p.x, p.z, pad) || onPaved(p.x, p.z, pad)) { badTown++; if (!worst) worst = `(${p.x.toFixed(1)},${p.z.toFixed(1)}) s=${p.s.toFixed(2)}`; }
}
check('town props clear of plots and paving', badTown === 0, `count=${badTown} first=${worst}`);

// 5. grounding decals sit at the corner-max of the rendered surface (never buried)
let badBlobs = 0, worstBlob = 0;
for (const b of blobs) {
  if (inside(b.x, b.z)) continue;
  const r = b.s;
  const want = Math.max(meshH(b.x, b.z), meshH(b.x + r, b.z), meshH(b.x - r, b.z), meshH(b.x, b.z + r), meshH(b.x, b.z - r)) + 0.06;
  const d = Math.abs(b.y - want);
  if (d > 1e-3 || b.y < meshH(b.x, b.z)) { badBlobs++; worstBlob = Math.max(worstBlob, d); }
}
check('grounding decals hug the rendered surface', badBlobs === 0, `count=${badBlobs} worst=${worstBlob.toFixed(3)}`);

rmSync(dir, { recursive: true, force: true });
console.log(fail ? `FAIL (${fail})` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
