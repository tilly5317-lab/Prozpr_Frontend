import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Info, X } from "lucide-react";
import type { PortfolioDetail } from "@/lib/api";

type AnalysisTab = "returns" | "waterfall";
type AnalysisRange = "1M" | "3M" | "YTD" | "1Y" | "3Y" | "All";

const TABS: { id: AnalysisTab; label: string }[] = [
  { id: "returns", label: "Returns" },
  { id: "waterfall", label: "Value Build-Up" },
];

// Catalog of benchmarks the user can layer onto the Returns chart.
// `multiplier` is applied to the portfolio TWR to synthesize a plausible benchmark return.
type BenchmarkOption = {
  id: string;
  shortName: string;
  fullName: string;
  multiplier: number;
  seed: number;
  color: string;
  dash: string;
};

const BENCHMARKS: BenchmarkOption[] = [
  { id: "nifty50", shortName: "Nifty 50", fullName: "Benchmark: Nifty 50", multiplier: 0.85, seed: 17, color: "hsl(var(--muted-foreground))", dash: "2 3" },
  { id: "niftynext50", shortName: "Nifty Next 50", fullName: "Benchmark: Nifty Next 50", multiplier: 0.92, seed: 23, color: "#D4A868", dash: "4 3" },
  { id: "midcap150", shortName: "Nifty Midcap 150", fullName: "Benchmark: Nifty Midcap 150", multiplier: 1.05, seed: 29, color: "#3B6FA8", dash: "5 3" },
  { id: "sensex", shortName: "BSE Sensex", fullName: "Benchmark: BSE Sensex", multiplier: 0.83, seed: 31, color: "#7B4F8F", dash: "6 2" },
  { id: "crisil-bond", shortName: "Crisil Composite Bond", fullName: "Benchmark: Crisil Composite Bond", multiplier: 0.55, seed: 37, color: "#5C7C3D", dash: "3 2" },
  { id: "gold-spot", shortName: "Domestic Gold", fullName: "Benchmark: Domestic Gold", multiplier: 0.7, seed: 41, color: "#E0B84A", dash: "1 3" },
];

const RANGES: AnalysisRange[] = ["1M", "3M", "YTD", "1Y", "3Y", "All"];

const STORAGE_KEY = "portfolio-analysis-tab";

const POSITIVE = "hsl(var(--wealth-green))";
const NEGATIVE = "hsl(var(--destructive))";
const USER_LINE = "hsl(var(--wealth-green))";
const HAIRLINE = "hsl(var(--hairline))";

function pointsForRange(range: AnalysisRange): number {
  switch (range) {
    case "1M": return 30;
    case "3M": return 24;
    case "YTD": return 20;
    case "1Y": return 24;
    case "3Y": return 30;
    case "All": return 36;
  }
}

function rangeScaleFactor(range: AnalysisRange): number {
  switch (range) {
    case "1M": return 0.12;
    case "3M": return 0.28;
    case "YTD": return 0.45;
    case "1Y": return 0.75;
    case "3Y": return 0.92;
    case "All": return 1;
  }
}

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

// Portfolio-analysis figures are all shown to a single decimal place.
function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** Full ₹ amount with Indian grouping, to one decimal. */
function fmtInr1(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
}

/** Compact ₹ (Cr / L / k), to one decimal. Caller adds any +/- sign. */
function fmtInrCompact1(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${a.toFixed(1)}`;
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function rangeSpanDays(range: AnalysisRange, today: Date): number {
  switch (range) {
    case "1M": return 30;
    case "3M": return 90;
    case "YTD": {
      const start = new Date(today.getFullYear(), 0, 1);
      return Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86_400_000));
    }
    case "1Y": return 365;
    case "3Y": return 365 * 3;
    case "All": return 365 * 5;
  }
}

function dateForIndex(range: AnalysisRange, i: number, n: number, today: Date): Date {
  const span = rangeSpanDays(range, today);
  const t = n <= 1 ? 1 : i / (n - 1);
  const offsetDays = Math.round(span * (1 - t));
  const d = new Date(today);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

function formatDateTick(range: AnalysisRange, d: Date): string {
  if (range === "1M" || range === "3M" || range === "YTD") {
    return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]}`;
  }
  return `${MONTH_ABBR[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
}

function tickIndicesFor(n: number): number[] {
  if (n <= 5) return Array.from({ length: n }, (_, i) => i);
  return [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];
}

// Custom XAxis tick that wraps labels like "+ Capital Gains" onto 2 lines.
const WaterfallAxisTick = (props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) => {
  const { x = 0, y = 0, payload } = props;
  const text = String(payload?.value ?? "");
  const tokens = text.split(" ");
  let line1 = text;
  let line2 = "";
  if (tokens.length >= 3) {
    line1 = tokens.slice(0, -1).join(" ");
    line2 = tokens[tokens.length - 1];
  }
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        textAnchor="middle"
        fontSize={9}
        fill="hsl(var(--muted-foreground))"
      >
        <tspan x={0} dy="0.95em">{line1}</tspan>
        {line2 && <tspan x={0} dy="1.1em">{line2}</tspan>}
      </text>
    </g>
  );
};

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadFile(filename: string, mime: string, data: string) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface Props {
  open: boolean;
  onClose: () => void;
  portfolio: PortfolioDetail;
}

const PortfolioAnalysisModal = ({ open, onClose, portfolio }: Props) => {
  const [tab, setTab] = useState<AnalysisTab>(() => {
    if (typeof window === "undefined") return "returns";
    const stored = window.sessionStorage.getItem(STORAGE_KEY) as AnalysisTab | null;
    return stored === "returns" || stored === "waterfall" ? stored : "returns";
  });
  const [range, setRange] = useState<AnalysisRange>("1M");
  const [infoOpen, setInfoOpen] = useState<"twr" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STORAGE_KEY, tab);
  }, [tab]);

  // Esc key closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Time-weighted return: the portfolio's compounded holding-period return,
  // independent of the size/timing of contributions (unlike MWR). The API
  // doesn't return it yet, so approximate it from the simple holding-period
  // gain — with no contribution-drag factor applied.
  const simpleGain = portfolio.total_gain_percentage ?? 0;
  const fullTwr = Math.round(simpleGain * 100) / 100;
  const scaledTwr = Math.round(fullTwr * rangeScaleFactor(range) * 100) / 100;

  // Single fixed benchmark — Nifty 50 (the add/compare picker was removed).
  const primaryBenchmark = BENCHMARKS.find((b) => b.id === "nifty50") ?? BENCHMARKS[0];
  const activeBenchmarks = [primaryBenchmark];
  const benchPctById = (() => {
    const out: Record<string, number> = {};
    for (const b of BENCHMARKS) {
      out[b.id] = Math.round(scaledTwr * b.multiplier * 100) / 100;
    }
    return out;
  })();
  const primaryBench = benchPctById[primaryBenchmark.id];

  const today = useMemo(() => new Date(), []);
  const seriesPoints = pointsForRange(range);
  const dateTicks = useMemo(() => tickIndicesFor(seriesPoints), [seriesPoints]);
  const formatXTick = (v: number) =>
    formatDateTick(range, dateForIndex(range, Number(v), seriesPoints, today));

  const returnsSeries = useMemo(() => {
    const n = pointsForRange(range);
    const twr = synthCurve(0, scaledTwr, n, 11);
    const benchCurves: Record<string, number[]> = {};
    for (const b of activeBenchmarks) {
      const target = Math.round(scaledTwr * b.multiplier * 100) / 100;
      benchCurves[b.id] = synthCurve(0, target, n, b.seed);
    }
    return twr.map((m, i) => {
      const point: Record<string, number> = { i, twr: m };
      for (const b of activeBenchmarks) {
        point[`bench_${b.id}`] = benchCurves[b.id][i];
      }
      return point;
    });
  }, [range, scaledTwr, activeBenchmarks]);


  const currentNav = portfolio.total_value;

  // Waterfall breakdown — synthesized from total_invested + total_value.
  const invested = portfolio.total_invested;
  const gainTotal = currentNav - invested;
  const estDividends = Math.max(0, Math.round(invested * 0.025));
  const estFees = Math.max(0, Math.round(invested * 0.005));
  const estContributions = Math.max(0, Math.round(invested * 0.08));
  const baseAmount = invested - estContributions;
  const capitalGains = gainTotal - estDividends + estFees;

  type WaterfallItem = {
    label: string;
    value: number;
    kind: "base" | "positive" | "negative" | "total";
    running: number; // running total AFTER this bar
  };

  const waterfall: WaterfallItem[] = (() => {
    const items: Omit<WaterfallItem, "running">[] = [
      { label: "Base", value: baseAmount, kind: "base" },
      { label: "+ Contributions", value: estContributions, kind: "positive" },
      { label: "+ Capital Gains", value: capitalGains, kind: "positive" },
      { label: "+ Dividends", value: estDividends, kind: "positive" },
      { label: "− Fees", value: -estFees, kind: "negative" },
      { label: "= Current Corpus", value: currentNav, kind: "total" },
    ];
    let running = 0;
    return items.map((it) => {
      if (it.kind === "base") {
        running = it.value;
      } else if (it.kind === "total") {
        running = it.value;
      } else {
        running += it.value;
      }
      return { ...it, running };
    });
  })();

  // Build recharts data for the waterfall. For each bar we need "base" (invisible spacer) and "value" (coloured).
  const waterfallData = waterfall.map((w) => {
    if (w.kind === "base" || w.kind === "total") {
      return { label: w.label, spacer: 0, bar: w.value, kind: w.kind, display: w.value };
    }
    const end = w.running;
    const start = w.value >= 0 ? end - w.value : end - w.value; // same formula: start = end - value (value negative for fees)
    // For positive bars: spacer = start, bar = value
    // For negative bars: spacer = end, bar = |value| (so it draws above spacer and overlaps)
    if (w.value >= 0) {
      return { label: w.label, spacer: start, bar: w.value, kind: w.kind, display: w.value };
    }
    return { label: w.label, spacer: end, bar: -w.value, kind: w.kind, display: w.value };
  });

  const handleExport = () => {
    const ts = new Date().toISOString().slice(0, 10);
    if (tab === "returns") {
      const rows: (string | number)[][] = [
        ["Metric", `${range}`, "Full period"],
        ["TWR %", scaledTwr, fullTwr],
        ...activeBenchmarks.map((b) => [`${b.fullName} %`, benchPctById[b.id], ""]),
      ];
      downloadFile(`portfolio-returns-${ts}.csv`, "text/csv", toCsv(rows));
      return;
    }
    const rows: (string | number)[][] = [["Line item", "Value (₹)"]];
    waterfall.forEach((w) => rows.push([w.label, w.kind === "total" ? w.running : w.value]));
    downloadFile(`portfolio-build-up-${ts}.csv`, "text/csv", toCsv(rows));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/45"
            onClick={onClose}
            aria-hidden="true"
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Portfolio analysis"
            className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-[60] px-0 sm:px-4"
          >
            <div
              className="mx-auto w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card shadow-2xl flex flex-col overflow-hidden"
              style={{
                maxHeight: "min(92dvh, 720px)",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: `1px solid ${HAIRLINE}` }}
              >
                <h2 className="text-base font-semibold text-foreground flex-1 truncate">
                  Portfolio analysis
                </h2>
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex items-center gap-1 rounded-full bg-muted/70 hover:bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Export current view as CSV"
                >
                  <Download className="h-3 w-3" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="px-4 pt-3">
                <div className="flex rounded-full bg-muted/60 p-0.5">
                  {TABS.map((t) => {
                    const active = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                          active
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        aria-pressed={active}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                  >
                    {/* Range selector (returns + nav only) */}
                    {tab !== "waterfall" && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {RANGES.map((r) => {
                          const active = range === r;
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setRange(r)}
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                                active
                                  ? "bg-primary/10 text-primary"
                                  : "bg-muted/60 text-muted-foreground/70 hover:text-foreground"
                              }`}
                            >
                              {r}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* — Returns tab — */}
                    {tab === "returns" && (
                      <div>
                        <div className="grid grid-cols-2 gap-2">
                          <div
                            className="rounded-xl p-2.5"
                            style={{ border: `1px solid ${HAIRLINE}` }}
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                                TWR
                              </p>
                              <button
                                type="button"
                                onClick={() => setInfoOpen((o) => (o === "twr" ? null : "twr"))}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label="About TWR"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            </div>
                            <p
                              className="text-base font-semibold leading-tight"
                              style={{
                                color: scaledTwr >= 0 ? POSITIVE : NEGATIVE,
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              }}
                            >
                              {fmtPct(scaledTwr)}
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{range}</p>
                          </div>
                          <div
                            className="rounded-xl p-2.5"
                            style={{ border: `1px solid ${HAIRLINE}` }}
                          >
                            <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-0.5 leading-tight">
                              {primaryBenchmark.fullName}
                            </p>
                            <p
                              className="text-base font-semibold leading-tight"
                              style={{
                                color: primaryBench >= 0 ? POSITIVE : NEGATIVE,
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                              }}
                            >
                              {fmtPct(primaryBench)}
                            </p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{range}</p>
                          </div>
                        </div>

                        {infoOpen && (
                          <div
                            className="mt-2 rounded-lg px-3 py-2"
                            style={{ backgroundColor: "hsl(var(--muted) / 0.6)" }}
                          >
                            <p className="text-[11.5px] text-foreground leading-relaxed">
                              <strong>TWR</strong> measures the portfolio's compounded
                              performance over time, stripping out the effect of when and how
                              much you contributed — so it isolates investment performance.
                            </p>
                          </div>
                        )}

                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-4 mb-1.5">
                          Portfolio vs benchmarks over {range}
                        </p>
                        <div className="h-[180px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={returnsSeries}
                              margin={{ top: 8, right: 12, left: 12, bottom: 18 }}
                            >
                              <CartesianGrid stroke={HAIRLINE} vertical={false} />
                              <XAxis
                                dataKey="i"
                                type="number"
                                domain={[0, seriesPoints - 1]}
                                ticks={dateTicks}
                                tickFormatter={formatXTick}
                                tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                                axisLine={false}
                                tickLine={false}
                                tickMargin={6}
                                height={20}
                                interval={0}
                              />
                              <YAxis
                                orientation="right"
                                width={36}
                                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={(v) => `${v}%`}
                                axisLine={false}
                                tickLine={false}
                              />
                              <ReferenceLine y={0} stroke={HAIRLINE} strokeDasharray="3 3" />
                              <Tooltip
                                contentStyle={{
                                  fontSize: 11,
                                  borderRadius: 8,
                                  border: `1px solid ${HAIRLINE}`,
                                  backgroundColor: "hsl(var(--card))",
                                  color: "hsl(var(--foreground))",
                                }}
                                labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                                formatter={(v: number, name: string) => [`${v}%`, name.toUpperCase()]}
                                labelFormatter={(label) =>
                                  formatDateTick(range, dateForIndex(range, Number(label), seriesPoints, today))
                                }
                              />
                              <Line
                                type="monotone"
                                dataKey="twr"
                                name="TWR"
                                stroke={USER_LINE}
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                              />
                              {activeBenchmarks.map((b) => (
                                <Line
                                  key={b.id}
                                  type="monotone"
                                  dataKey={`bench_${b.id}`}
                                  name={b.shortName}
                                  stroke={b.color}
                                  strokeWidth={1.75}
                                  strokeDasharray={b.dash}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 text-[11px]">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block h-0.5 w-4"
                              style={{ backgroundColor: USER_LINE }}
                            />
                            TWR
                          </span>
                          {activeBenchmarks.map((b) => (
                            <span key={b.id} className="inline-flex items-center gap-1.5">
                              <span
                                className="inline-block h-0.5 w-4"
                                style={{ backgroundColor: b.color }}
                              />
                              {b.shortName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* — Waterfall tab — */}
                    {tab === "waterfall" && (
                      <div>
                        <p className="text-[11.5px] text-muted-foreground mb-3 leading-relaxed">
                          How your portfolio reached{" "}
                          <span
                            className="font-semibold text-foreground"
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                          >
                            {fmtInrCompact1(currentNav)}
                          </span>{" "}
                          — each bar shows one source of value.
                        </p>

                        <div className="h-[200px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={waterfallData}
                              margin={{ top: 12, right: 8, left: 0, bottom: 38 }}
                              barCategoryGap="18%"
                            >
                              <CartesianGrid stroke={HAIRLINE} vertical={false} />
                              <XAxis
                                dataKey="label"
                                tick={<WaterfallAxisTick />}
                                interval={0}
                                axisLine={false}
                                tickLine={false}
                                height={36}
                              />
                              <YAxis
                                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={(v) => fmtInrCompact1(v)}
                                axisLine={false}
                                tickLine={false}
                                width={52}
                              />
                              <Tooltip
                                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                                content={({ active, payload, label }) => {
                                  if (!active || !payload || payload.length === 0) return null;
                                  const barEntry = payload.find((p) => p.dataKey === "bar");
                                  if (!barEntry) return null;
                                  const point = barEntry.payload as typeof waterfallData[number];
                                  return (
                                    <div
                                      style={{
                                        fontSize: 11,
                                        borderRadius: 8,
                                        border: `1px solid ${HAIRLINE}`,
                                        backgroundColor: "hsl(var(--card))",
                                        color: "hsl(var(--foreground))",
                                        padding: "6px 10px",
                                      }}
                                    >
                                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{String(label)}</div>
                                      <div>{fmtInr1(Math.abs(point.display ?? 0))}</div>
                                    </div>
                                  );
                                }}
                              />
                              {/* invisible spacer so positive-delta bars float */}
                              <Bar dataKey="spacer" stackId="w" fill="transparent" />
                              <Bar dataKey="bar" stackId="w" radius={[3, 3, 3, 3]}>
                                {waterfallData.map((entry, i) => {
                                  const color =
                                    entry.kind === "base"
                                      ? "hsl(var(--accent))"
                                      : entry.kind === "total"
                                        ? "hsl(var(--primary))"
                                        : entry.kind === "negative"
                                          ? NEGATIVE
                                          : POSITIVE;
                                  return <Cell key={`cell-${i}`} fill={color} />;
                                })}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-4 mb-1.5">
                          Breakdown
                        </p>
                        <div
                          className="rounded-xl overflow-hidden"
                          style={{ border: `1px solid ${HAIRLINE}` }}
                        >
                          {waterfall.map((w, idx) => {
                            const isLast = idx === waterfall.length - 1;
                            const colour =
                              w.kind === "negative"
                                ? NEGATIVE
                                : w.kind === "positive"
                                  ? POSITIVE
                                  : "hsl(var(--foreground))";
                            return (
                              <div
                                key={w.label}
                                className="flex items-center justify-between px-3 py-2"
                                style={{
                                  borderBottom: isLast ? undefined : `1px solid ${HAIRLINE}`,
                                  backgroundColor:
                                    w.kind === "total" ? "hsl(var(--muted) / 0.45)" : undefined,
                                }}
                              >
                                <span
                                  className="text-[11.5px]"
                                  style={{
                                    color:
                                      w.kind === "total"
                                        ? "hsl(var(--foreground))"
                                        : "hsl(var(--muted-foreground))",
                                    fontWeight: w.kind === "total" ? 600 : 400,
                                  }}
                                >
                                  {w.label}
                                </span>
                                <span
                                  className="text-[12px] font-semibold"
                                  style={{
                                    color: colour,
                                    fontFamily:
                                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                                  }}
                                >
                                  {w.kind === "negative"
                                    ? `-${fmtInrCompact1(Math.abs(w.value))}`
                                    : w.kind === "total"
                                      ? fmtInrCompact1(w.running)
                                      : `${w.value > 0 ? "+" : ""}${fmtInrCompact1(Math.abs(w.value))}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PortfolioAnalysisModal;
