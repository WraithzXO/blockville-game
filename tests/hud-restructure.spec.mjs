// HUD-restructure spec: drives the real UI in headless Chrome (CDP, same
// pattern as browser.spec.mjs) and verifies the six UI-only changes of the
// HUD/menu chunk: log size, top-left/top-right zones, brand removal,
// build-hint overlay removal, Treasury/Tokenomics HUD entry points, and the
// live Tokenomics panel. All numbers are cross-checked against the live
// backend /api/tokenomics response — never against hardcoded copies.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import WebSocket from 'ws';
import { startServer } from './harness.mjs';

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, what, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await WAIT(250);
  }
  throw new Error(`${what} never came up`);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  async waitFor(expr, label, timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = await this.eval(expr);
      if (v) return v;
      await WAIT(200);
    }
    throw new Error(`timeout waiting for ${label}`);
  }
}

async function launchChrome(port) {
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/bv-chrome-${port}`, '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });
  await waitHttp(`http://127.0.0.1:${port}/json/list`, 'chrome devtools');
  return proc;
}

async function connectPage(cdpPort, url) {
  let target;
  try {
    target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json();
  } catch {
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.url === 'about:blank');
  }
  if (!target) throw new Error('could not create a new page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (url) {
    await cdp.send('Page.navigate', { url });
    await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  }
  return { cdp, close: async () => {
    try { await cdp.send('Target.closeTarget', { targetId: target.id }); } catch { /* already gone */ }
    ws.close();
  } };
}

// full boot: navigate, enter demo mode, wait for the 3D canvas
async function boot(cdp, vitePort, name = 'Tester') {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=${name}` });
  await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  const hasGate = await cdp.eval(`!!document.querySelector('#resident-name')`);
  if (hasGate) {
    await cdp.eval(`(() => {
      const el = document.querySelector('#resident-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(name)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await cdp.eval(`document.querySelector('.name-submit').click(); true`);
  }
  const hasModes = await cdp.waitFor(
    `[!!document.querySelector('canvas'), [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Demo mode')].some(x => x)`,
    'canvas or mode screen',
    20_000,
  );
  if (hasModes[1]) {
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Demo mode').click(); true`);
  }
  await cdp.waitFor(`!!document.querySelector('canvas')`, 'game canvas', 25_000);
  await WAIT(1200); // let the engine run its first frames
}

const MENU_BTN = (label) => `[...document.querySelectorAll('.menu .mbtn')].some(b => b.textContent.includes('${label}'))`;
const CLICK_MENU_BTN = (label) => `[...document.querySelectorAll('.menu .mbtn')].find(b => b.textContent.includes('${label}')).click(); true`;
const MODAL_OPEN = (title) => `[...document.querySelectorAll('.modal-head h2')].some(h => h.textContent.includes('${title}'))`;
// several modals can be mounted at once (e.g. the spawn notice); always scope
// text reads and close clicks to the modal whose heading matches the title
const MODAL_FOR = (title) => `[...document.querySelectorAll('.modal')].find(m => [...m.querySelectorAll('.modal-head h2')].some(h => h.textContent.includes('${title}')))`;

const tests = [
  ['brand element and town-stage sub are gone from the HUD', async ({ cdp }) => {
    const gone = await cdp.eval(`!document.querySelector('.brand') && !document.querySelector('.brand-sub') && !document.querySelector('.brand-name')`);
    if (!gone) throw new Error('a .brand/.brand-name/.brand-sub element is still rendered');
    // the stage vocabulary is gone from the shipped client code (vite dev serves source)
    const css = await cdp.eval(`fetch('/src/game/config.ts').then(r => r.text())`);
    if (css.includes('Outpost')) throw new Error("'Outpost' stage label still present in config.ts");
  }],

  ['top-left holds only non-interactive info; top-right only controls; no overlap', async ({ cdp }) => {
    const state = await cdp.eval(`(() => {
      const left = document.querySelector('.hud-left');
      const right = document.querySelector('.hud-right');
      if (!left || !right) return null;
      const rectsOverlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const lr = left.getBoundingClientRect(), rr = right.getBoundingClientRect();
      return {
        leftPills: left.querySelectorAll('.pill').length,
        leftBadge: !!left.querySelector('.badge'),
        leftButtons: left.querySelectorAll('button').length,
        rightPills: right.querySelectorAll('.pill').length,
        rightButtons: right.querySelectorAll('.menu .mbtn').length,
        overlap: rectsOverlap(lr, rr),
        menuLabels: [...right.querySelectorAll('.menu .mbtn')].map(b => b.textContent.trim()),
      };
    })()`);
    if (!state) throw new Error('.hud-left/.hud-right zones missing');
    if (state.leftPills < 4 || !state.leftBadge) throw new Error('top-left is missing info pills/badge');
    if (state.leftButtons !== 0) throw new Error(`top-left contains ${state.leftButtons} clickable elements`);
    if (state.rightPills !== 0) throw new Error('top-right still contains non-interactive pills');
    if (state.rightButtons < 6) throw new Error(`top-right has only ${state.rightButtons} menu buttons`);
    if (state.overlap) throw new Error('top-left and top-right zones overlap');
    for (const label of ['Store', 'Market', 'Character', 'Treasury', 'Tokenomics', 'Settings']) {
      if (!state.menuLabels.some((t) => t.includes(label))) throw new Error(`menu button missing: ${label}`);
    }
  }],

  ['activity log is 7% larger, shows 5 entries collapsed, expands on click', async ({ cdp }) => {
    const log = await cdp.eval(`(() => {
      const el = document.querySelector('.activity-log');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { width: parseFloat(cs.width), expanded: el.classList.contains('expanded'), rows: el.querySelectorAll('.feed-item').length };
    })()`);
    if (!log) throw new Error('.activity-log not found');
    // 238px × 1.07 ≈ 254.7 → 255px
    if (Math.abs(log.width - 255) > 1.5) throw new Error(`log width ${log.width}px is not the expected 255px (238 + 7%)`);
    if (log.expanded) throw new Error('log starts expanded');
    if (log.rows > 5) throw new Error(`log shows ${log.rows} entries collapsed (max 5)`);
    await cdp.eval(`document.querySelector('.log-tabs').click(); true`);
    await cdp.waitFor(`document.querySelector('.activity-log').classList.contains('expanded')`, 'log expand');
    await cdp.eval(`document.querySelector('.log-tabs').click(); true`);
    await cdp.waitFor(`!document.querySelector('.activity-log').classList.contains('expanded')`, 'log collapse');
  }],

  ['build-hint overlay removed everywhere (no far-state element or CSS)', async ({ cdp }) => {
    // fresh session: no construction in progress → the panel must not exist
    const absent = await cdp.eval(`!document.querySelector('.build-hud')`);
    if (!absent) throw new Error('.build-hud rendered without an active construction near the player');
    // and the out-of-range (anywhere-on-map) CSS is gone from the stylesheet source
    const css = await cdp.eval(`fetch('/src/styles.css').then(r => r.text())`);
    if (css.includes('build-hud.far')) throw new Error('.build-hud.far rules still present in styles.css');
  }],

  ['Settings no longer lists Treasury/Tokenomics; Terms & Disclaimer intact', async ({ cdp }) => {
    await cdp.eval(CLICK_MENU_BTN('Settings'));
    await cdp.waitFor(MODAL_OPEN('Settings'), 'settings modal');
    const text = await cdp.eval(`${MODAL_FOR('Settings')}.innerText`);
    // headings are CSS-uppercased (text-transform), so compare case-insensitively
    if (/treasury/i.test(text)) throw new Error('Settings still mentions Treasury');
    if (/tokenomics/i.test(text)) throw new Error('Settings still mentions Tokenomics');
    if (!/terms/i.test(text)) throw new Error('Terms & Disclaimer missing from Settings');
    await cdp.eval(`${MODAL_FOR('Settings')}.querySelector('.x').click(); true`);
    await cdp.waitFor(`!${MODAL_OPEN('Settings')}`, 'settings closed');
  }],

  ['HUD Treasury button opens the existing Treasury panel', async ({ cdp }) => {
    await cdp.eval(CLICK_MENU_BTN('Treasury'));
    await cdp.waitFor(MODAL_OPEN('Blockville Treasury'), 'treasury modal');
    const text = await cdp.eval(`${MODAL_FOR('Blockville Treasury')}.innerText`);
    if (!/treasury ledger/i.test(text)) throw new Error('Treasury panel content changed');
    await cdp.eval(`${MODAL_FOR('Blockville Treasury')}.querySelector('.x').click(); true`);
    await cdp.waitFor(`!${MODAL_OPEN('Blockville Treasury')}`, 'treasury closed');
  }],

  ['HUD Tokenomics button opens a live panel matching /api/tokenomics', async ({ cdp }) => {
    await cdp.eval(CLICK_MENU_BTN('Tokenomics'));
    await cdp.waitFor(MODAL_OPEN('Tokenomics'), 'tokenomics modal');
    // wait for the live config to load (multiplier chips render only with data)
    await cdp.waitFor(`!!document.querySelector('.tk-mult')`, 'tokenomics config loaded', 15_000);
    const m = MODAL_FOR('Tokenomics');
    const check = await cdp.eval(`(async () => {
      const r = await fetch('/api/tokenomics');
      if (!r.ok) return { error: 'api ' + r.status };
      const cfg = (await r.json()).tokenomics;
      const text = ${MODAL_FOR('Tokenomics')}.innerText;
      const pct = (x) => Math.round(x * 100);
      const needs = [
        String(cfg.plotScore.basePlotPoints),
        '×' + cfg.plotScore.upgradeMultipliers[0].toFixed(2),
        '×' + cfg.plotScore.upgradeMultipliers[1].toFixed(2),
        '×' + cfg.plotScore.upgradeMultipliers[2].toFixed(2),
        '×' + cfg.plotScore.upgradeMultipliers[3].toFixed(2),
        '×' + cfg.plotScore.gardenMultiplier.toFixed(2),
        cfg.cycle.intervalMinutes + ' minutes',
        pct(cfg.cycle.distributePct) + '%',
        pct(cfg.fees.buybackPct) + '%',
        cfg.fees.gasSweepThresholdSol + ' SOL',
        cfg.entitlement.tokensPerPlot.toLocaleString(),
        String(cfg.entitlement.maxPlots),
        'NPCs are excluded',
      ];
      const missing = needs.filter((n) => !text.includes(n));
      return { missing };
    })()`);
    if (check.error) throw new Error(check.error);
    if (check.missing.length) throw new Error(`panel missing live values: ${check.missing.join(' | ')}`);
    // per-building rows: one row per building type from the backend config
    const rows = await cdp.eval(`${MODAL_FOR('Tokenomics')}.querySelectorAll('.list-row').length`);
    const cfgTypes = await cdp.eval(`fetch('/api/tokenomics').then(r => r.json()).then(d => Object.keys(d.tokenomics.plotScore.buildBlocks).length)`);
    if (rows < cfgTypes) throw new Error(`expected ≥${cfgTypes} per-building rows, found ${rows}`);
    await cdp.eval(`${MODAL_FOR('Tokenomics')}.querySelector('.x').click(); true`);
    await cdp.waitFor(`!${MODAL_OPEN('Tokenomics')}`, 'tokenomics closed');
  }],
];

// ── run ─────────────────────────────────────────────────────────────────────
let failed = 0;
// the browser client dials ws://<host>:8787 (see net.ts), so the game server
// must listen exactly there for the real backend connection
process.env.PORT = '8787';
const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const PROFILE = `/tmp/bv-chrome-${cdpPort}`;
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const chrome = await launchChrome(cdpPort);
try {
  await waitHttp(`http://127.0.0.1:${vitePort}/`, 'vite dev server');
  const ctx = { vitePort, cdpPort };
  const { cdp, close } = await connectPage(cdpPort, '');
  await boot(cdp, vitePort, 'HudTester');
  for (const [name, fn] of tests) {
    try { await fn({ ...ctx, cdp }); console.log(`PASS  ${name}`); }
    catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message).slice(0, 400)}`); }
  }
  await close();
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
  try { vite.kill('SIGKILL'); } catch { /* already gone */ }
  stopServer();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* already gone */ }
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
