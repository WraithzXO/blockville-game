// Activity-log spec: bundles the real reducer and checks the Town/Personal
// log behaviour (toast cap, ordering, unread badge).
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';

const outfile = 'tests/.log-bundle.mjs';
await build({
  entryPoints: ['tests/log-reducer.ts'],
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
