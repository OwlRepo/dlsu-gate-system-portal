import axios from "axios";
import Cookies from "js-cookie";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("js-cookie");

const mockedCookies = vi.mocked(Cookies, true);

// The module registers its interceptor on the shared axios singleton at import
// time, so drive it through the real handler rather than re-implementing it.
async function triggerResponseError(error: unknown) {
  const handlers = (
    axios.interceptors.response as unknown as {
      handlers: Array<{ rejected: (e: unknown) => unknown } | null>;
    }
  ).handlers.filter(Boolean);

  const rejected = handlers[handlers.length - 1]!.rejected;
  return Promise.resolve(rejected(error)).catch(() => undefined);
}

function axiosError(status: number, headers: Record<string, string> = {}) {
  return {
    isAxiosError: true,
    config: { headers },
    response: { status },
  };
}

// jsdom does not implement navigation, so location has to be stubbed to observe
// whether the interceptor redirects.
function stubLocation(pathname: string) {
  const location = { pathname, href: pathname };
  Object.defineProperty(window, "location", {
    value: location,
    writable: true,
    configurable: true,
  });
  return location;
}

describe("axios 401 interceptor", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    stubLocation("/dashboard");
    await import("./axios-interceptor");
  });

  it("clears the session when an authenticated request is rejected", async () => {
    await triggerResponseError(
      axiosError(401, { Authorization: "Bearer abc.def.ghi" }),
    );

    expect(mockedCookies.remove).toHaveBeenCalledWith("user");
    expect(mockedCookies.remove).toHaveBeenCalledWith("role");
  });

  it("leaves the session alone when the request carried no token", async () => {
    // A tokenless 401 says nothing about the validity of the stored session,
    // and destroying it here logged out users who had just signed in.
    await triggerResponseError(axiosError(401));

    expect(mockedCookies.remove).not.toHaveBeenCalled();
  });

  it("leaves the session alone for non-401 failures", async () => {
    await triggerResponseError(
      axiosError(500, { Authorization: "Bearer abc.def.ghi" }),
    );

    expect(mockedCookies.remove).not.toHaveBeenCalled();
  });

  it("redirects to login when an authenticated session dies", async () => {
    const location = stubLocation("/dashboard");

    await triggerResponseError(
      axiosError(401, { Authorization: "Bearer abc.def.ghi" }),
    );

    expect(location.href).toBe("/login");
  });

  it("does not redirect when already on the login page", async () => {
    const location = stubLocation("/login");

    await triggerResponseError(
      axiosError(401, { Authorization: "Bearer abc.def.ghi" }),
    );

    // Redirecting to the page we are already on is what produced the loop.
    expect(location.href).toBe("/login");
    expect(mockedCookies.remove).not.toHaveBeenCalled();
  });
});
