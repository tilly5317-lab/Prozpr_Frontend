import { type CSSProperties } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";
import { trades } from "@/lib/rebalanceTrades";

type DriftRow = {
  key: string;
  label: string;
  color: string;
  current: number;
  target: number;
  amountText: string;
};

const driftRows: DriftRow[] = [
  { key: "equity", label: "Equity", color: "#3B6FA8", current: 54, target: 48, amountText: "6% overweight · +₹75K" },
  { key: "debt", label: "Debt", color: "#A8872F", current: 24, target: 28, amountText: "4% underweight · -₹50K" },
  { key: "gold", label: "Gold", color: "#E0B84A", current: 14, target: 16, amountText: "2% underweight · -₹25K" },
  { key: "cash", label: "Cash", color: "#F1DA9B", current: 8, target: 8, amountText: "On target" },
];

const cardStyle: CSSProperties = {
  background: "linear-gradient(180deg, #1c1c1b 0%, #161615 100%)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
};

const RebalanceExplanation = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      <div className="px-5 pt-10 pb-2 space-y-3">
        <motion.section
          className="relative px-4 py-5 overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, rgba(212,168,104,0.16) 0%, rgba(28,28,27,1) 60%, rgba(28,28,27,1) 100%)",
            border: "1px solid rgba(212,168,104,0.40)",
            borderRadius: 16,
          }}
          initial={{
            boxShadow:
              "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
          }}
          animate={{
            boxShadow: [
              "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
              "0 0 0 2px rgba(229,192,121,0.55), 0 0 40px 6px rgba(212,168,104,0.55)",
              "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
              "0 0 0 2px rgba(229,192,121,0.55), 0 0 40px 6px rgba(212,168,104,0.55)",
              "0 0 0 1px rgba(212,168,104,0.08), 0 12px 32px -14px rgba(212,168,104,0.35)",
            ],
          }}
          transition={{
            duration: 3.2,
            ease: "easeInOut",
            times: [0, 0.2, 0.5, 0.75, 1],
          }}
        >
          <span
            aria-hidden="true"
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ background: "linear-gradient(180deg, #E5C079 0%, #D4A868 100%)" }}
          />
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(212,168,104,0.18)", color: "#E5C079" }}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span
              className="text-[10px] uppercase font-semibold"
              style={{ letterSpacing: "1.6px", color: "#E5C079" }}
            >
              Prozpr insight
            </span>
          </div>
          <h1 className="mt-3 text-[21px] leading-tight font-semibold tracking-tight text-[#F5EEDC]">
            Time to fine-tune your mix.
          </h1>
          <p className="mt-2.5 text-[12.5px] leading-5 text-[#C9CFDF]">
            Equities rallied 9% this quarter, so here's how to glide back to your target without selling more than you need to. Prozpr picked units with the lowest capital gains to maximize tax exemption, and rebalancing now also gets ahead of earnings season shifting weights further.
          </p>
        </motion.section>

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
                  <div className="mt-2 h-2 w-full rounded-full bg-[#252523]">
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
          <div className="mt-3 space-y-4">
            {driftRows
              .map((row) => ({ row, bucketTrades: trades.filter((t) => t.bucket === row.key) }))
              .filter(({ bucketTrades }) => bucketTrades.length > 0)
              .map(({ row, bucketTrades }) => (
                <div key={row.key}>
                  <div className="flex items-center gap-2 pb-1.5">
                    <span
                      className="h-1.5 w-3 rounded-full"
                      style={{ backgroundColor: row.color, boxShadow: `0 0 10px ${row.color}55` }}
                    />
                    <p
                      className="text-[10px] tracking-[0.14em] uppercase"
                      style={{ color: row.color }}
                    >
                      {row.label}
                    </p>
                  </div>
                  <div className="divide-y divide-white/8">
                    {bucketTrades.map((trade) => (
                      <button
                        key={trade.id}
                        type="button"
                        onClick={() => navigate(`/rebalance-explanation/trade/${trade.id}`)}
                        className="w-full py-2.5 text-left flex items-center gap-3"
                      >
                        <span
                          className="px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide shrink-0"
                          style={{
                            backgroundColor: trade.type === "SELL" ? "#3A1717" : "#113126",
                            color: trade.type === "SELL" ? "#FF6559" : "#3FD998",
                          }}
                        >
                          {trade.type}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-tight font-medium text-[#EAF0FF] truncate">{trade.fund.name}</p>
                          <p className="text-[10.5px] text-[#8E99B1] truncate">{trade.subtitle}</p>
                        </div>
                        <p className="text-[14px] leading-none font-semibold text-[#EEF3FF] shrink-0">{trade.amount}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </section>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98]"
        >
          Proceed
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <BottomNav />
    </div>
  );
};

export default RebalanceExplanation;
