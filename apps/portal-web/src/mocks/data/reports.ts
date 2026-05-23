import type { ReportData } from "@/lib/types";

export const mockReports: ReportData[] = [
  {
    datetime: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    type: "1",
    user_id: "2021-00001",
    name: "Juan Dela Cruz",
    remarks: "No remarks",
    status: "GREEN;allowed",
    activity: "IN",
    device: "Turnstile 1",
    gate: "Gate 1 - South Entrance",
  },
  {
    datetime: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    type: "1",
    user_id: "2021-00002",
    name: "Maria Santos",
    remarks: "Pending registrar hold",
    status: "YELLOW;can enter with remarks",
    activity: "IN",
    device: "Turnstile 2",
    gate: "Gate 2 - North Entrance",
  },
  {
    datetime: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    type: "2",
    user_id: "2021-00004",
    name: "Rico Villanueva",
    remarks: "No remarks",
    status: "GREEN;allowed",
    activity: "OUT",
    device: "Turnstile 1",
    gate: "Gate 1 - South Entrance",
  },
];

export const mockGateAnalytics = [
  { gate: "Gate 1 - South Entrance", count: 42 },
  { gate: "Gate 2 - North Entrance", count: 31 },
  { gate: "Gate 3 - East Entrance", count: 24 },
  { gate: "Gate 4 - West Entrance", count: 16 },
];
