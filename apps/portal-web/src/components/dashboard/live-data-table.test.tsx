import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { LiveDataTable } from "@/components/dashboard/live-data-table";
import type { ScanProps } from "@/lib/types";

const baseRow: ScanProps = {
  user: { user_id: "1001", name: "Alex Cruz", photo_exist: false },
  device: { id: "dev-1", name: "Gate 1" },
  datetime: "2026-05-24T01:00:00.000Z",
  remarks: "Registrar hold",
  livedName: null,
  disabled: "false",
  tnaKey: "1",
};

describe("LiveDataTable", () => {
  it("shows binary status and hides remarks in MTL mode", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "TAFT");
    render(
      React.createElement(LiveDataTable, {
        data: [baseRow],
        handleClear: () => {},
      })
    );

    fireEvent.click(screen.getByText("Alex Cruz"));

    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.queryByText("Remarks:")).not.toBeInTheDocument();
  });

  it("shows allowed-with-remarks and remarks section in DASMA mode", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "DASMA");
    render(
      React.createElement(LiveDataTable, {
        data: [baseRow],
        handleClear: () => {},
      })
    );

    fireEvent.click(screen.getByText("Alex Cruz"));

    expect(screen.getByText("Allowed with remarks")).toBeInTheDocument();
    expect(screen.getByText("Remarks:")).toBeInTheDocument();
  });
});
