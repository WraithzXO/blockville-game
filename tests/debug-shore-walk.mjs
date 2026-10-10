// Dev-only probe 2: reach the actual lake shore. Arrow-key walk east + stepwise
// teleports near the shore; capture standing shots at the water's edge.
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
const outDir = process.argv[2] || '/tmp/bv-shore';
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
async function shot(name) {
  const dataUrl = await evalJS(`window.__bv.captureScreenshot()`);
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  console.log('SHOT', name);
}
const pos = async () => evalJS(`(()=>{const p=window.__bv.eng.player; return p?{x:+p.position.x.toFixed(2),y:+p.position.y.toFixed(3),z:+p.position.z.toFixed(2)}:null;})()`);
const nudge = async (key, ms = 250) => {
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)}})); true`);
  await WAIT(ms);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:${JSON.stringify(key)}})); true`);
  await WAIT(500);
};

try {
  // which keys actually move? test ArrowRight from a teleport anchor
  await evalJS(`(()=>{const p=window.__bv.eng.player; p.position.set(150,0,12); return true;})()`);
  await nudge('w', 150);
  const before = await pos();
  await nudge('ArrowRight', 800);
  const after = await pos();
  console.log('keytest before=', JSON.stringify(before), 'afterArrowRight=', JSON.stringify(after));

  // walk east with ArrowRight (camera-relative handled by game), sampling y
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'})); true`);
  let minY = Infinity, lastX = -Infinity, stagnant = 0, samples = 0, shore = null, maxX = -Infinity;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    await WAIT(500);
    const p = await pos();
    if (!p) continue;
    samples++;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (Math.abs(p.x - lastX) < 0.05 && Math.abs(p.z - (shore?.z ?? p.z)) < 0.05) { stagnant++; if (stagnant >= 5) { shore = p; break; } } else stagnant = 0;
    lastX = p.x; shore = p;
  }
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight'})); true`);
  console.log('WALK samples=', samples, 'minY=', minY.toFixed(3), 'maxX=', maxX.toFixed(2), 'final=', JSON.stringify(shore));
  if (shore) {
    for (const [a, name] of [[Math.PI / 2, 'shore-side'], [0, 'shore-front']]) {
      await evalJS(`window.__bv.devView(${shore.x},${shore.z},${a},9,2.2); true`);
      await WAIT(500); await shot(name);
    }
    const ys = [];
    for (let i = 0; i < 5; i++) { await WAIT(400); const q = await pos(); ys.push(q ? q.y : null); }
    console.log('STAND shore ys=', JSON.stringify(ys), 'spread=', (Math.max(...ys) - Math.min(...ys)).toFixed(3));
    console.log('DONE');
  }
} finally {
  chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
  await WAIT(400);
  try { fs.rmSync(`/tmp/bv-chrome-${cdpPort}`, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
