// Reducer-level tests for the Settings menu and the audio module.
// Bundled by tests/settings.spec.mjs so it runs against the REAL state.tsx.
import { reducer, initial } from '../src/game/state';
import { setVolumes, getVolumes } from '../src/game/audio';

let fails = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`PASS  ${name}`);
  else { fails++; console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

// ── settings flag ───────────────────────────────────────────────────────────
const o1 = reducer({ ...initial, settingsOpen: false }, { t: 'setSettingsOpen', open: true });
check('setSettingsOpen opens the menu', o1.settingsOpen === true);
const o2 = reducer(o1, { t: 'setSettingsOpen', open: false });
check('setSettingsOpen closes the menu', o2.settingsOpen === false);

// ── volumes: clamped, separate channels, unchanged state otherwise ─────────
const v1 = reducer(initial, { t: 'setVolumes', master: 0.5, sfx: 0.25 });
check('setVolumes stores both channels', v1.volumes.master === 0.5 && v1.volumes.sfx === 0.25, v1.volumes);
check('setVolumes leaves the rest of state alone', v1.balance === initial.balance && v1.staked === initial.staked);

const v2 = reducer(initial, { t: 'setVolumes', master: 5, sfx: -1 });
check('setVolumes clamps above 1 and below 0', v2.volumes.master === 1 && v2.volumes.sfx === 0, v2.volumes);

const v3 = reducer(initial, { t: 'setVolumes', master: NaN, sfx: Infinity });
check('setVolumes keeps the current value for non-finite input', v3.volumes.master === initial.volumes.master && v3.volumes.sfx === initial.volumes.sfx, v3.volumes);

// ── audio module: clamp + independent gains (no AudioContext in node = silent) ──
setVolumes({ master: 2, sfx: -3 });
let g = getVolumes();
check('audio setVolumes clamps out-of-range input', g.master === 1 && g.sfx === 0, g);
setVolumes({ master: 0.4, sfx: NaN });
g = getVolumes();
check('audio setVolumes keeps prior value on non-finite input', g.master === 0.4 && g.sfx === 0, g);
setVolumes({ master: 0.7, sfx: 0.8 });
g = getVolumes();
check('audio setVolumes restores defaults', g.master === 0.7 && g.sfx === 0.8, g);

console.log(fails === 0 ? 'ALL SETTINGS REDUCER TESTS PASS' : `${fails} FAILURES`);
export const REDUCER_FAILURES = fails;
