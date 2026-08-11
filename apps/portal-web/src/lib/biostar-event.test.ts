import { describe, expect, it } from "vitest";

import {
  deviceDisplayName,
  normalizeDeviceId,
  normalizeUserId,
} from "@/lib/biostar-event";

// Real BioStar 2 wsapi events carry user_id and device_id as nested objects
// (per Suprema docs: device_id = {id, name}; user_id = {user_id, name, ...} or
// just {photo_exists} when the card maps to no user). The string/number forms
// are kept for tolerance with tests and any simplified relays.
describe("normalizeUserId", () => {
  it("extracts user_id from the real object-shaped payload", () => {
    expect(normalizeUserId({ user_id: "10008", name: "Juan" })).toBe("10008");
  });

  it("falls back to id when the object has no user_id member", () => {
    expect(normalizeUserId({ id: 7 })).toBe("7");
  });

  it("still accepts plain string and number", () => {
    expect(normalizeUserId(" 10008 ")).toBe("10008");
    expect(normalizeUserId(10008)).toBe("10008");
  });

  it("returns empty for a card with no mapped user (photo_exists-only object)", () => {
    expect(normalizeUserId({ photo_exists: "false" })).toBe("");
  });

  it("returns empty for junk", () => {
    expect(normalizeUserId(null)).toBe("");
    expect(normalizeUserId(undefined)).toBe("");
    expect(normalizeUserId({})).toBe("");
  });
});

describe("normalizeDeviceId", () => {
  it("extracts id from the real object-shaped payload", () => {
    expect(normalizeDeviceId({ id: "939271697", name: "BioStation A2" })).toBe(
      "939271697",
    );
  });

  it("still accepts plain string and number", () => {
    expect(normalizeDeviceId("541")).toBe("541");
    expect(normalizeDeviceId(541)).toBe("541");
  });
});

describe("deviceDisplayName", () => {
  it("uses the real gate name from the object payload", () => {
    expect(
      deviceDisplayName({ id: "541", name: "Gate 1 - South Entrance" }, "541"),
    ).toBe("Gate 1 - South Entrance");
  });

  it("falls back to Device <id> when no name is present", () => {
    expect(deviceDisplayName({ id: "541" }, "541")).toBe("Device 541");
    expect(deviceDisplayName("541", "541")).toBe("Device 541");
  });

  it("ignores blank names", () => {
    expect(deviceDisplayName({ id: "541", name: "  " }, "541")).toBe(
      "Device 541",
    );
  });
});
