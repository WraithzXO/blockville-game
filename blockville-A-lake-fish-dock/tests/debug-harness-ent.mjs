process.env.BV_DEMO_SEED_TOKENS = '40000';
process.env.BV_ENTITLEMENT_VERIFY_MS = '250';
process.env.BV_ALLOW_DEMO_HOLDINGS_SET = '1';
const { startServer, Client } = await import('./harness.mjs');
const stop = await startServer();
const t0 = Date.now();
const spy = (c, label) => { c.ws.on('message', (r) => console.log(Date.now() - t0, label, '<<', String(r).slice(0, 80))); };
const c = new Client();
spy(c, 'c1');
await c.join('TierTwo');
console.log(Date.now() - t0, 'joined 1');
const e = await c.waitFor((m) => m.t === 'entitlement', 'ent');
console.log(Date.now() - t0, 'entitlement:', JSON.stringify(e));
c.close();
const c2 = new Client();
spy(c2, 'c2');
try { await c2.join('Builder'); console.log(Date.now() - t0, 'joined 2'); } catch (err) { console.log(Date.now() - t0, 'JOIN2 FAIL:', err.message); }
stop?.();
process.exit(0);
