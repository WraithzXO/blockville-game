// Chunk 5 tests — treasury wallet holdings display: the read-only RPC balance
// of the PUBLIC treasury wallet (server-side), the last-valid-on-error cache,
// automatic recovery, the no-mint idle path, and the /api/treasury/holdings
// endpoint against a real server with a local mock RPC. No real transactions,
// no key material anywhere.
import http from 'node:http';
import { runTests, startServer, PORT } from './harness.mjs';
import { createHoldingsTracker, resolveHoldingsConfig } from '../server/holdings.mjs';
import { ONCHAIN } from '../server/tokenomics.mjs';

const MINT = 'TestMint1111111111111111111111111111111111';

// jsonParsed SPL token accounts: two accounts → 12.5 + 0.25 = 12.75
const rpcOk = (balanceA = 12.5, balanceB = 0.25) => async () => ({
  ok: true,
  json: async () => ({
    jsonrpc: '2.0',
    id: 1,
    result: {
      value: [
        { account: { data: { parsed: { info: { tokenAmount: { uiAmount: balanceA, decimals: 6 } } } } } },
        { account: { data: { parsed: { info: { tokenAmount: { uiAmount: balanceB, decimals: 6 } } } } } },
      ],
    },
  }),
});
const rpcFail = async () => { throw new Error('connection refused'); };

const mkClock = () => { let t = 1_000_000; return { now: () => t, tick: (ms) => { t += ms; } }; };

const withMint = (fn) => async () => {
  const had = process.env.BLOCKVILLE_MINT;
  process.env.BLOCKVILLE_MINT = MINT;
  try { await fn(); }
  finally { if (had === undefined) delete process.env.BLOCKVILLE_MINT; else process.env.BLOCKVILLE_MINT = had; }
};

const tests = [
  ['no mint configured: idles safely, zero RPC calls, balance 0', async () => {
    const had = process.env.BLOCKVILLE_MINT;
    delete process.env.BLOCKVILLE_MINT;
    try {
      const { now } = mkClock();
      const h = createHoldingsTracker({ fetchImpl: rpcOk(), now });
      const s = await h.get();
      if (s.configured !== false) throw new Error(`configured=${s.configured}`);
      if (s.balance !== 0) throw new Error(`balance=${s.balance}`);
      if (s.stale !== false) throw new Error(`stale=${s.stale}`);
      if (h.rpcCalls() !== 0) throw new Error(`RPC called ${h.rpcCalls()} times with no mint`);
      if (s.wallet !== ONCHAIN.treasuryWalletAddress) throw new Error('public wallet missing');
    } finally { if (had !== undefined) process.env.BLOCKVILLE_MINT = had; }
  }],

  ['successful read: sums token accounts, decimals, not stale', withMint(async () => {
    const { now } = mkClock();
    const h = createHoldingsTracker({ fetchImpl: rpcOk(), now });
    const s = await h.get();
    if (s.configured !== true) throw new Error('configured wrong');
    if (s.balance !== 12.75) throw new Error(`balance=${s.balance}`);
    if (s.decimals !== 6) throw new Error(`decimals=${s.decimals}`);
    if (s.stale !== false) throw new Error('fresh read marked stale');
    if (s.updatedAt !== 1_000_000) throw new Error(`updatedAt=${s.updatedAt}`);
  })],

  ['RPC request carries the public address only — no key material', withMint(async () => {
    let body = null;
    const fetchImpl = async (_url, opts) => {
      body = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { value: [] } }) };
    };
    const h = createHoldingsTracker({ fetchImpl, now: mkClock().now });
    await h.get();
    const flat = JSON.stringify(body);
    if (body.method !== 'getTokenAccountsByOwner') throw new Error(`method=${body.method}`);
    if (!flat.includes(ONCHAIN.treasuryWalletAddress)) throw new Error('public wallet not in request');
    if (/private|secret|keypair|seed/i.test(flat)) throw new Error(`secret-looking material in request: ${flat}`);
  })],

  ['cache window: immediate second get is served from cache (1 RPC call)', withMint(async () => {
    const clock = mkClock();
    const h = createHoldingsTracker({ fetchImpl: rpcOk(), now: clock.now, minRefetchMs: 5000 });
    await h.get();
    const second = await h.get();
    if (h.rpcCalls() !== 1) throw new Error(`refetched inside window: ${h.rpcCalls()} calls`);
    if (second.balance !== 12.75) throw new Error('cache lost the value');
  })],

  ['after the cache window the server re-reads on-chain', withMint(async () => {
    const clock = mkClock();
    let calls = 0;
    const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: calls, decimals: 6 } } } } } }] } }) }; };
    const h = createHoldingsTracker({ fetchImpl, now: clock.now, minRefetchMs: 5000 });
    const first = await h.get();
    clock.tick(5000);
    const second = await h.get();
    if (calls !== 2) throw new Error(`calls=${calls}`);
    if (first.balance !== 1 || second.balance !== 2) throw new Error(`stale value served: ${first.balance} then ${second.balance}`);
  })],

  ['RPC failure: serves the LAST VALID balance with stale:true', withMint(async () => {
    const clock = mkClock();
    let fail = false;
    const h = createHoldingsTracker({ fetchImpl: async (...a) => (fail ? rpcFail() : rpcOk()(...a)), now: clock.now, minRefetchMs: 5000 });
    await h.get();
    fail = true;
    clock.tick(5000);
    const s = await h.get();
    if (s.balance !== 12.75) throw new Error(`last valid lost: ${s.balance}`);
    if (s.stale !== true) throw new Error('failure not flagged stale');
  })],

  ['recovery: next successful read clears the stale flag with fresh data', withMint(async () => {
    const clock = mkClock();
    let fail = false;
    const h = createHoldingsTracker({ fetchImpl: async (...a) => (fail ? rpcFail() : rpcOk(99, 0)()), now: clock.now, minRefetchMs: 5000 });
    await h.get();
    fail = true;
    clock.tick(5000);
    await h.get();
    fail = false;
    clock.tick(5000);
    const s = await h.get();
    if (s.balance !== 99) throw new Error(`recovery balance=${s.balance}`);
    if (s.stale !== false) throw new Error('stale not cleared after recovery');
  })],

  ['RPC failure with NO prior valid read: null balance, never invented', withMint(async () => {
    const clock = mkClock();
    const h = createHoldingsTracker({ fetchImpl: rpcFail, now: clock.now, minRefetchMs: 5000 });
    const s = await h.get();
    if (s.balance !== null) throw new Error(`invented balance: ${s.balance}`);
    if (s.stale !== true) throw new Error('unavailable read not flagged stale');
    if (s.updatedAt !== null) throw new Error(`updatedAt=${s.updatedAt}`);
  })],

  ['holdings response shape: value-only fields, nothing secret', withMint(async () => {
    const h = createHoldingsTracker({ fetchImpl: rpcOk(), now: mkClock().now });
    const s = await h.get();
    const keys = Object.keys(s).sort();
    const allowed = ['balance', 'configured', 'decimals', 'stale', 'updatedAt', 'wallet'].sort();
    if (JSON.stringify(keys) !== JSON.stringify(allowed)) throw new Error(`unexpected response shape: ${keys}`);
    const flat = JSON.stringify(s);
    if (/private|secret|keypair|seed/i.test(flat)) throw new Error('secret-looking material in response');
  })],

  ['endpoint GET /api/treasury/holdings reads the real RPC (integration)', async () => {
    // local mock RPC on an ephemeral port — the "reliable Solana RPC" stand-in
    let rpcHits = 0;
    const rpc = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        rpcHits++;
        const body = JSON.parse(raw);
        if (body.params?.[0] !== ONCHAIN.treasuryWalletAddress) { res.writeHead(400); res.end('{}'); return; }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 4.5, decimals: 6 } } } } } }] } }));
      });
    });
    await new Promise((r) => rpc.listen(0, '127.0.0.1', r));
    const rpcPort = rpc.address().port;
    const hadMint = process.env.BLOCKVILLE_MINT, hadRpc = process.env.TREASURY_RPC_URL;
    process.env.BLOCKVILLE_MINT = MINT;
    process.env.TREASURY_RPC_URL = `http://127.0.0.1:${rpcPort}`;
    const stop = await startServer();
    try {
      const res = await fetch(`http://localhost:${PORT}/api/treasury/holdings`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.configured !== true) throw new Error('endpoint says unconfigured');
      if (body.balance !== 4.5) throw new Error(`balance=${body.balance}`);
      if (body.wallet !== ONCHAIN.treasuryWalletAddress) throw new Error('public wallet missing');
      if (rpcHits < 1) throw new Error('endpoint never called the RPC');
      if (JSON.stringify(body).match(/private|secret|keypair|seed/i)) throw new Error('secret-looking material in HTTP response');
      const cfg = resolveHoldingsConfig();
      if (cfg.rpcUrl !== `http://127.0.0.1:${rpcPort}`) throw new Error(`TREASURY_RPC_URL not honoured: ${cfg.rpcUrl}`);
    } finally {
      stop();
      rpc.close();
      if (hadMint === undefined) delete process.env.BLOCKVILLE_MINT; else process.env.BLOCKVILLE_MINT = hadMint;
      if (hadRpc === undefined) delete process.env.TREASURY_RPC_URL; else process.env.TREASURY_RPC_URL = hadRpc;
    }
  }],
];

runTests(tests);
