// Shared BioStar WebSocket event normalization, used by both gate-scan
// ingestion paths (dashboard.tsx and TurnstileDashboard.tsx) so raw,
// untyped WS payload fields are turned into safe strings the same way in
// both places instead of being passed through as `any`.

export function normalizeDeviceId(rawDeviceId: unknown): string {
  if (typeof rawDeviceId === "string" || typeof rawDeviceId === "number") {
    return String(rawDeviceId).trim();
  }

  if (rawDeviceId && typeof rawDeviceId === "object") {
    const deviceObject = rawDeviceId as { id?: unknown; device_id?: unknown };
    const nestedId = deviceObject.device_id ?? deviceObject.id;
    if (typeof nestedId === "string" || typeof nestedId === "number") {
      return String(nestedId).trim();
    }
  }

  return "";
}

export function normalizeUserId(rawUserId: unknown): string {
  if (typeof rawUserId === "string" || typeof rawUserId === "number") {
    return String(rawUserId).trim();
  }

  // Real BioStar wsapi events send user_id as a nested object
  // ({user_id, name, ...}, or only {photo_exists} when the card maps to no
  // user). Missing this branch made the ingestion guard drop every real tap.
  if (rawUserId && typeof rawUserId === "object") {
    const userObject = rawUserId as { user_id?: unknown; id?: unknown };
    const nestedId = userObject.user_id ?? userObject.id;
    if (typeof nestedId === "string" || typeof nestedId === "number") {
      return String(nestedId).trim();
    }
  }

  return "";
}

// Human-readable device label for tiles and reports: the real gate name from
// the wsapi payload when present, otherwise "Device <id>".
export function deviceDisplayName(
  rawDeviceId: unknown,
  normalizedId: string,
): string {
  if (rawDeviceId && typeof rawDeviceId === "object") {
    const name = (rawDeviceId as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      return name.trim();
    }
  }
  return `Device ${normalizedId}`;
}
