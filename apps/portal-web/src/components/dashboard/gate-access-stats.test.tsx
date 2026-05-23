import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { GateAccessStats } from "@/components/dashboard/gate-access-stats";

describe("GateAccessStats", () => {
  it("hides allowed-with-remarks in MTL mode and rolls it into allowed", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "MAIN");
    render(
      React.createElement(GateAccessStats, {
        data: { allowed: 40, allowedWithRemarks: 20, notAllowed: 40 },
      })
    );

    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.queryByText("Allowed with Remarks")).not.toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
  });

  it("shows three buckets in DASMA mode", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "DASMA");
    render(
      React.createElement(GateAccessStats, {
        data: { allowed: 40, allowedWithRemarks: 20, notAllowed: 40 },
      })
    );

    expect(screen.getByText("Allowed with Remarks")).toBeInTheDocument();
    expect(screen.getAllByText("40%").length).toBeGreaterThan(0);
    expect(screen.getByText("20%")).toBeInTheDocument();
  });
});
