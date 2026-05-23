import { getAccessStatus, toLegacyStatus } from "@/lib/access-status";
import { ReportData, ScanProps } from "@/lib/types";

export const getEntryStatus = (scan: ScanProps): string => {
  return toLegacyStatus(getAccessStatus(scan));
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
    gate: scan.gate || scan.device.name || scan.device.id || "Unknown Gate",
  };
};
