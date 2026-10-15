// Activity-log tests against the REAL reducer: toast cap, cap survivor
// ordering, and the unread badge path.
import { reducer, initial, type State } from '../src/game/state';

let fails = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`PASS  ${name}`);
  else { fails++; console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

// 70 personal messages — more than the cap
let s: State = initial;
for (let i = 0; i < 70; i++) s = reducer(s, { t: 'toast', text: `message ${i}` });
check('toast list is capped (not unbounded)', s.toasts.length === 60, s.toasts.length);
check('cap keeps the most recent messages', s.toasts[s.toasts.length - 1].text === 'message 69', s.toasts[s.toasts.length - 1]);
check('cap drops the oldest messages', s.toasts[0].text === 'message 10', s.toasts[0]);

// unread badge: a personal message while viewing TOWN raises logUnread
const u1 = reducer({ ...initial, logOpen: true, logTab: 'town' }, { t: 'toast', text: 'new personal event' });
check('toast raises the unread flag while TOWN is open', u1.logUnread === true);
const u2 = reducer({ ...initial, logOpen: true, logTab: 'personal' }, { t: 'toast', text: 'seen live' });
check('no unread flag while PERSONAL is being watched', u2.logUnread === false);
const u3 = reducer(u2, { t: 'setLogTab', tab: 'town' });
check('switching to TOWN clears the unread flag', u3.logUnread === false);
const u4 = reducer({ ...initial, logUnread: true, logTab: 'town' }, { t: 'setLogTab', tab: 'personal' });
check('opening PERSONAL clears the unread flag', u4.logUnread === false);

// town feed stays capped at 8 and newest-first
let f: State = initial;
for (let i = 0; i < 12; i++) f = reducer(f, { t: 'feed', icon: 'i', text: `town event ${i}`, detail: '' });
check('town feed stays capped at 8', f.feed.length === 8, f.feed.length);
check('town feed is newest-first', f.feed[0].text === 'town event 11', f.feed[0]);

console.log(fails === 0 ? 'ALL ACTIVITY LOG TESTS PASS' : `${fails} FAILURES`);
export const REDUCER_FAILURES = fails;
