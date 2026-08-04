import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Plus, PiggyBank, Sparkles, X } from "lucide-react";
import BottomNav from "@/components/BottomNav";

// Dummy Savings-pot dashboard (mock data + interactions only).
const GREEN_GRADIENT = "linear-gradient(135deg, #1F5A38 0%, #0E2C1B 100%)";
const GREEN = "#2E9C7E";
const RATE = 0.06; // ~6% p.a. liquid-fund yield
const CASH_RATE = 0.03; // ~3% p.a. regular cash / savings
const ADD_AMOUNT = 50000; // each added fund invests ₹50k

const fmt = (n: number) => `₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

interface Fund {
  name: string;
  detail: string;
  amount: number;
}

const INITIAL_FUNDS: Fund[] = [
  { name: "HDFC Liquid Fund", detail: "Liquid · ~6.1% p.a.", amount: 26890 },
  { name: "ICICI Pru Liquid Fund", detail: "Liquid · ~5.9% p.a.", amount: 17930 },
];

// More liquid funds the user can add to the pot.
const AVAILABLE_FUNDS: Omit<Fund, "amount">[] = [
  { name: "SBI Liquid Fund", detail: "Liquid · ~6.0% p.a." },
  { name: "Axis Liquid Fund", detail: "Liquid · ~6.2% p.a." },
  { name: "Nippon India Liquid Fund", detail: "Liquid · ~5.8% p.a." },
  { name: "Kotak Liquid Fund", detail: "Liquid · ~6.1% p.a." },
];

const SavingsPot = () => {
  const navigate = useNavigate();
  const [funds, setFunds] = useState<Fund[]>(INITIAL_FUNDS);
  const [pickerOpen, setPickerOpen] = useState(false);

  const balance = useMemo(() => funds.reduce((s, f) => s + f.amount, 0), [funds]);
  // Extra interest vs leaving the same money as regular cash (~3%).
  const savedInterest = balance * (RATE - CASH_RATE);

  const monthlySpend = 100000;
  const allowanceTotal = monthlySpend;
  const allowanceLeft = 72000;
  const allowanceSpent = allowanceTotal - allowanceLeft;
  const allowancePct = (allowanceSpent / allowanceTotal) * 100;

  // Bespoke recommendation: ~3 months of the customer's spending as an
  // easy-access liquid buffer.
  const recommendedLiquid = monthlySpend * 3;
  const recPct = Math.min(100, (balance / recommendedLiquid) * 100);
  const toGo = Math.max(0, recommendedLiquid - balance);

  const available = AVAILABLE_FUNDS.filter((a) => !funds.some((f) => f.name === a.name));

  const addFund = (f: Omit<Fund, "amount">) => {
    setFunds((prev) => [...prev, { ...f, amount: ADD_AMOUNT }]);
    setPickerOpen(false);
    toast.success(`${fmt(ADD_AMOUNT)} added to ${f.name}.`);
  };

  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-24">
      <header className="sticky top-0 z-30 bg-background">
        <div className="flex items-center gap-2 px-5 pt-10 pb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted/60"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Savings pot</h1>
        </div>
      </header>

      <div className="px-5 space-y-4">
        {/* Estimated interest hero */}
        <div
          className="rounded-2xl px-5 py-6"
          style={{ background: GREEN_GRADIENT, border: "1px solid rgba(120, 190, 140, 0.4)" }}
        >
          <div className="flex items-start gap-1.5" style={{ color: "rgba(234, 245, 236, 0.72)" }}>
            <PiggyBank className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span className="text-[10.5px] font-semibold uppercase leading-tight tracking-wide">
              Total estimated interest saved over regular cash interest
            </span>
          </div>
          <p className="mt-2 text-4xl font-bold" style={{ color: "#EAF5EC" }}>
            {fmt(savedInterest)}<span className="text-lg font-semibold"> / year</span>
          </p>
          <p className="mt-1.5 text-[13px]" style={{ color: "rgba(234, 245, 236, 0.82)" }}>
            Earning ~6% vs ~3% in cash, on your {fmt(balance)} pot
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-bold transition-transform active:scale-[0.98]"
            style={{ backgroundColor: "#EAF5EC", color: "#0E2C1B" }}
          >
            <Plus className="h-4 w-4" /> Add funds
          </button>
        </div>

        {/* Prozpr recommendation — bespoke buffer size from the customer's spending */}
        <div className="rounded-2xl border p-4" style={{ borderColor: `${GREEN}66`, backgroundColor: `${GREEN}0d` }}>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4" strokeWidth={2} style={{ color: GREEN }} />
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: GREEN }}>
              Prozpr recommendation
            </p>
          </div>
          <p className="mt-2 text-[14px] font-semibold text-foreground">
            Hold about {fmt(recommendedLiquid)} in liquid funds
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            Around 3 months of your {fmt(monthlySpend)} monthly spending — an
            easy-access buffer for the unexpected.
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${recPct}%`, backgroundColor: GREEN }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">You have {fmt(balance)}</span>
            <span className="font-semibold" style={{ color: GREEN }}>{fmt(toGo)} to go</span>
          </div>
        </div>

        {/* Spending allowance */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-foreground">Spending allowance</p>
            <p className="text-[13px] font-semibold text-foreground">
              {fmt(allowanceLeft)} <span className="font-normal text-muted-foreground">left</span>
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${allowancePct}%`, backgroundColor: GREEN }} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {fmt(allowanceSpent)} spent of {fmt(allowanceTotal)} this month
          </p>
        </div>

        {/* Where it's invested — the funds the pot buys */}
        <div>
          <p className="mb-2 text-[16.2px] font-semibold text-foreground">Where it&apos;s invested</p>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {funds.map((f) => (
              <div key={f.name} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{f.name}</p>
                  <p className="text-[11px] text-muted-foreground">{f.detail}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-semibold tabular-nums text-foreground">{fmt(f.amount)}</p>
                  <p className="text-[11px] text-muted-foreground">{Math.round((f.amount / balance) * 100)}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="px-1 text-center text-[11px] text-muted-foreground/70">
          Illustrative demo — balances and funds are sample data.
        </p>
      </div>

      {/* Add-funds picker: choose more liquid funds, each invests ₹50k */}
      <AnimatePresence>
        {pickerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/45"
              onClick={() => setPickerOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Add liquid funds"
              className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            >
              <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[15px] font-semibold text-foreground">Add liquid funds</p>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    className="-m-1.5 p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Each fund you add invests {fmt(ADD_AMOUNT)} more into your pot.
                </p>
                {available.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    You&apos;ve added all available funds.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {available.map((f) => (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => addFund(f)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-foreground">{f.name}</p>
                          <p className="text-[11px] text-muted-foreground">{f.detail}</p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ backgroundColor: `${GREEN}1f`, color: GREEN }}
                        >
                          +{fmt(ADD_AMOUNT)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default SavingsPot;
