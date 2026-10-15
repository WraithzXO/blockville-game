// Whitepaper spec: drives the real UI in headless Chrome (CDP, same pattern
// as hud-restructure.spec.mjs) and verifies the Whitepaper chunk: the entry
// point inside Settings next to Terms & Disclaimer, the readable document
// panel with section navigation, live figures cross-checked against the live
// backend /api/tokenomics response, and that no gameplay is gated on it.
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

// several modals can be mounted at once (e.g. the spawn notice); always scope
// text reads and clicks to the modal whose heading matches the title
const MODAL_OPEN = (title) => `[...document.querySelectorAll('.modal-head h2')].some(h => h.textContent.includes('${title}'))`;
const MODAL_FOR = (title) => `[...document.querySelectorAll('.modal')].find(m => [...m.querySelectorAll('.modal-head h2')].some(h => h.textContent.includes('${title}')))`;
const openSettings = () => `[...document.querySelectorAll('.menu .mbtn')].find(b => b.textContent.includes('Settings')).click(); true`;
const TAB_BY_LABEL = (label) => `[...document.querySelectorAll('.wp-tab')].find(b => b.textContent.trim() === '${label}')`;
const SECTION_HEAD = () => `document.querySelector('.wp-heading').textContent`;

const tests = [
  ['Settings has a Whitepaper entry next to Terms & Disclaimer, and it opens the document panel', async ({ cdp }) => {
    await cdp.eval(openSettings());
    await cdp.waitFor(MODAL_OPEN('Settings'), 'settings modal');
    const modal = `${MODAL_FOR('Settings')}`;
    const hasEntry = await cdp.eval(`(() => {
      const m = ${modal};
      const wp = m.querySelector('.wp-entry');
      const terms = m.querySelector('details.terms-box');
      if (!wp || !terms) return false;
      // "near the Terms & Disclaimer section": the whitepaper entry follows it directly
      if (terms.nextElementSibling !== wp) return false;
      return [...wp.querySelectorAll('.settings-subhead')].some(h => h.textContent.includes('Whitepaper'));
    })()`);
    if (!hasEntry) throw new Error('Whitepaper entry missing or not placed next to Terms & Disclaimer');
    await cdp.eval(`[...${modal}.querySelectorAll('button')].find(b => b.textContent.includes('Open the whitepaper')).click(); true`);
    await cdp.waitFor(MODAL_OPEN('Whitepaper'), 'whitepaper modal');
    const settingsGone = await cdp.waitFor(`!${MODAL_OPEN('Settings')}`, 'settings closed when the document opens', 5000);
    if (!settingsGone) throw new Error('Settings should close while the whitepaper is open');
    const tabs = await cdp.eval(`[...document.querySelectorAll('.wp-tab')].map(b => b.textContent.trim())`);
    if (tabs.length !== 7) throw new Error(`expected 7 section tabs, found ${tabs.length}: ${tabs.join(', ')}`);
  }],

  ['Section navigation works: chips, pager, disabled bounds', async ({ cdp }) => {
    const labels = await cdp.eval(`[...document.querySelectorAll('.wp-tab')].map(b => b.textContent.trim())`);
    for (let i = 0; i < labels.length; i++) {
      await cdp.eval(`${TAB_BY_LABEL(labels[i])}.click(); true`);
      const head = await cdp.waitFor(`(() => { const h = document.querySelector('.wp-heading'); return h && h.textContent.trim() === ${JSON.stringify(labels[i])}; })()`, `section ${labels[i]} shown`, 4000);
      if (!head) throw new Error(`heading did not switch to ${labels[i]}`);
      const count = await cdp.eval(`document.querySelector('.wp-count').textContent.trim()`);
      if (count !== `${i + 1} / ${labels.length}`) throw new Error(`pager shows "${count}", expected "${i + 1} / ${labels.length}"`);
    }
    // at the last section Next is disabled; step back twice via the pager
    const nextDisabled = await cdp.eval(`[...document.querySelectorAll('.wp-pager button')].find(b => b.textContent.includes('Next')).disabled`);
    if (!nextDisabled) throw new Error('Next should be disabled on the last section');
    await cdp.eval(`[...document.querySelectorAll('.wp-pager button')].find(b => b.textContent.includes('Previous')).click(); true`);
    const back = await cdp.waitFor(`${SECTION_HEAD()} === 'Risk'`, 'pager steps back to Risk', 4000);
    if (!back) throw new Error('Previous did not step back a section');
    const firstPrevDisabled = await cdp.eval(`[...document.querySelectorAll('.wp-pager button')].find(b => b.textContent.includes('Previous')).disabled`);
    if (firstPrevDisabled) throw new Error('Previous should be enabled on a middle section');
  }],

  ['Live figures in the document match /api/tokenomics exactly', async ({ cdp }) => {
    await cdp.eval(`${TAB_BY_LABEL('Core loop')}.click(); true`);
    await cdp.waitFor(`${SECTION_HEAD()} === 'Core loop'`, 'core loop section', 4000);
    const cfg = await cdp.eval(`fetch('/api/tokenomics').then(r => r.json()).then(d => d.tokenomics)`);
    const check = (text, needs, what) => {
      const missing = needs.filter((n) => !text.includes(n));
      if (missing.length) throw new Error(`${what} missing live values: ${missing.join(' | ')}`);
    };
    let text = await cdp.eval(`${MODAL_FOR('Whitepaper')}.querySelector('.wp-page').innerText`);
    check(text, [cfg.entitlement.tokensPerPlot.toLocaleString(), String(cfg.entitlement.maxPlots)], 'core loop');
    await cdp.eval(`${TAB_BY_LABEL('Tokenomics')}.click(); true`);
    await cdp.waitFor(`${SECTION_HEAD()} === 'Tokenomics'`, 'tokenomics section', 4000);
    text = await cdp.eval(`${MODAL_FOR('Whitepaper')}.querySelector('.wp-page').innerText`);
    const pct = (x) => Math.round(x * 100);
    check(text, [
      String(cfg.plotScore.basePlotPoints),
      '×' + cfg.plotScore.upgradeMultipliers[0].toFixed(2),
      '×' + cfg.plotScore.upgradeMultipliers[1].toFixed(2),
      '×' + cfg.plotScore.upgradeMultipliers[2].toFixed(2),
      '×' + cfg.plotScore.upgradeMultipliers[3].toFixed(2),
      '×' + cfg.plotScore.gardenMultiplier.toFixed(2),
      cfg.cycle.intervalMinutes + ' minutes',
      pct(cfg.cycle.distributePct) + '%',
    ], 'tokenomics summary');
    // summary stays a summary: it must point to the Tokenomics panel instead of duplicating it
    if (!text.toLowerCase().includes('tokenomics panel')) throw new Error('tokenomics summary should reference the Tokenomics panel');
    await cdp.eval(`${TAB_BY_LABEL('Treasury & fees')}.click(); true`);
    await cdp.waitFor(`${SECTION_HEAD()} === 'Treasury & fees'`, 'treasury section', 4000);
    text = await cdp.eval(`${MODAL_FOR('Whitepaper')}.querySelector('.wp-page').innerText`);
    check(text, [pct(cfg.fees.buybackPct) + '%', pct(cfg.fees.gasReservePct) + '%', cfg.fees.gasSweepThresholdSol + ' SOL'], 'treasury & fee flow');
  }],

  ['Risk summary points at Terms & Disclaimer; future section teases without promises', async ({ cdp }) => {
    await cdp.eval(`${TAB_BY_LABEL('Risk')}.click(); true`);
    await cdp.waitFor(`${SECTION_HEAD()} === 'Risk'`, 'risk section', 4000);
    const risk = await cdp.eval(`${MODAL_FOR('Whitepaper')}.querySelector('.wp-page').innerText`);
    if (!risk.includes('Terms')) throw new Error('risk summary should point at Terms & Disclaimer');
    if (!risk.includes('not guaranteed')) throw new Error('risk summary should say distributions are not guaranteed');
    await cdp.eval(`${TAB_BY_LABEL('Future')}.click(); true`);
    await cdp.waitFor(`${SECTION_HEAD()} === 'Future'`, 'future section', 4000);
    const future = await cdp.eval(`${MODAL_FOR('Whitepaper')}.querySelector('.wp-page').innerText`);
    const lines = future.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3 || lines.length > 5) throw new Error(`expected 3-5 teaser lines, got ${lines.length}`);
    // no dates, no promises: banish future tense commitments and specifics
    const banned = /will (launch|add|release|pay|get)|coming (soon|in \d)|Q[1-4]\b|20\d\d|roadmap|guarantee/i;
    if (banned.test(future)) throw new Error(`future section reads like a promise: ${future.slice(0, 200)}`);
  }],

  ['Settings still functions; closing the whitepaper returns to a live game; no gameplay gating', async ({ cdp }) => {
    await cdp.eval(`${MODAL_FOR('Whitepaper')}.querySelector('.x').click(); true`);
    await cdp.waitFor(`!${MODAL_OPEN('Whitepaper')}`, 'whitepaper closed');
    // the game never requires the whitepaper: the HUD holds no second entry point
    const hudEntry = await cdp.eval(`[...document.querySelectorAll('.menu .mbtn')].some(b => b.textContent.includes('Whitepaper'))`);
    if (hudEntry) throw new Error('the whitepaper must not gain a HUD entry point');
    // settings still fully functional: sliders, terms, whitepaper entry
    await cdp.eval(openSettings());
    await cdp.waitFor(MODAL_OPEN('Settings'), 'settings reopens');
    const ok = await cdp.eval(`(() => {
      const m = ${MODAL_FOR('Settings')};
      return {
        sliders: m.querySelectorAll('input[type="range"]').length,
        terms: !!m.querySelector('details.terms-box summary'),
        wp: !!m.querySelector('.wp-entry'),
      };
    })()`);
    if (ok.sliders !== 2) throw new Error(`expected 2 volume sliders, found ${ok.sliders}`);
    if (!ok.terms) throw new Error('Terms & Disclaimer section missing from Settings');
    if (!ok.wp) throw new Error('Whitepaper entry missing from Settings');
    await cdp.eval(`${MODAL_FOR('Settings')}.querySelector('.x').click(); true`);
    await cdp.waitFor(`!${MODAL_OPEN('Settings')}`, 'settings closed');
    // canvas keeps running — the document is purely optional reading
    const alive = await cdp.eval(`!!document.querySelector('canvas')`);
    if (!alive) throw new Error('game canvas disappeared after closing panels');
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
  await boot(cdp, vitePort, 'WpTester');
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
