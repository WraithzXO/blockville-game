// One-off visual probe: screenshot the earnings card + personal payout entry
// in the real browser render (manual inspection, like the whitepaper chunk).
process.env.PORT = '8790';
process.env.BV_CYCLE_MS = '1500';
process.env.BV_FEE_SIM_SOL = '0';
const { spawn } = await import('node:child_process');
const fs = await import('node:fs');
const net = await import('node:net');
const WebSocket = (await import('ws')).default;
const { startServer, Client } = await import('/home/user/work/blockville-A-lake-fish-dock/tests/harness.mjs');

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = '/home/user/work/blockville-A-lake-fish-dock';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';

const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=/tmp/bv-shot-${cdpPort}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
const waitHttp = async (url, ms = 20000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { const r = await fetch(url); if (r.ok) return; } catch {} await WAIT(250); }
  throw new Error('never up: ' + url);
};
await waitHttp(`http://127.0.0.1:${cdpPort}/json/list`);
await waitHttp(`http://127.0.0.1:${vitePort}/`);

const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
let id = 0; const pending = new Map();
ws.on('message', (raw) => { const m = JSON.parse(String(raw)); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evalp = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval'); return r.result.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=ShotTester` });
const waitFor = async (expr, label, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await evalp(expr).catch(() => null)) return true; await WAIT(250); } throw new Error('timeout: ' + label); };
await waitFor(`document.readyState === 'complete'`, 'load');
if (await evalp(`!!document.querySelector('#resident-name')`)) {
  await evalp(`(() => { const el = document.querySelector('#resident-name'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, 'ShotTester'); el.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  await evalp(`document.querySelector('.name-submit').click(); 1`);
}
const modes = await evalp(`!!document.querySelector('canvas')`);
if (!modes) { const hasDemo = await evalp(`[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Demo mode')`); if (hasDemo) await evalp(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Demo mode').click(); 1`); }
await waitFor(`!!document.querySelector('canvas')`, 'canvas', 30000);
await WAIT(1500);

// drive a real payout through a helper identity client
const helper = new Client();
await helper.opened;
helper.send({ t: 'join', name: 'ShotTester', look: null, x: 0, z: 0 });
await helper.waitFor((m) => m.t === 'welcome', 'welcome', 6000);
helper.send({ t: 'claim', plot: 2, ownerName: 'ShotTester', type: 'cafe' });
await helper.waitFor((m) => m.t === 'entitlement' && m.claimed >= 1, 'claim', 6000);
helper.send({ t: 'build', plot: 2, type: 'cafe', progress: 35 });
await WAIT(600);
helper.send({ t: 'shopPurchase', item: 'fence' });
await helper.waitFor((m) => m.t === 'treasuryPayout', 'payout', 12000);
await WAIT(500);

// open the PERSONAL tab for the payout entry, then screenshot
await evalp(`(() => { const log = document.querySelector('.activity-log'); if (!log.classList.contains('expanded')) log.querySelector('.log-tabs').click(); [...log.querySelectorAll('.log-tab')].find(b => b.textContent.includes('PERSONAL')).click(); return 1; })()`);
await WAIT(800);
const shot1 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/bv-earnings-card.png', Buffer.from(shot1.data, 'base64'));

// click Share for the download/intent (stubbed), then screenshot again
await evalp(`(() => { window.open = () => null; HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; }; return 1; })()`);
await evalp(`document.querySelector('[data-testid="earnings-share"]').click(); 1`);
await WAIT(1500);
console.log('download name:', await evalp(`window.__dl ?? null`));
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('/tmp/bv-earnings-share.png', Buffer.from(shot2.data, 'base64'));
console.log('SHOTS_DONE');

ws.close(); chrome.kill('SIGKILL'); vite.kill('SIGKILL'); stopServer();
process.exit(0);
