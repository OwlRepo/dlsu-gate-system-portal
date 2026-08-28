import axios from "@/lib/axios-interceptor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSyncedPhoto } from "./synced-photo";

vi.mock("@/lib/axios-interceptor");

describe("fetchSyncedPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the photo the sync stored in PostgreSQL", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        ID_Number: "12100001",
        Name: "Dela Cruz, Juan",
        Photo: "/9j/4AAQSkZJRg",
      },
    });

    await expect(fetchSyncedPhoto("12100001", "fake-jwt")).resolves.toBe(
      "/9j/4AAQSkZJRg",
    );
  });

  it("sends the auth token the rest of the dashboard uses", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { Photo: null } });

    await fetchSyncedPhoto("12100001", "fake-jwt");

    expect(vi.mocked(axios.get).mock.calls[0][0]).toContain(
      "/students/12100001",
    );
    expect(vi.mocked(axios.get).mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "fake-jwt" },
    });
  });

  it("returns undefined when PostgreSQL has no photo either", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { Photo: null } });

    await expect(
      fetchSyncedPhoto("12100001", "fake-jwt"),
    ).resolves.toBeUndefined();
  });

  // A gate feed must never go down because a photo lookup 404'd.
  it("swallows a 404 and returns undefined", async () => {
    vi.mocked(axios.get).mockRejectedValue({ response: { status: 404 } });

    await expect(
      fetchSyncedPhoto("99999999", "fake-jwt"),
    ).resolves.toBeUndefined();
  });

  it("swallows a network failure and returns undefined", async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      fetchSyncedPhoto("12100001", "fake-jwt"),
    ).resolves.toBeUndefined();
  });

  it("does not call the backend at all without an id or a token", async () => {
    await expect(fetchSyncedPhoto("", "fake-jwt")).resolves.toBeUndefined();
    await expect(fetchSyncedPhoto("12100001", null)).resolves.toBeUndefined();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("encodes an id that would otherwise break the URL", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { Photo: null } });

    await fetchSyncedPhoto("12/100 001", "fake-jwt");

    expect(vi.mocked(axios.get).mock.calls[0][0]).toContain("12%2F100%20001");
  });
});
