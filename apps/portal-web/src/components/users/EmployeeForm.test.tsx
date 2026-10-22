import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axios from "axios";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmployeeForm from "@/components/users/EmployeeForm";

vi.mock("axios");
vi.mock("js-cookie", () => ({ default: { get: () => undefined } }));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));

const devicesReply = (rows: unknown) => ({
  data: { data: { DeviceCollection: { rows } } },
});

describe("EmployeeForm", () => {
  beforeEach(() => {
    toast.mockClear();
    vi.mocked(axios.post).mockResolvedValue({ data: { bsSessionId: "s1" } });
  });

  it("regression: renders the form instead of crashing when /api/devices rows is not an array", async () => {
    vi.mocked(axios.get).mockResolvedValue(devicesReply({}));

    render(React.createElement(EmployeeForm, { onClose: () => {} }));

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Devices could not be loaded. Close and reopen the form to retry.",
    );
    expect(screen.getByText("Select device...")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("happy: lists the devices BioStar returned", async () => {
    vi.mocked(axios.get).mockResolvedValue(
      devicesReply([{ id: "1", name: "Gate 1" }]),
    );

    render(React.createElement(EmployeeForm, { onClose: () => {} }));

    await waitFor(() => expect(vi.mocked(axios.get)).toHaveBeenCalled());
    fireEvent.click(await screen.findByText("Select device..."));
    expect(await screen.findByText("Gate 1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
