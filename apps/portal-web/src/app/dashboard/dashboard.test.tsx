import { act, render } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportData } from "@/lib/types";
import { Dashboard } from "./dashboard";

// ---- Controllable auth token (drives the "token becomes available" case) ----
let mockToken: string | null = "valid-token";
vi.mock("@/hooks/useUserToken", () => ({
  default: () => ({ token: mockToken, role: null, userId: null, username: null }),
}));

// ---- Keep the unrelated report-socket hook out of the picture (socket.io) ----
vi.mock("@/hooks/useReportSocket", () => ({
  useReportsSocket: () => ({ stats: null, isConnected: false }),
}));

// ---- axios-interceptor mock (repo convention: default export with get/post/isAxiosError) ----
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock("@/lib/axios-interceptor", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...(args as Parameters<typeof mockGet>)),
    post: (...args: unknown[]) => mockPost(...(args as Parameters<typeof mockPost>)),
    isAxiosError: () => false,
  },
}));

// ---- "reports" table stand-in: every POST to a /reports URL lands here ----
let postedReports: ReportData[] = [];
let reportsPostHandler: (payload: ReportData) => Promise<unknown> = (payload) => {
  postedReports.push(payload);
  return Promise.resolve({ data: {} });
};

// ---- Minimal fake WebSocket the test drives directly (no real socket ever opens) ----
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();
  send = vi.fn();

  constructor(public url: string) {
    wsInstances.push(this);
  }
}

let wsInstances: FakeWebSocket[] = [];
const latestWs = (): FakeWebSocket => wsInstances[wsInstances.length - 1];

async function flushMicrotasks(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

type RawEventOverrides = {
  userId?: string;
  deviceId: string;
  datetime?: string;
  tnaKey?: string;
  eventTypeName?: string;
};

function makeRawEvent(overrides: RawEventOverrides) {
  return {
    Event: {
      user_id: overrides.userId ?? "1001",
      device_id: overrides.deviceId,
      datetime: overrides.datetime ?? "2026-08-08T10:00:00.000Z",
      tna_key: overrides.tnaKey ?? "1",
      event_type_id: { name: overrides.eventTypeName ?? "NORMAL", code: "1" },
    },
  };
}

async function mountAndConnect() {
  const view = render(React.createElement(Dashboard));
  await act(async () => {
    await flushMicrotasks();
  });
  const ws = latestWs();
  await act(async () => {
    ws.onopen?.();
  });
  return { ...view, ws };
}

async function fireEvent(ws: FakeWebSocket, raw: unknown) {
  await act(async () => {
    ws.onmessage?.({ data: JSON.stringify(raw) });
    await flushMicrotasks();
  });
}

describe("Dashboard gate-scan ingestion", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_WS_HOST", "ws://biostar.test");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
    vi.stubEnv("NEXT_PUBLIC_BIOSTAR_LOGIN_ID", "test-login");
    vi.stubEnv("NEXT_PUBLIC_BIOSTAR_PASSWORD", "test-password");
    vi.stubEnv("NEXT_PUBLIC_MOCK_MODE", "false");

    mockToken = "valid-token";
    wsInstances = [];
    postedReports = [];
    reportsPostHandler = (payload) => {
      postedReports.push(payload);
      return Promise.resolve({ data: {} });
    };

    global.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

    mockGet.mockReset();
    mockGet.mockImplementation(() =>
      Promise.resolve({
        data: {
          data: {
            User: {
              user_id: "1001",
              name: "Test User",
              photo_exist: false,
              disabled: "false",
              expiry_datetime: undefined,
              user_custom_fields: [],
            },
          },
        },
      })
    );

    mockPost.mockReset();
    mockPost.mockImplementation((url: string, payload?: unknown) => {
      if (url === "/api/login") {
        return Promise.resolve({ data: { bsSessionId: "test-session" } });
      }
      if (url === "/api/events") {
        return Promise.resolve({ data: {} });
      }
      if (typeof url === "string" && url.includes("/reports")) {
        return reportsPostHandler(payload as ReportData);
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("1. processes two distinct WS events on different devices fired close together", async () => {
    const { ws } = await mountAndConnect();

    await fireEvent(ws, makeRawEvent({ deviceId: "D-100" }));
    await fireEvent(ws, makeRawEvent({ deviceId: "D-200" }));

    expect(postedReports).toHaveLength(2);
    expect(postedReports.map((r) => r.device).sort()).toEqual(["Device D-100", "Device D-200"]);
  });

  it("2. keeps an IN and OUT event for the same user/device/datetime as two distinct reports", async () => {
    const { ws } = await mountAndConnect();

    await fireEvent(
      ws,
      makeRawEvent({ deviceId: "D-1", datetime: "2026-08-08T10:00:00.000Z", tnaKey: "1" })
    );
    await fireEvent(
      ws,
      makeRawEvent({ deviceId: "D-1", datetime: "2026-08-08T10:00:00.000Z", tnaKey: "2" })
    );

    expect(postedReports).toHaveLength(2);
    expect(postedReports.map((r) => r.activity).sort()).toEqual(["IN", "OUT"]);
  });

  it("3. retries a failed report POST until it succeeds", async () => {
    vi.useFakeTimers();

    let rejectNext = true;
    reportsPostHandler = (payload) => {
      if (rejectNext) {
        rejectNext = false;
        return Promise.reject(new Error("network blip"));
      }
      postedReports.push(payload);
      return Promise.resolve({ data: {} });
    };

    const { ws } = await mountAndConnect();
    await fireEvent(ws, makeRawEvent({ deviceId: "D-1" }));

    // First attempt failed: nothing posted yet, and it must not have been
    // marked "posted" (that's the mark-before-send bug).
    expect(postedReports).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await flushMicrotasks();
    });

    expect(postedReports).toHaveLength(1);
  });

  it("4. queues a report when the token is missing and sends it once the token becomes available", async () => {
    vi.useFakeTimers();
    mockToken = null;

    const { ws, rerender } = await mountAndConnect();
    await fireEvent(ws, makeRawEvent({ deviceId: "D-1" }));

    expect(postedReports).toHaveLength(0);

    mockToken = "now-available-token";
    await act(async () => {
      rerender(React.createElement(Dashboard));
      await flushMicrotasks();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await flushMicrotasks();
    });

    expect(postedReports).toHaveLength(1);
  });

  it("5. closes the WebSocket connection when the component unmounts", async () => {
    const { ws, unmount } = await mountAndConnect();

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it("6. ignores a malformed (non-JSON) WS frame without throwing", async () => {
    const { ws } = await mountAndConnect();

    expect(() => {
      ws.onmessage?.({ data: "not json" });
    }).not.toThrow();

    await act(async () => {
      await flushMicrotasks();
    });

    expect(postedReports).toHaveLength(0);
  });

  it("7. silently skips a WS event missing required fields", async () => {
    const { ws } = await mountAndConnect();

    await fireEvent(ws, {
      Event: {
        user_id: "",
        device_id: "D-1",
        datetime: "",
        tna_key: "1",
        event_type_id: { name: "NORMAL", code: "1" },
      },
    });

    expect(postedReports).toHaveLength(0);
  });

  it("8. does not double-post the exact same event fired twice", async () => {
    const { ws } = await mountAndConnect();
    const raw = makeRawEvent({ deviceId: "D-1", datetime: "2026-08-08T10:00:00.000Z", tnaKey: "1" });

    await fireEvent(ws, raw);
    await fireEvent(ws, raw);

    expect(postedReports).toHaveLength(1);
  });

  it("9. skips events whose event_type_id.name contains UPDATE", async () => {
    const { ws } = await mountAndConnect();

    await fireEvent(ws, makeRawEvent({ deviceId: "D-1", eventTypeName: "USER_UPDATE" }));

    expect(postedReports).toHaveLength(0);
  });
});
