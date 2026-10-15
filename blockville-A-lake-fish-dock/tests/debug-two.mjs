// One-off debug: two browser sessions — can the pages reach the WS server at all?
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { startServer } from './harness.mjs';

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});

process.env.PORT = "8787";
const stopServer = await startServer();
// also probe the plain-WS path from node itself
{
  const ws = new WebSocket(`ws://localhost:${process.env.PORT}/ws`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  console.log('node ws probe: open OK');
  ws.close();
}
const vitePort = await freePort();
const cdpPort = await freePort();
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
const end = Date.now() + 20000;
while (Date.now() < end) { try { const r = await fetch(`http://127.0.0.1:${vitePort}/`); if (r.ok) break; } catch {} await WAIT(250); }
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/bv-probe-${cdpPort}`, 'about:blank'], { stdio: 'ignore' });
await WAIT(2000);

let id = 0; const pending = new Map();
const mkPage = async (query, name) => {
  const t = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalx = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/${query}` });
  await WAIT(4000);
  await evalx(`(() => { const el = document.querySelector('#resident-name'); if (!el) return 'no-gate'; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el, ${JSON.stringify(name)}); el.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.name-submit').click(); return 'gate-ok'; })()`);
  await WAIT(800);
  await evalx(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Demo mode')?.click(); true`);
  await WAIT(2500);
  return { evalx };
};

const a = await mkPage('?sx=0&sz=-19.6', 'Alice');
console.log('A in-page ws probe:', await a.evalx(`new Promise(r => { try { const ws = new WebSocket('ws://127.0.0.1:' + String(8787) + '/ws'); ws.onopen = () => { ws.close(); r('open'); }; ws.onerror = () => r('error'); setTimeout(() => r('timeout'), 3000); } catch (e) { r('throw:' + e.message); } })`));
console.log('A remotes size:', await a.evalx(`window.__bv && window.__bv.eng ? window.__bv.eng.remotes.size : 'no-eng'`));
console.log('A hostname/port:', await a.evalx(`location.hostname + ':' + location.port`));
const b = await mkPage('?sx=2&sz=-19.6', 'Bob');
await WAIT(3000);
console.log('A remotes:', await a.evalx(`JSON.stringify(window.__bv.devRemotes())`));
console.log('B remotes:', await b.evalx(`JSON.stringify(window.__bv.devRemotes())`));

// authoritative check: a node observer joins and dumps the server's peer list
{
  const ws = new WebSocket('ws://localhost:8787/ws');
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.send(JSON.stringify({ t: 'join', name: 'Observer', look: null, x: 0, z: 0 }));
  const welcome = await new Promise((res) => ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.t === 'welcome') res(m); }));
  console.log('server peers:', JSON.stringify(welcome.peers.map((p) => ({ id: p.id, name: p.name }))));
  ws.close();
}

chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
process.exit(0);
