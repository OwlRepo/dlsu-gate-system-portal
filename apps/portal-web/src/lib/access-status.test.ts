import { describe, expect, it } from "vitest";
import { getAccessStatus, toLegacyStatus } from "@/lib/access-status";

describe("access status mapper", () => {
  it("returns GREEN/Allowed for active MTL user even with remarks", () => {
    const status = getAccessStatus(
      {
        disabled: "false",
        remarks: "Registrar hold",
        eventTypeId: "NORMAL_EVENT",
      },
      "MTL"
    );

    expect(status).toEqual({
      code: "GREEN",
      label: "Allowed",
      showRemarks: false,
    });
  });

  it("returns RED/Not Allowed for APB in MTL", () => {
    const status = getAccessStatus(
      {
        disabled: "false",
        remarks: "No remarks",
        eventTypeId: "ACCESS_DENIED_APB",
      },
      "MTL"
    );

    expect(status.code).toBe("RED");
    expect(status.label).toBe("Not Allowed");
    expect(status.showRemarks).toBe(false);
  });

  it("returns YELLOW/Allowed with remarks for active Dasma user with remarks", () => {
    const status = getAccessStatus(
      {
        disabled: "false",
        remarks: "Pending registrar hold",
      },
      "DASMA"
    );

    expect(status.code).toBe("YELLOW");
    expect(status.label).toBe("Allowed with remarks");
    expect(status.showRemarks).toBe(true);
  });

  it("returns GREEN/Allowed for active Dasma user with no remarks", () => {
    const status = getAccessStatus(
      {
        disabled: "false",
        remarks: "No remarks",
      },
      "DASMA"
    );

    expect(status.code).toBe("GREEN");
    expect(status.label).toBe("Allowed");
    expect(status.showRemarks).toBe(true);
  });

  it("converts status to legacy report format", () => {
    expect(
      toLegacyStatus({ code: "GREEN", label: "Allowed", showRemarks: false })
    ).toBe("GREEN;allowed");
    expect(
      toLegacyStatus({
        code: "YELLOW",
        label: "Allowed with remarks",
        showRemarks: true,
      })
    ).toBe("YELLOW;can enter with remarks");
    expect(
      toLegacyStatus({ code: "RED", label: "Not Allowed", showRemarks: false })
    ).toBe("RED;cannot enter with or without remarks");
  });
});
