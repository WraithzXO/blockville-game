// Placement regression test: bundles the real BuildingFactory + config +
// WorldRoads and asserts no building type/level/plot combination overlaps a
// road, sidewalk or curb. See tests/placement-audit.ts for the audit itself.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';

const outfile = 'tests/.placement-bundle.mjs';
await build({
  entryPoints: ['tests/placement-audit.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
});
await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });
