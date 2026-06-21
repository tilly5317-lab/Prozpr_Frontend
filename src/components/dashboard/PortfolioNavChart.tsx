import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildNetworthHistory,
  getNetworthHistoryStatus,
  getPortfolioNavHistory,
  type NetworthJobStatus,
  type PortfolioNavHistoryPoint,
  type PortfolioNavHorizon,
} from "@/lib/api";
import { formatInrPaisa } from "@/lib/utils";

const HORIZONS: PortfolioNavHorizon[] = ["1M", "3M", "1Y", "3Y", "MAX"];

// X-axis label format depends on horizon: short windows (1M / 3M) read as
// "dd-mmm" (e.g. 05-Jun); longer windows read as "mmm-yy" (e.g. Jun-26).
function formatXLabel(iso: string, horizon: PortfolioNavHorizon): string {
  const d = new Date(iso);
  const mon = d.toLocaleDateString("en-IN", { month: "short" });
  if (horizon === "1M" || horizon === "3M") {
    const dd = String(d.getDate()).padStart(2, "0");
    return `${dd}-${mon}`;
  }
  const yy = String(d.getFullYear()).slice(-2);
  return `${mon}-${yy}`;
}

function formatTooltipDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface ChartTooltipPayload {
  payload: PortfolioNavHistoryPoint;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const gain = p.gain_percentage;
  return (
    <div
      className="rounded-md bg-popover text-popover-foreground shadow-md px-2.5 py-1.5"
      style={{ border: "1px solid hsl(var(--border))" }}
    >
      <p className="text-[10px] text-muted-foreground">
        {formatTooltipDate(p.recorded_date)}
      </p>
      <p className="text-[12px] font-semibold">{formatInrPaisa(p.total_value)}</p>
      <p className="text-[10px] text-muted-foreground">
        Invested {formatInrPaisa(p.total_invested)}
      </p>
      <p
        className={`text-[10px] font-medium ${
          gain >= 0 ? "text-wealth-green" : "text-destructive"
        }`}
      >
        {gain >= 0 ? "+" : ""}
        {gain.toFixed(1)}% vs invested
      </p>
    </div>
  );
}

interface PortfolioNavChartProps {
  /** Optional fallback used while the API is unreachable. */
  fallbackValues?: number[];
}

const PortfolioNavChart = ({ fallbackValues }: PortfolioNavChartProps) => {
  const [horizon, setHorizon] = useState<PortfolioNavHorizon>("3Y");
  const [points, setPoints] = useState<PortfolioNavHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // One-time net-worth-history backfill job (null = not checked / no job yet).
  const [job, setJob] = useState<NetworthJobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  // Guards the auto-build so we kick it off at most once per mount (and never
  // auto-retry a failed build — that stays on the explicit "Try again" button).
  const autoStartedRef = useRef(false);
  // Default horizon is 3Y; if the account has less than 3Y of history we fall
  // back to the closest shorter standard period once (and never override a
  // horizon the user has explicitly tapped).
  const autoHorizonRef = useRef(false);
  const userPickedHorizonRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    getPortfolioNavHistory(horizon)
      .then((r) => {
        if (!cancelled) setPoints(r.points);
      })
      .catch(() => {
        if (!cancelled) {
          setErrored(true);
          setPoints(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [horizon, reloadKey]);

  const hasPoints = !!points && points.length > 0;
  const jobActive = job?.status === "pending" || job?.status === "running";

  // On first load, if the data spans less than the default 3Y, drop to the
  // closest shorter standard period (1Y → 3M → 1M). Runs once, and never
  // overrides a horizon the user has tapped.
  useEffect(() => {
    if (autoHorizonRef.current || userPickedHorizonRef.current) return;
    if (!points || points.length < 2) return;
    autoHorizonRef.current = true;
    const first = new Date(points[0].recorded_date).getTime();
    const last = new Date(points[points.length - 1].recorded_date).getTime();
    const spanDays = (last - first) / 86_400_000;
    // Slightly under each window so an account that just clears a period isn't
    // bumped down a notch by a few edge days.
    const best: PortfolioNavHorizon =
      spanDays >= 1000 ? "3Y" : spanDays >= 300 ? "1Y" : spanDays >= 75 ? "3M" : "1M";
    if (best !== "3Y") setHorizon(best);
  }, [points]);

  // When there's no series yet, fetch the build-job status (e.g. the user
  // reloaded mid-build) so we can resume showing progress. The actual auto-build
  // is kicked off by the effect below, which runs after `startBuild` is defined.
  useEffect(() => {
    if (loading || hasPoints || errored) return;
    let cancelled = false;
    getNetworthHistoryStatus()
      .then((s) => {
        if (!cancelled) setJob(s);
      })
      .catch(() => {
        /* leave job null — the loading state still shows */
      });
    return () => {
      cancelled = true;
    };
  }, [loading, hasPoints, errored]);

  // Poll while a build is pending/running; reload the chart once it succeeds.
  useEffect(() => {
    if (!jobActive) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      getNetworthHistoryStatus()
        .then((s) => {
          if (cancelled) return;
          setJob(s);
          if (s.status === "success" || s.has_history) {
            setReloadKey((k) => k + 1);
          }
        })
        .catch(() => {
          /* transient — next tick retries */
        });
    }, 1800);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [jobActive, job]);

  const startBuild = useCallback(async () => {
    setStarting(true);
    try {
      const s = await buildNetworthHistory();
      setJob(s);
      if (s.has_history) setReloadKey((k) => k + 1);
    } catch {
      setJob({
        status: "failed",
        phase: null,
        progress_pct: 0,
        message: "Couldn't start. Please try again.",
        history_from: null,
        days_total: null,
        has_history: false,
        started_at: null,
        finished_at: null,
      });
    } finally {
      setStarting(false);
    }
  }, []);

  // Auto-build on first view: once we've confirmed there's no series and no job
  // has ever run (status "none"), kick off the backfill ourselves so the chart
  // populates without the user tapping the button. Runs at most once per mount;
  // a "failed" job is left for the explicit "Try again" button.
  useEffect(() => {
    if (loading || hasPoints || errored) return;
    if (autoStartedRef.current || starting) return;
    if (job && job.status === "none" && !job.has_history) {
      autoStartedRef.current = true;
      void startBuild();
    }
  }, [loading, hasPoints, errored, job, starting, startBuild]);

  const chartData = useMemo(() => {
    if (points && points.length) {
      return points.map((p, i) => ({
        ...p,
        x: formatXLabel(p.recorded_date, horizon),
        idx: i,
      }));
    }
    if (fallbackValues && fallbackValues.length) {
      // Map fallback bare numbers to the same shape so the chart still renders.
      const today = new Date();
      return fallbackValues.map((v, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (fallbackValues.length - 1 - i));
        const iso = d.toISOString().slice(0, 10);
        return {
          recorded_date: iso,
          total_value: v * 100000,
          total_invested: v * 100000,
          gain_percentage: 0,
          x: formatXLabel(iso, horizon),
          idx: i,
        };
      });
    }
    return [];
  }, [points, horizon, fallbackValues]);

  const tickCount = 5;

  // Evenly-spaced X ticks by data index (numeric axis), so spacing stays uniform
  // regardless of how many points or repeated month labels there are.
  const xTicks = useMemo(() => {
    const n = chartData.length;
    if (n <= 1) return [0];
    const count = Math.min(tickCount, n);
    const idxs = Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)));
    return Array.from(new Set(idxs));
  }, [chartData, tickCount]);

  // Evenly-spaced Y ticks across a padded [min, max] so the gridlines are uniform.
  const yTicks = useMemo(() => {
    if (!chartData.length) return undefined;
    // Span both the total-value and invested lines so neither clips.
    const vals = chartData.flatMap((d) => [d.total_value, d.total_invested]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
    if (lo === hi) {
      const pad = Math.abs(lo) * 0.05 || 1;
      lo -= pad;
      hi += pad;
    } else {
      const pad = (hi - lo) * 0.06;
      lo -= pad;
      hi += pad;
    }
    const steps = 4; // → 5 evenly-spaced ticks
    return Array.from({ length: steps + 1 }, (_, i) => lo + ((hi - lo) * i) / steps);
  }, [chartData]);
  const positiveGain = chartData.length
    ? chartData[chartData.length - 1].gain_percentage >= 0
    : true;
  const strokeColor = positiveGain
    ? "#2563EB" // equity blue — matches the allocation donut's equity slice
    : "hsl(var(--destructive))";

  return (
    <div>
      <div className="flex gap-1.5 mb-3">
        {HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              userPickedHorizonRef.current = true;
              setHorizon(h);
            }}
            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
              horizon === h
                ? "bg-accent/15 text-accent"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {h}
          </button>
        ))}
      </div>

      {hasPoints && (
        <div className="mb-1.5 flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-[2px] w-3.5 rounded-full" style={{ backgroundColor: strokeColor }} />
            Total value
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-[2px] w-3.5 rounded-full bg-muted-foreground/45" />
            Invested
          </span>
        </div>
      )}

      <div className="h-36 w-full" onClick={(e) => e.stopPropagation()}>
        {loading && !hasPoints && (
          <div className="h-full w-full flex items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          </div>
        )}
        {!loading && !hasPoints && (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2 px-3 text-center">
            {job?.status === "failed" ? (
              <>
                <p className="text-[11px] text-destructive">
                  {job.message ?? "Couldn't build your net-worth history."}
                </p>
                <button
                  type="button"
                  onClick={startBuild}
                  disabled={starting}
                  className="rounded-full bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
                >
                  Try again
                </button>
              </>
            ) : jobActive ? (
              <>
                <div className="h-1.5 w-44 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
                    style={{ width: `${Math.max(3, Math.round(job?.progress_pct ?? 0))}%` }}
                  />
                </div>
                <p className="text-[11px] font-medium text-foreground">
                  Calculating your net worth history… {Math.round(job?.progress_pct ?? 0)}%
                </p>
                {job?.message && (
                  <p className="text-[10px] text-muted-foreground">{job.message}</p>
                )}
              </>
            ) : errored ? (
              <>
                <p className="text-[11px] text-muted-foreground">Could not load chart.</p>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="rounded-full bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25"
                >
                  Try again
                </button>
              </>
            ) : job?.has_history ? (
              // History exists overall, but this horizon's window has no points
              // (e.g. nothing recorded in the last 3 months). Show an explicit
              // empty state rather than spinning on the build flow forever.
              <p className="text-[11px] text-muted-foreground">
                No data for this period yet.
              </p>
            ) : (
              // No history yet and no job failed — the build auto-starts, so show
              // a calculating state instead of a manual fetch button.
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
                <p className="text-[11px] text-muted-foreground">
                  Preparing your net worth history…
                </p>
              </>
            )}
          </div>
        )}
        {hasPoints && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 6, right: 24, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="idx"
                type="number"
                domain={[0, Math.max(0, chartData.length - 1)]}
                ticks={xTicks}
                interval={0}
                tickFormatter={(i) => chartData[Number(i)]?.x ?? ""}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickMargin={6}
              />
              <YAxis
                domain={yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : ["dataMin", "dataMax"]}
                ticks={yTicks}
                interval={0}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(v) => {
                  const n = Number(v);
                  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
                  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
                  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
                  return `₹${n.toFixed(1)}`;
                }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
              <Area
                type="linear"
                dataKey="total_value"
                stroke={strokeColor}
                strokeWidth={2}
                fill="url(#navGrad)"
                dot={false}
                activeDot={{
                  r: 3.5,
                  fill: strokeColor,
                  stroke: "hsl(var(--card))",
                  strokeWidth: 2,
                }}
                isAnimationActive={true}
                animationDuration={550}
                animationEasing="ease-out"
              />
              {/* Invested baseline — smooth, soft line, no fill. The gap up to
                  the total value line is the gain. */}
              <Area
                type="monotone"
                dataKey="total_invested"
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.45}
                strokeWidth={1.5}
                fill="none"
                dot={false}
                activeDot={false}
                isAnimationActive={true}
                animationDuration={550}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PortfolioNavChart;
