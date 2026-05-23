import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import CustomTable from "@/components/custom/CustomTable";

type Row = {
  STATUS: {
    disabled?: string;
    expiryDate?: string;
    remarks?: string | null;
    eventTypeId?: string;
  };
  NAME: string;
};

const columns = [
  { header: "Status", accessor: "STATUS" as const },
  { header: "Name", accessor: "NAME" as const },
];

describe("CustomTable live status dots", () => {
  it("renders yellow for DASMA record with remarks", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "DASMA");
    const data: Row[] = [
      {
        STATUS: { disabled: "false", remarks: "Registrar hold" },
        NAME: "User A",
      },
    ];

    const { container } = render(
      React.createElement(CustomTable<Row>, { data, columns, isLive: true })
    );

    expect(screen.getByText("User A")).toBeInTheDocument();
    expect(container.querySelector(".bg-\\[\\#FFB300\\]")).toBeInTheDocument();
  });

  it("renders green for MTL record with remarks", () => {
    vi.stubEnv("NEXT_PUBLIC_CAMPUS", "MAIN");
    const data: Row[] = [
      {
        STATUS: { disabled: "false", remarks: "Registrar hold" },
        NAME: "User B",
      },
    ];

    const { container } = render(
      React.createElement(CustomTable<Row>, { data, columns, isLive: true })
    );

    expect(screen.getByText("User B")).toBeInTheDocument();
    expect(container.querySelector(".bg-\\[\\#00C853\\]")).toBeInTheDocument();
  });
});
