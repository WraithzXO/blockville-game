// Real-browser interaction tests. Boots the game server, a vite dev server and
// headless Chrome (driven over CDP with the repo's own `ws` dependency — no
// extra tooling), then drives the actual UI: prompts, key presses, panels.
// Covers the Phase-1 Issue 7 interactions that cannot be verified at the
// WebSocket level, including a genuine two-browser-session join.
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
  // poll until truthy or timeout — event-ish, bounded, no fixed sleeps
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
  // a fresh tab per page so tests never attach to a previous test's session
  let target;
  try {
    target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json();
  } catch {
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.url === 'about:blank');
  }
  if (!target) throw new Error('could not create a new page target');
  const page = target;
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (url) {
    await cdp.send('Page.navigate', { url });
    await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  }
  return { cdp, close: async () => {
    try { await cdp.send('Target.closeTarget', { targetId: page.id }); } catch { /* already gone */ }
    ws.close();
  } };
}

// full boot: navigate, enter demo mode, wait for the 3D canvas
async function boot(cdp, vitePort, query, name = 'Tester') {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/${query}` });
  await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  // the name gate and mode screen only appear the first time (the name and
  // mode persist in localStorage) — handle both paths
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
  await WAIT(1500); // let the engine run its first frames
}

const PROMPT = `(document.querySelector('.interact-prompt')?.textContent?.trim() ?? null)`;

const tests = [
  ['shopkeeper prompt shows and E opens the store', async (ctx) => {
    const { cdp, close: closePage } = await connectPage(ctx.cdpPort, '');
    await boot(cdp, ctx.vitePort, '?sx=0&sz=-19.6');
    await cdp.waitFor(`${PROMPT} && ${PROMPT}.includes('Talk')`, 'Talk prompt', 8_000);
    const prompt = await cdp.eval(PROMPT);
    if (!prompt.includes('Talk')) throw new Error(`wrong prompt: ${prompt}`);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); true`);
    await cdp.waitFor(`!!document.querySelector('.store-sections')`, 'store panel', 8_000);
    closePage();
  }],

  ['store purchase deducts the demo balance', async (ctx) => {
    const { cdp, close: closePage } = await connectPage(ctx.cdpPort, '');
    await boot(cdp, ctx.vitePort, '?sx=0&sz=-19.6');
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); true`);
    await cdp.waitFor(`!!document.querySelector('.store-sections')`, 'store panel', 8_000);
    const before = await cdp.waitFor(`parseInt((document.querySelector('.dock-foot')?.textContent ?? '').replace(/[^0-9]/g, ''), 10)`, 'balance', 5_000);
    const buyable = await cdp.eval(`(() => { const b = [...document.querySelectorAll('.store-sections .card:not(.locked)')][0]; if (!b) return false; b.click(); return true; })()`);
    if (!buyable) throw new Error('no affordable store item to buy');
    await cdp.waitFor(`parseInt((document.querySelector('.dock-foot')?.textContent ?? '').replace(/[^0-9]/g, ''), 10) < ${before}`, 'balance drop', 5_000);
    closePage();
  }],

  ['furniture store opens from its E prompt', async (ctx) => {
    const { cdp, close: closePage } = await connectPage(ctx.cdpPort, '');
    await boot(cdp, ctx.vitePort, '?sx=13&sz=-19.6');
    await cdp.waitFor(`${PROMPT} && ${PROMPT}.includes('Furniture')`, 'furniture prompt', 8_000);
    const prompt = await cdp.eval(PROMPT);
    if (!prompt.includes('Furniture')) throw new Error(`wrong prompt: ${prompt}`);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); true`);
    await cdp.waitFor(`document.body.textContent.includes('Blockville Furniture Store')`, 'furniture panel', 8_000);
    closePage();
  }],

  ['walking moves the resident and object prompts appear at the plaza', async (ctx) => {
    const { cdp, close: closePage } = await connectPage(ctx.cdpPort, '');
    await boot(cdp, ctx.vitePort, '');
    // a previous session's position can persist — start from open ground
    await cdp.waitFor(`window.__bv ? window.__bv.playerPos() : null`, 'debug hook', 8_000);
    await cdp.eval(`window.__bv.teleport(0, 8); true`);
    const start = await cdp.eval(`window.__bv.playerPos()`);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); true`);
    const end = await cdp.waitFor(`(() => { const p = window.__bv.playerPos(); return Math.hypot(p.x - ${start.x}, p.z - ${start.z}) > 2 ? p : null; })()`, 'player movement', 15_000);
    await cdp.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' })); true`);
    // and a prompt appears once the resident stands at the plaza fountain
    await cdp.eval(`window.__bv.teleport(0, -12); true`);
    await cdp.waitFor(`${PROMPT} !== null`, 'plaza object prompt', 8_000);
    if (!end) throw new Error('player did not move');
    closePage();
  }],

  ['two browser sessions see each other join', async (ctx) => {
    // pages share one Chrome profile, so the persisted name gate would make
    // the second session restore the first session's name; ?autoname= (dev
    // only) overrides it and pins each session's identity explicitly.
    const { cdp: cdpA, close: closeA } = await connectPage(ctx.cdpPort, '');
    await boot(cdpA, ctx.vitePort, '?sx=0&sz=-19.6&autoname=Alice', 'Alice');
    const { cdp: cdpB, close: closeB } = await connectPage(ctx.cdpPort, '');
    await boot(cdpB, ctx.vitePort, '?sx=2&sz=-19.6&autoname=Bob', 'Bob');
    // A's engine sees a remote player named Bob (and vice versa)
    await cdpA.waitFor(`(window.__bv.devRemotes() || []).some(r => r.name === 'Bob')`, 'A sees Bob', 15_000);
    await cdpB.waitFor(`(window.__bv.devRemotes() || []).some(r => r.name === 'Alice')`, 'B sees Alice', 15_000);
    await closeA(); await closeB();
  }],
];

// ── run ─────────────────────────────────────────────────────────────────────
let failed = 0;
// the browser client dials ws://<host>:8787 (see net.ts), so the game server
// must listen exactly there for real two-session tests
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
  for (const [name, fn] of tests) {
    try { await fn(ctx); console.log(`PASS  ${name}`); }
    catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message).slice(0, 400)}`); }
  }
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
  try { vite.kill('SIGKILL'); } catch { /* already gone */ }
  stopServer();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* already gone */ }
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
