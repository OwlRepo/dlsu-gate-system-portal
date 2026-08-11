import { describe, expect, it } from "vitest";

import {
  BASE_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  reconnectDelayMs,
} from "@/lib/ws-reconnect";

describe("reconnectDelayMs", () => {
  it("starts at the base delay and doubles per attempt", () => {
    expect(reconnectDelayMs(0)).toBe(BASE_RECONNECT_DELAY_MS);
    expect(reconnectDelayMs(1)).toBe(BASE_RECONNECT_DELAY_MS * 2);
    expect(reconnectDelayMs(2)).toBe(BASE_RECONNECT_DELAY_MS * 4);
  });

  it("caps at the max delay", () => {
    expect(reconnectDelayMs(4)).toBe(MAX_RECONNECT_DELAY_MS);
    expect(reconnectDelayMs(50)).toBe(MAX_RECONNECT_DELAY_MS);
  });

  it("treats negative attempts as the first attempt", () => {
    expect(reconnectDelayMs(-3)).toBe(BASE_RECONNECT_DELAY_MS);
  });
});
