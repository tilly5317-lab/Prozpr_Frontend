import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { parseISO } from "date-fns";
import { ArrowLeft, Receipt, Wallet } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import {
  filterNavByRange,
  formatDate,
  formatINRCompact,
  formatINRPaisa,
  formatPct,
  formatUnits,
  NavChart,
  navPointsFromApi,
  pctReturnForRange,
  ProzprRatingCard,
  RangePills,
  StatBlock,
  type NavRange,
} from "@/components/fund/FundScreenUi";
import { Button } from "@/components/ui/button";
import { getMfHoldingDetail, type MfHoldingDetailResponse } from "@/lib/api";

const TXN_LABEL: Record<string, string> = {
  BUY: "Purchase",
  SELL: "Redemption",
  SWITCH_IN: "Switch in",
  SWITCH_OUT: "Switch out",
  DIVIDEND_REINVEST: "Dividend reinvest",
};

function labelTxn(type: string): string {
  return TXN_LABEL[type] ?? type.replace(/_/g, " ");
}

function parseNavDate(d: string): Date {
  try {
    return parseISO(d);
  } catch {
    return new Date(d);
  }
}

export default function PortfolioFundDetail() {
  const { schemeCode: schemeCodeParam } = useParams<{ schemeCode: string }>();
  const navigate = useNavigate();
  const schemeCode = schemeCodeParam ? decodeURIComponent(schemeCodeParam) : "";

  const [range, setRange] = useState<NavRange>("1Y");
  const [data, setData] = useState<MfHoldingDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schemeCode.trim()) {
      setError("Missing fund identifier.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getMfHoldingDetail(schemeCode);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load fund details.");
    } finally {
      setLoading(false);
    }
  }, [schemeCode]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [schemeCode]);

  const history = useMemo(
    () => (data?.nav_history?.length ? navPointsFromApi(data.nav_history) : []),
    [data?.nav_history],
  );

  const rangedHistory = useMemo(() => filterNavByRange(history, range), [history, range]);

  const first = rangedHistory[0]?.nav ?? 0;
  const last = rangedHistory[rangedHistory.length - 1]?.nav ?? data?.latest_nav ?? 0;
  const isUp = last >= first;
  const rangeReturn = first > 0 ? ((last - first) / first) * 100 : 0;
  const latestNavDate = data?.latest_nav_date ?? history[history.length - 1]?.date ?? "";

  const trailingItems = useMemo(
    () => [
      { label: "1M", value: pctReturnForRange(history, "1M") },
      { label: "3M", value: pctReturnForRange(history, "3M") },
      { label: "1Y", value: data?.nav_return_1y_pct ?? pctReturnForRange(history, "1Y") },
      { label: "3Y", value: data?.nav_return_3y_pct ?? pctReturnForRange(history, "3Y") },
    ],
    [history, data?.nav_return_1y_pct, data?.nav_return_3y_pct],
  );

  const pos = data?.position;
  const invested = pos?.invested_amount ?? 0;
  const units = pos?.units ?? 0;
  const latestNav = data?.latest_nav ?? last;
  // Current value = latest NAV × units held. Fall back to the backend's value only
  // when we have no unit count to multiply.
  const current = units > 0 ? units * latestNav : (pos?.current_value ?? 0);
  const unrealisedGain = current - invested;
  const unrealisedPct = invested > 0 ? (unrealisedGain / invested) * 100 : 0;
  const avgCostPerUnit = pos?.average_cost ?? (units > 0 ? invested / units : 0);

  const planLabel = (data?.plan_type ?? "REGULAR").toUpperCase();
  const optionLabel = (data?.option_type ?? "GROWTH").toUpperCase();
  const schemeType = data?.category ?? "Mutual Fund";

  const sortedTxns = useMemo(() => {
    if (!data?.transactions.length) return [];
    return [...data.transactions].sort(
      (a, b) =>
        parseNavDate(b.transaction_date).getTime() - parseNavDate(a.transaction_date).getTime(),
    );
  }, [data?.transactions]);

  return (
    <div className="mobile-container min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background">
        <div className="flex items-start gap-2 px-4 pb-3 pt-10">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">Mutual fund</p>
            <h1 className="text-[15px] font-semibold leading-tight text-foreground">
              {loading ? "Loading…" : data?.scheme_name ?? schemeCode}
            </h1>
            {!loading && (data?.amc_name || data?.sub_category) && (
              <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                {[data?.amc_name, data?.sub_category].filter(Boolean).join(" · ")}
              </p>
            )}
            {!loading && data && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                  {planLabel}
                </span>
                <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                  {optionLabel}
                </span>
                <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                  {schemeType.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-16 rounded-2xl bg-muted" />
            <div className="h-[220px] rounded-2xl bg-muted" />
            <div className="h-28 rounded-2xl bg-muted" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-[13px] text-foreground">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" type="button" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {!loading && data && (
          <>
            <ProzprRatingCard />

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">NAV / unit</p>
                  <p
                    className="mt-0.5 text-[18px] font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    ₹{last.toFixed(4)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">{range} change</p>
                  <p
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: isUp ? "hsl(160 50% 38%)" : "hsl(0 84% 50%)" }}
                  >
                    {formatPct(rangeReturn)}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <NavChart points={rangedHistory} isUp={isUp} />
              </div>
              <RangePills range={range} onRange={setRange} />
            </section>

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-[12px] font-semibold text-foreground">Trailing NAV returns</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                Total return on the NAV through {latestNavDate ? formatDate(latestNavDate) : "—"}.
              </p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {trailingItems.map(({ label, value }) => {
                  const positive = value != null && value >= 0;
                  return (
                    <div key={label} className="rounded-lg bg-muted/30 px-1.5 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p
                        className="mt-0.5 text-[11.5px] font-semibold tabular-nums"
                        style={{
                          color:
                            value == null
                              ? "hsl(var(--muted-foreground))"
                              : positive
                                ? "hsl(160 50% 38%)"
                                : "hsl(0 84% 50%)",
                        }}
                      >
                        {formatPct(value)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {data.notes.length > 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-950 dark:text-amber-100">
                {data.notes.map((n, i) => (
                  <p key={`${i}-${n.slice(0, 24)}`}>{n}</p>
                ))}
              </div>
            )}

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[12px] font-semibold text-foreground">
                  Your holding
                  {pos && (
                    <span className="font-normal text-muted-foreground tabular-nums">
                      {" "}({formatUnits(units)} units)
                    </span>
                  )}
                </p>
              </div>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                Aggregated across folios held in your primary portfolio (CAMS-linked positions).
              </p>
              {!pos ? (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  No position found for this scheme yet. Import a CAS statement or sync holdings.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <StatBlock
                    label="Current value"
                    value={current != null ? formatINRPaisa(current) : "—"}
                  />
                  <StatBlock
                    label="Invested"
                    value={invested != null ? formatINRPaisa(invested) : "—"}
                  />
                  <StatBlock
                    label="Unrealised gain"
                    value={`${unrealisedGain >= 0 ? "+" : "−"}${formatINRPaisa(Math.abs(unrealisedGain))}`}
                    hint={formatPct(unrealisedPct)}
                    valueColor={unrealisedGain >= 0 ? "hsl(160 50% 38%)" : "hsl(0 84% 50%)"}
                  />
                  <StatBlock label="Avg cost / unit" value={`₹${avgCostPerUnit.toFixed(4)}`} />
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[12px] font-semibold text-foreground">Transactions</p>
              </div>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                Ledger rows traced from your CAS imports and consolidation pipeline.
              </p>
              {sortedTxns.length === 0 ? (
                <p className="mt-3 text-center text-[12px] text-muted-foreground">
                  No transactions recorded for this holding.
                </p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-lg border border-border/60">
                  <div className="grid grid-cols-12 gap-1 bg-muted/40 px-2 py-1.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">
                    <span className="col-span-3">Date</span>
                    <span className="col-span-2">Type</span>
                    <span className="col-span-3 text-right">Units</span>
                    <span className="col-span-2 text-right">Amount</span>
                    <span className="col-span-2 text-right">NAV</span>
                  </div>
                  <ul className="divide-y divide-border/40">
                    {sortedTxns.map((t) => (
                      <li
                        key={t.id}
                        className="grid grid-cols-12 gap-1 px-2 py-2 text-[11px] tabular-nums"
                      >
                        <span className="col-span-3 text-muted-foreground">
                          {formatDate(t.transaction_date)}
                        </span>
                        <span className="col-span-2 text-foreground">{labelTxn(t.transaction_type)}</span>
                        <span className="col-span-3 text-right text-foreground">{formatUnits(t.units)}</span>
                        <span className="col-span-2 text-right text-foreground">
                          {formatINRCompact(Math.abs(t.signed_amount))}
                        </span>
                        <span className="col-span-2 text-right text-muted-foreground">
                          ₹{t.nav.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
