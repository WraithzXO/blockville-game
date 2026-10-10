// Dev-only probe: store/house/interior baselines (v2 — no player-on-shell fades).
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
const outDir = process.argv[2] || '/tmp/bv-build';
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
await WAIT(5000);
// fund the resident, then reload so loadStaking picks it up
await send('Runtime.evaluate', { expression: `localStorage.setItem('blockville_staking', JSON.stringify({builder:true, balance:60000, staked:120000, blocks:600}))` });
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=Shooter` });
await WAIT(7000);
const joined = await (await send('Runtime.evaluate', { expression: '!!window.__bv', returnByValue: true })).result.value;
if (!joined) { console.log('NOT_JOINED'); process.exit(1); }
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

const shots = [];
async function shot(name) {
  const dataUrl = await evalJS(`window.__bv.captureScreenshot()`);
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
  shots.push(name); console.log('SHOT', name);
}
const view = async (x, z, a, d, e) => evalJS(`window.__bv.devView(${x},${z},${a},${d},${e})`);

// store + furniture store: stand 4 units off the facades so shells don't fade
await view(0, -17, 0, 12, 6.5); await WAIT(600); await shot('storeFront');
await view(13, -17, 0, 11, 6.5); await WAIT(600); await shot('furnStoreFront');
// shop plot 17 at (0,45): capture from both street sides
await view(0, 41, 0, 14, 8); await WAIT(600); await shot('shopFromS');
await view(0, 41, Math.PI, 14, 8); await WAIT(600); await shot('shopFromN');

// claim + build a house, then enter and capture the interior
const freePlot = await evalJS(`(()=>{const st=window.__bvState; const p=st.plots.find(p=>!p.owner); return p?{id:p.id}:null;})()`);
console.log('free plot:', JSON.stringify(freePlot));
if (freePlot) {
  await evalJS(`window.__bvDispatch({t:'claim', plot:${freePlot.id}, type:'house'})`);
  for (let i = 0; i < 55; i++) await evalJS(`window.__bvDispatch({t:'buildClick', plot:${freePlot.id}})`);
  const st = await evalJS(`(()=>{const p=window.__bvState.plots.find(p=>p.id===${freePlot.id}); return {done:p.done, type:p.type};})()`);
  console.log('house built:', JSON.stringify(st));
  const pos = await evalJS(`(()=>{const e=window.__bv.eng; const ps=e.plotPos?e.plotPos.get(${freePlot.id}):null; return ps?{x:ps.x,z:ps.z}:null;})()`);
  console.log('plot pos:', JSON.stringify(pos));
  // exterior first (owner nearby may fade the shell — keep 8 units back)
  await view(pos.x, pos.z + 8, 0, 12, 6); await WAIT(600); await shot('houseExt');
  await evalJS(`window.__bvDispatch({t:'enterHouse', plot:${freePlot.id}})`);
  await WAIT(2500);
  await shot('interior');
  await evalJS(`(()=>{const e=window.__bv.eng; e.camera.position.set(-9,2.4,8.5); e.camera.lookAt(6,1.4,-8);})()`);
  await WAIT(300); await shot('interiorCorner');
  // place two furniture pieces for the placement view
  await evalJS(`window.__bvDispatch({t:'buyFurniture', itemId:'oak-bed'}); window.__bvDispatch({t:'buyFurniture', itemId:'block-chair'});`);
  await evalJS(`window.__bvDispatch({t:'placeFurniture', plot:${freePlot.id}, itemId:'oak-bed', x:-6, z:-6, rotation:0})`);
  await evalJS(`window.__bvDispatch({t:'placeFurniture', plot:${freePlot.id}, itemId:'block-chair', x:4, z:-2, rotation:Math.PI/2})`);
  await WAIT(1000);
  await shot('interiorFurnished');
  await evalJS(`window.__bvDispatch({t:'exitHouse'})`);
  await WAIT(800);
}
console.log('DONE', shots.join(','));
vite.kill(); chrome.kill(); await stopServer();
process.exit(0);
