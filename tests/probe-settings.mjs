// Dev-only probe: Settings economy move. Usage: node tests/probe-settings.mjs [outdir]
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
const outDir = process.argv[2] || '/tmp/bv-settings';
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

const btnTexts = (sel) => evalJS(`[...document.querySelectorAll('${sel}')].map(b => b.textContent.trim())`);
const clickBtn = (sel, text) => evalJS(`(() => { const b=[...document.querySelectorAll('${sel}')].find(x => x.textContent.includes('${text}')); if(!b) return false; b.click(); return true; })()`);
const topbar = await btnTexts('.mbtn');
console.log('TOPBAR_BUTTONS', JSON.stringify(topbar));
console.log('SETTINGS_OPENED', await clickBtn('.mbtn', 'Settings'));
await WAIT(800);
console.log('ECON_BUTTONS', JSON.stringify(await btnTexts('.settings-actions button')));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/settings.png`, Buffer.from(shot.data, 'base64'));
console.log('CLICK_TREASURY', await clickBtn('.settings-actions button', 'Treasury'));
await WAIT(800);
console.log('TREASURY_OPEN', await evalJS(`document.body.innerText.includes('Blockville Treasury')`));
console.log('SETTINGS_CLOSED', await evalJS(`!document.body.innerText.includes('Master volume')`));
await clickBtn('.settings-actions button', 'x');
ws.close(); chrome.kill(); vite.kill(); stopServer?.(); process.exit(0);
