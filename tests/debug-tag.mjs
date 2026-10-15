// Dev-only probe: join, report player/NPC/tag world positions, and capture one
// open-air shot framed on the resident. Usage: node tests/debug-tag.mjs [outdir]
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
const outDir = process.argv[2] || '/tmp/bv-tag';
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
await WAIT(7000);
const joined = await (await send('Runtime.evaluate', { expression: '!!window.__bv', returnByValue: true })).result.value;
if (!joined) { console.log('NOT_JOINED'); process.exit(1); }
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

await WAIT(9000); // let NPCs spawn and wander
const facts = await evalJS(`(() => { try {
  const eng = window.__bv.eng;
  const out = {};
  const p = eng.player;
  if (p) { out.player = { x: +p.position.x.toFixed(2), y: +p.position.y.toFixed(2), z: +p.position.z.toFixed(2) };
    const tag = eng.selfTag;
    if (tag) { const w = new (tag.position.constructor)(0,0,0); tag.getWorldPosition(w); out.selfTagWorld = { x: +w.x.toFixed(2), y: +w.y.toFixed(2), z: +w.z.toFixed(2) }; }
  }
  const npcs = window.__bv.npcs ? window.__bv.npcs() : [];
  out.npcs = npcs.slice(0, 4).map((n) => ({ x: +n.group.position.x.toFixed(1), y: +n.group.position.y.toFixed(2), z: +n.group.position.z.toFixed(1), state: n.state }));
  out.fountainFigures = out.npcs.filter((n) => Math.abs(n.x) < 3 && Math.abs(n.z + 10) < 3).length;
  return out;
  } catch (e) { return { evalError: String(e) }; }
})()`);
console.log(JSON.stringify(facts, null, 1));

// frame the resident in open air, slightly above so the tag is unobstructed
const px = facts.player?.x ?? 0, pz = facts.player?.z ?? 8;
await evalJS(`__bv.devView(${px}, ${pz + 6}, 0.0, 9, 4)`);
await WAIT(1200);
fs.mkdirSync(outDir, { recursive: true });
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${outDir}/selftag.png`, Buffer.from(shot.data, 'base64'));
console.log('SHOT selftag');

const kill = (p) => p.pid && process.kill(-p.pid, 'SIGTERM');
try { kill(vite); } catch {}
await stopServer();
chrome.kill();
process.exit(0);
