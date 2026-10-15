// One-off visual check: renders the Whitepaper panel in headless Chrome and
// screenshots two sections for a human-visible layout sanity check.
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
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
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
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url });
  await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  return { cdp, close: async () => { ws.close(); } };
}

process.env.PORT = '8787';
const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const PROFILE = `/tmp/bv-chrome-${cdpPort}`;
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const chrome = await launchChrome(cdpPort);
const MODAL_FOR = (title) => `[...document.querySelectorAll('.modal')].find(m => [...m.querySelectorAll('.modal-head h2')].some(h => h.textContent.includes('${title}')))`;
try {
  await waitHttp(`http://127.0.0.1:${vitePort}/`, 'vite dev server');
  const { cdp } = await connectPage(cdpPort, `http://127.0.0.1:${vitePort}/?autoname=WpShot`);
  const hasGate = await cdp.eval(`!!document.querySelector('#resident-name')`);
  if (hasGate) {
    await cdp.eval(`(() => {
      const el = document.querySelector('#resident-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'WpShot');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await cdp.eval(`document.querySelector('.name-submit').click(); true`);
  }
  const hasModes = await cdp.waitFor(
    `[!!document.querySelector('canvas'), [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Demo mode')].some(x => x)`,
    'canvas or mode screen', 20_000);
  if (hasModes[1]) await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Demo mode').click(); true`);
  await cdp.waitFor(`!!document.querySelector('canvas')`, 'game canvas', 25_000);
  await WAIT(1500);
  // settings -> whitepaper
  await cdp.eval(`[...document.querySelectorAll('.menu .mbtn')].find(b => b.textContent.includes('Settings')).click(); true`);
  await cdp.waitFor(`!!${MODAL_FOR('Settings')}`, 'settings open');
  await cdp.shot('/tmp/wp-1-settings.png');
  await cdp.eval(`[...${MODAL_FOR('Settings')}.querySelectorAll('button')].find(b => b.textContent.includes('Open the whitepaper')).click(); true`);
  await cdp.waitFor(`!!${MODAL_FOR('Whitepaper')}`, 'whitepaper open');
  await cdp.waitFor(`(() => { const h = document.querySelector('.wp-heading'); return h && h.textContent.trim() === 'The town'; })()`, 'first section', 5000);
  await WAIT(800); // let live figures land
  await cdp.shot('/tmp/wp-2-town.png');
  await cdp.eval(`[...document.querySelectorAll('.wp-tab')].find(b => b.textContent.trim() === 'Tokenomics').click(); true`);
  await cdp.waitFor(`(() => { const h = document.querySelector('.wp-heading'); return h && h.textContent.trim() === 'Tokenomics'; })()`, 'tokenomics section', 5000);
  await WAIT(300);
  await cdp.shot('/tmp/wp-3-tokenomics.png');
  console.log('SHOTS WRITTEN');
  cdp.close();
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* gone */ }
  try { vite.kill('SIGKILL'); } catch { /* gone */ }
  stopServer();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* gone */ }
}
