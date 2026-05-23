import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("js-cookie", () => ({
  default: {
    get: vi.fn(() => JSON.stringify({ token: "token" })),
  },
}));

const mockGet = vi.fn();
vi.mock("@/lib/axios-interceptor", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    isAxiosError: () => false,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/custom/CustomFilter", () => ({
  default: () => React.createElement("div", { "data-testid": "mock-filter" }),
}));

vi.mock("@/components/custom/CustomExport", () => ({
  default: () => React.createElement("div", { "data-testid": "mock-export" }),
}));

vi.mock("@/components/reports/GateUsageChart", () => ({
  GateUsageChart: () => React.createElement("div", { "data-testid": "mock-chart" }),
}));

vi.mock("@/components/reports/ReportsTable", () => ({
  default: ({
    data,
    onRowClick,
  }: {
    data: Array<{ STATUS: string; NAME: string }>;
    onRowClick: (row: { STATUS: string; NAME: string; REMARKS: string }) => void;
  }) =>
    React.createElement(
      "div",
      null,
      ...data.map((row, idx) =>
        React.createElement(
          "button",
          { key: idx, onClick: () => onRowClick(row as never) },
          `${row.NAME} - ${row.STATUS}`
        )
      )
    ),
}));

import ReportsPageContainer from "@/components/reports/ReportsPageContainer";

describe("ReportsPageContainer campus mapping", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/reports/analytics/gates")) {
        return Promise.resolve({ data: [] });
      }

      return Promise.resolve({
        data: {
          items: [
            {
              status: "YELLOW;can enter with remarks",
              user_id: "1001",
              name: "Alex Cruz",
              gate: "Gate 1",
              activity: "IN",
              datetime: "2026-05-24T01:00:00.000Z",
              remarks: "Registrar hold",
            },
          ],
          total: 1,
        },
      });
    });
  });

  it("maps YELLOW to Allowed in MTL and hides remarks in details", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "MAIN");
    render(React.createElement(ReportsPageContainer));

    await waitFor(() =>
      expect(screen.getByText("Alex Cruz - Allowed")).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText("Alex Cruz - Allowed"));
    expect(screen.queryByText("Remarks:")).not.toBeInTheDocument();
  });

  it("keeps Allowed with remarks label in DASMA mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "DASMA");
    render(React.createElement(ReportsPageContainer));

    await waitFor(() =>
      expect(
        screen.getByText("Alex Cruz - Allowed with remarks")
      ).toBeInTheDocument()
    );
  });
});
