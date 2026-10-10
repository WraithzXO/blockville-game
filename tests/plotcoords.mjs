// one-off: print plot coordinates for given ids via the dev API
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { startServer, PORT } from './harness.mjs';

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const vite = spawn('npx', ['vite', '--port', String(vitePort), '--strictPort'], { stdio: 'ignore' });
const end = Date.now() + 20000;
while (Date.now() < end) { try { const r = await fetch(`http://127.0.0.1:${vitePort}`); if (r.ok) break; } catch {} await WAIT(250); }
const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=/tmp/bv-cdp-${cdpPort}`, '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
end && await WAIT(1000);
const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
await new Promise((res) => ws.once('open', res));
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=Shooter` });
await WAIT(7000);
const out = await (await send('Runtime.evaluate', { expression: 'JSON.stringify(Object.fromEntries([50,94,17,39,61].map(i=>[i, __bv.plots().get(i)])))', returnByValue: true })).result.value;
console.log('PLOTS', out);
chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
process.exit(0);
