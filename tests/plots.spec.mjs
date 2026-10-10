// Front-row plot spec: the plots in front of the Blockville Store and the
// Furniture Store are retired, plot ids stay stable, and no remaining plot
// sits in either store's entrance zone.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';

const outfile = 'tests/.plots-bundle.mjs';
await build({
  entryPoints: ['src/game/config.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
});
const { PLOT_POSITIONS, RETIRED_PLOT_IDS, STORE_POS, TOTAL_PLOTS } = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let fails = 0;
const check = (name, ok) => {
  if (!ok) { fails++; console.log('FAIL', name); } else console.log('ok  ', name);
};

const furnitureX = STORE_POS.x + 13;
const retired = PLOT_POSITIONS.filter((p) => RETIRED_PLOT_IDS.includes(p.id));

check('exactly the two front-row plots are retired', RETIRED_PLOT_IDS.length === 2 && retired.length === 2);
check('retired plots are the ones on the front row at z = -10', retired.every((p) => p.z === -10));
check('plot count is unchanged (ids not renumbered)', PLOT_POSITIONS.length === TOTAL_PLOTS);
check('plot ids are still 0..n-1 in order', PLOT_POSITIONS.every((p, i) => p.id === i));

// Entrance zone: a 10-wide strip in front of each store, from the road edge back to the store front.
const inEntrance = (p, cx) =>
  Math.abs(p.x - cx) < 4.5 + 5 && p.z > STORE_POS.z + 3 && p.z < -5.2 + 4.5;
const blocking = PLOT_POSITIONS.filter(
  (p) => !RETIRED_PLOT_IDS.includes(p.id) && (inEntrance(p, STORE_POS.x) || inEntrance(p, furnitureX)),
);
check('no remaining plot sits in front of either store', blocking.length === 0);

console.log(fails === 0 ? 'ALL PLOT TESTS PASS' : `${fails} PLOT TEST(S) FAILED`);
process.exit(fails ? 1 : 0);
