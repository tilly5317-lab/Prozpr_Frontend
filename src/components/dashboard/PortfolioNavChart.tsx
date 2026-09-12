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
import { formatInr0 } from "@/lib/utils";
import {
  formatSeriesDate,
  formatXLabel,
  parseSeriesDate,
  pickHorizonForSpan,
  seriesCaption,
  type SeriesMeta,
} from "@/lib/networthSeries";
import CamsMissingNotice from "@/components/onboarding/CamsMissingNotice";

/**
 * Net-worth history — the daily per-user series behind the portfolio headline.
 *
 * Sourced ONLY from `GET /portfolio/nav-history`, which the backend derives from
 * the user's real transactions × that day's NAV (see the backend's
 * `services/networth` package). There is deliberately no synthetic or example
 * fallback: when no series exists yet the build / progress / empty states below
 * take over, so the "Invested" line is never fabricated to equal the value line.
 *
 * The series is built by the backend after every CAS import and during
 * onboarding. This component still kicks off a build the first time it sees an
 * empty series (the backend single-flights and rate-limits that), so a user who
 * lands here before either has run still gets a chart without tapping anything.
 */

const HORIZONS: PortfolioNavHorizon[] = ["1M", "3M", "1Y", "3Y", "MAX"];

// How long the progress bar may sit on the same percentage before we stop believing
// it. Comfortably longer than the slowest real step (fetching NAV history for a
// large portfolio), short enough that nobody watches a dead bar for minutes.
const PROGRESS_STALL_MS = 90_000;
const POLL_MS = 1800;

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
  // Guard every field before formatting. `gain.toFixed` throws on a missing value
  // and takes the whole chart down with it, and a `null` invested renders as the
  // literal "₹0" — a number the backend never sent. Show what we have.
  const value = Number(p.total_value);
  const invested = Number(p.total_invested);
  const gain = Number(p.gain_percentage);
  const hasInvested = Number.isFinite(invested) && invested > 0;
  const hasGain = Number.isFinite(gain) && hasInvested;
  return (
    <div
      className="rounded-md bg-popover text-popover-foreground shadow-md px-2.5 py-1.5"
      style={{ border: "1px solid hsl(var(--border))" }}
    >
      <p className="text-[11px] text-muted-foreground">
        {formatSeriesDate(p.recorded_date)}
      </p>
      <p className="text-[12px] font-semibold">
        {Number.isFinite(value) ? formatInr0(value) : "—"}
      </p>
      {hasInvested && (
        <p className="text-[11px] text-muted-foreground">
          Invested {formatInr0(invested)}
        </p>
      )}
      {hasGain && (
        <p
          className={`text-[11px] font-medium ${
            gain >= 0 ? "text-wealth-green" : "text-destructive"
          }`}
        >
          {gain >= 0 ? "+" : ""}
          {gain.toFixed(1)}% vs invested
        </p>
      )}
    </div>
  );
}

const FAILED_TO_START: NetworthJobStatus = {
  status: "failed",
  phase: null,
  progress_pct: 0,
  message: "Couldn't start. Please try again.",
  history_from: null,
  days_total: null,
  has_history: false,
  started_at: null,
  finished_at: null,
  warnings: null,
};

interface PortfolioNavChartProps {
  /** True when the user has no mutual-fund holdings (no CAMS imported yet). */
  camsMissing?: boolean;
  /** Open the CAMS upload popup — wired only when `camsMissing`. */
  onUploadCams?: () => void;
  /** Reports the value change across the selected horizon (first → last point) —
   *  both ₹ amount and % — plus the active horizon, for the headline to show. */
  onPeriodChange?: (info: { pct: number | null; amount: number | null; horizon: PortfolioNavHorizon }) => void;
}

const PortfolioNavChart = ({ camsMissing, onUploadCams, onPeriodChange }: PortfolioNavChartProps) => {
  const [horizon, setHorizon] = useState<PortfolioNavHorizon>("3Y");
  const [points, setPoints] = useState<PortfolioNavHistoryPoint[] | null>(null);
  const [meta, setMeta] = useState<SeriesMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // One-time net-worth-history build job (null = not checked / no job yet).
  const [job, setJob] = useState<NetworthJobStatus | null>(null);
  // The status poll itself failed, so we can't tell whether a build is running.
  const [statusErrored, setStatusErrored] = useState(false);
  const [starting, setStarting] = useState(false);
  // Guards the auto-build so we kick it off at most once per mount (and never
  // auto-retry a failed build — that stays on the explicit "Try again" button).
  const autoStartedRef = useRef(false);
  // The auto horizon fallback runs once, and never overrides a horizon the user
  // has explicitly tapped.
  const autoHorizonRef = useRef(false);
  const userPickedHorizonRef = useRef(false);
  // Wall-clock of the last time the job's progress actually moved. The backend
  // reaps abandoned builds, but the client must not depend on that being timely:
  // this is what turns "stuck at 98%" into an actionable "Try again" no matter why
  // the build stopped talking.
  const progressStallRef = useRef<{ pct: number; since: number }>({
    pct: -1,
    since: Date.now(),
  });
  const [stalled, setStalled] = useState(false);

  // Nothing is fetched while holdings are missing: the series cannot exist yet,
  // and asking for it would auto-start a build of nothing. The moment a statement
  // lands (`camsMissing` flips) these effects re-run and the real chart loads.
  useEffect(() => {
    if (camsMissing) {
      setPoints(null);
      setMeta(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    getPortfolioNavHistory(horizon)
      .then((r) => {
        if (cancelled) return;
        setPoints(r.points);
        setMeta({
          as_of: r.as_of ?? null,
          is_stale: !!r.is_stale,
          degraded_schemes: r.degraded_schemes ?? 0,
          ledger_complete: r.ledger_complete ?? true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setErrored(true);
          setPoints(null);
          setMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [horizon, reloadKey, camsMissing]);

  const hasPoints = !!points && points.length > 0;
  const jobActive = job?.status === "pending" || job?.status === "running";

  // On first load, if the data spans less than the default 3Y, drop to the
  // closest shorter standard period (1Y → 3M → 1M).
  useEffect(() => {
    if (autoHorizonRef.current || userPickedHorizonRef.current) return;
    if (!points || points.length < 2) return;
    autoHorizonRef.current = true;
    const first = parseSeriesDate(points[0].recorded_date).getTime();
    const last = parseSeriesDate(points[points.length - 1].recorded_date).getTime();
    const best = pickHorizonForSpan((last - first) / 86_400_000);
    if (best !== "3Y") setHorizon(best);
  }, [points]);

  // When there's no series yet, fetch the build-job status (e.g. the user
  // reloaded mid-build) so we can resume showing progress. The actual auto-build
  // is kicked off by the effect below, which runs after `startBuild` is defined.
  useEffect(() => {
    if (camsMissing || loading || hasPoints || errored) return;
    let cancelled = false;
    setStatusErrored(false);
    getNetworthHistoryStatus()
      .then((s) => {
        if (!cancelled) setJob(s);
      })
      .catch(() => {
        // Without a status we'd sit on "Preparing…" forever; surface a retry instead.
        if (!cancelled) setStatusErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [camsMissing, loading, hasPoints, errored, reloadKey]);

  // Poll while a build is pending/running; reload the chart once it succeeds.
  useEffect(() => {
    if (!jobActive || stalled) return;
    let cancelled = false;
    const id = window.setTimeout(() => {
      getNetworthHistoryStatus()
        .then((s) => {
          if (cancelled) return;
          setJob(s);
          // Refetch on completion, or the moment a first series appears mid-build.
          // Not on every tick of a rebuild that already has points — that only
          // repaints the same line while the worker is busy.
          if (s.status === "success" || (s.has_history && !hasPoints)) {
            setReloadKey((k) => k + 1);
            return;
          }
          // Watch the percentage, not the clock: a long build is fine as long as it
          // is still moving. One that holds the same number past the threshold has
          // stopped, and polling it forever just shows the user a frozen bar.
          const pct = s.progress_pct ?? 0;
          const seen = progressStallRef.current;
          if (pct !== seen.pct) {
            progressStallRef.current = { pct, since: Date.now() };
          } else if (Date.now() - seen.since > PROGRESS_STALL_MS) {
            setStalled(true);
          }
        })
        .catch(() => {
          /* transient — next tick retries */
        });
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [jobActive, job, stalled, hasPoints]);

  const startBuild = useCallback(async () => {
    setStarting(true);
    setStalled(false);
    setStatusErrored(false);
    progressStallRef.current = { pct: -1, since: Date.now() };
    try {
      const s = await buildNetworthHistory();
      setJob(s);
      if (s.has_history) setReloadKey((k) => k + 1);
    } catch {
      setJob(FAILED_TO_START);
    } finally {
      setStarting(false);
    }
  }, []);

  // Auto-build on first view: once we've confirmed there's no series and no job
  // has ever run (status "none"), kick off the build ourselves so the chart
  // populates without the user tapping anything. Runs at most once per mount;
  // a "failed" job is left for the explicit "Try again" button.
  useEffect(() => {
    if (camsMissing || loading || hasPoints || errored) return;
    if (autoStartedRef.current || starting) return;
    if (job && job.status === "none" && !job.has_history) {
      autoStartedRef.current = true;
      void startBuild();
    }
  }, [camsMissing, loading, hasPoints, errored, job, starting, startBuild]);

  const chartData = useMemo(() => {
    if (!points || !points.length) return [];
    return points.map((p, i) => ({
      ...p,
      x: formatXLabel(p.recorded_date, horizon),
      idx: i,
    }));
  }, [points, horizon]);

  // Value change (₹ and %) across the selected horizon window (first → last
  // point). Reported up so the headline can show the period gain/loss.
  const periodChange = useMemo(() => {
    const empty = { pct: null as number | null, amount: null as number | null };
    if (chartData.length < 2) return empty;
    const first = chartData[0].total_value;
    const last = chartData[chartData.length - 1].total_value;
    if (!first) return empty;
    return { pct: ((last - first) / first) * 100, amount: last - first };
  }, [chartData]);

  useEffect(() => {
    onPeriodChange?.({ pct: periodChange.pct, amount: periodChange.amount, horizon });
  }, [periodChange, horizon, onPeriodChange]);

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

  // Custom X tick: anchor the first label to the start and the last to the end so
  // the edge dates (e.g. "Jul-25") sit flush and aren't clipped by the plot bounds.
  const renderXTick = (props: { x?: number; y?: number; payload?: { value: number } }) => {
    const x = props.x ?? 0;
    const y = props.y ?? 0;
    const v = Number(props.payload?.value ?? 0);
    const isFirst = v === xTicks[0];
    const isLast = v === xTicks[xTicks.length - 1];
    const anchor = isFirst ? "start" : isLast ? "end" : "middle";
    return (
      <text x={x} y={y} dy={14} textAnchor={anchor} fontSize={12} fill="hsl(var(--muted-foreground))">
        {chartData[v]?.x ?? ""}
      </text>
    );
  };

  const caption = hasPoints ? seriesCaption(meta) : null;

  const retryButton = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-accent/15 px-3 py-1.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
    >
      {label}
    </button>
  );

  // The one non-chart panel: exactly one of these states is true when there are no
  // points to draw. Ordered so a definite answer (failed / building / empty) always
  // beats the "still preparing" spinner, which is only for the window before the
  // first status lands.
  const renderEmptyState = () => {
    if (job?.status === "failed" || stalled) {
      return (
        <>
          <p className="text-[11px] text-destructive">
            {stalled
              ? "This is taking longer than expected."
              : (job?.message ?? "Couldn't build your net-worth history.")}
          </p>
          {retryButton("Try again", () => void startBuild(), starting)}
        </>
      );
    }
    if (jobActive) {
      return (
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
            <p className="text-[11px] text-muted-foreground">{job.message}</p>
          )}
        </>
      );
    }
    if (errored || statusErrored) {
      return (
        <>
          <p className="text-[11px] text-muted-foreground">Could not load chart.</p>
          {retryButton("Try again", () => setReloadKey((k) => k + 1))}
        </>
      );
    }
    if (job?.has_history) {
      // History exists overall, but this horizon's window has no points (e.g.
      // nothing recorded in the last month). Say so rather than spin on the
      // build flow forever.
      return (
        <p className="text-[11px] text-muted-foreground">No data for this period yet.</p>
      );
    }
    if (job?.status === "success") {
      // The build ran to completion and produced nothing — there is no ledger to
      // value (e.g. a statement with no transactions). Honest empty state, no CTA.
      return (
        <p className="px-4 text-[11px] text-muted-foreground">
          Nothing to chart yet — your statement has no transactions we can value.
        </p>
      );
    }
    // No history yet and no job failed — the build auto-starts, so show a
    // calculating state instead of a manual fetch button.
    return (
      <>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        <p className="text-[11px] text-muted-foreground">Preparing your net worth history…</p>
      </>
    );
  };

  return (
    <div>
      {/* Full-bleed: negative margins cancel the parent card's 14px padding so
          the chart aligns with the cards below. Auto-width stretches to fill. */}
      <div className="h-[180px] -mx-[14px]" onClick={(e) => e.stopPropagation()}>
        {/* No CAMS imported yet → ask the user to upload it right here in the
            NAV-history space. It only shows while CAMS is absent and disappears
            once a statement is imported (then the real chart builds). */}
        {camsMissing && onUploadCams ? (
          <CamsMissingNotice
            onAdd={onUploadCams}
            title="See your portfolio history"
            description="Add your CAMS statement — we'll build your net-worth history from your real holdings."
          />
        ) : (
          <>
            {loading && !hasPoints && (
              <div className="h-full w-full flex items-center justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
              </div>
            )}
            {!loading && !hasPoints && (
              <div
                className="h-full w-full flex flex-col items-center justify-center gap-2 px-3 text-center"
                data-testid="networth-empty-state"
              >
                {renderEmptyState()}
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
                  <XAxis
                    dataKey="idx"
                    type="number"
                    domain={[0, Math.max(0, chartData.length - 1)]}
                    ticks={xTicks}
                    interval={0}
                    tick={renderXTick}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    orientation="right"
                    domain={yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : ["dataMin", "dataMax"]}
                    ticks={yTicks}
                    interval={0}
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                    tickFormatter={(v) => {
                      const n = Number(v);
                      if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
                      if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
                      if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
                      return `${n.toFixed(1)}`;
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
          </>
        )}
      </div>

      {/* Horizon picker — borderless text buttons below the chart, spread edge to
          edge so the first (1M) sits at the left and the last (Max) right-aligns
          with the content's right edge. Hidden until CAMS history exists. */}
      {!camsMissing && (
        <div className="mt-3 flex justify-between">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                userPickedHorizonRef.current = true;
                setHorizon(h);
              }}
              className={`py-1 text-[13px] font-semibold transition-colors ${
                horizon === h
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {caption && (
        <p className="mt-1.5 text-[11px] text-muted-foreground" data-testid="networth-caption">
          {caption}
        </p>
      )}
    </div>
  );
};

export default PortfolioNavChart;
