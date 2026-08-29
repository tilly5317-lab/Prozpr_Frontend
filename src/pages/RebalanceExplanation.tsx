import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, HelpCircle, Info, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { CurrentVsTargetChart } from "@/components/invest/CurrentVsTargetChart";
import { Skeleton } from "@/components/ui/skeleton";
import RebalanceGate from "@/components/invest/RebalanceGate";
import { ComputeProgressSteps } from "@/components/invest/ComputeProgressSteps";
import TradeFundDetailView from "@/components/fund/TradeFundDetailView";
import { toast } from "@/hooks/use-toast";
import { useComputeProgress } from "@/hooks/useComputeProgress";
import {
  getMyPortfolio,
  getRebalanceComputeProgress,
  getRebalancingRunDetail,
  listRebalancingRuns,
  runRebalancing,
  updateRebalancingStatus,
  type PortfolioDetail,
  type RebalancingAssetClassBreakdown,
  type RebalancingRunDetail,
  type RebalancingSubgroupSummary,
  type RebalancingTrade,
} from "@/lib/api";

/* ── Buckets — the drift section groups the engine's asset_subgroups into three
   asset classes (Equity / Debt / Others). The asset_class is computed by the
   backend (scheme_classification.asset_class_for_subgroup) and shipped on each
   subgroup_summary / trade, so there is no client-side classification. ── */
type Bucket = "equity" | "debt" | "others";

// Sequential pre-flight checks shown after "Approve plan" (mock; each spends ~2s
// running its sub-checks, ticks green, then the next starts).
const PREFLIGHT_STEPS: { label: string; checks: string[] }[] = [
  {
    label: "Eligibility & KYC",
    checks: ["KYC status", "Purchase / redemption constraints", "Min / max amount thresholds"],
  },
  {
    label: "Backend order review",
    checks: ["Investment account", "Scheme (ISIN)", "Amount / units", "Order type"],
  },
  { label: "Consent / 2FA — please approve", checks: [] },
];

const BUCKET_ORDER: Bucket[] = ["equity", "debt", "others"];
const BUCKET_META: Record<Bucket, { label: string; color: string }> = {
  equity: { label: "Equity", color: "#2563EB" },
  debt: { label: "Debt", color: "hsl(188 52% 41%)" },
  others: { label: "Others", color: "hsl(38 64% 47%)" },
};

// Normalize the backend's canonical asset_class ("Equity" / "Debt" / "Others")
// to our internal lowercase Bucket key. Unknown / null → "others".
function toBucket(assetClass: string | null | undefined): Bucket {
  const v = (assetClass ?? "").toLowerCase();
  if (v === "equity" || v === "debt" || v === "others") return v;
  return "others";
}

type DriftRow = {
  key: Bucket;
  label: string;
  color: string;
  current: number; // %
  target: number; // %
  currentInr: number; // ₹ held today
  targetInr: number; // ₹ the plan targets
  amountText: string;
};

type UITrade = {
  id: string;
  isin: string;
  type: "BUY" | "SELL";
  bucket: Bucket;
  amount: string;
  subtitle: string;
  name: string;
  category: string;
  rationale: string;
  reasonCode: string;
};

/* Proposed trades are grouped by *why* the engine recommends them. Each group
   may cover several reason_codes; unknown codes fall back to the trade's own
   reason_title. Order = most-actionable first. `color` highlights a heading. */
// Colour rule: buys are green, everything else is orange.
const BUY_GREEN = "#2E9C7E";
const TRADE_ORANGE = "#E0772F";

/* `blurb` explains the rule behind the whole group, so the per-trade rationale
   underneath doesn't have to restate it on every row; `detail` is the long-form
   version behind the heading's info button — why that's a BUY / SELL / HOLD and
   how the number was chosen. Both are kept in step with the engine rules on
   /invest/how-it-works — if one changes, change both. */
type ReasonDetail = {
  /** The action every row in the group carries. */
  action: "BUY" | "SELL" | "HOLD";
  /** What puts a fund in this group in the first place. */
  trigger: string;
  /** Why that condition is worth acting on. */
  why: string;
  /** How the rupee figure on each row is arrived at. */
  sizing: string;
  /** The guard-rail — what the engine deliberately won't do here. */
  guardrail: string;
};

const REASON_GROUPS: {
  codes: string[];
  label: string;
  color?: string;
  blurb: string;
  detail: ReasonDetail;
}[] = [
  {
    codes: ["exit_low_rated"],
    label: "Underperformance",
    color: TRADE_ORANGE,
    blurb:
      "These have slipped below our quality bar. A fund that no longer meets the standard is exited in full rather than trimmed — size isn't the issue, quality is.",
    detail: {
      action: "SELL",
      trigger:
        "The fund has dropped below the quality bar every holding is measured against — long-run risk-adjusted returns, consistency against its own category, and the fund house behind it. It takes a sustained slide to land here, not one weak quarter.",
      why:
        "Holding a fund we would no longer recommend costs you either way: you pay tax to leave, or you pay in returns to stay. Once quality is the problem, leaving is the cheaper of the two.",
      sizing:
        "The entire position, whatever it is worth. Size isn't what put it here, so trimming wouldn't fix anything.",
      guardrail:
        "This is the one rule that overrides leaving small drifts alone and waiting for long-term units, so a sale here can carry short-term tax. Tax-locked holdings such as ELSS still in lock-in are shown but never sold.",
    },
  },
  {
    codes: ["exit_bad_fund", "migrate_neutral_to_recommended"],
    label: "Not on recommended list",
    color: TRADE_ORANGE,
    blurb:
      "These aren't funds we'd choose today. Where the gap is real we move the money to a current pick; anything only a shade behind is left alone rather than switched for the sake of it.",
    detail: {
      action: "SELL",
      trigger:
        "The fund isn't one we would pick for you today — either it falls short on its own, or a fund we do recommend in the same category is meaningfully ahead of it.",
      why:
        "You're carrying a fund's fees and its manager's decisions without a current case for holding it. Moving the money buys the same market exposure from a manager we would back today.",
      sizing:
        "An outright exit sells the whole position; a migration moves it across to the recommended fund, so you'll usually see a matching BUY in the same asset class on this plan.",
      guardrail:
        "A fund only a shade behind our top pick is left alone. We don't churn a decent fund you already hold for a marginally better one and hand you the tax bill for it.",
    },
  },
  {
    codes: ["sell_excess_direct_stocks"],
    label: "Reduce single-stock risk",
    color: TRADE_ORANGE,
    blurb:
      "Direct equity here is a large enough slice that one company's bad year would move your whole portfolio. We trim it back to a weight where no single stock can do that.",
    detail: {
      action: "SELL",
      trigger:
        "Shares held directly add up to a larger share of your portfolio than any single company's fortunes should be allowed to decide.",
      why:
        "Inside a fund, one company going wrong is diluted across dozens of holdings. Held directly, it lands on your portfolio at full weight — and a goal with a date on it can't wait out that kind of hit.",
      sizing:
        "Only the amount above the limit. The rest of the position stays exactly where it is.",
      guardrail:
        "We trim to the limit, not to zero — this is about concentration, not a view on the company. Routine trims like this only touch units held long enough to qualify for the lower long-term tax rate.",
    },
  },
  {
    codes: ["trim_over_target"],
    label: "Trim back to target",
    color: TRADE_ORANGE,
    blurb:
      "These have grown past the weight your plan calls for — usually because they did well. Only the excess is sold, and only units held long enough to qualify for the lower long-term tax rate.",
    detail: {
      action: "SELL",
      trigger:
        "The fund has grown past the weight your plan calls for, by enough to matter. Usually that's a good problem — it ran ahead of everything else you hold.",
      why:
        "A winner left unchecked quietly turns into your biggest risk: the mix you signed up for drifts into a more aggressive one without you choosing it. Selling the excess locks in part of that run and funds the buys above.",
      sizing:
        "Only the amount above target — never the whole holding. We sell no more than the purchases actually need, taking whichever units cost the least tax first.",
      guardrail:
        "Routine trims only touch units held long enough to qualify for the lower long-term rate; short-term tax is never triggered just to tidy up. And if the plan would sell one fund only to buy a near-identical one, both sides are cancelled — that swap changes nothing you own but the tax is real.",
    },
  },
  {
    codes: ["cap_spill_buy"],
    label: "Diversifying allocation",
    color: BUY_GREEN,
    blurb:
      "Buying the full amount in one fund would have pushed it past its concentration limit, so the remainder spreads across others in the same asset class — same exposure, more than one manager.",
    detail: {
      action: "BUY",
      trigger:
        "This asset class needs more money than any one fund should hold, so the top-ranked pick filled up to its cap and the remainder spilled to the next fund down the list.",
      why:
        "The exposure you end up with is the same either way. What changes is that no single fund manager is responsible for all of it — which is why one category sometimes shows up as two buys.",
      sizing:
        "Whatever was left over once the higher-ranked fund reached its concentration cap.",
      guardrail:
        "The cap applies to money going in. If you're already above it in a good fund, we don't force a sale to correct it — future purchases simply go elsewhere until the balance evens out.",
    },
  },
  {
    codes: ["add_to_target"],
    label: "Top up to target",
    color: BUY_GREEN,
    blurb:
      "These sit below the weight your plan calls for. New money goes here first, so the gap closes without selling anything you already hold.",
    detail: {
      action: "BUY",
      trigger:
        "The asset class sits below the weight your goals and their time horizons call for, by more than a rounding-level drift.",
      why:
        "Buying closes the gap without touching anything you already own, so nothing is realised and no tax is triggered. It's the cheapest way back to plan, which is why money is aimed here first.",
      sizing:
        "The distance between where the class is today and where the plan wants it, spread across the recommended funds in that class and rounded to a clean amount.",
      guardrail:
        "Purchases never exceed the cash the sales actually raise — if they'd fall short, the buys are scaled down to match. Gaps too small to matter are left alone rather than traded.",
    },
  },
];

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function compactINR(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${Math.round(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

function buildDriftRows(
  subs: RebalancingSubgroupSummary[],
  holdings: PortfolioDetail["holdings"] = [],
): DriftRow[] {
  if (!subs.length && !holdings.length) return [];
  const agg: Record<Bucket, { current: number; target: number; inSubs: boolean }> = {
    equity: { current: 0, target: 0, inSubs: false },
    debt: { current: 0, target: 0, inSubs: false },
    others: { current: 0, target: 0, inSubs: false },
  };
  for (const s of subs) {
    const b = toBucket(s.asset_class);
    agg[b].current += s.current_holding_inr || 0;
    // "Target" here = where THIS PLAN lands (suggested_final_holding_inr), not the
    // unconstrained goal ideal (goal_target_inr). This keeps the bars consistent
    // with the trades: a class the plan sells reads as overweight (current > target).
    agg[b].target += s.suggested_final_holding_inr || 0;
    agg[b].inSubs = true;
  }
  // Show every asset class the user actually holds — even ones the rebalancing
  // run didn't touch (no recommendation). Those fill from the live portfolio with
  // target = current so the row reads "On target".
  const heldByBucket: Record<Bucket, number> = { equity: 0, debt: 0, others: 0 };
  for (const h of holdings) heldByBucket[toBucket(h.asset_class)] += h.current_value || 0;
  for (const b of BUCKET_ORDER) {
    if (!agg[b].inSubs && heldByBucket[b] > 0) {
      agg[b].current = heldByBucket[b];
      agg[b].target = heldByBucket[b];
    }
  }
  return formatDriftRows(agg);
}

/* Shared formatter: turn per-bucket current/target ₹ into rendered DriftRows
   (percentages + overweight/underweight caption). Used by both the backend
   breakdown path and the legacy subgroup-rollup fallback. */
function formatDriftRows(agg: Record<Bucket, { current: number; target: number }>): DriftRow[] {
  const totalCur = BUCKET_ORDER.reduce((sum, b) => sum + agg[b].current, 0);
  const totalTgt = BUCKET_ORDER.reduce((sum, b) => sum + agg[b].target, 0);

  return BUCKET_ORDER.filter((b) => agg[b].current > 0 || agg[b].target > 0).map((b) => {
    const currentPct = totalCur > 0 ? (agg[b].current / totalCur) * 100 : 0;
    const targetPct = totalTgt > 0 ? (agg[b].target / totalTgt) * 100 : 0;
    const drift = currentPct - targetPct;
    // Signed by the action the plan takes: overweight → selling (negative),
    // underweight → buying (positive). i.e. target − current, the change to make —
    // not current − target (the excess), which carries the opposite sign.
    const diffInr = agg[b].target - agg[b].current;
    const amountText =
      Math.abs(drift) < 0.5
        ? "On target"
        : `${Math.abs(drift).toFixed(0)}% ${drift > 0 ? "overweight" : "underweight"} · ${compactINR(diffInr)}`;
    return {
      key: b,
      label: BUCKET_META[b].label,
      color: BUCKET_META[b].color,
      current: Math.round(currentPct),
      target: Math.round(targetPct),
      currentInr: agg[b].current,
      targetInr: agg[b].target,
      amountText,
    };
  });
}

/* Preferred path: render the backend's multi-asset-aware breakdown directly.
   Blended funds are already split per-category server-side, so there's no
   client-side classification here — just a bucket key + ₹ passthrough. */
function driftRowsFromBreakdown(breakdown: RebalancingAssetClassBreakdown): DriftRow[] {
  const agg: Record<Bucket, { current: number; target: number }> = {
    equity: { current: 0, target: 0 },
    debt: { current: 0, target: 0 },
    others: { current: 0, target: 0 },
  };
  for (const row of breakdown.rows) {
    const b = toBucket(row.asset_class);
    agg[b].current += row.current_inr || 0;
    agg[b].target += row.target_inr || 0;
  }
  return formatDriftRows(agg);
}

/** Unsigned compact ₹ for axis ticks (e.g. ₹2L, ₹4.5L, ₹1.2Cr). */
function axisINR(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${Math.round(a / 1e3)}K`;
  return `₹${Math.round(a)}`;
}

function mapTrade(t: RebalancingTrade): UITrade {
  const type: "BUY" | "SELL" = t.action.toUpperCase() === "BUY" ? "BUY" : "SELL";
  return {
    id: t.id,
    isin: t.isin,
    type,
    bucket: toBucket(t.asset_class),
    amount: fmtINR(t.amount_inr),
    subtitle: t.reason_title || (type === "BUY" ? "Buy" : "Sell"),
    name: t.recommended_fund,
    category: t.sub_category || t.asset_subgroup,
    rationale: t.reason_text,
    reasonCode: t.reason_code,
  };
}

/** A rendered heading plus its trades. `blurb` / `detail` are absent for
    unmapped reason codes — there's no vetted explanation for a code we don't
    know about, and a guessed one would be worse than none. A group without a
    `detail` simply shows no info button. */
type TradeGroup = {
  label: string;
  color?: string;
  blurb?: string;
  detail?: ReasonDetail;
  trades: UITrade[];
};

/** Group trades by reason heading, in REASON_GROUPS order; any unmapped
    reason_code becomes its own group keyed by the trade's reason_title. */
function groupTradesByReason(trades: UITrade[]): TradeGroup[] {
  const byCode = new Map<string, UITrade[]>();
  for (const t of trades) {
    const arr = byCode.get(t.reasonCode);
    if (arr) arr.push(t);
    else byCode.set(t.reasonCode, [t]);
  }
  const out: TradeGroup[] = [];
  const seen = new Set<string>();
  for (const { codes, label, color, blurb, detail } of REASON_GROUPS) {
    const groupTrades = codes.flatMap((c) => byCode.get(c) ?? []);
    codes.forEach((c) => seen.add(c));
    if (groupTrades.length) out.push({ label, color, blurb, detail, trades: groupTrades });
  }
  // Unknown codes — keep them visible under their reason_title.
  for (const [code, arr] of byCode) {
    if (seen.has(code) || !arr.length) continue;
    out.push({ label: arr[0].subtitle || "Other trades", trades: arr });
  }
  // List BUY groups before SELL groups (what to add first, then what to trim),
  // preserving each side's REASON_GROUPS order — Array.sort is stable.
  const isBuyGroup = (g: { trades: UITrade[] }) => g.trades[0]?.type === "BUY";
  out.sort((a, b) => Number(isBuyGroup(b)) - Number(isBuyGroup(a)));
  return out;
}

/** The real group's copy for a label, so the example plan explains its sample
    rows with exactly the same words the real plan uses. */
function reasonCopy(label: string): Pick<TradeGroup, "blurb" | "detail"> {
  const g = REASON_GROUPS.find((r) => r.label === label);
  return { blurb: g?.blurb, detail: g?.detail };
}

/** Why a holding is left alone — the HOLD case, behind the info button on the
    "Funds you're keeping" heading. Not a reason_code: nothing is traded, so the
    engine emits no row for it, but it's the third answer users look for. */
const KEEP_DETAIL: ReasonDetail = {
  action: "HOLD",
  trigger:
    "You already hold it, it clears our quality bar, and its weight is close enough to target that trading it would cost more than the drift does.",
  why:
    "A fund you already own that we'd still recommend is left where it is. Selling it to buy something marginally better realises tax today for a difference that may not survive the year — so doing nothing is the decision, not the absence of one.",
  sizing:
    "No trade at all, so no tax, no exit load and no time out of the market. Future SIPs and top-ups adjust the weight instead.",
  guardrail:
    "The Ahead / Neutral tag is return since you bought — it explains how the holding has done, not why it's kept. A fund that fails on quality moves to the sell list above however well it has performed, and tax-locked holdings such as ELSS in lock-in stay here because they can't be sold yet.",
};

/** Total invested (cost basis): per-unit avg × qty, else avg treated as aggregate. */
function costBasisOf(quantity: number | null, averageCost: number | null): number | null {
  if (averageCost == null || averageCost <= 0) return null;
  if (quantity != null && quantity > 0) return quantity * averageCost;
  if (quantity == null) return averageCost;
  return null;
}

/** Normalise a fund name for matching trades against holdings. */
function normalizeFundName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/\s*·\s*folio.*$/i, "")
    .replace(/\s*[-–]\s*(direct|regular)\s+plan\b.*$/i, "")
    .replace(/\s+growth(?:\s+option)?$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** One "kept" holding (not being sold) shown with its performance. */
interface KeptFund {
  id: string;
  /** ISIN of the held fund; drives the tap-through to its detail page (null → not clickable). */
  isin: string | null;
  name: string;
  subtitle: string | null;
  value: number;
  gainPct: number | null;
  tone: "well" | "neutral";
}

/** Holdings the plan is NOT selling, tagged performing-well / neutral. */
function buildKeptFunds(portfolio: PortfolioDetail | null, trades: UITrade[]): KeptFund[] {
  if (!portfolio || portfolio.holdings.length === 0) return [];
  const soldIsins = new Set(
    trades.filter((t) => t.type === "SELL" && t.isin).map((t) => t.isin.toLowerCase()),
  );
  const soldNames = new Set(
    trades.filter((t) => t.type === "SELL").map((t) => normalizeFundName(t.name)),
  );
  return portfolio.holdings
    .filter((h) => {
      const isinMatch = h.ticker_symbol && soldIsins.has(h.ticker_symbol.toLowerCase());
      const nameMatch = soldNames.has(normalizeFundName(h.instrument_name));
      return !isinMatch && !nameMatch;
    })
    .map((h) => {
      const basis = costBasisOf(h.quantity, h.average_cost);
      const gainPct = basis != null && basis > 0 ? ((h.current_value - basis) / basis) * 100 : null;
      return {
        id: h.id,
        isin: h.ticker_symbol ?? null,
        name: normalizeFundName(h.instrument_name) ? h.instrument_name.replace(/\s*·\s*Folio.*$/i, "").trim() : h.instrument_name,
        subtitle: h.sub_category ?? h.asset_class ?? null,
        value: h.current_value,
        gainPct,
        tone: gainPct != null && gainPct >= 8 ? ("well" as const) : ("neutral" as const),
      };
    })
    .sort((a, b) => (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity));
}

const cardStyle: CSSProperties = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 16,
};

/* ── Example plan ──────────────────────────────────────────────────────────
   Shown when the user hasn't supplied the inputs the engine needs yet (e.g. date
   of birth, CAMS holdings). The page renders the real sections populated with
   clearly-labelled SAMPLE numbers so the user can see what the page produces —
   the dismissible RebalanceGate prompt offers to add their details to get the
   real plan. Nothing here is persisted or actionable. */
const EXAMPLE_DRIFT_ROWS: DriftRow[] = [
  {
    key: "equity",
    label: BUCKET_META.equity.label,
    color: BUCKET_META.equity.color,
    current: 62,
    target: 55,
    currentInr: 3_100_000,
    targetInr: 2_750_000,
    amountText: "7% overweight · -₹3.5L",
  },
  {
    key: "debt",
    label: BUCKET_META.debt.label,
    color: BUCKET_META.debt.color,
    current: 28,
    target: 35,
    currentInr: 1_400_000,
    targetInr: 1_750_000,
    amountText: "7% underweight · +₹3.5L",
  },
  {
    key: "others",
    label: BUCKET_META.others.label,
    color: BUCKET_META.others.color,
    current: 10,
    target: 10,
    currentInr: 500_000,
    targetInr: 500_000,
    amountText: "On target",
  },
];

const EXAMPLE_TRADE_GROUPS: TradeGroup[] = [
  {
    label: "Top up to target",
    color: BUY_GREEN,
    ...reasonCopy("Top up to target"),
    trades: [
      {
        id: "example-buy-1",
        isin: "",
        type: "BUY",
        bucket: "debt",
        amount: "₹40,000",
        subtitle: "Top up to target",
        name: "Example Corporate Bond Fund",
        category: "Debt · Corporate Bond",
        rationale: "Sample trade — add your details to see your real plan.",
        reasonCode: "add_to_target",
      },
    ],
  },
  {
    label: "Trim back to target",
    color: TRADE_ORANGE,
    ...reasonCopy("Trim back to target"),
    trades: [
      {
        id: "example-sell-1",
        isin: "",
        type: "SELL",
        bucket: "equity",
        amount: "₹40,000",
        subtitle: "Trim back to target",
        name: "Example Large Cap Fund",
        category: "Equity · Large Cap",
        rationale: "Sample trade — add your details to see your real plan.",
        reasonCode: "trim_over_target",
      },
    ],
  },
];

const EXAMPLE_KEPT_FUNDS: KeptFund[] = [
  {
    id: "example-keep-1",
    isin: null,
    name: "Example Flexi Cap Fund",
    subtitle: "Equity · Flexi Cap",
    value: 800_000,
    gainPct: 14.2,
    tone: "well",
  },
  {
    id: "example-keep-2",
    isin: null,
    name: "Example Gilt Fund",
    subtitle: "Debt · Gilt",
    value: 300_000,
    gainPct: 6.1,
    tone: "neutral",
  },
];

/* Hero headline for the "Prozpr insight" card. The backend computes a plan-aware
   `summary` per run; we fall back to the original static copy when it's absent
   (older runs) and show a representative one for the example plan. */
type HeadlineCopy = { title: string; subtitle: string; reason?: string | null };

const DEFAULT_SUMMARY: HeadlineCopy = {
  title: "Time to fine-tune your mix.",
  reason: "Your mix has drifted from what your goals call for.",
  subtitle:
    "Here's how to glide back to your target allocation. Prozpr picked units with the lowest capital gains to limit the tax you pay while rebalancing.",
};

const EXAMPLE_SUMMARY: HeadlineCopy = {
  title: "Trimming your Equity back to target",
  reason:
    "That's more market risk than your goals call for — a downturn now would set them back.",
  subtitle:
    "Reducing your equity weightage by 7% — Prozpr picked the lowest-tax units (₹12,400 est.).",
};

/** The info button beside a section heading — opens that section's long-form
    reasoning. Sized to sit on a heading row without stretching it. */
const InfoButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`Why these are recommended — ${label}`}
    title="Why these are recommended"
    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
  >
    <Info className="h-3.5 w-3.5" />
  </button>
);

/** What one info button opens: the heading it belongs to, its accent, and the
    reasoning to render. */
type ReasonInfo = { label: string; color?: string; detail: ReasonDetail };

/** Bottom sheet behind an info button — the full "why this action" for a
    section: what puts a fund there, why that's the right call, how the amount
    was set, and the guard-rail. */
const ReasonInfoSheet = ({ info, onClose }: { info: ReasonInfo | null; onClose: () => void }) => {
  // Escape closes it, matching the tap-outside affordance.
  useEffect(() => {
    if (!info) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [info, onClose]);

  const tone = info?.color ?? "hsl(var(--muted-foreground))";
  const sections = info
    ? [
        { label: "What puts a fund here", text: info.detail.trigger },
        { label: `Why that's a ${info.detail.action}`, text: info.detail.why },
        { label: "How the amount is set", text: info.detail.sizing },
        { label: "What we won't do", text: info.detail.guardrail },
      ]
    : [];

  return (
    <AnimatePresence>
      {info && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            role="dialog"
            aria-modal="true"
            aria-label={`Why these are recommended — ${info.label}`}
            className="fixed bottom-0 left-0 right-0 z-[70] max-h-[85vh] overflow-auto rounded-t-2xl border-t border-border bg-card shadow-2xl pb-safe"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
            </div>
            <div className="flex items-start gap-2 px-5 pt-2 pb-3">
              <div className="min-w-0 flex-1">
                <span
                  className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide"
                  style={{ backgroundColor: `${tone}1f`, color: tone }}
                >
                  {info.detail.action}
                </span>
                <h2 className="mt-1.5 text-[15px] font-semibold leading-tight text-foreground">
                  {info.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3.5 px-5 pb-6">
              {sections.map((sec) => (
                <div key={sec.label}>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {sec.label}
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/90">{sec.text}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const RebalanceExplanation = () => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RebalancingRunDetail | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [preCompleted, setPreCompleted] = useState(0);
  // How many of the ACTIVE step's sub-checks have rolled in so far.
  const [preRevealed, setPreRevealed] = useState(0);
  // Whether the rebalancing inputs are complete. null = still checking (the gate
  // shows a pill); false = missing inputs → render the example plan; true = real
  // plan loads via onReady → loadData.
  const [gateReady, setGateReady] = useState<boolean | null>(null);
  // Bumped to open the gate's inputs form on demand (e.g. from the example plan's
  // CTA) — so the user can add their details even after dismissing the prompt.
  const [gateEditSignal, setGateEditSignal] = useState(0);
  // The section whose info button was tapped; null = sheet closed.
  const [reasonInfo, setReasonInfo] = useState<ReasonInfo | null>(null);
  const closeReasonInfo = useCallback(() => setReasonInfo(null), []);

  // Open the full fund-detail page (same screen as a portfolio holding), passing
  // the trade's rationale so it can render a "Why this trade" card on top. The
  // holding-detail endpoint resolves the fund by ISIN, so the trade's ISIN is a
  // valid :schemeCode route param.
  const openTrade = useCallback(
    (trade: UITrade) => {
      if (!trade.isin) return;
      navigate(`/portfolio/fund/${encodeURIComponent(trade.isin)}`, {
        state: {
          rebalanceTrade: {
            action: trade.type,
            amountText: trade.amount,
            reasonTitle: trade.subtitle,
            rationale: trade.rationale,
          },
        },
      });
    },
    [navigate],
  );

  // Open the same fund-detail page for a fund we're keeping (no trade, so no
  // "Why this trade" card). Example funds carry no ISIN, so they stay inert.
  const openKeptFund = useCallback(
    (fund: KeptFund) => {
      if (!fund.isin) return;
      navigate(`/portfolio/fund/${encodeURIComponent(fund.isin)}`);
    },
    [navigate],
  );

  // True only while the engine is actually computing a plan (first-ever visit
  // with no run, or the Recalculate button). Plain reads never set this — the
  // progress % / stage UI shows only during a real compute.
  const [computing, setComputing] = useState(false);
  const computeProgress = useComputeProgress(computing, getRebalanceComputeProgress);

  // Run the engine and load the resulting run. Used once when no plan exists,
  // and by the Recalculate button; chat is the other producer of runs.
  const compute = useCallback(async () => {
    setComputing(true);
    setDataError(null);
    try {
      const res = await runRebalancing();
      if (res.blocking_message) {
        setDataError(res.blocking_message);
        return;
      }
      const run = (await listRebalancingRuns())[0];
      if (!run) {
        setDataError("No rebalancing plan is available yet.");
        return;
      }
      setDetail(await getRebalancingRunDetail(run.id));
      getMyPortfolio().then(setPortfolio).catch(() => { /* section just hides */ });
    } catch {
      setDataError("Couldn't build your rebalancing plan. Please try again.");
    } finally {
      setComputing(false);
    }
  }, []);

  // Load the latest rebalancing run's real trades + subgroup roll-ups. Called by
  // the gate's onReady once every required input is present. READ-ONLY except
  // the very first visit: with no run on record it computes one, exactly once —
  // afterwards new runs come from chat or the Recalculate button.
  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const runs = await listRebalancingRuns().catch(() => []);
      const run = runs[0];
      if (!run) {
        setDataLoading(false);
        await compute();
        return;
      }
      setDetail(await getRebalancingRunDetail(run.id));
      // Best-effort: load holdings so we can show the funds we're keeping.
      getMyPortfolio().then(setPortfolio).catch(() => { /* section just hides */ });
    } catch {
      setDataError("Couldn't load your rebalancing plan. Please try again.");
    } finally {
      setDataLoading(false);
    }
  }, [compute]);

  const driftRows = useMemo(() => {
    // Prefer the backend's multi-asset-aware breakdown; fall back to the local
    // subgroup rollup for older runs that predate the field.
    if (detail?.asset_class_breakdown) {
      return driftRowsFromBreakdown(detail.asset_class_breakdown);
    }
    return buildDriftRows(detail?.subgroup_summaries ?? [], portfolio?.holdings ?? []);
  }, [detail, portfolio]);
  const uiTrades = useMemo(() => (detail?.trades ?? []).map(mapTrade), [detail]);
  const tradeGroups = useMemo(() => groupTradesByReason(uiTrades), [uiTrades]);
  const keptFunds = useMemo(() => buildKeptFunds(portfolio, uiTrades), [portfolio, uiTrades]);
  const taxText = useMemo(() => {
    const tax = detail?.totals?.total_tax_estimate_inr ?? 0;
    return tax > 0 ? `Tax impact · ${fmtINR(tax)} est.` : "Tax impact · ₹0";
  }, [detail]);

  const isApproved = detail?.status === "approved" || detail?.status === "executed";

  // Render an example plan when the inputs aren't ready and there's no real plan
  // to show. The same sections render either the real or the sample data.
  const isExample =
    gateReady === false && !detail && !dataLoading && !computing && !dataError;
  const driftRowsToShow = isExample ? EXAMPLE_DRIFT_ROWS : driftRows;
  const tradeGroupsToShow = isExample ? EXAMPLE_TRADE_GROUPS : tradeGroups;
  const tradeCountToShow = isExample
    ? EXAMPLE_TRADE_GROUPS.reduce((n, g) => n + g.trades.length, 0)
    : uiTrades.length;
  const keptFundsToShow = isExample ? EXAMPLE_KEPT_FUNDS : keptFunds;
  const taxTextToShow = isExample ? "Tax impact · ₹12,400 est." : taxText;
  const summaryToShow: HeadlineCopy = isExample
    ? EXAMPLE_SUMMARY
    : detail?.summary ?? DEFAULT_SUMMARY;

  // Orders handed to the confirmation page (SELL → redemption, BUY → purchase).
  const ordersForApproval = useMemo(
    () =>
      uiTrades.map((t) => ({
        id: t.id,
        kind: t.type === "SELL" ? ("redemption" as const) : ("purchase" as const),
        name: t.name,
        amount: t.amount,
      })),
    [uiTrades],
  );

  const startApproval = useCallback(() => {
    setPreCompleted(0);
    setPreRevealed(0);
    setPreflightOpen(true);
  }, []);

  // Roll each step's sub-checks in ~0.7s apart; once all are shown, tick the
  // step green and move to the next. When every step passes → confirmation page.
  useEffect(() => {
    if (!preflightOpen) return;
    if (preCompleted >= PREFLIGHT_STEPS.length) {
      const t = window.setTimeout(() => {
        setPreflightOpen(false);
        navigate("/approve-orders", { state: { orders: ordersForApproval } });
      }, 750);
      return () => window.clearTimeout(t);
    }
    const step = PREFLIGHT_STEPS[preCompleted];
    if (preRevealed < step.checks.length) {
      const t = window.setTimeout(() => setPreRevealed((r) => r + 1), 1000);
      return () => window.clearTimeout(t);
    }
    const hold = step.checks.length === 0 ? 1500 : 600;
    const t = window.setTimeout(() => {
      setPreCompleted((c) => c + 1);
      setPreRevealed(0);
    }, hold);
    return () => window.clearTimeout(t);
  }, [preflightOpen, preCompleted, preRevealed, navigate, ordersForApproval]);

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      {/* Gate: never blocks the page. When inputs are missing it shows a
          dismissible prompt and reports readiness so we render an example plan;
          when ready it loads the real plan via onReady. */}
      <RebalanceGate onReady={loadData} onResolved={setGateReady} editSignal={gateEditSignal} />

      <div className="px-5 pt-2 pb-2 space-y-3">
        {/* Recalculating: no skeletons, no duplicate status line — just the
            live process checklist centred; done lines stay ticked until the
            whole compute finishes and the plan renders. */}
        {computing && (
          <div
            className="flex justify-center pt-14"
            aria-busy="true"
            aria-label="Recalculating your plan"
          >
            <div className="w-full max-w-[340px] rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <span className="text-[13.5px] font-semibold text-foreground">
                  Building your rebalancing plan
                </span>
              </div>
              <ComputeProgressSteps
                progress={computeProgress}
                startingLabel="Reviewing your portfolio & profile…"
              />
              <p className="mt-4 border-t border-border/60 pt-3 text-[11px] leading-snug text-muted-foreground">
                Working with your live portfolio — this can take a minute.
              </p>
            </div>
          </div>
        )}

        {dataLoading && !computing && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading your plan">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-[12px]">Loading your plan…</span>
            </div>
            {/* Drift card placeholder */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            {/* Proposed-trades placeholder */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <Skeleton className="h-3 w-32" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-7 w-11 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </div>
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </div>
        )}

        {!dataLoading && !computing && dataError && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {dataError}
          </div>
        )}

        {!dataLoading && !computing && !dataError && (detail || isExample) && (
          <>
            <div className="-mb-1 flex items-center gap-2">
              <span className="text-lg font-semibold text-foreground">Rebalancing</span>
              {isExample && (
                <span className="rounded-full border border-[#D4A868]/40 bg-[#D4A868]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9A7B2E]">
                  Example
                </span>
              )}
              {/* Explainer for the eight engine rules behind this plan. Always
                  available — the example plan raises the same questions. */}
              <button
                type="button"
                onClick={() => navigate("/invest/how-it-works")}
                className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="How rebalancing works"
                title="How rebalancing works"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
              {!isExample && detail && (
                <button
                  type="button"
                  onClick={() => void compute()}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Recalculate
                </button>
              )}
            </div>

            <motion.section
              className="relative px-4 py-5 overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, rgba(212,168,104,0.22) 0%, hsl(var(--card)) 70%, hsl(var(--card)) 100%)",
                border: "1px solid rgba(212,168,104,0.45)",
                borderRadius: 16,
              }}
              initial={{
                boxShadow:
                  "0 0 0 1px rgba(212,168,104,0.10), 0 12px 32px -14px rgba(212,168,104,0.35)",
              }}
              animate={{
                boxShadow: [
                  "0 0 0 1px rgba(212,168,104,0.10), 0 12px 32px -14px rgba(212,168,104,0.35)",
                  "0 0 0 2px rgba(212,168,104,0.55), 0 0 36px 4px rgba(212,168,104,0.40)",
                  "0 0 0 1px rgba(212,168,104,0.10), 0 12px 32px -14px rgba(212,168,104,0.35)",
                  "0 0 0 2px rgba(212,168,104,0.55), 0 0 36px 4px rgba(212,168,104,0.40)",
                  "0 0 0 1px rgba(212,168,104,0.10), 0 12px 32px -14px rgba(212,168,104,0.35)",
                ],
              }}
              transition={{ duration: 3.2, ease: "easeInOut", times: [0, 0.2, 0.5, 0.75, 1] }}
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: "linear-gradient(180deg, #E5C079 0%, #D4A868 100%)" }}
              />
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(212,168,104,0.22)", color: "#9A7B2E" }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span
                  className="text-[11px] uppercase font-semibold"
                  style={{ letterSpacing: "1.6px", color: "#9A7B2E" }}
                >
                  Prozpr insight
                </span>
              </div>
              <h1 className="mt-3 text-[21px] leading-tight font-semibold tracking-tight text-foreground">
                {summaryToShow.title}
              </h1>
              {summaryToShow.reason && (
                <p className="mt-2 text-[13.5px] leading-snug font-medium text-foreground/90">
                  {summaryToShow.reason}
                </p>
              )}
              <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">
                {summaryToShow.subtitle}
              </p>
            </motion.section>

            {/* Current vs target — combined Current / Target stacked ₹ bars
                (shared component; also used on the SIP tab). */}
            <CurrentVsTargetChart rows={driftRowsToShow} />

            {/* Proposed trades — the real BUY / SELL actions grouped by bucket
                (sample trades when this is an example plan). */}
            <section style={cardStyle} className="px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
                  Proposed trades{isExample ? " · example" : ""}
                </p>
                <p className="text-[11px] text-wealth-green">{taxTextToShow}</p>
              </div>
              {tradeCountToShow === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  No trades needed — your portfolio is already aligned with the plan.
                </p>
              ) : (
                <div className="mt-3 space-y-5">
                  {tradeGroupsToShow.map(({ label, color, blurb, detail, trades }) => (
                      <div key={label}>
                        {/* Headings are neutral by default; a flagged group (e.g.
                            "Not on recommended list") gets a crisp accent so it
                            pops, without the glow/clutter from before. */}
                        <div className="flex items-center gap-2 pb-2">
                          <p
                            className="text-[11px] font-bold tracking-[0.14em] uppercase truncate"
                            style={{ color: color ?? "hsl(var(--muted-foreground))" }}
                          >
                            {label}
                          </p>
                          <span
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={
                              color
                                ? { backgroundColor: `${color}1f`, color }
                                : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }
                            }
                          >
                            {trades.length}
                          </span>
                          <div className="h-px flex-1" style={{ backgroundColor: color ? `${color}55` : "hsl(var(--border))" }} />
                          {/* Long-form reasoning for this heading. Groups from an
                              unmapped reason_code have none, so no button. */}
                          {detail && (
                            <InfoButton
                              label={label}
                              onClick={() => setReasonInfo({ label, color, detail })}
                            />
                          )}
                        </div>
                        {/* Why this whole group exists — saves every row below
                            from repeating the same rule. */}
                        {blurb && (
                          <p className="-mt-0.5 pb-2.5 text-[11.5px] leading-snug text-muted-foreground">
                            {blurb}
                          </p>
                        )}
                        <div className="space-y-1.5">
                          {trades.map((trade) => {
                            const isSell = trade.type === "SELL";
                            const tone = isSell ? TRADE_ORANGE : BUY_GREEN;
                            return (
                              <button
                                key={trade.id}
                                type="button"
                                onClick={() => openTrade(trade)}
                                className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left flex items-center gap-3 transition-colors hover:bg-muted/40"
                              >
                                <span
                                  className="w-11 shrink-0 rounded-md py-1 text-center text-[11px] font-bold tracking-wide"
                                  style={{ backgroundColor: `${tone}1f`, color: tone }}
                                >
                                  {trade.type}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[13px] leading-tight font-medium text-foreground truncate">{trade.name}</p>
                                </div>
                                <p className="shrink-0 text-[14px] leading-none font-semibold tabular-nums" style={{ color: tone }}>
                                  {isSell ? "−" : "+"}{trade.amount}
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* Funds you're keeping — everything in the portfolio NOT being sold,
                tagged performing-well / neutral, with the same fund details. */}
            {keptFundsToShow.length > 0 && (
              <section className="px-4 py-4" style={cardStyle}>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] tracking-[0.16em] uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
                    Funds you're keeping
                  </p>
                  <InfoButton
                    label="Funds you're keeping"
                    onClick={() =>
                      setReasonInfo({ label: "Funds you're keeping", detail: KEEP_DETAIL })
                    }
                  />
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                  Ahead or neutral — staying in your portfolio, not part of these trades.
                </p>
                <div className="mt-3 divide-y divide-border">
                  {keptFundsToShow.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => openKeptFund(f)}
                      disabled={!f.isin}
                      className="w-full flex items-center gap-3 py-2.5 text-left -mx-1 px-1 rounded-lg transition-colors enabled:hover:bg-muted/40 disabled:cursor-default"
                    >
                      <span
                        className="w-[52px] shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold tracking-wide leading-tight text-center"
                        style={{
                          backgroundColor: "hsl(var(--muted-foreground) / 0.12)",
                          color: "hsl(var(--muted-foreground))",
                        }}
                      >
                        {f.tone === "well" ? "Ahead" : "Neutral"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-tight font-medium text-foreground truncate">{f.name}</p>
                        {f.subtitle && (
                          <p className="text-[11px] text-muted-foreground truncate">{f.subtitle}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className="text-[13px] leading-none font-semibold tabular-nums text-foreground"
                        >
                          {f.gainPct == null ? "—" : `${f.gainPct >= 0 ? "+" : ""}${f.gainPct.toFixed(1)}%`}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">{axisINR(f.value)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {isExample ? (
              <button
                type="button"
                onClick={() => setGateEditSignal((n) => n + 1)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98]"
              >
                Add your details to proceed
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startApproval}
                disabled={uiTrades.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98] disabled:opacity-60"
              >
                Approve plan
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Pre-flight checks — each ticks green ~1.5s apart, then → confirmation. */}
      <AnimatePresence>
        {preflightOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/45"
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Approving your plan"
              className="fixed inset-0 z-[60] flex items-center justify-center px-6"
            >
              <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl">
                <p className="mb-4 text-[15px] font-semibold text-foreground">Approving your plan</p>
                <div className="space-y-3">
                  {PREFLIGHT_STEPS.map((step, i) => {
                    if (i > preCompleted) return null; // reveal one step at a time
                    const done = i < preCompleted;
                    const active = i === preCompleted;
                    return (
                      <motion.div
                        key={step.label}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                            {done ? (
                              <CheckCircle2 className="h-5 w-5 text-wealth-green" />
                            ) : (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                          </span>
                          <span
                            className={`text-[13px] ${
                              done ? "font-medium text-foreground" : "font-medium text-foreground"
                            }`}
                          >
                            {step.label}
                          </span>
                        </div>

                        {/* Sub-checks roll in one at a time while this step runs. */}
                        {active && step.checks.length > 0 && (
                          <div className="mt-1.5 ml-9 space-y-1.5">
                            {step.checks.slice(0, preRevealed).map((c) => (
                              <motion.div
                                key={c}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className="flex items-center gap-2 text-[11.5px] italic text-muted-foreground"
                              >
                                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-muted-foreground/50" />
                                Checking {c}…
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Why a section recommends what it does — opened by its info button. */}
      <ReasonInfoSheet info={reasonInfo} onClose={closeReasonInfo} />

      <BottomNav />
    </div>
  );
};

export default RebalanceExplanation;
