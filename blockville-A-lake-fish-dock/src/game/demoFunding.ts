// Demo-mode starting wallet (the game's starting kit while the economy runs
// in demo mode). It applies only to the in-app demo/mock wallet: it sends no
// SOL or tokens, changes no live wallet, and does not touch real transaction
// validation. Real-money balances are server-verified holdings, never this.
export const DEMO_FUNDING = {
  enabled: true,
  balance: 150_000, // $BLOCKVILLE
  blocks: 1_000,
  sol: 3,
} as const;
