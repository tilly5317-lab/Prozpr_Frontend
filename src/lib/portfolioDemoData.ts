/**
 * Stand-in data for the portfolio page's v2 sections when the API is down.
 *
 * ⚠️ THIS FABRICATES VERDICTS ABOUT FUNDS AND A VALUE HISTORY. ⚠️
 *
 * The v2 sections — verdict lines, "since you last looked", the action card —
 * all hide when their endpoint fails, which makes them impossible to review
 * without a running backend. This module fills that gap for design review only.
 *
 * It is used ONLY when the real call throws. A successful response, even an
 * empty one, always wins. Delete this module and the two `?? demo…` fallbacks
 * in `PortfolioDashboard.tsx` to restore the honest behaviour.
 */

import type {
  InsightFundRow,
  PortfolioDetail,
  PortfolioHistoryPoint,
  PortfolioInsightsResponse,
} from "@/lib/api";

/**
 * Verdicts that make the action card show something worth reading.
 *
 * `verdict_reason` is deliberately written as TRACK RECORD — how the fund has
 * done over years, against its category — because that is what the holdings
 * list shows. Kept to one short clause: a holdings list is skimmed, and a
 * sentence long enough to wrap stops being read at all. `rebalance_reason` is the present-tense action, and only surfaces
 * on the action card. See `reasonFor` vs `actionReasonFor`.
 */
const DEMO_FUNDS: Pick<
  InsightFundRow,
  "name" | "verdict" | "verdict_reason" | "rebalance_action" | "rebalance_reason"
>[] = [
  {
    name: "Parag Parikh Flexi Cap Fund",
    verdict: "like",
    verdict_reason: "Beat its category six of the last eight years.",
    rebalance_action: "HOLD",
    rebalance_reason: null,
  },
  {
    name: "HDFC Mid-Cap Opportunities Fund",
    verdict: "like",
    verdict_reason: "Ahead over three and five years, with shallower falls.",
    rebalance_action: "HOLD",
    rebalance_reason: null,
  },
  {
    name: "Axis Bluechip Fund",
    verdict: "neutral",
    verdict_reason: "Middle of the pack, five years running.",
    rebalance_action: "SELL",
    rebalance_reason: "Grown past the weight your plan calls for; only the excess is trimmed.",
  },
  {
    name: "Nippon India Small Cap Fund",
    verdict: "dislike",
    verdict_reason: "Bottom quartile three of the last four years.",
    rebalance_action: "EXIT",
    rebalance_reason:
      "It no longer meets the standard we hold funds to, so it is exited in full rather than trimmed.",
  },
];

/**
 * Demo insights, matched onto the user's real holdings where there are any so
 * the verdict lines land on funds actually on screen.
 */
export function demoInsights(
  portfolio: PortfolioDetail | null,
): PortfolioInsightsResponse {
  const held = portfolio?.holdings ?? [];

  const funds: InsightFundRow[] = (held.length > 0 ? held : DEMO_FUNDS).map(
    (h, i): InsightFundRow => {
      const d = DEMO_FUNDS[i % DEMO_FUNDS.length];
      const real = held.length > 0 ? (h as PortfolioDetail["holdings"][number]) : null;
      return {
        holding_id: real?.id ?? `demo-${i}`,
        scheme_code: real?.ticker_symbol ?? null,
        isin: real?.ticker_symbol ?? null,
        name: real?.instrument_name ?? d.name,
        amc_name: null,
        asset_class: real?.asset_class ?? "Equity",
        sub_category: real?.sub_category ?? null,
        current_value: real?.current_value ?? 100_000,
        invested: real?.average_cost ?? null,
        weight_pct: 0,
        holding_return_pct: null,
        nav_return_1y_pct: null,
        nav_return_3y_pct: null,
        our_rating: null,
        is_recommended: d.verdict === "like",
        rebalance_action: d.rebalance_action,
        rebalance_reason: d.rebalance_reason,
        verdict: d.verdict,
        verdict_reason: d.verdict_reason ?? "",
      };
    },
  );

  return {
    as_of: new Date().toISOString().slice(0, 10),
    holdings_total: funds.reduce((s, f) => s + f.current_value, 0),
    funds,
    benchmark: null,
    rating_floor: 3,
    rating_scale_max: 5,
    rebalancing_run_id: null,
    rebalancing_computed_at: null,
  };
}

/**
 * Two snapshots a fortnight apart, so the "since you last looked" strip has a
 * period and a delta to report.
 */
export function demoHistory(currentValue: number): PortfolioHistoryPoint[] {
  const value = currentValue > 0 ? currentValue : 5_240_120;
  const prev = new Date();
  prev.setDate(prev.getDate() - 13);
  const today = new Date();

  return [
    {
      id: "demo-prev",
      recorded_date: prev.toISOString().slice(0, 10),
      // A shade under today's, so the strip reads as a gain.
      total_value: value * 0.9919,
    },
    { id: "demo-now", recorded_date: today.toISOString().slice(0, 10), total_value: value },
  ];
}
