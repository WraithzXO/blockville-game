// Debug: dump modal titles and the Settings modal innerText after opening it
import { spawn } from 'node:child_process';
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
async function waitHttp(url, what) {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(url); if (r.ok) return; } catch {} await WAIT(300); }
  throw new Error(what + ' never came up');
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } }); }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed'); return r.result.value; }
  async waitFor(expr, label, timeoutMs = 15_000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { const v = await this.eval(expr); if (v) return v; await WAIT(200); } throw new Error('timeout: ' + label); }
}
const vitePort = await freePort(); const cdpPort = await freePort();
process.env.PORT = '8787';
const stopServer = await startServer();
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/bv-dbg-${cdpPort}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
try {
  await waitHttp(`http://127.0.0.1:${vitePort}/`, 'vite');
  await waitHttp(`http://127.0.0.1:${cdpPort}/json/list`, 'chrome');
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=Dbg` });
  await cdp.waitFor(`document.readyState === 'complete'`, 'load');
  if (await cdp.eval(`!!document.querySelector('#resident-name')`)) {
    await cdp.eval(`(() => { const el = document.querySelector('#resident-name'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, 'Dbg'); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await cdp.eval(`document.querySelector('.name-submit').click(); true`);
  }
  const modes = await cdp.waitFor(`[!!document.querySelector('canvas'), [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Demo mode')].some(x => x)`, 'canvas or modes');
  if (modes[1]) await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Demo mode').click(); true`);
  await cdp.waitFor(`!!document.querySelector('canvas')`, 'canvas');
  await WAIT(1500);
  console.log('MODALS_AT_SPAWN', await cdp.eval(`[...document.querySelectorAll('.modal-head h2')].map(h => h.textContent)`));
  await cdp.eval(`[...document.querySelectorAll('.menu .mbtn')].find(b => b.textContent.includes('Settings')).click(); true`);
  await cdp.waitFor(`[...document.querySelectorAll('.modal-head h2')].some(h => h.textContent.includes('Settings'))`, 'settings open');
  console.log('MODALS_NOW', await cdp.eval(`[...document.querySelectorAll('.modal-head h2')].map(h => h.textContent)`));
  const text = await cdp.eval(`[...document.querySelectorAll('.modal')].find(m => [...m.querySelectorAll('.modal-head h2')].some(h => h.textContent.includes('Settings')))?.innerText ?? 'NOT_FOUND'`);
  console.log('SETTINGS_TEXT_START>>>', String(text).slice(0, 1200), '<<<END');
} finally {
  try { chrome.kill('SIGKILL'); } catch {}
  try { vite.kill('SIGKILL'); } catch {}
  stopServer();
}
