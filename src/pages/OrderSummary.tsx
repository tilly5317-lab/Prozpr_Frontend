import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Repeat,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import {
  executeFpRebalance,
  executeFpSipPlan,
  getFpStatus,
  getMySipPlan,
  getRebalancingRunDetail,
  listRebalancingRuns,
  placeFpLumpsum,
  refreshFpOrder,
  type FpOrder,
} from "@/lib/api";
import { formatInr0, formatMoneyInput } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type OrderType = "sip" | "rebalance" | "lumpsum";

interface SummaryLine {
  key: string;
  name: string;
  sub: string | null;
  amount: number;
  /** Rebalance only: BUY / SELL / EXIT — drives the colour + badge. */
  action?: "BUY" | "SELL" | "EXIT" | string;
  /** BUY lines on the rebalance review are editable before placing. */
  editable?: boolean;
}

/** Action → colour scheme: green = buy, red = sell, orange = exit. */
const ACTION_STYLE: Record<string, { badge: string; amount: string }> = {
  BUY: {
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
    amount: "text-emerald-600",
  },
  SELL: {
    badge: "border-[#C24C3A]/40 bg-[#C24C3A]/10 text-[#C24C3A]",
    amount: "text-[#C24C3A]",
  },
  EXIT: {
    badge: "border-orange-500/40 bg-orange-500/10 text-orange-600",
    amount: "text-orange-600",
  },
};

interface LumpsumState {
  scheme_code?: string;
  scheme_name?: string;
  amount?: number;
}

/** FP order states → chip colour. FP strings are shown verbatim. */
function stateChip(state: string) {
  const s = state.toLowerCase();
  if (["confirmed", "completed", "successful", "active"].includes(s))
    return { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600", Icon: CheckCircle2 };
  if (["failed", "cancelled", "rejected"].includes(s))
    return { cls: "border-[#C24C3A]/30 bg-[#C24C3A]/10 text-[#C24C3A]", Icon: XCircle };
  // created / under_review / pending / submitted …
  return { cls: "border-[#D4A868]/40 bg-[#D4A868]/10 text-[#B8863B]", Icon: Clock };
}

function plainName(raw: string): string {
  return raw
    .replace(/\s*·\s*Folio.*$/i, "")
    .replace(/\s*[-–]\s*(Direct|Regular)\s+Plan\b.*$/i, "")
    .replace(/\s+Growth(?:\s+Option)?$/i, "")
    .trim() || raw;
}

const TYPE_COPY: Record<OrderType, { title: string; note: string; cta: string }> = {
  sip: {
    title: "SIP order summary",
    note: "A monthly SIP purchase plan is placed for each fund below.",
    cta: "Place SIP orders",
  },
  rebalance: {
    title: "Rebalancing order summary",
    note: "Buys are placed as lumpsum purchases — adjust any amount before placing. Sells are shown for reference.",
    cta: "Place buy orders",
  },
  lumpsum: {
    title: "Lumpsum order summary",
    note: "A one-time purchase of the fund below.",
    cta: "Place order",
  },
};

/**
 * Order summary (`/order-summary?type=sip|rebalance|lumpsum`) — shown once KYC
 * is complete. Lists exactly what will be placed, asks for confirmation, then
 * places the FP orders and tracks each order's state (FP's string verbatim —
 * `created`, `under_review`, `pending`, …) with a refresh control.
 * Lumpsum details arrive via router state from the Lumpsum page.
 */
const OrderSummary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const type = (params.get("type") || "sip") as OrderType;
  const lumpsum = (location.state as LumpsumState | null) ?? null;

  const [lines, setLines] = useState<SummaryLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<FpOrder[] | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Per-line amount edits (grouped-string inputs), keyed by line key.
  const [edits, setEdits] = useState<Record<string, string>>({});

  const returnPath =
    type === "rebalance" ? "/invest/rebalance-explanation" : type === "lumpsum" ? "/invest/lumpsum" : "/invest/sip";

  // Guard: KYC must be complete; otherwise bounce to the KYC page.
  useEffect(() => {
    let cancelled = false;
    getFpStatus()
      .then((st) => {
        if (!cancelled && !st.ready_to_transact) {
          navigate(`/kyc?returnTo=${encodeURIComponent(returnPath)}`, { replace: true });
        }
      })
      .catch(() => { /* leave the page usable; placing surfaces errors */ });
    return () => { cancelled = true; };
  }, [navigate, returnPath]);

  // Build the summary lines for the selected order type.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (type === "sip") {
          const sip = await getMySipPlan();
          if (cancelled) return;
          if (!sip.has_plan || sip.buys.length === 0) {
            setLoadError("No SIP plan yet — set one up on the SIP page first.");
            setLines([]);
            return;
          }
          setLines(
            sip.buys.map((b) => ({
              key: `${b.scheme_code}-${b.rank}`,
              name: plainName(b.recommended_fund),
              sub: b.sub_category,
              amount: b.monthly_amount_inr,
            })),
          );
        } else if (type === "rebalance") {
          const runs = await listRebalancingRuns();
          if (!runs.length) {
            if (!cancelled) { setLoadError("No rebalancing plan yet — generate one first."); setLines([]); }
            return;
          }
          const detail = await getRebalancingRunDetail(runs[0].id);
          if (cancelled) return;
          // Show the whole plan: BUYs (pending or retryable-failed) are placed
          // and editable; SELL/EXIT rows are shown for clarity but not placed
          // (redemptions aren't enabled on the sandbox).
          const relevant = detail.trades.filter(
            (t) => t.execution_status !== "executed",
          );
          if (!relevant.length) {
            setLoadError("No open trades in your latest plan — everything is already placed.");
            setLines([]);
            return;
          }
          const next = relevant.map((t) => ({
            key: t.id,
            name: plainName(t.recommended_fund),
            sub: t.sub_category,
            amount: t.amount_inr,
            action: t.action,
            editable: t.action === "BUY",
          }));
          setLines(next);
          setEdits(
            Object.fromEntries(
              next
                .filter((l) => l.editable)
                .map((l) => [l.key, formatMoneyInput(String(Math.round(l.amount)))]),
            ),
          );
        } else {
          if (!lumpsum?.scheme_code || !lumpsum.amount) {
            setLoadError("Pick a fund and amount on the Lumpsum page first.");
            setLines([]);
            return;
          }
          setLines([
            {
              key: lumpsum.scheme_code,
              name: plainName(lumpsum.scheme_name || lumpsum.scheme_code),
              sub: null,
              amount: lumpsum.amount,
            },
          ]);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Couldn't load your order.");
          setLines([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [type, lumpsum]);

  /** Effective amount of a line — the (possibly edited) input for editable
   * lines, the plan amount otherwise. */
  const lineAmount = (l: SummaryLine): number => {
    if (!l.editable) return l.amount;
    const parsed = Number((edits[l.key] ?? "").replace(/,/g, ""));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  // Total to be PLACED: buys only — sells aren't placed on the sandbox.
  const total = useMemo(
    () =>
      (lines ?? [])
        .filter((l) => !l.action || l.action === "BUY")
        .reduce((sum, l) => sum + lineAmount(l), 0),
    [lines, edits], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const place = async () => {
    if (placing || !lines?.length) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      if (type === "sip") {
        const res = await executeFpSipPlan();
        setPlaced(res.orders);
        setFailed(res.failed);
      } else if (type === "rebalance") {
        const amounts = Object.fromEntries(
          lines.filter((l) => l.editable).map((l) => [l.key, lineAmount(l)]),
        );
        const res = await executeFpRebalance(amounts);
        setPlaced(res.orders);
        setFailed(res.failed);
      } else if (lumpsum?.scheme_code && lumpsum.amount) {
        const order = await placeFpLumpsum(lumpsum.scheme_code, lumpsum.amount);
        setPlaced([order]);
      }
      toast({ title: "Orders placed", description: "Track their status below." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Please try again.";
      setPlaceError(msg);
      toast({ title: "Couldn't place the order", description: msg, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  };

  const refreshAll = async () => {
    if (!placed?.length || refreshing) return;
    setRefreshing(true);
    try {
      const updated = await Promise.all(
        placed.map((o) => refreshFpOrder(o.id).catch(() => o)),
      );
      setPlaced(updated);
    } finally {
      setRefreshing(false);
    }
  };

  const copy = TYPE_COPY[type];
  const TypeIcon = type === "sip" ? Repeat : ShoppingCart;

  return (
    <div className="mobile-container min-h-screen bg-background pb-10">
      <div className="px-5 pt-10">
        <button
          type="button"
          onClick={() => navigate(returnPath)}
          className="mb-4 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mb-1 flex items-center gap-2">
          <TypeIcon className="h-5 w-5 text-[hsl(var(--wealth-navy))]" />
          <h1 className="text-lg font-bold text-foreground">{copy.title}</h1>
        </div>
        <p className="mb-3 text-[11.5px] leading-snug text-muted-foreground">{copy.note}</p>

        {/* Sandbox disclaimer — this page demonstrates the flow visually; the
            FP sandbox rejects real order creation for all but a few test MFs. */}
        <div className="mb-4 rounded-xl border border-[#D4A868]/40 bg-[#D4A868]/10 p-2.5">
          <p className="text-[10.5px] leading-snug text-foreground">
            <b>Demo preview:</b> this page is for visualising the order flow. The
            FP sandbox does <b>not</b> allow creating orders for mutual funds
            except a few test schemes (ICICI test ISINs) — orders for any other
            fund are rejected by the gateway.
          </p>
        </div>

        {lines === null ? (
          <div className="flex items-center justify-center gap-2 pt-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading your order…</span>
          </div>
        ) : placed ? (
          /* ── Placed: track order states ── */
          <>
            <div className="mb-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Your orders</p>
                <button
                  type="button"
                  onClick={() => void refreshAll()}
                  disabled={refreshing}
                  className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh status
                </button>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {placed.map((o) => {
                  const chip = stateChip(o.state);
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-foreground">
                          {plainName(o.scheme_name || o.isin || "Fund")}
                        </p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {o.kind === "SIP"
                            ? `${formatInr0(o.amount)}/mo · day ${o.installment_day ?? "-"}`
                            : formatInr0(o.amount)}
                          {" · "}
                          {o.fp_id}
                        </p>
                      </div>
                      <span
                        className={`flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chip.cls}`}
                      >
                        <chip.Icon className="h-3 w-3" />
                        {o.state}
                      </span>
                    </div>
                  );
                })}
              </div>
              {failed.length > 0 && (
                <div className="mt-2.5 rounded-xl border border-[#C24C3A]/30 bg-[#C24C3A]/5 p-2.5">
                  <p className="text-[11px] font-semibold text-foreground">Some orders couldn&apos;t be placed</p>
                  {failed.map((f) => (
                    <p key={f} className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{f}</p>
                  ))}
                </div>
              )}
            </div>
            <p className="mb-3 text-[10px] leading-snug text-muted-foreground">
              Statuses come straight from the order gateway and update as it
              processes each order — tap Refresh status to re-check.
            </p>
            <button
              type="button"
              onClick={() => navigate(returnPath)}
              className="w-full rounded-full border border-border py-2.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
            >
              Done
            </button>
          </>
        ) : (
          /* ── Review before placing ── */
          <>
            {loadError ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[12px] leading-snug text-muted-foreground">{loadError}</p>
                <button
                  type="button"
                  onClick={() => navigate(returnPath)}
                  className="mt-3 w-full rounded-full border border-border py-2.5 text-[12.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  Go back
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3 rounded-2xl border border-border bg-card p-4">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {lines.length} trade{lines.length === 1 ? "" : "s"}
                  </p>
                  <div className="mt-2.5 space-y-1.5">
                    {lines.map((l) => {
                      const style = ACTION_STYLE[l.action ?? "BUY"] ?? ACTION_STYLE.BUY;
                      return (
                        <div
                          key={l.key}
                          className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {l.action && (
                                <span
                                  className={`shrink-0 rounded-full border px-1.5 py-px text-[9px] font-bold ${style.badge}`}
                                >
                                  {l.action}
                                </span>
                              )}
                              <p className="truncate text-[12px] font-medium text-foreground">{l.name}</p>
                            </div>
                            {l.sub && <p className="truncate text-[10px] text-muted-foreground">{l.sub}</p>}
                          </div>
                          {l.editable ? (
                            <div className="flex shrink-0 items-center rounded-lg border border-border bg-background px-2">
                              <span className="text-[11px] text-muted-foreground">₹</span>
                              <input
                                inputMode="numeric"
                                value={edits[l.key] ?? ""}
                                onChange={(e) =>
                                  setEdits((prev) => ({
                                    ...prev,
                                    [l.key]: formatMoneyInput(e.target.value),
                                  }))
                                }
                                className={`w-20 bg-transparent px-1 py-1.5 text-right text-[12px] font-semibold tabular-nums outline-none ${style.amount}`}
                              />
                            </div>
                          ) : (
                            <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${style.amount}`}>
                              {l.action === "SELL" || l.action === "EXIT" ? "−" : ""}
                              {formatInr0(l.amount)}
                              {type === "sip" ? <span className="text-[10px] font-medium text-muted-foreground">/mo</span> : null}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {type === "rebalance" && lines.some((l) => l.action === "SELL" || l.action === "EXIT") && (
                    <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                      Sell / exit trades are shown for the full picture but aren&apos;t
                      placed — redemptions aren&apos;t enabled on the sandbox.
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                    <p className="text-[12px] font-semibold text-foreground">
                      {type === "rebalance" ? "Total to invest (buys)" : "Total"}
                    </p>
                    <p className="text-[13px] font-bold tabular-nums text-foreground">
                      {formatInr0(total)}
                      {type === "sip" ? <span className="text-[10px] font-medium text-muted-foreground">/mo</span> : null}
                    </p>
                  </div>
                </div>

                {placeError && (
                  <div className="mb-3 rounded-xl border border-[#C24C3A]/30 bg-[#C24C3A]/5 p-2.5">
                    <p className="text-[11px] font-semibold text-foreground">Order placement failed</p>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{placeError}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void place()}
                  disabled={placing || !lines.length || total <= 0}
                  className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
                >
                  {placing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {placing ? "Placing orders…" : copy.cta}
                </button>
                <p className="mt-2 text-center text-[10px] leading-snug text-muted-foreground">
                  Orders are placed on the sandbox order gateway.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrderSummary;
