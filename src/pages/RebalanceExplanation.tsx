import { type CSSProperties, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownLeft, ArrowUpRight, Star, X } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import BottomNav from "@/components/BottomNav";

type DriftRow = {
  key: string;
  label: string;
  color: string;
  current: number;
  target: number;
  amountText: string;
};

type Trade = {
  id: string;
  type: "BUY" | "SELL";
  amount: string;
  subtitle: string;
  fund: {
    name: string;
    category: string;
    amc: string;
    benchmark: string;
    risk: "Low" | "Moderate" | "High";
    stars: number;
    aum: string;
    nav: string;
    expenseRatio: string;
    returns1Y: string;
    returns3Y: string;
    rationale: string;
    series: { label: string; fund: number; benchmark: number }[];
  };
};

const driftRows: DriftRow[] = [
  { key: "equity", label: "Equity", color: "#3B6FA8", current: 54, target: 48, amountText: "6% overweight · +₹75K" },
  { key: "debt", label: "Debt", color: "#A8872F", current: 24, target: 28, amountText: "4% underweight · -₹50K" },
  { key: "gold", label: "Gold", color: "#E0B84A", current: 14, target: 16, amountText: "2% underweight · -₹25K" },
  { key: "cash", label: "Cash", color: "#F1DA9B", current: 8, target: 8, amountText: "On target" },
];

const trades: Trade[] = [
  {
    id: "parag-parikh",
    type: "SELL",
    amount: "₹45,000",
    subtitle: "Trim equity overweight",
    fund: {
      name: "Parag Parikh Flexi Cap",
      category: "Flexi Cap Equity",
      amc: "PPFAS",
      benchmark: "Nifty 500 TRI",
      risk: "Moderate",
      stars: 5,
      aum: "₹69,400 Cr",
      nav: "₹84.21",
      expenseRatio: "0.64%",
      returns1Y: "+19.4%",
      returns3Y: "+18.2%",
      rationale: "High overlap with existing equity sleeve and currently above target weight. Partial trim helps normalize equity risk without full exit.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 19.4, benchmark: 15.1 },
        { label: "3Y", fund: 38.2, benchmark: 30.5 },
        { label: "5Y", fund: 82.7, benchmark: 63.1 },
      ],
    },
  },
  {
    id: "mirae-large-cap",
    type: "SELL",
    amount: "₹30,000",
    subtitle: "Trim equity overweight",
    fund: {
      name: "Mirae Large Cap",
      category: "Large Cap Equity",
      amc: "Mirae Asset",
      benchmark: "Nifty 100 TRI",
      risk: "Moderate",
      stars: 4,
      aum: "₹41,250 Cr",
      nav: "₹122.47",
      expenseRatio: "0.52%",
      returns1Y: "+16.8%",
      returns3Y: "+14.1%",
      rationale: "Large-cap bucket is overweight against target. This sell keeps core equity exposure while reducing concentration.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 16.8, benchmark: 13.3 },
        { label: "3Y", fund: 31.2, benchmark: 27.5 },
        { label: "5Y", fund: 58.6, benchmark: 49.2 },
      ],
    },
  },
  {
    id: "icici-corp-bond",
    type: "BUY",
    amount: "₹50,000",
    subtitle: "Restore debt allocation",
    fund: {
      name: "ICICI Prudential Corp Bond",
      category: "Corporate Bond",
      amc: "ICICI Prudential",
      benchmark: "CRISIL Corporate Bond A-II",
      risk: "Low",
      stars: 5,
      aum: "₹29,800 Cr",
      nav: "₹28.92",
      expenseRatio: "0.25%",
      returns1Y: "+7.8%",
      returns3Y: "+7.4%",
      rationale: "Debt is under target. This buy stabilizes drawdown risk and improves balance between growth and preservation buckets.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 7.8, benchmark: 7.2 },
        { label: "3Y", fund: 15.6, benchmark: 14.5 },
        { label: "5Y", fund: 32.4, benchmark: 29.8 },
      ],
    },
  },
  {
    id: "sgb-series-x",
    type: "BUY",
    amount: "₹25,000",
    subtitle: "Restore gold allocation",
    fund: {
      name: "SGB Series X (Nov '24)",
      category: "Sovereign Gold Bond",
      amc: "RBI",
      benchmark: "Domestic Gold Spot",
      risk: "Moderate",
      stars: 4,
      aum: "Govt issue",
      nav: "Issue linked",
      expenseRatio: "Nil",
      returns1Y: "+12.4%",
      returns3Y: "+11.1%",
      rationale: "Gold allocation is below target and helps improve macro hedge coverage during equity volatility windows.",
      series: [
        { label: "Start", fund: 0, benchmark: 0 },
        { label: "1Y", fund: 12.4, benchmark: 11.8 },
        { label: "3Y", fund: 24.7, benchmark: 22.9 },
        { label: "5Y", fund: 46.1, benchmark: 42.4 },
      ],
    },
  },
];

const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, #131722 0%, #11151F 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
};

const RebalanceExplanation = () => {
  const navigate = useNavigate();
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  const riskBadge = useMemo(() => {
    if (!selectedTrade) return { bg: "#24324A", fg: "#9DB7E6" };
    if (selectedTrade.fund.risk === "Low") return { bg: "#163128", fg: "#5FD3A2" };
    if (selectedTrade.fund.risk === "High") return { bg: "#3A1E20", fg: "#F09595" };
    return { bg: "#3D321C", fg: "#EACB73" };
  }, [selectedTrade]);

  return (
    <div className="mobile-container min-h-screen pb-24 text-white" style={{ background: "#090B11" }}>
      <div className="px-4 pt-8 pb-2 space-y-3">
        <section style={cardStyle} className="px-4 py-4">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-[#E8EDF9]">Your mix has drifted.</h1>
          <p className="mt-3 text-[12px] leading-5 text-[#A6B0C6]">
            Equities rallied 9% this quarter. Here's how to glide back to your target without selling more than you need to.
          </p>
        </section>

        <section style={cardStyle} className="px-4 py-4">
          <p className="text-[11px] tracking-[0.16em] uppercase text-[#7E879C]">Current vs target</p>
          <div className="mt-4 space-y-4">
            {driftRows.map((row) => {
              const drift = row.current - row.target;
              const total = Math.max(row.current, row.target);
              const currentWidth = total > 0 ? (row.current / total) * 100 : 0;
              return (
                <div key={row.key}>
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="text-[#E7ECF8]">{row.label}</span>
                    </div>
                    <span className="font-medium text-[#D2D9E8]">{row.current}% → {row.target}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-[#1A2233]">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${currentWidth}%`,
                        background: row.color,
                        boxShadow: `0 0 14px ${row.color}55`,
                      }}
                    />
                  </div>
                  <p
                    className="mt-1 text-[11px]"
                    style={{
                      color: drift > 0 ? "#FF6A5B" : drift < 0 ? "#45CF8C" : "#9DA8BF",
                    }}
                  >
                    {row.amountText}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section style={cardStyle} className="px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] tracking-[0.16em] uppercase text-[#7E879C]">Proposed trades</p>
            <p className="text-[11px] text-[#34D39A]">Tax impact · ₹0 LTCG</p>
          </div>
          <div className="mt-3 divide-y divide-white/10">
            {trades.map((trade) => (
              <button
                key={trade.id}
                type="button"
                onClick={() => setSelectedTrade(trade)}
                className="w-full py-3 text-left flex items-center gap-3"
              >
                <span
                  className="px-2 py-1 rounded-md text-[11px] font-semibold tracking-wide"
                  style={{
                    backgroundColor: trade.type === "SELL" ? "#3A1717" : "#113126",
                    color: trade.type === "SELL" ? "#FF6559" : "#3FD998",
                  }}
                >
                  {trade.type}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-tight font-medium text-[#EAF0FF] truncate">{trade.fund.name}</p>
                  <p className="text-[11px] text-[#8E99B1]">{trade.subtitle}</p>
                </div>
                <p className="text-[15px] leading-none font-semibold text-[#EEF3FF]">{trade.amount}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-[16px] px-4 py-4" style={{ background: "#EEE8D8" }}>
          <p className="text-[10px] tracking-[0.16em] uppercase text-[#6B644F]">Why now</p>
          <p className="mt-2 text-[12px] leading-5 text-[#6D654F]">
            I've picked units with lowest capital gains to maximize tax exemption. Rebalance now before earnings season shifts weights further.
          </p>
        </section>

        <div className="flex items-center justify-center gap-2 pb-20">
          <button
            type="button"
            onClick={() => navigate("/discovery")}
            className="rounded-full border border-white/20 px-5 py-2 text-[12px] text-[#E6ECFA] bg-[#0E1320]"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => navigate("/execute")}
            className="rounded-full border border-white/20 px-5 py-2 text-[12px] text-[#E6ECFA] bg-[#0E1320]"
          >
            Proceed →
          </button>
        </div>
      </div>

      <AnimatePresence>
        {selectedTrade && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]"
              onClick={() => setSelectedTrade(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.35 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 100 || info.velocity.y > 550) setSelectedTrade(null);
              }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl text-white"
              style={{ background: "#121723", maxHeight: "86dvh", display: "flex", flexDirection: "column" }}
            >
              <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                <button onClick={() => setSelectedTrade(null)} className="h-1.5 w-12 rounded-full bg-white/20 mx-auto" />
                <button onClick={() => setSelectedTrade(null)} className="text-[#9CA6BF] -ml-3">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto px-5 pb-5">
                <div className="flex items-center gap-2">
                  {selectedTrade.type === "BUY" ? (
                    <ArrowDownLeft className="h-4 w-4 text-[#3FD998]" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4 text-[#FF6559]" />
                  )}
                  <p className="text-[11px] tracking-[0.12em] uppercase text-[#8E98B0]">{selectedTrade.type} trade details</p>
                </div>
                <h3 className="mt-2 text-[16px] font-semibold text-[#ECF1FF]">{selectedTrade.fund.name}</h3>
                <p className="text-[12px] text-[#97A3BE]">{selectedTrade.fund.amc} · {selectedTrade.fund.category} · {selectedTrade.fund.benchmark}</p>
                <div className="mt-3 flex items-center gap-2">
                  <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: riskBadge.bg, color: riskBadge.fg }}>
                    Risk · {selectedTrade.fund.risk}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className="h-3 w-3" style={{ color: "#E3C061", fill: n <= selectedTrade.fund.stars ? "#E3C061" : "transparent" }} />
                    ))}
                  </div>
                </div>

                <p className="mt-5 text-[11px] uppercase tracking-[0.14em] text-[#7E879C]">Performance vs benchmark</p>
                <div className="mt-2" style={{ height: 150 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={selectedTrade.fund.series} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                      <CartesianGrid stroke="#2A3348" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#8A94AC", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#8A94AC", fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                      <RTooltip
                        contentStyle={{ background: "#0D121D", border: "1px solid #2F3A52", borderRadius: 8, fontSize: 11 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10, color: "#A3ADC4" }} />
                      <Line type="monotone" dataKey="fund" name="Fund" stroke="#3FD998" strokeWidth={2} dot={{ r: 2.5 }} />
                      <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#6C7897" strokeWidth={1.8} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-[#7E879C]">Key stats</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {[
                    { label: "Amount", value: selectedTrade.amount },
                    { label: "Expense ratio", value: selectedTrade.fund.expenseRatio },
                    { label: "AUM", value: selectedTrade.fund.aum },
                    { label: "NAV", value: selectedTrade.fund.nav },
                    { label: "1Y return", value: selectedTrade.fund.returns1Y },
                    { label: "3Y CAGR", value: selectedTrade.fund.returns3Y },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-[10px] uppercase text-[#7E879C]">{item.label}</p>
                      <p className="text-[13px] font-semibold text-[#ECF1FF]">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-[#2A3247] bg-[#121B2D] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[#8E98B0]">Why this trade</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#D0D8EC]">{selectedTrade.fund.rationale}</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <BottomNav />
    </div>
  );
};

export default RebalanceExplanation;
