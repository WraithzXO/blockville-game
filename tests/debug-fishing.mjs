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


const R = await evalx(`(async()=>{
 const e=__bv.eng, F=e.fishing.constructor, p=e.player; let spot=null;
 for(let x=200;x<320&&!spot;x+=0.5)for(let z=-30;z<40;z+=0.25)if(F.canFishAt(x,z)){spot=[x,z];break;}
 if(!spot) return 'NOSPOT';
 p.position.set(spot[0],-2.47,spot[1]); __bv.devView(spot[0],spot[1],1.2,12,6);
 const sleep=t=>new Promise(r=>setTimeout(r,t)); const log=[];
 log.push('label:'+e.fishing.label(p));
 const bal=()=>document.body.innerText.length;
 e.resolveInteract(true); log.push('phase:'+e.fishing.phase);
 let w=0; while(e.fishing.phase==='waiting'&&w<80){await sleep(100);w++;}
 log.push('after wait:'+e.fishing.phase);
 e.fishing.press(p); log.push('reel:'+e.fishing.phase);
 // wait for marker to be in zone then pull
 let n=0; while(n<200){const m=(e.fishing.t*0.95)%2; const mk=m<=1?m:2-m; if(Math.abs(mk-e.fishing.zoneC)<0.08)break; await sleep(20);n++;}
 await sleep(5); e.fishing.press(p); log.push('result:'+e.fishing.phase+' msg:'+e.fishing.title.textContent);
 // movement cancel test
 await sleep(2600); log.push('after:'+e.fishing.phase);
 return log.join(' | ');
})()`);
console.log(R);
await WAIT(300);
const d = await evalx('__bv.captureScreenshot()');
fs.writeFileSync('/home/user/work/shots/fish.png', Buffer.from(String(d).split(',')[1],'base64'));
chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer(); process.exit(0);

async function waitHttp(url, what, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await WAIT(250);
  }
  throw new Error(`${what} never came up`);
}
