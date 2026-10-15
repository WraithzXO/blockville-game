// Guest-mode UI spec (headless Chrome, CDP): the REAL entry gate, guest flow
// and guest wall in the browser, against the real backend.
import fs from 'node:fs';
import net from 'node:net';
import WebSocket from 'ws';
import { startServer } from './harness.mjs';

import { spawn } from 'node:child_process';
const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const WAIT = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url, what, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await WAIT(250);
  }
  throw new Error(`${what} never came up`);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  }
  async waitFor(expr, label, timeoutMs = 10_000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = await this.eval(expr);
      if (v) return v;
      await WAIT(200);
    }
    throw new Error(`timeout waiting for ${label}`);
  }
}

async function launchChrome(port) {
  const proc = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--enable-unsafe-swiftshader', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/bv-chrome-${port}`, '--window-size=1280,800', 'about:blank',
  ], { stdio: 'ignore' });
  await waitHttp(`http://127.0.0.1:${port}/json/list`, 'chrome devtools');
  return proc;
}

async function connectPage(cdpPort, url) {
  let target;
  try {
    target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json();
  } catch {
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    target = list.find((t) => t.type === 'page' && t.url === 'about:blank');
  }
  if (!target) throw new Error('could not create a new page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  if (url) {
    await cdp.send('Page.navigate', { url });
    await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  }
  return { cdp, close: async () => {
    try { await cdp.send('Target.closeTarget', { targetId: target.id }); } catch { /* already gone */ }
    ws.close();
  } };
}


const hdr = `// Guest-mode UI spec (headless Chrome, CDP): the REAL entry gate, guest flow\n// and guest wall in the browser, against the real backend.\n`;
const click = (sel) => `document.querySelector('${sel}').click(); true`;
const setName = (n) => `(() => { const el = document.querySelector('#resident-name'); const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, ${JSON.stringify(n)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`;

let failed = 0;
const step = async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message).slice(0, 400)}`); } };

process.env.PORT = '8787';
const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const PROFILE = `/tmp/bv-chrome-${cdpPort}`;
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const chrome = await launchChrome(cdpPort);
try {
  await waitHttp(`http://127.0.0.1:${vitePort}/`, 'vite dev server');
  const { cdp, close } = await connectPage(cdpPort, '');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` });
  await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);

  await step('first load shows the entry choice: Connect Wallet, Continue as Guest, and the skip X', async () => {
    await cdp.waitFor(`!!document.querySelector('[data-testid=entry-gate]')`, 'entry gate');
    const ok = await cdp.eval(`!!document.querySelector('[data-testid=entry-connect]') && !!document.querySelector('[data-testid=entry-guest]') && !!document.querySelector('.entry-x')`);
    if (!ok) throw new Error('entry controls missing');
    if (await cdp.eval(`!!document.querySelector('canvas')`)) throw new Error('game started before a choice was made');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/entry-gate.png', Buffer.from(shot.data, 'base64'));
  });

  await step('Continue as Guest → character name → game starts; no earnings/share card for a guest', async () => {
    await cdp.eval(click('[data-testid=entry-guest]'));
    await cdp.waitFor(`!!document.querySelector('#resident-name')`, 'name gate after guest choice');
    await cdp.eval(setName('GuestTester'));
    await cdp.eval(click('.name-submit'));
    await cdp.waitFor(`!!document.querySelector('canvas')`, 'game canvas', 25_000);
    await WAIT(1500);
    if (await cdp.eval(`!!document.querySelector('[data-testid=earnings-card]') || document.body.innerText.includes('Fees earned')`)) throw new Error('earnings/share card visible to a guest');
    const acc = await cdp.eval(`sessionStorage.getItem('blockville_access')`);
    if (!acc || !acc.includes('guest')) throw new Error('access not remembered: ' + acc);
  });

  await step('guest server identity: the page got a server-assigned guest session', async () => {
    await cdp.waitFor(`(sessionStorage.getItem('blockville_access')||'').includes('"guestSession":"')`, 'guestSession stored', 8000);
  });

  await step('guest opening Store / Market sees "connect wallet to play", not the shop', async () => {
    await cdp.eval(`[...document.querySelectorAll('.menu .mbtn')].find(b => b.title.includes('Blockville Store')).click(); true`);
    await cdp.waitFor(`!!document.querySelector('[data-testid=guest-wall]')`, 'guest wall (store)');
    if (await cdp.eval(`[...document.querySelectorAll('.modal-head h2')].some(h => /store/i.test(h.textContent) && !/connect/i.test(h.textContent))`)) throw new Error('real store rendered for a guest');
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('/tmp/guest-wall.png', Buffer.from(shot.data, 'base64'));
    await cdp.eval(`document.querySelector('.modal-head .x, .modal .x')?.click(); true`);
    await WAIT(300);
    await cdp.eval(`[...document.querySelectorAll('.menu .mbtn')].find(b => b.title.includes('plots on the market')).click(); true`);
    await cdp.waitFor(`!!document.querySelector('[data-testid=guest-wall]')`, 'guest wall (market)');
  });

  await step('refresh keeps the guest choice (same tab) and returns straight to the game', async () => {
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` });
    await cdp.waitFor(`document.readyState === 'complete'`, 'reload', 20_000);
    await cdp.waitFor(`!!document.querySelector('canvas') || !!document.querySelector('#resident-name')`, 'post-refresh screen', 20_000);
    if (await cdp.eval(`!!document.querySelector('[data-testid=entry-gate]')`)) throw new Error('entry gate shown again after refresh');
  });
  await close();
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
  try { vite.kill('SIGKILL'); } catch { /* already gone */ }
  stopServer();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* already gone */ }
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
