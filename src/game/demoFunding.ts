// TEMPORARY demo/testing funding. Remove, or set enabled to false, before production.
// Applies only to the in-app demo/mock wallet. It sends no SOL or tokens, changes no
// live wallet, and does not touch real transaction validation.
export const DEMO_FUNDING = {
  enabled: true,
  balance: 150_000, // $BLOCKVILLE
  blocks: 1_000,
  sol: 3,
} as const;
