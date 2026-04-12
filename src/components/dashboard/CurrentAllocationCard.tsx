import { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
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
};

interface CurrentAllocationCardProps {
  portfolio: PortfolioDetail | null;
  riskCategory: string | null;
  horizonLabel: string | null;
}

const CurrentAllocationCard = ({ portfolio, riskCategory, horizonLabel }: CurrentAllocationCardProps) => {
  const [holdingsOpen, setHoldingsOpen] = useState(false);
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

  // Build holdings rows from portfolio or demo
  const holdingsRows = portfolio && portfolio.holdings.length > 0
    ? portfolio.holdings.map((h) => {
        const colors = HOLDINGS_BAR_COLORS[h.instrument_type] ?? HOLDINGS_BAR_COLORS["Equity"];
        return {
          name: h.instrument_name,
          sub: h.instrument_type + (h.ticker_symbol ? ` · ${h.ticker_symbol}` : ""),
          value: formatInrCompact(h.current_value),
          pct: null as string | null,
          barBg: colors!.bg,
          barBorder: colors!.border,
        };
      })
    : [
        { name: "Equity", sub: "Large & Mid Cap", value: "₹4.8L", pct: "48%", barBg: "#4F46E5", barBorder: undefined },
        { name: "Debt", sub: "Govt & Corp Bonds", value: "₹2.8L", pct: "28%", barBg: "#E8D5B7", barBorder: "#D4B896" },
        { name: "Gold", sub: "Sovereign Gold Bond", value: "₹1.6L", pct: "16%", barBg: "#C9A84C", barBorder: undefined },
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
              {holdingsRows.map((row, i) => (
                <div key={i} className="flex items-center gap-2.5 py-2">
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
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-foreground">{row.value}</p>
                    {row.pct && (
                      <span className="text-[9px] text-muted-foreground">{row.pct}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CurrentAllocationCard;
