import { render, waitFor, act } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("js-cookie", () => ({
  default: {
    get: vi.fn(() => JSON.stringify({ token: "token" })),
  },
}));

const mockPost = vi.fn();
const mockGet = vi.fn();
vi.mock("@/lib/axios-interceptor", () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
    isAxiosError: () => false,
  },
}));

let mockToken: string | null = "test-token";
vi.mock("@/hooks/useUserToken", () => ({
  default: () => ({ token: mockToken, role: "employee", userId: "1", username: "operator1" }),
}));

// Minimal fake WebSocket the component's `new WebSocket(...)` picks up.
// Captures the constructed instance so the test can drive onopen/onmessage/onclose directly.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = FakeWebSocket.OPEN;
  close = vi.fn();
  send = vi.fn();

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
}

import TurnstileDashboard from "@/components/employee-dashboard/TurnstileDashboard";

const baseUser = {
  user_id: "1001",
  name: "Alex Cruz",
  photo_exist: false,
};

function rawEvent(overrides: Partial<{
  user_id: string;
  device_id: string;
  datetime: string;
  tna_key: string;
  event_type_id: { code: string; name: string };
}> = {}) {
  return {
    Event: {
      user_id: overrides.user_id ?? "1001",
      device_id: overrides.device_id ?? "538203430",
      datetime: overrides.datetime ?? "2026-05-24T01:00:00.000Z",
      tna_key: overrides.tna_key ?? "1",
      event_type_id: overrides.event_type_id ?? { code: "1", name: "IDENTIFICATION_SUCCESS" },
    },
  };
}

// Stand-in for the real `reports` table: only bodies from POSTs that actually
// resolved successfully land here, matching what would truly be persisted.
let postedReports: unknown[] = [];

describe("TurnstileDashboard", () => {
  beforeEach(() => {
    mockToken = "test-token";
    FakeWebSocket.instances = [];
    // @ts-expect-error test override
    global.WebSocket = FakeWebSocket;

    postedReports = [];
    mockPost.mockReset();
    mockGet.mockReset();

    mockPost.mockImplementation((url: string, body: unknown) => {
      if (url === "/api/login") {
        return Promise.resolve({ data: { bsSessionId: "session-1" } });
      }
      if (typeof url === "string" && url.includes("/reports")) {
        postedReports.push(body);
        return Promise.resolve({ data: { id: "report-1" } });
      }
      return Promise.resolve({ data: {} });
    });

    mockGet.mockImplementation(() => {
      return Promise.resolve({
        data: {
          data: {
            User: {
              user_id: baseUser.user_id,
              name: baseUser.name,
              photo_exist: false,
              photo: undefined,
              user_custom_fields: [],
              disabled: "false",
              expiry_datetime: undefined,
            },
          },
        },
      });
    });
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
    vi.clearAllMocks();
  });

  async function mountAndOpen() {
    const utils = render(React.createElement(TurnstileDashboard));

    // flush the /api/login promise + WS construction
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    await act(async () => {
      ws.onopen?.();
      await Promise.resolve();
    });

    return { ...utils, ws };
  }

  function reportsPostBodies() {
    return postedReports;
  }

  it("posts a separate report for two scans on the same device before flush runs (overwrite bug)", async () => {
    const { ws } = await mountAndOpen();

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify(
          rawEvent({ device_id: "538203430", datetime: "2026-05-24T01:00:00.000Z" })
        ),
      });
      ws.onmessage?.({
        data: JSON.stringify(
          rawEvent({ device_id: "538203430", datetime: "2026-05-24T01:00:05.000Z" })
        ),
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(reportsPostBodies().length).toBe(2));
  });

  it("dedupes a true duplicate WS event (identical fields fired twice)", async () => {
    const { ws } = await mountAndOpen();

    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify(rawEvent()) });
      ws.onmessage?.({ data: JSON.stringify(rawEvent()) });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(reportsPostBodies().length).toBe(1));
  });

  it("retries a failed /reports POST and eventually posts it", async () => {
    // Fake timers must be active before the component mounts (and schedules its
    // retry setInterval) — otherwise advanceTimersByTimeAsync later has no effect
    // on an interval that was created as a real timer.
    vi.useFakeTimers();
    const { ws } = await mountAndOpen();

    let reportCallCount = 0;
    mockPost.mockImplementation((url: string, body: unknown) => {
      if (url === "/api/login") {
        return Promise.resolve({ data: { bsSessionId: "session-1" } });
      }
      if (typeof url === "string" && url.includes("/reports")) {
        reportCallCount += 1;
        if (reportCallCount === 1) {
          return Promise.reject(new Error("network error"));
        }
        postedReports.push(body);
        return Promise.resolve({ data: { id: "report-1" } });
      }
      return Promise.resolve({ data: {} });
    });

    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify(rawEvent()) });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // first attempt failed, not yet posted
    expect(reportsPostBodies().length).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(reportsPostBodies().length).toBe(1);
  });

  it("queues the report when token is null and posts it once the token becomes available", async () => {
    mockToken = null;
    vi.useFakeTimers();
    const { ws, rerender } = await mountAndOpen();

    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify(rawEvent()) });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reportsPostBodies().length).toBe(0);

    mockToken = "now-available-token";
    rerender(React.createElement(TurnstileDashboard));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(reportsPostBodies().length).toBe(1);
  });

  it("closes the WebSocket on unmount", async () => {
    const { ws, unmount } = await mountAndOpen();

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it("posts distinct reports for IN and OUT events with the same user/device/timestamp", async () => {
    const { ws } = await mountAndOpen();

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify(
          rawEvent({ tna_key: "1", datetime: "2026-05-24T01:00:00.000Z" })
        ),
      });
      ws.onmessage?.({
        data: JSON.stringify(
          rawEvent({ tna_key: "2", datetime: "2026-05-24T01:00:00.000Z" })
        ),
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(reportsPostBodies().length).toBe(2));
  });

  it("posts real device identity instead of the positional-arg-bug's 'undefined - undefined'", async () => {
    const { ws } = await mountAndOpen();

    await act(async () => {
      ws.onmessage?.({
        data: JSON.stringify(rawEvent({ device_id: "538203430" })),
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(reportsPostBodies().length).toBe(1));
    const posted = reportsPostBodies()[0] as { device: string; user_id: string };
    expect(posted.device).toBe("Device 538203430");
    expect(posted.device).not.toContain("undefined");
    expect(posted.user_id).toBe("1001");
  });

  it("looks up /api/users with the real scanning user's id, not undefined", async () => {
    const { ws } = await mountAndOpen();

    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify(rawEvent({ user_id: "1001" })) });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const [, config] = mockGet.mock.calls[0] as [string, { params?: { params?: string } }];
    expect(config.params?.params).toBe("1001");
  });

  it("keeps two different devices' report identities distinct (no collapse to a single undefined key)", async () => {
    const { ws } = await mountAndOpen();

    await act(async () => {
      ws.onmessage?.({ data: JSON.stringify(rawEvent({ device_id: "538203430" })) });
      ws.onmessage?.({
        data: JSON.stringify(
          rawEvent({ device_id: "538203431", datetime: "2026-05-24T01:00:05.000Z" })
        ),
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(reportsPostBodies().length).toBe(2));
    const devices = reportsPostBodies().map((r) => (r as { device: string }).device);
    expect(new Set(devices).size).toBe(2);
    expect(devices).toContain("Device 538203430");
    expect(devices).toContain("Device 538203431");
  });
});
