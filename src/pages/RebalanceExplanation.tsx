import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Loader2, RefreshCw, Sparkles } from "lucide-react";
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
  type RebalancingReadiness,
  type RebalancingRunDetail,
  type RebalancingSubgroupSummary,
  type RebalancingTrade,
} from "@/lib/api";

/* ── Buckets — the drift section groups the engine's asset_subgroups into three
   asset classes (Equity / Debt / Others). The asset_class is computed by the
   backend (scheme_classification.asset_class_for_subgroup) and shipped on each
   subgroup_summary / trade, so there is no client-side classification. ── */
type Bucket = "equity" | "debt" | "others";

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

const REASON_GROUPS: { codes: string[]; label: string; color?: string }[] = [
  { codes: ["exit_low_rated"], label: "Underperformance", color: TRADE_ORANGE },
  {
    codes: ["exit_bad_fund", "migrate_neutral_to_recommended"],
    label: "Not on recommended list",
    color: TRADE_ORANGE,
  },
  { codes: ["sell_excess_direct_stocks"], label: "Reduce single-stock risk", color: TRADE_ORANGE },
  { codes: ["trim_over_target"], label: "Trim back to target", color: TRADE_ORANGE },
  { codes: ["cap_spill_buy"], label: "Diversifying allocation", color: BUY_GREEN },
  { codes: ["add_to_target"], label: "Top up to target", color: BUY_GREEN },
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

/** Group trades by reason heading, in REASON_GROUPS order; any unmapped
    reason_code becomes its own group keyed by the trade's reason_title. */
function groupTradesByReason(
  trades: UITrade[],
): { label: string; color?: string; trades: UITrade[] }[] {
  const byCode = new Map<string, UITrade[]>();
  for (const t of trades) {
    const arr = byCode.get(t.reasonCode);
    if (arr) arr.push(t);
    else byCode.set(t.reasonCode, [t]);
  }
  const out: { label: string; color?: string; trades: UITrade[] }[] = [];
  const seen = new Set<string>();
  for (const { codes, label, color } of REASON_GROUPS) {
    const groupTrades = codes.flatMap((c) => byCode.get(c) ?? []);
    codes.forEach((c) => seen.add(c));
    if (groupTrades.length) out.push({ label, color, trades: groupTrades });
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

/* Hero headline for the "Prozpr insight" card. The backend computes a plan-aware
   `summary` per run; we fall back to this static copy when it's absent (older
   runs). It describes the page, never a number — every figure on this screen
   comes from the user's own run. */
type HeadlineCopy = { title: string; subtitle: string; reason?: string | null };

const DEFAULT_SUMMARY: HeadlineCopy = {
  title: "Time to fine-tune your mix.",
  reason: "Your mix has drifted from what your goals call for.",
  subtitle:
    "Here's how to glide back to your target allocation. Prozpr picked units with the lowest capital gains to limit the tax you pay while rebalancing.",
};

const RebalanceExplanation = () => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RebalancingRunDetail | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  // Whether the rebalancing inputs are complete. null = still checking (the gate
  // shows a pill); false = missing inputs → render the "not ready yet" panel;
  // true = real plan loads via onReady → loadData.
  const [gateReady, setGateReady] = useState<boolean | null>(null);
  // Full readiness payload from the gate, so the not-ready panel can name what's
  // actually missing rather than assume it's the holdings.
  const [readiness, setReadiness] = useState<RebalancingReadiness | null>(null);
  // Bumped to open the gate's inputs form on demand (e.g. from the not-ready
  // CTA) — so the user can add their details even after dismissing the prompt.
  const [gateEditSignal, setGateEditSignal] = useState(0);
  // Bumped to open the gate's CAMS import directly, for the (common) case where
  // holdings are the missing piece.
  const [gateCamsSignal, setGateCamsSignal] = useState(0);

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
  // "Why this trade" card). Rows without an ISIN stay inert.
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

  // Inputs are missing and there is no run to show. The page previously filled
  // this state with a fully-populated SAMPLE plan (invented drift %, invented
  // trades, an invented ₹12,400 tax estimate). Nothing on this screen may be
  // fabricated — a plan is advice about real money — so we render an explicit
  // "not ready yet" panel instead and say exactly what's missing.
  const notReady =
    gateReady === false && !detail && !dataLoading && !computing && !dataError;
  const needsHoldings = !!readiness && !readiness.has_holdings;
  // Required inputs the user can actually type (date of birth today). Holdings
  // are handled separately — they can only come from a statement.
  const missingFields = (readiness?.fields ?? [])
    .filter((f) => !f.optional && !f.present)
    .map((f) => f.label);
  const summaryToShow: HeadlineCopy = detail?.summary ?? DEFAULT_SUMMARY;

  const proceed = useCallback(async () => {
    if (!detail) return;
    setApproving(true);
    try {
      await updateRebalancingStatus(detail.id, "approved");
      setDetail((prev) => (prev ? { ...prev, status: "approved" } : prev));
      toast({ title: "Plan approved", description: "Your rebalancing trades are ready to execute." });
    } catch {
      toast({ title: "Couldn't approve", description: "Please try again.", variant: "destructive" });
    } finally {
      setApproving(false);
    }
  }, [detail]);

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      {/* Gate: never blocks the page. When inputs are missing it shows a
          dismissible in-flow notice and reports readiness so we render the
          "not ready yet" panel; when ready it loads the real plan via onReady. */}
      <RebalanceGate
        onReady={loadData}
        onResolved={setGateReady}
        onReadiness={setReadiness}
        editSignal={gateEditSignal}
        camsSignal={gateCamsSignal}
      />

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

        {/* Nothing to plan with yet — an honest placeholder, not a mock plan.
            The RebalanceGate notice above already offers the upload / inputs;
            this explains what the page will show once they exist. */}
        {notReady && (
          <>
            <div className="-mb-1 flex items-center gap-2">
              <span className="text-lg font-semibold text-foreground">Rebalancing</span>
            </div>
            <section style={cardStyle} className="px-5 py-7 text-center">
              <span
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: "rgba(212,168,104,0.14)", color: "#9A7B2E" }}
              >
                <Sparkles className="h-5 w-5" />
              </span>
              <h1 className="mt-3 text-[17px] font-semibold tracking-tight text-foreground">
                Your rebalancing plan isn&apos;t ready yet
              </h1>
              <p className="mx-auto mt-2 max-w-[310px] text-[12.5px] leading-relaxed text-muted-foreground">
                Rebalancing compares what you hold today against the mix your
                goals call for, then picks the lowest-tax units to trade.
                {needsHoldings
                  ? " That needs your real holdings, so there's nothing to show until your CAMS statement is in."
                  : " We just need a couple of details from you first."}
              </p>
              {(needsHoldings || missingFields.length > 0) && (
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {needsHoldings && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      CAMS statement
                    </span>
                  )}
                  {missingFields.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  needsHoldings
                    ? setGateCamsSignal((n) => n + 1)
                    : setGateEditSignal((n) => n + 1)
                }
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98]"
              >
                {needsHoldings ? "Add CAMS statement" : "Complete setup"}
                <ArrowRight className="h-4 w-4" />
              </button>
              {needsHoldings && missingFields.length > 0 && (
                <button
                  type="button"
                  onClick={() => setGateEditSignal((n) => n + 1)}
                  className="mt-2.5 w-full text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Add the other details instead
                </button>
              )}
            </section>
          </>
        )}

        {!dataLoading && !computing && !dataError && detail && (
          <>
            <div className="-mb-1 flex items-center gap-2">
              <span className="text-lg font-semibold text-foreground">Rebalancing</span>
              <button
                type="button"
                onClick={() => void compute()}
                className="ml-auto flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Recalculate
              </button>
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
            <CurrentVsTargetChart rows={driftRows} />

            {/* Proposed trades — the real BUY / SELL actions grouped by bucket. */}
            <section style={cardStyle} className="px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
                  Proposed trades
                </p>
                <p className="text-[11px] text-wealth-green">{taxText}</p>
              </div>
              {uiTrades.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  No trades needed — your portfolio is already aligned with the plan.
                </p>
              ) : (
                <div className="mt-3 space-y-5">
                  {tradeGroups.map(({ label, color, trades }) => (
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
                        </div>
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
            {keptFunds.length > 0 && (
              <section className="px-4 py-4" style={cardStyle}>
                <p className="text-[11px] tracking-[0.16em] uppercase" style={{ color: "hsl(var(--muted-foreground))" }}>
                  Funds you're keeping
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                  Ahead or neutral — staying in your portfolio, not part of these trades.
                </p>
                <div className="mt-3 divide-y divide-border">
                  {keptFunds.map((f) => (
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

            <button
              type="button"
              onClick={() => void proceed()}
              disabled={approving || isApproved || uiTrades.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : isApproved ? <Check className="h-4 w-4" /> : null}
              {isApproved ? "Plan approved" : approving ? "Approving…" : "Approve plan"}
              {!isApproved && !approving && <ArrowRight className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default RebalanceExplanation;
