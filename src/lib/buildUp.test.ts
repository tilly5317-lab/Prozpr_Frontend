import { describe, it, expect } from "vitest";
import { computeBuildUp } from "./buildUp";
import type { PortfolioNavHistoryPoint } from "./api";

function pt(date: string, value: number, invested: number): PortfolioNavHistoryPoint {
  const gain = invested > 0 ? ((value - invested) / invested) * 100 : 0;
  return { recorded_date: date, total_value: value, total_invested: invested, gain_percentage: gain };
}

describe("computeBuildUp", () => {
  it("returns null without enough history", () => {
    expect(computeBuildUp([], "All", new Date("2024-06-01"))).toBeNull();
    expect(computeBuildUp([pt("2024-01-01", 100, 100)], "All", new Date("2024-06-01"))).toBeNull();
  });

  it("All: starts from zero — corpus = contributions + gain", () => {
    const points = [pt("2024-01-01", 100000, 100000), pt("2024-06-01", 140000, 120000)];
    const b = computeBuildUp(points, "All", new Date("2024-06-01"))!;
    expect(b.startingValue).toBe(0);
    expect(b.netInvested).toBe(120000);
    expect(b.marketGain).toBe(20000);
    expect(b.currentValue).toBe(140000);
    expect(b.startingValue + b.netInvested + b.marketGain).toBe(b.currentValue);
  });

  it("finite window (good period): base + added + gain reconcile", () => {
    const points = [pt("2024-01-01", 100000, 100000), pt("2024-06-01", 140000, 120000)];
    // 1Y ending 2024-06-01 → cutoff ~2023-06 → start index 0.
    const b = computeBuildUp(points, "1Y", new Date("2024-06-01"))!;
    expect(b.startingValue).toBe(100000);
    expect(b.netInvested).toBe(20000);
    expect(b.marketGain).toBe(20000);
    expect(b.currentValue).toBe(140000);
    expect(b.startingValue + b.netInvested + b.marketGain).toBe(b.currentValue);
  });

  it("down period: market gain goes negative", () => {
    const points = [pt("2024-01-01", 100000, 100000), pt("2024-06-01", 110000, 130000)];
    const b = computeBuildUp(points, "1Y", new Date("2024-06-01"))!;
    expect(b.netInvested).toBe(30000);
    expect(b.marketGain).toBe(-20000);
    expect(b.currentValue).toBe(110000);
    expect(b.startingValue + b.netInvested + b.marketGain).toBe(b.currentValue);
  });

  it("net withdrawal: net invested goes negative", () => {
    const points = [pt("2024-01-01", 100000, 80000), pt("2024-06-01", 90000, 50000)];
    const b = computeBuildUp(points, "1Y", new Date("2024-06-01"))!;
    expect(b.startingValue).toBe(100000);
    expect(b.netInvested).toBe(-30000);
    expect(b.marketGain).toBe(20000);
    expect(b.currentValue).toBe(90000);
    expect(b.startingValue + b.netInvested + b.marketGain).toBe(b.currentValue);
  });
});
