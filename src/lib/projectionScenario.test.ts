import { describe, it, expect, beforeEach } from "vitest";
import {
  BASE_SCENARIO_ID,
  readSavedScenarioId,
  scaleAnnualRowsToRate,
  writeSavedScenarioId,
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

describe("saved scenario", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults to Base when nothing has been applied", () => {
    expect(readSavedScenarioId()).toBe(BASE_SCENARIO_ID);
  });

  it("round-trips an applied scenario across a reload", () => {
    writeSavedScenarioId("cons");
    expect(readSavedScenarioId()).toBe("cons");
  });

  it("falls back to Base for an unknown stored id", () => {
    // A renamed or removed scenario must not resolve to Base's numbers while
    // still being labelled with the dead id.
    window.localStorage.setItem("goals-projection-scenario", "aggressive-2019");
    expect(readSavedScenarioId()).toBe(BASE_SCENARIO_ID);
  });
});
