/**
 * Turns the base64 profile photo BioStar returns into something an <img> can
 * render.
 *
 * This lived as three byte-identical copies in live-data-table.tsx,
 * EntriesLog.tsx and TurnstileGrid.tsx, each carrying the same bug: the JPEG
 * test looked for "9j/4AAQSkZJRgABAQAAAQABAAD/" but base64-encoded JPEG starts
 * "/9j/4AAQSkZJRg…" with a leading slash, so the branch was unreachable and
 * every JPEG was labelled image/png. Suprema's own documentation shows the
 * photo value beginning "/9j/4AAQSKZJRgABAQEA", confirming the slash.
 */

/** Base64 prefixes for the formats a BioStar profile photo can arrive as. */
const BASE64_SIGNATURES: ReadonlyArray<{ prefix: string; mime: string }> = [
  // "/9j/" is the base64 encoding of the JPEG SOI marker (FF D8 FF).
  { prefix: "/9j/", mime: "image/jpeg" },
  { prefix: "iVBORw0KGgo", mime: "image/png" },
  { prefix: "R0lGODlh", mime: "image/gif" },
];

/**
 * Best-effort mime type for a base64 image. Defaults to image/png when the
 * value is missing or unrecognised, matching the previous behaviour.
 */
export function getImageType(base64?: string | null): string {
  if (!base64) return "image/png";
  const match = BASE64_SIGNATURES.find((sig) => base64.startsWith(sig.prefix));
  return match?.mime ?? "image/png";
}

/**
 * Wraps a base64 image in a data URL, or returns undefined when there is no
 * image so the caller can fall back to a placeholder. A value that is already
 * a data URL is passed through untouched.
 */
export function toDataUrl(base64?: string | null): string | undefined {
  if (!base64) return undefined;
  if (base64.startsWith("data:")) return base64;
  return `data:${getImageType(base64)};base64,${base64}`;
}
