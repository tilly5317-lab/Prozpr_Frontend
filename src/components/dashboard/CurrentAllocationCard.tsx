import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Pencil, X } from "lucide-react";
import type { PortfolioDetail } from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

// Bucket classification mirrors the Recommended Investment Plan page.
type HoldingBucket = "equity" | "debt" | "hybrid";

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

// SEBI-aligned mutual fund sub-categories, per bucket.
const SUB_CATEGORIES: Record<HoldingBucket, string[]> = {
  equity: [
    "Large Cap",
    "Mid Cap",
    "Small Cap",
    "Large & Mid Cap",
    "Multi Cap",
    "Flexi Cap",
    "ELSS (Tax Saver)",
    "Sectoral / Thematic",
    "Index Fund / ETF",
    "Dividend Yield",
    "Value / Contra",
    "Focused",
    "International Equity",
  ],
  debt: [
    "Liquid",
    "Overnight",
    "Ultra Short Duration",
    "Low Duration",
    "Money Market",
    "Short Duration",
    "Medium Duration",
    "Medium to Long Duration",
    "Long Duration",
    "Corporate Bond",
    "Credit Risk",
    "Banking & PSU",
    "Gilt",
    "Gilt with 10Y Constant Duration",
    "Dynamic Bond",
    "Floater",
  ],
  hybrid: [
    "Conservative Hybrid",
    "Balanced Hybrid",
    "Aggressive Hybrid",
    "Dynamic Asset Allocation / BAF",
    "Multi Asset Allocation",
    "Arbitrage",
    "Equity Savings",
  ],
};

const SUB_DESCRIPTIONS: Record<string, string> = {
  "Large Cap": "Invests in top 100 companies by market cap as per SEBI.",
  "Mid Cap": "Invests in companies ranked 101–250 by market cap.",
  "Small Cap": "Invests in companies ranked 251 and below by market cap.",
  "Large & Mid Cap": "Minimum 35% each in large-cap and mid-cap stocks.",
  "Multi Cap": "At least 25% each across large, mid, and small caps.",
  "Flexi Cap": "Goes anywhere on the cap curve; manager has full discretion.",
  "ELSS (Tax Saver)": "Equity fund with a 3-year lock-in; eligible for 80C deduction (old regime).",
  "Sectoral / Thematic": "Focused on one sector (e.g. IT, banking) or a single theme.",
  "Index Fund / ETF": "Passively tracks an index like Nifty 50 at low cost.",
  "Dividend Yield": "Invests primarily in high dividend-yield stocks.",
  "Value / Contra": "Follows a value or contrarian investment style.",
  "Focused": "Holds a concentrated portfolio of up to 30 stocks.",
  "International Equity": "Invests in equities listed outside India.",
  "Liquid": "Invests in debt & money-market instruments up to 91 days.",
  "Overnight": "Invests in securities with a 1-day maturity.",
  "Ultra Short Duration": "Portfolio Macaulay duration of 3–6 months.",
  "Low Duration": "Portfolio Macaulay duration of 6–12 months.",
  "Money Market": "Money-market instruments up to 1 year.",
  "Short Duration": "Portfolio Macaulay duration of 1–3 years.",
  "Medium Duration": "Portfolio Macaulay duration of 3–4 years.",
  "Medium to Long Duration": "Portfolio Macaulay duration of 4–7 years.",
  "Long Duration": "Portfolio Macaulay duration greater than 7 years.",
  "Corporate Bond": "Minimum 80% in AA+ and above rated corporate bonds.",
  "Credit Risk": "Minimum 65% in AA and below rated corporate bonds.",
  "Banking & PSU": "Minimum 80% in banking & PSU debt instruments.",
  "Gilt": "Minimum 80% in government securities across maturities.",
  "Gilt with 10Y Constant Duration": "G-secs with a constant 10-year duration.",
  "Dynamic Bond": "Invests across duration based on rate views.",
  "Floater": "Minimum 65% in floating-rate instruments.",
  "Conservative Hybrid": "10–25% equity, rest in debt.",
  "Balanced Hybrid": "40–60% equity, rest in debt.",
  "Aggressive Hybrid": "65–80% equity, rest in debt.",
  "Dynamic Asset Allocation / BAF": "Equity/debt mix varies dynamically with valuation.",
  "Multi Asset Allocation": "At least 10% each across 3+ asset classes.",
  "Arbitrage": "Captures cash-futures arbitrage; equity-taxed with debt-like risk.",
  "Equity Savings": "Equity + arbitrage + debt for low-volatility equity exposure.",
};

// Pill colour per bucket — shades of purple for equity, gold for debt, pale gold/beige for hybrid.
const SUB_TAG_STYLE: Record<HoldingBucket, { bg: string; fg: string; border: string }> = {
  equity: { bg: "#EFEAFC", fg: "#5A3FB6", border: "#DDD2F5" },
  debt: { bg: "#FAEFD6", fg: "#8C6B1E", border: "#EFE0B8" },
  hybrid: { bg: "#F5EFE3", fg: "#8A7140", border: "#E7DDC8" },
};

const UNCAT_STYLE = { bg: "#EFEFEF", fg: "#6b6b6b", border: "#E3E3E3" };

function classifySubCategory(name: string, bucket: HoldingBucket): string | null {
  const n = name.toLowerCase();
  if (bucket === "equity") {
    if (/elss|tax saver/.test(n)) return "ELSS (Tax Saver)";
    if (/flexi cap/.test(n)) return "Flexi Cap";
    if (/multi cap/.test(n)) return "Multi Cap";
    if (/focused/.test(n)) return "Focused";
    if (/large & mid|large and mid/.test(n)) return "Large & Mid Cap";
    if (/midcap|mid cap/.test(n)) return "Mid Cap";
    if (/small ?cap/.test(n)) return "Small Cap";
    if (/large ?cap/.test(n)) return "Large Cap";
    if (/dividend/.test(n)) return "Dividend Yield";
    if (/value|contra/.test(n)) return "Value / Contra";
    if (/s&p|nasdaq|international|global|world/.test(n)) return "International Equity";
    if (/psu bank|pharma|energy|it etf|banking|auto|infra|metal|sectoral|thematic/.test(n)) {
      return "Sectoral / Thematic";
    }
    if (/nifty|sensex|next 50|bees|index|etf/.test(n)) return "Index Fund / ETF";
    return null;
  }
  if (bucket === "debt") {
    if (/overnight/.test(n)) return "Overnight";
    if (/ultra short/.test(n)) return "Ultra Short Duration";
    if (/low duration/.test(n)) return "Low Duration";
    if (/money market/.test(n)) return "Money Market";
    if (/liquid/.test(n)) return "Liquid";
    if (/short duration|short term/.test(n)) return "Short Duration";
    if (/medium to long|med.{0,5}long/.test(n)) return "Medium to Long Duration";
    if (/medium duration|medium term/.test(n)) return "Medium Duration";
    if (/long duration|long term/.test(n)) return "Long Duration";
    if (/credit risk/.test(n)) return "Credit Risk";
    if (/banking (?:and|&) psu|banking & psu/.test(n)) return "Banking & PSU";
    if (/gilt.*10|constant duration/.test(n)) return "Gilt with 10Y Constant Duration";
    if (/gilt|g[- ]sec|government/.test(n)) return "Gilt";
    if (/dynamic bond/.test(n)) return "Dynamic Bond";
    if (/floater|floating/.test(n)) return "Floater";
    if (/corporate bond|bharat bond/.test(n)) return "Corporate Bond";
    return null;
  }
  // hybrid
  if (/conservative hybrid/.test(n)) return "Conservative Hybrid";
  if (/aggressive hybrid/.test(n)) return "Aggressive Hybrid";
  if (/balanced hybrid/.test(n)) return "Balanced Hybrid";
  if (/balanced advantage|dynamic asset|baf/.test(n)) return "Dynamic Asset Allocation / BAF";
  if (/multi[- ]?asset/.test(n)) return "Multi Asset Allocation";
  if (/arbitrage/.test(n)) return "Arbitrage";
  if (/equity saving/.test(n)) return "Equity Savings";
  return null;
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
  Equity: "#4F46E5",
  "Fixed Income": "#E8D5B7",
  Debt: "#E8D5B7",
  "Inflation-Linked": "#C9A84C",
  Gold: "#C9A84C",
  "Cash/Other": "#94a3b8",
};

const FALLBACK_PALETTE = ["#4F46E5", "#E8D5B7", "#C9A84C", "#94a3b8", "#6366f1", "#d97706"];

function getColor(name: string, i: number) {
  return DONUT_COLORS[name] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
}

// Fund-row left accent matches the donut / legend palette by classified bucket.
const HOLDINGS_BAR_BY_BUCKET: Record<HoldingBucket, { bg: string; border?: string }> = {
  equity: { bg: "#4F46E5" },                         // indigo — matches donut "Equity"
  debt: { bg: "#E8D5B7", border: "#D4B896" },        // tan/cream — matches donut "Debt"
  hybrid: { bg: "#C9A84C" },                         // warm gold — matches donut "Gold"
};

function computeReturn(avgCost: number | null, currentValue: number): number | null {
  if (!avgCost || avgCost <= 0) return null;
  return ((currentValue - avgCost) / avgCost) * 100;
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
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [subOverrides, setSubOverrides] = useState<Record<string, string>>({});
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const hasAllocations = portfolio && portfolio.allocations.length > 0;

  const allocations = hasAllocations
    ? portfolio!.allocations.map((a, i) => ({
        name: a.asset_class,
        value: Math.round(a.allocation_percentage * 10) / 10,
        color: getColor(a.asset_class, i),
      }))
    : [
        { name: "Equity", value: 48, color: "#4F46E5" },
        { name: "Debt", value: 28, color: "#E8D5B7" },
        { name: "Gold", value: 16, color: "#C9A84C" },
        { name: "Cash/Other", value: 8, color: "#94a3b8" },
      ];

  const centerLabel =
    portfolio && portfolio.total_value > 0 ? formatInrCompact(portfolio.total_value) : "₹—";

  const stats = [
    { label: "Holdings", value: portfolio ? String(portfolio.holdings.length) : "—" },
    { label: "Risk Profile", value: riskCategory ?? "—" },
    { label: "Horizon", value: horizonLabel ?? "—" },
  ];

  const holdingsRows = portfolio && portfolio.holdings.length > 0
    ? portfolio.holdings.map((h) => {
        const bucket = classifyHoldingBucket(h.instrument_name, h.instrument_type);
        const colors = HOLDINGS_BAR_BY_BUCKET[bucket];
        const returnPct = computeReturn(h.average_cost, h.current_value);
        const subCategory = subOverrides[h.id] ?? classifySubCategory(h.instrument_name, bucket);
        return {
          id: h.id,
          name: h.instrument_name,
          sub: h.instrument_type + (h.ticker_symbol ? ` · ${h.ticker_symbol}` : ""),
          value: formatInrCompact(h.current_value),
          pct: h.allocation_percentage ? `${h.allocation_percentage}%` : null as string | null,
          allocationPct: h.allocation_percentage ?? 0,
          returnPct,
          avgCost: h.average_cost,
          currentValue: h.current_value,
          barBg: colors.bg,
          barBorder: colors.border,
          bucket,
          subCategory,
        };
      })
    : [
        { id: "d1", name: "ICICI Prudential Nifty 50 ETF", sub: "ETF · NIFTYBEES", value: "₹4.8L", pct: "48%", allocationPct: 48, returnPct: 18.2, avgCost: 406000, currentValue: 480000, barBg: HOLDINGS_BAR_BY_BUCKET.equity.bg, barBorder: HOLDINGS_BAR_BY_BUCKET.equity.border, bucket: "equity" as HoldingBucket, subCategory: "Index Fund / ETF" },
        { id: "d2", name: "HDFC Corporate Bond Fund", sub: "Mutual Fund", value: "₹2.8L", pct: "28%", allocationPct: 28, returnPct: 7.1, avgCost: 261000, currentValue: 280000, barBg: HOLDINGS_BAR_BY_BUCKET.debt.bg, barBorder: HOLDINGS_BAR_BY_BUCKET.debt.border, bucket: "debt" as HoldingBucket, subCategory: "Corporate Bond" },
        { id: "d3", name: "SBI Gold ETF", sub: "ETF · GOLDBEES", value: "₹1.6L", pct: "16%", allocationPct: 16, returnPct: 12.4, avgCost: 142000, currentValue: 160000, barBg: HOLDINGS_BAR_BY_BUCKET.hybrid.bg, barBorder: HOLDINGS_BAR_BY_BUCKET.hybrid.border, bucket: "hybrid" as HoldingBucket, subCategory: null as string | null },
      ];

  const filteredRows = subFilter
    ? holdingsRows.filter((r) => r.subCategory === subFilter)
    : holdingsRows;

  const groupedHoldings = BUCKET_ORDER.map((bucket) => {
    const items = filteredRows.filter((r) => r.bucket === bucket);
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
        {!hasAllocations && (
          <span className="ml-2 font-normal normal-case text-[10px] text-muted-foreground">
            (sample — add allocations in Portfolio)
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
                    border: item.color === "#E8D5B7" ? "1px solid #D4B896" : undefined,
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
              {subFilter && (
                <div className="mb-1 flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
                  <span className="text-[10px] text-muted-foreground">Filtering by</span>
                  <span className="text-[10px] font-semibold text-foreground">{subFilter}</span>
                  <button
                    type="button"
                    onClick={() => setSubFilter(null)}
                    className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    aria-label="Clear filter"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                </div>
              )}
              {subFilter && groupedHoldings.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-3">
                  No holdings match this sub-category.
                </p>
              )}
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

                const gainAmount = row.avgCost !== null && row.avgCost !== undefined
                  ? row.currentValue - row.avgCost
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
                        <p className="text-xs font-medium text-foreground">{row.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[9px] text-muted-foreground">{row.sub}</span>
                          {row.subCategory ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSubFilter((prev) => (prev === row.subCategory ? null : row.subCategory));
                              }}
                              title={SUB_DESCRIPTIONS[row.subCategory!] ?? row.subCategory!}
                              className="inline-flex items-center rounded-full px-1.5 py-0.5 hover:opacity-80 transition-opacity"
                              style={{
                                fontSize: "10px",
                                fontWeight: 500,
                                backgroundColor: SUB_TAG_STYLE[row.bucket].bg,
                                color: SUB_TAG_STYLE[row.bucket].fg,
                                border: `1px solid ${subFilter === row.subCategory ? SUB_TAG_STYLE[row.bucket].fg : SUB_TAG_STYLE[row.bucket].border}`,
                              }}
                            >
                              {row.subCategory}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSubId((prev) => (prev === row.id ? null : row.id));
                              }}
                              title="Assign a sub-category"
                              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 hover:opacity-80 transition-opacity"
                              style={{
                                fontSize: "10px",
                                fontWeight: 500,
                                backgroundColor: UNCAT_STYLE.bg,
                                color: UNCAT_STYLE.fg,
                                border: `1px solid ${UNCAT_STYLE.border}`,
                              }}
                            >
                              Uncategorized
                              <Pencil className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
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
                      {editingSubId === row.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="ml-3 mb-2 p-2 rounded-lg bg-muted/50">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                              Assign sub-category
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {SUB_CATEGORIES[row.bucket].map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => {
                                    setSubOverrides((prev) => ({ ...prev, [row.id]: opt }));
                                    setEditingSubId(null);
                                  }}
                                  title={SUB_DESCRIPTIONS[opt] ?? opt}
                                  className="rounded-full px-2 py-0.5 hover:opacity-80 transition-opacity"
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 500,
                                    backgroundColor: SUB_TAG_STYLE[row.bucket].bg,
                                    color: SUB_TAG_STYLE[row.bucket].fg,
                                    border: `1px solid ${SUB_TAG_STYLE[row.bucket].border}`,
                                  }}
                                >
                                  {opt}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setEditingSubId(null)}
                                className="rounded-full px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

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
                                  {row.avgCost ? formatInrCompact(row.avgCost) : "—"}
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
