import { describe, it, expect } from "vitest";
import { buildPortfolioGuide, type GuideInput } from "./portfolioGuide";
import type { InsightFundRow, PortfolioInsightsResponse } from "./api";

function fund(over: Partial<InsightFundRow>): InsightFundRow {
  return {
    holding_id: Math.random().toString(36).slice(2),
    scheme_code: "120503",
    isin: null,
    name: "A Fund",
    amc_name: null,
    asset_class: "Equity",
    sub_category: "Large Cap",
    current_value: 100_000,
    invested: 90_000,
    weight_pct: 10,
    holding_return_pct: 11,
    nav_return_1y_pct: 12,
    nav_return_3y_pct: null,
    our_rating: 8,
    is_recommended: true,
    rebalance_action: null,
    rebalance_reason: null,
    verdict: "like",
    verdict_reason: "Rated 8/10 by us",
    ...over,
  };
}

function insights(funds: InsightFundRow[], bench1y = 12): PortfolioInsightsResponse {
  return {
    as_of: "2026-08-01",
    holdings_total: funds.reduce((s, f) => s + f.current_value, 0),
    funds,
    benchmark: {
      code: "NIFTY 50",
      display_name: "Nifty 50 TRI",
      return_1y_pct: bench1y,
      return_3y_pct: null,
    },
    rating_floor: 5,
    rating_scale_max: 10,
    rebalancing_run_id: null,
    rebalancing_computed_at: null,
  };
}

const EMPTY: GuideInput = {
  insights: null,
  portfolio: null,
  benchmarkGapPct: null,
  assetClassBreakdown: null,
  goalShortfallToday: null,
};

describe("buildPortfolioGuide", () => {
  it("says nothing when there is nothing to say", () => {
    const g = buildPortfolioGuide(EMPTY);
    expect(g.empty).toBe(true);
    expect(g.findings).toEqual([]);
    expect(g.actions).toEqual([]);
  });

  it("credits beating the index and flags trailing it", () => {
    const ahead = buildPortfolioGuide({ ...EMPTY, benchmarkGapPct: 3.4 });
    expect(ahead.findings[0].tone).toBe("good");
    expect(ahead.findings[0].title).toContain("+3.4pp");

    const behind = buildPortfolioGuide({ ...EMPTY, benchmarkGapPct: -2.1 });
    expect(behind.findings[0].tone).toBe("watch");
    expect(behind.findings[0].title).toContain("−2.1pp");
  });

  it("escalates funds-to-replace from watch to concern on weight", () => {
    const small = buildPortfolioGuide({
      ...EMPTY,
      insights: insights([fund({ verdict: "dislike", weight_pct: 5 })]),
    });
    expect(small.findings.find((f) => f.title.includes("replace"))?.tone).toBe("watch");

    const big = buildPortfolioGuide({
      ...EMPTY,
      insights: insights([fund({ verdict: "dislike", weight_pct: 30 })]),
    });
    expect(big.findings.find((f) => f.title.includes("replace"))?.tone).toBe("concern");
  });

  it("flags a single fund carrying too much of the portfolio", () => {
    const g = buildPortfolioGuide({
      ...EMPTY,
      insights: insights([fund({ weight_pct: 40 }), fund({ weight_pct: 10 })]),
    });
    const conc = g.findings.find((f) => f.title.includes("one fund"));
    expect(conc?.tone).toBe("concern");
    expect(conc?.title).toContain("40%");
  });

  it("does not flag concentration at a reasonable weight", () => {
    const g = buildPortfolioGuide({
      ...EMPTY,
      insights: insights([fund({ weight_pct: 20 })]),
    });
    expect(g.findings.find((f) => f.title.includes("one fund"))).toBeUndefined();
  });

  it("counts only funds well behind the index as laggards", () => {
    const g = buildPortfolioGuide({
      ...EMPTY,
      // Index 12%: 4% is a real lag, 9% is inside the tolerance.
      insights: insights([
        fund({ nav_return_1y_pct: 4, weight_pct: 12 }),
        fund({ nav_return_1y_pct: 9, weight_pct: 12 }),
      ]),
    });
    const lag = g.findings.find((f) => f.title.includes("behind the index"));
    expect(lag?.title).toContain("1 fund");
  });

  it("produces no rebalancing action without a rebalancing run", () => {
    // A generic "consider rebalancing" the user can't act on is worse than silence.
    const g = buildPortfolioGuide({
      ...EMPTY,
      insights: insights([fund({})]),
    });
    expect(g.actions.find((a) => a.title.includes("Trim"))).toBeUndefined();
  });

  it("turns an over-target asset class into a trim action", () => {
    const g = buildPortfolioGuide({
      ...EMPTY,
      insights: insights([fund({})]),
      assetClassBreakdown: {
        rows: [
          { asset_class: "Equity", current_inr: 800_000, target_inr: 600_000 },
          { asset_class: "Debt", current_inr: 200_000, target_inr: 400_000 },
        ],
        current_total_inr: 1_000_000,
        target_total_inr: 1_000_000,
      },
      goalShortfallToday: null,
    });
    const trim = g.actions.find((a) => a.title.startsWith("Trim"));
    expect(trim?.title).toContain("Equity");
    expect(trim?.title).toContain("₹2.0L");
  });

  it("turns a goal shortfall into a plan action", () => {
    const g = buildPortfolioGuide({ ...EMPTY, goalShortfallToday: 1_500_000 });
    const gap = g.actions.find((a) => a.title.includes("gap to your goals"));
    expect(gap?.title).toContain("₹15.0L");
    expect(gap?.cta?.to).toBe("/goal-planner");
  });

  it("ignores a surplus — only a shortfall is an action", () => {
    const g = buildPortfolioGuide({ ...EMPTY, goalShortfallToday: -400_000 });
    expect(g.actions).toEqual([]);
  });

  it("ranks actions by what is at stake, hard problems first", () => {
    const g = buildPortfolioGuide({
      ...EMPTY,
      insights: insights([
        fund({ verdict: "dislike", current_value: 900_000, weight_pct: 45 }),
        fund({ nav_return_1y_pct: 2, current_value: 400_000, weight_pct: 20 }),
      ]),
      goalShortfallToday: 100_000,
    });
    // Money to move out of bad funds outranks a smaller goal gap, which outranks
    // a discretionary review.
    expect(g.actions[0].title).toContain("Move");
    expect(g.actions[g.actions.length - 1].title).toContain("Review");
  });
});
