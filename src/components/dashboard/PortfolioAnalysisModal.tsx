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
import {
  getPortfolioNavHistory,
  getPortfolioTwr,
  type PortfolioNavHistoryResponse,
  type TwrSeriesResponse,
} from "@/lib/api";
import { computeBuildUp } from "@/lib/buildUp";
import { rebaseTwr, windowStartIndex, type AnalysisRange } from "@/lib/twr";

type AnalysisTab = "returns" | "waterfall";

const TABS: { id: AnalysisTab; label: string }[] = [
  { id: "returns", label: "Performance" },
  { id: "waterfall", label: "Value Build-Up" },
];

// Single fixed benchmark — Nifty 50. Its value now comes from real Nifty TRI data.
const NIFTY = {
  fullName: "Benchmark: Nifty 50",
  shortName: "Nifty 50",
  color: "hsl(var(--muted-foreground))",
  dash: "2 3",
};

const RANGES: AnalysisRange[] = ["1M", "3M", "YTD", "1Y", "3Y", "All"];

const STORAGE_KEY = "portfolio-analysis-tab";

const POSITIVE = "hsl(var(--wealth-green))";
const NEGATIVE = "hsl(var(--destructive))";
const USER_LINE = "hsl(var(--wealth-green))";
const HAIRLINE = "hsl(var(--hairline))";

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
}

const PortfolioAnalysisModal = ({ open, onClose }: Props) => {
  const [tab, setTab] = useState<AnalysisTab>(() => {
    if (typeof window === "undefined") return "returns";
    const stored = window.sessionStorage.getItem(STORAGE_KEY) as AnalysisTab | null;
    return stored === "returns" || stored === "waterfall" ? stored : "returns";
  });
  const [range, setRange] = useState<AnalysisRange>("1M");
  const [infoOpen, setInfoOpen] = useState<"twr" | null>(null);
  const [twrData, setTwrData] = useState<TwrSeriesResponse | null>(null);
  const [twrLoading, setTwrLoading] = useState(false);
  const [twrError, setTwrError] = useState(false);
  const [navData, setNavData] = useState<PortfolioNavHistoryResponse | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTwrLoading(true);
    setTwrError(false);
    getPortfolioTwr()
      .then((d) => { if (!cancelled) setTwrData(d); })
      .catch(() => { if (!cancelled) setTwrError(true); })
      .finally(() => { if (!cancelled) setTwrLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setNavLoading(true);
    setNavError(false);
    getPortfolioNavHistory("MAX")
      .then((d) => { if (!cancelled) setNavData(d); })
      .catch(() => { if (!cancelled) setNavError(true); })
      .finally(() => { if (!cancelled) setNavLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

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

  // Real time-weighted return. The backend returns a daily growth-of-1 series since
  // inception; we rebase it to the selected range here (value_t / value_start − 1).
  const today = useMemo(() => new Date(), []);

  const rebased = useMemo(() => {
    if (!twrData || !twrData.has_data) return null;
    const startIdx = windowStartIndex(twrData.points.map((p) => p.date), range, today);
    return rebaseTwr(twrData.points, startIdx);
  }, [twrData, range, today]);

  const returnsSeries = rebased?.series ?? [];
  const seriesPoints = returnsSeries.length;
  const scaledTwr = rebased?.twr ?? 0;
  const primaryBench = rebased?.niftyTwr ?? null;
  const hasBench = returnsSeries.some((p) => p.bench_nifty50 !== undefined);
  const dateTicks = useMemo(() => tickIndicesFor(seriesPoints), [seriesPoints]);
  const formatXTick = (v: number) => {
    const p = returnsSeries[Number(v)];
    return p ? formatDateTick(range, new Date(p.date)) : "";
  };


  // Real value build-up over the selected window, sliced client-side from the daily
  // nav-history series: startingValue + netInvested + marketGain = currentValue.
  const buildUp = useMemo(
    () => (navData ? computeBuildUp(navData.points, range, today) : null),
    [navData, range, today]
  );

  type WaterfallItem = {
    label: string;
    value: number;
    kind: "base" | "positive" | "negative" | "total";
    running: number; // running total AFTER this bar
  };

  const waterfall: WaterfallItem[] = (() => {
    if (!buildUp) return [];
    const { startingValue, netInvested, marketGain, currentValue } = buildUp;
    const items: Omit<WaterfallItem, "running">[] = [];
    // "All" anchors before inception, so startingValue is ₹0 — skip the empty bar.
    if (startingValue > 0) {
      items.push({ label: "Starting value", value: startingValue, kind: "base" });
    }
    items.push({ label: "Net invested", value: netInvested, kind: netInvested >= 0 ? "positive" : "negative" });
    items.push({ label: "Market gain", value: marketGain, kind: marketGain >= 0 ? "positive" : "negative" });
    items.push({ label: "Current value", value: currentValue, kind: "total" });
    let running = 0;
    return items.map((it) => {
      if (it.kind === "base" || it.kind === "total") {
        running = it.value;
      } else {
        running += it.value;
      }
      return { ...it, running };
    });
  })();

  // Build recharts data for the waterfall: each bar needs a "spacer" (invisible) + "bar" (coloured).
  const waterfallData = waterfall.map((w) => {
    if (w.kind === "base" || w.kind === "total") {
      return { label: w.label, spacer: 0, bar: w.value, kind: w.kind, display: w.value };
    }
    const end = w.running;
    // Positive delta floats from its start (end − value) upward; a negative delta sits
    // at the new lower running and draws |value| up to the previous level.
    if (w.value >= 0) {
      return { label: w.label, spacer: end - w.value, bar: w.value, kind: w.kind, display: w.value };
    }
    return { label: w.label, spacer: end, bar: -w.value, kind: w.kind, display: w.value };
  });

  const handleExport = () => {
    const ts = new Date().toISOString().slice(0, 10);
    if (tab === "returns") {
      const rows: (string | number)[][] = [
        ["Metric (Mutual funds)", `${range}`],
        ["Portfolio TWR %", scaledTwr],
        ["Nifty 50 TWR %", primaryBench ?? ""],
      ];
      downloadFile(`portfolio-performance-${ts}.csv`, "text/csv", toCsv(rows));
      return;
    }
    const rows: (string | number)[][] = [
      ["Timeframe", range],
      ["Line item", "Value (₹)"],
    ];
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
                    {/* Range selector — shared by both tabs */}
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

                    {/* — Returns tab — */}
                    {tab === "returns" && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Performance
                          </p>
                          <span className="text-[9px] rounded-full px-1.5 py-0.5 bg-muted text-muted-foreground">
                            Mutual funds
                          </span>
                        </div>

                        {twrLoading && (
                          <p className="text-[12px] text-muted-foreground py-8 text-center">
                            Loading your returns…
                          </p>
                        )}

                        {!twrLoading && (twrError || !rebased) && (
                          <p className="text-[12px] text-muted-foreground py-8 text-center leading-relaxed">
                            Not enough history yet — import your transactions to see your returns.
                          </p>
                        )}

                        {!twrLoading && !twrError && rebased && (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-xl p-2.5" style={{ border: `1px solid ${HAIRLINE}` }}>
                                <div className="flex items-center gap-1 mb-0.5">
                                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">TWR</p>
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
                              </div>
                              <div className="rounded-xl p-2.5" style={{ border: `1px solid ${HAIRLINE}` }}>
                                <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-0.5 leading-tight">
                                  {NIFTY.fullName}
                                </p>
                                <p
                                  className="text-base font-semibold leading-tight"
                                  style={{
                                    color: (primaryBench ?? 0) >= 0 ? POSITIVE : NEGATIVE,
                                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                  }}
                                >
                                  {primaryBench == null ? "—" : fmtPct(primaryBench)}
                                </p>
                              </div>
                            </div>

                            {infoOpen && (
                              <div className="mt-2 rounded-lg px-3 py-2" style={{ backgroundColor: "hsl(var(--muted) / 0.6)" }}>
                                <p className="text-[11.5px] text-foreground leading-relaxed">
                                  Use this to see whether your fund choices are actually beating the
                                  market. If your <strong>TWR</strong> sits above the Nifty 50 line,
                                  your picks are adding value over a plain index fund; if it trails, a
                                  low-cost index fund may have served you better. TWR ignores how much
                                  you invested and when, so it judges the funds themselves — not your
                                  contribution timing. (Covers your mutual-fund holdings only.)
                                </p>
                              </div>
                            )}

                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-4 mb-1.5">
                              TWR Benchmarking
                            </p>
                            <div className="h-[180px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={returnsSeries} margin={{ top: 8, right: 12, left: 12, bottom: 18 }}>
                                  <CartesianGrid stroke={HAIRLINE} vertical={false} />
                                  <XAxis
                                    dataKey="i"
                                    type="number"
                                    domain={[0, Math.max(0, seriesPoints - 1)]}
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
                                    labelFormatter={(label) => {
                                      const p = returnsSeries[Number(label)];
                                      return p ? formatDateTick(range, new Date(p.date)) : "";
                                    }}
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
                                  {hasBench && (
                                    <Line
                                      type="monotone"
                                      dataKey="bench_nifty50"
                                      name={NIFTY.shortName}
                                      stroke={NIFTY.color}
                                      strokeWidth={1.75}
                                      strokeDasharray={NIFTY.dash}
                                      dot={false}
                                      isAnimationActive={false}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 text-[11px]">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-block h-0.5 w-4" style={{ backgroundColor: USER_LINE }} />
                                TWR
                              </span>
                              {hasBench && (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-block h-0.5 w-4" style={{ backgroundColor: NIFTY.color }} />
                                  {NIFTY.shortName}
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* — Waterfall tab — */}
                    {tab === "waterfall" && (
                      <div>
                        {navLoading && (
                          <p className="text-[12px] text-muted-foreground py-8 text-center">
                            Loading your value build-up…
                          </p>
                        )}

                        {!navLoading && (navError || !buildUp) && (
                          <p className="text-[12px] text-muted-foreground py-8 text-center leading-relaxed">
                            Not enough history yet — import your transactions to see how your value built up.
                          </p>
                        )}

                        {!navLoading && !navError && buildUp && (
                          <>
                            <p className="text-[11.5px] text-muted-foreground mb-3 leading-relaxed">
                              {range === "All" ? (
                                <>
                                  How much of your{" "}
                                  <span
                                    className="font-semibold text-foreground"
                                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                                  >
                                    {fmtInrCompact1(buildUp.currentValue)}
                                  </span>{" "}
                                  you invested, and how much the market earned on top. (Mutual funds only.)
                                </>
                              ) : (
                                <>
                                  {range === "YTD" ? "So far this year" : `Over the last ${range}`}: how
                                  much you added, and how much the market earned on top of where you started.
                                  (Mutual funds only.)
                                </>
                              )}
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
                          </>
                        )}
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
