import type { ScanProps } from "@/lib/types";

export const mockDashboardScans: ScanProps[] = [
  {
    user: { user_id: "2021-00001", name: "Juan Dela Cruz", photo_exist: false },
    device: { id: "538203430", name: "Turnstile 1" },
    gate: "Gate 1 - South Entrance",
    datetime: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    remarks: "No remarks",
    livedName: "Juan",
    disabled: "false",
    tnaKey: "1",
    eventTypeId: "ACCESS_GRANTED",
  },
  {
    user: { user_id: "2021-00002", name: "Maria Santos", photo_exist: false },
    device: { id: "538203431", name: "Turnstile 2" },
    gate: "Gate 2 - North Entrance",
    datetime: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    remarks: "Pending registrar hold",
    livedName: "Mari",
    disabled: "false",
    tnaKey: "1",
    eventTypeId: "ACCESS_GRANTED",
  },
  {
    user: { user_id: "2021-00003", name: "Carlo Reyes", photo_exist: false },
    device: { id: "538203432", name: "Turnstile 3" },
    gate: "Gate 3 - East Entrance",
    datetime: new Date(Date.now() - 1000 * 60 * 7).toISOString(),
    remarks: "No remarks",
    livedName: "Carlo",
    disabled: "true",
    tnaKey: "2",
    eventTypeId: "APB_VIOLATION_HARD",
  },
];

export const mockSocketStats = {
  onPremise: 287,
  entry: 913,
  exit: 626,
  gateAccessStats: {
    allowed: 810,
    allowedWithRemarks: 74,
    notAllowed: 29,
  },
  lastUpdated: new Date(),
};
