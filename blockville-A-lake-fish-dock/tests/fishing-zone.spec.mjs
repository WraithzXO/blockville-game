// Part C: fishing gate. Fishable zone area, per-position PASS/FAIL, and that every cast lands on deep water.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const out = '/tmp/fz.mjs';
await build({ entryPoints: ['src/game/fishSpot.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const S = await import(out);
await build({ entryPoints: ['src/world/WorldTerrain.ts'], bundle: true, format: 'esm', outfile: '/tmp/fz-t.mjs', logLevel: 'silent' });
const T = await import('/tmp/fz-t.mjs');
const { DOCK, WATER_Y, lakeQ, meshH, canWalk } = T;
// area before (old box) vs after, on a 0.5 grid
const old = (x, z) => x >= DOCK.x1 - 5 && x <= DOCK.x1 + 0.3 && Math.abs(z - DOCK.z) <= DOCK.hw;
let aOld = 0, aNew = 0, aDock = 0, bad = 0, casts = 0;
for (let x = 139; x <= 395; x += 0.5) for (let z = -94; z <= 106; z += 0.5) {
  const cell = 0.25;
  if (old(x, z)) aOld += cell;
  const sp = S.fishSpot(x, z);
  if (sp) {
    aNew += cell; if (T.onDock(x, z)) aDock += cell;
    assert.ok(canWalk(x, z), `fishable but not walkable at ${x},${z}`);
    for (let k = 0; k < 3; k++) {
      const t = S.castTarget(x, z, sp, Math.random(), Math.random()); casts++;
      if (!(lakeQ(t.x, t.z) < 1 && meshH(t.x, t.z) < WATER_Y - 0.3)) bad++;
    }
  }
}
console.log(`fishable area before ${aOld.toFixed(1)} sq units, after ${aNew.toFixed(1)} (dock ${aDock.toFixed(1)}, shore ${(aNew - aDock).toFixed(1)}); dock deck ${(DOCK.x1 - DOCK.x0 + 0.5) * DOCK.hw * 2} sq units`);
assert.equal(bad, 0, `${bad}/${casts} casts landed off deep water`);
const at = (n, x, z, want) => { const ok = !!S.fishSpot(x, z) === want; console.log(`${ok ? 'PASS' : 'FAIL'} ${n} (${x.toFixed(1)}, ${z.toFixed(1)}) fishable=${!!S.fishSpot(x, z)}`); assert.ok(ok, n); };
at('dock root', DOCK.x0, DOCK.z, true);
at('dock middle', (DOCK.x0 + DOCK.x1) / 2, DOCK.z, true);
at('dock end', DOCK.x1 - 1, DOCK.z, true);
// sand points: dry land (walkable) on the west, north, south shore
const pick = (ang) => { for (let r = 1.03; r < 1.3; r += 0.005) { const x = T.LAKE.x + Math.cos(ang) * T.LAKE.a * r, z = T.LAKE.z + Math.sin(ang) * T.LAKE.b * r; if (lakeQ(x, z) >= 1.0 && meshH(x, z) >= WATER_Y + 0.25) return [x, z]; } };
for (const [n, a] of [['sand west', Math.PI * 0.85], ['sand north', -Math.PI / 2], ['sand south', Math.PI / 2]]) { const p = pick(a); assert.ok(p, n); at(n, p[0], p[1], true); }
at('plaza', 0, -10, false);
at('trail road end', 160, T.trailZ(160), false);
// in the water / on wet sand below the walk limit
at('in shallows', T.LAKE.x - 20, T.LAKE.z, false);
console.log('fishing zone spec PASS');
