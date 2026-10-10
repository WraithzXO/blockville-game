// Dev-only visual capture: boots server + vite + headless Chrome, joins with
// ?autoname, then frames a set of standard views via __bv.devView and saves
// PNGs. Usage: node tests/screenshot.mjs [outdir] [view ...]
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import WebSocket from 'ws';
import { startServer, PORT } from './harness.mjs';

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));

// view: [x, z, ang(rad around target), dist, elev]
const VIEWS = {
  plaza:    [0, -10, 0.0, 26, 14],      // store front, spawn area
  street:   [0, 10, Math.PI, 24, 12],   // storefront row from behind
  plots:    [10, 40, 0.6, 30, 16],      // plot grid
  lake:     [265, 6, 0.0, 30, 14],      // lake from trail side
  lakeFar:  [230, 40, -0.6, 60, 30],    // wide lake + shoreline
  mountain: [120, 140, 0.8, 70, 40],    // east/north beyond fence
  beyond:   [60, 200, Math.PI, 50, 26], // outside fence looking back
  house:    [0, 0, 0, 18, 10],          // generic; overridden by interior mode
  char:     [0, -18, 0.4, 8, 5],        // close character
  park:     [-24, 30, 0.4, 24, 13],     // town park area
  mine:     [90, 180, 0.3, 30, 16],
  sky:      [0, 0, 0, 80, 10],          // north camera looking south at the cloud band
  mtEdgeN:  [40, 210, Math.PI, 130, 50],
  mtEdgeE:  [200, 60, -Math.PI / 2, 130, 50],
  mtSeamN:  [40, 330, Math.PI, 25, 9],
  mtSeamE:  [420, 70, -Math.PI / 2, 25, 9],
};

const outDir = process.argv[2] || '/tmp/bv-shots';
const only = process.argv.slice(3);
const cdpPort = await freePort();
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const evalx = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

const stopServer = await startServer();
const vitePort = await freePort();
const vite = spawn('npx', ['vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
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
ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=Shooter` });
await WAIT(7000);
const joined = await evalJS('!!window.__bv');
if (!joined) { console.log('NOT_JOINED'); process.exit(1); }

fs.mkdirSync(outDir, { recursive: true });
const names = only.length ? only.filter((n) => VIEWS[n]) : Object.keys(VIEWS);
for (const name of names) {
  const [x, z, a, d, e] = VIEWS[name];
  await evalJS(`__bv.devView(${x}, ${z}, ${a}, ${d}, ${e})`);
  await WAIT(1200);
  const dataUrl = await evalx('__bv.captureScreenshot()');
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  console.log('SHOT', name);
}
chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
process.exit(0);

async function waitHttp(url, what, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await WAIT(250);
  }
  throw new Error(`${what} never came up`);
}
