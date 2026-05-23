export const isMockMode = (): boolean =>
  String(process.env.NEXT_PUBLIC_MOCK_MODE ?? "")
    .trim()
    .toLowerCase() === "true";
