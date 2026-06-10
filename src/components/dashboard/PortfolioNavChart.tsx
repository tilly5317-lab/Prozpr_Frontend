import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
import { formatInrCompact, formatInrPaisa } from "@/lib/utils";

const HORIZONS: PortfolioNavHorizon[] = ["1M", "1Y", "3Y", "MAX"];

function formatXLabel(iso: string, horizon: PortfolioNavHorizon): string {
  const d = new Date(iso);
  if (horizon === "1M") {
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }
  if (horizon === "1Y") {
    return d.toLocaleDateString("en-IN", { month: "short" });
  }
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
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
      <p
        className={`text-[10px] font-medium ${
          gain >= 0 ? "text-wealth-green" : "text-destructive"
        }`}
      >
        {gain >= 0 ? "+" : ""}
        {gain.toFixed(2)}% vs invested
      </p>
    </div>
  );
}

interface PortfolioNavChartProps {
  /** Optional fallback used while the API is unreachable. */
  fallbackValues?: number[];
}

const PortfolioNavChart = ({ fallbackValues }: PortfolioNavChartProps) => {
  const [horizon, setHorizon] = useState<PortfolioNavHorizon>("1Y");
  const [points, setPoints] = useState<PortfolioNavHistoryPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // One-time net-worth-history backfill job (null = not checked / no job yet).
  const [job, setJob] = useState<NetworthJobStatus | null>(null);
  const [starting, setStarting] = useState(false);
<<<<<<< HEAD
  // Guards the automatic one-time build so it fires at most once per mount.
=======
  // Guards the auto-build so we kick it off at most once per mount (and never
  // auto-retry a failed build — that stays on the explicit "Try again" button).
>>>>>>> 8456f401dd3dc63daecc0d4342fd34ed962d47cb
  const autoStartedRef = useRef(false);

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

  // When there's no series yet, check whether a build job is already in flight
  // (e.g. the user reloaded mid-build) so we resume showing progress — and if no
  // job has ever run, kick the one-time build off automatically (no click needed).
  useEffect(() => {
    if (loading || hasPoints || errored) return;
    let cancelled = false;
    getNetworthHistoryStatus()
      .then((s) => {
        if (cancelled) return;
        setJob(s);
        // Auto-build the first time we find no history and no job in flight.
        // Failures are left to the manual "Try again" so we never auto-retry.
        if (!s.has_history && s.status === "none" && !autoStartedRef.current) {
          autoStartedRef.current = true;
          void startBuild();
        }
      })
      .catch(() => {
        /* leave job null — the loading state still shows */
      });
    return () => {
      cancelled = true;
    };
  }, [loading, hasPoints, errored, startBuild]);

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
<<<<<<< HEAD
=======

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
>>>>>>> 8456f401dd3dc63daecc0d4342fd34ed962d47cb

  const chartData = useMemo(() => {
    if (points && points.length) {
      return points.map((p) => ({
        ...p,
        x: formatXLabel(p.recorded_date, horizon),
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
        };
      });
    }
    return [];
  }, [points, horizon, fallbackValues]);

  const tickCount = horizon === "1M" ? 4 : horizon === "1Y" ? 5 : 6;
  const positiveGain = chartData.length
    ? chartData[chartData.length - 1].gain_percentage >= 0
    : true;
  const strokeColor = positiveGain
    ? "hsl(var(--accent))"
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
              margin={{ top: 6, right: 6, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="hsl(var(--border))"
                strokeOpacity={0.35}
                vertical={false}
              />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={20}
                tickCount={tickCount}
              />
              <YAxis
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(v) => formatInrCompact(Number(v))}
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
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PortfolioNavChart;
