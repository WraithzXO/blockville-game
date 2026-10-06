# BLOCKVILLE

A lightweight block-based town game built with React + Three.js (Vite, TypeScript).

**Core loop:** Stake 20,000 $BLOCKVILLE (demo mode) -> receive starter blocks -> walk to a plot -> claim a building -> construct it block by block -> NPCs walk into town and visit it with activity chat bubbles -> occasional fee-share rewards tick your balance -> the town grows.

## Controls

- **WASD / arrow keys** — walk your builder around town
- **E** — interact with what you're standing near (claim a plot, place blocks, open the store)
- **Mouse drag / wheel** — orbit and zoom the camera (it follows your character)
- Clicking a plot/site also works, but only when you're close — walk up to things

## Preset vs custom buildings

When claiming a plot, pick a building type (Casino, Diamond Mine, Shop, Bank) and then:

- **Preset blueprint** — the classic design at its base block cost, standard fee share.
- **Build it your way** — commit any number of blocks above the base cost and pick a colour tint.
  Every extra block makes the building physically bigger and raises your share of town fees
  (shown as a multiplier, capped at 3x). Bigger buildings also attract proportionally more NPC visitors.

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
