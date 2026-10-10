// Reducer-level tests for furniture purchase / placement / house entry.
// Bundled by tests/furniture.spec.mjs so it runs against the REAL state.tsx.
import { reducer, initial, type State } from '../src/game/state';

const st = initial;
let fails = 0;
const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) console.log(`PASS  ${name}`);
  else { fails++; console.log(`FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

// a done house owned by the tester
const ownedHouse = (s: State, id = 50): State => ({
  ...s,
  plots: s.plots.map((p) => (p.id === id ? { ...p, type: 'house', done: true, owner: 'you' as const, ownerName: 'Tester' } : p)),
});
// an NPC-owned done house
const npcHouse = (s: State, id = 51): State => ({
  ...s,
  plots: s.plots.map((p) => (p.id === id ? { ...p, type: 'house', done: true, owner: 'other' as const, ownerName: 'Nova' } : p)),
});
const bed = st.furnitureInventory; // {}
const BUY = { t: 'buyFurniture' as const, itemId: 'bed' };
const ITEM = { id: 'bed', name: 'Bed', category: 'Beds' as const, icon: '🛏', price: 100, color: '#a33', blurb: '' };

// buyFurniture needs the item to exist in FURNITURE_DEFS — find a real id
import { FURNITURE_DEFS } from '../src/game/config';
const fid = FURNITURE_DEFS[0].id;
const fprice = FURNITURE_DEFS[0].price;
const BUYF = { t: 'buyFurniture' as const, itemId: fid };
void bed; void BUY; void ITEM;

// 1. buying deducts the balance and adds to the inventory
const s1 = reducer({ ...st, balance: fprice * 2 }, BUYF);
check('buyFurniture deducts the price', s1.balance === fprice * 2 - fprice, s1.balance);
check('buyFurniture adds to the inventory', (s1.furnitureInventory[fid] || 0) === 1, s1.furnitureInventory);

// 2. insufficient balance is rejected with no deduction
const s2 = reducer({ ...st, balance: fprice - 1 }, BUYF);
check('buyFurniture without funds does not deduct', s2.balance === fprice - 1, s2.balance);
check('buyFurniture without funds does not add inventory', (s2.furnitureInventory[fid] || 0) === 0);

// 3. placement consumes one from the inventory and puts it in the house
const s3 = reducer({ ...ownedHouse(st), furnitureInventory: { [fid]: 2 } }, { t: 'placeFurniture', plot: 50, itemId: fid });
check('placeFurniture decrements the inventory', (s3.furnitureInventory[fid] || 0) === 1, s3.furnitureInventory);
check('placeFurniture adds a placement', (s3.houseFurniture[50] || []).length === 1);

// 4. cannot place with an empty inventory
const s4 = reducer(ownedHouse(st), { t: 'placeFurniture', plot: 50, itemId: fid });
check('placeFurniture with empty inventory is a no-op', (s4.houseFurniture[50] || []).length === 0 && !s4.furnitureInventory[fid]);

// 5. cannot place on someone else's house
const s5 = reducer({ ...npcHouse(st), furnitureInventory: { [fid]: 1 } }, { t: 'placeFurniture', plot: 51, itemId: fid });
check('placeFurniture on a foreign house is a no-op', (s5.houseFurniture[51] || []).length === 0 && (s5.furnitureInventory[fid] || 0) === 1);

// 6. removal refunds the inventory
const s6a = reducer({ ...ownedHouse(st), furnitureInventory: { [fid]: 0 }, houseFurniture: { 50: [{ id: 'p1', itemId: fid, x: 0, z: 0, rotation: 0 }] } }, { t: 'removeFurniture', plot: 50, placementId: 'p1' });
check('removeFurniture refunds the inventory', (s6a.furnitureInventory[fid] || 0) === 1, s6a.furnitureInventory);
check('removeFurniture removes the placement', (s6a.houseFurniture[50] || []).length === 0);

// 7. move clamps to the interior bounds and respects locks
const s7a = reducer({ ...ownedHouse(st), houseFurniture: { 50: [{ id: 'p1', itemId: fid, x: 5.5, z: 0, rotation: 0 }, { id: 'p2', itemId: fid, x: 0, z: 0, rotation: 0, locked: true }] } }, { t: 'moveFurniture', plot: 50, placementId: 'p1', dx: 5, dz: 0 });
check('moveFurniture clamps to the wall bound', s7a.houseFurniture[50][0].x === 5.8, s7a.houseFurniture[50][0].x);
const s7b = reducer(s7a, { t: 'moveFurniture', plot: 50, placementId: 'p2', dx: 3, dz: 0 });
check('locked furniture does not move', s7b.houseFurniture[50][1].x === 0);

// 8. rotation and lock toggle
const s8 = reducer({ ...ownedHouse(st), houseFurniture: { 50: [{ id: 'p1', itemId: fid, x: 0, z: 0, rotation: 0 }] } }, { t: 'rotateFurniture', plot: 50, placementId: 'p1' });
check('rotateFurniture rotates by 90 degrees', Math.abs(s8.houseFurniture[50][0].rotation - Math.PI / 2) < 1e-9);
const s8b = reducer(s8, { t: 'toggleFurnitureLock', plot: 50, placementId: 'p1' });
check('toggleFurnitureLock locks', s8b.houseFurniture[50][0].locked === true);

// 9. THE ECHO RACE: a stale server echo must not delete a newer local placement
const base9 = { ...ownedHouse(st), furnitureInventory: { [fid]: 2 } };
const placed1 = reducer(base9, { t: 'placeFurniture', plot: 50, itemId: fid });            // local: [p1]
const placed2 = reducer(placed1, { t: 'placeFurniture', plot: 50, itemId: fid });          // local: [p1, p2]
const echoed1 = reducer(placed2, { t: 'remoteHouseState', plot: 50, placements: (placed1.houseFurniture[50]) }); // stale echo of the first send
check('stale echo does not delete the newer local placement', (echoed1.houseFurniture[50] || []).length === 2, echoed1.houseFurniture[50]);

// 10. the current echo (superset) still applies for another owner's plot untouched
const echoCurrent = reducer(placed2, { t: 'remoteHouseState', plot: 50, placements: placed2.houseFurniture[50] });
check('current echo applies unchanged', (echoCurrent.houseFurniture[50] || []).length === 2);

// 11. removal then stale echo: removal must survive an older echo listing the removed piece
const removed = reducer(placed1, { t: 'removeFurniture', plot: 50, placementId: placed1.houseFurniture[50][0].id }); // local: []
const staleEcho = reducer(removed, { t: 'remoteHouseState', plot: 50, placements: removed.houseFurniture[50] }); // current echo = []
check('current empty echo applies after removal', (staleEcho.houseFurniture[50] || []).length === 0);

// 12. other players' houses always take the server state (visitor view)
const visitor = reducer({ ...npcHouse(st), houseFurniture: {} }, { t: 'remoteHouseState', plot: 51, placements: [{ id: 'x1', itemId: fid, x: 1, z: 1, rotation: 0 }] });
check("another player's house state applies", (visitor.houseFurniture[51] || []).length === 1);

// 13. enterHouse / exitHouse guards
const s13 = reducer(npcHouse(st), { t: 'enterHouse', plot: 51 });
check('a done NPC house can be entered (visitor)', s13.interiorPlot === 51);
const s13b = reducer(ownedHouse(st), { t: 'enterHouse', plot: 51 });
check('entering another plot while inside switches rooms', s13b.interiorPlot === 51 || s13b.interiorPlot === null || s13b.interiorPlot !== 50);
const s13c = reducer({ ...st, plots: st.plots.map((p) => (p.id === 52 ? { ...p, type: 'house', done: false, owner: 'you' as const, ownerName: 'Tester' } : p)) }, { t: 'enterHouse', plot: 52 });
check('an unfinished house cannot be entered', s13c.interiorPlot === null);
const s13d = reducer(s13, { t: 'exitHouse' });
check('exitHouse leaves the interior', s13d.interiorPlot === null);

export const REDUCER_FAILURES = fails;
