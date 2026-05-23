import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import ReportsTable from "@/components/reports/ReportsTable";
import type { ReportsHeader } from "@/components/reports/ReportsPageContainer";

const columns = [
  { header: "Status", accessor: "STATUS" as const },
  { header: "ID", accessor: "ID" as const },
];

const baseRow: ReportsHeader = {
  STATUS: "Allowed",
  STATUS_CODE: "GREEN",
  SHOW_REMARKS: false,
  ID: "1001",
  NAME: "Alex",
  GATE: "Gate 1",
  ACTIVITY: "IN",
  DATETIME: "May 24, 2026",
  REMARKS: "N/A",
};

describe("ReportsTable", () => {
  it("renders green dot for GREEN status code", () => {
    const { container } = render(
      React.createElement(ReportsTable, {
        data: [baseRow],
        columns,
        currentPage: 1,
        onPageChange: () => {},
        onLimitChange: () => {},
        total: 1,
        limit: 10,
      })
    );

    expect(screen.getByText("1001")).toBeInTheDocument();
    expect(container.querySelector(".bg-\\[\\#00C853\\]")).toBeInTheDocument();
  });

  it("renders yellow dot for YELLOW status code", () => {
    const { container } = render(
      React.createElement(ReportsTable, {
        data: [{ ...baseRow, STATUS_CODE: "YELLOW", STATUS: "Allowed with remarks" }],
        columns,
        currentPage: 1,
        onPageChange: () => {},
        onLimitChange: () => {},
        total: 1,
        limit: 10,
      })
    );

    expect(container.querySelector(".bg-\\[\\#FFB300\\]")).toBeInTheDocument();
  });
});
