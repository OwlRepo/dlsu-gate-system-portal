import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import EntriesLog from "@/components/employee-dashboard/EntriesLog";
import type { ScanProps } from "@/lib/types";

vi.mock("@/hooks/useGetEmployeeDetails", () => ({
  useGetEmployeeDetails: () => ({
    data: { device_id: ["dev-1"] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useUserToken", () => ({
  default: () => ({ username: "operator1", token: "token" }),
}));

const queue: ScanProps[] = [
  {
    user: { user_id: "1001", name: "Alex Cruz", photo_exist: false },
    device: { id: "dev-1", name: "Gate 1" },
    datetime: "2026-05-24T01:00:00.000Z",
    remarks: "Registrar hold",
    livedName: null,
    disabled: "false",
    tnaKey: "1",
  },
];

describe("EntriesLog", () => {
  it("hides remarks in MTL mode", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "LAGUNA");
    render(React.createElement(EntriesLog, { queue }));

    fireEvent.click(screen.getByText("ID: 1001"));

    expect(screen.queryByText("Remarks")).not.toBeInTheDocument();
  });

  it("shows remarks in DASMA mode", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "DASMA");
    render(React.createElement(EntriesLog, { queue }));

    expect(screen.getByText("Remarks: Registrar hold")).toBeInTheDocument();
  });
});
