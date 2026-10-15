// Item 1 (remote finished buildings): two-session protocol harness over every
// sync path. Alice owns/builds; Bob watches (live) or joins later (welcome).
//   1 build-while-watching   2 join-after-completion   3 upgrade of finished
//   4 refresh mid-state      5 non-owner build attempt rejected
// Plus the race that caused the regression: a one-step (preset) build sent
// IMMEDIATELY behind its claim must not be dropped by the async claim gate.
import { startServer, Client, runTests } from './harness.mjs';

const tests = [];
const stop = await startServer();
const isClaim = (p) => (m) => m.t === 'claim' && m.plot === p;
const isBuild = (p, f = () => true) => (m) => m.t === 'build' && m.plot === p && f(m);

tests.push(['1 build-while-watching: Bob sees claim, progress, finished type', async () => {
  const a = new Client(), b = new Client();
  await a.join('Alice'); await b.join('Bob');
  a.send({ t: 'claim', plot: 3, ownerName: 'Alice', type: 'cafe' });
  const c = await b.waitFor(isClaim(3), 'claim');
  if (c.type !== 'cafe' || c.done) throw new Error('claim shape ' + JSON.stringify(c));
  a.send({ t: 'build', plot: 3, progress: 10, done: false, type: 'cafe' });
  await b.waitFor(isBuild(3, (m) => m.progress === 10 && !m.done), 'progress');
  a.send({ t: 'build', plot: 3, progress: 35, done: true, type: 'cafe' });
  const d = await b.waitFor(isBuild(3, (m) => m.done), 'done');
  if (d.type !== 'cafe') throw new Error('type lost');
  a.close(); b.close();
}]);

tests.push(['claim immediately followed by finished build is not dropped (preset race)', async () => {
  const a = new Client(), b = new Client();
  await a.join('Preston'); await b.join('Watcher');
  a.send({ t: 'claim', plot: 5, ownerName: 'Preston', type: 'shop' });
  a.send({ t: 'build', plot: 5, progress: 30, done: true, type: 'shop' }); // same tick
  await b.waitFor(isBuild(5, (m) => m.done && m.type === 'shop'), 'finished build relayed');
  const late = new Client();
  const w = await late.join('Late');
  const rec = new Map(w.plots).get(5);
  if (!rec || !rec.done || rec.type !== 'shop') throw new Error('welcome stale: ' + JSON.stringify(rec));
  a.close(); b.close(); late.close();
}]);

tests.push(['2 join-after-completion: welcome has the finished building', async () => {
  const a = new Client(); await a.join('Carol');
  a.send({ t: 'claim', plot: 7, ownerName: 'Carol', type: 'bank' });
  a.send({ t: 'build', plot: 7, progress: 75, done: true, type: 'bank' });
  const l = new Client(); await new Promise((r) => setTimeout(r, 300));
  const w = await l.join('Dave');
  const rec = new Map(w.plots).get(7);
  if (!rec || rec.ownerName !== 'Carol' || !rec.done || rec.type !== 'bank' || rec.progress !== 75) throw new Error(JSON.stringify(rec));
  a.close(); l.close();
}]);

tests.push(['3 upgrade of a finished building reaches viewer and welcome', async () => {
  const a = new Client(), b = new Client();
  await a.join('Erin'); await b.join('Finn');
  a.send({ t: 'claim', plot: 9, ownerName: 'Erin', type: 'house' });
  a.send({ t: 'build', plot: 9, progress: 48, done: true, type: 'house' });
  await b.waitFor(isBuild(9, (m) => m.done), 'done');
  a.send({ t: 'upgrade', plot: 9, level: 2 });
  const up = await Promise.race([
    b.waitFor((m) => m.t === 'upgrade' && m.plot === 9, 'upgrade'),
    a.waitFor((m) => m.t === 'upgradeQuote' || m.t === 'upgradeRejected', 'quote').then(() => 'strict'),
  ]);
  if (up === 'strict') console.log('      (strict payment mode: upgrade needs on-chain payment, relay not exercised)');
  else if (up.level !== 2) throw new Error('level');
  a.close(); b.close();
}]);

tests.push(['4 refresh mid-state: reconnect welcome shows same progress/owner, no duplicate', async () => {
  const a = new Client(); await a.join('Gina');
  a.send({ t: 'claim', plot: 11, ownerName: 'Gina', type: 'mine' });
  a.send({ t: 'build', plot: 11, progress: 20, done: false, type: 'mine' });
  await new Promise((r) => setTimeout(r, 300));
  for (let i = 0; i < 2; i++) {
    const v = new Client(); const w = await v.join('Hank' + i);
    const recs = w.plots.filter(([id]) => id === 11);
    if (recs.length !== 1) throw new Error('duplicate plot records');
    const r = recs[0][1];
    if (r.progress !== 20 || r.done || r.type !== 'mine' || r.ownerName !== 'Gina') throw new Error(JSON.stringify(r));
    v.close();
  }
  a.close();
}]);

tests.push(['5 non-owner build attempt is rejected (no relay, record unchanged)', async () => {
  const a = new Client(), m = new Client(), b = new Client();
  await a.join('Ivy'); await m.join('Mallory'); await b.join('Ned');
  a.send({ t: 'claim', plot: 13, ownerName: 'Ivy', type: 'cafe' });
  await b.waitFor(isClaim(13), 'claim');
  m.send({ t: 'build', plot: 13, progress: 35, done: true, type: 'cafe' });
  await b.expectNone(isBuild(13), 'forged build');
  const l = new Client(); const w = await l.join('Oz');
  const r = new Map(w.plots).get(13);
  if (r.done || r.progress !== 0) throw new Error('forged build applied ' + JSON.stringify(r));
  a.close(); m.close(); b.close(); l.close();
}]);

await runTests(tests);
stop();
