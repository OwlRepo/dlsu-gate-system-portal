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
  return "";
}
