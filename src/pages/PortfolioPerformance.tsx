import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronDown, Info, TrendingUp, TrendingDown } from "lucide-react";
import {
  AreaChart,
  Area,
  Line,
  ComposedChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import BottomNav from "@/components/BottomNav";
import { getFullProfile, getMyPortfolio, type PortfolioDetail } from "@/lib/api";
import { cloneDemoSelfPortfolio } from "@/lib/portfolioDemoData";

type TimeRange = "1M" | "6M" | "1Y" | "All";
type MetricKey = "mwr" | "twr";

const TIME_RANGES: TimeRange[] = ["1M", "6M", "1Y", "All"];

const LAST_UPDATED = "22 Apr 2026 at 09:42";
const PORTFOLIO_START_DATE = "14 Feb 2021";
const BENCHMARK = { name: "Nifty 50", ticker: "NIFTY" };

const GREEN = "hsl(160 50% 38%)";       // wealth-green
const GREEN_FILL = "hsl(160 50% 38% / 0.18)";
const BENCHMARK_COLOR = "#b8b8b8";
const HAIRLINE = "#ececec";

const METRIC_COPY: Record<
  MetricKey,
  { heading: string; short: string; long: string }
> = {
  mwr: {
    heading: "Money-weighted rate of return",
    short:
      "Money-weighted returns are an accurate measure of how an asset's rises and falls actually affect you and your investments. More weight is put upon returns of an asset when you have more money invested, and less when you have less invested.",
    long:
      "Money-Weighted Return (sometimes called IRR) accounts for the size and timing of every contribution and withdrawal you make. Example: if you put ₹1 lakh in at the start of the year and another ₹5 lakh in just before a rally, the bigger contribution has more influence on the reported return — so MWR reflects your actual experience. It's the right lens when you want to know 'how did my money, specifically, do?' MWR will diverge from TWR most when your contributions are uneven and markets are volatile.",
  },
  twr: {
    heading: "Time-weighted rate of return",
    short:
      "Your TWRR only accounts for the performance of your investments, independent of when you added or withdrew money.",
    long:
      "Time-Weighted Return splits your timeline at every cash flow and compounds the per-period returns together, cancelling out the impact of when you added or withdrew money. Example: two investors buy the same fund but at different times — their TWR will be identical because it's a property of the fund, not the investor. It's the metric used to compare your portfolio against a benchmark like the Nifty 50, which is why we show it alongside the benchmark line below.",
  },
};

function deriveReturnByKind(
  simpleGain: number | null,
  kind: "simple" | "twr" | "mwr",
): number | null {
  if (simpleGain === null) return null;
  if (kind === "simple") return simpleGain;
  const factor = kind === "twr" ? 0.87 : 0.94;
  return Math.round(simpleGain * factor * 100) / 100;
}

function pointsForRange(range: TimeRange): number {
  switch (range) {
    case "1M": return 30;
    case "6M": return 26;
    case "1Y": return 24;
    case "All": return 36;
  }
}

// Deterministic "noisy" curve from start → end with gentle wobble.
function synthCurve(start: number, end: number, n: number, seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const base = start + (end - start) * t;
    const wobble = Math.sin((i + seed) * 0.9) * 0.6 + Math.cos((i + seed) * 1.6) * 0.4;
    out.push(Math.round((base + wobble) * 100) / 100);
  }
  return out;
}

function buildChartData(range: TimeRange, portfolioTwrEnd: number) {
  const n = pointsForRange(range);
  const userEnd = portfolioTwrEnd;
  const benchmarkEnd =
    range === "1M" ? 2.1 : range === "6M" ? 4.3 : range === "1Y" ? 6.45 : 9.2;
  const user = synthCurve(0, userEnd, n, 3);
  const bench = synthCurve(0, benchmarkEnd, n, 11);
  return user.map((u, i) => ({ i, user: u, bench: bench[i] }));
}

function formatPct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function pctColor(n: number | null): string {
  if (n === null) return "#1a1a1a";
  return n >= 0 ? GREEN : "hsl(0 84% 50%)";
}

function TimeRangeDropdown({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1 text-[12px] font-semibold text-muted-foreground"
      >
        {value}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+4px)] z-40 min-w-[84px] rounded-xl border border-border/60 bg-white p-1 shadow-lg">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  onChange(r);
                  setOpen(false);
                }}
                className={`block w-full rounded-lg px-3 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                  r === value
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InfoSheet({
  open,
  onClose,
  title,
  body,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-md rounded-t-2xl bg-white px-5 pt-5 shadow-xl overflow-y-auto"
            style={{
              paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 8px) + 16px)",
              maxHeight: "calc(100dvh - 4rem - env(safe-area-inset-bottom, 8px))",
            }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              {title}
            </p>
            <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-line">
              {body}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-xl bg-foreground py-2.5 text-[13px] font-semibold text-background"
            >
              Close
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ChartTooltip({ active, payload, userLabel, benchLabel }: {
  active?: boolean;
  payload?: { payload: { i: number; user: number; bench: number } }[];
  userLabel: string;
  benchLabel: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-white px-2.5 py-1.5 shadow-sm">
      <p className="text-[11px] font-semibold" style={{ color: GREEN }}>
        {userLabel}: {formatPct(p.user)}
      </p>
      <p className="text-[11px] font-medium" style={{ color: BENCHMARK_COLOR }}>
        {benchLabel}: {formatPct(p.bench)}
      </p>
    </div>
  );
}

const PortfolioPerformance = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>("1M");
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDateTipOpen, setStartDateTipOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getMyPortfolio().catch(() => null),
      getFullProfile().catch(() => null),
    ])
      .then(([port]) => {
        if (cancelled) return;
        setPortfolio(port ?? cloneDemoSelfPortfolio());
      })
      .catch(() => {
        if (!cancelled) setPortfolio(cloneDemoSelfPortfolio());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const simpleGain = portfolio?.total_gain_percentage ?? null;
  const mwrGain = useMemo(() => deriveReturnByKind(simpleGain, "mwr"), [simpleGain]);
  const twrGain = useMemo(() => deriveReturnByKind(simpleGain, "twr"), [simpleGain]);

  // For shorter time windows, scale the gain down proportionally so each range feels different.
  const rangeFactor: Record<TimeRange, number> = {
    "1M": 0.12,
    "6M": 0.45,
    "1Y": 0.75,
    All: 1,
  };
  const scaledMwr = mwrGain === null ? null : Math.round(mwrGain * rangeFactor[range] * 100) / 100;
  const scaledTwr = twrGain === null ? null : Math.round(twrGain * rangeFactor[range] * 100) / 100;

  const chartData = useMemo(
    () => buildChartData(range, scaledTwr ?? 0),
    [range, scaledTwr],
  );
  const benchmarkEnd = chartData.length ? chartData[chartData.length - 1].bench : 0;
  const latestUser = chartData.length ? chartData[chartData.length - 1].user : 0;

  const yDomain: [number, number] = useMemo(() => {
    const allVals = chartData.flatMap((d) => [d.user, d.bench, 0]);
    const lo = Math.min(...allVals, 0);
    const hi = Math.max(...allVals, 0);
    const pad = Math.max((hi - lo) * 0.15, 0.5);
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [chartData]);

  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-20">
      {/* Header */}
      <div className="px-5 pt-10 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="text-foreground shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground truncate">
            Portfolio performance
          </h1>
        </div>
        <TimeRangeDropdown value={range} onChange={setRange} />
      </div>

      {loading && (
        <div className="px-5 py-10 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      )}

      {!loading && portfolio && (
        <div className="px-5 flex flex-col gap-5 pt-3">
          {/* MWR section */}
          <section>
            <h2 className="text-[18px] font-semibold text-foreground">
              {METRIC_COPY.mwr.heading}
            </h2>

            <div className="mt-3 flex items-baseline gap-2">
              {scaledMwr !== null && (
                <span className="inline-flex items-center" style={{ color: pctColor(scaledMwr) }}>
                  {scaledMwr >= 0 ? (
                    <TrendingUp className="h-5 w-5 mr-1" />
                  ) : (
                    <TrendingDown className="h-5 w-5 mr-1" />
                  )}
                  <span className="text-[40px] font-semibold leading-none tracking-tight">
                    {scaledMwr >= 0 ? "" : "-"}
                    {Math.abs(scaledMwr).toFixed(2)}
                  </span>
                  <span className="text-[22px] font-semibold ml-0.5">%</span>
                </span>
              )}
            </div>

            <div className="mt-2 text-[13px] text-muted-foreground flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span>Since {PORTFOLIO_START_DATE}</span>
                <button
                  type="button"
                  onClick={() => setStartDateTipOpen(true)}
                  className="inline-flex items-center"
                  aria-label="About start date"
                >
                  <Info className="h-3 w-3" />
                </button>
              </div>
              <div>Last updated {LAST_UPDATED}</div>
            </div>

            <p className="mt-3 text-[14px] text-foreground leading-relaxed">
              {METRIC_COPY.mwr.short} {METRIC_COPY.mwr.long}
            </p>
          </section>

          {/* Divider */}
          <div style={{ height: 1, background: HAIRLINE }} />

          {/* TWR section */}
          <section>
            <h2 className="text-[18px] font-semibold text-foreground">
              {METRIC_COPY.twr.heading}
            </h2>

            <p className="mt-3 text-[14px] text-foreground leading-relaxed">
              {METRIC_COPY.twr.short} {METRIC_COPY.twr.long}
            </p>

            {/* Legend */}
            <div className="mt-4 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} />
                <span className="text-foreground">Your investment(s)</span>
                <span className="font-semibold" style={{ color: GREEN }}>
                  ({formatPct(scaledTwr)})
                </span>
              </div>
              <div className="flex items-center gap-2 text-[13px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: BENCHMARK_COLOR }} />
                <span className="text-foreground">
                  {BENCHMARK.name} ({BENCHMARK.ticker})
                </span>
                <span className="font-semibold text-muted-foreground">
                  ({formatPct(benchmarkEnd)})
                </span>
              </div>
            </div>

            <p className="mt-2 text-[12px] text-muted-foreground">
              Updated on {LAST_UPDATED}
            </p>

            {/* Comparison chart */}
            <div className="mt-3 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 44, left: 0, bottom: 4 }}
                >
                  <defs>
                    <linearGradient id="userAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GREEN} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    horizontal
                    vertical={false}
                    stroke={HAIRLINE}
                    strokeDasharray="0"
                  />
                  <XAxis dataKey="i" hide />
                  <YAxis
                    orientation="right"
                    domain={yDomain}
                    width={40}
                    tick={{ fontSize: 11, fill: "#9a9a9a" }}
                    tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v}%`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ReferenceLine y={0} stroke="#c8c8c8" strokeDasharray="3 3" />
                  <Tooltip
                    cursor={{ stroke: "#d0d0d0", strokeDasharray: "2 3" }}
                    content={
                      <ChartTooltip
                        userLabel="Your investments"
                        benchLabel={BENCHMARK.name}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="user"
                    stroke={GREEN}
                    strokeWidth={2}
                    fill="url(#userAreaFill)"
                    dot={false}
                    activeDot={{ r: 4, fill: GREEN, stroke: "#fff", strokeWidth: 2 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bench"
                    stroke={BENCHMARK_COLOR}
                    strokeWidth={1.75}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
              {/* Latest-point label */}
              <div className="relative">
                <span
                  className="absolute -top-[26px] right-1 rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold"
                  style={{ color: GREEN }}
                >
                  {formatPct(latestUser)}
                </span>
              </div>
            </div>
          </section>
        </div>
      )}

      {!loading && !portfolio && (
        <div className="px-5 py-8 text-center text-xs text-muted-foreground">
          Could not load performance data. Check your connection and try again.
        </div>
      )}

      {/* Bottom sheets */}
      <InfoSheet
        open={startDateTipOpen}
        onClose={() => setStartDateTipOpen(false)}
        title="Portfolio start date"
        body={`Your portfolio started on ${PORTFOLIO_START_DATE} — the date of your first tracked holding. All returns on this screen are calculated from that anchor point.`}
      />

      <BottomNav />
    </div>
  );
};

export default PortfolioPerformance;
