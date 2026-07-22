import { useState } from "react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import { TrendingUp, Wallet, Clock, ShieldCheck, CreditCard, Bell, Check } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

// Indicative, illustrative rates only — not a quote or guarantee.
const SAVINGS_RATE = 3.0; // typical savings-account interest
const LIQUID_LOW = 5.0; // lower end of typical liquid-fund yield
const LIQUID_HIGH = 6.5; // upper end of typical liquid-fund yield

const compareData = [
  { name: "Savings account", rate: SAVINGS_RATE, label: `${SAVINGS_RATE.toFixed(1)}%`, color: "#9CA3AF" },
  { name: "Liquid fund", rate: (LIQUID_LOW + LIQUID_HIGH) / 2, label: `${LIQUID_LOW}–${LIQUID_HIGH}%`, color: "#D4A868" },
];

const HOW_IT_WORKS = [
  {
    icon: Wallet,
    title: "Move idle cash in",
    body: "Invest money you don't need right away — even for just a few days or weeks.",
  },
  {
    icon: TrendingUp,
    title: "It earns every day",
    body: "Liquid funds hold very short-term, high-quality debt, accruing returns daily.",
  },
  {
    icon: Clock,
    title: "Withdraw anytime",
    body: "Redeem when you need it — money usually reaches your bank within a day.",
  },
  {
    icon: ShieldCheck,
    title: "Lower risk",
    body: "Among the least volatile funds — built to protect capital, not chase high returns.",
  },
];

const LiquidFunds = () => {
  const [notified, setNotified] = useState(false);
  const perLakh = 100000;
  const savingsGain = Math.round((perLakh * SAVINGS_RATE) / 100);
  const liquidGainLow = Math.round((perLakh * LIQUID_LOW) / 100);
  const liquidGainHigh = Math.round((perLakh * LIQUID_HIGH) / 100);
  const extraLow = liquidGainLow - savingsGain;
  const extraHigh = liquidGainHigh - savingsGain;

  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-24">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Liquid funds</h1>
      </div>

      <div className="px-5 space-y-4">
        {/* Spending card announcement banner */}
        <div
          className="flex items-center gap-3 rounded-2xl p-4"
          style={{
            background: "linear-gradient(135deg, #4A380F 0%, #2D1F05 100%)",
            border: "1px solid rgba(212, 168, 104, 0.45)",
          }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(245, 238, 220, 0.14)" }}
          >
            <CreditCard className="h-5 w-5" strokeWidth={1.8} style={{ color: "#F5EEDC" }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold" style={{ color: "#F5EEDC" }}>
              Spending card coming soon
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: "rgba(245, 238, 220, 0.72)" }}>
              Spend straight from your liquid funds — no need to move money to your bank first.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setNotified(true);
              toast.success("We'll notify you when the spending card is available.");
            }}
            disabled={notified}
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "rgba(245, 238, 220, 0.16)",
              color: "#F5EEDC",
              border: "1px solid rgba(245, 238, 220, 0.28)",
            }}
          >
            {notified ? (
              <>
                <Check className="h-3 w-3" /> Notified
              </>
            ) : (
              <>
                <Bell className="h-3 w-3" /> Notify me
              </>
            )}
          </button>
        </div>

        {/* Hero — earn more on savings */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-1.5 text-[#B8842E]">
            <TrendingUp className="h-4 w-4" strokeWidth={2} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">
              Earn more on savings
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {LIQUID_LOW}–{LIQUID_HIGH}%{" "}
            <span className="text-sm font-medium text-muted-foreground">
              vs {SAVINGS_RATE.toFixed(1)}% in a savings account
            </span>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Park idle cash in liquid funds and earn roughly 1.5–2x a typical
            savings account — while keeping easy access to your money.
          </p>
        </div>

        {/* Comparison chart */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-1 text-[13px] font-semibold text-foreground">
            Indicative annual returns
          </p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Typical rates — actual returns vary and aren't guaranteed.
          </p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compareData} margin={{ top: 18, right: 8, left: 8, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide domain={[0, LIQUID_HIGH * 1.35]} />
                <Bar dataKey="rate" radius={[8, 8, 0, 0]} isAnimationActive>
                  {compareData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                  <LabelList
                    dataKey="label"
                    position="top"
                    style={{ fontSize: 12, fontWeight: 700, fill: "hsl(var(--foreground))" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Impact on ₹1,00,000 over a year */}
          <div className="mt-2 flex items-center justify-between rounded-xl bg-muted/50 p-3">
            <div>
              <p className="text-[11px] text-muted-foreground">On ₹1,00,000 in a year</p>
              <p className="text-[13px] font-semibold text-foreground">
                Liquid fund earns ~₹{liquidGainLow.toLocaleString("en-IN")}–{liquidGainHigh.toLocaleString("en-IN")}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">Extra vs savings</p>
              <p className="text-[13px] font-bold text-wealth-green">
                +₹{extraLow.toLocaleString("en-IN")}–{extraHigh.toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 text-[13px] font-semibold text-foreground">How it works</p>
          <div className="space-y-3.5">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.title} className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#D4A868]/15">
                  <s.icon className="h-4 w-4 text-[#B8842E]" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{s.title}</p>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coming soon */}
        <div className="rounded-2xl border border-dashed border-border p-4 text-center">
          <p className="text-[13px] font-semibold text-foreground">Coming soon</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            You'll be able to invest in liquid funds right here.
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default LiquidFunds;
