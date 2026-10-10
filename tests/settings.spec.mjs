// Settings + audio tests: reducer-level checks bundled from the real state.tsx
// and audio.ts. (The node backend does not serve the SPA — the dev server is
// vite with a proxy — so there is no HTTP shell check here.)
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';

const outfile = 'tests/.settings-bundle.mjs';
await build({
  entryPoints: ['tests/settings-reducer.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
  jsx: 'automatic',
});
const probe = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });
if (probe.REDUCER_FAILURES) process.exit(1);
