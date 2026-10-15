// NPC chat-bubble range spec: bundles the real range rule and checks the
// show/hide thresholds, the hysteresis band, and the character-width sizing.
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';

const outfile = 'tests/.bubble-bundle.mjs';
await build({
  entryPoints: ['src/game/bubbleRange.ts'],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  logLevel: 'warning',
});
const { nextBubbleNear } = await import(pathToFileURL(outfile).href);

rmSync(outfile, { force: true });

let fails = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`PASS  ${name}`);
  else { fails++; console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

const SHOW = 4.5;   // must match CONFIG.bubbleShowRange
const HIDE = 5.2;   // must match CONFIG.bubbleHideRange
const WIDTH = 0.94; // resident torso width in world units

check('far NPC stays hidden', nextBubbleNear(false, 10) === false);
check('no player (Infinity) stays hidden', nextBubbleNear(false, Infinity) === false);
check('enters range just inside show distance', nextBubbleNear(false, SHOW - 0.01) === true);
check('does not show just outside show distance', nextBubbleNear(false, SHOW + 0.01) === false);
check('stays visible inside hysteresis band', nextBubbleNear(true, (SHOW + HIDE) / 2) === true);
check('hides once beyond hide distance', nextBubbleNear(true, HIDE + 0.01) === false);
check('boundary at hide distance keeps it visible', nextBubbleNear(true, HIDE) === true);
check('show range is 4 to 5 character widths', SHOW >= 4 * WIDTH && SHOW <= 5 * WIDTH, { SHOW, WIDTH });
check('hide range is wider than show range (hysteresis band)', HIDE > SHOW);

// no flicker: sweep a slow walk back and forth across the thresholds
let near = false, toggles = 0;
const path = [];
for (let d = 8; d >= 3; d -= 0.05) path.push(d);
for (let d = 3; d <= 8; d += 0.05) path.push(d);
for (const d of [...path, ...[4.6, 4.5, 4.6, 4.5, 4.6].map((x) => x + 0.6)]) {
  const next = nextBubbleNear(near, d);
  if (next !== near) toggles++;
  near = next;
}
check('single approach/retreat toggles exactly twice', toggles === 2, { toggles });

console.log(fails ? `BUBBLE RANGE FAILURES: ${fails}` : 'ALL BUBBLE RANGE TESTS PASS');
process.exit(fails ? 1 : 0);
