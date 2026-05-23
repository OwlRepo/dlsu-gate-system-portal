import { checkExpiry } from "@/lib/checkExpiry";
import { isMtlMode } from "@/lib/campus-mode";

export type AccessStatusCode = "GREEN" | "YELLOW" | "RED";

export interface AccessStatusInput {
  disabled?: string;
  expiryDate?: string;
  remarks?: string | null;
  eventTypeId?: string;
  event?: string;
}

export interface AccessStatusResult {
  code: AccessStatusCode;
  label: "Allowed" | "Allowed with remarks" | "Not Allowed";
  showRemarks: boolean;
}

export const getAccessStatus = (
  scan: AccessStatusInput,
  mode: "DASMA" | "MTL" = isMtlMode() ? "MTL" : "DASMA"
): AccessStatusResult => {
  const isExpired = checkExpiry(scan.expiryDate);
  const isDisabled = scan.disabled === "true";
  const eventValue = scan.eventTypeId ?? scan.event ?? "";
  const isApb = eventValue.includes("APB");
  const hasRemarks = scan.remarks !== "No remarks" && scan.remarks !== null;

  if (isExpired || isDisabled || isApb) {
    return {
      code: "RED",
      label: "Not Allowed",
      showRemarks: mode === "DASMA",
    };
  }

  if (mode === "MTL") {
    return {
      code: "GREEN",
      label: "Allowed",
      showRemarks: false,
    };
  }

  if (hasRemarks) {
    return {
      code: "YELLOW",
      label: "Allowed with remarks",
      showRemarks: true,
    };
  }

  return {
    code: "GREEN",
    label: "Allowed",
    showRemarks: true,
  };
};

export const toLegacyStatus = (status: AccessStatusResult): string => {
  if (status.code === "GREEN") {
    return "GREEN;allowed";
  }

  if (status.code === "YELLOW") {
    return "YELLOW;can enter with remarks";
  }

  return "RED;cannot enter with or without remarks";
};
