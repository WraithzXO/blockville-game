// One-off movement debug: does the resident move on a synthetic 'w'?
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { startServer } from './harness.mjs';

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});

const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const end = Date.now() + 20000;
while (Date.now() < end) { try { const r = await fetch(`http://127.0.0.1:${vitePort}/`); if (r.ok) break; } catch {} await WAIT(250); }
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/bv-walk-${cdpPort}`, 'about:blank'], { stdio: 'ignore' });
await WAIT(2000);

let id = 0; const pending = new Map();
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json()).find(t => t.type === 'page').webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalx = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` });
await WAIT(4000);
await evalx(`(() => { const el = document.querySelector('#resident-name'); if (!el) return 'no-gate'; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el,'Tester'); el.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.name-submit').click(); return 'gate-ok'; })()`);
await WAIT(800);
await evalx(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Demo mode')?.click(); true`);
await WAIT(2500);
console.log('canvas:', await evalx(`!!document.querySelector('canvas')`));
console.log('pos0:', JSON.stringify(await evalx(`window.__bv?.playerPos()`)));
await evalx(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'})); true`);
await WAIT(2000);
console.log('pos2s:', JSON.stringify(await evalx(`window.__bv?.playerPos()`)));
console.log('speedMult:', await evalx(`window.__bv?.speedMult()`));
await evalx(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'})); true`);
chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
process.exit(0);
