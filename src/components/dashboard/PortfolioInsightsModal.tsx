import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, Sparkles, X } from "lucide-react";
import {
  getPortfolioInsights,
  getPortfolioTwr,
  type InsightFundRow,
  type PortfolioDetail,
  type PortfolioInsightsResponse,
  type TwrSeriesResponse,
} from "@/lib/api";
import { rebaseTwr, windowStartIndex, type AnalysisRange } from "@/lib/twr";

/** How many funds each of the like / dislike groups lists before "+N more". */
const GROUP_LIMIT = 5;

const RANGES: AnalysisRange[] = ["1M", "3M", "YTD", "1Y", "3Y", "All"];

const HAIRLINE = "hsl(var(--hairline))";
// The app's premium gold — same hex the Discover cards and the profile-unlock
// rings use, so "gold" means one thing across the product. Used for chrome only
// (step badges, rules, header wash); never to encode a data value.
const GOLD = "#D4A868";
const GOLD_ON = "#2D1F05";
const GOLD_BORDER = "rgba(212, 168, 104, 0.45)";
const GOLD_TINT = "rgba(212, 168, 104, 0.06)";
const GOLD_TINT_STRONG = "rgba(212, 168, 104, 0.16)";
// Two-series pair, validated for colourblind separation in BOTH themes — see the
// --chart-you / --chart-bench note in index.css before substituting anything.
const YOU = "hsl(var(--chart-you))";
const BENCH = "hsl(var(--chart-bench))";
// Diverging polarity (beat / lagged). Always shipped alongside a signed number,
// so the sign carries the meaning and the colour only reinforces it.
const POSITIVE = "hsl(var(--wealth-green))";
const NEGATIVE = "hsl(var(--destructive))";

// Canonical asset-class palette — same hues as the dashboard's allocation donut,
// so a slice means the same thing in both places.
const EQUITY_COLOR = "#2563EB";
const DEBT_COLOR = "hsl(188 52% 41%)";
const GOLD_COLOR = "hsl(38 64% 47%)";
const CASH_COLOR = "hsl(214 14% 47%)";
const ALT_COLOR = "hsl(348 35% 43%)";
const FALLBACK_PALETTE = [EQUITY_COLOR, DEBT_COLOR, GOLD_COLOR, CASH_COLOR, ALT_COLOR];

const DONUT_COLORS: Record<string, string> = {
  Equity: EQUITY_COLOR,
  Debt: DEBT_COLOR,
  "Fixed Income": DEBT_COLOR,
  Others: GOLD_COLOR,
  Gold: GOLD_COLOR,
  "Hybrid & Others": GOLD_COLOR,
  Cash: CASH_COLOR,
  "Cash/Other": CASH_COLOR,
  Alternatives: ALT_COLOR,
};

function assetClassColor(name: string, i: number): string {
  if (DONUT_COLORS[name]) return DONUT_COLORS[name];
  const n = name.trim().toLowerCase();
  if (n.includes("equity")) return EQUITY_COLOR;
  if (n.includes("debt") || n.includes("fixed income")) return DEBT_COLOR;
  if (n.includes("gold") || n.includes("hybrid") || n.includes("inflation")) return GOLD_COLOR;
  if (n.includes("alternative")) return ALT_COLOR;
  if (n.includes("cash") || n.includes("other")) return CASH_COLOR;
  return FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

/** Signed percent to one decimal, e.g. "+12.4%". */
function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

/** Compact ₹ to one decimal (₹4.8L, ₹1.2Cr). */
function fmtInr1(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}k`;
  return `${sign}₹${a.toFixed(1)}`;
}

/** Strip folio suffixes and plan/option tails — matches the holdings list. */
function plainFundName(raw: string): string {
  let s = raw.trim();
  if (!s) return raw;
  s = s.replace(/\s*·\s*Folio.*$/i, "").trim();
  s = s.replace(/\s*\([^)]*Demat[^)]*\)\s*$/i, "").trim();
  s = s.replace(/\s*\(formerly[^)]*\)\s*$/i, "").trim();
  s = s.replace(/\s*[-–]\s*(Direct|Regular)\s+Plan\b.*$/i, "").trim();
  s = s.replace(/\s*[-–]\s*(IDCW|Direct)\b.*$/i, "").trim();
  s = s.replace(/\s*[-–]?\s*Growth(?:\s+Option)?$/i, "").trim();
  return s || raw.trim();
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

function formatAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Section shell ───────────────────────────────────────────────────────────

function Section({
  id,
  step,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  id: string;
  /** 1-3 — shown in the gold step badge and read out by screen readers. */
  step: number;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] overflow-hidden transition-colors"
      style={{
        // Gold only asserts itself on the open section, so the accent marks where
        // you are instead of shouting from all three at once.
        border: `1px solid ${open ? GOLD_BORDER : HAIRLINE}`,
        backgroundColor: open ? GOLD_TINT : undefined,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-left"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors"
          style={
            open
              ? { backgroundColor: GOLD, color: GOLD_ON }
              : { backgroundColor: GOLD_TINT_STRONG, color: GOLD }
          }
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            <span className="sr-only">{`Section ${step}: `}</span>
            {title}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="inline-flex shrink-0"
        >
          <ChevronDown className="h-4 w-4" style={{ color: open ? GOLD : undefined }} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="bg-card px-3 pb-3"
              style={{ borderTop: `1px solid ${open ? GOLD_BORDER : HAIRLINE}` }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── 1. Performance vs benchmark ─────────────────────────────────────────────

function PerformanceSection({
  twr,
  twrLoading,
  insights,
  insightsLoading,
}: {
  twr: TwrSeriesResponse | null;
  twrLoading: boolean;
  insights: PortfolioInsightsResponse | null;
  insightsLoading: boolean;
}) {
  const [range, setRange] = useState<AnalysisRange>("1Y");
  const [navWindow, setNavWindow] = useState<"1Y" | "3Y">("1Y");
  const today = useMemo(() => new Date(), []);

  const rebased = useMemo(() => {
    if (!twr || !twr.has_data) return null;
    const startIdx = windowStartIndex(twr.points.map((p) => p.date), range, today);
    return rebaseTwr(twr.points, startIdx);
  }, [twr, range, today]);

  const series = rebased?.series ?? [];
  const hasBench = series.some((p) => p.bench_nifty50 !== undefined);
  const dateTicks = useMemo(() => tickIndicesFor(series.length), [series.length]);

  const benchReturn =
    navWindow === "1Y"
      ? insights?.benchmark?.return_1y_pct ?? null
      : insights?.benchmark?.return_3y_pct ?? null;

  // Only funds we can actually price over the selected window belong in a
  // comparison table — a blank row tells the user nothing and pads the list.
  const fundRows = useMemo(() => {
    const rows = (insights?.funds ?? [])
      .map((f) => ({
        fund: f,
        ret: navWindow === "1Y" ? f.nav_return_1y_pct : f.nav_return_3y_pct,
      }))
      .filter((r): r is { fund: InsightFundRow; ret: number } => r.ret != null);
    rows.sort((a, b) => b.ret - a.ret);
    return rows;
  }, [insights, navWindow]);

  const missingCount = (insights?.funds.length ?? 0) - fundRows.length;
  const asOf = formatAsOf(insights?.as_of ?? null);

  return (
    <div className="pt-3">
      {/* — Portfolio line vs the index — */}
      <div className="mb-1.5 flex flex-wrap gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            aria-pressed={range === r}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              range === r
                ? "bg-primary/10 text-primary"
                : "bg-muted/60 text-muted-foreground/70 hover:text-foreground"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {twrLoading && (
        <p className="py-8 text-center text-[12px] text-muted-foreground">Loading your returns…</p>
      )}

      {!twrLoading && !rebased && (
        <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
          Not enough history yet — import your transactions to compare against the index.
        </p>
      )}

      {!twrLoading && rebased && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl p-2.5" style={{ border: `1px solid ${HAIRLINE}` }}>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3.5 shrink-0" style={{ backgroundColor: YOU }} />
                <p className="text-[10px] leading-tight tracking-wide text-muted-foreground">
                  Your funds
                </p>
              </div>
              <p
                className="text-sm font-semibold leading-tight"
                style={{
                  color: rebased.twr >= 0 ? POSITIVE : NEGATIVE,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {fmtPct(rebased.twr)}
              </p>
            </div>
            <div className="rounded-xl p-2.5" style={{ border: `1px solid ${HAIRLINE}` }}>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3.5 shrink-0" style={{ backgroundColor: BENCH }} />
                <p className="text-[10px] leading-tight tracking-wide text-muted-foreground">
                  Nifty 50
                </p>
              </div>
              <p
                className="text-sm font-semibold leading-tight"
                style={{
                  color: (rebased.niftyTwr ?? 0) >= 0 ? POSITIVE : NEGATIVE,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {rebased.niftyTwr == null ? "—" : fmtPct(rebased.niftyTwr)}
              </p>
            </div>
          </div>

          <div className="mt-3 h-[170px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 10, left: 8, bottom: 16 }}>
                <CartesianGrid stroke={HAIRLINE} vertical={false} />
                <XAxis
                  dataKey="i"
                  type="number"
                  domain={[0, Math.max(0, series.length - 1)]}
                  ticks={dateTicks}
                  tickFormatter={(v: number) => {
                    const p = series[Number(v)];
                    return p ? formatDateTick(range, new Date(p.date)) : "";
                  }}
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
                  formatter={(v: number, name: string) => [`${v}%`, name]}
                  labelFormatter={(label) => {
                    const p = series[Number(label)];
                    return p ? formatDateTick(range, new Date(p.date)) : "";
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="twr"
                  name="Your funds"
                  stroke={YOU}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {hasBench && (
                  <Line
                    type="monotone"
                    dataKey="bench_nifty50"
                    name="Nifty 50"
                    stroke={BENCH}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ backgroundColor: YOU }} />
              Your funds
            </span>
            {hasBench && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4" style={{ backgroundColor: BENCH }} />
                Nifty 50
              </span>
            )}
          </div>
        </>
      )}

      {/* — Fund by fund — */}
      <div className="mt-4 flex items-center gap-1.5">
        <p className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fund by fund
        </p>
        {(["1Y", "3Y"] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setNavWindow(w)}
            aria-pressed={navWindow === w}
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              navWindow === w
                ? "bg-accent/15 text-accent"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      {insightsLoading && (
        <p className="py-6 text-center text-[12px] text-muted-foreground">Loading your funds…</p>
      )}

      {!insightsLoading && fundRows.length === 0 && (
        <p className="py-6 text-center text-[12px] leading-relaxed text-muted-foreground">
          None of your funds has {navWindow} of price history yet.
        </p>
      )}

      {!insightsLoading && fundRows.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-2 px-1 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span className="flex-1">Fund</span>
            <span className="w-[52px] shrink-0 text-right">{navWindow}</span>
            <span className="w-[52px] shrink-0 text-right">Nifty</span>
            <span className="w-[58px] shrink-0 text-right">Gap</span>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }}>
            {fundRows.map(({ fund, ret }, i) => {
              const gap = benchReturn == null ? null : ret - benchReturn;
              return (
                <div
                  key={fund.holding_id}
                  className="flex items-center gap-2 px-2.5 py-2"
                  style={{
                    borderBottom: i === fundRows.length - 1 ? undefined : `1px solid ${HAIRLINE}`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium leading-tight text-foreground">
                      {plainFundName(fund.name)}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                      {fund.weight_pct.toFixed(1)}% of portfolio
                    </p>
                  </div>
                  <span
                    className="w-[52px] shrink-0 text-right text-[12px] font-semibold tabular-nums"
                    style={{ color: YOU }}
                  >
                    {fmtPct(ret)}
                  </span>
                  <span
                    className="w-[52px] shrink-0 text-right text-[12px] font-semibold tabular-nums"
                    style={{ color: BENCH }}
                  >
                    {benchReturn == null ? "—" : fmtPct(benchReturn)}
                  </span>
                  <span
                    className="w-[58px] shrink-0 text-right text-[12px] font-semibold tabular-nums"
                    style={{ color: gap == null ? undefined : gap >= 0 ? POSITIVE : NEGATIVE }}
                  >
                    {gap == null ? "—" : fmtPct(gap)}
                  </span>
                </div>
              );
            })}
          </div>
          {missingCount > 0 && (
            <p className="px-1 pt-1.5 text-[10px] leading-snug text-muted-foreground/70">
              {missingCount} {missingCount === 1 ? "fund is" : "funds are"} not shown — less than{" "}
              {navWindow} of price history.
            </p>
          )}
          <p className="px-1 pt-1 text-[10px] leading-snug text-muted-foreground/70">
            Scheme returns, not your own — they ignore when you bought.{" "}
            {navWindow === "3Y" ? "3Y figures are total, not per year. " : ""}
            {asOf ? `Priced to ${asOf}, same date as the index.` : ""}
          </p>
        </>
      )}
    </div>
  );
}

// ── 2. Allocation ───────────────────────────────────────────────────────────

function AllocationSection({ portfolio }: { portfolio: PortfolioDetail | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  const slices = useMemo(
    () =>
      (portfolio?.allocations ?? []).map((a, i) => ({
        name: a.asset_class,
        value: Math.round(a.allocation_percentage * 10) / 10,
        amount: a.amount,
        color: assetClassColor(a.asset_class, i),
        subCategories: (a.sub_categories ?? []).filter((s) => s.amount > 0),
      })),
    [portfolio]
  );

  if (slices.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        No allocation on file yet — import a statement to see your asset mix.
      </p>
    );
  }

  const active = selected ? slices.find((s) => s.name === selected) ?? null : null;
  const total = portfolio?.total_value ?? 0;

  return (
    <div className="pt-3">
      <div className="flex items-start gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={52}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
                onClick={(_, index) => {
                  const name = slices[index]?.name;
                  if (name) setSelected((cur) => (cur === name ? null : name));
                }}
              >
                {slices.map((s) => (
                  <Cell
                    key={s.name}
                    fill={s.color}
                    fillOpacity={selected && s.name !== selected ? 0.3 : 1}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: `1px solid ${HAIRLINE}`,
                  backgroundColor: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(v: number, name: string) => [`${v}%`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-foreground">
              {total > 0 ? fmtInr1(total) : "₹—"}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {slices.map((s) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setSelected((cur) => (cur === s.name ? null : s.name))}
              aria-pressed={selected === s.name}
              className="flex items-center justify-between gap-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span
                  className={`truncate text-[12px] leading-tight ${
                    selected === s.name ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.name}
                </span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-foreground tabular-nums">
                {s.value.toFixed(1)}%
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Sub-groups. The backend splits blended funds look-through, so each class's
          rows sum to that class's own amount — never re-derive this from holdings. */}
      <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {active ? `${active.name} — sub-groups` : "Sub-groups"}
      </p>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }}>
        {(active ? [active] : slices).map((s, si, shown) =>
          s.subCategories.length === 0 ? (
            <div
              key={s.name}
              className="px-2.5 py-2"
              style={{ borderBottom: si === shown.length - 1 ? undefined : `1px solid ${HAIRLINE}` }}
            >
              <p className="text-[11px] text-muted-foreground">
                No sub-groups recorded under {s.name}.
              </p>
            </div>
          ) : (
            <div
              key={s.name}
              style={{ borderBottom: si === shown.length - 1 ? undefined : `1px solid ${HAIRLINE}` }}
            >
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5"
                style={{ backgroundColor: "hsl(var(--muted) / 0.45)" }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {s.name}
                </span>
                <span className="text-[11px] font-semibold text-foreground tabular-nums">
                  {fmtInr1(s.amount)}
                </span>
              </div>
              {s.subCategories.map((sc) => (
                <div key={`${s.name}-${sc.name}`} className="flex items-start gap-2 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 break-words text-[11.5px] leading-tight text-muted-foreground">
                    {sc.name}
                  </span>
                  <span className="shrink-0 text-[11.5px] font-medium text-foreground tabular-nums">
                    {fmtInr1(sc.amount)}
                  </span>
                  <span className="w-[42px] shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                    {total > 0 ? `${((sc.amount / total) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
      <p className="px-1 pt-1.5 text-[10px] leading-snug text-muted-foreground/70">
        Funds holding more than one asset class are split across the classes they hold, so the
        slices add up to your total.{active ? " Tap the slice again to see every class." : ""}
      </p>
    </div>
  );
}

// ── 3. Funds we like / don't ────────────────────────────────────────────────

function VerdictGroup({
  title,
  caption,
  funds,
  accent,
  emptyText,
}: {
  title: string;
  caption: string;
  funds: InsightFundRow[];
  accent: string;
  emptyText: string;
}) {
  const weight = funds.reduce((s, f) => s + f.weight_pct, 0);
  const shown = funds.slice(0, GROUP_LIMIT);

  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <p className="flex-1 text-[12px] font-semibold leading-tight text-foreground">{title}</p>
        <p className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: accent }}>
          {weight.toFixed(1)}%
        </p>
      </div>
      <p className="mb-2 pl-4 text-[10.5px] leading-snug text-muted-foreground">{caption}</p>

      {funds.length === 0 ? (
        <p className="rounded-xl px-3 py-3 text-[11.5px] leading-snug text-muted-foreground"
           style={{ border: `1px solid ${HAIRLINE}` }}>
          {emptyText}
        </p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${HAIRLINE}` }}>
          {shown.map((f, i) => (
            <div
              key={f.holding_id}
              className="flex items-start gap-2.5 px-2.5 py-2"
              style={{ borderBottom: i === shown.length - 1 ? undefined : `1px solid ${HAIRLINE}` }}
            >
              <div className="mt-0.5 h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium leading-tight text-foreground">
                  {plainFundName(f.name)}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                  {f.verdict_reason}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12.5px] font-semibold text-foreground tabular-nums">
                  {f.weight_pct.toFixed(1)}%
                </p>
                <p className="text-[10.5px] text-muted-foreground tabular-nums">
                  {fmtInr1(f.current_value)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {funds.length > shown.length && (
        <p className="px-1 pt-1 text-[10px] text-muted-foreground/70">
          + {funds.length - shown.length} more, {(weight - shown.reduce((s, f) => s + f.weight_pct, 0)).toFixed(1)}%
          of the portfolio between them.
        </p>
      )}
    </div>
  );
}

function VerdictSection({
  insights,
  loading,
}: {
  insights: PortfolioInsightsResponse | null;
  loading: boolean;
}) {
  const groups = useMemo(() => {
    const byWeight = (a: InsightFundRow, b: InsightFundRow) => b.weight_pct - a.weight_pct;
    const funds = insights?.funds ?? [];
    return {
      like: funds.filter((f) => f.verdict === "like").sort(byWeight),
      dislike: funds.filter((f) => f.verdict === "dislike").sort(byWeight),
      neutral: funds.filter((f) => f.verdict === "neutral").sort(byWeight),
    };
  }, [insights]);

  if (loading) {
    return <p className="py-8 text-center text-[12px] text-muted-foreground">Loading our view…</p>;
  }

  if (!insights || insights.funds.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        No mutual funds on file yet — import a statement and we'll tell you what we think of them.
      </p>
    );
  }

  const neutralWeight = groups.neutral.reduce((s, f) => s + f.weight_pct, 0);
  const basis = insights.rebalancing_run_id
    ? "Based on your latest rebalance and our fund ratings."
    : "Based on our fund ratings. Run a rebalance for a fuller picture.";

  return (
    <div className="pt-3">
      <VerdictGroup
        title="Funds we like"
        caption="On our recommended list for their category and rated at or above our floor."
        funds={groups.like}
        accent={POSITIVE}
        emptyText="None of your funds clears our bar right now."
      />
      <VerdictGroup
        title="Funds we'd move on from"
        caption="Off our list, below our rating floor, or flagged to exit."
        funds={groups.dislike}
        accent={NEGATIVE}
        emptyText="Nothing we'd flag — every rated fund you hold clears our bar."
      />

      {groups.neutral.length > 0 && (
        <p className="px-1 pt-3 text-[10.5px] leading-snug text-muted-foreground/70">
          {groups.neutral.length} {groups.neutral.length === 1 ? "fund" : "funds"} (
          {neutralWeight.toFixed(1)}% of the portfolio){" "}
          {groups.neutral.length === 1 ? "is" : "are"} not rated by us yet, so{" "}
          {groups.neutral.length === 1 ? "it sits" : "they sit"} in neither group.
        </p>
      )}
      <p className="px-1 pt-1 text-[10px] leading-snug text-muted-foreground/70">{basis}</p>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

type SectionId = "performance" | "allocation" | "verdict";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Allocation data already loaded by the dashboard — section 2 reuses it. */
  portfolio: PortfolioDetail | null;
}

const PortfolioInsightsModal = ({ open, onClose, portfolio }: Props) => {
  const [openSection, setOpenSection] = useState<SectionId | null>("performance");
  const [twr, setTwr] = useState<TwrSeriesResponse | null>(null);
  const [twrLoading, setTwrLoading] = useState(false);
  const [insights, setInsights] = useState<PortfolioInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTwrLoading(true);
    setInsightsLoading(true);
    getPortfolioTwr()
      .then((d) => { if (!cancelled) setTwr(d); })
      .catch(() => { if (!cancelled) setTwr(null); })
      .finally(() => { if (!cancelled) setTwrLoading(false); });
    getPortfolioInsights()
      .then((d) => { if (!cancelled) setInsights(d); })
      .catch(() => { if (!cancelled) setInsights(null); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggle = (id: SectionId) => setOpenSection((cur) => (cur === id ? null : id));

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/45"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Portfolio insights"
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          >
            <div
              className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
              style={{
                maxHeight: "min(92dvh, 720px)",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center gap-2.5 px-4 py-3"
                style={{
                  borderBottom: `1px solid ${GOLD_BORDER}`,
                  background: `linear-gradient(135deg, ${GOLD_TINT_STRONG} 0%, transparent 70%)`,
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: GOLD_TINT_STRONG }}
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2} style={{ color: GOLD }} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-foreground">
                    Portfolio insights
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Three things worth knowing about your mutual funds
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="-m-1.5 p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                <Section
                  id="performance"
                  step={1}
                  title="Performance vs benchmark"
                  subtitle="How your funds did against the Nifty 50"
                  open={openSection === "performance"}
                  onToggle={() => toggle("performance")}
                >
                  <PerformanceSection
                    twr={twr}
                    twrLoading={twrLoading}
                    insights={insights}
                    insightsLoading={insightsLoading}
                  />
                </Section>

                <Section
                  id="allocation"
                  step={2}
                  title="Where your money sits"
                  subtitle="Asset classes and the sub-groups inside them"
                  open={openSection === "allocation"}
                  onToggle={() => toggle("allocation")}
                >
                  <AllocationSection portfolio={portfolio} />
                </Section>

                <Section
                  id="verdict"
                  step={3}
                  title="What we think of your funds"
                  subtitle="The ones we back, and the ones we'd replace"
                  open={openSection === "verdict"}
                  onToggle={() => toggle("verdict")}
                >
                  <VerdictSection insights={insights} loading={insightsLoading} />
                </Section>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PortfolioInsightsModal;
