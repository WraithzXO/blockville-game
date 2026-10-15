import { CONFIG } from './config';

// NPC chat-bubble visibility with hysteresis: a bubble appears inside
// bubbleShowRange and stays until the resident is beyond bubbleHideRange,
// so it never flickers while the player hovers near the threshold.
export function nextBubbleNear(wasNear: boolean, dist: number): boolean {
  if (wasNear) return dist <= CONFIG.bubbleHideRange;
  return dist < CONFIG.bubbleShowRange;
}
