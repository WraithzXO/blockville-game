// Dev-only UI screenshot probe (like debug-buildings.mjs): boots the game,
// opens each panel/modal and captures full-page PNGs for visual review.
// Usage: node tests/debug-ui.mjs [outdir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import WebSocket from 'ws';

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const OUT = process.argv[2] || '/tmp/ui-shots';
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

const vitePort = await freePort();
const cdpPort = await freePort();
const serverPort = await freePort();
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], {
  cwd: ROOT, stdio: 'ignore',
  env: { ...process.env, VITE_SERVER_PORT: String(serverPort) },
});
const server = spawn('node', ['server/index.mjs'], {
  cwd: ROOT, stdio: 'ignore', env: { ...process.env, PORT: String(serverPort) },
});
const cleanup = () => {
  try { vite.kill('SIGTERM'); } catch { /* gone */ }
  try { server.kill('SIGTERM'); } catch { /* gone */ }
  try { chrome.kill('SIGKILL'); } catch { /* gone */ }
  try { fs.rmSync(`/tmp/bv-chrome-ui-${cdpPort}`, { recursive: true, force: true }); } catch { /* gone */ }
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(2); });

await waitHttp(`http://127.0.0.1:${vitePort}`, 'vite');
await waitHttp(`http://127.0.0.1:${serverPort}/api/health`, 'game server');

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
  '--enable-unsafe-swiftshader', `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=/tmp/bv-chrome-ui-${cdpPort}`, '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
await waitHttp(`http://127.0.0.1:${cdpPort}/json/list`, 'chrome devtools');

const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?url=about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 0 });
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
const cdp = new CDP(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');

const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log('SHOT', name);
};
const clickText = async (txt) => {
  const r = await cdp.eval(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().includes(${JSON.stringify(txt)}));
    if (!b) return 'NOT FOUND';
    b.click();
    return 'clicked: ' + b.textContent.trim();
  })()`);
  console.log('CLICK', txt, '→', r);
};

try {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/` });
  await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  fs.mkdirSync(OUT, { recursive: true });
  await shot('00-name-gate');
  // pick demo mode, enter a name
  const hasGate = await cdp.eval(`!!document.querySelector('#resident-name')`);
  if (hasGate) {
    await cdp.eval(`(() => {
      const el = document.querySelector('#resident-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, 'Jacob');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await cdp.eval(`document.querySelector('.name-submit').click(); true`);
  }
  const hasModes = await cdp.waitFor(
    `[!!document.querySelector('canvas'), [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Demo mode')].some(x => x)`,
    'canvas or mode screen', 20_000);
  if (hasModes[1]) {
    await shot('01-mode-screen');
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Demo mode').click(); true`);
  }
  await cdp.waitFor(`!!document.querySelector('canvas')`, 'game canvas', 25_000);
  await WAIT(1800);
  await shot('02-hud-game');
  await shot('03-activity-log');
  // become a Builder so the Character/customise screen (builder-only) can open
  await clickText('Stake');
  await cdp.waitFor(`!!document.querySelector('.stake-dock')`, 'stake dock', 6_000);
  await cdp.eval(`[...document.querySelectorAll('.stake-dock button')].find(b => b.textContent.includes('become a Builder'))?.click(); true`);
  await cdp.waitFor(`!!document.querySelector('.badge.on')`, 'BUILDER badge', 6_000);
  // staking auto-opens the customise modal (first-visit onboarding) — close it
  // so the Settings shot isn't taken with two modals stacked
  await cdp.eval(`[...document.querySelectorAll('.modal .x')].forEach(b => b.click()); true`);
  await WAIT(200);
  await clickText('Settings');
  await cdp.waitFor(`!!document.querySelector('.modal')`, 'settings modal', 6_000);
  await shot('04-settings');
  await cdp.eval(`document.querySelector('.modal .x')?.click(); true`);
  await WAIT(200);
  await clickText('Character');
  await cdp.waitFor(`!!document.querySelector('.modal')`, 'customise modal', 6_000);
  await WAIT(600);
  console.log('RECTS', JSON.stringify(await cdp.eval(`(() => {
    const m = document.querySelector('.modal');
    const mb = document.querySelector('.modal-body');
    const r = (el) => el ? { t: Math.round(el.getBoundingClientRect().top), b: Math.round(el.getBoundingClientRect().bottom), h: Math.round(el.getBoundingClientRect().height), scroll: el.scrollHeight, client: el.clientHeight } : null;
    return { innerH: window.innerHeight, modal: r(m), body: r(mb) };
  })()`)));
  await shot('05-customise');
  await cdp.eval(`document.querySelector('.modal .x')?.click(); true`);
  await WAIT(200);
  await clickText('Store');
  await cdp.waitFor(`!!document.querySelector('.store-sections')`, 'store panel', 6_000);
  await shot('06-store');
  await cdp.eval(`[...document.querySelectorAll('.panel .x')].forEach(b => b.click()); true`);
  await WAIT(200);
  await clickText('Market');
  await cdp.waitFor(`!!document.querySelector('.modal')`, 'market modal', 6_000);
  await shot('07-market');
  await cdp.eval(`[...document.querySelectorAll('.modal .x')].forEach(b => b.click()); true`);
  await cdp.waitFor(`!document.querySelector('.modal')`, 'market modal closed', 6_000);
  await clickText('Treasury');
  await cdp.waitFor(`!!document.querySelector('.modal')`, 'treasury modal', 6_000);
  await shot('08-treasury');
  await cdp.eval(`[...document.querySelectorAll('.modal .x')].forEach(b => b.click()); true`);
  await cdp.waitFor(`!document.querySelector('.modal')`, 'treasury modal closed', 6_000);
  // responsive sweep: narrow laptop and small tablet widths
  for (const [w, h] of [[720, 560], [420, 760]]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await WAIT(500);
    const overflow = await cdp.eval(`document.documentElement.scrollWidth > window.innerWidth + 1`);
    console.log(`VIEW ${w}x${h} horizontal-overflow=${overflow}`);
    if (overflow) {
      const offenders = await cdp.eval(`[...document.querySelectorAll('body *')]
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1 && !el.querySelector(':scope > *') === false)
        .slice(0, 12)
        .map(el => el.className + '#' + el.id + ' r=' + Math.round(el.getBoundingClientRect().right))`);
      console.log('OFFENDERS', JSON.stringify(offenders));
      console.log('MQ720', await cdp.eval(`matchMedia('(max-width: 720px)').matches`));
      console.log('PILLSWRAP', await cdp.eval(`getComputedStyle(document.querySelector('.pills')).flexWrap`));
      console.log('TOPBARW', await cdp.eval(`Math.round(document.querySelector('.topbar').getBoundingClientRect().width)`));
    }
    await shot(`${w}x${h}-hud`);
    await clickText('Settings');
    await cdp.waitFor(`!!document.querySelector('.modal')`, 'settings modal', 6_000);
    await shot(`${w}x${h}-settings`);
    await cdp.eval(`[...document.querySelectorAll('.modal .x')].forEach(b => b.click()); true`);
    await WAIT(200);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  console.log('DONE');
} catch (e) {
  console.error('PROBE-FAIL', e.message);
  process.exitCode = 1;
} finally {
  try { await cdp.send('Target.closeTarget', { targetId: target.id }); } catch { /* gone */ }
  ws.close();
  cleanup();
}
