import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format, parseISO, subMonths, subYears } from "date-fns";
import {
  ArrowLeft,
  Building2,
  Landmark,
  LineChart as LineChartIcon,
  ListOrdered,
  PieChart,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getMfHoldingDetail,
  type MfHoldingDetailResponse,
  type MfHoldingNavPoint,
} from "@/lib/api";
import { cn, formatInrCompact, formatInrPaisa } from "@/lib/utils";

type NavRange = "1M" | "6M" | "1Y" | "3Y" | "5Y" | "All";

const NAV_RANGES: NavRange[] = ["1M", "6M", "1Y", "3Y", "5Y", "All"];

const GREEN = "hsl(160 50% 38%)";
const RED = "hsl(0 65% 50%)";
const HAIRLINE = "hsl(var(--hairline))";

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

function filterNavSeries(points: MfHoldingNavPoint[], range: NavRange): MfHoldingNavPoint[] {
  if (points.length === 0) return [];
  if (range === "All") return points;
  const last = parseNavDate(points[points.length - 1].nav_date);
  let cutoff: Date;
  if (range === "1M") cutoff = subMonths(last, 1);
  else if (range === "6M") cutoff = subMonths(last, 6);
  else cutoff = subYears(last, range === "1Y" ? 1 : range === "3Y" ? 3 : 5);
  return points.filter((p) => parseNavDate(p.nav_date) >= cutoff);
}

function downsampleChart(points: { nav_date: string; nav: number }[], maxPts = 380): typeof points {
  if (points.length <= maxPts) return points;
  const step = Math.ceil(points.length / maxPts);
  const out: typeof points = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]!);
  const last = points[points.length - 1]!;
  if (out[out.length - 1]?.nav_date !== last.nav_date) out.push(last);
  return out;
}

function MetricTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function NavReturnTile({ label, pct }: { label: string; pct: number | null | undefined }) {
  const missing = pct == null || Number.isNaN(pct);
  const formatted = missing ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const color = missing
    ? "text-muted-foreground"
    : pct! >= 0
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-700 dark:text-red-400";
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-2.5 py-2.5 text-center">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[15px] font-semibold tabular-nums leading-tight", color)}>{formatted}</p>
    </div>
  );
}

export default function MfFundDetail() {
  const { schemeCode: schemeCodeParam } = useParams<{ schemeCode: string }>();
  const navigate = useNavigate();
  const schemeCode = schemeCodeParam ? decodeURIComponent(schemeCodeParam) : "";

  const [range, setRange] = useState<NavRange>("3Y");
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

  useLayoutEffect(() => {
    if (loading) return;
    const id = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [loading, schemeCode]);

  const chartSeries = useMemo(() => {
    if (!data?.nav_history?.length) return [];
    const sliced = filterNavSeries(data.nav_history, range);
    const sampled = downsampleChart(sliced);
    return sampled.map((p) => ({
      t: p.nav_date,
      nav: p.nav,
      label: format(parseNavDate(p.nav_date), "MMM yyyy"),
    }));
  }, [data?.nav_history, range]);

  const chartColor = useMemo(() => {
    if (chartSeries.length < 2) return GREEN;
    return chartSeries[chartSeries.length - 1].nav >= chartSeries[0].nav ? GREEN : RED;
  }, [chartSeries]);

  const latestNavLabel =
    data?.latest_nav != null && data.latest_nav_date
      ? `${formatInrPaisa(data.latest_nav)} · ${format(parseNavDate(data.latest_nav_date), "dd MMM yyyy")}`
      : null;

  const subtitleParts = [data?.category, data?.plan_type, data?.option_type].filter(Boolean);

  const hasPosition = data?.position != null;
  const hasTransactions = (data?.transactions?.length ?? 0) > 0;

  return (
    <div className="mobile-container flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/95 px-[14px] pb-3 pt-12 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-0.5 h-9 w-9 shrink-0"
            onClick={() => navigate(-1)}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-muted-foreground">
              Mutual fund
            </p>
            <h1 className="text-[17px] font-semibold leading-snug text-foreground">
              {loading ? "Loading…" : data?.scheme_name ?? schemeCode}
            </h1>
            {(data?.amc_name || subtitleParts.length > 0) && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                {[data?.amc_name, subtitleParts.join(" · ")].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 space-y-3 px-[14px] pb-28 pt-4">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-[240px] rounded-xl bg-muted" />
            <div className="h-24 rounded-xl bg-muted" />
            <div className="h-28 rounded-xl bg-muted" />
          </div>
        )}

        {!loading && error && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-4">
              <p className="text-sm text-foreground">{error}</p>
              <Button variant="secondary" size="sm" className="mt-3" type="button" onClick={() => void load()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {!loading && data && (
          <>
            {/* NAV chart */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/40 bg-muted/20 p-4 pb-3">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <LineChartIcon className="h-4 w-4 shrink-0" />
                    <CardTitle className="text-sm font-semibold text-foreground">NAV / unit</CardTitle>
                  </div>
                  <CardDescription className="mt-1 text-[11px] leading-relaxed">
                    Daily values from <span className="font-medium text-foreground/90">mf_nav_history</span>
                    {data.scheme_code ? ` · scheme ${data.scheme_code}` : ""}
                  </CardDescription>
                  {latestNavLabel ? (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">{latestNavLabel}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {NAV_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRange(r)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                        range === r
                          ? "bg-foreground text-background"
                          : "bg-muted/80 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-5">
                {chartSeries.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">
                    No NAV rows in <span className="font-mono text-xs">mf_nav_history</span> for this scheme yet.
                    Run NAV sync on the server to populate the chart.
                  </p>
                ) : (
                  <>
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="navFillDiscover" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={chartColor} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={HAIRLINE} vertical={false} />
                          <XAxis
                            dataKey="label"
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={{ stroke: HAIRLINE }}
                            interval="preserveStartEnd"
                            minTickGap={28}
                          />
                          <YAxis
                            domain={["auto", "auto"]}
                            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                            tickLine={false}
                            axisLine={false}
                            width={44}
                            tickFormatter={(v) => Number(v).toFixed(2)}
                          />
                          <Tooltip
                            contentStyle={{
                              borderRadius: 10,
                              border: "1px solid hsl(var(--border))",
                              fontSize: 12,
                            }}
                            formatter={(value: number) => [formatInrPaisa(value), "NAV"]}
                            labelFormatter={(_, payload) =>
                              payload?.[0]?.payload?.t
                                ? format(parseNavDate(String(payload[0].payload.t)), "dd MMM yyyy")
                                : ""
                            }
                          />
                          <Area
                            type="monotone"
                            dataKey="nav"
                            stroke={chartColor}
                            strokeWidth={2}
                            fill="url(#navFillDiscover)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0, fill: chartColor }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {data.nav_history_truncated ? (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        Series capped for API payload; extend range via query params if needed.
                      </p>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Trailing NAV returns */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <CardHeader className="space-y-1 border-b border-border/40 bg-muted/20 p-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4 shrink-0" />
                  <CardTitle className="text-sm font-semibold text-foreground">Trailing NAV returns</CardTitle>
                </div>
                <CardDescription className="text-[11px] leading-relaxed">
                  Total return vs historical NAV in <span className="font-medium">mf_nav_history</span>
                  {data.nav_returns_as_of
                    ? ` · end ${format(parseNavDate(data.nav_returns_as_of), "dd MMM yyyy")}`
                    : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <NavReturnTile label="YTD" pct={data.nav_return_ytd_pct} />
                  <NavReturnTile label="6M" pct={data.nav_return_6m_pct} />
                  <NavReturnTile label="1Y" pct={data.nav_return_1y_pct} />
                  <NavReturnTile label="3Y" pct={data.nav_return_3y_pct} />
                  <NavReturnTile label="5Y" pct={data.nav_return_5y_pct} />
                </div>
                <p className="mt-3 text-[10px] leading-snug text-muted-foreground">
                  YTD uses the first NAV on or after 1 Jan; other horizons compare to the latest NAV on or before the
                  rolling date. Insufficient history shows as —.
                </p>
              </CardContent>
            </Card>

            {data.notes.length > 0 && (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-950 dark:text-amber-100">
                {data.notes.map((n, i) => (
                  <p key={`${i}-${n.slice(0, 24)}`}>{n}</p>
                ))}
              </div>
            )}

            {/* Fund profile */}
            <Card className="overflow-hidden border-border/60 shadow-sm">
              <CardHeader className="space-y-1 border-b border-border/40 bg-muted/20 p-4 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Landmark className="h-4 w-4 shrink-0" />
                  <CardTitle className="text-sm font-semibold text-foreground">Fund profile</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-2 rounded-lg bg-muted/30 px-2.5 py-2">
                    <PieChart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">ISIN</p>
                      <p className="truncate font-mono text-[12px] font-medium">{data.isin ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 rounded-lg bg-muted/30 px-2.5 py-2">
                    <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Scheme code</p>
                      <p className="truncate font-mono text-[12px] font-medium">{data.scheme_code}</p>
                    </div>
                  </div>
                </div>
                {data.sub_category ? (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">{data.category ?? "Category"}</span>
                    {" · "}
                    {data.sub_category}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {/* Your holding — only if user has a position */}
            {hasPosition && (
              <Card className="overflow-hidden border-border/60 shadow-sm">
                <CardHeader className="space-y-1 border-b border-border/40 bg-muted/20 p-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Wallet className="h-4 w-4 shrink-0" />
                    <CardTitle className="text-sm font-semibold text-foreground">Your holding</CardTitle>
                  </div>
                  <p className="text-[11px] font-normal text-muted-foreground">
                    Aggregated across folios in your primary portfolio (CAMS-linked positions).
                  </p>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <MetricTile
                      label="Current value"
                      value={
                        data.position!.current_value != null
                          ? formatInrPaisa(data.position!.current_value)
                          : "—"
                      }
                    />
                    <MetricTile
                      label="Invested"
                      value={
                        data.position!.invested_amount != null
                          ? formatInrPaisa(data.position!.invested_amount)
                          : "—"
                      }
                    />
                    <MetricTile
                      label="Unrealised gain"
                      value={
                        data.position!.unrealised_gain != null
                          ? `${data.position!.unrealised_gain >= 0 ? "+" : "−"}${formatInrCompact(Math.abs(data.position!.unrealised_gain))}`
                          : "—"
                      }
                      sub={
                        data.position!.unrealised_gain_pct != null
                          ? `${data.position!.unrealised_gain_pct >= 0 ? "+" : ""}${data.position!.unrealised_gain_pct.toFixed(2)}%`
                          : null
                      }
                    />
                    <MetricTile
                      label="Units"
                      value={
                        data.position!.units != null ? data.position!.units.toLocaleString("en-IN") : "—"
                      }
                    />
                    <MetricTile
                      label="Avg cost / unit"
                      value={
                        data.position!.average_cost != null ? formatInrPaisa(data.position!.average_cost) : "—"
                      }
                    />
                    <MetricTile
                      label="Latest NAV"
                      value={
                        data.position!.current_price != null ? formatInrPaisa(data.position!.current_price) : "—"
                      }
                      sub={latestNavLabel ? `Quote: ${latestNavLabel}` : null}
                    />
                    <MetricTile
                      label="Folios"
                      value={String(data.position!.folios ?? 0)}
                      sub={
                        data.position!.allocation_percentage != null
                          ? `${data.position!.allocation_percentage.toFixed(1)}% of portfolio`
                          : null
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transactions — only if user has transactions */}
            {hasTransactions && (
              <Card className="overflow-hidden border-border/60 shadow-sm">
                <CardHeader className="space-y-1 border-b border-border/40 bg-muted/20 p-4 pb-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <ListOrdered className="h-4 w-4 shrink-0" />
                    <CardTitle className="text-sm font-semibold text-foreground">Transactions</CardTitle>
                  </div>
                  <p className="text-[11px] font-normal text-muted-foreground">
                    Ledger rows stored from your CAS imports and normalisation pipeline.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-border/60 bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 text-right font-medium">Units</th>
                          <th className="px-3 py-2 text-right font-medium">Cum. Units</th>
                          <th className="px-3 py-2 text-right font-medium">NAV</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="px-3 py-2 text-right font-medium">Stamp Duty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const sorted = [...data.transactions].sort(
                            (a, b) =>
                              parseNavDate(a.transaction_date).getTime() -
                              parseNavDate(b.transaction_date).getTime(),
                          );
                          let cumUnits = 0;
                          const withCum = sorted.map((tx) => {
                            cumUnits += tx.units;
                            return { ...tx, cumUnits };
                          });
                          return withCum.reverse().map((tx) => (
                            <tr
                              key={tx.id}
                              className="border-b border-border/40 last:border-0 hover:bg-muted/20"
                            >
                              <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-foreground">
                                {format(parseNavDate(tx.transaction_date), "dd MMM yyyy")}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="font-medium text-foreground">{labelTxn(tx.transaction_type)}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {tx.units.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-medium text-foreground/80">
                                {tx.cumUnits.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                                {formatInrPaisa(tx.nav)}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-2.5 text-right font-semibold tabular-nums",
                                  tx.is_inflow ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
                                )}
                              >
                                {tx.signed_amount >= 0 ? "+" : "−"}
                                {formatInrCompact(Math.abs(tx.signed_amount))}
                              </td>
                              <td
                                className={cn(
                                  "px-3 py-2.5 text-right tabular-nums",
                                  tx.stamp_duty != null && tx.stamp_duty > 0
                                    ? "font-medium text-red-700 dark:text-red-400"
                                    : "text-muted-foreground",
                                )}
                              >
                                {tx.stamp_duty != null && tx.stamp_duty > 0
                                  ? `−${formatInrPaisa(tx.stamp_duty)}`
                                  : "—"}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <p className="pb-2 text-center text-[10px] text-muted-foreground">
              NAV chart and trailing returns use <span className="font-mono">mf_nav_history</span>.
              {(hasPosition || hasTransactions) && " Holdings and transactions reflect CAS ingest and normalisation."}
            </p>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
