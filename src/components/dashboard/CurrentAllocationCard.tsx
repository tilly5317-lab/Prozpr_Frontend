import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PortfolioDetail } from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

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

const HOLDINGS_BAR_COLORS: Record<string, { bg: string; border?: string }> = {
  Equity: { bg: "#4F46E5" },
  Debt: { bg: "#E8D5B7", border: "#D4B896" },
  Gold: { bg: "#C9A84C" },
  "Mutual Fund": { bg: "#4F46E5" },
  ETF: { bg: "#C9A84C" },
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
        const colors = HOLDINGS_BAR_COLORS[h.instrument_type] ?? HOLDINGS_BAR_COLORS["Equity"];
        const returnPct = computeReturn(h.average_cost, h.current_value);
        return {
          id: h.id,
          name: h.instrument_name,
          sub: h.instrument_type + (h.ticker_symbol ? ` · ${h.ticker_symbol}` : ""),
          value: formatInrCompact(h.current_value),
          pct: h.allocation_percentage ? `${h.allocation_percentage}%` : null as string | null,
          returnPct,
          avgCost: h.average_cost,
          currentValue: h.current_value,
          barBg: colors!.bg,
          barBorder: colors!.border,
        };
      })
    : [
        { id: "d1", name: "Equity", sub: "Large & Mid Cap", value: "₹4.8L", pct: "48%", returnPct: 18.2, avgCost: 406000, currentValue: 480000, barBg: "#4F46E5", barBorder: undefined },
        { id: "d2", name: "Debt", sub: "Govt & Corp Bonds", value: "₹2.8L", pct: "28%", returnPct: 7.1, avgCost: 261000, currentValue: 280000, barBg: "#E8D5B7", barBorder: "#D4B896" },
        { id: "d3", name: "Gold", sub: "Sovereign Gold Bond", value: "₹1.6L", pct: "16%", returnPct: 12.4, avgCost: 142000, currentValue: 160000, barBg: "#C9A84C", barBorder: undefined },
      ];

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[1.5px] mb-3" style={{ color: "#b0b0b0", fontWeight: 500 }}>
        Current Allocation
        {!hasAllocations && (
          <span className="ml-2 font-normal normal-case text-[10px]" style={{ color: "#b0b0b0" }}>
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
        style={{ borderTop: "1px solid #f5f5f5" }}
        onClick={() => setHoldingsOpen((o) => !o)}
      >
        <p className="text-[13px] font-medium text-center w-full" style={{ color: "#1a1a2e" }}>
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
            <div className="pt-2" style={{ borderTop: "1px solid #f5f5f5" }}>
              {holdingsRows.map((row) => {
                const isExpanded = expandedHolding === row.id;
                const returnColor = row.returnPct !== null
                  ? row.returnPct >= 0 ? "hsl(142 71% 35%)" : "hsl(0 84% 50%)"
                  : undefined;
                const returnText = row.returnPct !== null
                  ? `${row.returnPct >= 0 ? "+" : ""}${row.returnPct.toFixed(1)}%`
                  : null;

                return (
                  <div key={row.id}>
                    <button
                      onClick={() => setExpandedHolding(isExpanded ? null : row.id)}
                      className="flex w-full items-center gap-2.5 py-2 text-left active:scale-[0.99] transition-transform"
                    >
                      <div
                        className="w-1 h-8 rounded-full shrink-0"
                        style={{
                          backgroundColor: row.barBg,
                          border: row.barBorder ? `1px solid ${row.barBorder}` : undefined,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{row.name}</p>
                        <p className="text-[9px] text-muted-foreground">{row.sub}</p>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{row.value}</p>
                          {returnText && (
                            <span className="text-[10px] font-medium" style={{ color: returnColor }}>
                              {returnText} YoY
                            </span>
                          )}
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="ml-6 mb-3 rounded-lg bg-muted/30 p-3 space-y-2">
                            {row.returnPct !== null && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">1Y Performance</span>
                                <span className="font-medium" style={{ color: returnColor }}>
                                  {returnText}
                                </span>
                              </div>
                            )}
                            {row.avgCost && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Invested</span>
                                <span className="font-medium text-foreground">{formatInrCompact(row.avgCost)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[11px]">
                              <span className="text-muted-foreground">Gain / Loss</span>
                              <span className="font-medium" style={{ color: returnColor }}>
                                {row.currentValue - (row.avgCost || 0) >= 0 ? "+" : ""}
                                {formatInrCompact(Math.abs(row.currentValue - (row.avgCost || 0)))}
                              </span>
                            </div>
                            {row.pct && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Portfolio weight</span>
                                <span className="font-medium text-foreground">{row.pct}</span>
                              </div>
                            )}
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
