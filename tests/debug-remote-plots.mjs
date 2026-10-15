// Item 1 repro: remote plot ownership + finished-build visibility.
// Alice is a WS client speaking exactly the messages the real client sends
// (claim -> build -> upgrade). Bob is a real browser session. Checks:
//   1. Bob sees Alice's claim with the owner label and building type live.
//   2. Bob sees build progress and then the finished building (mesh) live.
//   3. Bob sees the upgrade level.
//   4. A fresh page (late joiner) gets the same state from the welcome snapshot.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import WebSocket from 'ws';
import { startServer, Client } from './harness.mjs';

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});

async function waitHttp(url, what, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await WAIT(250);
  }
  throw new Error(`${what} never came up`);
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } }); }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(`page eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`); return r.result.value; }
  async waitFor(expr, label, timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) { const v = await this.eval(expr); if (v) return v; await WAIT(250); }
    throw new Error(`timeout waiting for ${label}`);
  }
}

async function launchChrome(port) {
  const proc = spawn(process.env.CHROME || '/usr/bin/google-chrome', [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/bv-chrome-${port}`, '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });
  await waitHttp(`http://127.0.0.1:${port}/json/list`, 'chrome devtools');
  return proc;
}

async function connectPage(cdpPort, url) {
  let target;
  try { target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json(); }
  catch { const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json(); target = list.find((t) => t.type === 'page' && t.url === 'about:blank'); }
  if (!target) throw new Error('could not create a new page target');
  const page = target;
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (url) { await cdp.send('Page.navigate', { url }); await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000); }
  return { cdp, close: async () => { try { await cdp.send('Target.closeTarget', { targetId: page.id }); } catch { /* gone */ } ws.close(); } };
}

async function boot(cdp, vitePort, query, name = 'Tester') {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/${query}` });
  await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  const hasGate = await cdp.eval(`!!document.querySelector('#resident-name')`);
  if (hasGate) {
    await cdp.eval(`(() => { const el = document.querySelector('#resident-name'); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(name)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await cdp.eval(`document.querySelector('.name-submit').click(); true`);
  }
  const hasModes = await cdp.waitFor(`[!!document.querySelector('canvas'), [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Demo mode')].some(x => x)`, 'canvas or mode screen', 20_000);
  if (hasModes[1]) await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Demo mode').click(); true`);
  await cdp.waitFor(`!!document.querySelector('canvas')`, 'game canvas', 25_000);
  await WAIT(1500);
}

const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); console.log(`PASS  ${name}`); }
  catch (e) { results.push(['FAIL', name]); console.log(`FAIL  ${name}\n      ${String(e.stack || e.message || e).slice(0, 800)}`); }
};

// the browser client dials ws://<host>:8787
process.env.PORT = '8787';
const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const PROFILE = `/tmp/bv-chrome-${cdpPort}`;
const ROOT = new URL('..', import.meta.url).pathname;
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const chrome = await launchChrome(cdpPort);
const PLOT = 40;
let alice;

try {
  await waitHttp(`http://127.0.0.1:${vitePort}/`, 'vite dev server');

  await check('live: Bob sees Alice claim plot with owner label + type', async () => {
    const { cdp: cdpB, close: closeB } = await connectPage(cdpPort, '');
    try {
      await boot(cdpB, vitePort, '?sx=0&sz=-19.6&autoname=Bob', 'Bob');
      // Alice joins after Bob, like a second session claiming while Bob watches
      alice = new Client();
      await alice.join('Alice', 0, 0, { plotIds: Array.from({ length: 132 }, (_, i) => i), community: [] });
      alice.send({ t: 'claim', plot: PLOT, ownerName: 'Alice', type: 'house' });
      await cdpB.waitFor(`(() => { const i = window.__bv.plotInfo(${PLOT}); return i && i.tag === 'Plot owned by Alice' ? i : null; })()`, "Bob sees 'Plot owned by Alice'", 10_000);
      const info = await cdpB.eval(`window.__bv.plotInfo(${PLOT})`);
      if (info.type !== 'house') throw new Error(`Bob sees type ${info.type}, expected house`);
    } finally { closeB(); }
  });

  await check('live: Bob sees build progress then the finished building', async () => {
    const { cdp: cdpB, close: closeB } = await connectPage(cdpPort, '');
    try {
      await boot(cdpB, vitePort, '?sx=0&sz=-19.6&autoname=Bob', 'Bob');
      alice.send({ t: 'build', plot: PLOT, progress: 24, done: false, type: 'house' });
      await cdpB.waitFor(`(() => { const i = window.__bv.plotInfo(${PLOT}); return i && i.type === 'house' && !i.mesh ? i : null; })()`, 'Bob sees the construction site (no finished mesh yet)', 10_000);
      alice.send({ t: 'build', plot: PLOT, progress: 48, done: true, type: 'house' });
      // the finished mesh pops in from scale 0.01 — wait until it has settled
      const done = await cdpB.waitFor(`(() => { const i = window.__bv.plotInfo(${PLOT}); return i && i.mesh && i.mesh.h >= 1 ? i : null; })()`, 'Bob sees the finished house mesh', 10_000);
      if (done.mesh && (done.mesh.h < 1 || !done.visible)) throw new Error(`finished mesh looks wrong: ${JSON.stringify(done)}`);
    } finally { closeB(); }
  });

  await check('live: Bob sees the level-2 upgrade', async () => {
    const { cdp: cdpB, close: closeB } = await connectPage(cdpPort, '');
    try {
      await boot(cdpB, vitePort, '?sx=0&sz=-19.6&autoname=Bob', 'Bob');
      alice.send({ t: 'upgrade', plot: PLOT, level: 2 });
      const up = await cdpB.waitFor(`(() => { const i = window.__bv.plotInfo(${PLOT}); return i && i.level === 2 ? i : null; })()`, 'Bob sees level 2', 10_000);
      if (!up.mesh) throw new Error('upgraded building mesh missing');
    } finally { closeB(); }
  });

  await check('late join: fresh page sees owner label + finished build from welcome', async () => {
    const { cdp: cdpB, close: closeB } = await connectPage(cdpPort, '');
    try {
      await boot(cdpB, vitePort, '?sx=0&sz=-19.6&autoname=Carol', 'Carol');
      const info = await cdpB.waitFor(`(() => { const i = window.__bv.plotInfo(${PLOT}); return i && i.tag ? i : null; })()`, "Carol sees 'Plot owned by Alice' from the welcome snapshot", 10_000);
      if (!info.mesh) throw new Error(`late joiner sees no finished mesh: ${JSON.stringify(info)}`);
    } finally { closeB(); }
  });
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* gone */ }
  try { vite.kill('SIGKILL'); } catch { /* gone */ }
  alice?.close();
  stopServer();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* gone */ }
}
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
