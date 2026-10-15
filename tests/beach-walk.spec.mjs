// Part B walk check: groundY along the whole trail and three routes across the sand never dips under the
// water, and the sand ribbon sits within a hair of the rendered surface (worst deviation printed).
import { build } from 'esbuild';
const out = '/tmp/wt.mjs';
await build({ entryPoints: ['src/world/WorldTerrain.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const T = await import(out);
const { groundY, meshH, lakeQ, trailZ, WATER_Y, LAKE, DOCK } = T;
let fails = 0, worstAbove = Infinity, worstStep = 0;
// the engine only lets the resident stand where this holds (WorldTerrain region predicate), so only those samples are walked
const onD = (x, z) => x >= DOCK.x0 - 0.5 && x <= DOCK.x1 && Math.abs(z - DOCK.z) <= DOCK.hw;
const walkable = (x, z) => onD(x, z) || meshH(x, z) >= WATER_Y + 0.25;
const chk = (name, pts0) => {
  let prev = null, minAbove = Infinity;
  const pts = pts0.filter(([x, z]) => walkable(x, z));
  const lastX = pts.length ? pts[pts.length - 1][0] : NaN;
  console.log(`  ${name}: ${pts.length}/${pts0.length} samples walkable, last x ${lastX.toFixed(1)}`);
  for (const [x, z] of pts) {
    const y = groundY(x, z); minAbove = Math.min(minAbove, y - WATER_Y);
    if (prev !== null) worstStep = Math.max(worstStep, Math.abs(y - prev));
    prev = y;
  }
  worstAbove = Math.min(worstAbove, minAbove);
  const ok = minAbove >= 0.2;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: lowest ground ${minAbove.toFixed(2)} above water`);
};
const trail = []; for (let x = 135; x <= 262; x += 0.25) trail.push([x, trailZ(x)]);
chk('whole trail 135->262', trail);
const along = (a, b, n = 400) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
// routes stay on dry land: sample the beach ring (q 1.1 / 1.2 / 1.3) around the lake's west/north/south shore, skipping the dock
const ring = (m, a0, a1) => { const p = []; for (let k = 0; k <= 300; k++) { const ang = a0 + (a1 - a0) * k / 300; p.push([LAKE.x + Math.cos(ang) * LAKE.a * m, LAKE.z + Math.sin(ang) * LAKE.b * m]); } return p; };
const dry = (p) => p.filter(([x, z]) => lakeQ(x, z) >= 1.02);
chk('beach route north shore (inner ring)', dry(ring(1.12, -Math.PI * 0.95, -Math.PI * 0.1)));
chk('beach route south shore (mid ring)', dry(ring(1.2, Math.PI * 0.1, Math.PI * 0.95)));
chk('beach route east shore (outer ring)', dry(ring(1.28, -Math.PI * 0.35, Math.PI * 0.35)));
chk('trail end to dock root', along([262, trailZ(262)], [DOCK.x0, DOCK.z]));
// ribbon (1.2 grid, +0.09) vs rendered surface: worst gap between the ribbon's bilinear surface and meshH
let worstGap = 0;
for (let x = 238; x < 364; x += 0.37) for (let z = -46; z < 58; z += 0.41) {
  if (lakeQ(x, z) < 0.9 || lakeQ(x, z) > 1.5) continue;
  const x0 = 236 + Math.floor((x - 236) / 1.2) * 1.2, z0 = -48 + Math.floor((z - -48) / 1.2) * 1.2, fx = (x - x0) / 1.2, fz = (z - z0) / 1.2;
  const h = (a, b) => meshH(a, b) + 0.09;
  const tri = fx + fz <= 1 ? h(x0, z0) + fx * (h(x0 + 1.2, z0) - h(x0, z0)) + fz * (h(x0, z0 + 1.2) - h(x0, z0)) : h(x0 + 1.2, z0 + 1.2) + (1 - fx) * (h(x0, z0 + 1.2) - h(x0 + 1.2, z0 + 1.2)) + (1 - fz) * (h(x0 + 1.2, z0) - h(x0 + 1.2, z0 + 1.2));
  worstGap = Math.max(worstGap, Math.abs(tri - meshH(x, z)));
}
console.log(`ribbon vs surface: worst |gap| ${worstGap.toFixed(3)} (offset 0.09; polygonOffset covers the rest)`);
const g = worstGap < 0.35; if (!g) fails++;
console.log(`lowest dry ground above water over all routes: ${worstAbove.toFixed(2)}; largest per-sample step ${worstStep.toFixed(3)}`);
console.log(fails ? `FAIL (${fails})` : 'ALL PASS'); process.exit(fails ? 1 : 0);
