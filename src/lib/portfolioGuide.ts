import type {
  InsightFundRow,
  PortfolioDetail,
  PortfolioInsightsResponse,
  RebalancingAssetClassBreakdown,
} from "./api";

/**
 * Turning portfolio data into "where you stand" and "what to do next".
 *
 * Every finding and action here is derived from a number the backend already
 * computed — a weight, a return gap, a target-vs-current split, a goal
 * shortfall. Nothing is invented, and anything the data can't support simply
 * isn't produced: no rebalancing run means no rebalancing action, rather than a
 * generic "consider rebalancing" that the user can't act on.
 *
 * Thresholds are named because they are judgement calls, not facts.
 */

/** A single fund above this share of the portfolio is worth flagging. */
const CONCENTRATION_PCT = 25;
/** Trailing the index by more than this over 1Y counts as underperforming. */
const LAG_PP = 5;
/** Asset-class drift from target beyond this is worth acting on. */
const DRIFT_PP = 5;
/** Weight in funds we'd replace, above which it becomes a concern not a watch. */
const REPLACE_CONCERN_PCT = 15;

export type FindingTone = "good" | "watch" | "concern";

export interface Finding {
  tone: FindingTone;
  title: string;
  detail: string;
}

export interface GuideAction {
  /** Imperative and specific — "Trim equity by ₹4.2L", not "review allocation". */
  title: string;
  why: string;
  /** Where the user goes to do it. */
  cta?: { label: string; to: string };
  /** Ranking key — roughly the rupees or portfolio share at stake. */
  weight: number;
  /** Rough horizon, shown as a chip. */
  when: string;
}

export interface GuideInput {
  insights: PortfolioInsightsResponse | null;
  portfolio: PortfolioDetail | null;
  /** Portfolio TWR minus the index over the same window, in percentage points. */
  benchmarkGapPct: number | null;
  /** Backend current-vs-target asset split; null when no rebalancing run exists. */
  assetClassBreakdown: RebalancingAssetClassBreakdown | null;
  /** Goal funding gap in today's money. Positive = short. Null when no plan. */
  goalShortfallToday: number | null;
}

export interface PortfolioGuide {
  findings: Finding[];
  actions: GuideAction[];
  /** True when there simply isn't enough data to say anything useful yet. */
  empty: boolean;
}

function fmtInr(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(a)}`;
}

function fmtPp(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}pp`;
}

function sumWeight(funds: InsightFundRow[]): number {
  return funds.reduce((s, f) => s + f.weight_pct, 0);
}

/** Funds trailing the benchmark by more than LAG_PP over 1Y. */
function laggards(insights: PortfolioInsightsResponse): InsightFundRow[] {
  const bench = insights.benchmark?.return_1y_pct;
  if (bench == null) return [];
  return insights.funds.filter(
    (f) => f.nav_return_1y_pct != null && f.nav_return_1y_pct - bench < -LAG_PP,
  );
}

export function buildPortfolioGuide(input: GuideInput): PortfolioGuide {
  const { insights, portfolio, benchmarkGapPct, assetClassBreakdown, goalShortfallToday } = input;
  const findings: Finding[] = [];
  const actions: GuideAction[] = [];

  const funds = insights?.funds ?? [];
  const liked = funds.filter((f) => f.verdict === "like");
  const disliked = funds.filter((f) => f.verdict === "dislike");
  const unrated = funds.filter((f) => f.verdict === "neutral");
  const dislikedWeight = sumWeight(disliked);
  const lagging = insights ? laggards(insights) : [];

  // ── What's going well ────────────────────────────────────────────────────
  if (benchmarkGapPct != null && benchmarkGapPct > 0) {
    findings.push({
      tone: "good",
      title: `Your funds are ahead of the Nifty 50 by ${fmtPp(benchmarkGapPct)}`,
      detail: "Your fund picks are adding value over a plain index fund on this window.",
    });
  }
  if (liked.length > 0) {
    findings.push({
      tone: "good",
      title: `${sumWeight(liked).toFixed(0)}% of your money is in funds we rate`,
      detail: `${liked.length} ${liked.length === 1 ? "fund is" : "funds are"} on our recommended list and above our rating floor.`,
    });
  }
  if (portfolio && portfolio.total_gain_percentage != null && portfolio.total_gain_percentage > 0) {
    findings.push({
      tone: "good",
      title: `You're up ${portfolio.total_gain_percentage.toFixed(1)}% on what you've put in`,
      detail: `${fmtInr(portfolio.total_value - portfolio.total_invested)} of gain across the portfolio.`,
    });
  }

  // ── What isn't working ───────────────────────────────────────────────────
  if (benchmarkGapPct != null && benchmarkGapPct < 0) {
    findings.push({
      tone: "watch",
      title: `Your funds trail the Nifty 50 by ${fmtPp(benchmarkGapPct)}`,
      detail: "A low-cost index fund would have done better over this window.",
    });
  }
  if (lagging.length > 0) {
    findings.push({
      tone: "watch",
      title: `${lagging.length} ${lagging.length === 1 ? "fund is" : "funds are"} well behind the index`,
      detail: `${sumWeight(lagging).toFixed(0)}% of the portfolio, trailing by more than ${LAG_PP} points over a year.`,
    });
  }

  // ── Concerns ─────────────────────────────────────────────────────────────
  if (disliked.length > 0) {
    findings.push({
      tone: dislikedWeight >= REPLACE_CONCERN_PCT ? "concern" : "watch",
      title: `${dislikedWeight.toFixed(0)}% sits in funds we'd replace`,
      detail: `${disliked.length} ${disliked.length === 1 ? "fund is" : "funds are"} off our list, below our rating floor, or flagged to exit.`,
    });
  }
  const biggest = [...funds].sort((a, b) => b.weight_pct - a.weight_pct)[0];
  if (biggest && biggest.weight_pct > CONCENTRATION_PCT) {
    findings.push({
      tone: "concern",
      title: `${biggest.weight_pct.toFixed(0)}% of everything is in one fund`,
      detail: `A single fund carrying that much means its bad year is your bad year.`,
    });
  }
  if (assetClassBreakdown) {
    for (const row of assetClassBreakdown.rows) {
      const total = assetClassBreakdown.current_total_inr;
      if (total <= 0) continue;
      const currentPct = (row.current_inr / total) * 100;
      const targetPct =
        assetClassBreakdown.target_total_inr > 0
          ? (row.target_inr / assetClassBreakdown.target_total_inr) * 100
          : 0;
      const drift = currentPct - targetPct;
      if (Math.abs(drift) < DRIFT_PP) continue;
      findings.push({
        tone: Math.abs(drift) >= DRIFT_PP * 2 ? "concern" : "watch",
        title: `${row.asset_class} is ${drift > 0 ? "over" : "under"} target by ${Math.abs(drift).toFixed(0)} points`,
        detail: `${currentPct.toFixed(0)}% held against a ${targetPct.toFixed(0)}% target for your risk profile.`,
      });
    }
  }
  if (unrated.length > 0 && sumWeight(unrated) >= 10) {
    findings.push({
      tone: "watch",
      title: `${sumWeight(unrated).toFixed(0)}% is in funds we haven't rated`,
      detail: "We can't tell you whether these are worth holding yet.",
    });
  }

  // ── What to do, ranked by what's at stake ────────────────────────────────
  if (disliked.length > 0) {
    const rupees = disliked.reduce((s, f) => s + f.current_value, 0);
    actions.push({
      title: `Move ${fmtInr(rupees)} out of ${disliked.length} fund${disliked.length === 1 ? "" : "s"} we'd replace`,
      why: `${disliked
        .slice(0, 2)
        .map((f) => f.verdict_reason.toLowerCase())
        .join("; ")}. Switching costs tax, so do it with a plan rather than all at once.`,
      cta: { label: "See the switch plan", to: "/invest/rebalance-explanation" },
      weight: rupees,
      when: "Next 3 months",
    });
  }

  if (assetClassBreakdown) {
    const total = assetClassBreakdown.current_total_inr;
    const worst = [...assetClassBreakdown.rows]
      .map((r) => ({ row: r, gap: r.current_inr - r.target_inr }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0];
    if (worst && total > 0 && Math.abs(worst.gap) / total >= DRIFT_PP / 100) {
      const over = worst.gap > 0;
      actions.push({
        title: `${over ? "Trim" : "Top up"} ${worst.row.asset_class} by ${fmtInr(Math.abs(worst.gap))}`,
        why: over
          ? `You're carrying more ${worst.row.asset_class.toLowerCase()} than your risk profile calls for. Spreading the trim over the year keeps the tax bill down.`
          : `You're short of your ${worst.row.asset_class.toLowerCase()} target, which leaves the plan more exposed than intended.`,
        cta: { label: "Open rebalancing", to: "/invest/rebalance-explanation" },
        weight: Math.abs(worst.gap),
        when: "Over the next year",
      });
    }
  }

  if (goalShortfallToday != null && goalShortfallToday > 0) {
    actions.push({
      title: `Close a ${fmtInr(goalShortfallToday)} gap to your goals`,
      why: "On today's plan your goals aren't fully funded. Raising the monthly SIP is usually the cheapest fix — earlier money compounds longest.",
      cta: { label: "Adjust your plan", to: "/goal-planner" },
      weight: goalShortfallToday,
      when: "Start this month",
    });
  }

  if (lagging.length > 0) {
    const rupees = lagging.reduce((s, f) => s + f.current_value, 0);
    actions.push({
      title: `Review ${lagging.length} fund${lagging.length === 1 ? "" : "s"} lagging the index`,
      why: "One weak year isn't a reason to sell, but a persistent gap is. Check whether the mandate still fits before you decide.",
      cta: { label: "See fund performance", to: "/portfolio" },
      // Ranked below the hard problems: this is a look, not a trade.
      weight: rupees * 0.25,
      when: "At your next review",
    });
  }

  if (unrated.length > 0 && sumWeight(unrated) >= 10) {
    actions.push({
      title: `Get a view on ${unrated.length} unrated fund${unrated.length === 1 ? "" : "s"}`,
      why: "We don't have a rating for these yet, so they sit outside the plan's quality checks.",
      weight: unrated.reduce((s, f) => s + f.current_value, 0) * 0.1,
      when: "No rush",
    });
  }

  actions.sort((a, b) => b.weight - a.weight);

  return { findings, actions, empty: findings.length === 0 && actions.length === 0 };
}
