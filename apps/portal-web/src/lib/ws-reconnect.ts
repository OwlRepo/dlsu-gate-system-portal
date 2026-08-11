// Backoff schedule for re-establishing the BioStar realtime WebSocket after
// it drops (BioStar keeps one session per account, so another login — e.g. an
// admin opening /dashboard — kills the operator page's session). Exponential
// from 2s, capped at 30s, so a dead BioStar isn't hammered but a kicked
// session recovers within seconds.
export const BASE_RECONNECT_DELAY_MS = 2_000;
export const MAX_RECONNECT_DELAY_MS = 30_000;

export function reconnectDelayMs(attempt: number): number {
  const exponent = Math.min(Math.max(attempt, 0), 10);
  return Math.min(
    MAX_RECONNECT_DELAY_MS,
    BASE_RECONNECT_DELAY_MS * 2 ** exponent,
  );
}
