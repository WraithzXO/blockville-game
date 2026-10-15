// Terrain/walker consistency: the resident must stand on the SAME surface the
// hills mesh renders (meshH), never on the raw analytic terrainH that diverges
// from the triangulated mesh on slopes and dips below the lake water near the
// shore. Regression spec for the Chunk 4 fix.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(new URL('..', import.meta.url).pathname, 'package.json'));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => { if (cond) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${detail}`); } };

// bundle WorldTerrain (and its config import) to a temp ESM module
const dir = mkdtempSync(path.join(tmpdir(), 'bv-terrain-'));
const out = path.join(dir, 'wt.mjs');
const r = spawnSync(require.resolve('esbuild/bin/esbuild'), ['src/world/WorldTerrain.ts', '--bundle', '--format=esm', `--outfile=${out}`], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
if (r.status !== 0) { console.error('esbuild failed', r.stderr); process.exit(1); }
const { terrainH, meshH, groundY, canWalk, HILLS, WATER_Y, DOCK, LAKE } = await import(out);

// 1. meshH interpolates the exact mesh grid: identical to terrainH at every vertex
let vmax = 0;
for (let j = 0; j < 121; j += 3) for (let i = 0; i < 153; i += 3) {
  const x = HILLS.x0 + i * HILLS.st, z = HILLS.z0 + j * HILLS.st;
  vmax = Math.max(vmax, Math.abs(meshH(x, z) - terrainH(x, z)));
}
check('meshH equals terrainH at mesh vertices (float32 grid precision)', vmax <= 1e-5, `max=${vmax}`);

// 2. on flat ground the walker height is unchanged (within a hair of analytic)
let flatMax = 0;
for (let x = -120; x <= 120; x += 2) for (let z = -70; z <= 230; z += 2) flatMax = Math.max(flatMax, Math.abs(groundY(x, z) - terrainH(x, z)));
check('town ground height unchanged', flatMax <= 0.02, `max=${flatMax}`);

// 3. nowhere walkable stands below the rendered water surface (the shore-sink bug)
let sink = 0, spot = '';
for (let x = 139; x <= 395; x += 0.25) for (let z = -94; z <= 106; z += 0.25) {
  if (!canWalk(x, z)) continue;
  if (groundY(x, z) < WATER_Y) { sink++; spot = `(${x},${z}) h=${groundY(x, z).toFixed(2)}`; }
}
check('no walkable point below the lake water line', sink === 0, `${sink} spots, worst ${spot}`);

// 4. walkability matches the rendered surface at the shoreline: no point that
//    canWalk allows has its rendered mesh below the water threshold
let wall = 0;
for (let x = 139; x <= 395; x += 0.25) for (let z = -94; z <= 106; z += 0.25) {
  if (canWalk(x, z) && meshH(x, z) < WATER_Y + 0.25 && !onDock(x, z)) wall++;
}
function onDock(x, z) { return x >= DOCK.x0 - 0.5 && x <= DOCK.x1 && Math.abs(z - DOCK.z) <= DOCK.hw; }
check('no invisible water walls between visual surface and collision', wall === 0, `${wall} spots`);

// 5. deep lake stays unwalkable, dock deck stays walkable at deck height
check('lake centre blocked', !canWalk(LAKE.x, LAKE.z));
check('dock deck at deck height', groundY(DOCK.shoreX + 5, DOCK.z) === DOCK.deckY && canWalk(DOCK.shoreX + 5, DOCK.z));

// 6. walker height is continuous along the trail (no vertical jumps the mesh doesn't show)
let maxStep = 0;
for (let x = 140; x < 390; x += 0.1) {
  const z = 6 + 2 * Math.sin(x / 9);
  if (!canWalk(x, z) || !canWalk(x + 0.1, z)) continue;
  maxStep = Math.max(maxStep, Math.abs(groundY(x + 0.1, z) - groundY(x, z)));
}
check('no vertical jumps along the trail', maxStep < 0.2, `max step=${maxStep.toFixed(3)}`);

rmSync(dir, { recursive: true, force: true });
console.log(fail === 0 ? `\nALL PASS (${pass})` : `\nFAILED (${fail}/${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
