// Focused debug: when does the server finalize an unclean-dropped session?
import { startServer, Client, PORT } from './harness.mjs';
import crypto from 'node:crypto';
import net from 'node:net';
import WebSocket from 'ws';
import { base58Encode } from '../server/auth.mjs';

process.env.BV_SESSION_HEARTBEAT_MS = '1500';
process.env.BV_SESSION_GRACE_MS = '1200';
process.env.BV_SESSION_SWEEP_MS = '200';
process.env.BV_MARKET_TICK_MS = '3600000';

const t0 = Date.now();
const log = (who, m) => console.log(`[${String(Date.now() - t0).padStart(5)}ms] ${who}: ${JSON.stringify(m).slice(0, 140)}`);

const makeWallet = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return { privateKey, wallet: base58Encode(raw) };
};
const w = makeWallet();
const stop = await startServer();
const post = async (path, body) => {
  const r = await fetch(`http://localhost:${process.env.PORT}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
};
const n = await post('/api/auth/nonce', { wallet: w.wallet });
const token = (await post('/api/auth/verify', { wallet: w.wallet, nonce: n.nonce, signature: base58Encode(crypto.sign(null, Buffer.from(n.message), w.privateKey)) })).token;
console.log('token minted');

// observer: logs everything
const obs = new Client();
await obs.join('Obs');
obs.ws.on('message', (raw) => { try { log('obs', JSON.parse(String(raw))); } catch {} });

// proxy
const upstreams = new Set();
const proxy = net.createServer((sock) => {
  const up = net.connect(PORT, '127.0.0.1', () => {});
  sock.pipe(up); up.pipe(sock);
  sock.on('error', (e) => console.log(`[${Date.now() - t0}ms] proxy sock error: ${e.code}`));
  sock.on('close', () => console.log(`[${Date.now() - t0}ms] proxy sock CLOSE (client leg dead)`));
  up.on('error', (e) => console.log(`[${Date.now() - t0}ms] proxy up error: ${e.code}`));
  up.on('close', () => console.log(`[${Date.now() - t0}ms] proxy up CLOSE (server leg gone)`));
  up.on('end', () => console.log(`[${Date.now() - t0}ms] proxy up END (server sent FIN)`));
  sock.on('close', () => upstreams.add(up));
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));

const a = new WebSocket(`ws://localhost:${proxy.address().port}/ws`);
let ghostId = null;
a.on('message', (raw) => { try { const m = JSON.parse(String(raw)); if (m.t === 'welcome') ghostId = m.id; log('ghost', m); } catch {} });
await new Promise((res, rej) => { a.on('open', res); a.on('error', rej); });
a.send(JSON.stringify({ t: 'join', name: 'Ghost', look: null, x: 1, z: 1, session: token }));
await new Promise((r) => setTimeout(r, 300));

console.log('--- KILLING CLIENT LEG ---');
a._socket.destroy();

// immediately: duplicate attempt
const early = new Client();
early.ws.on('message', (raw) => { try { log('early', JSON.parse(String(raw))); } catch {} });
await early.opened;
early.send(JSON.stringify({ t: 'join', name: 'Ghost', look: null, x: 0, z: 0, session: token }));
await new Promise((r) => setTimeout(r, 4000));
proxy.close();
for (const up of upstreams) { try { up.destroy(); } catch {} }
stop();
