import { describe, expect, it } from "vitest";

import {
  RISK_FREE_PCT,
  annualisedReturnPct,
  bestWorstYear,
  calendarYearReturns,
  computeFundRiskMetrics,
  maxDrawdown,
  sharpeRatio,
  volatilityPct,
} from "./fundMetrics";
import type { FundNavPoint } from "@/components/fund/FundScreenUi";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Daily series compounding at a fixed yearly rate — no volatility. */
function steady(years: number, yearlyPct: number, startNav = 100): FundNavPoint[] {
  const daily = Math.pow(1 + yearlyPct / 100, 1 / 365.25) - 1;
  const start = Date.parse("2020-01-01");
  const n = Math.round(years * 365.25);
  const out: FundNavPoint[] = [];
  let nav = startNav;
  for (let i = 0; i <= n; i++) {
    out.push({ date: iso(start + i * DAY), nav });
    nav *= 1 + daily;
  }
  return out;
}

describe("fundMetrics — annualised return", () => {
  it("recovers the true CAGR of a steady series", () => {
    const pts = steady(3, 12);
    expect(annualisedReturnPct(pts, 3)).toBeCloseTo(12, 1);
  });

  it("reports plain return, not an annualised one, under a year", () => {
    // 6 months at +10%/yr compounds to ~4.9% — annualising would say ~10%.
    const pts = steady(0.5, 10);
    const r = annualisedReturnPct(pts, 1);
    expect(r).not.toBeNull();
    expect(r as number).toBeLessThan(6);
  });
});

describe("fundMetrics — volatility and ratios", () => {
  it("is ~zero for a series with no wobble", () => {
    expect(volatilityPct(steady(3, 12), 3) as number).toBeLessThan(0.01);
  });

  it("annualises daily and weekly series to the same figure", () => {
    const daily = steady(3, 12);
    // Same path sampled weekly — annualisation must not inflate it ~5x.
    const weekly = daily.filter((_, i) => i % 7 === 0);
    const vDaily = volatilityPct(daily, 3) as number;
    const vWeekly = volatilityPct(weekly, 3) as number;
    expect(Math.abs(vDaily - vWeekly)).toBeLessThan(0.5);
  });

  it("gives a positive Sharpe when the fund beats the risk-free rate", () => {
    // Alternating steps so volatility is non-zero, trending up strongly.
    const start = Date.parse("2020-01-01");
    const pts: FundNavPoint[] = [];
    let nav = 100;
    for (let i = 0; i <= 1100; i++) {
      pts.push({ date: iso(start + i * DAY), nav });
      nav *= 1 + (i % 2 === 0 ? 0.0012 : -0.0002);
    }
    const s = sharpeRatio(pts, 3);
    expect(s).not.toBeNull();
    expect(s as number).toBeGreaterThan(0);
  });

  it("returns null rather than a number when the series is too short", () => {
    expect(volatilityPct(steady(0.02, 10), 3)).toBeNull();
    expect(sharpeRatio(steady(0.02, 10), 3)).toBeNull();
  });

  it("exposes the risk-free assumption the ratios are built on", () => {
    expect(RISK_FREE_PCT).toBeGreaterThan(0);
  });
});

describe("fundMetrics — max drawdown", () => {
  it("finds the worst peak-to-trough fall and brackets it with dates", () => {
    const start = Date.parse("2021-01-01");
    const navs = [
      ...Array(40).fill(100), // flat
      ...Array(20).fill(80), // -20% fall
      ...Array(40).fill(120), // recovery past the old peak
    ];
    const pts = navs.map((nav, i) => ({ date: iso(start + i * DAY), nav }));
    const dd = maxDrawdown(pts, 3);
    expect(dd).not.toBeNull();
    expect(dd!.pct).toBeCloseTo(-20, 5);
    expect(dd!.recovered).toBe(true);
    expect(dd!.peakDate < dd!.troughDate).toBe(true);
  });

  it("marks a fall that never came back as unrecovered", () => {
    const start = Date.parse("2021-01-01");
    const navs = [...Array(50).fill(100), ...Array(50).fill(70)];
    const pts = navs.map((nav, i) => ({ date: iso(start + i * DAY), nav }));
    const dd = maxDrawdown(pts, 3);
    expect(dd!.pct).toBeCloseTo(-30, 5);
    expect(dd!.recovered).toBe(false);
  });
});

describe("fundMetrics — calendar years", () => {
  it("skips the opening partial year and reports complete ones", () => {
    // Starts mid-2020, so 2020 has no prior-year close to measure from.
    const start = Date.parse("2020-07-01");
    const pts: FundNavPoint[] = [];
    let nav = 100;
    for (let i = 0; i <= 900; i++) {
      pts.push({ date: iso(start + i * DAY), nav });
      nav *= 1.0003;
    }
    const years = calendarYearReturns(pts);
    expect(years.some((y) => y.year === 2020)).toBe(false);
    expect(years.some((y) => y.year === 2021)).toBe(true);
    for (const y of years) expect(y.pct).toBeGreaterThan(0);
  });

  it("returns nothing for a series shorter than one full year boundary", () => {
    expect(calendarYearReturns(steady(0.2, 10))).toEqual([]);
  });
});

describe("fundMetrics — best/worst year and the aggregate", () => {
  it("brackets the steady CAGR", () => {
    const bw = bestWorstYear(steady(3, 12), 3);
    expect(bw).not.toBeNull();
    expect(bw!.best).toBeGreaterThanOrEqual(bw!.worst);
    expect(bw!.best).toBeCloseTo(12, 0);
  });

  it("marks a thin series insufficient instead of emitting numbers", () => {
    const m = computeFundRiskMetrics(steady(0.05, 10), 3);
    expect(m.sufficient).toBe(false);
    expect(m.sharpe).toBeNull();
    expect(m.maxDrawdown).toBeNull();
  });

  it("marks an adequate series sufficient and fills every field", () => {
    const m = computeFundRiskMetrics(steady(3, 12), 3);
    expect(m.sufficient).toBe(true);
    expect(m.annualisedReturnPct).not.toBeNull();
    expect(m.volatilityPct).not.toBeNull();
  });
});
