# BLOCKVILLE

A lightweight block-based town game built with React + Three.js (Vite, TypeScript).

**Core loop:** Stake 20,000 $BLOCKVILLE (demo mode) -> receive starter blocks -> claim a plot -> build your building click by click -> NPCs walk into town and visit it with activity chat bubbles -> occasional fee-share rewards tick your balance -> the town grows.

**Land supply & marketplace:** Wave 1 contains **100 plots**. Residents claim free land over time, list their own plots for any price, and buy listings — occasionally yours. Once all 100 plots are claimed the town is sold out and the 🏷️ Market is the only way to get land until the next wave is added (see `PLOT_POSITIONS` in `src/game/config.ts`). Marketplace purchases do not use your staked claim allowance. The market is a demo simulation — no real trading.

## Run locally

Requirements: Node.js 18+ and npm.

```bash
npm install
npm run dev

Optional backend scaffold (wallet auth + stake ledger endpoints):

npm run server
```

Then open http://localhost:3000 in your browser.

Other commands:

```bash
npm run build     # type-check + production build to dist/
npm run preview   # serve the production build
```

## Notes

- **Demo vs real wallet:** the game runs in demo mode by default. The "Connect wallet" tab is an honest placeholder — real staking / on-chain functionality is not wired up yet, and the UI says so rather than faking transactions.
- All gameplay numbers (stake minimum, starter blocks, building costs, NPC limits, reward chances, market simulation rates, wave size) live in `src/game/config.ts` for easy tuning.
- Game state is session-only (resets on reload). Persistence and real rewards are planned additions.
