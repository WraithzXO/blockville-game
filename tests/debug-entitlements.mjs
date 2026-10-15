import { spawn } from 'node:child_process';
process.env.PORT = '8899';
process.env.BV_DEMO_SEED_TOKENS = '40000';
process.env.BV_ENTITLEMENT_VERIFY_MS = '250';
process.env.BV_ALLOW_DEMO_HOLDINGS_SET = '1';
const child = spawn('node', ['server/index.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stderr.on('data', (d) => console.error('STDERR:', String(d).slice(0, 800)));
child.stdout.on('data', (d) => { if (String(d).includes('listening')) run(); });
child.on('exit', (c) => console.log('EXIT', c));
const run = async () => {
  const WebSocket = (await import('ws')).default;
  const mk = (name) => new Promise((res) => {
    const ws = new WebSocket('ws://localhost:8899/ws');
    const msgs = [];
    ws.on('message', (r) => { const m = JSON.parse(String(r)); msgs.push(m.t); if (m.t === 'welcome' || msgs.length > 6) { console.log(name, 'msgs:', msgs.join(','), m.t === 'welcome' ? 'WELCOME_OK' : ''); ws.close(); res(); } });
    ws.on('error', (e) => { console.log(name, 'ERR', e.message); res(); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, look: null, x: 0, z: 0 })));
    setTimeout(() => { console.log(name, 'TIMEOUT msgs:', msgs.join(',')); ws.close(); res(); }, 2500);
  });
  await mk('first');
  await mk('second');
  child.kill('SIGKILL');
};
