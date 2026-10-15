// Debug: load the app in headless chrome and dump what actually rendered.
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
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: '/home/user/work/blockville', stdio: ['ignore', 'pipe', 'pipe'] });
vite.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
vite.stderr.on('data', (d) => process.stderr.write(`[vite!] ${d}`));
const end = Date.now() + 20000;
while (Date.now() < end) { try { const r = await fetch(`http://127.0.0.1:${vitePort}/`); if (r.ok) break; } catch {} await WAIT(250); }

const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=/tmp/bv-dbg-${cdpPort}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
await WAIT(2000);
const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const logs = [];
send('Runtime.enable').then(() => {
  // attach console listener via events
});
ws.on('message', () => {});
const evalx = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

await send('Page.enable');
// capture console + exceptions
const events = [];
ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') events.push(JSON.stringify(m.params).slice(0, 500)); });
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` });
await WAIT(6000);
console.log('URL:', await evalx('location.href'));
console.log('BODY:', String(await evalx('document.body ? document.body.innerHTML.slice(0, 600) : "no body"')));
console.log('BUTTONS:', await evalx('[...document.querySelectorAll("button")].map(b=>b.textContent.trim()).slice(0,10)'));
console.log('CONSOLE/EVENTS:', events.slice(0, 8));
chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
process.exit(0);
