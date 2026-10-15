// Dev-only probe 4: map moving-y vs groundY along the trail, then idle at two spots.
import { spawn } from 'node:child_process';
import net from 'node:net';
import WebSocket from 'ws';
import { startServer, PORT } from './harness.mjs';

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
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
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=Shooter` });
await WAIT(6000);
const joined = await (await send('Runtime.evaluate', { expression: '!!window.__bv', returnByValue: true })).result.value;
if (!joined) { console.log('NOT_JOINED'); chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer(); process.exit(1); }
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

try {
  await evalJS(`window.__wt = null; import('/src/world/WorldTerrain.ts').then(m => { window.__wt = m; }); true`);
  for (let i = 0; i < 20; i++) { if (await evalJS(`!!window.__wt`)) break; await WAIT(250); }

  const sample = `(()=>{const p=window.__bv.eng.player, m=window.__wt; const x=p.position.x, z=p.position.z;
    return {x:+x.toFixed(1), y:+p.position.y.toFixed(3), g:+m.groundY(x,z).toFixed(3), maxX: window.__bv.maxX ? window.__bv.maxX() : null};})()`;

  // walk east logging y vs ground the whole way
  await evalJS(`(()=>{const p=window.__bv.eng.player; p.position.set(150,0,12); return true;})()`);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'w'})); true`);
  await WAIT(200);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'w'})); true`);
  await WAIT(400);
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'})); true`);
  const rows = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 120000 && rows.length < 200) {
    await WAIT(600);
    const r = await evalJS(sample);
    if (!r) continue;
    rows.push(r);
    if (rows.length > 6) {
      const a = rows[rows.length - 6], b = r;
      if (Math.abs(a.x - b.x) < 0.05) break;
    }
  }
  await evalJS(`window.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight'})); true`);
  console.log('WALK-LOG (x, y, groundY):');
  for (const r of rows) console.log(`  x=${r.x} y=${r.y} g=${r.g} diff=${(r.y - r.g).toFixed(3)}`);
  const end = rows[rows.length - 1];
  // idle at the shore
  const idle = [];
  for (let i = 0; i < 6; i++) { await WAIT(500); idle.push(await evalJS(`+window.__bv.eng.player.position.y.toFixed(3)`)); }
  console.log('IDLE-at-shore ys=', JSON.stringify(idle), 'ground=', end ? end.g : null);
  console.log('DONE');
} finally {
  chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
  await WAIT(400);
  try { (await import('node:fs')).rmSync(`/tmp/bv-chrome-${cdpPort}`, { recursive: true, force: true }); } catch {}
  process.exit(0);
}
