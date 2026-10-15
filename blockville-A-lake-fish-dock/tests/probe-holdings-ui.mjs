// Scratch UI verification for Chunk 5 (not part of the repo): headless Chrome
// opens Settings → Treasury, asserts the on-chain holdings display, then
// exercises the stale → recovery path by failing the mock RPC and restoring it.
import { spawn } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import WebSocket from 'ws';
import { startServer, PORT } from './harness.mjs';

const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const ROOT = '/home/user/work/t5/extracted/blockville-A-lake-fish-dock';
const WALLET = '7LdsU9GwPgTpK3u8t5LDkGoQtHNSB4JohDTeto6DdBQu';
const MINT = 'TestMint1111111111111111111111111111111111';

let rpcFail = false;
let rpcHits = 0;
const rpc = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    rpcHits++;
    if (rpcFail) { res.writeHead(503); res.end('{"error":"mock down"}'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 4.5, decimals: 6 } } } } } }] } }));
  });
});
await new Promise((r) => rpc.listen(0, '127.0.0.1', r));
const rpcPort = rpc.address().port;

process.env.BLOCKVILLE_MINT = MINT;
process.env.TREASURY_RPC_URL = `http://127.0.0.1:${rpcPort}`;

process.env.PORT = '8787'; // vite dev proxy hardcodes localhost:8787
const stopServer = await startServer();
const vitePort = await freePort();
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const waitHttp = async (url, label) => { for (let i = 0; i < 60; i++) { try { await fetch(url); return; } catch { await WAIT(500); } } throw new Error(label + ' unreachable'); };
await waitHttp(`http://127.0.0.1:${vitePort}`, 'vite');
await waitHttp(`http://127.0.0.1:${PORT}/api/health`, 'server');

const cdpPort = await freePort();
const chrome = spawn('/usr/bin/google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=/tmp/bv-chrome-holdings-${cdpPort}`, '--window-size=1280,800', 'about:blank',
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
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const joined = await evalJS('!!window.__bv');
const clickBtn = (sel, text) => evalJS(`(() => { const b=[...document.querySelectorAll('${sel}')].find(x => x.textContent.includes('${text}')); if(!b) return false; b.click(); return true; })()`);

const results = [];
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };

if (!joined) { results.push('FAIL  game did not join'); }
else {
  check('settings opens', await clickBtn('.mbtn', 'Settings'));
  await WAIT(800);
  check('treasury button opens panel', await clickBtn('.settings-actions button', 'Treasury'));
  const waitText = async (needle, timeoutMs = 10000) => { const end = Date.now() + timeoutMs; while (Date.now() < end) { const t = await evalJS('document.body.innerText'); if (t.includes(needle)) return t; await WAIT(500); } return await evalJS('document.body.innerText'); };
  const text = await waitText('On-chain treasury holdings');
  check('on-chain section present', text.toLowerCase().includes('on-chain treasury holdings'));
  const liveText = await waitText('Live · auto-refreshes every 10s');
  check('live status shown', liveText.includes('Live · auto-refreshes every 10s'));
  check('live value 4.5 shown', /4\.5\s*\$BLOCKVILLE/.test(liveText), liveText.slice(0, 400));
  check('full public wallet address shown', liveText.includes(WALLET));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync('/home/user/work/t5/shots', { recursive: true });
  fs.writeFileSync('/home/user/work/t5/shots/holdings-live.png', Buffer.from(shot.data, 'base64'));

  // RPC fails → within ~10s the display flips to stale but keeps 4.5
  rpcFail = true;
  await WAIT(12000);
  const text2 = await evalJS('document.body.innerText');
  check('stale indicator appears after RPC failure', text2.includes('Stale'), text2.slice(0, 400));
  check('last valid balance kept while stale', /4\.5\s*\$BLOCKVILLE/.test(text2));
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/home/user/work/t5/shots/holdings-stale.png', Buffer.from(shot2.data, 'base64'));

  // RPC recovers → next poll clears stale, no page reload
  rpcFail = false;
  await WAIT(12000);
  const text3 = await evalJS('document.body.innerText');
  check('recovers to Live automatically', text3.includes('Live · auto-refreshes every 10s'), text3.slice(0, 400));
  check('no page reload happened (session intact)', await evalJS('!!window.__bv'));
  const shot3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/home/user/work/t5/shots/holdings-recovered.png', Buffer.from(shot3.data, 'base64'));
  check('mock RPC actually polled', rpcHits >= 3, `rpcHits=${rpcHits}`);
}
console.log(results.join('\n'));
ws.close(); chrome.kill(); vite.kill(); stopServer?.(); rpc.close();
process.exit(results.some((r) => r.startsWith('FAIL')) || results.length === 0 ? 1 : 0);
