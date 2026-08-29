/**
 * Prozpr's own read on each fund the user holds, and the one action worth
 * putting in front of them.
 *
 * All of it is REAL: `/portfolio/insights` already computes a verdict, a reason
 * and the latest rebalancing call per fund. v1 buried that behind a modal; this
 * module is the lookup that lets the page show it inline.
 */

import type { InsightFundRow, PortfolioInsightsResponse } from "@/lib/api";

export type Verdict = "like" | "dislike" | "neutral";

/** Colours for the verdict dot. Only three states, so only three colours. */
export const VERDICT_COLOR: Record<Verdict, string> = {
  like: "hsl(151 55% 38%)",
  neutral: "hsl(38 74% 48%)",
  dislike: "hsl(4 70% 50%)",
};

export const VERDICT_LABEL: Record<Verdict, string> = {
  like: "We'd hold this",
  neutral: "No strong view",
  dislike: "Worth a look",
};

/**
 * Index the insights feed by every key a holding row might be known by.
 *
 * The dashboard's holdings come from the portfolio endpoint and the verdicts
 * from the insights endpoint; they agree on ISIN and scheme code but not
 * reliably on name, so all three are indexed and matched in that order.
 */
export function indexVerdicts(
  insights: PortfolioInsightsResponse | null,
): Map<string, InsightFundRow> {
  const map = new Map<string, InsightFundRow>();
  if (!insights) return map;
  for (const f of insights.funds) {
    if (f.holding_id) map.set(`id:${f.holding_id}`, f);
    if (f.isin) map.set(`isin:${f.isin.toLowerCase()}`, f);
    if (f.scheme_code) map.set(`code:${f.scheme_code.toLowerCase()}`, f);
    if (f.name) map.set(`name:${normalise(f.name)}`, f);
  }
  return map;
}

/** Loose name match — folio suffixes and plan wording differ between feeds. */
export function normalise(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/\s*·\s*folio.*$/i, "")
    .replace(/\s*[-–]\s*(direct|regular)\s+plan\b.*$/i, "")
    .replace(/\s+growth(?:\s+option)?$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Find the verdict for one holding, trying the strongest key first. */
export function verdictFor(
  map: Map<string, InsightFundRow>,
  holding: { id?: string | null; ticker_symbol?: string | null; instrument_name?: string | null },
): InsightFundRow | null {
  if (holding.id && map.has(`id:${holding.id}`)) return map.get(`id:${holding.id}`)!;
  const t = holding.ticker_symbol?.toLowerCase();
  if (t) {
    if (map.has(`isin:${t}`)) return map.get(`isin:${t}`)!;
    if (map.has(`code:${t}`)) return map.get(`code:${t}`)!;
  }
  if (holding.instrument_name) {
    const n = `name:${normalise(holding.instrument_name)}`;
    if (map.has(n)) return map.get(n)!;
  }
  return null;
}

/**
 * The single line worth showing under a holding.
 *
 * Prefers `verdict_reason` — how the fund has actually done — over
 * `rebalance_reason`, which describes what the plan wants to do about it now.
 *
 * The two answer different questions. Reading down a holdings list, "ahead of
 * its category over three and five years, with a shallower drawdown" tells you
 * something about the fund; "only the excess is trimmed" tells you about a
 * pending trade, which belongs on the rebalancing screen where the trade is.
 * The action still surfaces — it drives the verdict dot and the action card.
 */
export function reasonFor(row: InsightFundRow): string | null {
  const v = (row.verdict_reason || "").trim();
  if (v) return v;
  const r = (row.rebalance_reason || "").trim();
  return r || null;
}

/**
 * The line for the action card, which IS about what to do next — so here the
 * priority is the other way round.
 */
export function actionReasonFor(row: InsightFundRow): string | null {
  const r = (row.rebalance_reason || "").trim();
  if (r) return r;
  const v = (row.verdict_reason || "").trim();
  return v || null;
}

export interface NextAction {
  /** What the user should consider doing. */
  title: string;
  /** Why — one sentence, drawn from the fund's own reason where there is one. */
  detail: string;
  /** Where the CTA goes. */
  href: string;
  cta: string;
  /** Severity, driving the accent. */
  tone: "act" | "watch" | "calm";
}

/**
 * Pick the one thing worth surfacing.
 *
 * Ordered by how much it costs the user to ignore: a fund the plan wants out of
 * beats a fund we merely dislike, which beats having nothing to say. Returns
 * null when the portfolio is genuinely fine — an action card that invents work
 * to look useful is worse than no card.
 */
export function nextAction(
  insights: PortfolioInsightsResponse | null,
): NextAction | null {
  if (!insights || insights.funds.length === 0) return null;

  const exiting = insights.funds.filter(
    (f) => (f.rebalance_action || "").toUpperCase() === "EXIT",
  );
  if (exiting.length > 0) {
    const f = exiting[0];
    return {
      title:
        exiting.length === 1
          ? `Your plan wants out of ${shortName(f.name)}`
          : `Your plan wants out of ${exiting.length} funds`,
      detail: actionReasonFor(f) ?? "It no longer meets the quality bar we hold funds to.",
      href: "/invest/rebalance-explanation",
      cta: "See the plan",
      tone: "act",
    };
  }

  const disliked = insights.funds.filter((f) => f.verdict === "dislike");
  if (disliked.length > 0) {
    const f = disliked[0];
    return {
      title:
        disliked.length === 1
          ? `${shortName(f.name)} is worth a look`
          : `${disliked.length} funds are worth a look`,
      detail: actionReasonFor(f) ?? "It isn't a fund we'd pick today.",
      href: "/invest/rebalance-explanation",
      cta: "See why",
      tone: "watch",
    };
  }

  const selling = insights.funds.filter((f) =>
    ["SELL", "BUY"].includes((f.rebalance_action || "").toUpperCase()),
  );
  if (selling.length > 0) {
    return {
      title: "Your mix has drifted from plan",
      detail: `${selling.length} ${selling.length === 1 ? "fund needs" : "funds need"} adjusting to get back to your target allocation.`,
      href: "/invest/rebalance-explanation",
      cta: "See the trades",
      tone: "watch",
    };
  }

  return {
    title: "Nothing needs doing",
    detail: "Every fund you hold clears our quality bar and your mix is close to plan.",
    href: "/invest/sip",
    cta: "Keep investing",
    tone: "calm",
  };
}

/** Trim a scheme name to something that fits a headline. */
export function shortName(raw: string): string {
  return (raw || "")
    .replace(/\s*·\s*Folio.*$/i, "")
    .replace(/\s*[-–]\s*(Direct|Regular)\s+Plan\b.*$/i, "")
    .replace(/\s+Fund$/i, "")
    .trim();
}
