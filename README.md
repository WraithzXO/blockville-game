# BLOCKVILLE

A lightweight block-based town game built with React + Three.js (Vite, TypeScript).

**Core loop:** Stake 20,000 $BLOCKVILLE (demo mode) -> receive starter blocks -> claim a plot -> build your building click by click -> NPCs walk into town and visit it with activity chat bubbles -> occasional fee-share rewards tick your balance -> the town grows.

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
- Game state is session-only (resets on reload). Persistence and real rewards are planned additions.
