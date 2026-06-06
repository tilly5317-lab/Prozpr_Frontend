import { type CSSProperties, useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, Loader2, Settings2, Sparkles, X } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import RebalanceGate from "@/components/invest/RebalanceGate";
import { toast } from "@/hooks/use-toast";
import {
  getRebalancingRunDetail,
  listRebalancingRuns,
  runRebalancing,
  updateRebalancingStatus,
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
  amountText: string;
};

type UITrade = {
  id: string;
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
      amountText,
    };
  });
}

function mapTrade(t: RebalancingTrade): UITrade {
  const type: "BUY" | "SELL" = t.action.toUpperCase() === "BUY" ? "BUY" : "SELL";
  return {
    id: t.id,
    type,
    bucket: classifyBucket(t.asset_subgroup),
    amount: fmtINR(t.amount_inr),
    subtitle: t.reason_title || (type === "BUY" ? "Buy" : "Sell"),
    name: t.recommended_fund,
    category: t.sub_category || t.asset_subgroup,
    rationale: t.reason_text,
  };
}

const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, #1c1c1b 0%, #161615 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
};

const RebalanceExplanation = () => {
  const [detail, setDetail] = useState<RebalancingRunDetail | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [editSignal, setEditSignal] = useState(0);
  const [selectedTrade, setSelectedTrade] = useState<UITrade | null>(null);

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
              <span className="text-[11px] uppercase tracking-[0.14em] text-[#7E879C]">Rebalancing plan</span>
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
                  "linear-gradient(135deg, rgba(212,168,104,0.16) 0%, rgba(28,28,27,1) 60%, rgba(28,28,27,1) 100%)",
                border: "1px solid rgba(212,168,104,0.40)",
                borderRadius: 16,
              }}
              initial={{
                boxShadow:
                  "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
              }}
              animate={{
                boxShadow: [
                  "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
                  "0 0 0 2px rgba(229,192,121,0.55), 0 0 40px 6px rgba(212,168,104,0.55)",
                  "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
                  "0 0 0 2px rgba(229,192,121,0.55), 0 0 40px 6px rgba(212,168,104,0.55)",
                  "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
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
                  style={{ backgroundColor: "rgba(212,168,104,0.18)", color: "#E5C079" }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <span
                  className="text-[10px] uppercase font-semibold"
                  style={{ letterSpacing: "1.6px", color: "#E5C079" }}
                >
                  Prozpr insight
                </span>
              </div>
              <h1 className="mt-3 text-[21px] leading-tight font-semibold tracking-tight text-[#F5EEDC]">
                Time to fine-tune your mix.
              </h1>
              <p className="mt-2.5 text-[12.5px] leading-5 text-[#C9CFDF]">
                Here's how to glide back to your target allocation. Prozpr picked units with the
                lowest capital gains to limit the tax you pay while rebalancing.
              </p>
            </motion.section>

            {/* Current vs target — real drift from the run's subgroup roll-ups. */}
            {driftRows.length > 0 && (
              <section style={cardStyle} className="px-4 py-4">
                <p className="text-[11px] tracking-[0.16em] uppercase text-[#7E879C]">Current vs target</p>
                <div className="mt-4 space-y-4">
                  {driftRows.map((row) => {
                    const drift = row.current - row.target;
                    const total = Math.max(row.current, row.target);
                    const currentWidth = total > 0 ? (row.current / total) * 100 : 0;
                    return (
                      <div key={row.key}>
                        <div className="flex items-center justify-between text-[13px]">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                            <span className="text-[#E7ECF8]">{row.label}</span>
                          </div>
                          <span className="font-medium text-[#D2D9E8]">{row.current}% → {row.target}%</span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-[#252523]">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${currentWidth}%`,
                              background: row.color,
                              boxShadow: `0 0 14px ${row.color}55`,
                            }}
                          />
                        </div>
                        <p
                          className="mt-1 text-[11px]"
                          style={{ color: drift > 0 ? "#FF6A5B" : drift < 0 ? "#45CF8C" : "#9DA8BF" }}
                        >
                          {row.amountText}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Proposed trades — the real BUY / SELL actions grouped by bucket. */}
            <section style={cardStyle} className="px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] tracking-[0.16em] uppercase text-[#7E879C]">Proposed trades</p>
                <p className="text-[11px] text-[#34D39A]">{taxText}</p>
              </div>
              {uiTrades.length === 0 ? (
                <p className="mt-3 text-[13px] text-[#8E99B1]">
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
                        <div className="divide-y divide-white/8">
                          {bucketTrades.map((trade) => (
                            <button
                              key={trade.id}
                              type="button"
                              onClick={() => setSelectedTrade(trade)}
                              className="w-full py-2.5 text-left flex items-center gap-3"
                            >
                              <span
                                className="px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide shrink-0"
                                style={{
                                  backgroundColor: trade.type === "SELL" ? "#3A1717" : "#113126",
                                  color: trade.type === "SELL" ? "#FF6559" : "#3FD998",
                                }}
                              >
                                {trade.type}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[13px] leading-tight font-medium text-[#EAF0FF] truncate">{trade.name}</p>
                                <p className="text-[10.5px] text-[#8E99B1] truncate">{trade.subtitle}</p>
                              </div>
                              <p className="text-[14px] leading-none font-semibold text-[#EEF3FF] shrink-0">{trade.amount}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

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

      <AnimatePresence>
        {selectedTrade && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setSelectedTrade(null)}
            />
            <div
              className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 pointer-events-none"
              role="dialog"
              aria-modal="true"
            >
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-full max-w-md rounded-2xl text-white overflow-hidden pointer-events-auto"
                style={{ background: "#1c1c1b", maxHeight: "min(94dvh, 720px)", display: "flex", flexDirection: "column" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="shrink-0 flex items-center justify-end px-4 pt-2 pb-1">
                  <button
                    onClick={() => setSelectedTrade(null)}
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[#9CA6BF] hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto px-5" style={{ paddingBottom: "1rem" }}>
                  <div className="flex items-center gap-2">
                    {selectedTrade.type === "BUY" ? (
                      <ArrowDownLeft className="h-4 w-4 text-[#3FD998]" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-[#FF6559]" />
                    )}
                    <p className="text-[10.5px] tracking-[0.12em] uppercase text-[#8E98B0]">{selectedTrade.type} trade details</p>
                  </div>
                  <h3 className="mt-1 text-[15px] font-semibold leading-tight text-[#ECF1FF]">{selectedTrade.name}</h3>
                  <p className="text-[11px] text-[#97A3BE] leading-tight">{selectedTrade.category}</p>

                  <div className="mt-3 rounded-xl border border-[#2a2a28] bg-[#252523] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[#8E98B0]">Why this trade</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-[#D0D8EC]">{selectedTrade.rationale}</p>
                  </div>

                  <p className="mt-3 text-[10.5px] uppercase tracking-[0.14em] text-[#7E879C]">Key stats</p>
                  <div className="mt-1 grid grid-cols-3 gap-x-3 gap-y-1.5">
                    {[
                      { label: "Action", value: selectedTrade.type },
                      { label: "Amount", value: selectedTrade.amount },
                      { label: "Bucket", value: BUCKET_META[selectedTrade.bucket].label },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-[9.5px] uppercase text-[#7E879C] leading-tight">{item.label}</p>
                        <p className="text-[12px] font-semibold text-[#ECF1FF] leading-tight">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
      <BottomNav />
    </div>
  );
};

export default RebalanceExplanation;
