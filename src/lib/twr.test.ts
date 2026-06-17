import { describe, it, expect } from "vitest";
import { rebaseTwr, windowStartIndex } from "./twr";
import type { TwrPoint } from "./api";

const pts: TwrPoint[] = [
  { date: "2024-01-01", portfolio_index: 1.0, nifty_index: 1.0 },
  { date: "2024-01-02", portfolio_index: 1.1, nifty_index: 1.05 },
  { date: "2024-01-03", portfolio_index: 1.21, nifty_index: 1.1 },
];

describe("rebaseTwr", () => {
  it("rebases to the window start", () => {
    const r = rebaseTwr(pts, 0);
    expect(r.twr).toBe(21);
    expect(r.niftyTwr).toBe(10);
    expect(r.series[0].twr).toBe(0);
    expect(r.series[2].twr).toBe(21);
  });

  it("rebases from a later start index", () => {
    const r = rebaseTwr(pts, 1);
    expect(r.twr).toBe(10);
    expect(r.series[0].twr).toBe(0);
  });

  it("returns null nifty + omits bench when nifty data is missing", () => {
    const noNifty = pts.map((p) => ({ ...p, nifty_index: null }));
    const r = rebaseTwr(noNifty, 0);
    expect(r.niftyTwr).toBeNull();
    expect(r.series[0].bench_nifty50).toBeUndefined();
  });
});

describe("windowStartIndex", () => {
  it("returns 0 for All", () => {
    expect(windowStartIndex(pts.map((p) => p.date), "All", new Date("2024-01-03"))).toBe(0);
  });

  it("finds the first point within a trailing window", () => {
    // 1M window ending 2024-01-31 → cutoff 2024-01-01 → index 0 here.
    expect(windowStartIndex(pts.map((p) => p.date), "1M", new Date("2024-01-31"))).toBe(0);
  });
});
