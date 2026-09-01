import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// request<T> reads localStorage token and parses via res.text()+JSON.parse (never res.json()).
// None of these mocks hit a 502/503/504 or a fetch reject, so the module's
// `backendOfflineUntil` guard stays at 0 and tests do not leak offline state into each other.
function mockFetchOnce(body: unknown, opts: { ok?: boolean; status?: number } = {}) {
  const { ok = true, status = 200 } = opts;
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
}

describe("rebalancing save-plan api", () => {
  beforeEach(() => {
    localStorage.setItem("askProzpr_token", "test-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("saveRebalancingRun POSTs to /rebalancing/{id}/save", async () => {
    const fetchMock = mockFetchOnce({ id: "run-1", origin: "saved" });
    vi.stubGlobal("fetch", fetchMock);
    const { saveRebalancingRun } = await import("@/lib/api");

    const res = await saveRebalancingRun("run-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/rebalancing\/run-1\/save$/);
    expect((init as RequestInit).method).toBe("POST");
    expect(res.origin).toBe("saved");
  });

  it("getCurrentRebalancingRun GETs /rebalancing/current", async () => {
    const fetchMock = mockFetchOnce({ id: "run-9", origin: null, trades: [] });
    vi.stubGlobal("fetch", fetchMock);
    const { getCurrentRebalancingRun } = await import("@/lib/api");

    const res = await getCurrentRebalancingRun();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/rebalancing\/current$/);
    expect(((init as RequestInit)?.method ?? "GET")).toBe("GET");
    expect(res.id).toBe("run-9");
  });

  it("getCurrentRebalancingRun rejects on 404 (no runs yet)", async () => {
    vi.stubGlobal("fetch", mockFetchOnce({ detail: "No rebalancing runs" }, { ok: false, status: 404 }));
    const { getCurrentRebalancingRun } = await import("@/lib/api");

    await expect(getCurrentRebalancingRun()).rejects.toThrow();
  });
});
