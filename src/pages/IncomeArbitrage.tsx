import BottomNav from "@/components/BottomNav";
import { Sparkles, Landmark, Percent, ShieldCheck } from "lucide-react";

// Illustrative tax comparison (educational only).
const GREEN = "#2E9C7E";
const RED = "#E0772F";
const YEARLY_GAINS = 500000; // sample yearly gains
const SLAB_RATE = 0.3; // debt: taxed at income slab (up to ~30%)
const ARB_RATE = 0.125; // income + arbitrage: taxed like equity (12.5% LTCG)

const debtTax = YEARLY_GAINS * SLAB_RATE;
const arbTax = YEARLY_GAINS * ARB_RATE;
const saving = debtTax - arbTax;

const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const WHY = [
  {
    icon: Landmark,
    title: "Debt funds are taxed at your slab",
    body: "Gains from debt funds are added to your income and taxed at your slab rate — up to ~30%.",
  },
  {
    icon: Percent,
    title: "Income + arbitrage is taxed like equity",
    body: "These funds hold enough equity/arbitrage to qualify for equity taxation, so long-term gains are taxed at just 12.5%.",
  },
  {
    icon: ShieldCheck,
    title: "Prozpr does the heavy lifting",
    body: "We pick the right funds and holding periods so your returns qualify for the lower rate — with low, stable risk.",
  },
];

const IncomeArbitrage = () => {
  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-24">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Income + Arbitrage</h1>
      </div>

      <div className="px-5 space-y-4">
        {/* Savings — up front */}
        <div
          className="rounded-2xl px-5 py-6 text-center"
          style={{ background: "linear-gradient(135deg, #1F5A38 0%, #0E2C1B 100%)", border: "1px solid rgba(120, 190, 140, 0.4)" }}
        >
          <div className="inline-flex items-center gap-1.5" style={{ color: "rgba(234, 245, 236, 0.72)" }}>
            <Sparkles className="h-4 w-4" strokeWidth={2} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Prozpr tax edge</span>
          </div>
          <p className="mt-2 text-[13px]" style={{ color: "rgba(234, 245, 236, 0.82)" }}>
            Prozpr could save you up to
          </p>
          <p className="mt-1 text-4xl font-bold" style={{ color: "#EAF5EC" }}>
            {fmt(saving)}<span className="text-lg font-semibold"> / year</span>
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "rgba(234, 245, 236, 0.82)" }}>
            in tax, by holding income + arbitrage funds taxed like equity (12.5%)
            instead of at your income slab.
          </p>
        </div>

        {/* Same returns, far less tax */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[13px] font-semibold text-foreground">Same returns, far less tax</p>
          <p className="mb-3 text-[11px] text-muted-foreground">On {fmt(YEARLY_GAINS)} of yearly gains</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-[11px] font-medium text-muted-foreground">As a debt fund</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: RED }}>30%</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">at your income slab</p>
              <p className="mt-2 text-[13px] font-semibold text-foreground">Tax {fmt(debtTax)}</p>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: `${GREEN}80`, backgroundColor: `${GREEN}14` }}>
              <p className="text-[11px] font-medium" style={{ color: GREEN }}>Income + Arbitrage</p>
              <p className="mt-1 text-2xl font-bold" style={{ color: GREEN }}>12.5%</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">taxed like equity</p>
              <p className="mt-2 text-[13px] font-semibold text-foreground">Tax {fmt(arbTax)}</p>
            </div>
          </div>

          <div
            className="mt-3 flex items-center justify-between rounded-xl px-3 py-2.5"
            style={{ backgroundColor: `${GREEN}14` }}
          >
            <p className="text-[12px] font-medium text-foreground">You keep more every year</p>
            <p className="text-[15px] font-bold" style={{ color: GREEN }}>+{fmt(saving)}</p>
          </div>
        </div>

        {/* Why the tax is lower */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3.5">
          <p className="text-[13px] font-semibold text-foreground">Why the tax is lower</p>
          {WHY.map((w) => (
            <div key={w.title} className="flex gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${GREEN}1f` }}
              >
                <w.icon className="h-4 w-4" strokeWidth={1.8} style={{ color: GREEN }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{w.title}</p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">{w.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="px-1 text-center text-[11px] leading-snug text-muted-foreground/70">
          Educational only · illustrative figures assuming a 30% slab · not tax advice.
          Investing coming soon.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default IncomeArbitrage;
