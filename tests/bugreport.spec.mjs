// Bug-report endpoint tests: real storage, honest rejection, no fake success.
import { startServer } from './harness.mjs';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const ledger = path.join(root, 'bugreports', 'bugreports.jsonl');
rmSync(ledger, { force: true });

const post = async (base, body) => {
  const res = await fetch(`${base}/api/bug-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let failed = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`PASS  ${name}`);
  else { failed++; console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

const stop = await startServer();
const base = `http://localhost:${process.env.PORT}`;
try {
  const ok = await post(base, { text: 'The mailbox prompt does not appear after the cooldown.', player: 'Jacob' });
  check('valid report is accepted', ok.status === 200 && ok.body.ok === true, ok);
  check('valid report is stored (forwarded:false, no webhook configured)', ok.body.stored === true && ok.body.forwarded === false, ok.body);
  const line = JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').pop());
  check('stored report contains the text and player', line.text.includes('mailbox prompt') && line.player === 'Jacob', line);

  const short = await post(base, { text: 'hi' });
  check('too-short report is rejected with 400', short.status === 400, short);

  const empty = await post(base, {});
  check('missing text is rejected with 400', empty.status === 400, empty);

  const sanitized = await post(base, { text: 'line1\nline2\x00bad' });
  check('control characters are sanitised, report still stored', sanitized.status === 200 && sanitized.body.stored === true, sanitized);
  const line2 = JSON.parse(readFileSync(ledger, 'utf8').trim().split('\n').pop());
  check('no raw newlines inside the stored JSONL record', !line2.text.includes('\n') && line2.text.includes('line1 line2'), line2);
} finally {
  stop();
  rmSync(ledger, { force: true });
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS');
if (failed > 0) process.exit(1);
