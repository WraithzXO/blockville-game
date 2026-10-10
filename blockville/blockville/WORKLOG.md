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
