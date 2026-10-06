# BLOCKVILLE

A lightweight block-based town game built with React + Three.js (Vite, TypeScript).

**Core loop:** Stake $BLOCKVILLE (demo mode) -> receive blocks (scaled by how much you stake) -> walk around as your customised resident -> claim a plot -> build your building block by block -> NPCs walk into town and visit it with activity chat bubbles -> occasional fee-share rewards tick your balance -> upgrade buildings (1.5x cost per level, higher fee share) -> the town grows.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Then open http://localhost:3000 in your browser.

Other commands:

```bash
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build
```

## Notes

- **Demo vs real wallet:** the game runs in demo mode by default. The "Connect wallet" tab is an honest placeholder — real staking / on-chain functionality is not wired up yet, and the UI says so rather than faking transactions.
- All gameplay numbers (stake minimum, starter blocks, building costs, NPC limits, reward chances) live in `src/game/config.ts` for easy tuning.
- **Stake scaling:** every 20,000 staked grants 120 blocks and unlocks one block of land (up to 5). Staking more at any time pays out the difference immediately.
- **Upgrades:** click a finished building (or press E next to it) to inspect and upgrade it. Level 2 costs 1.5x the build cost, level 3 costs 2.25x. Each level multiplies your share of that building's fee rewards (x1.0 / x1.5 / x2.0) and visually grows the building.
- **Controls:** WASD / arrow keys to walk, E to interact with what you're standing near, mouse drag to orbit, scroll to zoom.
- Game state is session-only (resets on reload). Persistence and real rewards are planned additions.
