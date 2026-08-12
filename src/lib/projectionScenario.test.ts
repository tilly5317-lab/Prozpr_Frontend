import { describe, it, expect, beforeEach } from "vitest";
import {
  bandForRate,
  clampRate,
  formatRate,
  PROJECTION_BASE_RATE,
  ratePct,
  readSavedRate,
  RETURN_MAX,
  scaleAnnualRowsToRate,
  writeSavedRate,
} from "./projectionScenario";
import type { AnnualCashflowRow } from "./api";

/** Minimal engine row — only the fields the scenario replay reads carry meaning. */
function row(over: Partial<AnnualCashflowRow>): AnnualCashflowRow {
  return {
    fy_end_date: "2027-03-31",
    fy_label: "FY27",
    income: 0,
    income_tax: 0,
    household_expense: 0,
    savings_pre_emi: 0,
    existing_mortgage_emi: 0,
    goal_mortgage_emi: 0,
    savings_post_emi: 0,
    one_off_inflow: 0,
    one_off_outflow: 0,
    corpus_opening: 0,
    monthly_investment: 0,
    investment_returns: 0,
    goal_payout: 0,
    corpus_closing: 0,
    is_funded: true,
    ...over,
  };
}

// Two years: 9% on the opening corpus plus 100k of contributions each year.
const ENGINE_ROWS: AnnualCashflowRow[] = [
  row({
    fy_end_date: "2027-03-31",
    corpus_opening: 1_000_000,
    investment_returns: 90_000,
    corpus_closing: 1_190_000, // 1,000,000 + 90,000 + 100,000 contributed
  }),
  row({
    fy_end_date: "2028-03-31",
    corpus_opening: 1_190_000,
    investment_returns: 107_100,
    goal_payout: 50_000,
    corpus_closing: 1_247_100, // 1,190,000 + 107,100 + 100,000 − 150,000 out
  }),
];

describe("scaleAnnualRowsToRate", () => {
  it("returns the engine's own rows untouched at the base rate", () => {
    // Identity matters: the default view must be the engine's SSOT, not a
    // client-side re-derivation that happens to round to the same number.
    expect(scaleAnnualRowsToRate(ENGINE_ROWS, 9)).toBe(ENGINE_ROWS);
  });

  it("keeps every non-return cashflow identical when the rate changes", () => {
    const scaled = scaleAnnualRowsToRate(ENGINE_ROWS, 7);
    scaled.forEach((r, i) => {
      const flowsBefore =
        ENGINE_ROWS[i].corpus_closing -
        ENGINE_ROWS[i].corpus_opening -
        ENGINE_ROWS[i].investment_returns;
      const flowsAfter = r.corpus_closing - r.corpus_opening - r.investment_returns;
      expect(flowsAfter).toBeCloseTo(flowsBefore, 6);
      expect(r.goal_payout).toBe(ENGINE_ROWS[i].goal_payout);
    });
  });

  it("compounds a lower return into a smaller corpus every year", () => {
    const cons = scaleAnnualRowsToRate(ENGINE_ROWS, 7);
    expect(cons[0].investment_returns).toBeCloseTo(70_000, 6);
    expect(cons[0].corpus_closing).toBeCloseTo(1_170_000, 6);
    // Year 2 opens on year 1's reduced closing — the gap widens, not repeats.
    expect(cons[1].corpus_opening).toBeCloseTo(1_170_000, 6);
    expect(cons[1].corpus_closing).toBeLessThan(ENGINE_ROWS[1].corpus_closing);
  });

  it("compounds a higher return into a larger corpus every year", () => {
    const opt = scaleAnnualRowsToRate(ENGINE_ROWS, 11);
    expect(opt[0].investment_returns).toBeCloseTo(110_000, 6);
    expect(opt[1].corpus_opening).toBeGreaterThan(ENGINE_ROWS[1].corpus_opening);
    expect(opt[1].corpus_closing).toBeGreaterThan(ENGINE_ROWS[1].corpus_closing);
  });

  it("replays years in date order regardless of the order they arrive in", () => {
    const fromReversed = scaleAnnualRowsToRate([...ENGINE_ROWS].reverse(), 7);
    const fromOrdered = scaleAnnualRowsToRate(ENGINE_ROWS, 7);
    expect(fromReversed.map((r) => r.fy_end_date)).toEqual(
      fromOrdered.map((r) => r.fy_end_date),
    );
    expect(fromReversed[1].corpus_closing).toBeCloseTo(fromOrdered[1].corpus_closing, 6);
  });

  it("survives a year with no opening corpus instead of dividing by zero", () => {
    const rows = [row({ corpus_opening: 0, investment_returns: 500, corpus_closing: 100_500 })];
    const scaled = scaleAnnualRowsToRate(rows, 11);
    expect(Number.isFinite(scaled[0].corpus_closing)).toBe(true);
    expect(scaled[0].investment_returns).toBeCloseTo(500 * (11 / 9), 6);
  });

  it("handles an empty plan", () => {
    expect(scaleAnnualRowsToRate([], 7)).toEqual([]);
  });
});

describe("bandForRate", () => {
  it("names each band", () => {
    expect(bandForRate(0).label).toBe("Conservative");
    expect(bandForRate(3.5).label).toBe("Conservative");
    expect(bandForRate(9).label).toBe("Base");
    expect(bandForRate(14).label).toBe("Optimistic");
  });

  it("gives a boundary to the higher band", () => {
    // 5 and 11 are the band edges the UI labels; they read as the band above.
    expect(bandForRate(5).label).toBe("Base");
    expect(bandForRate(4.5).label).toBe("Conservative");
    expect(bandForRate(11).label).toBe("Optimistic");
    expect(bandForRate(10.5).label).toBe("Base");
  });

  it("includes the top of the scale in the last band", () => {
    expect(bandForRate(RETURN_MAX).label).toBe("Optimistic");
  });

  it("puts the engine's own rate in Base", () => {
    // If this ever fails, the default view would be labelled as a scenario.
    expect(bandForRate(PROJECTION_BASE_RATE).label).toBe("Base");
  });
});

describe("clampRate / ratePct / formatRate", () => {
  it("clamps to the scale", () => {
    expect(clampRate(-4)).toBe(0);
    expect(clampRate(25)).toBe(20);
    expect(clampRate(7.5)).toBe(7.5);
  });

  it("falls back to the engine rate for a non-number", () => {
    expect(clampRate(Number.NaN)).toBe(PROJECTION_BASE_RATE);
  });

  it("maps a rate onto the track", () => {
    expect(ratePct(0)).toBe(0);
    expect(ratePct(10)).toBe(50);
    expect(ratePct(20)).toBe(100);
  });

  it("shows a decimal only when there is one", () => {
    expect(formatRate(9)).toBe("9%");
    expect(formatRate(7.5)).toBe("7.5%");
  });
});

describe("saved rate", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to the engine rate when nothing has been applied", () => {
    expect(readSavedRate()).toBe(PROJECTION_BASE_RATE);
  });

  it("round-trips an applied rate across a reload", () => {
    writeSavedRate(4.5);
    expect(readSavedRate()).toBe(4.5);
  });

  it("falls back to the engine rate for junk or out-of-range values", () => {
    // Projecting on a number the user never chose is worse than ignoring it.
    window.localStorage.setItem("goals-projection-rate", "not-a-number");
    expect(readSavedRate()).toBe(PROJECTION_BASE_RATE);
    window.localStorage.setItem("goals-projection-rate", "45");
    expect(readSavedRate()).toBe(PROJECTION_BASE_RATE);
    window.localStorage.setItem("goals-projection-rate", "-3");
    expect(readSavedRate()).toBe(PROJECTION_BASE_RATE);
  });
});
