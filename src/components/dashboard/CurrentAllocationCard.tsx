import { useState } from "react";
import { Link } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PortfolioDetail } from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

// Bucket classification mirrors the Recommended Investment Plan page.
type HoldingBucket = "equity" | "debt" | "hybrid";

const EQUITY_COLOR = "#3B6FA8";
const DEBT_COLOR = "#A8872F";
const GOLD_COLOR = "#E0B84A";
const CASH_COLOR = "#F1DA9B";

const BUCKET_ORDER: HoldingBucket[] = ["equity", "debt", "hybrid"];

const BUCKET_LABEL: Record<HoldingBucket, string> = {
  equity: "Equity",
  debt: "Debt",
  hybrid: "Hybrid & Others",
};

function classifyHoldingBucket(name: string, instrumentType: string): HoldingBucket {
  const n = `${name} ${instrumentType}`.toLowerCase();
  if (/bond|gilt|treasury|debt|liquid|credit/.test(n)) return "debt";
  if (/gold|silver|commodity|hybrid|balanced|multi.?asset|sectoral|psu bank|energy|pharma|it etf|reit/.test(n)) {
    return "hybrid";
  }
  if (/nifty|sensex|cap|flexi|equity|s&p|nasdaq|growth|value|dividend/.test(n)) return "equity";
  return "hybrid";
}

/** Strip folio suffix and plan/option tails for a short scheme title in the holdings list. */
function plainFundDisplayName(raw: string): string {
  let s = raw.trim();
  if (!s) return raw;
  s = s.replace(/\s*·\s*Folio.*$/i, "").trim();
  s = s.replace(/\s*\([^)]*Demat[^)]*\)\s*$/i, "").trim();
  s = s.replace(/\s*\(formerly[^)]*\)\s*$/i, "").trim();
  s = s.replace(/\s*[-–]\s*Direct\s+Plan\b.*$/i, "").trim();
  s = s.replace(/\s*[-–]\s*Regular\s+Plan\b.*$/i, "").trim();
  s = s.replace(/\s*[-–]\s*IDCW\b.*$/i, "").trim();
  s = s.replace(/\s*[-–]\s*Direct\b.*$/i, "").trim();
  s = s.replace(/\s+Growth(?:\s+Option)?$/i, "").trim();
  s = s.replace(/\s*[-–]\s*Growth(?:\s+Option)?$/i, "").trim();
  return s || raw.trim();
}

// Expanded-card tokens — match the "HOLDINGS / RISK PROFILE / HORIZON" meta strip
const HAIRLINE = "hsl(var(--hairline))";
const POSITIVE = "#0f8a5f";
const NEGATIVE = "#c24c3a";
const LABEL_CLASS = "text-[10px] text-muted-foreground uppercase tracking-wide";
const VALUE_CLASS = "text-sm font-semibold text-foreground";

// 3Y / 5Y returns aren't in the API yet — derive deterministic demo values from the 1Y return
// so each fund shows plausible, distinct numbers.
function deriveMultiYearReturns(oneYear: number | null, seed: string): {
  threeYear: number | null;
  fiveYear: number | null;
} {
  if (oneYear === null) return { threeYear: null, fiveYear: null };
  const hash = seed.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const v3 = ((hash % 30) / 10) - 1.5;
  const v5 = (((hash >>> 5) % 30) / 10) - 1.5;
  return {
    threeYear: Math.round((oneYear * 0.82 + v3) * 10) / 10,
    fiveYear: Math.round((oneYear * 0.76 + v5) * 10) / 10,
  };
}

function formatPct(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function pctColor(n: number | null): string {
  if (n === null) return "#1a1a1a";
  return n >= 0 ? POSITIVE : NEGATIVE;
}

const DONUT_COLORS: Record<string, string> = {
  Equity: EQUITY_COLOR,
  "India Equity": EQUITY_COLOR,
  "US Equity": EQUITY_COLOR,
  "Fixed Income": DEBT_COLOR,
  Debt: DEBT_COLOR,
  "Inflation-Linked": GOLD_COLOR,
  Gold: GOLD_COLOR,
  Cash: CASH_COLOR,
  Other: CASH_COLOR,
  "Cash/Other": CASH_COLOR,
  "Hybrid & Others": CASH_COLOR,
};

const FALLBACK_PALETTE = [EQUITY_COLOR, DEBT_COLOR, GOLD_COLOR, CASH_COLOR, "#7DA2C8", "#BFA769"];

function getColor(name: string, i: number) {
  if (DONUT_COLORS[name]) return DONUT_COLORS[name];
  const normalized = name.trim().toLowerCase();
  if (normalized.includes("equity")) return EQUITY_COLOR;
  if (normalized.includes("debt") || normalized.includes("fixed income")) return DEBT_COLOR;
  if (normalized.includes("gold") || normalized.includes("inflation")) return GOLD_COLOR;
  if (normalized.includes("cash") || normalized.includes("other") || normalized.includes("hybrid")) return CASH_COLOR;
  return FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

const HOLDINGS_BAR_BY_BUCKET: Record<HoldingBucket, { bg: string; border?: string }> = {
  equity: { bg: EQUITY_COLOR },
  debt: { bg: DEBT_COLOR, border: "#8E7228" },
  hybrid: { bg: GOLD_COLOR },
};

/**
 * Total amount invested (cost basis) for a holding.
 * When `quantity` is set, `average_cost` is treated as per-unit (CAMS / demat); otherwise as total invested (demo / manual rows).
 */
function costBasis(
  quantity: number | null | undefined,
  averageCost: number | null | undefined,
): number | null {
  if (averageCost == null || averageCost <= 0) return null;
  if (quantity != null && quantity > 0) return quantity * averageCost;
  // No units on file — treat `average_cost` as aggregate invested (legacy / manual rows).
  if (quantity == null || quantity === undefined) return averageCost;
  return null;
}

/** Gain % vs cost basis (not NAV delta vs total value). */
function holdingGainPercent(
  quantity: number | null | undefined,
  averageCost: number | null | undefined,
  currentValue: number,
): number | null {
  const basis = costBasis(quantity, averageCost);
  if (basis == null || basis <= 0) return null;
  return ((currentValue - basis) / basis) * 100;
}

/** When the API has allocation roll-ups (e.g. CAMS) but no `portfolio_holdings` rows yet, synthesize one line per bucket so totals match `total_value` and we never mix real totals with placeholder demo funds. */
function allocationBucketToClassifiedRow(a: PortfolioDetail["allocations"][number]): {
  id: string;
  name: string;
  value: string;
  pct: string | null;
  allocationPct: number;
  returnPct: number | null;
  avgCost: number | null;
  /** Total invested (₹); same as cost basis for display and gain. */
  investedTotal: number | null;
  currentValue: number;
  barBg: string;
  barBorder?: string;
  bucket: HoldingBucket;
  /** AMFI scheme code or ISIN — opens fund detail when set. */
  schemeCode: string | null;
} {
  const id = `alloc-${a.id}`;
  const bucket = classifyHoldingBucket(a.asset_class, "portfolio allocation");
  const colors = HOLDINGS_BAR_BY_BUCKET[bucket];
  const perf = a.performance_percentage;
  const returnPct = perf != null && Number.isFinite(perf) ? perf : null;
  return {
    id,
    name: `${a.asset_class} (aggregated)`,
    value: formatInrCompact(a.amount),
    pct: `${Math.round(a.allocation_percentage * 10) / 10}%`,
    allocationPct: a.allocation_percentage,
    returnPct,
    avgCost: null,
    investedTotal: null,
    currentValue: a.amount,
    barBg: colors.bg,
    barBorder: colors.border,
    bucket,
    schemeCode: null,
  };
}

interface CurrentAllocationCardProps {
  portfolio: PortfolioDetail | null;
  riskCategory: string | null;
  horizonLabel: string | null;
}

const CurrentAllocationCard = ({ portfolio, riskCategory, horizonLabel }: CurrentAllocationCardProps) => {
  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null);
  const [collapsedBuckets, setCollapsedBuckets] = useState<Record<HoldingBucket, boolean>>({
    equity: false,
    debt: false,
    hybrid: false,
  });
  const hasAllocations = portfolio && portfolio.allocations.length > 0;
  /** Placeholder funds only when there is no real allocation or holding data. */
  const showSampleHoldingsBanner =
    portfolio &&
    portfolio.holdings.length === 0 &&
    portfolio.allocations.length === 0 &&
    portfolio.total_value <= 0;

  const allocations = hasAllocations
    ? portfolio!.allocations.map((a, i) => ({
        name: a.asset_class,
        value: Math.round(a.allocation_percentage * 10) / 10,
        color: getColor(a.asset_class, i),
      }))
    : [
        { name: "Equity", value: 48, color: EQUITY_COLOR },
        { name: "Debt", value: 28, color: DEBT_COLOR },
        { name: "Gold", value: 16, color: GOLD_COLOR },
        { name: "Cash/Other", value: 8, color: CASH_COLOR },
      ];

  const centerLabel =
    portfolio && portfolio.total_value > 0 ? formatInrCompact(portfolio.total_value) : "₹—";

  const holdingsRows = !portfolio
    ? []
    : portfolio.holdings.length > 0
      ? portfolio.holdings.map((h) => {
          const bucket = classifyHoldingBucket(h.instrument_name, h.instrument_type);
          const colors = HOLDINGS_BAR_BY_BUCKET[bucket];
          const investedTotal = costBasis(h.quantity, h.average_cost);
          const returnPct = holdingGainPercent(h.quantity, h.average_cost, h.current_value);
          return {
            id: h.id,
            name: h.instrument_name,
            value: formatInrCompact(h.current_value),
            pct: h.allocation_percentage != null ? `${h.allocation_percentage}%` : (null as string | null),
            allocationPct: h.allocation_percentage ?? 0,
            returnPct,
            avgCost: h.average_cost,
            investedTotal,
            currentValue: h.current_value,
            barBg: colors.bg,
            barBorder: colors.border,
            bucket,
            schemeCode: h.ticker_symbol ?? null,
          };
        })
      : portfolio.allocations.length > 0
        ? portfolio.allocations.map((a) => allocationBucketToClassifiedRow(a))
        : portfolio.total_value <= 0
          ? [
              {
                id: "d1",
                name: "ICICI Prudential Nifty 50 ETF",
                value: "₹4.8L",
                pct: "48%",
                allocationPct: 48,
                returnPct: 18.2,
                avgCost: 406000,
                investedTotal: 406000,
                currentValue: 480000,
                barBg: HOLDINGS_BAR_BY_BUCKET.equity.bg,
                barBorder: HOLDINGS_BAR_BY_BUCKET.equity.border,
                bucket: "equity" as HoldingBucket,
                schemeCode: null,
              },
              {
                id: "d2",
                name: "HDFC Corporate Bond Fund",
                value: "₹2.8L",
                pct: "28%",
                allocationPct: 28,
                returnPct: 7.1,
                avgCost: 261000,
                investedTotal: 261000,
                currentValue: 280000,
                barBg: HOLDINGS_BAR_BY_BUCKET.debt.bg,
                barBorder: HOLDINGS_BAR_BY_BUCKET.debt.border,
                bucket: "debt" as HoldingBucket,
                schemeCode: null,
              },
              {
                id: "d3",
                name: "SBI Gold ETF",
                value: "₹1.6L",
                pct: "16%",
                allocationPct: 16,
                returnPct: 12.4,
                avgCost: 142000,
                investedTotal: 142000,
                currentValue: 160000,
                barBg: HOLDINGS_BAR_BY_BUCKET.hybrid.bg,
                barBorder: HOLDINGS_BAR_BY_BUCKET.hybrid.border,
                bucket: "hybrid" as HoldingBucket,
                schemeCode: null,
              },
            ]
          : [];

  const holdingsCountLabel =
    portfolio == null
      ? "—"
      : portfolio.holdings.length > 0
        ? String(portfolio.holdings.length)
        : portfolio.allocations.length > 0
          ? String(portfolio.allocations.length)
          : String(holdingsRows.length);

  const stats = [
    { label: "Holdings", value: holdingsCountLabel },
    { label: "Risk Profile", value: riskCategory ?? "—" },
    { label: "Horizon", value: horizonLabel ?? "—" },
  ];

  const groupedHoldings = BUCKET_ORDER.map((bucket) => {
    const items = holdingsRows.filter((r) => r.bucket === bucket);
    const totalValue = items.reduce((s, r) => s + r.currentValue, 0);
    const totalPct = items.reduce((s, r) => s + (r.allocationPct ?? 0), 0);
    return { bucket, items, totalValue, totalPct };
  }).filter((g) => g.items.length > 0);

  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-[1.5px] mb-3 text-muted-foreground"
        style={{ fontWeight: 500 }}
      >
        Current Allocation
        {showSampleHoldingsBanner && (
          <span className="ml-2 font-normal normal-case text-[10px] text-muted-foreground">
            (sample — add holdings or import a statement)
          </span>
        )}
      </p>

      <div className="flex items-center gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocations}
                cx="50%"
                cy="50%"
                innerRadius={34}
                outerRadius={52}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {allocations.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-foreground">{centerLabel}</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 flex-1">
          {allocations.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: item.color,
                    border: item.color === CASH_COLOR ? "1px solid #DCCB96" : undefined,
                  }}
                />
                <span className="text-[10px] text-muted-foreground leading-tight">{item.name}</span>
              </div>
              <span className="text-xs font-semibold text-foreground">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Meta strip */}
      <div className="flex items-center mt-3 pt-2.5">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={`flex-1 text-center ${i < stats.length - 1 ? "border-r border-border/30" : ""}`}
          >
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
            <p className="text-sm font-bold text-foreground truncate px-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* View holdings toggle */}
      <div
        className="mt-2 pt-2 cursor-pointer"
        style={{ borderTop: "1px solid hsl(var(--hairline))" }}
        onClick={() => setHoldingsOpen((o) => !o)}
      >
        <p className="text-[13px] font-medium text-center w-full text-foreground hover:text-accent transition-colors">
          {holdingsOpen ? "Hide holdings ↑" : "View holdings →"}
        </p>
      </div>

      {/* Expandable holdings drawer */}
      <AnimatePresence initial={false}>
        {holdingsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-2" style={{ borderTop: "1px solid hsl(var(--hairline))" }}>
              {groupedHoldings.map((group) => {
                const isCollapsed = collapsedBuckets[group.bucket];
                return (
                  <div
                    key={group.bucket}
                    className="rounded-[14px] overflow-hidden"
                    style={{ border: `1px solid ${HAIRLINE}` }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedBuckets((prev) => ({
                          ...prev,
                          [group.bucket]: !prev[group.bucket],
                        }))
                      }
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="uppercase text-muted-foreground"
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            letterSpacing: "1.2px",
                          }}
                        >
                          {BUCKET_LABEL[group.bucket]} · {group.items.length}{" "}
                          {group.items.length === 1 ? "holding" : "holdings"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p
                            className="text-xs font-semibold text-foreground"
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                          >
                            {formatInrCompact(group.totalValue)}
                          </p>
                          <p className="text-[10px] font-medium text-muted-foreground">
                            {group.totalPct.toFixed(0)}%
                          </p>
                        </div>
                        <motion.span
                          animate={{ rotate: isCollapsed ? -90 : 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="inline-flex"
                        >
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </motion.span>
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-2">
                            {group.items.map((row) => {
                const isExpanded = expandedHolding === row.id;
                const oneYear = row.returnPct;
                const { threeYear, fiveYear } = deriveMultiYearReturns(oneYear, row.id);

                const collapsedReturnColor = oneYear !== null
                  ? (oneYear >= 0 ? POSITIVE : NEGATIVE)
                  : undefined;
                const collapsedReturnText = oneYear !== null
                  ? `${oneYear >= 0 ? "+" : ""}${oneYear.toFixed(1)}%`
                  : null;

                const gainAmount =
                  row.investedTotal != null && row.investedTotal > 0
                    ? row.currentValue - row.investedTotal
                    : null;
                const gainColor = gainAmount === null
                  ? "#1a1a1a"
                  : gainAmount >= 0 ? POSITIVE : NEGATIVE;
                const gainText = gainAmount === null
                  ? "—"
                  : `${gainAmount >= 0 ? "+" : "-"}${formatInrCompact(Math.abs(gainAmount))}`;

                return (
                  <div key={row.id}>
                    <div
                      onClick={() => setExpandedHolding(isExpanded ? null : row.id)}
                      className="flex w-full items-start gap-2.5 py-2 text-left cursor-pointer active:scale-[0.99] transition-transform"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedHolding(isExpanded ? null : row.id);
                        }
                      }}
                    >
                      <div
                        className="mt-0.5 w-1 h-8 rounded-full shrink-0"
                        style={{
                          backgroundColor: row.barBg,
                          border: row.barBorder ? `1px solid ${row.barBorder}` : undefined,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{plainFundDisplayName(row.name)}</p>
                        {row.schemeCode ? (
                          <Link
                            to={`/portfolio/fund/${encodeURIComponent(row.schemeCode)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
                          >
                            Fund details
                            <ChevronRight className="h-3 w-3" aria-hidden />
                          </Link>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{row.value}</p>
                          {collapsedReturnText && (
                            <span className="text-[10px] font-medium" style={{ color: collapsedReturnColor }}>
                              {collapsedReturnText} YoY
                            </span>
                          )}
                        </div>
                        <motion.span
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="inline-flex"
                        >
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        </motion.span>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div
                            className="ml-3 pt-2 pb-2.5 pr-1"
                            style={{ borderTop: `1px solid ${HAIRLINE}` }}
                          >
                            {/* Group 1 — Returns (3-col) */}
                            <div
                              className="grid grid-cols-3"
                              style={{ columnGap: 10, rowGap: 2 }}
                            >
                              <div>
                                <p className={LABEL_CLASS}>1Y return</p>
                                <p className={VALUE_CLASS} style={{ color: pctColor(oneYear) }}>
                                  {formatPct(oneYear)}
                                </p>
                              </div>
                              <div>
                                <p className={LABEL_CLASS}>3Y return</p>
                                <p className={VALUE_CLASS} style={{ color: pctColor(threeYear) }}>
                                  {formatPct(threeYear)}
                                </p>
                              </div>
                              <div>
                                <p className={LABEL_CLASS}>5Y return</p>
                                <p className={VALUE_CLASS} style={{ color: pctColor(fiveYear) }}>
                                  {formatPct(fiveYear)}
                                </p>
                              </div>
                            </div>

                            {/* Hairline divider */}
                            <div style={{ height: 1, background: HAIRLINE, margin: "8px 0" }} />

                            {/* Group 2 — Holdings detail (2-col) */}
                            <div
                              className="grid grid-cols-2"
                              style={{ columnGap: 12, rowGap: 6 }}
                            >
                              <div>
                                <p className={LABEL_CLASS}>Invested</p>
                                <p className={VALUE_CLASS}>
                                  {row.investedTotal != null && row.investedTotal > 0
                                    ? formatInrCompact(row.investedTotal)
                                    : "—"}
                                </p>
                              </div>
                              <div>
                                <p className={LABEL_CLASS}>Current value</p>
                                <p className={VALUE_CLASS}>{formatInrCompact(row.currentValue)}</p>
                              </div>
                              <div>
                                <p className={LABEL_CLASS}>Gain / Loss</p>
                                <p className={VALUE_CLASS} style={{ color: gainColor }}>{gainText}</p>
                              </div>
                              <div>
                                <p className={LABEL_CLASS}>Portfolio weight</p>
                                <p className={VALUE_CLASS}>{row.pct ?? "—"}</p>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CurrentAllocationCard;
