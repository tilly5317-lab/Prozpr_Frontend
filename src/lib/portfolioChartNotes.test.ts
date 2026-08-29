import { describe, expect, it } from "vitest";

import { chartNotes, type Horizon } from "./portfolioChartNotes";
import type { PortfolioNavHistoryPoint } from "./api";

const pt = (
  date: string,
  total_value: number,
  total_invested: number,
): PortfolioNavHistoryPoint => ({
  recorded_date: date,
  total_value,
  total_invested,
  gain_percentage:
    total_invested > 0 ? ((total_value - total_invested) / total_invested) * 100 : 0,
});

/** A month of daily readings, value and contributions moving linearly. */
function series(
  fromValue: number,
  toValue: number,
  fromInvested: number,
  toInvested: number,
  days = 30,
  startDay = 0,
): PortfolioNavHistoryPoint[] {
  const start = Date.parse("2026-01-01") + startDay * 86_400_000;
  return Array.from({ length: days }, (_, i) => {
    const t = i / (days - 1);
    return pt(
      new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      fromValue + (toValue - fromValue) * t,
      fromInvested + (toInvested - fromInvested) * t,
    );
  });
}

describe("chartNotes — headline", () => {
  it("separates money added from market growth", () => {
    // +₹2L of value, of which ₹1L was fresh money.
    const r = chartNotes(series(1_000_000, 1_200_000, 800_000, 900_000), "1Y");
    expect(r.headline).toContain("You put in");
    expect(r.headline).toContain("the market added another");
  });

  it("says so plainly when contributions were eaten by the market", () => {
    // ₹1L added, but value only up ₹20k — the market took the rest.
    const r = chartNotes(series(1_000_000, 1_020_000, 800_000, 900_000), "1Y");
    expect(r.headline).toContain("took");
    expect(r.headline).toContain("back off it");
  });

  it("attributes a pure-market move to the market, not to withdrawals", () => {
    const r = chartNotes(series(1_000_000, 900_000, 800_000, 800_000), "3M");
    expect(r.headline).toContain("market movement, not money withdrawn");
  });

  it("credits growth alone when nothing was added", () => {
    const r = chartNotes(series(1_000_000, 1_150_000, 800_000, 800_000), "1Y");
    expect(r.headline).toContain("on market movement alone");
  });

  it("names the window it is describing", () => {
    expect(chartNotes(series(1e6, 1.1e6, 8e5, 8e5), "1M").headline).toContain("this month");
    expect(chartNotes(series(1e6, 1.1e6, 8e5, 8e5), "MAX").headline).toContain(
      "since you started",
    );
  });
});

describe("chartNotes — density", () => {
  it("gives a one-month window exactly one note", () => {
    const r = chartNotes(series(1_000_000, 1_200_000, 800_000, 900_000), "1M");
    expect(r.notes).toHaveLength(1);
  });

  it("never exceeds three notes on the longest window", () => {
    const r = chartNotes(series(1_000_000, 1_200_000, 800_000, 900_000, 400), "MAX");
    expect(r.notes.length).toBeLessThanOrEqual(3);
  });

  it("scales between the two", () => {
    const s = series(1_000_000, 1_200_000, 800_000, 900_000, 120);
    expect(chartNotes(s, "3M").notes.length).toBeLessThanOrEqual(2);
    expect(chartNotes(s, "1Y").notes.length).toBeLessThanOrEqual(3);
  });
});

describe("chartNotes — the notes themselves", () => {
  it("calls out an all-time high when today is the peak", () => {
    const r = chartNotes(series(1_000_000, 1_400_000, 800_000, 800_000), "1Y");
    expect(r.notes.some((n) => n.includes("highest it has been"))).toBe(true);
  });

  it("reports the distance below a peak that has passed", () => {
    const rising = series(1_000_000, 1_400_000, 800_000, 800_000, 20);
    const falling = series(1_400_000, 1_200_000, 800_000, 800_000, 20, 20);
    const r = chartNotes([...rising, ...falling], "1Y");
    expect(r.notes.some((n) => n.includes("below its"))).toBe(true);
  });

  it("reports the worst fall inside the window", () => {
    const up = series(1_000_000, 1_500_000, 800_000, 800_000, 20);
    const down = series(1_500_000, 1_050_000, 800_000, 800_000, 20, 20);
    const back = series(1_050_000, 1_300_000, 800_000, 800_000, 20, 40);
    const r = chartNotes([...up, ...down, ...back], "MAX");
    expect(r.notes.some((n) => n.includes("Worst fall was"))).toBe(true);
  });

  it("says when the holding is still under water", () => {
    const r = chartNotes(series(900_000, 700_000, 800_000, 800_000, 40), "1Y");
    expect(r.notes.some((n) => n.includes("below what you have put in"))).toBe(true);
  });

  it("stays quiet rather than guessing on a series too short to read", () => {
    const r = chartNotes(series(1e6, 1.1e6, 8e5, 8e5, 3), "1M");
    expect(r.headline).toBeNull();
    expect(r.notes).toEqual([]);
  });

  it("returns nothing for an empty series", () => {
    const r = chartNotes([], "1Y" as Horizon);
    expect(r.headline).toBeNull();
  });
});

describe("chartNotes — moments", () => {
  it("gives a fall a span that starts at the peak before it, not at the bottom", () => {
    const up = series(1_000_000, 1_500_000, 800_000, 800_000, 20);
    const down = series(1_500_000, 1_050_000, 800_000, 800_000, 20, 20);
    const back = series(1_050_000, 1_600_000, 800_000, 800_000, 20, 40);
    const r = chartNotes([...up, ...down, ...back], "MAX");

    const fall = r.moments.find((m) => m.kind === "drawdown");
    expect(fall).toBeDefined();
    // The span must open at the pre-fall high so the highlight shows the slide.
    expect(fall!.startIdx).toBeLessThan(20);
    expect(fall!.endIdx).toBeGreaterThan(fall!.startIdx);
  });

  it("says a fall recovered when the series got back to the old high", () => {
    const up = series(1_000_000, 1_500_000, 800_000, 800_000, 20);
    const down = series(1_500_000, 1_050_000, 800_000, 800_000, 20, 20);
    const back = series(1_050_000, 1_600_000, 800_000, 800_000, 20, 40);
    const r = chartNotes([...up, ...down, ...back], "MAX");
    expect(r.moments.find((m) => m.kind === "drawdown")!.body).toContain("Back to level");
  });

  it("says a fall has NOT recovered when it never regained the high", () => {
    const up = series(1_000_000, 1_500_000, 800_000, 800_000, 20);
    const down = series(1_500_000, 1_100_000, 800_000, 800_000, 20, 20);
    const r = chartNotes([...up, ...down], "MAX");
    expect(r.moments.find((m) => m.kind === "drawdown")!.body).toContain("below that high");
  });

  it("flags a genuine lump sum but ignores a steady SIP", () => {
    // One ₹5L step inside an otherwise flat contribution line.
    const before = series(1_000_000, 1_050_000, 800_000, 800_000, 15);
    const after = series(1_550_000, 1_700_000, 1_300_000, 1_300_000, 15, 15);
    const lump = chartNotes([...before, ...after], "1Y");
    expect(lump.moments.some((m) => m.kind === "addition")).toBe(true);

    // A smooth SIP has no single step worth calling out.
    const sip = chartNotes(series(1_000_000, 1_400_000, 800_000, 1_100_000, 60), "1Y");
    expect(sip.moments.some((m) => m.kind === "addition")).toBe(false);
  });

  it("orders moments oldest first, so the rail reads like the chart", () => {
    const up = series(1_000_000, 1_500_000, 800_000, 800_000, 20);
    const down = series(1_500_000, 1_050_000, 800_000, 800_000, 20, 20);
    const r = chartNotes([...up, ...down], "MAX");
    const idxs = r.moments.map((m) => m.startIdx);
    expect([...idxs].sort((a, b) => a - b)).toEqual(idxs);
  });

  it("keeps every span inside the series", () => {
    const up = series(1_000_000, 1_500_000, 800_000, 800_000, 20);
    const down = series(1_500_000, 1_050_000, 800_000, 800_000, 20, 20);
    const pts = [...up, ...down];
    const r = chartNotes(pts, "MAX");
    for (const m of r.moments) {
      expect(m.startIdx).toBeGreaterThanOrEqual(0);
      expect(m.endIdx).toBeLessThanOrEqual(pts.length - 1);
      expect(m.startIdx).toBeLessThanOrEqual(m.endIdx);
    }
  });

  it("scales the rail's budget to the range", () => {
    const up = series(1_000_000, 1_500_000, 800_000, 800_000, 20);
    const down = series(1_500_000, 1_050_000, 800_000, 900_000, 20, 20);
    const pts = [...up, ...down];
    expect(chartNotes(pts, "1M").moments.length).toBeLessThanOrEqual(2);
    expect(chartNotes(pts, "MAX").moments.length).toBeLessThanOrEqual(5);
  });
});
