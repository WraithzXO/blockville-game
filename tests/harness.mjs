// Deterministic protocol harness for the Blockville multiplayer server.
// Event-driven only: every wait is a promise resolved by an incoming message
// matching a predicate. No sleeps, no fixed timings, no browser.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';

export let PORT = Number(process.env.PORT) || 8787;
const harnessInjected = []; // data paths this harness itself pointed at tmp

const freePort = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
});
const WAIT_MS = 3000;

export async function startServer() {
  const port = process.env.PORT ? Number(process.env.PORT) : await freePort();
  process.env.PORT = String(port); // exported Client reads the same PORT
  PORT = port;
  // Server-spawning specs get FULL persistence isolation: any redirectable
  // data path the spec has not set itself points at a FRESH tmp file, so a
  // test run can never write into the repo's production data/ directory
  // (audit finding: test runs had dirtied data/*.json*), and consecutive
  // spawns get FRESH state ("world state never leaks between cases").
  // Paths the SPEC set itself (restart-persistence flows, ledger assertions)
  // are left exactly as the spec wrote them — the harness only ever refreshes
  // paths it injected on a previous spawn.
  for (const k of ['BV_TREASURY_LEDGER', 'BV_TREASURY_STATE', 'BV_DIST_LEDGER', 'BV_CLAIMABLE_PATH', 'BV_ENTITLEMENTS_LEDGER', 'BV_UPGRADE_SIGNATURES', 'BV_PLOTS_PATH']) {
    if (!process.env[k] || harnessInjected.includes(k)) {
      process.env[k] = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bv-test-')), k.toLowerCase());
      if (!harnessInjected.includes(k)) harnessInjected.push(k);
    }
  }
  const child = spawn('node', ['server/index.mjs'], { cwd: new URL('..', import.meta.url).pathname, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port) } });
  // DEBUG_SERVER=1 echoes the spawned server's stderr into the test output.
  if (process.env.DEBUG_SERVER) child.stderr.pipe(process.stderr);
  // reap the server even if a test crashes the suite
  const reap = () => { try { child.kill('SIGKILL'); } catch { /* already gone */ } };
  process.on('exit', reap);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in 5s')), 5000);
    child.stdout.on('data', (d) => { if (String(d).includes('listening')) { clearTimeout(timer); resolve(); } });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited early (code ${code}): ${child.stderr.read()}`)); });
  });
  return () => { child.kill('SIGKILL'); process.off('exit', reap); };
}

export class Client {
  // url is optional: specs that need a raw-socket path (e.g. an unclean-drop
  // proxy) point the client at a different endpoint.
  constructor(url = `ws://localhost:${PORT}/ws`) {
    this.ws = new WebSocket(url);
    this.queue = [];          // all messages not yet consumed
    this.waiters = [];        // { predicate, resolve, timer }
    this.opened = new Promise((res, rej) => { this.ws.on('open', res); this.ws.on('error', rej); });
    this.closed = new Promise((res) => this.ws.on('close', res));
    this.ws.on('message', (raw) => {
      let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
      const i = this.waiters.findIndex((w) => w.predicate(msg));
      if (i !== -1) { const w = this.waiters.splice(i, 1)[0]; clearTimeout(w.timer); w.resolve(msg); }
      else this.queue.push(msg);
    });
  }

  send(msg) { this.ws.send(JSON.stringify(msg)); }

  // Resolve with the first message (new or already queued) matching the predicate.
  waitFor(predicate, label = 'message', windowMs = WAIT_MS) {
    const i = this.queue.findIndex(predicate);
    if (i !== -1) return Promise.resolve(this.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const wi = this.waiters.findIndex((w) => w.predicate === predicate);
        if (wi !== -1) this.waiters.splice(wi, 1);
        reject(new Error(`timeout after ${WAIT_MS}ms waiting for ${label}; queued: ${JSON.stringify(this.queue.map((m) => m.t))}`));
      }, windowMs);
      this.waiters.push({ predicate, resolve, timer });
    });
  }

  // Assert that no message of the given type arrives within a short window.
  // Uses a bounded wait (event-driven, not a sleep) to give a stray message
  // every chance to arrive before we declare its absence.
  async expectNone(predicate, label = 'message', windowMs = 700) {
    try { const m = await this.waitFor(predicate, `unexpected ${label} (none expected)`, windowMs); throw new Error(`expected no ${label} but got: ${JSON.stringify(m)}`); }
    catch (e) { if (!e.message.startsWith('timeout')) throw e; }
  }

  // session (optional): a token minted by POST /api/auth/verify — the only
  // way a connection binds to a verified wallet on the server.
  async join(name, x = 0, z = 0, world, session) {
    await this.opened;
    this.send({ t: 'join', name, look: null, x, z, ...(world ? { plotIds: world.plotIds, community: world.community } : {}), ...(session ? { session } : {}) });
    return this.waitFor((m) => m.t === 'welcome', 'welcome');
  }

  close() { try { this.ws.close(); } catch { /* already closed */ } }
}

export async function runTests(tests) {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`PASS  ${name}`); }
    catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
  }
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
  if (failed) process.exitCode = 1; // a failing spec must fail the npm test chain
  return failed;
}
