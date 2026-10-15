// Item 1 probe: fresh observer page after Alice claims + finishes building.
// Dumps React state vs engine visuals for the plot to localise the tag:null failure.
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
  // Alice claims and fully finishes the build BEFORE any observer joins
  alice = new Client();
  await alice.join('Alice', 0, 0, { plotIds: Array.from({ length: 132 }, (_, i) => i), community: [] });
  alice.send({ t: 'claim', plot: PLOT, ownerName: 'Alice', type: 'house' });
  alice.send({ t: 'build', plot: PLOT, progress: 48, done: true, type: 'house' });
  await WAIT(1000);

  const { cdp, close } = await connectPage(cdpPort, '');
  await boot(cdp, vitePort, '?sx=0&sz=-19.6&autoname=Bob', 'Bob');
  // give the welcome path a moment, then dump everything
  await WAIT(2500);
  const dump = await cdp.eval(`(() => {
    const st = window.__bvState;
    const p = st && st.plots ? st.plots.find(q => q.id === ${PLOT}) : null;
    const info = window.__bv ? window.__bv.plotInfo(${PLOT}) : null;
    return JSON.stringify({ state: p ? { owner: p.owner, ownerName: p.ownerName, type: p.type, progress: p.progress, done: p.done, level: p.level } : null, info });
  })()`);
  console.log('fresh-observer dump:', dump);
  // wait for pop-in to settle, then re-dump the mesh size
  await WAIT(2000);
  const dump2 = await cdp.eval(`(() => JSON.stringify(window.__bv.plotInfo(${PLOT})))()`);
  console.log('after settle:', dump2);
  // probe the reducer directly: does a manual remoteClaim with a name stick?
  await cdp.eval(`window.__bvDispatch({ t: 'remoteClaim', plot: ${PLOT}, ownerName: 'ProbeName' }); true`);
  await WAIT(400);
  const dump3 = await cdp.eval(`(() => { const p = window.__bvState.plots.find(q => q.id === ${PLOT}); return JSON.stringify({ owner: p.owner, ownerName: p.ownerName }); })()`);
  console.log('after manual remoteClaim:', dump3);
  // and does the engine pick it up?
  const dump4 = await cdp.eval(`(() => JSON.stringify(window.__bv.plotInfo(${PLOT})))()`);
  console.log('engine after manual remoteClaim:', dump4);
  // check the raw welcome the server would send right now
  const wsProbe = await cdp.eval(`window.__bv && window.__bv.netState ? JSON.stringify(window.__bv.netState()) : 'no netState hook'`);
  console.log('netState:', wsProbe);
  close();
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* gone */ }
  try { vite.kill('SIGKILL'); } catch { /* gone */ }
  alice?.close();
  stopServer();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* gone */ }
}
