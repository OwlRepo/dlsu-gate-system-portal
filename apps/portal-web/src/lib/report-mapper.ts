import { checkExpiry } from "@/lib/checkExpiry";
import { ReportData, ScanProps } from "@/lib/types";

export const getEntryStatus = (scan: ScanProps): string => {
  const isDisabled = scan.disabled === "true";
  const isExpired = checkExpiry(scan.expiryDate);
  const hasRemarks = scan.remarks !== "No remarks";
  const isApb = scan.eventTypeId?.includes("APB");

  if (isDisabled || isExpired || isApb) {
    return "RED;cannot enter with or without remarks";
  }

  if (hasRemarks) {
    return "YELLOW;can enter with remarks";
  }

  return "GREEN;can enter without remarks";
};

export const mapReportType = (scan: ScanProps): string => {
  if (scan.eventTypeId?.includes("APB")) {
    return "";
  }

  if (scan.tnaKey === "1") {
    return "1";
  }

  if (scan.tnaKey === "2") {
    return "2";
  }

  return "";
};

export const mapReportActivity = (scan: ScanProps): string => {
  if (scan.eventTypeId?.includes("APB")) {
    return "APB_VIOLATION";
  }
  return scan.tnaKey === "1" ? "IN" : "OUT";
};

export const mapScanToReportData = (scan: ScanProps): ReportData => {
  return {
    datetime: scan.datetime,
    type: mapReportType(scan),
    user_id: scan.user.user_id,
    name: scan.user.name,
    remarks: scan.remarks || "No remarks",
    status: getEntryStatus(scan),
    activity: mapReportActivity(scan),
    device: scan.device.name || scan.device.id,
  };
};
