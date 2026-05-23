export type CampusMode = "DASMA" | "MTL";

const MTL_CAMPUSES = new Set(["MAIN", "TAFT", "LAGUNA"]);
const KNOWN_CAMPUSES = new Set(["DASMA", ...MTL_CAMPUSES]);

let hasWarnedInvalidCampus = false;

const getRawCampus = (): string =>
  String(process.env.NEXT_PUBLIC_CAMPUS ?? "")
    .trim()
    .toUpperCase();

const warnInvalidCampus = (rawCampus: string) => {
  if (hasWarnedInvalidCampus) {
    return;
  }

  if (typeof window === "undefined" || process.env.NODE_ENV === "production") {
    return;
  }

  if (KNOWN_CAMPUSES.has(rawCampus)) {
    return;
  }

  hasWarnedInvalidCampus = true;
  console.warn(
    `[CampusMode] NEXT_PUBLIC_CAMPUS is "${rawCampus || "(empty)"}". ` +
      "Expected one of DASMA, MAIN, TAFT, LAGUNA. Falling back to DASMA mode."
  );
};

export const getCampusMode = (): CampusMode => {
  const rawCampus = getRawCampus();
  warnInvalidCampus(rawCampus);

  if (MTL_CAMPUSES.has(rawCampus)) {
    return "MTL";
  }

  return "DASMA";
};

export const isMtlMode = (): boolean => getCampusMode() === "MTL";
