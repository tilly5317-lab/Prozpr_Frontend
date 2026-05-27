import { useEffect, useMemo, useState } from "react";
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
  getPortfolioNavHistory,
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
  }, [horizon]);

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
        {loading && (
          <div className="h-full w-full flex items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          </div>
        )}
        {!loading && chartData.length === 0 && (
          <div className="h-full w-full flex items-center justify-center">
            <p className="text-[11px] text-muted-foreground">
              {errored ? "Could not load chart." : "No NAV history yet."}
            </p>
          </div>
        )}
        {!loading && chartData.length > 0 && (
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
                type="monotone"
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
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default PortfolioNavChart;
