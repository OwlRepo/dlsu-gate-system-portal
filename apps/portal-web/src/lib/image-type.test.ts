import { describe, expect, it } from "vitest";
import { getImageType, toDataUrl } from "./image-type";

/**
 * BioStar returns profile photos as base64. The gate dashboards wrap that in a
 * `data:<mime>;base64,` URL, so the mime sniff has to recognise what BioStar
 * actually sends.
 */
describe("getImageType", () => {
  // A real base64 JPEG begins "/9j/4AAQSkZJRg..." — note the leading slash.
  // Suprema's own docs show the photo value starting "/9j/4AAQSKZJRgABAQEA".
  // The previous implementation tested for "9j/4AAQSkZJRgABAQAAAQABAAD/",
  // without that slash, so the branch was unreachable and every JPEG was
  // labelled image/png.
  it("recognises a base64 JPEG, leading slash and all", () => {
    expect(getImageType("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA")).toBe(
      "image/jpeg",
    );
  });

  it("recognises the exact prefix from Suprema's documentation", () => {
    expect(getImageType("/9j/4AAQSKZJRgABAQEASABIAAD")).toBe("image/jpeg");
  });

  it("recognises a base64 PNG", () => {
    expect(getImageType("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB")).toBe("image/png");
  });

  it("recognises a base64 GIF", () => {
    expect(getImageType("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAA")).toBe(
      "image/gif",
    );
  });

  it("falls back to PNG for anything it cannot identify", () => {
    expect(getImageType("bm90LWFuLWltYWdl")).toBe("image/png");
  });

  it("handles an empty or missing value without throwing", () => {
    expect(getImageType("")).toBe("image/png");
    expect(getImageType(undefined)).toBe("image/png");
  });
});

describe("toDataUrl", () => {
  it("builds a data URL with the sniffed mime type", () => {
    expect(toDataUrl("/9j/4AAQSkZJRgABAQ")).toBe(
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ",
    );
  });

  it("returns undefined when there is no image, so callers can fall back", () => {
    expect(toDataUrl(undefined)).toBeUndefined();
    expect(toDataUrl("")).toBeUndefined();
  });

  it("passes through a value that is already a data URL", () => {
    const already = "data:image/png;base64,iVBORw0KGgo";
    expect(toDataUrl(already)).toBe(already);
  });
});
