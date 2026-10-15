// Earnings card spec (fee-payouts chunk): drives the REAL server + the real
// UI in headless Chrome (CDP, same pattern as hud-restructure.spec.mjs) and
// verifies, end to end over a live shortened cycle (BV_CYCLE_MS):
//   • the earnings card is visible by default, in one bottom-left column
//     above the activity log, without overlapping it or other HUD elements
//   • the card's holdings/fees figures match the server's authoritative
//     snapshots (cross-checked through a second WS client for the same name)
//   • a real payout cycle produces a PERSONAL-tab entry (amount, cycle id,
//     timestamp) for the recipient, and nothing for a non-recipient
//   • Share renders the PNG from real data and opens an X compose intent
//     with the @blockville_ tag and pre-filled text (never auto-posts)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import WebSocket from 'ws';
import { startServer, Client } from './harness.mjs';

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

async function boot(cdp, vitePort, name = 'Tester') {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${vitePort}/?autoname=${name}` });
  await cdp.waitFor(`document.readyState === 'complete'`, 'page load', 20_000);
  const hasGate = await cdp.eval(`!!document.querySelector('#resident-name')`);
  if (hasGate) {
    await cdp.eval(`(() => {
      const el = document.querySelector('#resident-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(name)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await cdp.eval(`document.querySelector('.name-submit').click(); true`);
  }
  const hasModes = await cdp.waitFor(
    `[!!document.querySelector('canvas'), [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Demo mode')].some(x => x)`,
    'canvas or mode screen',
    20_000,
  );
  if (hasModes[1]) {
    await cdp.eval(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Demo mode').click(); true`);
  }
  await cdp.waitFor(`!!document.querySelector('canvas')`, 'game canvas', 25_000);
  await WAIT(1200); // let the engine run its first frames
}

const PLAYER = 'CardTester';
const rectsOverlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
const CARD = `document.querySelector('[data-testid="earnings-card"]')`;
const FIGS = `(() => {
  const h = document.querySelector('[data-testid="earnings-holdings"]');
  const f = document.querySelector('[data-testid="earnings-fees"]');
  return { holdings: h ? h.textContent.trim() : null, fees: f ? f.textContent.trim() : null };
})()`;
const OPEN_PERSONAL = `(() => {
  const log = document.querySelector('.activity-log');
  if (!log.classList.contains('expanded')) log.querySelector('.log-tabs').click();
  [...log.querySelectorAll('.log-tab')].find(b => b.textContent.includes('PERSONAL')).click();
  return true;
})()`;

const tests = [
  ['the earnings card is visible by default, above the log in one bottom-left column', async ({ cdp }) => {
    const r = await cdp.eval(`(() => {
      const rectsOverlap = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const card = document.querySelector('[data-testid="earnings-card"]');
      const col = document.querySelector('[data-testid="bl-col"]');
      const log = document.querySelector('.activity-log');
      if (!card || !col || !log) return null;
      const cr = card.getBoundingClientRect(), lr = log.getBoundingClientRect(), colr = col.getBoundingClientRect();
      const cs = getComputedStyle(col);
      return {
        visible: cr.width > 0 && cr.height > 0,
        colContainsCard: col.contains(card), colContainsLog: col.contains(log),
        cardAboveLog: cr.bottom <= lr.top + 1,
        sameLeft: Math.abs(cr.left - lr.left) < 2,
        colLeft: cs.left, colBottom: cs.bottom,
        overlap: rectsOverlap(cr, lr),
      };
    })()`);
    if (!r) throw new Error('card / column / log not all present');
    if (!r.visible) throw new Error('card not visible by default');
    if (!r.colContainsCard || !r.colContainsLog) throw new Error('card and log do not share one column');
    if (!r.cardAboveLog) throw new Error('card is not above the log');
    if (r.overlap) throw new Error('card overlaps the log');
    if (r.colLeft !== '16px' || !r.colBottom.startsWith('18px')) {
      throw new Error(`column moved the log anchor: left ${r.colLeft} bottom ${r.colBottom}`);
    }
  }],

  ['holdings and fees figures match the server snapshots for this identity', async ({ cdp, helper }) => {
    // the helper client (same demo identity, real server) just received the
    // same authoritative pushes the page did — compare against the card
    const figs = await cdp.eval(FIGS);
    if (!figs || figs.holdings === null) throw new Error('card figures missing');
    if (figs.holdings.includes('—') || figs.fees.includes('—')) throw new Error('card renders dashes instead of server figures');
    if (!/^[0-9,]+$/.test(figs.holdings) || !/^[0-9,]+$/.test(figs.fees)) throw new Error(`figures not plain numbers: ${JSON.stringify(figs)}`);
    if (figs.holdings !== (helper.snapshot.tokens ?? 0).toLocaleString('en-US')) {
      throw new Error(`holdings ${figs.holdings} ≠ server entitlement ${helper.snapshot.tokens}`);
    }
    if (figs.fees !== (helper.snapshot.feesTotal ?? 0).toLocaleString('en-US')) {
      throw new Error(`fees ${figs.fees} ≠ server feesEarned ${helper.snapshot.feesTotal}`);
    }
  }],

  ['a real payout cycle: recipient gets a PERSONAL entry with amount, cycle id, timestamp; bystander gets nothing', async ({ cdp, helper, bystander }) => {
    // helper claims a free plot for the shared identity and completes it
    const welcome = helper.welcome;
    // the demo world boots with NO claimed plots (NPC sims claim over time),
    // so pick the lowest plot id not owned by someone else
    const owned = new Map(welcome.plots.map(([pid, rec]) => [pid, rec]));
    let plot = 0;
    while (owned.has(plot) && owned.get(plot).ownerName && owned.get(plot).ownerName !== PLAYER) plot++;
    if (plot >= 512) throw new Error('no free plot to claim');
    helper.send({ t: 'claim', plot, ownerName: PLAYER, type: 'shop' });
    // the fresh-claim path broadcasts to OTHERS only — the claimer learns it
    // through the entitlement push (claimed count goes 0 → 1)
    await helper.waitFor((m) => m.t === 'entitlement' && m.claimed >= 1, 'claim recorded', 6000);
    helper.send({ t: 'build', plot, type: 'shop', progress: 30 }); // BUILD_BLOCKS.shop = 30 → done
    await WAIT(700); // the server applies the build synchronously on receipt
    // fund the treasury through the real shop-recycling path (fence = 500)
    helper.send({ t: 'shopPurchase', item: 'fence' });

    const payout = await helper.waitFor((m) => m.t === 'treasuryPayout', 'treasuryPayout', 12_000);
    if (!(payout.amount > 0)) throw new Error(`payout amount ${payout.amount}`);
    if (!Number.isFinite(payout.ts) || !(payout.ts > 0)) throw new Error('payout carried no server timestamp');
    // cycles keep accruing every 1.5s — freeze one concrete payout to match
    await WAIT(2500);
    const payouts = helper.queue.filter((m) => m.t === 'treasuryPayout');
    helper.queue = helper.queue.filter((m) => m.t !== 'treasuryPayout');
    const expected = payouts[payouts.length - 1] ?? payout;

    // a bystander with no plots must NOT be paid
    await bystander.expectNone((m) => m.t === 'treasuryPayout', 'treasuryPayout (bystander)', 4_000);

    // the page (same identity) shows the payout in the PERSONAL tab
    await cdp.eval(OPEN_PERSONAL);
    await cdp.waitFor(`(() => {
      const items = [...document.querySelectorAll('.activity-log .feed-item')];
      return items.some(i => i.textContent.includes('Treasury payout'));
    })()`, 'personal payout entry', 10_000);
    const entry = await cdp.eval(`(() => {
      const wantAmount = ${JSON.stringify(`+${expected.amount.toLocaleString('en-US')}`)};
      const wantCycle = ${JSON.stringify(`Cycle #${expected.cycle}`)};
      const item = [...document.querySelectorAll('.activity-log .feed-item')]
        .find(i => i.textContent.includes(wantAmount) && i.textContent.includes(wantCycle));
      if (!item) return null;
      return { text: item.querySelector('b')?.textContent ?? '', detail: item.querySelector('small')?.textContent ?? '' };
    })()`);
    if (!entry) throw new Error(`no PERSONAL entry for payout +${expected.amount.toLocaleString('en-US')} cycle #${expected.cycle}`);
    if (!entry.detail.includes(`Cycle #${expected.cycle}`)) throw new Error(`entry cycle mismatch: ${entry.detail}`);
    if (!/\d{1,2}:\d{2}:\d{2}/.test(entry.detail)) throw new Error(`entry missing timestamp: ${entry.detail}`);

    // the card's fees figure updates to the fresh server snapshot
    // cycles keep running, so pair the DOM figure with the authoritative
    // /api/treasury/cycles ledger (the same records feesSnapshot derives
    // from) and retry the pair until they land in the same instant
    // The ledger fetch and the DOM read happen INSIDE ONE page-side JS task:
    // the value the card displays can only advance when a WS message is
    // processed, so a snapshot taken and the DOM read in the same task cannot
    // disagree by a whole cycle. (The old two-step fetch→read raced the page's
    // message processing and flaked under load.)
    const PAIR = `((async () => {
      const d = await (await fetch('http://127.0.0.1:8787/api/treasury/cycles?limit=500')).json();
      const total = d.cycles.reduce((s, r) => s + (r.payouts ?? []).filter((p) => p.name === ${JSON.stringify(PLAYER)}).reduce((a, p) => a + p.amount, 0), 0);
      const h = document.querySelector('[data-testid="earnings-holdings"]');
      const f = document.querySelector('[data-testid="earnings-fees"]');
      return { total, fees: f ? f.textContent.trim() : null, holdings: h ? h.textContent.trim() : null };
    })())`;
    let matched = false;
    for (let i = 0; i < 8 && !matched; i++) {
      const pair = await cdp.eval(PAIR);
      if (!(pair.total > 0)) throw new Error(`ledger shows no lifetime fees for ${PLAYER}`);
      helper.snapshot.feesTotal = pair.total;
      if (pair.fees === pair.total.toLocaleString('en-US')) matched = true;
      else await WAIT(500);
    }
    if (!matched) throw new Error(`card fees figure never matched a server snapshot (${helper.snapshot.feesTotal})`);
  }],

  ['Share downloads a real-data PNG and opens the X intent with the tag and pre-filled text; nothing pending after', async ({ cdp }) => {
    // payout entries land every shortened cycle — exclude them from the
    // "share left nothing pending" count, they are the game, not the share
    const COUNT_NON_PAYOUT = `[...document.querySelectorAll('.activity-log .feed-item')].filter(i => !i.textContent.includes('Treasury payout')).length`;
    const before = await cdp.eval(COUNT_NON_PAYOUT);
    await cdp.eval(`(() => {
      window.__share = {};
      window.open = (u) => { window.__share.url = u; return null; };
      HTMLAnchorElement.prototype.click = function () { window.__share.download = this.download; window.__share.href = this.href; };
      return true;
    })()`);
    const preFees = await cdp.eval(`(() => {
      const pre = document.querySelector('[data-testid="earnings-fees"]').textContent.trim();
      document.querySelector('[data-testid="earnings-share"]').click();
      return pre;
    })()`);
    await cdp.waitFor(`!!window.__share.url`, 'X intent opening', 10_000);
    const captured = await cdp.eval(`window.__share`);
    if (!/^data:image\/png;base64,/.test(captured.href)) throw new Error('share did not produce a PNG data URL');
    const pngBytes = Buffer.from(captured.href.split(',')[1] ?? '', 'base64');
    // real PNG magic + a canvas big enough to actually hold the card
    if (pngBytes.slice(1, 4).toString('ascii') !== 'PNG') throw new Error('share image is not a PNG');
    if (pngBytes.length < 5_000) throw new Error(`share image suspiciously small (${pngBytes.length} bytes)`);
    if (captured.download !== 'blockville-earnings.png') throw new Error(`download name ${captured.download}`);
    const url = new URL(captured.url);
    if (url.origin !== 'https://twitter.com' || url.pathname !== '/intent/tweet') throw new Error(`not an X compose intent: ${captured.url}`);
    const text = url.searchParams.get('text') ?? '';
    if (!text.includes('@blockville_')) throw new Error(`draft missing the tag: ${text}`);
    // cycles keep accruing: the draft froze the figure at click time, so the
    // DOM figure may have moved by one cycle. The draft number must equal the
    // card figure immediately before OR after the click — both are real
    // server snapshots, never invented.
    const postFees = await cdp.eval(`${FIGS}.fees`);
    const draftNum = (text.match(/earned ([\d,]+) \$BLOCKVILLE/) ?? [])[1];
    if (!draftNum) throw new Error(`draft missing the fees figure: ${text}`);
    if (draftNum !== preFees && draftNum !== postFees) {
      throw new Error(`draft figure ${draftNum} matches neither card snapshot (${preFees} / ${postFees})`);
    }
    if (!/come claim land|build/i.test(text)) throw new Error(`draft has no invitation: ${text}`);
    // nothing pending in game state: the log did not grow and no modal opened
    const after = await cdp.eval(COUNT_NON_PAYOUT);
    if (after !== before) throw new Error(`share mutated the log (${before} → ${after})`);
    const modal = await cdp.eval(`!!document.querySelector('.modal')`);
    if (modal) throw new Error('share opened a modal');
  }],
];

// ── run ─────────────────────────────────────────────────────────────────────
let failed = 0;
process.env.PORT = '8787';           // the browser client dials ws://<host>:8787
process.env.BV_CYCLE_MS = '1500';    // shortened cycles: a real payout in seconds
process.env.BV_FEE_SIM_SOL = '0';    // the fee intake itself is driven by shopPurchase
const stopServer = await startServer();
const vitePort = await freePort();
const cdpPort = await freePort();
const PROFILE = `/tmp/bv-chrome-${cdpPort}`;
const vite = spawn('node', ['node_modules/.bin/vite', '--port', String(vitePort), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const chrome = await launchChrome(cdpPort);
// WS clients sharing the page player's demo identity (server-authoritative
// snapshots + the claim/build/shopPurchase drivers) and a payout bystander.
const helper = new Client();
const bystander = new Client();
try {
  await waitHttp(`http://127.0.0.1:${vitePort}/`, 'vite dev server');
  const { cdp, close } = await connectPage(cdpPort, '');
  await boot(cdp, vitePort, PLAYER);

  await helper.opened;
  helper.send({ t: 'join', name: PLAYER, look: null, x: 0, z: 0 });
  helper.welcome = await helper.waitFor((m) => m.t === 'welcome', 'helper welcome', 6000);
  const ent = await helper.waitFor((m) => m.t === 'entitlement' && m.tokens != null, 'helper entitlement', 6000);
  const fees0 = await helper.waitFor((m) => m.t === 'feesEarned', 'helper feesEarned', 6000);
  helper.snapshot = { tokens: ent.tokens, feesTotal: fees0.total };

  await bystander.opened;
  bystander.send({ t: 'join', name: 'Bystander', look: null, x: 0, z: 0 });
  await bystander.waitFor((m) => m.t === 'welcome', 'bystander welcome', 6000);

  const ctx = { cdp, helper, bystander };
  for (const [name, fn] of tests) {
    try { await fn(ctx); console.log(`PASS  ${name}`); }
    catch (e) { failed++; console.log(`FAIL  ${name}\n      ${String(e.message).slice(0, 400)}`); }
  }
  await close();
} finally {
  try { chrome.kill('SIGKILL'); } catch { /* already gone */ }
  try { vite.kill('SIGKILL'); } catch { /* already gone */ }
  stopServer();
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* already gone */ }
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
process.exit(failed ? 1 : 0);
