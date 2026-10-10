// Dev-only probe: does the resident stand ON the dirt path / at the lake, not floating?
// Teleports to trail points, captures low side views, then walks east to the shore
// sampling player y the whole way. Usage: node tests/debug-terrain-walk.mjs [outdir]
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import WebSocket from 'ws';
import { startServer, PORT } from './harness.mjs';

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const outDir = process.argv[2] || '/tmp/bv-terrain-walk';
fs.mkdirSync(outDir, { recursive: true });
const cdpPort = await freePort();

const stopServer = await startServer();
const vitePort = await freePort();
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const waitHttp = async (url, label) => { for (let i = 0; i < 60; i++) { try { await fetch(url); return; } catch { await WAIT(500); } } throw new Error(label + ' unreachable'); };
await waitHttp(`http://127.0.0.1:${vitePort}`, 'vite');
await waitHttp(`http://127.0.0.1:${PORT}/api/health`, 'server');

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=/tmp/bv-chrome-${cdpPort}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
await waitHttp(`http://127.0.0.1:${cdpPort}/json/list`, 'chrome devtools');

const list = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((r) => r.json());
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res) => ws.once('open', res));
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=Shooter` });
await WAIT(6000);
const joined = await (await send('Runtime.evaluate', { expression: '!!window.__bv', returnByValue: true })).result.value;
if (!joined) { console.log('NOT_JOINED'); chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer(); process.exit(1); }
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

const shots = [];
async function shot(name) {
  const dataUrl = await evalJS(`window.__bv.captureScreenshot()`);
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  shots.push(name); console.log('SHOT', name);
}
const pos = async () => evalJS(`(()=>{const p=window.__bv.eng.player; return p?{x:+p.position.x.toFixed(2),y:+p.position.y.toFixed(3),z:+p.position.z.toFixed(2)}:null;})()`);
// teleport the resident and nudge a key so the per-frame ground snap runs
async function teleport(x, z) {
  await evalJS(`(()=>{const p=window.__bv.eng.player; p.position.set(${x},0,${z}); return true;})()`);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'})); true`);
  await WAIT(250);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'})); true`);
  await WAIT(600);
}

try {
  // trail points (trailZ from WorldTerrain: dead straight to x=150, then S-bend)
  const stops = [[155, 0, 'path-start'], [200, 9.5, 'path-mid'], [230, 12.3, 'path-bend']];
  for (const [x, z, name] of stops) {
    await teleport(x, z);
    const p = await pos();
    console.log('AT', name, JSON.stringify(p));
    // low side view: feet vs ground clearly visible
    await evalJS(`window.__bv.devView(${p.x},${p.z},Math.PI/2,9,2.2); true`);
    await WAIT(500);
    await shot(`${name}-side`);
    // stand still 2.5s and sample y — must not drift/sink
    const ys = [];
    for (let i = 0; i < 5; i++) { await WAIT(500); const q = await pos(); ys.push(q ? q.y : null); }
    console.log('STAND', name, 'ys=', JSON.stringify(ys), 'spread=', ys.length ? (Math.max(...ys) - Math.min(...ys)).toFixed(3) : 'n/a');
  }

  // walk east along the trail into the lake shore, sampling y the whole way
  await teleport(150, 0);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'d'})); true`);
  let minY = Infinity, lastX = -Infinity, stagnant = 0, samples = 0, shore = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await WAIT(500);
    const p = await pos();
    if (!p) continue;
    samples++;
    if (p.y < minY) minY = p.y;
    if (Math.abs(p.x - lastX) < 0.05) { stagnant++; if (stagnant >= 4) { shore = p; break; } } else stagnant = 0;
    lastX = p.x;
  }
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'d'})); true`);
  console.log('WALK samples=', samples, 'minY=', minY.toFixed(3), '(water line = -3.35)', 'shore=', JSON.stringify(shore));
  if (shore) {
    await evalJS(`window.__bv.devView(${shore.x},${shore.z},Math.PI/2,9,2.2); true`);
    await WAIT(500); await shot('shore-side');
    await evalJS(`window.__bv.devView(${shore.x},${shore.z},0,10,4); true`);
    await WAIT(500); await shot('shore-front');
    const ys = [];
    for (let i = 0; i < 5; i++) { await WAIT(500); const q = await pos(); ys.push(q ? q.y : null); }
    console.log('STAND shore ys=', JSON.stringify(ys), 'spread=', (Math.max(...ys) - Math.min(...ys)).toFixed(3));
  }
  console.log('DONE shots=', shots.join(','));
} finally {
  chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
  await WAIT(400);
  try { fs.rmSync(`/tmp/bv-chrome-${cdpPort}`, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
