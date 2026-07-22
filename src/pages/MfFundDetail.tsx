import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, GitCompare, Info } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import {
  filterNavByRange,
  formatDate,
  formatNav,
  formatPct,
  NavChart,
  navPointsFromApi,
  pctReturnForRange,
  ProzprRatingCard,
  RangePills,
  type NavRange,
} from "@/components/fund/FundScreenUi";
import { Button } from "@/components/ui/button";
import { getMfHoldingDetail, type MfHoldingDetailResponse } from "@/lib/api";

/** Discover scheme detail — upcoming UI, `/mf/funds/:schemeCode/holding-detail` data. */
export default function MfFundDetail() {
  const { schemeCode: schemeCodeParam } = useParams<{ schemeCode: string }>();
  const navigate = useNavigate();
  const schemeCode = schemeCodeParam ? decodeURIComponent(schemeCodeParam) : "";

  const [range, setRange] = useState<NavRange>("1Y");
  const [data, setData] = useState<MfHoldingDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schemeCode.trim()) {
      setError("Missing scheme code.");
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

  const hasTransactions = (data?.transactions.length ?? 0) > 0;

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
            <h1 className="text-lg font-semibold leading-tight text-foreground">
              {loading ? "Loading…" : data?.scheme_name ?? schemeCode}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/discovery/compare?codes=${encodeURIComponent(schemeCode)}`)}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/40"
          >
            <GitCompare className="h-3.5 w-3.5" /> Compare
          </button>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-16 rounded-2xl bg-muted" />
            <div className="h-[220px] rounded-2xl bg-muted" />
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
                    ₹{formatNav(last)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">{range} change</p>
                  <p
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: isUp ? "hsl(164 54% 40%)" : "hsl(0 84% 50%)" }}
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
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Total return on the NAV through {latestNavDate ? formatDate(latestNavDate) : "—"}.
              </p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {trailingItems.map(({ label, value }) => {
                  const positive = value != null && value >= 0;
                  return (
                    <div key={label} className="rounded-lg bg-muted/30 px-1.5 py-2 text-center">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p
                        className="mt-0.5 text-[11.5px] font-semibold tabular-nums"
                        style={{
                          color:
                            value == null
                              ? "hsl(var(--muted-foreground))"
                              : positive
                                ? "hsl(164 54% 40%)"
                                : "hsl(0 84% 50%)",
                        }}
                      >
                        {formatPct(value)}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">
                Trailing returns reflect compounded NAV change over the trailing window — useful for
                comparison but not a forecast of future performance.
              </p>
            </section>

            {!hasTransactions && (
              <section
                className="flex items-start gap-2 rounded-2xl px-4 py-3"
                style={{
                  backgroundColor: "hsl(var(--muted) / 0.45)",
                  border: "1px solid hsl(var(--border) / 0.6)",
                }}
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="text-[12px] text-muted-foreground">
                  You have no recorded transactions in this scheme.
                </p>
              </section>
            )}

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-[12px] font-semibold text-foreground">Fund profile</p>
              <dl className="mt-3 space-y-2 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">ISIN</dt>
                  <dd
                    className="font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {data.isin ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Scheme code</dt>
                  <dd
                    className="font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {data.scheme_code}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-semibold text-foreground">
                    {[data.category, data.sub_category].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-semibold text-foreground">
                    {[data.plan_type, data.option_type].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
