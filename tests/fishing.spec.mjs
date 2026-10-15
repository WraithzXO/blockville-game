import assert from 'node:assert/strict';
import { build } from 'esbuild';
const r = await build({ entryPoints: ['src/game/fishingLogic.ts'], bundle: true, format: 'esm', write: false });
const m = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
let junk = 0, fish = 0, N = 100000, pay = 0;
for (let i = 0; i < N; i++) { const c = m.rollCatch(Math.random(), Math.random()); if (c.kind === 'junk') { junk++; assert.equal(c.reward, 0); } else { fish++; assert.ok(c.reward > 0); pay += c.reward; } }
assert.ok(Math.abs(junk / N - 0.7) < 0.01, 'junk ~70%');
assert.ok(Math.abs(fish / N - 0.3) < 0.01, 'fish ~30%');
assert.equal(m.rollCatch(0.1, 0).name, 'Old Boot');
assert.equal(m.rollCatch(0.1, 0.9).name, 'Rusty Can');
assert.equal(m.rollCatch(0.9, 0.99).name, 'Golden Koi');
assert.equal(m.markerAt(0.5, 1), 0.5); assert.equal(m.markerAt(1.5, 1), 0.5); assert.equal(m.markerAt(2, 1), 0);
assert.ok(m.inZone(0.5, 0.55, 0.3) && !m.inZone(0.9, 0.5, 0.3));
{ const now = 1e9, ts = Array.from({ length: 20 }, (_, i) => now - 14 * 60000 + i * 1000);
  assert.equal(m.catchesLeft(ts, now), 0);
  assert.equal(m.catchesLeft(ts.slice(1), now), 1);
  assert.equal(m.msUntilNextCatch(ts, now), ts[0] + 15 * 60000 - now);
  assert.equal(m.catchesLeft(ts, now + 16 * 60000), 20); }
console.log('fishing spec PASS (avg pay/cast', (pay / N).toFixed(1) + ')');
