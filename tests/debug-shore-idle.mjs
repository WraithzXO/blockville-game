// Dev-only probe 3: decisive idle check at the lake shore.
// Walk east to the water's edge, release keys, and WITHOUT any devView/teleport
// sample player.position.y vs in-page groundY for 4s. Then one screenshot.
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
const outDir = process.argv[2] || '/tmp/bv-idle';
const SHOT = process.argv[3] === 'shot';
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

try {
  // walk east until the shore blocks us (orient first: nudge 'w' makes ArrowRight = east)
  await evalJS(`(()=>{const p=window.__bv.eng.player; p.position.set(150,0,12); return true;})()`);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'})); true`);
  await WAIT(200);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'})); true`);
  await WAIT(400);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'})); true`);
  let last = null, stagnant = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    await WAIT(500);
    const p = await evalJS(`(()=>{const p=window.__bv.eng.player; return {x:+p.position.x.toFixed(2),y:+p.position.y.toFixed(3),z:+p.position.z.toFixed(2)};})()`);
    if (last && Math.abs(p.x - last.x) < 0.05) { stagnant++; if (stagnant >= 5) { last = p; break; } } else stagnant = 0;
    last = p;
  }
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight'})); true`);
  await WAIT(300);
  console.log('WALK-END', JSON.stringify(last));

  // load the real terrain module in-page (vite dev serves it transpiled)
  await evalJS(`window.__wt = null; import('/src/world/WorldTerrain.ts').then(m => { window.__wt = m; }); true`);
  for (let i = 0; i < 20; i++) { if (await evalJS(`!!window.__wt`)) break; await WAIT(250); }
  const ground = await evalJS(`(()=>{const p=window.__bv.eng.player; const m=window.__wt; return { groundY:+m.groundY(p.position.x,p.position.z).toFixed(3), meshH:+m.meshH(p.position.x,p.position.z).toFixed(3), terrainH:+m.terrainH(p.position.x,p.position.z).toFixed(3), canWalk:m.canWalk(p.position.x,p.position.z), x:+p.position.x.toFixed(2), z:+p.position.z.toFixed(2) };})()`);
  console.log('GROUND', JSON.stringify(ground));

  // idle 4s, no devView, sample y only
  const idle = [];
  for (let i = 0; i < 8; i++) { await WAIT(500); idle.push(await evalJS(`(()=>{const p=window.__bv.eng.player; return {x:+p.position.x.toFixed(2),y:+p.position.y.toFixed(3),z:+p.position.z.toFixed(2)};})()`)); }
  console.log('IDLE', JSON.stringify(idle));
  if (SHOT) {
    await WAIT(400);
    const dataUrl = await evalJS(`window.__bv.captureScreenshot()`);
    fs.writeFileSync(`${outDir}/shore-idle-fixed.png`, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
    console.log('SHOT shore-idle-fixed');
  }

  await WAIT(600);
  const dataUrl = await evalJS(`window.__bv.captureScreenshot()`);
  fs.writeFileSync(`${outDir}/shore-idle.png`, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  console.log('SHOT shore-idle');
  console.log('DONE');
} finally {
  chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
  await WAIT(400);
  try { fs.rmSync(`/tmp/bv-chrome-${cdpPort}`, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
