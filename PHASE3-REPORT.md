# BLOCKVILLE — PHASE 3 FINAL REPORT: VISUAL DESIGN & POLISH

All eight areas covered in six verified chunks. One ZIP per chunk was delivered
after verification; the final state is `blockville-phase3-complete.zip`.

## What changed

**Chunk 1 — Lake & mountains (Item 2, partial Item 3)**
- Mountains: 9x6 segment cones, extra noise octave, rock-striation banding,
  sun/shade facet tinting; haze reduced and recoloured lavender → cool blue-grey.
- Lake: water colour follows true radial distance (was ring-index, which pinched
  at shoreline bulges); softer teal rim, deeper blue; subtle continuous ripple
  (±0.05, inside the walker's water-safety margin).
- Shore: wet-sand band above the waterline, foam ring, sparse reeds/rocks/lily
  pads; trail and dock approaches kept clear.

**Chunk 2 — Terrain & props (Item 4)**
- Measured root cause: props were planted on the analytic `terrainH` while the
  visible ground is the triangulated hills mesh — 1,226 props and 945 decals
  floated (worst +2.08), 61 town props overlapped the z=-36 street.
- All prop placement and the trail now sample `meshH` (the exact rendered
  surface). North grove moved so trunks clear the sidewalk; crowns still overhang.
  Post-fix audit: 0 floaters, 0 sunk, 0 in water, 0 on trail, 0 town conflicts.

**Chunk 3 — Mountain close-range (Item 3)**
- Per-mountain silhouettes vary (1-3 randomised shoulders); snow caps key off
  absolute height (killed the mid-flank snow wedge); cone feet lerp to meadow
  tone (killed the hard skirt); noise dents clamped non-negative.

**Chunk 4a — Characters & NPCs (Item 5)**
- Name tags raised above heads/hats (shared `CHARACTER_TAG_Y`, verified in-game);
  NPC speech bubbles above the tags.
- NPC arm swing added to the walk cycle and eased to rest when stopping/sitting.
- Sitting height dropped ~0.44 so sitters rest on bench seats.

**Chunk 4b — Buildings & interiors (Items 1, 6)**
- In-engine probe captured store fronts, both shop sides, house exterior and
  interior. Exteriors audited clean (no floating/clipping/broken signage).
- Interior: harsh near-black ceiling lid → warm mid-tone; two overlapping point
  lights blowing a floor hotspot → softened and raised (60/50 → 34/28).
- Furniture verified seated flat, no clipping.

**Chunk 5 — Environment & lighting (Item 7)**
- Probed plaza + plots: lighting, shadows, grass and flower restraint already in
  good shape; the confirmed defect was cloud shape. Pancake-stack clouds with a
  chopped-flat base slab replaced by rounded crowns with an under-puff;
  emissive 0.55 → 0.38 so the sun models them. Same 7 clouds, no perf change.

**Chunk 6 — UI polish (Item 8)**
- Confirmed defect: below 720px the top-bar pills ran off-screen (measured right
  edge 551px at 420px viewport; Settings unreachable). Top bar now stacks and
  wraps; verified no overflow at 720x560 and 420x760; desktop unchanged.
- Swept name gate, HUD, settings, bug form, customise, store, market, treasury:
  no other confirmed defects; nothing changed without one.

## Items not touched (and why)

- **Item 1 building-design variation** beyond verified defects: exteriors
  audited clean in-engine; further redesign risks the "no redesigns" rule and
  was deferred. One deferred finding: the shop's rear reads as a generic house
  gable — cosmetic, needs your go-ahead before any reshaping.
- **South-row buildings render smaller** (Phase 1 Chunk 3 consequence): scaling
  was the only fix that cleared the back street without rearranging the town.
  Widening row spacing is a layout change for you to call.

## Verification (final state)

- `npm test`: 99 PASS / 0 FAIL (7 specs incl. terrain, placement, props, market,
  activity log, browser spec with two real multiplayer sessions).
- `tsc --noEmit` clean; `vite build` clean.
- In-engine screenshot probes reviewed for every chunk (lake, mountains, props,
  interiors, sky, UI at three viewports).
- Tooling hardened during the phase: no leaked dev servers or Chrome profiles
  (prior ENOSPC/zombie root causes eliminated), so verification cannot silently
  degrade.
- Two-session multiplayer verified at browser level (Phase 2 Chunk 5) and
  protocol level (Phase 1).

## Unresolved / needs you

1. Shop rear gable redesign — deferred pending your approval.
2. South-row building scale vs row spacing — your call.
3. Bug-report forwarding still needs `BUG_REPORT_WEBHOOK_URL` at server start
   (carried over from Phase 2; no destination invented).
