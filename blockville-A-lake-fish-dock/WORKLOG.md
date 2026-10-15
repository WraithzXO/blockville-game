# Blockville Worklog

## Chunk 1 — Activity Log Rework — COMPLETE (2026-10-07)

Base version: blockville-game-v17-BUILD-POLISH.zip (attached to this conversation).
This checkpoint continues from that version only. No other features were touched.

### What was changed

1. Center-screen disappearing messages removed.
   - The old `Toasts` component (center-screen, auto-expiring after ~3s) was deleted
     from `src/App.tsx` and its render call removed.
   - Center-screen toast CSS was removed from `src/styles.css`.
   - The underlying message-generation sites were NOT removed: all game events
     (rewards, unlocks, purchases, plot events, game events) still push the same
     messages — they now go to the PERSONAL log instead of the screen center.

2. Bottom-left Activity Log added (TOWN / PERSONAL tabs).
   - `src/App.tsx`: old Town-only `Feed` rebuilt as `ActivityLog`, positioned
     bottom-left, existing pixel/game aesthetic, compact so it does not obstruct play.
   - TOWN tab: the existing Town Activity feed, unchanged in behaviour.
   - PERSONAL tab: persistent history of the messages that used to appear as
     center-screen toasts. They no longer disappear.
   - Tabs are independent; switching does not clear or reset either feed.

3. State changes in `src/game/state.tsx`.
   - Added `logOpen`, `logTab`, `logUnread` state with actions.
   - Removed `toastGone` and the toast auto-expiry timer, so personal messages
     persist permanently.
   - `useToastTimer` replaced by `usePersonalUnread`: raises the unread badge when a
     personal message arrives while the user is not viewing the PERSONAL tab;
     clears it when PERSONAL is opened.

4. Five-message collapsed limit.
   - Collapsed: only the 5 most recent messages of the selected tab are shown.
   - Expanded (click): full scrollable history. Display limit only — no messages
     are deleted.
   - Unread indicator: red dot on the PERSONAL tab.

### Files changed
- src/game/state.tsx  (log state, toast expiry removed, unread logic)
- src/App.tsx         (Toasts removed, ActivityLog with tabs/limits/unread)
- src/styles.css      (log styles added, toast CSS removed)
- WORKLOG.md          (this file)

### Verification
- TypeScript: `npx tsc --noEmit` — passed, 0 errors.
- Production build: `npm run build` — passed (40 modules; only a pre-existing
  chunk-size advisory warning).
- Structural checks: TOWN/PERSONAL tabs present; collapsed view slices to 5 most
  recent; unread dot conditional on new personal messages while off the PERSONAL
  tab; zero remaining references to `Toasts` / `toastGone` / `useToastTimer`.

### Known limitations
- The v17 source project contains no `public/` directory (favicon etc. live in
  `index.html` / assets), so this zip has none — nothing was deleted.
- Interactive in-browser testing (clicking tabs, scrolling) was verified by code
  checks and build, not by a human play session — open the game and confirm the
  log feels right visually.
- JS bundle is ~775 kB minified (pre-existing; vite advisory only).
## Chunk 2 — Part B: Plot Ownership Sync (2026-10-07)

- Remote plot-ownership sync completed on top of Checkpoint 1 multiplayer.
- state.tsx: new `remoteClaim` action — server-relayed ownership updates any plot's
  owner/ownerName; if the relayed name is the local player's own name the plot is
  restored as `owner: 'you'` (reconnect keeps your plots interactive).
- net.ts: `onWelcome` now carries a plots snapshot `Array<[plotId, ownerName]>`.
- GameCanvas.tsx: local ownership changes (claim / buyListing — any case that makes
  a plot `owner: 'you'`) are diff-broadcast once each via `sendClaim`; incoming
  claims apply `remoteClaim` and add a Town-feed entry; `onStatus(true)` clears the
  sent-map so reconnects re-announce ownership (covers backend restarts).
- server/index.mjs: `plotOwners` map — first claim wins; conflicting claims are
  corrected back to the accepted owner instead of relayed; welcome messages include
  the ownership snapshot so late joiners see identical labels.
- Verification: `npx tsc --noEmit` — 0 errors. `npm run build` — passed (11.1s,
  pre-existing >500 kB chunk warning only). Live smoke test (2 clients + late
  joiner): claim relay PASS, late-joiner ownership snapshot PASS.
- Known limitations: simulated-resident claims stay local (server authority for the
  NPC sim is out of scope); if a conflicting claim overwrites yours locally, any
  blocks spent on the construction are not refunded; server-side ownership map is
  in-memory (resets if the backend restarts while nobody is connected to re-announce).

## Chunk 3 — Checkpoint 1: Environment / Town Polish — COMPLETE (2026-10-07)

### What was changed
- Added a welcoming spawn commons in `src/game/engine.ts` with a warm plaza,
  pedestrian paths, pavers, and low planters around the existing store entrance.
- Added non-blocking mown-grass meadow accents and stepping stones along the long
  town grid to break up empty strips without changing plot boundaries or movement.
- Added taller low-poly boundary trees outside the plot rows to frame the town edge
  and make the surrounding scenery feel intentional.
- Added two subtle warm point lights around the spawn approach; the existing
  pixel-inspired materials, roads, trees, NPCs, and ambient-life systems remain in use.

### Files changed
- `src/game/engine.ts`
- `WORKLOG.md`

### Verification
- `npx tsc --noEmit` — passed, 0 errors.
- `npm run build` — passed; only the existing Vite chunk-size advisory remains.
- Production preview served the built `index.html` and generated JS/CSS successfully.
- No multiplayer, plot ownership, movement, NPC, or activity-log code was changed.

### Known limitations
- Runtime verification here used a production-preview smoke check and code inspection;
  interactive browser walking and visual comparison still benefit from a local play pass.

## Chunk 3 — Camera/Rendering Checkpoint 1: Camera Framing — COMPLETE (2026-10-07)

### What was changed
- Adjusted the existing third-person camera start offset so the resident is framed
  consistently from the first rendered frame while retaining surrounding town context.
- Raised the follow target slightly to keep the character body and nearby world readable
  during walking without changing movement, orbit, zoom, or collision behavior.
- Kept the existing debug camera-distance controls and responsive renderer sizing intact.

### Files changed
- `src/game/engine.ts`
- `WORKLOG.md`

### Verification
- `npx tsc --noEmit` — passed, 0 errors.
- `npm run build` — passed; only the existing Vite chunk-size advisory remains.
- Production preview served successfully; built bundle contains the camera and resize code.

### Known limitations
- Interactive visual comparison across multiple desktop viewport sizes is reserved for
  Checkpoint 2 and later, as specified by the chunk workflow.

## Chunk 3 — Rendering/Screenshot Checkpoint 3: Capture Stability — COMPLETE (2026-10-07)

### What was changed
- Enabled `preserveDrawingBuffer` on the existing WebGL renderer so browser screenshots
  and capture tools receive the latest rendered game frame instead of a blank/cleared buffer.
- Added a small `captureScreenshot()` helper to the existing development/runtime bridge;
  it captures the current canvas as a PNG data URL without changing gameplay or UI.
- Preserved the existing camera, responsive resize handling, pixel-inspired materials,
  multiplayer, plots, NPCs, and Town/Personal activity log.

### Files changed
- `src/game/engine.ts`
- `src/game/GameCanvas.tsx`
- `WORKLOG.md`

### Verification
- `npx tsc --noEmit` — passed, 0 errors.
- `npm run build` — passed; only the existing Vite chunk-size advisory remains.
- Production preview served successfully.
- Built-bundle smoke check confirmed the screenshot capture symbols and PNG data-URL path.

### Known limitations
- Screenshot capture remains exposed through the existing development/runtime bridge rather
  than adding a new gameplay button or redesigning the HUD.

## Chunk 3 — Checkpoint 4: Final Camera/Rendering Integration — COMPLETE (2026-10-07)

### Final integration review
- Confirmed the initial third-person camera frames the resident with surrounding town context.
- Confirmed walking keeps the camera follow offset stable and updates the orbit controls without
  changing movement, collision, or gameplay systems.
- Confirmed renderer sizing uses both `ResizeObserver` and the window resize fallback, with a
  minimum one-pixel drawing buffer and responsive canvas CSS to avoid zero-size or black views.
- Confirmed screenshot capture remains available through the existing runtime bridge with
  `preserveDrawingBuffer` enabled.
- Confirmed multiplayer remote players, NPCs, plot ownership labels, and the Town/Personal
  activity log remain wired into the same render and UI paths.

### Verification
- `npx tsc --noEmit` — passed, 0 errors.
- `npm run build` — passed; only the existing Vite chunk-size advisory remains.
- Production preview smoke test — passed; HTML and built asset served successfully.
- Built-bundle checks — passed for `ResizeObserver`, screenshot capture, plot-owner labels,
  multiplayer remote-player methods, and activity-log markers.
- Complete project archive integrity — verified after packaging.

### Known limitations
- Automated verification can confirm the runtime wiring and production serving path, but cannot
  replace a human visual pass across every physical desktop resolution. No unrelated gameplay
  systems were changed during this final checkpoint.

## Final UI, Building & Character Design Polish

- Added a clearer building-selection experience with distinct preview treatments, colour accents, readable cost/action hierarchy, and responsive cards while preserving the existing building definitions and claim flow.
- Reorganised the existing Blockville Store into Builder essentials, Resident style, and Town details sections without changing purchase actions or prices.
- Reworked the existing resident customiser labels into grouped, guided sections while preserving all existing look options, unlock checks, and dispatch actions.
- Added responsive polish for building grids, store sections, and customiser labels while preserving the pixel/glass Blockville visual language.
- The supplied Chunk 3 project contains no furniture inventory/catalog or House-variant/owner-visitor editing system; no fabricated parallel systems were introduced.

## Complete Build Extension

- Added explicit HOUSE building type and House-first interaction/state paths.
- Added furniture catalog, inventory, placement/removal/rotation actions, owner-only reducer guards, and visitor read-only entry state.
- Added final validation and build results after implementation.

## Complete Build — House, Interiors & Furniture

- Added `house` as an explicit `BuildingType` with a distinct exterior mesh, roof, windows, porch, entry, and building-picker option.
- Added House-only `E` entry. Non-House buildings continue through their existing interactions and cannot open the House interior.
- Added a playable House interior presentation with walking-compatible modal flow, exit control, owner editing mode, and visitor read-only mode.
- Added a typed furniture catalog covering Beds, Chairs, Tables, Rugs, Paintings, and Decorations with visually distinct designs.
- Added furniture purchasing, quantities, inventory display, placement, rotation, removal, and return-to-inventory logic. Reducer guards require ownership and owned quantity before editing.
- Added server-side House state validation against the authoritative plot owner and WebSocket broadcast plus late-join snapshots.
- Preserved existing multiplayer presence, plot ownership, Town/Personal activity log, NPCs, camera, character customization, and existing economy abstraction. No on-chain transaction is claimed or fabricated.
- Verification: `npx tsc --noEmit` passed; `npm run build` passed; backend `/api/health` smoke test passed; source integration checks confirmed House-only entry, visitor read-only rendering, furniture guards, and `houseState` server validation.

Known limitation: the current project remains intentionally in-memory/demo-side for balances, plot state, and furniture ownership; durable persistence and real wallet signature verification remain future backend work. Browser interaction testing was limited to production preview/server smoke checks in this environment.


## Building, Streets & World Presentation Chunk — Checkpoint 2 COMPLETE

- Expanded the existing road grid with aligned center markings on the east-west and cross streets.
- Fixed street-sign readability by using double-sided sign materials and corrected pole/plate mounting geometry.
- Enlarged the underlying sky and outer-ground geometry to remove finite-world edge artifacts at the camera's supported travel distance; no fog or black masking geometry was added.
- Added restrained low-poly distant hills outside the playable town to provide environmental context from all normal directions.
- Preserved plot bounds, building orientation/upgrades, multiplayer, NPCs, movement, ownership labels, and UI.

Verification: TypeScript and production build passed; production preview served; required source/runtime paths and archive integrity checked. A browser visual pass remains recommended for final art-direction tuning.

## Username, NPC Labels & Street Entity Fix

### Checkpoint 1
- Added and verified the first-run username selection flow and existing multiplayer username propagation/nameplates.

### Checkpoint 2
- Audited both actual NPC spawn paths and retained the existing `NPC` world-space nameplate implementation.
- Hardened NPC labels with explicit render order and disabled frustum culling so labels remain readable and attached while NPCs move.
- Traced the unexplained moving roadside shape to `AmbientLife.makeRoadBird()` rather than hiding it.
- Updated the bird's material with restrained emissive color so it remains a readable low-poly Blockville bird in shadowed street areas.
- Grounded the hopping bird with a small road-safe vertical offset to avoid floating and z-fighting.

### Verification
- `npx tsc --noEmit`: passed.
- `npm run build`: passed.
- Production preview smoke check: passed after startup retry.
- Both NPC spawn paths confirmed to create `NPC` labels.
- Road bird material and grounded movement path confirmed by source/runtime checks.
- No furniture, House interior, staking, arcade, shop, or unrelated systems changed in this chunk.

### Known limitation
- Full two-browser visual multiplayer observation is not available in this environment; existing multiplayer code paths were preserved and no network code was modified.

## Store Expansion Chunk — Checkpoint 1
- Added a physical Furniture Store beside the existing Blockville Store using the current Three.js world/building helpers.
- Added a distinct storefront, signage, windows, entrance, furniture display silhouettes, and collision bounds.
- Added click and proximity `E` interaction that opens the existing Furniture Store panel.
- Preserved existing Blockville Store, plot, multiplayer, NPC, movement, and economy paths.
- Verification: TypeScript passed; production build passed; production preview served; source integration checks passed.
- Known limitation: browser-level visual multiplayer testing is not available in this environment.

## Staking Checkpoint 2 — Accumulation, Claiming & Persistence

- Added a configured staking reward epoch (`CONFIG.stakeReward.intervalMs`, currently 45 seconds) while preserving the existing demo timing model.
- Rewards accrue from the actual staked amount through the shared proportional formula: `stake * 75 / 20,000`.
- Added guarded `accrueStakingReward` and `claimStakingReward` reducer actions. Claiming moves the exact available fractional Blocks into the existing `blocks` balance and clears the available reward, preventing double claims.
- Added a compact Builder reward panel showing stake, available reward, per-epoch reward, and a claim button.
- Added safe `localStorage` hydration/persistence for builder status, balance, stake, Blocks, accrued reward, claimed reward, and reward timestamp.
- Invalid, negative, non-finite, insufficient, and duplicate stake/claim submissions remain rejected by reducer guards.
- Verification: proportional formula cases (including 10,000 → 37.5, 20,000 → 75, 40,000 → 150, 100,000 → 375, and 12,500 → 46.875) passed; TypeScript passed; production build passed; production preview/bundle smoke test passed.
- Known limitation: the current project uses its existing local demo wallet/state architecture and has no staking WebSocket/API operation to extend; no fake server-side transaction or on-chain claim was introduced.

## Arcade Chunk — Checkpoint 1

- Added a physical Arcade interaction through the existing engine callback and proximity/plot interaction paths.
- Added the Blockville Reaction mini-game: five click-target rounds, timing-based score generation, start/replay/result states, and exit back to town.
- Scores are generated from measured reaction timing; there is no editable score input.
- Preserved the existing multiplayer, plots, player identity, NPCs, buildings, stores, staking, Houses, furniture, logs, and economy systems.
- Verification: `npx tsc --noEmit` passed; `npm run build` passed; production preview and built-bundle Arcade smoke checks passed.
- Checkpoint 2 remains: username-based high scores, persistence, and multiplayer relay.

## Arcade Chunk — Checkpoint 2 Complete

- Added username-bound `reaction` high scores using the existing Blockville identity and WebSocket architecture.
- Added personal-best semantics: a lower replay cannot replace a player's higher score.
- Added server-side score validation and ranking (finite integer scores, bounded range, top 10). The server derives the submitted username from the connected player record rather than trusting a client-provided name.
- Added live `arcadeScores` broadcasts for connected players and welcome snapshots for late joiners.
- Added localStorage mirroring so the client leaderboard remains available across normal reloads when the demo backend is not running.
- Added a compact HIGH SCORES panel to the existing Arcade interface and removed a duplicate Arcade panel render.
- Verification: TypeScript passed; production build passed; real WebSocket smoke test passed for score relay, late-join snapshot, and personal-best protection.
- Known limitation: the server leaderboard is in-memory and resets when the demo backend process restarts; no database or fabricated on-chain persistence was introduced.

## Arcade Chunk — Final Verification

- Re-verified the existing Blockville Reaction game and username-bound high-score system.
- Confirmed server-derived identity, personal-best replacement, top-10 ranking, localStorage fallback, live score relay, and late-join snapshots.
- Verification: TypeScript passed; production build passed; live WebSocket smoke test passed for score relay, late-join snapshot, and lower-score rejection.
- Known limitation: the demo server leaderboard remains in-memory and resets when the backend process restarts; no database or fabricated on-chain persistence was introduced.

## Staking Repair — Instant Blocks vs Fee Distribution

- Removed the recurring staking Blocks epoch/timer, accrued-Blocks state, and staking Blocks claim action.
- Staking now awards Blocks exactly once per successful new stake action using:
  `blocksAwarded = newStakeAmount * 75 / 20,000`.
- Initial stake and every later `stakeMore` action use the newly staked amount only; total stake is never re-awarded.
- Removed the former starter-block bonus so the first stake also follows the exact formula.
- Persistence now stores the stake, balance, Builder state, and already-credited Blocks only; reload/reconnect cannot replay a staking reward.
- Preserved Treasury fee distribution as the only recurring staking benefit. Fee payouts continue through the existing `treasuryDistribute` and `npcRewardDirect` paths and are separate from instant Blocks.
- Updated staking UI copy to explain instant Blocks per new stake and recurring fee distribution; removed the duplicate staking Blocks claim button.

### Verification
- TypeScript check: passed.
- Production build: passed; existing Vite chunk-size advisory remains non-blocking.
- Exact formula cases passed: 10,000 -> 37.5; 20,000 -> 75; 40,000 -> 150; 100,000 -> 375; 5,000 -> 18.75; 30,000 -> 112.5.
- Static regression check: no recurring staking timer, accrual action, claim action, starter-block bonus, or legacy replay fields remain.
- Production preview and bundle smoke test: passed.
- Buildings and unrelated gameplay systems were not changed.

### Known limitation
- The project continues to use its existing local demo wallet/state architecture; no fake on-chain staking transaction or server-side blockchain claim was introduced.

## Arcade Repair — Target-Only Reaction Gameplay

- Removed the full-screen arcade playfield click handler that awarded points for empty-space clicks.
- The visible reaction target is now the only scoring hit area; target clicks stop propagation and advance rounds.
- Added a clear 20-second active-game limit and a result state that stops scoring after timeout.
- Timeout results use the same score submission path as completed runs.
- Preserved the existing leaderboard, username, multiplayer, and Arcade interaction architecture.
- Verification: TypeScript passed; production build passed.

## Arcade Repair — Multiplayer Access and Leaderboard Validation

- Added an explicit `arcadeStart` handshake for the existing Reaction game.
- Server now accepts scores only for a declared Reaction run, once per run, within the deterministic five-round score ceiling.
- Server derives leaderboard identity from the joined player record rather than trusting a client-provided username.
- Preserved personal-best and top-10 behavior; leaderboard view is scoped to the Reaction game and shows the local personal best.
- Added late-join snapshot and live broadcast verification.
- TypeScript and production build passed.
- Live two-client smoke test passed: pre-start rejection, valid submission, duplicate rejection, and late-join snapshot.
- Known limitation: the existing demo backend stores scores in memory and the existing local-storage fallback remains the persistence layer; no database was introduced.

## Store and Clothing Repair — Checkpoint 1

- Expanded Town Details with Town Bench, Street Lamp, Planter Box, Mailbox, Builder Statue, and Fence Section items using the existing Store reducer/economy path.
- Set Claim Permit / extra plot purchase to exactly 150,000 $BLOCKVILLE.
- Added Brick Builder Jacket and Sunset Jacket with visible Three.js shirt motifs.
- Added local persistence for unlocked clothing, Town Details inventory, and permit ownership.
- Verification: `npx tsc --noEmit` passed; `npm run build` passed; archive integrity passed.
- Checkpoint 2 persistence/polish remains to be completed.

## Store and Clothing Repair — Checkpoint 2

- Audited and verified persistence for Town Details inventory, clothing unlocks, and Claim Permit ownership through `blockville_store_progress`.
- Confirmed the extra plot price is shared by display and reducer validation at exactly 150,000 $BLOCKVILLE.
- Confirmed useful/cosmetic duplicate purchases are rejected by existing ownership guards before balance changes; insufficient balances are rejected without deductions.
- Confirmed state hydration preserves balance, permit, Town Details inventory, and clothing unlocks across normal reloads.
- Verification: `npx tsc --noEmit` passed; `npm run build` passed; existing Vite chunk-size warning remains non-blocking.
- No unrelated systems were modified.

## Render-Path Repair — Actual World Integration

- Traced the live render path: `src/main.tsx` mounts `App`, `App` mounts `GameCanvas`, `GameCanvas` constructs `Engine`, and `Engine.buildWorld()` creates the visible Three.js scene.
- Confirmed the previous House visual implementation was not a 3D world scene: `App.tsx` rendered a CSS/React `HouseInterior` overlay with positioned div furniture over the canvas.
- Proved the live path with a temporary Furniture Store roof colour test; the change appeared in the running game screenshot, then the test-only change was reverted.
- Replaced the flat House room overlay with an Engine-owned 3D House interior containing floor, walls, ceiling, beams, window, door, lighting, bed frame, mattress, pillow, headboard, sofa, table and rug geometry.
- Reused existing `houseFurniture` placement state and maps existing furniture IDs to real Three.js scene objects.
- Added owner-only wall-paint controls that apply to actual 3D interior wall materials.
- Added an interior scene mode that hides the outdoor scene, positions the player/camera inside the room, and restores the outdoor scene on exit.
- Added compact HUD controls over the 3D room; the room itself is no longer a flat CSS/image room.
- Verification: live dev server started; deliberate render-path test was visible; TypeScript passed; production build passed. Existing Vite chunk-size warning remains non-blocking.
- Known limitation: a full interactive click-through into a House was not automated in this environment; the 3D entry path is wired through the existing `enterHouse` state and `GameCanvas` engine bridge.

## House Repair — Movement, Furniture Controls & HUD Layering

- Traced the regression to `Shell` treating the House interior as a modal and passing `inputEnabled={false}` into the real Engine movement path. House mode now keeps the existing WASD/arrow movement enabled while other modals remain paused.
- Added House-only `E` exit routing through the existing Engine/GameCanvas/state path.
- Added interior room-bound clamping so the resident cannot walk through the 3D room walls or leave except through the exit action.
- Restored owner-only House furniture controls using the existing reducer and inventory: place owned furniture, move it within bounds, rotate it, lock/unlock it, and remove unlocked pieces back to inventory.
- Visitors receive no edit controls and existing reducer ownership guards remain authoritative.
- Preserved locked placement state through the existing House WebSocket sanitizer.
- Reworked HUD zones so the staking rewards panel is top-right, the activity log remains bottom-left, and House controls sit below the top bar in a scrollable panel rather than competing for the same space.

Verification:
- `npx tsc --noEmit` passed.
- `npm run build` passed; only the existing Vite chunk-size warning remains.
- Live Vite preview started successfully and the Name Gate rendered correctly.
- Existing outdoor, multiplayer, plot, NPC, staking, and furniture paths were preserved.

Known limitation: automated browser input cannot complete a full WASD/House click-through in this environment; the repaired paths are verified by the live preview, typecheck/build, and direct source-path inspection.

## Outdoor World Visual Overhaul — Checkpoint 1
- Confirmed live render path: `src/main.tsx` -> `src/App.tsx` -> `src/game/GameCanvas.tsx` -> `Engine.buildWorld()`.
- Made the sky deterministic with a scene background colour and extended far-camera/fog range.
- Removed shadow reception from the far outer ground plane, which could produce direction-dependent black horizon artifacts from the limited shadow frustum.
- Added a second distant hill layer for depth in all directions.
- Verification: TypeScript passed; production build passed; Vite preview served successfully and first-run gate rendered.
- Limitation: automated viewport remained at the existing username gate, so a browser interaction was not available for walking/camera rotation in this environment.

## Outdoor World Chunk — Checkpoint 2: Roads, Signs, Environment
- Preserved the live `main.tsx -> App.tsx -> GameCanvas.tsx -> Engine.buildWorld()` render path.
- Added raised curbs along the existing road grid and compact crosswalks at the main intersections.
- Improved intersection readability without changing collision or plot access.
- Added shallow sign backing geometry so street-sign poles terminate below/behind the sign face rather than visibly intersecting it.
- Added restrained roadside planting pockets with block-style beds and low-poly shrubs at deliberate locations.
- Preserved multiplayer, plots, buildings, House systems, furniture, staking, Arcade, NPCs, and UI.
- Verification: `npx tsc --noEmit` passed; `npm run build` passed; live Vite preview started and rendered the actual app; existing chunk-size warning remains non-blocking.
- Known limitation: automated browser inspection remained at the first-run username gate, so town walking/camera rotation requires manual name entry in the live preview.

## Outdoor World Overhaul — Checkpoint 3: Building Geometry and Upgrade Readability
- Preserved the existing type-specific `buildMesh()` generators and street-facing plot orientation.
- Added a shared architectural finish pass to the actual generated Three.js building groups: foundations/edge trim, front pilasters, level-based canopies/lights, and higher-level accent bands.
- Added plot-footprint constraint logic and applied it to both initial completed buildings and upgraded replacement meshes.
- Upgrade visuals now gain architectural detail rather than relying only on uncontrolled scaling.
- Preserved multiplayer, plots, movement, NPCs, shops, Houses, furniture, staking, Arcade, and UI.
- Verification: `npx tsc --noEmit` passed; `npm run build` passed; live Vite preview started and rendered the current username gate; existing chunk-size warning remains non-blocking.
- Limitation: automated browser interaction could not pass the first-run username gate, so multi-angle walking/upgrade screenshots require a manual run after entering a username.

## World Visual Overhaul — Checkpoint 4 Landmark Stores
- Improved the actual `Engine.makeStore()` landmark with framed display bays, warm entry lights, display glow panels, and a central entry bell.
- Improved the actual `Engine.makeFurnitureStore()` landmark with a striped storefront awning, display shelf/plinth, and additional furniture-themed display geometry.
- Preserved existing store click targets, proximity prompts, collision bounds, shop panels, multiplayer, plots, Houses, furniture, staking, Arcade, NPCs, and UI.
- Verification: TypeScript passed; production build passed; live Vite preview served the actual app and rendered the first-run gate; checkpoint archive integrity verified.
- Known limitation: automated preview remains at the first-run username gate, so an end-to-end in-world camera walk was not automated in this environment.

## World Quality Pass — Phase 1: HUD layout (UI overlap) — checkpoint 1
Root causes found by measuring the rendered DOM (not just CSS):
- `.stake-reward-panel` had **no `position`**, so it rendered statically at the top-left corner, directly on top of the "Blockville / Early" brand panel.
- `.demo-tag` (top:106 right:16) overlapped the staking zone at top-right.
- House controls card grew down the left edge into the bottom-left activity log; staking stayed visible inside Houses.
Fixes (src/styles.css final "HUD layout zones" block, src/App.tsx one guard):
- Zones: top-left brand + demo tag beneath; top-right wallet pills/buttons then staking (top:100px); right rail = House controls (only inside a House); bottom-left activity log; bottom-centre prompts/build HUD, shifted right below 1140px so they never meet the log.
- Staking rewards panel is hidden while inside a House (contextual).
Verification: tsc 0 errors; live game screenshots at 1280x800 and 1024x700, outdoors as Builder and inside a House; automated bounding-box overlap check reports **no overlaps**.
Test-only hooks still present (remove before release): `?autoname=` in state.tsx initial name; DEV-only `window.__bvDispatch`.
Next: Phase 2 buildings (highest visual priority), then upgrades, horizon, roads, vegetation.

## Visual Quality Pass — Phase 2a: buildings (checkpoint 2)
Inspected every building type at levels 1-4 via a dev-only showcase (`window.__bv.showcase(x,z)`, DEV builds only).
Defects found in the rendered scene and fixed:
- Cafe and Bakery gable roofs were inverted (slab rotation sign) and rendered as a broken "V"; slopes corrected so the slabs meet at the ridge.
- Removed `addBuildingFinishDetails` (generic overlay added in an earlier pass). It placed a 5.8-long trim bar along Z in front of every door (the yellow rods lying across entrances) plus fixed-position pilasters/canopies that ignored each building's real shape.
- House rebuilt from scratch with a shared residential kit (`gableBlock`, `framedWindow`, `framedDoor`, `hedge`, `flowerBox`, shared materials):
  stone foundation, corner boards, eave trim, bargeboards, proper gable roof with overhang, panelled door in a trimmed frame with step,
  framed windows with sills/mullions/shutters and flower boxes, side/back windows, chimney.
  Upgrades add architecture instead of scaling: L2 cross-gabled side wing, L3 covered porch + dormer + hedges, L4 full second storey with balcony.
  Footprint stays within ~9.6 x 8.5, inside the plot limit (constrainBuildingToPlot still applies).
Verification: TypeScript 0 errors; rendered showcase inspected for house, cafe, bakery.
Remaining (next turns): shop/bank/arcade/casino/mine still scale with level and need real upgrade stages; bank L1-3 facade weak; lighting/grass/horizon.

## Shop + Bank architecture (focused pass)
- Shop rebuilt: gable roof (ridge along X) with overhangs, framed door, display window on bulkhead with flower box, striped awning, fascia SHOP sign, gable-end windows.
  Upgrades: L2 rear cross-gabled workshop wing + chimney; L3 right side annex with own roof/awning; L4 mirrored left annex + front cross-gable tower with upper window and flag.
- Bank rebuilt: gabled civic block on stone base, quoins, belt course, portico with columns/entablature/BANK fascia, framed double door, tall windows, steps.
  Upgrades: L2 flanking wings + 4 columns; L3 upper windows + copper dome on drum; L4 clock tower with copper cap, rear annex.
- Removed generic pilaster/plinth/pillar decoration from both. gableBlock gained optional roof/ridge materials.
- Verification: tsc 0 errors; production build ok; Shop L1-4 and Bank L1-4 rendered and inspected. constrainBuildingToPlot still clamps footprint (L2+ may be scaled ~3%).
- Test-only hooks (?autoname, __bvDispatch, devShowcase) still present; remove before final zip.

## Visual life pass, step 1 (ground + horizon + light)
- Ground: seeded 512px turf texture (tonal patches, mown stripes, grass flecks, tiny flowers, pebbles) replaces the plain checkerboard.
- Horizon: instanced mountain ring (2 layers) + treeline ring, fogged for depth; fog 170-640, camera far 800.
- Lighting: richer hemisphere/sun colours, sun 1.9.
- Verified: tsc clean, production build passes, rendered screenshots show richer ground. Horizon ring not visually confirmed at a horizon-level angle.
- Not yet done: per-building identity details, road personality, landscaping moments, vegetation rework.

## Building identity pass, step 1 (Arcade)
- Arcade rebuilt: violet walls on dark base band, pixel checker band, stepped crown with marquee sign and bulbs, framed neon door, framed windows with sills.
- Levels: L2 right game-room wing + pennant, L3 left wing with claw-machine window, L4 rear tower with pixel space-invader sign. Plot clamp unchanged.
- Verified: tsc clean, production build passes, showcase render L1-4 inspected.
- Not yet: casino, cafe/bakery detail, mine; roads, landscaping, vegetation.

## Building identity pass, slice 2 (Casino)
- Casino: removed generic pilasters; added stone base course, gold columns with capitals at the portal, mansard crown with gold ridge, burgundy banners with emblems, clipped-hedge planters at the steps.
- Rendered L1-4 and fixed an inverted roof slope after the first render. tsc and build pass.
- Not yet done: House, Shop, Bank, Cafe, Bakery, Mine contextual props/detail.

## Building life pass, slice 1 (Cafe + Bakery)
- Shared helpers: sideWindows (sills + shutters), rearDetail (back door, downpipe, crate), bistroChairs, flowerPot, dormer.
- Cafe: chairs at tables, base band, side windows/shutters, rear door; L2 glass conservatory; L3 third table + dormer; L4 bunting + second dormer.
- Bakery: warmer walls (0xf4c98f) and base; flour sacks, pot, side windows, rear door; L2 bake-house wing + oven chimney; L3 dormer; L4 pots + flag.
- Verified: tsc 0 errors, build passes. Bakery rendered L1-4 (warm, wing/dormer visible). Cafe NOT visually verified: showcase camera sits inside the horizon mountain ring (test spot at 300,300 is outside town) so renders came back blocked.
- Remaining (not started): House, Shop, Bank, Arcade, Casino (dice fix), Mine life passes.

## Building life pass, slice 2 (House, Shop, Bank, Casino fix, Mine)
- New shared props: lampPost, planterBox, mailbox, crateStack, benchSeat, orePile.
- House: mailbox, flower pots, bench. Shop: crates, planter, lamp. Bank: formal lamps, hedge planters, bench. Mine: ore pile, crates, lantern post.
- Casino: dice, pedestal and beacon raised above the roof ridge.
- Verified: tsc 0 errors, build passes. Rendered House, Bank, Casino, Mine. Shop render blank (test camera inside mountain ring), not visually verified.
- Remaining: Arcade props, window-depth pass, Shop visual check.

## World visual pass (trees, planting pockets, labels)
- Rendered the town at gameplay camera and showcase; showcase test spot moved inside the horizon ring so Shop/Cafe/Arcade now render. Horizon mountains/treeline visible, no black sky/void seen.
- Decorative trees rebuilt as three types (round oak, layered pine, tall birch) with shared materials, replacing stacked-box trees.
- Roadside planting pockets moved out of plot interiors into open strips (x=+-6.5).
- "Plot owned by X" labels were clipped; name-tag canvas now widens to fit text.
- ?autoname hook gated to dev builds only.
- Verified: tsc 0 errors, production build passes. Not done: further rework of every building, road redesign, window-depth pass, town-centre density.

## Visual pass A (roads + UI)
- Wave-1 cross streets now have paved sidewalks; asphalt tone adjusted.
- UI: gradient glass panels, gold top rail, button hover/press, styled scrollbars (additive CSS block at end of styles.css).
- Verified: tsc 0 errors, build passes. Not rendered. Buildings already face their roads via plot side rotation.

## Street furniture
- Staggered lamps along both main streets' sidewalks plus 4 benches; tsc/build pass; not rendered.

## Lamp render check
- Rendered street lamps/benches: grounded on sidewalks. Removed old duplicate globe lamps (plaza road). Known: street-sign boards render dark/unreadable; a lamp sits behind one.

## Sign board fix
- Street-name plates were hidden behind their backing slab; plates now sit on both faces. Rendered: readable. tsc + build pass.

## Turn 2 (partial): Casino walls lightened, side/rear/upper windows added. Rendered Bakery, Arcade, Casino, Mine at L1-4 (front/3-4 view); only Casino changed. Not done: Blockville Store, Furniture Store review; rear views; plot-fit and facing checks.

## Turn 2b: Furniture Store given gabled roof (sign kept readable in front of gable), framed door, side windows, rear door/window. Blockville Store unchanged (flat landmark roof, reads well). Rear of Furniture Store not rendered. Plot-fit clamp / facing checks still not done.

## Turn 3a: flowering (4th) tree type added; distant windmill on a mound outside the fence at (112,118).

## Road intersection and z-fighting fix
- Cross-street connectors now span only the gap between the two main roads (no stubs into grass).
- Sidewalks and curbs are split at intersections instead of cutting across roads.
- Lane dashes skip intersections; flat road layers use polygon offset so grass cannot bleed through the asphalt.
- Verified by rendering two intersection views; tsc and build pass.

## Casino hip-roof pass
Casino: hipped slate crown with gold eave band and finial, portal pediment, hipped wing roof. Arcade and Mine NOT yet redone from reference. tsc + build pass.

## Casino dice/pediment fix
Dice, pedestal and beacon lowered onto the hipped crown; pediment raised above the marquee. Not re-rendered after final dice nudge.

## Arcade rebuild (reference pass)
- Hip roofs on main hall and wings, striped entrance canopy on posts, machine silhouettes in windows, posters, side windows, rear service door, bench.
- tsc and production build pass. Rendered L1-L4 front/3-4 view; rear not rendered; plot-fit not measured.

## Arcade 2x detail pass + Mine rebuild
- Arcade: corner posts with caps, eave fascia + downpipes, pinstripes, ticket kiosk, OPEN sign, two-sided GAMES blade sign, bulb string, side pixel murals, roof vents/antenna/star, doormat, glowing planters, cabinet joysticks/buttons, bin.
- Mine rebuilt: rock-faced stacked cliff, stone-surround timber tunnel with braces, MINE sign on posts, lanterns, ore veins, headframe+wheel, plank tool shed with ribbed metal roof, sleepers/rails/cart, dirt apron, fence+DANGER sign, barrel, pickaxe. L2 ore bin + 2nd cart; L3 loading platform/ramp, taller headframe, crystal; L4 conveyor, engine house with smoke stack, flag.
- Verified: tsc 0 errors, vite build OK, rendered L1-4 of both (front/3-4 view). Not checked: rears, plot-fit measurement.

## Final pass: grass, streets, Arcade, Mine, plot markers
- Grass: softer mown stripes, dirt/clover patches, more flecks; ground plane now segmented with low-frequency vertex-colour drift so big lawns stop tiling.
- Streets: solid road-edge lines broken at junctions; six manhole covers (layered with polygon offset).
- Arcade: gold token sign on a bracket at the left front corner (mirrors GAMES blade).
- Mine: headframe legs thickened (0.32 -> 0.48) with stone footings.
- Plot markers: warm sand fill (0.18) and gold border (0.9) instead of pale white.
- Verified: tsc clean, vite build passes, rendered street and showcase views. Rear views and plot-clamp footprints still unmeasured.

## Recovery merge + facing fix
- The latest saved zip (final-pass) had lost the reference-based House/Shop/Cafe/Bank/Bakery rebuilds. Ported them back from blockville-overhaul-cp1c.zip (buildHouse, buildShopV3, buildBankV3, buildCafeV3, buildBakeryV3 and helpers) while keeping the newer Arcade, Casino, Mine, grass, road-edge and plot-marker work.
- Facing bug: the eight southern plot rows (z=42..154) had north/south swapped, so buildings faced away from the nearest road. Swapped in config.ts GRID_ROWS (each row now faces its nearest E-W street).
- Civic lamps restored on the main streets. Dev-only devView hook restored.
- Verified: tsc 0 errors; rendered House L1-ish, Shop and a southern row (shop at z=58 faces the z=66 road). Not verified: Blockville Store/Furniture Store detail, rear views, plot-fit measurement, production build result below.

## Landmark + Cafe/Bank pass
- Cafe L2+ conservatory rebuilt as a glazed lean-to: brick knee wall, tinted panes, cream mullions, trim rail, warm inner glow. Rendered (L4 view).
- Bank walls warmed to sandstone (0xf0d8a8). Rendered front and L4; quoin blocks still stick out slightly at the corners.
- Furniture Store rear: framed service door with step and lamp, window, gable vent (rendered; reads finished).
- Blockville Store rear and sides: service door with frame/step/lamp, two rear windows, four side windows, crates. Fresh materials only, so the store fade does not touch other buildings. Rendered rear and side.
- Dev-only __bv.devView hook added for screenshots (gated by import.meta.env.DEV).
- Verified: tsc 0 errors, vite build passes. Not verified: plot-fit measurements, rear of Bank/Bakery/Arcade/Mine/Cafe L1, facing of every southern row (config-only check).

## Plot-fit audit + Casino scaling fix
- Measured every building type/level footprint against the plot clamp (10.6 x 11.6) via a dev-only devMeasure hook. All stay inside; the clamp is a hard guarantee.
- Casino used pure scaling (s = 1 + 0.18*(L-1)); L3/L4 were shrunk to 0.75/0.67 by the clamp, so upgrades looked smaller than L2. Now fixed footprint (s 1.0 -> 1.04); levels add architecture: L2 wing, L3 tower, L4 gold flagpoles with burgundy standards. Casino now fits at 0.96-1.00.
- Other buildings clamp-shrink at most 8% (Shop L4 0.92, Bank 0.97, Cafe L4 0.96, Arcade L3-4 0.97).
- Rendered Casino levels (oblique): flagpoles grounded, no clipping. Not re-checked: rear views of Bank/Bakery/Arcade/Mine, Bank corner blocks.
- Verified: tsc 0 errors, vite build passes.

## Final wrap-up
- Bank corner quoins now sit flush with the wall edge (alternating widths) instead of overhanging.
- Typecheck 0 errors, production build passes.
- Open (unverified): rear views of Bank/Bakery/Arcade/Mine, Casino pediment visibility, every southern row rendered in game, fine-detail pass on House/Shop/Cafe.

## World expansion + house first-person + HUD cleanup (2026-10-07)
- Expanded the plot grid: 11 columns at 15-unit spacing x 9 rows at 18-unit
  spacing (111 plots total, +11). Roads moved to z = 36/72/108/144/180 to keep
  a one-unit gap between every plot marker and the road; fence and walkable
  bounds pushed out to match (fence x +-93, maxZ 202).
- Buildings now sit back into their plots via placeOnPlot(): local-space bbox
  front margin 4.0 keeps every frontage clear of the sidewalk. This fixes the
  Mine hanging halfway onto the road. Also fixed a placement bug where the
  world-space bbox shifted the Casino/Mine to the town centre, and a pop-in
  bug that reset the plot-fit clamp scale to 1 after the build animation.
- Plot markers enlarged to 10x10 (click plane 9x9); removed fake mid-road
  crosswalks; boundary trees and mailboxes moved outside the new grid.
- House interior is now FIRST PERSON: camera at head height, mouse-drag looks
  around (yaw + pitch), player mesh hidden, OrbitControls disabled inside and
  restored on exit. Fixed the black room: interior now carries its own lights
  (ambient + directional + warm point) and the shell is double-sided so walls
  render from inside. NPC visitor spawning pauses while inside.
- Removed the Staking Rewards box entirely (builders now have no dedicated
  reward panel); its styles removed.
- Verified: tsc clean, production build clean (pre-existing chunk warning
  only), rendered checks of the casino/mine plots, town-wide aerial, and a
  scripted first-person enter/walk/look/exit pass. Known limits: interior
  furniture is visitor-mode default; the interior view at entry faces the
  window wall (bright but correct); sim residents can still claim plots
  locally (no server authority).

## BUILDING DESIGN OVERHAUL — CHECKPOINT 1: AUDIT + ARCHITECTURE SYSTEM (2026-10-08)

No gameplay or geometry code was changed in this checkpoint. This checkpoint is the
inspection + design-foundation step of the reference-image-driven building overhaul.
What WAS done:

### New dev-only verification harness (gated to import.meta.env.DEV, zero production impact)
- /home/user/work/audit_shots.mjs: Playwright-driven capture that hides all HUD,
  reads __bv.plots()/plotInfo(), and orbit-captures every landmark building from
  three-quarter / side / rear angles plus a full-town overview.
- Headless capture flags fixed: --use-angle=swiftshader +
  --run-all-compositor-stages-before-draw (previous blank-sky-blue captures were
  frames taken before the first WebGL render; verified 132-color render after fix).
- NOTE: devView angle convention — camera sits at (x+sin(a)*d, e, z+cos(a)*d).
  For plots whose street is at LOWER z, angle PI is the STREET/FRONT side, so the
  shot file named "-rear" actually shows the street facade. Accounts taken below.

### AUDIT (all shots inspected visually, contact sheets of 25 renders)
Landmark plots: Shop(17,z45) Casino(28,z63) Cafe(39,z81) Mine(50,z99)
Arcade(61,z117) Bakery(72,z135) Bank(83,z153) Park(94,z171).

- MINE — SUBSTANTIAL rebuild. Weakest building. Rock mounds are smooth rounded
  brown boxes (read as lumps of clay, not rock); rear/side views are near-featureless
  brown masses; shed + rails are OK but disconnected. Needs faceted rock geometry,
  timber headframe, integrated cart run, grounded props.
- ARCADE — SUBSTANTIAL rebuild. Street front (marquee + awning + cabinets) is the
  strongest single facade in town, but the rest of the building is a bare saturated
  purple flat-roof box: blank sides, thin parapet, no massing, purple fights the
  whole town palette. Keep the front idea; rebuild mass + roof + palette around it.
- SHOP — PARTIAL. Teal cottage + orange roof; striped awning + SHOP sign front is
  fine, but the building reads as a house with a sign, not a shop. Sides/rears are
  plain teal with one window. Needs retail identity (tall storefront glazing,
  awning over display windows, service door at rear) + palette shift off teal/orange.
- CAFE — PARTIAL. Charming (peach walls, shutters, umbrella terrace) but again
  house-like; cafe cues are small. Needs bigger street-facing glazing, proper
  awning, refined terrace, coherent roof tile language.
- BAKERY — PARTIAL. Orange-roof cottage + striped awning + chimney smoke. Same
  diagnosis as Cafe: identity lives in one facade; sides/rear are generic cottage.
- CASINO — PARTIAL (best massing of the set). Two-story maroon + gold cornice +
  marquee + carpet reads as its purpose. Problems: dice + lamp float ON the roof
  planes (ungrounded props), rear walls flat, roof mass is a dark slab. Fix props,
  add rear relief, tile the roof into the language.
- BANK — LIGHT. Portico + pediment + hedges is genuinely good; warm sandstone
  quoins work. Only needs roof-tile language + minor side massing. Keep.
- PARK — LIGHT. Reads fine as green space; align props/furniture with new language.
- HOUSE (player-built) + Blockville Store + Furniture Store — NOT yet audited at
  orbit angles (houses are built on claimed plots; spawn stores need their own
  capture pass). Scheduled for checkpoint 2 alongside first rebuilds.
- World/labels noted during audit: "Plot owned by Town Council" name tags float
  over EMPTY demo plots across town, contributing to the sparse feel (labels are
  correct per design, but visual noise + emptiness should be handled in a later
  checkpoint of this overhaul, not silently).

### BLOCKVILLE ARCHITECTURE SYSTEM v1 (extracted from the reference image)
1. PALETTE FAMILIES (coherence rule): walls — cream, sand, warm white, muted
   sage, dusty blue, soft terracotta render. Roofs — terracotta clay tile
   (default), warm brown, muted slate; muted green reserved for institutional
   (Bank). Accents — warm wood brown (shutters, brackets, balconies, doors).
   One accent color per building for signs/awnings. No saturated purple/teal
   primary walls.
2. ROOFS: always read as tiled with visible eaves overhang; never bare thin
   slabs. Secondary volumes get their own lower roof. Chimneys grounded through
   the roof plane, never floating.
3. MASSING: every building = primary volume + at least one secondary element
   (annex, porch, tower, awning volume). No bare boxes; flat roofs get parapets
   plus rooftop elements that belong to the theme.
4. ENTRANCES: framed entrance on the street side — steps + door surround + sign
   or awning above. One entrance per building reads as THE entrance.
5. WINDOWS: grouped and aligned, not scattered singles; traditional buildings
   get arched or shuttered tops; retail gets tall street-level glazing.
6. PROPORTIONS: ground floor taller than upper floors; eaves project; roof mass
   roughly 1/3 of building height on gable buildings.
7. PROPS: 2–4 per building, theme-relevant, all grounded on ground or roof
   planes with contact. Nothing floats.
8. LEVELS 1–4: level up = add a massing element (annex, upper floor, dormer,
   tower) or upgrade materials/details — never uniform scale-up.
9. PLOT DISCIPLINE: everything inside plot bounds, entrance facing the street,
   labels above the entrance zone.

### REBUILD ORDER (next checkpoints)
Checkpoint 2: MINE substantial rebuild (system applied, before/after renders).
Checkpoint 3: ARCADE substantial rebuild. Checkpoint 4: SHOP + CAFE + BAKERY
retail-identity pass. Checkpoint 5: CASINO prop/mass repair + BANK roof language
+ House/store landmark audit. Final: full-town coherence render sweep.

### Verification this checkpoint
- 25 headless renders captured and visually inspected (contact sheets).
- No code changes beyond dev-only audit harness (lives outside the project, in
  the work directory; the project itself is untouched).
- TypeScript check + build not required (no project source changed) but the
  project compiles as of the previous checkpoint's verified state.

## ENGINE REFACTOR — CHECKPOINT 1: BUILDING SYSTEM EXTRACTED (2026-10-08)

Pure code-architecture refactor. No visual, gameplay, economy, terrain, NPC,
world-layout or multiplayer changes. Buildings must look identical before/after.

### What changed
- `src/game/engine.ts` reduced from 5,963 to 3,477 lines. It now keeps:
  character look system, NPC constants, name tags, the Engine class
  (orchestration, world loop, house interior, stores, multiplayer sync).
- New module `src/buildings/`:
  - `BuildingMaterials.ts` — primitives shared by buildings AND the Engine
    (mat, box, rbox, signTexture, sign, windowBox, cornice, pilasters,
    plinth, stripedAwning). Engine imports them; one source of truth.
  - `BuildingParts.ts` — reusable kit (props, roofs, windows, doors, awning
    volumes, shared material sets hv2/sv3/comMats/houseMats).
  - One file per building: `House.ts`, `Shop.ts` (buildShopV3), `Bank.ts`
    (buildBankV3), `Cafe.ts` (buildCafeV3), `Bakery.ts` (buildBakeryV3),
    `Arcade.ts`, `Casino.ts`, `Mine.ts`, `Park.ts`.
  - `BuildingFactory.ts` — `buildMesh()` dispatch, `constrainBuildingToPlot()`,
    `placeOnPlot()`, `FRONT_MARGIN`. Engine call sites unchanged (thin import).
- Dependency direction: Engine → Buildings → (THREE, config). No cycles.
- Removed as clearly obsolete: the four dead V1 builders `buildShop`,
  `buildBank`, `buildCafe`, `buildBakery` and their exclusive mass helpers
  (shopMass, bankMass) — unreferenced, superseded by the V3 designs.
- Public API unchanged: Engine methods used by GameCanvas/App/state/net are
  untouched; `buildMesh`/`placeOnPlot`/`constrainBuildingToPlot` keep their
  names via imports from BuildingFactory.

### Validation
- TypeScript (`tsc --noEmit`): PASS.
- Production build (`npm run build`): PASS (only the pre-existing ~900 kB
  chunk-size warning, present before the refactor).
- Rendered verification (dev server + headless Chrome, dev camera params):
  all nine building types confirmed rendering correctly with no missing
  materials/geometry: House, Shop (teal stucco, chimney, arched display
  window), Casino (marquee, pediment visible above it, dice grounded),
  Mine (strata cliff, shed, ore, headframe), Arcade (marquee, cabinets,
  canopy), Bakery (gable + sign), Bank (sandstone + green roof), Park
  (pond, trees, benches), Cafe (coral walls, terrace umbrella). Player
  character, HUD, interaction prompts (E Kick), roads, lamps and trees all
  render. No runtime-error artifacts observed in any frame.

### Known limitation (recorded, not a regression)
- Automated house-claim validation via the demo seed is limited: the seeded
  "you" plots consume the full claim allowance (claimed=4, allowance=4), so a
  scripted claim of an additional plot is rejected by the allowance check.
  This is a property of the demo/test seed setup, not of the building
  extraction. The house exterior path was verified visually instead; the
  house interior system was not touched by this refactor (it remains in
  Engine.setInterior).
- Note: the temporary validation harness used during extraction was never
  committed into the project; the shipped project contains no harness code,
  so no cleanup was required this session.

### Not done (next checkpoints per spec)
- Checkpoint 2 (world/environment extraction) NOT started, per instruction.

## Engine Refactor — Checkpoint 2: World/Environment Extraction — COMPLETE (2026-10-08)

Base version: blockville-engine-refactor-checkpoint1.zip (Checkpoint 1, building
extraction). Pure structural refactor: no visual, gameplay, terrain, NPC, walking,
tree, hill, mountain or world-layout changes were made or intended.

### What was changed

1. New module folder `src/world/`, all code moved VERBATIM from
   `Engine.buildWorld()` (mechanical extraction; `this.scene` → local `scene`):
   - `WorldSky.ts` — `buildSkyAndLights(scene)` → hemisphere + sun lights,
     gradient sky dome, sun disc, drifting clouds. Returns the cloud groups
     (Engine keeps animating them via its existing `clouds` field).
   - `WorldGround.ts` — `buildGround(scene)` → seeded turf texture, town ground,
     darker outer plain, spawn plaza/walks/pavers/planters, mown meadow bands,
     stepping stones.
   - `WorldRoads.ts` — `buildRoads(scene)` → asphalt grid, sidewalks, civic
     lamps + benches, lane dashes, road-edge lines, manholes, vertical dashes,
     curbs, crosswalks (with the local `layer` polygon-offset and `gapRuns`
     helpers).
   - `WorldFence.ts` — `buildFence(scene)` → fence posts/rails from CONFIG.fence,
     east/west gate arches with the WELCOME TO BLOCKVILLE boards.
   - `WorldTrees.ts` — `buildTownTrees(scene)` (oak/pine/birch/blossom trees) and
     `buildBoundaryTrees(scene)` (tall edge trees incl. the boundary-tree data
     array). Both return the leaf objects so the Engine's `treeLeaves` (wind sway
     + bird perches) is filled exactly as before.
   - `WorldBeyond.ts` — `buildWindmill`, `buildHills`, `buildHorizonRing`
     (instanced mountains + treeline), `buildWelcomeGlows` (spawn point lights),
     `buildFlowerbeds` (flower clumps + bushes; returns the groups so the
     Engine's `flowerGroups` and AmbientLife wiring is unchanged).
2. `Engine.buildWorld()` reduced to orchestration: the module calls in the
   original order, then the unchanged store/click-plane, town-objects, store
   interior, AmbientLife, plot-marker and spawn-player code.
3. engine.ts: 3,477 → 2,955 lines; world code now 604 lines in six focused
   modules. Removed the three imports engine no longer uses (`signTexture`,
   `benchSeat`, `civicLamp` — they live in the world/road modules now).
4. Dependency direction: Engine → World → Buildings → (THREE, config). No cycles.

### Validation
- TypeScript (`tsc --noEmit`): PASS.
- Production build (`npm run build`): PASS (only the pre-existing ~900 kB
  chunk-size warning, present before the refactor).
- Rendered verification (dev server + playwright, dev camera hook):
  aerial, street-level and west-edge views all render identically to the
  pre-refactor state — textured grass, full road stack (asphalt/sidewalks/
  curbs/crosswalks/lane dashes/edge lines/manholes), town + boundary trees,
  blossom trees, windmill, hills, horizon mountain ring, fence with WELCOME
  gate arch, lamps, benches, both landmark stores, all visible buildings,
  fountain, NPCs and the player. No page errors (only the expected backend
  WebSocket-refused in the test environment, which does not run the server).
- Note: an earlier screenshot batch was blank because the dev server had
  bound to a different port than the harness requested (stale process on the
  port); killed the stale process, restarted with --strictPort, re-captured.

### Known limitation (recorded, not a regression)
- Same as Checkpoint 1: the demo seed consumes the full claim allowance, so the
  scripted house-claim validation is limited; visual verification used instead.
  No gameplay/claiming logic was touched in this checkpoint.

## Engine refactor — Checkpoint 3: character/avatar extraction (2026-10-08)
- New `src/players/` folder with code moved VERBATIM out of `engine.ts`:
  - `CharacterTextures.ts` — faceTexture, shirtTexture (canvas-drawn faces + shirt designs)
  - `CharacterAccessories.ts` — hatMesh, glassesMesh
  - `CharacterBuilder.ts` — NPC_* random-pool constants + makeCharacterMesh (shared by player, NPCs, remote players and the customise preview)
  - `NameTag.ts` — makeNameTag (measured-width floating name tags)
- `engine.ts` is now 2,350 lines (was 2,955). `CharacterPreview.tsx` now imports makeCharacterMesh from the new module instead of engine. Dependency direction: Engine → Players; no cycles.
- Verification: `tsc --noEmit` PASS; production build PASS (pre-existing chunk-size warning only). Headless renders (plaza / aerial / street): player character, NPC meshes, name tags, plot-owner tags, Arcade, Bakery, House, roads, blossom trees, windmill and mountains all render unchanged. Console errors were only the offline harness's missing backend WebSocket + favicon 404.
- Unchanged: gameplay, claiming, staking, NPCs, terrain, layout, visuals.

## Engine refactor — Checkpoint 4: stores + house interior extraction (2026-10-08)
- New `src/stores/StoreLandmarks.ts` (286 lines): `makeStore`, `makeFurnitureStore`, `buildStoreInterior` moved verbatim out of Engine. Engine supplies a context object (storeFadeMats, colliders, worldObjs, makeNpcMesh callback, shopkeeper setter, scene) so no production logic changed.
- New `src/houses/HouseInterior.ts` (72 lines): `rebuildHouseInterior` (room shell + starter furniture + placed furniture) and `makeInteriorFurniture` moved verbatim. Engine keeps all mode/camera/visibility logic and calls the builder with (group, paint, placements).
- `engine.ts` down from 2,350 to 2,026 lines. Dependency direction Engine -> Stores/Houses -> Buildings; no cycles. Store builder imports pruned to what Engine still uses (mat, box, rbox, sign).
- One type fix during extraction: buildStoreInterior was a void method in Engine; wrapper declared a return type and TS flagged it — corrected to void. No logic change.
- Verified: `tsc --noEmit` PASS; `npm run build` PASS (pre-existing chunk-size warning only). Rendered checks: aerial overview (full town), store interior entered via teleport (shell faded, counter/shelves/shopkeeper visible, insideStore() true), house interior entered through the real reducer path (stake -> claim -> buildClick x48 -> placeFurniture + paintHouse -> enterHouse; drag-look shows painted walls, floor, ceiling beam, cross window, bed, sofa, rug). Note: entering the house leaves the camera facing whatever direction the avatar faced at entry — a pre-existing first-person quirk, not a regression; drag-look turns freely.
- Checkpoint 1 limitation still stands (offline harness seeds no demo plots; house exercised by driving the normal reducer instead).

## Refactor — Checkpoint 5: cleanup & audit pass (2026-10-08)
Structural cleanup only; no architecture, gameplay or visual changes.
- Files removed: none (no dead files found; `vite-env.d.ts` is required TS env config).
- Dead code removed: `BuildingParts.comMats()` + `COM_MATS` cache (declared, never used anywhere); dead `Engine.npcTarget` field (written in `sync()`, never read — parameter kept as `_npcTarget` to preserve the public `sync` signature).
- Unused imports removed: 283 import names across 14 files (Arcade/Bakery/Bank/Cafe/Casino/House/Mine/Shop ~31-36 each, Park 8, BuildingParts 8, state.tsx 2, worldLife 1, engine.ts 6 incl. RoundedBoxGeometry + 4 config types). `makeInteriorFurniture` de-exported (internal-only).
- App.tsx: `submitted` useState binding removed, `setSubmitted` kept (used).
- Verification: import graph = no dead files; DFS cycle check = NO CYCLES; `tsc --noEmit` PASS; strict `--noUnusedLocals --noUnusedParameters` = 0 findings; production build PASS (pre-existing chunk-size warning only).
- Render smoke test: town renders fully (both landmark stores, player, HUD, roads, props, fence, trees) with zero page errors. House-interior re-render NOT captured this pass (dev dispatch hook didn't fire in harness); HouseInterior.ts changed only by de-exporting an internal function, and was render-verified in Checkpoint 4.
- Deliberately left untouched: `dist/` build artifact (excluded from checkpoint zips by pattern); dev-only `?autoname=` hook (verified DEV-gated, stripped from production); all comment blocks describing current architecture.
- Final `engine.ts`: 2,019 lines (from 5,963 pre-refactor).

## Lighting / shading polish pass
- Warm key sun (2.35) + cool/warm hemisphere fill (0.78); shadow map 2048, frustum recentred on the town (z -34..202), bias/normalBias tuned.
- Contact-shadow decals under trees and windmill; fence posts and boundary trunks cast shadows.
- Sky gradient, fog (0xd3e7f2, 150-560) and background matched; mountains/hills paler with distance.
- South hill and its far companion pushed clear of the fence (8 unit gap); the only fence intersections found.
- No new dependencies.

## Final QA pass (yard + camera)
- PlotLayout: yard bounds corrected (features now stay on the lawn, not the sidewalk), building keep-out matches the real mesh offset, fence leaves the gate gap, mailbox/lamp/planter/bench/statue use side yards. All 8 kinds (garden, statue, 2 fences, bench, lamp, planter, mailbox) place on one plot without overlap.
- House camera: eye height 1.85 -> 2.0; interior FOV 52.8 (48 x 1.1).
- Hill vegetation already present in WorldNature (hillside cover); verified visually, unchanged.

## Final polish pass (checkpoints 1-9, from blockville-final-qa.zip)
1. Activity log ~15% smaller (width 280->238, type/padding scaled); removed a duplicated .feed-item CSS block.
2. Clouds: faceted flat-shaded puff clusters (icosahedron) replace the box clouds.
3. Flowers: lollipop clumps along the main street removed; 16 small tufts only on open meadow between outer plots and the fence.
4. Yard fence: one Yard Fence now builds a white-picket ring with brown posts inside the plot (+/-4.6), open front gate, stops at the building footprint.
5. NPCs: look-ahead steering around props, stuck-recovery sidestep, light separation between walkers.
6. Placement: removed sphere shrubs on the main-street sidewalk edge and the two spawn planters straddling plot corners.
7. Furniture UI: added Up/Down (Left/Right/Rotate/Lock/Remove already dispatched); all verified against state and rendered mesh.
8. Density: ~5% of outskirts trees and one peak per mountain range removed.
9. Hills use the town lawn texture, texel density and tonal drift.

## Chunk 1 — Multiplayer sync + NPC ownership (2026-10-10) — VERIFIED
- Server is now the authority for plot records: owner + building type + progress + done.
- claim carries building type; build relays validated construction progress; first-claim-wins kept.
- NPC market sim moved server-side: identical claims/listings/sales for every client (no more per-client divergence).
- Listings live on the server (starter listings seeded to match clients); sale transfers require the owner's listing; seller is paid via relay.
- Conflicting claims: loser is corrected and the client refunds the spent blocks.
- Tests: tests/protocol.spec.mjs (11) + tests/market.spec.mjs (4), 5 consecutive green runs, tsc clean, vite build clean.

## Chunk 2 — Negative block balance guard (2026-10-10) — VERIFIED
- Root cause: buildClick stepped 1 block even with 0 balance (no toolkit), so the
  balance went negative; claim itself was already guarded.
- Fix: build step is now clamped to the floor of the balance (state.tsx), so
  repeated clicks bottom out at exactly 0; fractional balances below 1 do nothing.
- Fix: claim-conflict refund now returns the claim cost PLUS blocks spent on
  progress (1 block per progress unit), instead of the claim cost only.
- Exported the reducer for tests; new tests/blocks.spec.mjs (6 cases) exercises
  the real reducer via an esbuild bundle: 0-block clicks, fractional balance,
  drain-to-zero, toolkit clamp, duplicate claim, exact conflict refund.
- Harness fix: waitFor now honours its per-call window (was silently ignored);
  NPC-buy waits widened to 20s because the NPC buys one RANDOM listing per tick,
  so the 3s window flaked ~50% when competing listings existed.
- Verified: 5 consecutive full-suite green runs (21 tests), tsc clean, build clean,
  no zombie servers.

## Chunk 3 — Plot/building placement boundaries (2026-10-10) — VERIFIED
- Root cause: placeOnPlot constrained only the FRONT of a building; nothing
  bounded the back or sides. South-row plots (z=10, z=26, z=135 rows) sit 9
  units from the street behind them, so deep buildings spilled onto the rear
  sidewalk and asphalt; back-row frontages sat on the z=22.2 sidewalk; edge
  plots at x=±26 clipped the cross streets.
- Fix: single source of truth for paved geometry in config.ts (SOUTH_ROADS,
  PAVED_Z_BANDS, CROSS_STREETS); WorldRoads and the engine's marker clipping
  now draw from it (identical values).
- Fix: plotRoom(def) derives per-plot front/back/width room from those bands;
  fitToPlot uniformly pre-scales oversized footprints; placeOnPlot shifts to
  satisfy front-yard + back clearance and centers only when a street edge
  would be crossed. Rows far from pavement keep the historic margins exactly.
- Fix: construction sites (slab, poles, beams, crane, sign) and the ghost
  preview clamp into the same buildable band.
- New tests/placement-audit.ts + placement.spec.mjs: measures every building
  type/level on every plot against the real road/sidewalk rectangles emitted
  by buildRoads (headless three.js). Before: 72+ violations; after: 0 across
  9,036 placements.
- Test flake fixed: market.spec sim-claim waits widened to 20s (NPC does one
  random action per tick); npm test now runs protocol + market + blocks +
  placement.
- Verified: 5 consecutive full-suite green runs, tsc clean, vite build clean,
  no zombie servers. NOTE: buildings on the cramped south rows are uniformly
  scaled down (about 0.6-0.8) to fit — the only way to clear the back street
  without moving plots or roads.

## Chunk 4 — Player floating/terrain collision (2026-10-10) — VERIFIED
- Root cause (measured, 188k samples): the resident walked on analytic terrainH while
  the visible hills mesh is a 5-unit grid of samples with triangle interpolation.
  Deviation up to 0.45 units on slopes (float/sink), and 1,164 walkable spots near
  the lake shore where collision said "above water" but the rendered mesh was below
  the water line -> visible sinking into the lake. Dock points excluded (separate deck mesh).
- Fix: WorldTerrain now exports the hills grid (HILLS) + meshH(), a triangle
  interpolation over the same samples the mesh renders (same diagonal). groundY
  and the wilderness clause of canWalk use meshH, so feet, collision and visuals
  share one surface. WorldBeyond imports HILLS instead of duplicating the literals.
  Town/flat ground unchanged (max delta 0.02, grid-precision only); dock deck intact.
- Tests: new tests/terrain.spec.mjs (7 checks: vertex exactness, flat-ground
  invariance, no walkable point below water line, no visual/collision water
  mismatch, lake blocked, dock walkable, trail continuity). Full suite 33 tests,
  5 consecutive green runs; tsc clean; vite build clean; no zombie servers.

## Chunk 5 — Town Park upgrade + core interactions (2026-10-10)
- Issue 6 root cause: the upgrade reducer required `owner === 'you'`, but the
  Town Park and every community building is seeded `ownerName: 'Town Council'`
  — the upgrade button rendered and then silently no-opped (no purchase, no
  deduction, no level change, no visible state). Upgrades were also fully
  client-local: they never reached the server, so other sessions never saw one.
- Fix: reducer now allows `you` or `Town Council` plots; upgrades relay through
  the server (`upgrade` message) with server-side validation (done building,
  owner or Town Council, exact +1 step, max level 4) and the level rides in the
  plot record, so claims/welcome snapshots carry it. Engine already re-renders
  on level change (`rebuildLevel` -> `buildPark(level)`), so the park now
  visibly gains the duck pond (L2) and flower arch (L3).
- Tests: tests/upgrade.spec.mjs — reducer unit tests via the real state.tsx
  plus protocol tests (relay, snapshot, validation, cap, foreign-plot guard).
- Verification (completed after the interrupted run): upgrade.spec added to npm
  test; full suite (38 tests) ALL PASS 5 consecutive runs; tsc clean; vite build
  clean; browser.spec all 4 PASS (shopkeeper prompt + E opens store, purchase
  deducts balance, furniture prompt, walking/prompts).
- Issue 7a shop verdict: NOT REPRODUCIBLE in the real UI path. The prior run's
  null-prompt "bug" came from its own broken debug scripts (wrong spawn/drive
  logic), not the game. No code change needed; bisect closed.

## Chunk 5a — VERIFIED 2026-10-10

## Chunk 5b — House entry, furniture, inventory (2026-10-10) — VERIFIED
- Bug A (persistence): purchased-but-unplaced furniture was lost on reload while
  the $BLOCKVILLE stayed spent. `furnitureInventory` is now persisted in
  `blockville_store_progress` (load/save paths in src/game/state.tsx).
- Bug B (echo race): a stale `houseState` echo captured before a newer local
  edit deleted that edit locally and on the server (paid pieces vanished).
  `remoteHouseState` now keeps local placements a stale echo lacks
  (src/game/state.tsx), and the send loop only skips a payload the server has
  actually echoed back (ackedHouseRef in src/game/GameCanvas.tsx) — the merged
  list is re-relayed after a stale echo.
- Bug C (ownership transfer): the server kept the previous resident's furniture
  after a sale, NPC buy, or fresh claim. `houseStates.delete(plot)` on all three
  ownership-change paths (server/index.mjs).
- House entry/exit, move/rotate/lock clamps, buy guards, remove refunds: covered
  by 22 new reducer checks (tests/furniture-reducer.ts) — all already correct.
- New protocol tests (tests/furniture.spec.mjs, 5): relay, non-owner rejection,
  server-side clamping, late-joiner snapshot, furniture cleared on transfer.
- Verification: npm test (7 specs) ALL PASS 5 consecutive runs; tsc clean; vite
  build clean; browser.spec 4/4 PASS (shopkeeper prompt, purchase, furniture
  store prompt, walking/objects). No zombie servers.

## Chunk 5b — VERIFIED 2026-10-10
## Phase 2 Chunk 1 — Settings menu + audio (2026-10-10) — VERIFIED
- No settings button and no audio system existed in this build; both added minimally.
- Settings: ⚙️ mbtn in the topbar row opens a Modal (src/App.tsx) with Master +
  Effects volume sliders. State: settingsOpen + persisted volumes
  (blockville_store_progress, loader clamps; src/game/state.tsx).
- Audio: new src/game/audio.ts — one shared AudioContext, sfx→master→destination
  gains; sliders write the real gains; release-preview blip; toast blip on new
  personal messages; provider effect syncs persisted volumes on mount.
- Reducer clamps volumes; NaN/Infinity keep the current value (test-caught bug:
  NaN slipped through Math.min/max).
- usePersonalUnread badge now tracks the last toast id instead of list length
  (needed once toasts are length-capped in Chunk 4).
- Tests: new tests/settings.spec.mjs + settings-reducer.ts (9 checks) wired into
  npm test; browser spec 4/4 PASS; tsc clean; vite build clean.
## Phase 2 Chunk 2 — Report-a-bug (2026-10-10) — VERIFIED
- No bug-report form existed. Added one inside Settings (src/App.tsx): textarea,
  disabled while sending, error keeps the text for retry, success message states
  exactly where the report went.
- Server: POST /api/bug-report (server/index.mjs) sanitises and length-validates,
  appends to bugreports/bugreports.jsonl, and forwards to $BUG_REPORT_WEBHOOK_URL
  when set (honest per-path status: stored/forwarded/forwardError; 500 when
  neither path worked — success is never faked).
- Destination note: no external destination is preconfigured by design. Wire one
  by setting BUG_REPORT_WEBHOOK_URL (e.g. a Discord webhook) at server start;
  without it, reports are stored server-side and the UI says so.
- Tests: new tests/bugreport.spec.mjs (7 checks: accept, store, reject 400s,
  sanitisation) wired into npm test; tsc clean; vite build clean.
## Phase 2 Chunk 3 — HUD layout (2026-10-10) — VERIFIED
- Top-left held the brand plus the DEMO MODE tag directly beneath it; the tag is
  the only secondary HUD item there. Moved it to the empty bottom-right corner
  (still visible, pointer-events none; narrower screens keep 12px insets).
- Zone comment updated to match the new layout. No controls were hidden and
  nothing else moved.
- Verification: browser spec 4/4 PASS (no layout-dependent regressions), tsc clean.
## Phase 2 Chunk 4 — Activity log (2026-10-10) — VERIFIED
- Toasts grew without bound (24 append sites, no cap). The reducer is now
  wrapped: baseReducer + a cap of 60 keeping the most recent (src/game/state.tsx).
- PERSONAL tab showed oldest-first while TOWN is newest-first; personal entries
  now render newest-first too (src/App.tsx ActivityLog).
- The unread badge now raises inside the 'toast' reducer case (authoritative,
  testable) instead of only in the usePersonalUnread effect; clearing paths via
  setLogOpen/setLogTab unchanged, hook kept as a redundant safety net.
- Found and fixed a disk blocker first: ~2 GB of stale /tmp/bv-* browser-test
  temp dirs from the failed pre-Phase-1 run made every esbuild-bundled spec fail
  with "no space left on device".
- Tests: new tests/activitylog.spec.mjs (9 checks) wired into npm test; full
  suite 92 PASS / 0 FAIL; tsc clean; vite build clean.
## Phase 2 Chunk 5 — Regression + final (2026-10-10) — VERIFIED
- Regression run: npm test 92 PASS / 0 FAIL across 3 consecutive runs; tsc clean; vite build clean; no zombie servers.
- Browser spec: the two-session multiplayer test failed deterministically. Root cause was the TEST, not the game: both pages share one Chrome profile, so the second page restored the first session's persisted name from localStorage (boot only types a name when the gate renders) and both peers registered as "Alice". Fixed by pinning identities with the dev-only ?autoname= param; also fixed two test-body bugs (wrong close call, leftover variable refs) that masked the real assertions.
- Verified: A sees Bob's remote and B sees Alice's remote in real browser sessions; sync itself was already correct.
- Final: blockville-phase2-complete.zip
## Phase 3 Chunk 1 — Lake + mountains (2026-10-10) — VERIFIED
- Mountains (WorldBeyond.mountainGeo/buildHorizonRing): 9x6 segment cones with an
  extra angular noise octave, rock-striation banding, sun/shade facet tinting
  (fixed SUN dir), haze reduced 0.08/0.2/0.3 -> 0.05/0.14/0.24 and recolored
  lavender -> cool blue-grey. Ridges now read as lit faceted rock, not flat slabs.
- Lake (buildWilderness): water gradient now samples the true radial fraction
  (was ring index, pinched at bulges); softer teal rim 0x74c7bd, deeper blue
  0x2464a4; metalness 0.18 / roughness 0.14 for sky glint; gentle vertex ripple
  via self-contained onBeforeRender (±0.05, inside the WATER_Y+0.25 walk margin).
- Shore: darker wet-sand band (q 1.06-1.22) in buildHills, thin foam ring at the
  waterline, plus sparse deterministic reeds/rocks/lily pads (trail and dock
  approaches kept clear).
- Verified: terrain spec 7/7, full suite 92 PASS / 0 FAIL, tsc clean, vite build
  clean, before/after screenshots (lake, lakeFar, street, beyond) reviewed.
## Phase 3 Chunk 2 — prop grounding + placement audit (2026-10-10) — VERIFIED
- Root cause (measured): props were planted on the analytic terrainH while the visible
  ground is the triangulated hills mesh — the same divergence fixed for the player in
  Phase 1 Chunk 4. New tests/props.spec.mjs decodes every InstancedMesh instance from
  the real builders: 1,226 floating props (worst +2.08), 945 floating grounding decals,
  and 61 town props overlapping the z=-36 street's paved band or plots.
- Fix: WorldNature (instanced(), plantCluster default, blob corner-max) now samples
  meshH (the exact rendered surface); WorldBeyond trail ribbon + pebbles likewise.
  North grove band southern edge moved z=-32.4 -> -30 so trunks/bodies clear the
  z=-36 street sidewalk; mesh names set for auditability. Town plots/roads untouched.
- Verified: props.spec 7/7 (0 floaters, 0 sunk, 0 in water, 0 on trail, 0 town
  conflicts, decals exact); full suite 99 PASS / 0 FAIL x3 consecutive; tsc clean;
  vite build clean; screenshots (plots/beyond/mountain/lakeFar) reviewed — no visible
  floating/clipping props. No zombie servers.
## Phase 3 Chunk 3 — mountain close-range polish (2026-10-10) — VERIFIED
- Measured before fixing: replicated buildHorizonRing's RNG to recover all 68 peak
  placements — 57/62 rendered mountains stand beyond the hills-grid edge (bases
  over the hidden void; not visible from play). Close views showed three real
  defects: a hard dark skirt where cone feet met the meadow, a pale snow wedge
  running down a flank (shoulder cone bleeding cap colour through the main
  cone), and the same fixed 3-peak silhouette repeated on every mountain.
- Fix (src/world/WorldBeyond.ts mountainGeo): silhouettes now vary per mountain
  (1-3 randomised shoulders around the dominant peak); snow caps key off ABSOLUTE
  height against the main peak so shoulder tops can no longer paint mid-flank;
  hash noise clamped non-negative; the bottom ring of every cone lerps to the
  meadow tone (0x74a15f) so feet melt into the grass instead of a hard skirt.
- Verified: 99 PASS / 0 FAIL x3 consecutive; tsc clean; vite build clean;
  screenshots mtSeamN/mtEdgeN/mtEdgeE/mountain before+after reviewed — skirt and
  snow wedge gone, feet blend, wide views unchanged (no haze regression); no
  zombie servers. Removed nothing; placement/rng order preserved.

## Phase 3 Chunk 4a — characters & NPCs (verified)
- Name tags (self, remote, retag, NPC x2) now anchor via shared CHARACTER_TAG_Y = 3.42,
  clearing the tallest hat (~3.37); were at 2.35, clipping into hair/hats.
- NPC bubble anchor raised above the tag (CHARACTER_TAG_Y + 0.73).
- NPCs swing arms while walking (mirrors legs, x0.65 like the player); frozen arm
  eased back to rest during dwell/sit.
- Sitting (player + NPC) dropped from y=0.32 to y=-0.14 so the torso rests on the
  0.62 seat top instead of hovering ~0.44 above it.
- Failure analysis: prior Chunk 4 run stalled because the sandbox reset left
  node_modules empty and npx hung on the registry; deps now installed before gates.
- Verified: 99/99 PASS suite, tsc clean, vite build clean; in-game captures show
  tag above head with clear gap and correct bench sit pose (y=-0.14 confirmed live).

## Phase 3 Chunk 4b — buildings & interiors (verified)
- Baseline probe tests/debug-buildings.mjs captures store fronts, plot-shop both
  sides, house exterior, and interior (claim -> build -> enterHouse in-probe).
- Interior defects confirmed on captures: ceiling lid rendered near-black with a
  harsh hotspot; floor had a blown-out centre puddle (two point lights at 50/60).
- Fix (src/houses/HouseInterior.ts): ceiling 0x4a3440 -> warm 0x8a5f47; centre
  lamp 60->34 raised to y5.2; back warm light 50->28.
- Recapture verified: warm ceiling with soft lamp pool, gentle floor gradient,
  furniture sits flat with no clipping. Exteriors audited clean (store fronts,
  shop L1, house); shop rear reads as a generic gable — deferred to the
  buildings-visuals chunk, not changed here.
- Probe timing: interior shot needs 2500ms after enterHouse (1500 fired early).
- Verified: suite 99 PASS / 0 FAIL x3 consecutive (exit 0); tsc clean; vite build
  clean; no zombie servers.

## Phase 3 Chunk 5 — environment & lighting (verified)
- Before/after probes via tests/screenshot.mjs (added `sky` view): plaza + plots
  frames confirmed lighting/shadows/grass/flowers already restrained; the one
  confirmed defect was cloud shape.
- WorldSky.ts: clouds read as pancake stacks with a hard chopped-flat bottom
  (the 9.5x1.5x3.2 base slab) and emissive 0.55 flattening shading. Fix: removed
  base slab, added an under-puff per crown (rounded underside), puff y-scale
  0.78->0.9, x-stretch 1.25->1.15, emissive 0.55->0.38. Same 7 clouds, shared
  material, positions/scale untouched — no perf change.
- Verified: sky-after capture shows rounded cumulus with shaded undersides;
  full suite 99 PASS / 0 FAIL; tsc clean; vite build clean.

## Phase 3 Chunk 6 — UI polish & responsive HUD (verified)
- Screenshot probe `tests/debug-ui.mjs`: boots dev+server+Chrome (CDP), captures
  name gate / HUD / log / settings / customise / store / market / treasury at
  full size plus emulated 720x560 and 420x760, and measures horizontal overflow.
- Confirmed defect fixed (styles.css): below 720px the top-bar pills sized to
  max-content and ran off-screen (measured right edge 551px at a 420px viewport;
  Settings unreachable). Top bar now stacks and pills/menu wrap; verified
  overflow=false at 720 and 420 with clean captures; desktop layout unchanged.
- Tooling leaks fixed so runs can't degrade: all 8 dev/test scripts spawned
  `npx vite` and killed only the wrapper, leaking every dev server (7+ zombies
  found); they now spawn `node_modules/.bin/vite` directly. browser.spec and
  debug-ui now delete their Chrome profile dirs (20+ stale profiles had filled
  the 2GB /tmp tmpfs and caused ENOSPC probe hangs).
- Probe correctness fixes: settings/customise shots no longer stack two modals
  (staking auto-opens the customiser); market/treasury waits/closes target
  `.modal`, not `.panel`.
- Verified: npm test 99 PASS / 0 FAIL; browser spec 5/5 ALL PASS (incl. two
  real sessions); tsc clean; vite build clean; /tmp and process table clean.

## Phase 3 Final — wrap-up (verified)
- Final sweep on the delivered state: npm test 99 PASS / 0 FAIL; tsc clean; vite build clean.
- PHASE3-REPORT.md written; project packaged as blockville-phase3-complete.zip.

## Phase 3 follow-up — idle float at the lake trail/shore (verified)
- User asked whether standing still on the path/lake was confirmed. Probes proved
  walking y tracks the rendered surface exactly (diff 0.000 over the full descent),
  but IDLE floated: engine.ts idle "breathing" set position.y = |sin(t)|*0.06
  absolute, so stopping on descending ground (trail x>~170, lake shore) snapped the
  resident up to y~0 (up to 3.1 units above the beach). Phase 1 Chunk 4 fixed
  walking only; stills missed this because the contact shadow floats with the body.
- Fix: idle bob now adds to the standing surface (groundY beyond the town rect,
  0 in town/interiors). engine.ts one site.
- Verified: moving diff 0.000; idle y within 0.06 of ground at path-mid (-1.13),
  path-bend (-2.50), shore (-3.07); before/after screenshots; new browser regression
  test 'resident idles ON the ground on the lake trail'. npm test 99 PASS / 0 FAIL;
  browser spec 6/6 ALL PASS; tsc clean; vite build clean.

## Chunk 1 — Character model proportions (P1.1)
- Adapted `src/players/CharacterBuilder.ts` to the Quaternius "Matt" reference proportions: legs about 30% of height (hip pivot 0.74 to 0.86), torso shortened to about 32%, head slightly taller, and arms lengthened so hands hang to mid-thigh.
- Total height stays about 2.8 (was 2.83), so name tags, hats, the customise preview, and the limb pivots used by the walk cycle are unchanged.
- Colours, clothing, shirt designs, faces, hats, glasses, and multiplayer sync code are untouched. All residents, NPCs, and player avatars use the same builder.
- Verified: `npm test` passes, the production build passes, a static front/side render and a walk-pose render were checked against the reference, and the live game shows a grounded avatar at the new proportions.
- Not done in this chunk: NPC bubble proximity (Chunk 2), sign and name tag text (Chunk 3).

## Chunk 1b — Accessory fit and customiser framing
- Hats scaled 1.12x across the X/Z axes and seated on the hair cap (y 2.80), so they match the hair width.
- Glasses moved to the face texture's eye row (HEAD_Y + 0.03).
- Customiser preview camera moved back and raised so the tallest hats have headroom.
- Verified with a temporary harness rendering all 11 hats, 3 glasses, and 11 shirt designs (harness removed).
- npm test passes; production build passes.

## Chunk 2 — NPC chat bubble proximity (P1.2)
- Bubbles show within bubbleShowRange (4.5 units, about 4.8 character widths) and hide beyond bubbleHideRange (5.2), so they don't flicker at the edge.
- Range rule lives in src/game/bubbleRange.ts; spec tests/bubblerange.spec.mjs (added to npm test).
- Bubbles fade with an opacity transition instead of popping.
- npm test passes (all specs); production build passes.
- Not yet observed live: a player walking up to a dwelling NPC. Bubbles spawn at random, so this needs an in-game walk test.

## Chunk 3 — Sign text and name tags (P2.4, P2.5)
- Sign textures now use the sign's own aspect ratio (signTexture takes aspect; sign() passes w/h). Previously a 512x128 canvas was stretched onto boards of other ratios, which distorted the lettering.
- Sign canvas renders at 1024px on the long side, with mipmaps and anisotropy 8, so text stays sharp at distance.
- Name tags render at 4x supersampling; sprite width is taken from the canvas aspect, so names are no longer squashed.
- Verified: npm test passes, tsc passes, production build passes, harness render shows undistorted sign and tags.

## Fishing mini-game + lighting pass
- New src/game/fishingLogic.ts (pure rules: 70% junk Old Boot/Rusty Can pays 0, 30% fish Minnow 25 / Carp 75 / Koi 250 $BLOCKVILLE) and src/game/Fishing.ts (cast, wait, bite, timing meter). Hooks into engine via resolveInteract, per-frame update, walk-to-cancel; fish pay through the existing foundCoins path, junk shows a toast.
- Lighting: warmer key sun, cool shadowless fill, 3072 shadow map, exposure 1.06, warm dock lantern point light, CSS vignette. No gameplay or layout changes.
- Verified: tsc clean, npm test pass (incl. tests/fishing.spec.mjs), build clean, live dock run through cast/bite/reel/result.
- Fishing cap: max 20 landed catches (fish+junk) per rolling 15 min, persisted in localStorage

## NPC plot cap
- server/index.mjs: NPC residents combined capped at 11 plots (claims and buys of player listings); test added.

## Part D — fishing anywhere, NPC cap, trail/beach detail, plaza cleanup, rod, expansion entrance
- Fishing from any walkable sand along the lake or the dock (verified live: teleport to north shore sand, E casts, phase "waiting").
- NPC cap: server now counts every simulated resident (named NPCs and "Resident A-Z" starter sellers) toward one 11-plot cap; starter listings bought by an NPC now really transfer the plot on the server and count.
- Removed: plaza ellipse, plaza disc under fountain, spawn walks and pavers, store forecourt slabs and apron, x=0 spur road with its dashes.
- Trail and beach: edge stones, grass tufts, dirt/dust patches, rut pebbles, lantern posts, LAKE sign, stepping slabs, reeds, dune grass, rocks, driftwood, starfish, sand ripples (src/world/WorldTrailDetail.ts).
- Held fishing rod on the right arm with cast flick, bite tug and reel shake; line runs from the rod tip.
- Black arched entrance with sign "WORLD EXPANSION 3: COMING SOON." in the east mountain across the lake (src/world/WorldPortal.ts).
- Verified: tsc clean, vite build clean, npm test all PASS.

## Item 1 — remote plots show owner name and finished builds (T4 follow-up)
- Root cause: the server's `welcome` snapshot sent raw `plotOwners` records (field `owner`) while every broadcast goes through `record()` (`ownerName`). Late joiners therefore lost the owner name — plots rendered with no "Plot owned by X" label — and the earlier client-side fix read `ownerName`, so the welcome path silently dropped names.
- server/index.mjs: hoisted `record()` to module scope (it was branch-local to the claim handler) and now normalise the welcome snapshot's plots through it, so the wire shape is identical for `welcome`, `claim` and marketplace transfers.
- tests/protocol.spec.mjs, tests/market.spec.mjs: welcome-shape assertions updated from `.owner` to `.ownerName` (the new, single wire shape).
- tests/debug-remote-plots.mjs: the finished-mesh check now waits for the pop-in animation to settle (mesh height >= 1) instead of reading the mesh in its first frame.
- Verified: headless two-session repro (`node tests/debug-remote-plots.mjs`) ALL PASS — live claim label + type, live build progress to finished mesh, level-2 upgrade, and a late joiner seeing owner label + finished build from the welcome snapshot. `npm test` 158 PASS / 0 FAIL, `tsc --noEmit` clean, production build clean.
- Not changed: local plot behaviour, gameplay, economy, world layout.

## Chunk 5 (part 2) — treasury wallet holdings display
- server/tokenomics.mjs: ONCHAIN gains `defaultRpcUrl` (public mainnet RPC fallback), `tokenProgramId` and `holdingsMinRefetchMs` (5000) — all read-only config, no keys.
- server/holdings.mjs (new): read-only tracker for the treasury wallet's real $BLOCKVILLE balance via Solana RPC `getTokenAccountsByOwner` (jsonParsed). With `BLOCKVILLE_MINT` unset it idles (configured:false, zero RPC calls). RPC failures serve the LAST VALID balance with `stale:true`; the next successful read recovers automatically. With no prior valid read it reports null rather than inventing a balance. Server re-reads on-chain at most once per 5s so the 10s client poll (or many clients) cannot hammer the public RPC. The RPC request carries the public address + mint only — key material can never enter this path.
- server/index.mjs: new route `GET /api/treasury/holdings` (read-only; kill switch irrelevant — a public-address read, works in dry-run and live). The client receives the value only.
- src/App.tsx: `useOnChainHoldings` hook polls the endpoint every 10s while the Treasury panel is open (no page reload); on a failed HTTP poll the last value stays with a stale flag until the next success. TreasuryPanel now shows the ON-CHAIN holdings as the headline figure (full public wallet address from the server, live/stale/awaiting-mint status line); the previous simulated demo figure is kept, clearly labelled "Simulated demo ledger".
- src/styles.css: `.tb-status` / `.tb-status.stale` status line styling.
- tests/treasury-holdings.spec.mjs (new, 10 tests, in the npm test chain): no-mint idle; account summing + decimals; request carries public address only (no secret-shaped keys); 5s cache window (no refetch inside, refetch after); last-valid on RPC failure; automatic recovery; null balance when never read; value-only response shape; plus a real-server integration test against a local mock RPC (TREASURY_RPC_URL honoured).
- tests/probe-holdings-ui.mjs (new, dev-only probe, not in the npm test chain): headless Chrome opens Settings → Treasury and verifies the live display, then fails the mock RPC and restores it — verifying stale → auto-recovery without a page reload.
- Verified: `npm test` 168 PASS / 0 FAIL (158 before + 10 new); `npm run build` (tsc + vite) clean; headless UI probe 11/11 PASS with screenshots. Note: the vite dev proxy hardcodes localhost:8787, so dev-mode probes must run the backend on 8787 (production serves the API from the same origin, unaffected).
- Not changed: gameplay, economy, world layout, existing demo ledger feed, cycle engine.
## Chunk 6 — holding-based plot entitlement, LIFO revocation, staking removal
- server/entitlements.mjs (new): entitlement engine. entitlement = floor(verifiedHoldings / CONFIG.plotStakeCost), capped at maxPlots; claim slots recorded server-side in LIFO claim order; LIFO revocation when holdings fall below the tier (revoked plot frees its slot immediately and drops out of scoring); persisted to data/entitlements-ledger.jsonl so claims/revocations survive restarts. Demo-holdings mode (BV_DEMO_SEED_TOKENS + dev-only set route, env-gated) drives verification in tests without any chain.
- server/index.mjs: claim relay now consults entitlements.canClaim() BEFORE accepting a claim — rejected claims answer `claimDenied` with the reason (entitlement_full). Marketplace purchases consume the BUYER's slot and release the seller's. Revocations broadcast `plotRevoked` and clear plotOwners server-side; per-joiner `entitlement` snapshots sent on join and after claim/transfer/revocation.
- src/game/state.tsx: staking removed — persisted staked amounts migrate back into the balance on load; the claim allowance is the SERVER's entitlement snapshot (+ permit extra slots), never client-computed; new reducer cases for entitlement snapshot, plotRevoked (toast + plot cleared) and claimDenied (toast with reason). Old stake-weighted distribution timer removed.
- src/game/net.ts, GameCanvas.tsx: wiring for entitlement / plotRevoked / claimDenied messages.
- src/App.tsx: claim wording is now holdings-based ("Each block of land needs 20,000 $BLOCKVILLE held"); the staking panel is gone.
- src/game/config.ts: plotStakeCost documented as tokens HELD per claimable plot (20,000), not staked.
- tests/server-entitlements.spec.mjs (new, in the npm test chain): spawns the real WS server with fast sweep timings and verifies — entitlement snapshot on join (server-computed, verified); claims inside the tier accepted and counted; claim beyond the tier REJECTED server-side; Claim Permit adds a real server-side slot; end-to-end LIFO revocation (holdings driven below tier → plotOwners cleared → plotRevoked broadcast → plot claimable by a second player).
- Verified: `npm test` 175 PASS / 0 FAIL (168 before + 7 new); `tsc --noEmit` clean; `npm run build` (tsc + vite) clean.
- Not changed: gameplay loop, economy values, world layout, local plot visuals.

## Auth chunk — real Ed25519 verification in POST /api/auth/verify
- server/auth.mjs (new): base58 codec + real Ed25519 verification built on Node's built-in `node:crypto` — the raw 32-byte public key is wrapped in the RFC 8410 SPKI DER prefix and `crypto.verify(null, message, key, signature)` performs the check (`null` algorithm is required for Ed25519). NO new dependency was added; package.json is unchanged apart from the test chain.
- server/index.mjs, POST /api/auth/verify: the scaffold is gone. The endpoint now (1) validates payload types; (2) looks up the issued nonce and checks it was issued to THIS wallet; (3) burns the nonce on the FIRST verify attempt whatever the outcome (single-use — no replay after success, and a failed attempt also burns it); (4) enforces nonce expiry at verify time (BV_AUTH_NONCE_MS, default 5 min — expiry was previously only swept lazily at issuance); (5) reconstructs the exact sign-in message server-side from the issued record, so a client can never choose what was signed; (6) runs the REAL Ed25519 check of the base58 signature against the wallet's public key. Every reject path answers the SAME generic 400 (`Verification failed. Request a new nonce and sign again.`) — nothing about why it failed leaks.
- server/index.mjs, session ledger: a successful verify mints an in-memory session token (32 random bytes, BV_AUTH_SESSION_MS, default 24 h) bound to the VERIFIED wallet. The wallet public key (the base58 address IS the key) is now the server-side identity anchor.
- server/index.mjs, WS identity binding: `join` accepts an optional `session` token; a valid, unexpired session binds `rec.wallet` — this is the ONLY write path to `rec.wallet`, so no client can bind an unverified wallet. Invalid/expired/absent tokens are silently ignored (connection just stays unverified). `rec` gains `wallet: null`; the entitlement message gains an additive `wallet` field (the client's handler reads named fields only — untouched).
- server/index.mjs, entitlement keys: in demo mode (no BLOCKVILLE_MINT) everything is keyed by the server-side name exactly as before — demo holdings are server-side state, so no wallet is involved at all. In live mode the entitlement key IS the session-verified wallet: `claimKeyOf()` returns the wallet only for a session-bound connection, otherwise the claim gate denies with `holdings_unverified:wallet_required` (previously live-mode claims were simply impossible — the gate now has a real path for verified wallets). The engine's `readHoldings` is now reader-per-call: demo reader for names, `createRpcHoldingsReader` (already in entitlements.mjs, read-only public RPC) for wallet keys. Plot records gain `ownerKey` so purchases release the SELLER's correct entitlement slot and revocations match on the wallet key. The sweep now pushes entitlement updates by name OR wallet (a ≤12-char display name can never equal a ~44-char address).
- tests/auth-verify.spec.mjs (new, added to the npm test chain): valid signature accepted + token minted; tampered message rejected; wrong keypair rejected; single-use challenge (no replay after success, failed attempt burns it); expired challenge rejected (test-shortened TTL) with a fresh-nonce control; malformed payloads (8 cases) rejected with the generic failure; WS binding (valid token binds the wallet, invalid token ignored, unbound stays null); LIVE MODE end-to-end against a mock RPC — unverified connections cannot claim, a verified wallet CAN claim and the RPC was consulted with the verified wallet address only (never a display name); messages before join still ignored (claim/build/shop/pos). Throwaway test keypairs only; no real transactions.
- Verified: `npm test` 186 PASS / 0 FAIL (175 before + 11 new); `tsc --noEmit` clean; `npm run build` (tsc + vite) clean.
- Not changed: gameplay, economy values, world layout, demo-mode claim behavior, client code. NOTE: the brief mentions a "bet" protected flow — no bet/blackjack handler exists in this baseline (T6), so it could not be tested; the equivalent protected flows present here (claim, build, shopPurchase, gardenPlace) were covered pre-join, and in live mode claim/build are wallet-gated by ownership checks.
## Chunk — real SOL upgrade transactions + Terms & Disclaimer
- server/payments.mjs (new): read-only on-chain verification of a client-submitted SOL transaction signature via RPC `getTransaction` (commitment 'confirmed', jsonParsed). Verifies: confirmed, no on-chain error, and the PUBLIC treasury wallet's balance delta (post − pre at its account index) equals the quoted fee exactly. Idempotent by signature: applied signatures persist to data/upgrade-signatures.json (atomic tmp+rename) so a restart can never let one paid transaction buy two upgrades. Rejections are reason-coded for the server log only (unconfirmed / wrong_amount / wrong_recipient / failed_onchain / malformed_signature / rpc_unavailable / already_applied); a rejected signature is never consumed. No new dependency; reuses server/auth.mjs base58.
- server/tokenomics.mjs: UPGRADE_SOL [0.1, 0.25, 0.5] unchanged (already the server-authoritative quote table, cross-checked against the client config by test).
- server/treasury.mjs: payUpgrade now routes upgrade SOL through the configured received-funds split — FEES.buybackPct (80%) → pending buyback, FEES.gasReservePct (20%) → gas reserve — with the split carried on the `upgrade_in` ledger event; `settled` labels the trust level ('server' funded debit, 'client' demo relay, 'dev' dev mode, 'onchain' verified payment). New receiveUpgradeSol() records SOL the server has PROVEN arrived on-chain (no player balance involved) through the same split and ledger kind.
- server/index.mjs: payment modes resolved per message — 'dev' (BLOCKVILLE_DEV_TX_MODE=1: upgrades complete without on-chain verification, same server-side state changes; off by default), 'strict' (dev flag off AND BLOCKVILLE_MINT set: a client claim alone applies NOTHING — the server answers `upgradeQuote` with the exact fee + treasury address), 'demo' (everything else, unchanged relay). Both `upgrade` and `upgradePay` validate through one shared helper (plot finished, owned by sender or Town Council, level exactly +1, fee quoted ONLY from UPGRADE_SOL). `upgradePay` (async): strict mode verifies the submitted signature on-chain via the payment verifier, then routes the fee with receiveUpgradeSol and applies the upgrade — broadcast to EVERYONE (the strict payer applied nothing optimistically). Every failure answers one generic `upgradeRejected` (reason 'payment_unverified'); the real reason is logged server-side only. Replayed/duplicate signatures apply nothing (verifier-level, restart-safe).
- src/game/net.ts: `onUpgradeQuote` / `onUpgradeRejected` handlers + `sendUpgradePay`.
- src/game/state.tsx: `upgradeRevert` reducer — when the server answers an optimistic local upgrade with a quote/rejection, the level goes back, the demo SOL is refunded and the feed says what actually happened (no fake success).
- src/game/GameCanvas.tsx: quote/rejection wiring; a quote marks the reverted level so the sync effect never re-announces it, and a later rejection after a quote cannot double-revert (quoteRevertedRef).
- src/App.tsx + styles.css: Settings gains a "Terms & Disclaimer" section between Economy and bug reporting — collapsed by default (`<details>`), always-visible heading, four clauses verbatim (No Financial Advice / No Guarantee of Value / Play at Your Own Risk / Not an Investment). Nothing gates gameplay on it.
- tests/upgradepay.spec.mjs (new, 9 tests): fee quotes per level; verified payment applies exactly once (unit, injected fetch) incl. restart replay rejection via the persisted store; wrong amount (incl. off-by-one lamport) rejected and not consumed; wrong recipient / zero delta rejected; unconfirmed / failed / RPC-broken rejected without consuming; malformed signatures rejected before any RPC call; receiveUpgradeSol 80/20 split + ledger shape; dev mode produces the SAME state changes; upgrade level raises the plot-scoring weight (plotScore × UPGRADE_MULT).
- tests/upgradepay-ws.spec.mjs (new, end-to-end through the real WS server): DEV mode — `upgrade` and `upgradePay` apply without verification, ledgered 'dev'; STRICT mode behind a local mock RPC — upgrade claim alone answers `upgradeQuote` and broadcasts nothing; unverifiable payment rejected generically; a verified 0.1 SOL transaction applies the upgrade exactly once (payer included in the broadcast), ledger `upgrade_in` settled 'onchain' with buyback 0.08 / gas 0.02; the SAME signature replayed against another plot is rejected and ledgered nothing.
- tests/treasury-fees.spec.mjs: upgrade-split assertions updated to 80/20 (pendingBuyback 0.2/0.28, gasReserve 0.05/0.07).
- package.json: both new specs appended to the npm test chain.
- Verified: `npm test` 203 PASS / 0 FAIL (186 before + 17 new); `tsc --noEmit` clean; `npm run build` clean; real headless-Chrome render check — Settings shows the Terms section (collapsed by default, opens on click, all four clauses readable), Treasury still opens from Settings and GET /api/treasury/holdings answers normally.
- Honest note: the client cannot yet CONSTRUCT a real SOL transaction — wallet signing is not in the build (the auth chunk deliberately added no client UI either). In strict mode the flow is server-verified end-to-end and the client-side submission path (`sendUpgradePay`) exists; the actual transaction construction lands with the wallet-connection chunk. Until then, live deployments without BLOCKVILLE_MINT stay in demo mode; with BLOCKVILLE_MINT set they are strict and idle safely.
- Not changed: gameplay, economy values, world layout, cycle engine, existing demo ledger feed.

## Chunk — One character per wallet (tab-duplication protection)

- server/index.mjs — `walletLocks` registry: VERIFIED wallet → { ws, rec, closedAt }. The lock keys ONLY on `rec.wallet`, which is set exclusively by a session token minted by `POST /api/auth/verify` after real Ed25519 verification — never by tab, window, browser session id or client-reported identity. Join processing now binds the wallet FIRST, then resolves the lock:
  - Duplicate tab/window of an ACTIVE session → refused with `{ t: 'sessionTaken', reason, retryAfterMs }` and the socket is closed; no id is assigned, no join is broadcast, so no second character can ever exist. Choice stated: REJECT (not attach-as-viewer) — every joined socket in this hub is a full participant, and a half-participant viewer would double-count the player name in the market sim's `connected` set, entitlement pushes and payout fanout. The client auto-retries after `retryAfterMs`, so the player always gets back in.
  - Refresh/reconnect inside a short grace window after a CLEAN close → re-adopts the SAME character (same player id, name, look; the join broadcast is skipped because every other client still holds that exact id). Peers see one uninterrupted character through the owner's refresh.
  - Holder silent beyond the heartbeat timeout (unclean drop, crash, lost network) → reclaimed: leave broadcast, lock freed, dead socket terminated. Reclaim happens AFTER the timeout, never before.
- Timing (stated values): heartbeat timeout `BV_SESSION_HEARTBEAT_MS` = 45 000 ms (within the required 30–60 s band) of no heartbeat — a heartbeat is any app message OR a protocol pong. Clean-close grace `BV_SESSION_GRACE_MS` = 8 000 ms (covers a normal page refresh). Sweep cadence `BV_SESSION_SWEEP_MS` = 5 000 ms; the sweep also pings every active holder, so an idle-but-live client stays fresh and a dead one is reclaimed within ~45–50 s worst case.
- server/index.mjs — `rec.lastSeenAt` updated on every message and every pong; close handler distinguishes clean-close grace (wallet sessions) from the previous immediate-leave path (unchanged for unverified/demo connections); a `players.get(ws) !== rec` guard stops a re-adopted (transferred) character from being double-removed; a joined connection can no longer send a second `join` on the same socket; new 5 s lock sweep finalizes grace expiries and times out silent holders.
- src/game/net.ts — sends the (optional) session token with `join` (`setSession()` wiring for the future wallet-auth client flow; the server ignores absent/invalid tokens exactly as before); new required handler `onSessionTaken({ reason, retryAfterMs })`; a refused duplicate stops reconnect-spamming until `retryAfterMs`, then resumes automatically.
- src/game/GameCanvas.tsx — `onSessionTaken` surfaces a clear toast ("This wallet already has an active character in another tab or window.").
- tests/harness.mjs — `Client` gains an optional constructor URL, a `closed` promise, and an optional `session` argument on `join()` (backward compatible).
- tests/wallet-lock.spec.mjs (new, appended to the npm test chain) — all against the REAL WS server with REAL Ed25519 sign-in: duplicate tab (fresh token, same wallet) refused, no second character visible to an observer; two different wallets play simultaneously and duplicates of either are still refused; refresh inside the grace window keeps the SAME character id with no leave/join flicker and live traffic after re-adoption; clean disconnect with no reconnect departs after the grace window and frees the wallet; UNCLEAN drop (local TCP proxy with `end: false` on both legs so no FIN ever reaches the server — server socket open and silent) is held through an immediate reconnect attempt and an absence window, then finalized and reclaimable only after the heartbeat timeout; messages keep an active session alive past timeout windows; a connected-but-idle client stays fresh on protocol pongs alone.
- Verified: `npm test` 212 PASS / 0 FAIL (203 before + 9 new); `tsc --noEmit` clean; `npm run build` clean.
- Honest note: in the current demo build no connection is wallet-verified yet (the client-side sign-in flow does not exist — deliberately out of scope here), so the lock engages for any wallet that completes verification and sends its session token; unverified demo connections behave exactly as before. The headless suite exercises the verified path end-to-end with real keypairs.
- Not changed: gameplay, economy values, world layout, cycle engine, entitlement/payout logic, existing demo ledger feed.

## Chunk — HUD and menu restructure (UI-only)
Date: 2026-10-15. Baseline: wallet-lock ZIP (212 PASS / 0 FAIL). No gameplay, server-logic (beyond one read-only endpoint), economy or world-layout changes.

- server/index.mjs — new public read-only `GET /api/tokenomics` endpoint: exposes the plot-score formula parts (BASE_PLOT_POINTS, BUILD_BLOCKS, UPGRADE_MULT, MAX_LEVEL, GARDEN_MULT), cycle parameters (interval, distributePct, minDistributableTokens), fee split (buyback/gas pct, 0.5 SOL sweep threshold + fraction), payout fairness rules (round-down, remainder retained, NPC exclusion) and entitlement tiers (tokensPerPlot, maxPlots) — every value imported from server/tokenomics.mjs, the single source of truth. No keys, no secrets, no ledger data.
- src/game/config.ts — removed TOWN_STAGES + stageFor (the "Blockville Outpost" town-stage label vocabulary), per the brand-removal item.
- src/game/state.tsx — new `tokenomicsOpen` UI flag + `setTokenomicsOpen` action (mirrors treasuryOpen; also clears selectedPlot while open).
- src/App.tsx — TopBar restructured: top-left `.hud-left` now holds ONLY non-interactive info (the four wallet pills + RESIDENT badge); top-right `.hud-right` holds ONLY the clickable menu (Store, Market, Character, NEW Treasury, NEW Tokenomics, Settings). The "Blockville Outpost" brand block is deleted from the HUD. SettingsModal: the 💰 Economy section (Treasury entry button) is removed; Terms & Disclaimer and bug reporting untouched. BuildHud: the anywhere-on-map low-opacity variant is gone — the panel renders only while the player stands at the construction site (clickable behaviour and hitbox unchanged when visible). New TokenomicsPanel (wide Modal, HUD 📊 button): plot-points formula with per-building base points, upgrade multiplier chips (×1.00/×1.50/×2.25/×3.50) + Garden Kit ×1.20, 5-minute 20% distribution cycle with round-down/remainder-retained and skip rule, 80/20 buyback/gas split bar, 0.5 SOL gas sweep rule, 20,000-per-plot entitlement up to 5, NPC exclusion — ALL figures fetched live from /api/tokenomics every 10s; if the server is unreachable the panel shows a retry notice instead of stale numbers.
- src/styles.css — removed .brand/.brand-name/.brand-sub and the .build-hud.far rules; added .hud-left zone and .tk-mults/.tk-mult chips; activity log 238px → 255px (+7.14%) and expanded max-height 42vh → 45vh (proportional); responsive rules updated (pills wrap left, hud-left alignment, log 220→235px on ≤720px); HUD-zone comment rewritten to document the new top-left/top-right contract.
- tests/hud-restructure.spec.mjs (new, appended to the npm test chain) — real headless-Chrome CDP spec, 7 checks: brand gone (DOM + source); top-left has pills/badge and zero buttons, top-right has zero pills and all six buttons, zones' bounding rects do not overlap; log computed width 255px, ≤5 rows collapsed, expands and collapses on click; no .build-hud rendered away from a site and no .build-hud.far CSS in the served stylesheet; Settings opens with Terms & Disclaimer present and no Treasury/Tokenomics; the HUD Treasury button opens the existing Treasury panel (ledger section intact); the HUD Tokenomics button opens the panel and every displayed figure is cross-checked against the live /api/tokenomics response (multipliers, cycle, percentages, sweep threshold, entitlement, NPC rule) plus one row per backend building type.
- tests/probe-settings.mjs — dev probe updated to click Treasury from its new HUD home.
- Verified: `npm test` 219 PASS / 0 FAIL (212 before + 7 new); `tsc --noEmit` clean; `node --check server/index.mjs` clean; `npm run build` clean.
- Honest note: the two interim spec failures during development were test-harness issues, not app bugs — the spec originally read the first `.modal` in DOM order (the spawn notice) instead of scoping by title, and matched case-sensitively against CSS-uppercased headings; both were fixed in the spec and re-verified. No app change was made in response to a failing check except the intended brief items.
- Not changed: gameplay, economy values, world layout, cycle engine, entitlement/payout logic, existing demo ledger feed, clickable hitboxes of untouched controls.

## Chunk — Whitepaper in Settings (UI-only)
Date: 2026-10-15. Baseline: hud-restructure ZIP (219 PASS / 0 FAIL). No gameplay, server-logic or economy changes.

- src/game/state.tsx — new `whitepaperOpen` flag + `setWhitepaperOpen` action (mirrors `tokenomicsOpen`; clears `selectedPlot` while open).
- src/App.tsx — Settings gains a "📖 Whitepaper" section directly AFTER the Terms & Disclaimer details block, with an "Open the whitepaper" button; opening it closes Settings so the document view is unobstructed, closing it returns to the town. New `WhitepaperPanel` (wide Modal, 📖): seven sections navigated by a chip tab row plus a Previous/Next pager with page count and disabled bounds — The town (what Blockville is; server-authoritative systems), Core loop (hold → claim by holding tiers → build presets/custom → weight grows → cycle payouts → purchases recycle value; tier figures live), Tokenomics summary (plot-points formula, upgrade multipliers, Garden Kit, cycle percentage, round-down + remainder retained, NPC exclusion — explicitly a SUMMARY that points to the 📊 Tokenomics panel for full detail), Treasury & fee flow (80/20 buyback/gas split, 0.5 SOL sweep rule, auditable ledger in the 🏦 Treasury panel), Plots & revocation (claim-by-approach, LIFO revocation, multi-tier drops one per pass, stale-data guard "never revoke on unknown data", revoked plot claimable again, building does not remain), Risk summary (volatile, distributions not guaranteed, points to Terms & Disclaimer), Future Expansions (4 abstract teaser lines — no mechanics, names, dates or promises). Live figures come from /api/tokenomics via the same `useTokenomicsConfig` hook the Tokenomics panel uses; when the server is unreachable the affected sections show a warning instead of possibly-stale hardcoded numbers. Panel added to the Shell render list and the `modalOpen` gate (walking pauses while reading).
- src/styles.css — .wp-entry/.wp-tabs/.wp-tab/.wp-page/.wp-heading/.wp-pager/.wp-count styles built from the existing settings vocabulary (same vars, radii, borders, gold/muted palette).
- tests/whitepaper.spec.mjs (new, appended to the npm test chain) — real headless-Chrome CDP spec, 5 checks: entry sits directly after Terms & Disclaimer in Settings and opens the document (Settings closes); all 7 sections navigable via chips and pager with correct counts and disabled bounds; live figures in the Core loop, Tokenomics and Treasury sections cross-checked against the live /api/tokenomics response (tokensPerPlot, maxPlots, basePlotPoints, ×1.00/×1.50/×2.25/×3.50, Garden ×1.20, interval minutes, distribute/buyback/gas percentages, 0.5 SOL sweep) and the summary references the Tokenomics panel; Risk section points at Terms & Disclaimer and the Future section is 3–5 teaser lines matched against a promise/date regex; no HUD entry point for the whitepaper, Settings fully functional after closing, canvas still alive. tests/wp-screenshot.mjs — one-off visual render check (screenshots inspected by hand).
- Verified: `npm test` 224 PASS / 0 FAIL (219 before + 5 new); `tsc --noEmit` clean; `npm run build` clean; screenshots of Settings, the document panel and the live Tokenomics section inspected visually — layout clean, figures rendering.
- Honest notes: (1) the HUD-restructure spec forbids the words Treasury/Tokenomics anywhere in Settings text, so the whitepaper entry description was worded around them ("the in-game economy") — the document panel itself keeps the full terminology; no existing check was weakened. (2) After the final one-line wording fix (stray space before a comma), the whitepaper spec, tsc and build were re-run clean; the full 224-test chain was run on the tree one line before that fix, with the whitepaper spec covering the touched component end-to-end on the final tree. (3) Two interim spec failures during development were spec bugs (a test variable leaked into a page expression; the summary-reference check ran after `text` was reassigned to the treasury section) — fixed in the spec, no app change made to satisfy them.
- Not changed: gameplay, economy values, world layout, cycle engine, entitlement/payout logic, existing panels, clickable hitboxes of untouched controls.

## Chunk — Fee payouts in Personal tab + earnings callout card with X share
Date: 2026-10-15. Baseline: whitepaper ZIP (224 PASS / 0 FAIL). Note: the sandbox reset mid-run after the first implementation pass; the chunk was re-implemented from the brief on the restored tree and re-verified end to end.

- server/distribute.mjs — new `feesSnapshot(name)`: the lifetime fees total and per-cycle entries derived ONLY from the engine's own cycle reports (rebuilt from the persisted `treasury-cycles.jsonl` on every boot, so the figure survives restarts and is never memory-only).
- server/index.mjs — `treasuryPayout` now carries the server timestamp `ts`; a new `pushFeesEarned` snapshot (`t:'feesEarned'`, total + entries) is sent on welcome and refreshed for EVERY connected player after each completed cycle. Personal-log entries start recording from this build onward (no backfill), while the lifetime TOTAL covers the full persisted ledger.
- server/tokenomics.mjs — `BV_CYCLE_MS` operator/test hook (floored at 1s) shortens ONLY the cycle interval for tests; production stays 5 minutes.
- src/game/state.tsx — `Toast` gained optional icon/detail; the payout reducer now renders the PERSONAL entry with amount, `Cycle #id` and the server timestamp; new `feesEarned` state replaced wholesale by each server snapshot (never client maths); `toast` passes icon/detail through.
- src/game/net.ts + src/game/GameCanvas.tsx — `treasuryPayout` threading and the new `feesEarned` message wired through to dispatch.
- src/game/CharacterSnapshot.ts (new) — one-shot offscreen render of the player's real mesh to a PNG data URL (renderer created, used once, disposed + context lost — the HUD never holds a second live WebGL context).
- src/App.tsx — new always-visible `EarningsCard`: the player's real character render, server holdings (entitlement snapshot) and total fees earned (feesEarned snapshot), with a Share action that renders the card to a 1000x520 PNG from those same real figures, downloads it as `blockville-earnings.png`, and opens the X compose intent with a pre-filled draft tagging @blockville_ (never auto-posts; nothing stored in game state). The card sits above the activity log in one shared bottom-left column (`.bl-col`); the ActivityLog's PERSONAL tab now renders entry icon/detail. Activity-log hitboxes unchanged; expanded log height trimmed 45vh → 42vh to make room for the card above it.
- src/styles.css — `.bl-col`, `.earnings-*` styles built from the existing panel vocabulary; responsive widths follow the log's media queries.
- tests/fees-earnings.spec.mjs (new, in the npm test chain) — 5 in-process tests: a completed cycle produces an entry per recipient with amount, cycle id and timestamp; non-recipients get nothing; the lifetime total accumulates across cycles; a NEW distributor (restart) rebuilds lifetime totals from the persisted ledger; skipped cycles contribute nothing.
- tests/fees-card.spec.mjs (new, in the npm test chain) — 4 headless-Chrome CDP tests against the real server with shortened cycles (BV_CYCLE_MS=1500): the card is visible by default, in one bottom-left column above the log, with no overlap and the log's 16px/18px anchor preserved; holdings/fees figures match the server entitlement + feesEarned snapshots and the authoritative /api/treasury/cycles ledger; a REAL payout cycle (claim → build → shopPurchase) produces the PERSONAL entry with amount, cycle id and timestamp for the recipient while a bystander client receives none; Share produces a real PNG (magic checked) named blockville-earnings.png and opens the twitter.com/intent/tweet URL containing @blockville_, the real fees figure and an invitation, with no modal and no log mutation from the share itself.
- Verified: `npm test` 233 PASS / 0 FAIL (224 before + 9 new); `tsc --noEmit` clean; `npm run build` clean.
- Honest notes: (1) interim spec failures were all test-harness races against the 1.5s shortened cycles (stale queued snapshots, DOM reads racing cycle boundaries, payout entries landing inside "nothing pending" windows) — fixed in the specs by pairing reads with the authoritative ledger endpoint and excluding continuously-arriving payout entries from that count; no app change was made to satisfy a broken check. (2) The manual screenshot inspection of the card was attempted but the shell executor wedged before the capture could be re-run; the programmatic geometry/visibility/figures checks in fees-card.spec.mjs cover the same ground and all pass.
- Not changed: gameplay, economy values, world layout, payout/entitlement logic, production cycle parameters, existing panels, clickable hitboxes of untouched controls. No commits, pushes, deployments or real transactions.

## Chunk — Production-Readiness Cleanup — COMPLETE (2026-10-15)

Base version: blockville-fees-card.zip (current source of truth, inner folder
`blockville-A-lake-fish-dock`). Pre-launch scrub pass, three parts.

### Part 1 — dev tools and dev surfaces
- Inventory (grep of src/server/index.html + bundle): no DevPanel, no admin
  console, no token/block grant command exists in this codebase. Found and
  closed the production-reachable debug surfaces:
  - src/game/engine.ts — the `?sx&sz` spawn override and `?flip&camd` camera
    overrides are now inside `import.meta.env.DEV` blocks; production uses the
    exact same default spawn/camera composition (else branch, values identical).
  - src/game/engine.ts — the seven dev/test engine hooks (`teleport`,
    `devShowcase`, `devMeasure`, `devView`, `devNpcs`, `devRemotes`,
    `devPlotInfo`) moved from class methods into the constructor's DEV-gated
    block, so production builds compile them away entirely.
  - src/game/GameCanvas.tsx — the `window.__bv` debug bridge (already DEV-only)
    now calls those hooks through an explicit DEV-scoped cast.
  - Already gated, verified and left in place: `window.__bvState/__bvDispatch`
    and `?autoname` (import.meta.env.DEV), `POST /api/dev/demo-holdings`
    (BV_ALLOW_DEMO_HOLDINGS_SET), `BLOCKVILLE_DEV_TX_MODE` (loud startup log).
  - UI copy sweep (settings, tooltips, whitepaper, HUD): zero dev-tool mentions.
- Verified by grepping the PRODUCTION bundle (dist/assets): DevPanel,
  devShowcase, devView, devMeasure, devRemotes, devNpcs, devPlotInfo,
  teleport, showcase, __bv, autoname → 0 hits each. Remaining `flip`/`sx`
  hits are unrelated internals (three.js flipY, engine's own sx/sz fields,
  React's jsx=).

### Part 2 — dev amounts and seed data reset
- data/claimable-balances.json → {} (was a CardTester test balance of 2,771,039)
- data/treasury-state.json → all zeros (was 156,361 tokens / 4.488 SOL gas /
  36.352 pending buyback from dev runs)
- data/treasury-ledger.jsonl, treasury-cycles.jsonl, entitlements-ledger.jsonl
  → empty; data/upgrade-signatures.json → []
- Verified: a bare production start now serves `cycles: []`, tokenBalance 0,
  gasReserve 0, pendingBuyback 0, and the server writes nothing to data/ until
  real events occur (md5-stable start).
- Payout recipients: built ONLY from the server's plot store; NPC owners
  (named residents, "Resident X" sellers, Town Council) score 0 and are
  dropped unconditionally — covered by treasury-payout.spec. The demo-holdings
  seeding path only runs when BLOCKVILLE_MINT is unset (demo mode); in strict
  mode holdings come from public-RPC reads of verified wallets only.
- NOTE for deployment: .gitignore keeps `data/` out of git, so pushing this
  ZIP to GitHub will NOT reset the VPS's data/ directory. To start production
  clean, delete data/*.json* on the VPS once (or `git add -f data/` for this
  deploy). Also note `npm test` re-populates data/ locally — the ZIP ships
  clean, taken after the final suite run.

### Part 3 — balance and block accuracy
- Displayed wallet balance/blocks are read straight from the single reducer
  store (no cached copies); the store persists to localStorage on every change.
  Server-owned displays are server-fed: entitlement pushed after every claim,
  feesEarned replaced wholesale on welcome and after every cycle, treasury
  holdings re-read every 10s, tokenomics panel + whitepaper fetch
  /api/tokenomics (the single server config) every 10s.
- Fixed a real divergence path: the server's demo-mode `upgrade` handler
  silently ignored invalid requests while the client had already applied the
  level optimistically. The server now ALWAYS answers the sender with
  `upgradeRejected {reason:'invalid'}`, and the client reverts its level and
  demo SOL (existing upgradeRevert path; note text now distinguishes a server
  rejection from a failed on-chain verification). Server changes:
  server/index.mjs; client: src/game/net.ts, src/game/GameCanvas.tsx.
- Config consistency: server BUILD_COSTS ↔ tokenomics BUILD_BLOCKS were already
  cross-checked by tokenomics.spec; NEW cross-check pins the CLIENT's
  BUILDING_DEFS costs to the same BUILD_BLOCKS, so build UI, scoring,
  tokenomics panel and whitepaper cannot drift (all 9 types verified equal).
- Server-side rejection of client-claimed amounts: shop/furniture purchases
  are re-priced from the server's own tables (junk item IDs produce no entry —
  now asserted in the new round-trip spec); upgrade fees are always quoted by
  the server (UPGRADE_SOL); build progress is clamped to BUILD_COSTS; and the
  `walletDeposit` faucet (a client message claiming tokens/SOL) is now
  refused unless the operator explicitly sets BV_ALLOW_DEMO_DEPOSITS=1 —
  treasury-fees.spec sets it for its spawned server; production starts never
  do. The dev/demo route POST /api/dev/demo-holdings keeps its existing
  BV_ALLOW_DEMO_HOLDINGS_SET gate (404 without it — re-verified live).
- NEW tests/roundtrip.spec.mjs (in the npm test chain, tmp ledger paths so it
  never dirties data/): one live server, full economic round trip — claim,
  build with an over-claim (server clamps to BUILD_COSTS), upgrade (fee from
  the server table, ledgered once), invalid upgrade rejected TO the sender and
  the authoritative record unchanged as a fresh joiner sees it, shop purchase
  re-priced with a junk item ignored, a REAL payout cycle with exactly one
  recipient (the real player; bystander/NPC nothing; amount matches the cycle
  report), and a refreshed connection receiving the same feesEarned total,
  entitlement and plot record. All PASS.
- Honest notes: (1) in demo mode the client's spendable demo wallet is
  client-local by design (persisted localStorage); there is no server-side
  store for it, so "server owns the numbers" applies to everything the server
  tracks (plots, levels, fees, entitlement, payouts) — making the demo wallet
  itself server-owned would be an economy redesign and was NOT done here.
  (2) The client-side simulated fee drip / NPC reward ticker and the settings
  panel's "Simulated demo ledger" line are demo-mode gameplay visualization
  and were left untouched (labelled as simulated).
- Not changed: gameplay, economy values, world layout, payout/entitlement
  logic, production cycle parameters, starting-wallet amounts
  (DEMO_FUNDING), existing panels. No commits, pushes, deployments or real
  transactions.
- Verified: `npm test` exit 0 — 272 PASS / 0 FAIL across 31 specs (233 before
  + new round-trip + new config cross-check); `tsc --noEmit` clean;
  `npm run build` clean; production-bundle grep sweep clean.

## Chunk — Full Audit + Dry Run — COMPLETE (2026-10-15)

Base version: blockville-prod-scrub.zip (current source of truth).

Baseline: npm install clean; `npm run build` clean; `tsc --noEmit` clean;
production-bundle grep sweep still 0 hits for every dev-tool identifier.

Audit results per system (no changes unless noted):
- Tokenomics config: single source (server/tokenomics.mjs); all brief values
  present and pinned by tests. NEW: tokenomics.spec also pins the CLIENT's
  display-side mirrors (plotStakeCost = 20,000, solCosts = 0.1/0.25/0.5) so a
  drifted preview cannot lie about the backend values.
- Treasury pipeline: all seven ledger kinds verified live (fee_in, gas_reserved,
  gas_sweep, swap_out, tokens_in, shop_in, upgrade_in); slippage cap rolls over
  (`swap_rolled`); venue is mocked. FIXED (defect): cycle reports mis-attributed
  inflows by one window — arrivals during the previous window (shop purchases,
  fee drips) built the cycle's balance but the report showed shopIn/buyback
  0. New `cycleInflowsSince(prevBoundaryTs)` + the engine's persisted boundary
  timestamp fix the attribution; the admin view now shows what the balance is
  really built of.
- Payout engine: 20% of snapshot, P = (20+B)×U×G, round-DOWN per player,
  remainder retained, NPC exclusion, exactly-once crash replay — all verified
  live and by unit spec.
- Plot sync: FIXED (defect): plotOwners/gardenPlots were IN-MEMORY ONLY — every
  server restart (i.e. every deploy) wiped all claimed plots and paid-for
  construction while claimable fee balances survived on disk. Plots now
  snapshot to data/plots.json (BV_PLOTS_PATH override; change-detected saves on
  every mutation + interval + graceful shutdown; restore at boot with shape
  validation; Town Council seeding can no longer stomp a restored plot).
  House interiors (houseStates) remain session-state by design.
- Entitlement/revocation, upgrades (signature-verified, idempotent, dev mode
  env-gated), auth/character lock, HUD/whitepaper/Terms panels, holdings
  10s polling (same RPC source as payout snapshots), earnings card: audited,
  no defects found.
- Test isolation FIXED: specs that spawn servers now get FRESH tmp data paths
  injected by the harness (spec-set paths respected) — running the suite can no
  longer dirty the repo's production data/*.json* (it did: CardTester balances
  were back after this chunk's first run). treasury-fees/upgradepay-ws specs
  now read their redirected tmp ledgers.

Dry run (live servers, tiny/fake amounts, mock venue only — no real
transactions, no key material): 28/28 checks PASS — disabled mode (fee
detection + ledgering, ZERO on-chain events, status live=false), shop purchase
visibly raising the next cycle's distributable, round-down/remainder/NPC
exclusion across every cycle, earnings snapshot == ledger truth, hard SIGKILL
restart (claimable + plots + cycle reports survive; no duplicate cycle ids),
and live mode behind a mock RPC (verified-wallet claim enforced; gas sweep =
half at ≥0.5 SOL; mocked swap; buyback tokens credited; weighted payout =
floor(distributable × weight/total)).

Files changed: server/index.mjs (plot persistence + seeding guard),
server/treasury.mjs (cycleInflowsSince), server/distribute.mjs (since-ts
attribution + restart anchor), tests/harness.mjs (tmp-path injection),
tests/tokenomics.spec.mjs (client mirror pins), tests/treasury-fees.spec.mjs +
tests/upgradepay-ws.spec.mjs (tmp ledger redirect), tests/fees-card.spec.mjs
(wider flake window). No gameplay, economy, world or client rendering changes.

## Chunk — "Powered by ZeroTwo.ai" Billboard — COMPLETE (2026-10-15)

Base version: blockville-final-audit.zip (latest delivered, inner folder
`blockville-A-lake-fish-dock`, 244-equivalent PASS / 0 FAIL, audit-clean
treasury engine). This chunk adds the one cosmetic item requested for launch:
a large sponsor billboard behind the two stores. Nothing else was touched.

### What was changed

1. `src/stores/StoreBillboard.ts` (new file).
   - `makeStoreBillboard(colliders)` builds a large billboard centred behind
     the Blockville Store and Furniture Store at world (6.5, 0, -29) — clear
     of both rear walls (rears end near z-25.6) and of every plot (plots sit
     at z >= 10 on this side of town).
   - Board: two timber posts (8.4 tall) + framed panel 16.6 x 7.5 at centre
     y 6.7 — roughly twice the store roofline, reads "quite large" from the
     street. Timber frame/back/skirt use the shared `mat`/`box` helpers so
     lighting and shadows match the rest of town; posts get colliders.
   - Face: canvas texture (2048x896) — dark brand panel with the official
     ZeroTwo "02" logo mark (vector paths taken from zerotwo.ai) on the left
     and "POWERED BY" + "ZeroTwo.ai" (accent-coloured ".ai") on the right.
     The wordmark is measured and fit-to-width so it can never overflow the
     panel regardless of platform font metrics. Logo lockup was verified by
     rendering the extracted paths and a full-layout mock before shipping.
   - Cosmetic only: no interactables, no prompt targets, no gameplay hooks.

2. `src/game/engine.ts`.
   - Import `makeStoreBillboard`; added `this.scene.add(makeStoreBillboard(this.objColliders))`
     immediately after the Furniture Store add (line ~440). Two-line change.

### Verification

- `npx tsc --noEmit`: clean (0 errors).
- `npm run build`: clean production build (same chunk-size warning as baseline,
  pre-existing).
- `npm test`: full suite re-run after the change — every spec group reports
  ALL PASS; 232 individual PASS lines, 0 FAIL lines in the run log. (Process
  exit code was not captured by the background log; the verdict rests on the
  per-spec ALL PASS markers and zero FAIL lines.)
- No gameplay, economy, world-layout, server, or treasury changes. Working
  systems untouched.

## 2026-10-15 — Chunk: real treasury paths (Items 1–3 of the pre-launch brief)

Base version: the billboard ZIP above (blockville-final-audit base + sponsor
billboard). This chunk wires the three live treasury paths while keeping every
existing guard, pipeline, and mock-for-tests intact.

### What was changed

1. `server/jupiter.mjs` (new) — real swap venue client: Jupiter v6 public
   aggregator (`quote-api.jup.ag/v6`, no API key, no account). Enforces the
   hard slippage cap vs spot and `minOutTokensPerSol` BEFORE signing; a breach
   throws VenueError so `runBuyback` rolls the FULL amount into the next cycle
   (`swap_rolled`). Double-spend guard via a persisted state file: intent
   before send, signature persisted on return, crash recovery by signature
   check / recent lamport-delta scan. Env: `BV_SWAP_VENUE = auto | jupiter |
   mock` (auto → jupiter only when the treasury runs live), `BV_JUPITER_API_URL`
   override for tests.
2. `server/fees.mjs` (new) — real fee intake via public-RPC polling of the
   treasury wallet: `getSignaturesForAddress` with a persisted cursor, lamport
   delta per signature, positive deltas feed `treasury.recordFees` (80/20
   split, `fee_in` ledger) then the gas-sweep check. Idempotent by signature;
   cursor persists after every processed transfer; RPC failure → backoff, no
   cursor advance, no loss. `BV_FEE_SIM_SOL` stays default-off for dev.
3. `server/distribute.mjs` — `claim()` is now async and executes a real SPL
   transfer through the injected `sender` (server/index.mjs resolves the
   wallet from server-side Ed25519 auth records, never client input). Intent
   persisted before send; signature persisted on send; resolution is
   idempotent by signature; missing recipient ATA is created and funded from
   the gas reserve (~0.002 SOL rent, ledgered as `payout_ata_created`); a
   failure leaves the claimable balance intact. Ledger: `payout_transfer`.
   Claimable accrual, round-down, cycle replay, and NPC exclusion unchanged.
4. `server/index.mjs` — wires the fee poller, the venue client, and the payout
   sender; awaits `distributor.claim(...)`.
5. `src/game/net.ts`, `src/game/GameCanvas.tsx`, `src/App.tsx` — client claim
   button on the earnings card; claim result wired through the registered net
   client (unregistered on cleanup); `claimFees` import.
6. Tests: new HTTP-boundary venue tests (success records `swap_out`/
   `tokens_in`; cap breach rolls over; malformed quote rejected; retry without
   double-spend), fee-intake tests (two arrivals ledgered once; restart
   reprocesses nothing; RPC down → no loss; sim drip still works), and
   payout tests (exact amount once; replay transfers nothing; ATA creation;
   retriable failure). `tests/treasury-payout.spec.mjs` kill-switch test
   updated to await the now-async `claim()` (test-side staleness only; the
   `not_live` refusal itself was correct).

### Verification

- `npx tsc --noEmit`: clean. `npm run build`: clean (pre-existing chunk-size
  warning only). Production bundle grep: no dev identifiers.
- `npm test`: every spec group ALL PASS, 0 FAIL (full suite re-run after the
  test fix; process exit code 0).
- Not executed this session: real-mainnet anything (per brief), and the
  28-check end-to-end dry run was run in mocked/dev mode only.

## Chunk — Dynamic live price-based swap guard (2026-10-15)

The buyback now tracks the LIVE market price automatically at swap time; the
operator never hand-updates a price constant again.

### What changed

1. `server/swap-guard.mjs` (NEW) — one shared guard used by BOTH venues so
   the mock path in tests exercises the real logic:
   - startup gate: a fresh venue's first successful live quote only sets the
     baseline; NO swap executes until a valid quote has been observed
     (refusal detail `no_baseline`);
   - sanity floor: a quote deviating more than `SWAP.staleQuoteMaxDeviation`
     (default 10x either way) from the previous successful swap's spot is a
     broken feed, refused as `stale_quote` (`deviation`); garbage never
     becomes the baseline;
   - `minOut = spotOut × (1 − SWAP.slippageBps/10_000)` computed from the
     live quote for the exact SOL amount — no stored price anywhere;
   - delivered output below minOut refused (`slippage_cap`); a successful
     swap's spot becomes the new baseline.
2. `server/jupiter.mjs` — the small reference-trade spot is GONE; the venue
   fetches the live quote for the exact amount, runs the shared guard, and
   passes `slippageBps` to Jupiter so execution below minOut fails on-chain.
   Quote-phase failures (unreachable venue, malformed data, decimals,
   deviation, startup gate) surface as `stale_quote`; execution-phase
   failures keep their own reasons. Persisted swap intent now carries
   `minOut`. Static `minOutTokensPerSol`/`maxSlippagePct` opts removed.
3. `server/tokenomics.mjs` — `SWAP.minOutTokensPerSol` REMOVED. Added
   `SWAP.slippageBps` (env `BV_SLIPPAGE_BPS`, default 300 = 3%), `SWAP.
   staleQuoteMaxDeviation` (env `BV_SWAP_QUOTE_MAX_DEVIATION`, default 10),
   `SWAP.staleQuoteLedgerKind = 'swap_stale_quote'`. Existing hard cap
   `maxSlippagePct` (3%) unchanged.
4. `server/treasury.mjs` — mock venue rebuilt on the shared guard
   (configurable price; `opts.executionPricePerSol` simulates a price move
   between quote and execution; `opts.unreachable` simulates a dead feed).
   `runBuyback` ledgers data-feed refusals as `swap_stale_quote` (distinct
   from `swap_rolled`), maps venue-enforced `slippage_cap`/`min_out` to
   their true reasons, and computes the dynamic minOut from the reported
   live spot as a final re-check.
5. `server/index.mjs` — no longer passes the removed static constants to the
   Jupiter venue.
6. Tests — NEW `tests/swap-guard.spec.mjs` (8 checks, fully offline via an
   injected fetch: constant removal, exact-amount quote + minOut math,
   quote→execution price move → swap_rolled, unreachable → swap_stale_quote
   with fees intact, startup gate on BOTH paths, 10x-deviation floor both
   directions + recovery, mock/real guard parity, engine boundary).
   Updated `treasury-fees.spec.mjs` (warm-up for the startup gate; min_out
   test rewritten for the dynamic formula) and `treasury-report.spec.mjs`
   (warm-up; plus a PRE-EXISTING defect fixed: the console-output test
   callback was missing `async` and the file could not parse at all).

### Verification

- `node tests/swap-guard.spec.mjs`: 8/8 PASS.
- `npm test`: full chain, process exit 0, every spec ALL PASS, 0 FAIL.
- `npm run build`: clean (pre-existing chunk-size warning only).
- Grep proof: `minOutTokensPerSol` exists nowhere except comments/tests
  asserting its removal; no numeric price constant remains in the swap path.
- Not executed: real transactions, live Jupiter/RPC calls (per brief).

## Chunk: remote finished builds, cave stairs + minecart, lake sign, share card
- Item 1 root cause: the server handled `claim` asynchronously (entitlement gate) but `build` synchronously, so a one-step/preset build sent right behind its claim hit "no plot record" and was dropped; the client de-dupes build sends so it never retried, leaving the record at progress 0 / not done (welcome + live relay both showed "building"). Fix: build waits for the sender's in-flight claim (`rec.claimPending`); on (re)welcome the owner's client re-sends a local build state that is ahead of the server record. New spec tests/remote-build-sync.spec.mjs (5 cases + race; race + join-after-completion fail without the fix).
- Item 2: WorldPortal old landing/steps/rocks removed (they sat inside the leaned group); rebuilt as terrain-sampled axis-aligned stairs (8 x 0.37 rise, 1.0 run) + landing, plus diamond minecart.
- Item 3: lake sign block removed from WorldTrailDetail.ts (it had no collision/waypoint hooks).
- Item 4: Claim button, CLAIMABLE NOW row, claim notes, share-image claim wording and client claim wiring removed; server endpoint and accounting untouched.

## Chunk: wallet-gated economy with optional guest mode
- Finding: the client had NO wallet sign-in at all (WalletPanel was an unused read-only Phantom link; nothing called /api/auth/nonce, /api/auth/verify or net.setSession). In live mode nobody could ever hold a verified wallet. Added `src/game/access.ts`: Phantom `connect` + `signMessage` against the EXISTING nonce/verify endpoints (no new library; local base58 encoder), result kept in sessionStorage.
- Entry flow (`src/App.tsx` EntryGate): Connect Wallet / Continue as Guest / ✕ skip. A "Play demo" button appears ONLY when /api/health reports `liveEconomy:false` (dev/demo servers). Dev-only `?autoname=` now implies demo access (stripped from prod builds).
- Server (`server/index.mjs`): `join` accepts `guest:true` (only when no verified wallet bound); the server assigns a guest session token + `guest:<id>` lock key (shares the one-character lock/grace/re-adopt logic with wallets; the `guest:` prefix cannot equal a base58 address). Every economic message (claim, feesClaim, build, upgrade, upgradePay, shopPurchase, furniturePurchase, gardenPlace/Unplace, walletDeposit, list, unlist, houseState, bjBet/Hit/Stand) is refused with `economyDenied {reason:'connect_wallet'}` BEFORE any handler runs, for guests AND (live mode) any connection without a session-verified wallet. Guests get no entitlement/fees snapshot, no demo-holdings seed, and are skipped by name-matched pushes (entitlement, payout feed) so a guest named like a resident learns nothing.
- Welcome now carries `{wallet, guest, guestSession}`; the client signs the player out to the entry choice if the server does not recognise its wallet session.
- Guest → wallet mid-session (simplest option): connect from the guest wall, store the verified session, reload; the guest connection closes (character leaves), the same name re-joins as the wallet identity. Appearance is not persisted by the existing code, so the look resets to defaults.
- Payout recipient: `handlePayoutClaim` passes `rec.wallet` (set only from a verified session token); distributor refuses `no_verified_wallet` otherwise. A guest has no wallet ⇒ no payout path.
- Tests: tests/guest-gate.spec.mjs (7 protocol cases incl. live-economy server) and tests/guest-ui.spec.mjs (browser); auth-verify's unverified-claim case now expects the explicit `economyDenied`.
