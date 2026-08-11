import { render, waitFor } from "@testing-library/react";
import axios from "axios";
import Cookies from "js-cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValidateToken } from "./ValidateToken";

vi.mock("axios");
vi.mock("js-cookie");

const mockedAxios = vi.mocked(axios, true);
const mockedCookies = vi.mocked(Cookies, true);

describe("ValidateToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("does not call /auth/validate when there is no session cookie", async () => {
    mockedCookies.get.mockReturnValue(undefined as never);

    render(<ValidateToken />);

    // The endpoint rejects a tokenless request with 401, and the global
    // interceptor treats any 401 as "session dead" - so asking without a token
    // is what logged users out on the login page.
    await waitFor(() => expect(mockedCookies.get).toHaveBeenCalledWith("user"));
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("does not call /auth/validate when the cookie holds no token", async () => {
    mockedCookies.get.mockReturnValue(JSON.stringify({ username: "x" }) as never);

    render(<ValidateToken />);

    await waitFor(() => expect(mockedCookies.get).toHaveBeenCalledWith("user"));
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("calls /auth/validate with the stored Authorization header when a token exists", async () => {
    mockedCookies.get.mockReturnValue(
      JSON.stringify({ token: "Bearer abc.def.ghi" }) as never,
    );
    mockedAxios.get.mockResolvedValue({ status: 200, data: {} } as never);

    render(<ValidateToken />);

    await waitFor(() =>
      expect(mockedAxios.get).toHaveBeenCalledWith(
        "http://api.test/auth/validate",
        {
          headers: {
            accept: "application/json",
            Authorization: "Bearer abc.def.ghi",
          },
        },
      ),
    );
  });

  it("keeps polling on the interval while a token is present", async () => {
    vi.useFakeTimers();
    mockedCookies.get.mockReturnValue(
      JSON.stringify({ token: "Bearer abc.def.ghi" }) as never,
    );
    mockedAxios.get.mockResolvedValue({ status: 200, data: {} } as never);

    render(<ValidateToken />);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(15000);
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });
});
