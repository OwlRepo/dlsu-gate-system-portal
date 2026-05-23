import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import TurnstileGrid from "@/components/employee-dashboard/TurnstileGrid";
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

const scanDetails: ScanProps[] = [
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

describe("TurnstileGrid", () => {
  it("hides remarks block in MTL mode", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "MAIN");
    const { container } = render(
      React.createElement(TurnstileGrid, {
        scanDetails,
        setScanDetail: () => {},
        turnstileCount: 1,
      })
    );

    expect(screen.queryByText("Remarks")).not.toBeInTheDocument();
    expect(container.querySelector(".border-green-500")).toBeInTheDocument();
  });

  it("shows remarks block in DASMA mode", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "DASMA");
    render(
      React.createElement(TurnstileGrid, {
        scanDetails,
        setScanDetail: () => {},
        turnstileCount: 1,
      })
    );

    expect(screen.getByText("Remarks")).toBeInTheDocument();
  });
});
