import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Check, Loader2, Settings2, Sparkles } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import RebalanceGate from "@/components/invest/RebalanceGate";
import TradeFundDetailView from "@/components/fund/TradeFundDetailView";
import { toast } from "@/hooks/use-toast";
import {
  getMyPortfolio,
  getRebalancingRunDetail,
  listRebalancingRuns,
  runRebalancing,
  updateRebalancingStatus,
  type PortfolioDetail,
  type RebalancingRunDetail,
  type RebalancingSubgroupSummary,
  type RebalancingTrade,
} from "@/lib/api";

/* ── Buckets — the drift section groups the engine's asset_subgroups into the
   same three asset classes the allocation engine commits to: equity / debt /
   others (gold & commodities roll into "others"). Mirrors the backend's
   SUBGROUP_TO_ASSET_CLASS map (asset_allocation_pydantic/tables.py) so the split
   matches what the engine actually produced. ── */
type Bucket = "equity" | "debt" | "others";

const BUCKET_ORDER: Bucket[] = ["equity", "debt", "others"];
const BUCKET_META: Record<Bucket, { label: string; color: string }> = {
  equity: { label: "Equity", color: "#3B6FA8" },
  debt: { label: "Debt", color: "#A8872F" },
  others: { label: "Others", color: "#E0B84A" },
};

// Canonical asset_subgroup → asset class, kept in sync with the backend.
const SUBGROUP_TO_BUCKET: Record<string, Bucket> = {
  low_beta_equities: "equity",
  medium_beta_equities: "equity",
  high_beta_equities: "equity",
  value_equities: "equity",
  dividend_equities: "equity",
  sector_equities: "equity",
  us_equities: "equity",
  multi_asset: "equity",
  short_debt: "debt",
  arbitrage: "debt",
  arbitrage_plus_income: "debt",
  gold_commodities: "others",
  silver_commodities: "others",
  china_equities: "others",
  others_fofs: "others",
  others: "others",
};

function classifyBucket(name: string): Bucket {
  const key = (name || "").trim().toLowerCase().replace(/\s+/g, "_");
  const mapped = SUBGROUP_TO_BUCKET[key];
  if (mapped) return mapped;
  // Fallback heuristic for any subgroup not in the map (note: "equit" matches
  // both "equity" and "equities").
  if (key.includes("equit") || key.includes("cap") || key.includes("flexi") || key.includes("nifty") || key.includes("index") || key.includes("elss")) return "equity";
  if (key.includes("debt") || key.includes("bond") || key.includes("arbitrage") || key.includes("liquid") || key.includes("gilt") || key.includes("duration") || key.includes("money")) return "debt";
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
};

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function compactINR(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${Math.round(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

function buildDriftRows(subs: RebalancingSubgroupSummary[]): DriftRow[] {
  if (!subs.length) return [];
  const agg: Record<Bucket, { current: number; target: number }> = {
    equity: { current: 0, target: 0 },
    debt: { current: 0, target: 0 },
    others: { current: 0, target: 0 },
  };
  for (const s of subs) {
    const b = classifyBucket(s.asset_subgroup);
    agg[b].current += s.current_holding_inr || 0;
    agg[b].target += s.goal_target_inr || 0;
  }
  const totalCur = BUCKET_ORDER.reduce((sum, b) => sum + agg[b].current, 0);
  const totalTgt = BUCKET_ORDER.reduce((sum, b) => sum + agg[b].target, 0);

  return BUCKET_ORDER.filter((b) => agg[b].current > 0 || agg[b].target > 0).map((b) => {
    const currentPct = totalCur > 0 ? (agg[b].current / totalCur) * 100 : 0;
    const targetPct = totalTgt > 0 ? (agg[b].target / totalTgt) * 100 : 0;
    const drift = currentPct - targetPct;
    const diffInr = agg[b].current - agg[b].target;
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

/** Unsigned compact ₹ for axis ticks (e.g. ₹2L, ₹4.5L, ₹1.2Cr). */
function axisINR(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${Math.round(a / 1e3)}K`;
  return `₹${Math.round(a)}`;
}

/** Round an axis maximum up to a clean 1 / 2 / 5 × 10ⁿ value. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function mapTrade(t: RebalancingTrade): UITrade {
  const type: "BUY" | "SELL" = t.action.toUpperCase() === "BUY" ? "BUY" : "SELL";
  return {
    id: t.id,
    isin: t.isin,
    type,
    bucket: classifyBucket(t.asset_subgroup),
    amount: fmtINR(t.amount_inr),
    subtitle: t.reason_title || (type === "BUY" ? "Buy" : "Sell"),
    name: t.recommended_fund,
    category: t.sub_category || t.asset_subgroup,
    rationale: t.reason_text,
  };
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

// Drift caption colours — semantic so they track the active light/dark theme.
const OVERWEIGHT = "hsl(var(--destructive))";
const UNDERWEIGHT = "hsl(var(--wealth-green))";
const NEUTRAL = "hsl(var(--muted-foreground))";

// Current vs target bars — Current is soft gold at 50% opacity, Target is solid gold.
// Current vs target bars: Current is a very light gold tint, Target is a strong deep gold.
const GOLD = "#A8761F"; // Target — very strong
const GOLD_SOFT = "rgba(212, 168, 104, 0.22)"; // Current — very light

const RebalanceExplanation = () => {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<RebalancingRunDetail | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [editSignal, setEditSignal] = useState(0);

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

  // Load the latest rebalancing run's real trades + subgroup roll-ups. Called by
  // the gate's onReady once every required input is present.
  const loadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const runs = await listRebalancingRuns().catch(() => []);
      let run = runs[0];
      if (!run) {
        const res = await runRebalancing();
        if (res.blocking_message) {
          setDataError(res.blocking_message);
          return;
        }
        run = (await listRebalancingRuns())[0];
      }
      if (run) {
        setDetail(await getRebalancingRunDetail(run.id));
        // Best-effort: load holdings so we can show the funds we're keeping.
        getMyPortfolio().then(setPortfolio).catch(() => { /* section just hides */ });
      } else {
        setDataError("No rebalancing plan is available yet.");
      }
    } catch {
      setDataError("Couldn't load your rebalancing plan. Please try again.");
    } finally {
      setDataLoading(false);
    }
  }, []);

  const driftRows = useMemo(() => buildDriftRows(detail?.subgroup_summaries ?? []), [detail]);
  const uiTrades = useMemo(() => (detail?.trades ?? []).map(mapTrade), [detail]);
  const keptFunds = useMemo(() => buildKeptFunds(portfolio, uiTrades), [portfolio, uiTrades]);
  const taxText = useMemo(() => {
    const tax = detail?.totals?.total_tax_estimate_inr ?? 0;
    return tax > 0 ? `Tax impact · ${fmtINR(tax)} est.` : "Tax impact · ₹0";
  }, [detail]);

  const isApproved = detail?.status === "approved" || detail?.status === "executed";

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
      {/* Gate: blurs the page and collects missing inputs until a plan exists. */}
      <RebalanceGate onReady={loadData} editSignal={editSignal} />

      <div className="px-5 pt-10 pb-2 space-y-3">
        {dataLoading && (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading your plan…</span>
          </div>
        )}

        {!dataLoading && dataError && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {dataError}
          </div>
        )}

        {!dataLoading && !dataError && detail && (
          <>
            {/* Open the inputs editor — view/edit the figures the engine runs on
                and upload the latest CAMS statement, then re-run. */}
            <div className="flex items-center justify-between -mb-1">
              <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Rebalancing plan</span>
              <button
                type="button"
                onClick={() => setEditSignal((n) => n + 1)}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#D4A868]/50 bg-card px-2.5 py-1 text-[11px] font-semibold text-[#D4A868] hover:bg-[#D4A868]/10"
                aria-label="Edit rebalancing inputs"
              >
                <Settings2 className="h-3 w-3" />
                Inputs
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
                  className="text-[10px] uppercase font-semibold"
                  style={{ letterSpacing: "1.6px", color: "#9A7B2E" }}
                >
                  Prozpr insight
                </span>
              </div>
              <h1 className="mt-3 text-[21px] leading-tight font-semibold tracking-tight text-foreground">
                Time to fine-tune your mix.
              </h1>
              <p className="mt-2.5 text-[12.5px] leading-5 text-muted-foreground">
                Here's how to glide back to your target allocation. Prozpr picked units with the
                lowest capital gains to limit the tax you pay while rebalancing.
              </p>
            </motion.section>

            {/* Current vs target — clustered ₹ bars per asset class. The Current
                and Target bars sit flush (no gap) and share one ₹ x-axis so the
                lengths are comparable across rows (mirrors a clustered bar chart). */}
            {driftRows.length > 0 && (() => {
              const rawMax = Math.max(1, ...driftRows.flatMap((r) => [r.currentInr, r.targetInr]));
              const axisMax = niceCeil(rawMax);
              const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * axisMax);
              return (
                <section style={cardStyle} className="px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] tracking-[0.16em] uppercase text-muted-foreground">Current vs target</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-3.5 rounded-sm" style={{ background: GOLD_SOFT }} />
                        Current
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-3.5 rounded-sm" style={{ background: GOLD }} />
                        Target
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-4">
                    {driftRows.map((row) => {
                      const drift = row.current - row.target;
                      const curWidth = (row.currentInr / axisMax) * 100;
                      const tgtWidth = (row.targetInr / axisMax) * 100;
                      return (
                        <div key={row.key}>
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                              <span className="text-[13px] text-foreground">{row.label}</span>
                            </div>
                            <span
                              className="text-[11px]"
                              style={{ color: drift > 0 ? OVERWEIGHT : drift < 0 ? UNDERWEIGHT : NEUTRAL }}
                            >
                              {row.amountText}
                            </span>
                          </div>

                          {/* Current (top) + Target (bottom) — flush, no gap between them.
                              Current = very light gold, Target = strong deep gold. */}
                          <div className="overflow-hidden rounded-[3px] bg-muted">
                            <div
                              className="h-3.5"
                              style={{
                                width: `${Math.max(curWidth, 0.5)}%`,
                                background: GOLD_SOFT,
                              }}
                              title={`Current · ${axisINR(row.currentInr)}`}
                            />
                            <div
                              className="h-3.5"
                              style={{
                                width: `${Math.max(tgtWidth, 0.5)}%`,
                                background: GOLD,
                              }}
                              title={`Target · ${axisINR(row.targetInr)}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Shared ₹ x-axis */}
                  <div className="relative mt-2 h-4">
                    {ticks.map((t, i) => (
                      <span
                        key={t}
                        className="absolute top-0 text-[9px] tabular-nums text-muted-foreground"
                        style={{
                          left: `${i * 25}%`,
                          transform:
                            i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
                        }}
                      >
                        {axisINR(t)}
                      </span>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Proposed trades — the real BUY / SELL actions grouped by bucket. */}
            <section style={cardStyle} className="px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground">Proposed trades</p>
                <p className="text-[11px] text-wealth-green">{taxText}</p>
              </div>
              {uiTrades.length === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  No trades needed — your portfolio is already aligned with the plan.
                </p>
              ) : (
                <div className="mt-3 space-y-4">
                  {BUCKET_ORDER.map((b) => ({ b, bucketTrades: uiTrades.filter((t) => t.bucket === b) }))
                    .filter(({ bucketTrades }) => bucketTrades.length > 0)
                    .map(({ b, bucketTrades }) => (
                      <div key={b}>
                        <div className="flex items-center gap-2 pb-1.5">
                          <span
                            className="h-1.5 w-3 rounded-full"
                            style={{ backgroundColor: BUCKET_META[b].color, boxShadow: `0 0 10px ${BUCKET_META[b].color}55` }}
                          />
                          <p className="text-[10px] tracking-[0.14em] uppercase" style={{ color: BUCKET_META[b].color }}>
                            {BUCKET_META[b].label}
                          </p>
                        </div>
                        <div className="divide-y divide-border">
                          {bucketTrades.map((trade) => (
                            <button
                              key={trade.id}
                              type="button"
                              onClick={() => openTrade(trade)}
                              className="w-full py-2.5 text-left flex items-center gap-3"
                            >
                              <span
                                className="px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide shrink-0"
                                style={{
                                  backgroundColor:
                                    trade.type === "SELL"
                                      ? "hsl(var(--destructive) / 0.12)"
                                      : "hsl(var(--wealth-green) / 0.12)",
                                  color:
                                    trade.type === "SELL"
                                      ? "hsl(var(--destructive))"
                                      : "hsl(var(--wealth-green))",
                                }}
                              >
                                {trade.type}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] leading-tight font-medium text-foreground truncate">{trade.name}</p>
                                <p className="text-[10.5px] text-muted-foreground truncate">{trade.subtitle}</p>
                              </div>
                              <p className="text-[14px] leading-none font-semibold text-foreground shrink-0">{trade.amount}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* Funds you're keeping — everything in the portfolio NOT being sold,
                tagged performing-well / neutral, with the same fund details. */}
            {keptFunds.length > 0 && (
              <section style={cardStyle} className="px-4 py-4">
                <p className="text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
                  Funds you're keeping
                </p>
                <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                  Performing well or neutral — staying in your portfolio, not part of these trades.
                </p>
                <div className="mt-3 divide-y divide-border">
                  {keptFunds.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide shrink-0"
                        style={{
                          backgroundColor:
                            f.tone === "well"
                              ? "hsl(var(--wealth-green) / 0.12)"
                              : "hsl(var(--muted-foreground) / 0.12)",
                          color:
                            f.tone === "well"
                              ? "hsl(var(--wealth-green))"
                              : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {f.tone === "well" ? "Performing well" : "Neutral"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-tight font-medium text-foreground truncate">{f.name}</p>
                        {f.subtitle && (
                          <p className="text-[10.5px] text-muted-foreground truncate">{f.subtitle}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className="text-[13px] leading-none font-semibold tabular-nums"
                          style={{
                            color:
                              f.gainPct == null
                                ? "hsl(var(--muted-foreground))"
                                : f.gainPct >= 0
                                  ? "hsl(var(--wealth-green))"
                                  : "hsl(var(--destructive))",
                          }}
                        >
                          {f.gainPct == null ? "—" : `${f.gainPct >= 0 ? "+" : ""}${f.gainPct.toFixed(1)}%`}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{axisINR(f.value)}</p>
                      </div>
                    </div>
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
              {isApproved ? "Plan approved" : approving ? "Approving…" : "Proceed"}
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
