// Chunk T3 — configuration prelude tests: kill switch, keypair gating,
// fail-loud startup guard, and the .gitignore that keeps secrets out of git.
// No real transactions; nothing on-chain runs in these tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from './harness.mjs';
import { ONCHAIN, treasuryLiveState, assertLiveConfig } from '../server/tokenomics.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// env save/restore so the operator's real environment can never leak in
const ENV_KEYS = ['TREASURY_ENABLED', 'TREASURY_KEYPAIR_PATH', 'BLOCKVILLE_MINT', 'TREASURY_RPC_URL'];
const savedEnv = ENV_KEYS.map((k) => [k, process.env[k]]);
const resetEnv = () => {
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

const tests = [
  ['prelude config carries the public treasury address and env names', () => {
    if (ONCHAIN.treasuryWalletAddress !== '7LdsU9GwPgTpK3u8t5LDkGoQtHNSB4JohDTeto6DdBQu') {
      throw new Error(`wrong treasury address: ${ONCHAIN.treasuryWalletAddress}`);
    }
    if (ONCHAIN.enabledEnv !== 'TREASURY_ENABLED' || ONCHAIN.keypairPathEnv !== 'TREASURY_KEYPAIR_PATH' || ONCHAIN.mintEnv !== 'BLOCKVILLE_MINT') {
      throw new Error('env var names drifted');
    }
    if (ONCHAIN.maxKeypairMode !== 0o600) throw new Error('keypair mode requirement drifted');
  }],

  ['kill switch defaults OFF and the system idles', () => {
    resetEnv();
    delete process.env.TREASURY_ENABLED;
    const st = treasuryLiveState();
    if (st.enabled !== false || st.live !== false) throw new Error(`kill switch not default-off: ${JSON.stringify(st)}`);
  }],

  ['live requires enabled + mint + a 0600 (or stricter) keypair file', () => {
    resetEnv();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-prelude-'));
    const kp = path.join(dir, 'treasury-keypair.json');
    fs.writeFileSync(kp, '[]'); // placeholder bytes — never real key material
    fs.chmodSync(kp, 0o600);
    process.env.TREASURY_ENABLED = 'true';
    process.env.BLOCKVILLE_MINT = 'BVmintTEST';
    process.env.TREASURY_KEYPAIR_PATH = kp;
    if (treasuryLiveState().live !== true) throw new Error('live setup rejected');
    fs.chmodSync(kp, 0o644); // too open → must refuse
    const st = treasuryLiveState();
    if (st.live !== false || st.keypair?.ok !== false) throw new Error(`loose keypair accepted: ${JSON.stringify(st.keypair)}`);
    fs.chmodSync(kp, 0o600);
    fs.unlinkSync(kp); // missing file → must refuse
    if (treasuryLiveState().live !== false) throw new Error('missing keypair accepted');
  }],

  ['fail-loud startup: exits when enabled but setup incomplete; never logs key contents', () => {
    resetEnv();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-prelude-'));
    const kp = path.join(dir, 'treasury-keypair.json');
    fs.writeFileSync(kp, 'TOPSECRETKEYBYTES');
    const seen = [];
    const fakeLog = { log: (...a) => seen.push(a.join(' ')), error: (...a) => seen.push(a.join(' ')) };
    // disabled → no exit, idle notice only
    delete process.env.TREASURY_ENABLED;
    const st = assertLiveConfig(fakeLog, { exit: () => { throw new Error('exited while disabled'); } });
    if (st.enabled !== false) throw new Error('wrong state returned');
    // enabled + missing mint → must exit(1)
    process.env.TREASURY_ENABLED = 'true';
    process.env.TREASURY_KEYPAIR_PATH = kp;
    delete process.env.BLOCKVILLE_MINT;
    let exitCode = null;
    try {
      assertLiveConfig(fakeLog, { exit: (code) => { exitCode = code; throw new Error('EXITED'); } });
    } catch (e) {
      if (e.message !== 'EXITED') throw e;
    }
    if (exitCode !== 1) throw new Error(`bad exit code ${exitCode}`);
    // the secret bytes must never appear in any log line
    if (seen.some((line) => line.includes('TOPSECRETKEYBYTES'))) throw new Error('KEY CONTENTS LOGGED');
    if (!seen.some((line) => line.includes('BLOCKVILLE_MINT is not set'))) throw new Error('failure reason not reported');
  }],

  ['.gitignore keeps keypairs, env files and runtime ledgers out of git', () => {
    const gi = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    for (const needle of ['.env', 'treasury-keypair', '*.keypair', 'node_modules/', 'dist/', 'data/', 'casino/', 'bugreports/']) {
      if (!gi.includes(needle)) throw new Error(`.gitignore missing ${needle}`);
    }
  }],
];

// assertLiveConfig(log, { exit }) — accept the injected exit hook
// (server/index.mjs calls it with console only; the hook keeps tests honest).
await runTests(tests);
resetEnv();
