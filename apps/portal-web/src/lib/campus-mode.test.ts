import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("campus mode", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns DASMA mode for DASMA campus", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "DASMA");
    const { getCampusMode } = await import("@/lib/campus-mode");
    expect(getCampusMode()).toBe("DASMA");
  });

  it("returns MTL mode for MAIN/TAFT/LAGUNA", async () => {
    for (const campus of ["MAIN", "TAFT", "LAGUNA"]) {
      vi.stubEnv("NEXT_PUBLIC_CAMPUS", campus);
      const { getCampusMode } = await import("@/lib/campus-mode");
      expect(getCampusMode()).toBe("MTL");
      vi.resetModules();
    }
  });

  it("falls back to DASMA and logs warning for unknown campus in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "UNKNOWN");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getCampusMode } = await import("@/lib/campus-mode");

    expect(getCampusMode()).toBe("DASMA");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("does not warn in production for unknown campus", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "UNKNOWN");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getCampusMode } = await import("@/lib/campus-mode");

    expect(getCampusMode()).toBe("DASMA");
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
