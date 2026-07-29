import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, TrendingUp, PiggyBank } from "lucide-react";
import BottomNav from "@/components/BottomNav";

// Dummy Savings-pot dashboard (mock data + interactions only).
const GREEN_GRADIENT = "linear-gradient(135deg, #1F5A38 0%, #0E2C1B 100%)";
const GREEN = "#2E9C7E";

const fmt = (n: number) => `₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;

interface Txn {
  id: number;
  name: string;
  detail: string;
  date: string;
  amount: number; // + credit, − debit
}

const INITIAL_TXNS: Txn[] = [
  { id: 1, name: "Interest earned", detail: "Monthly payout", date: "28 Jul", amount: 112 },
  { id: 2, name: "Zara", detail: "Clothing", date: "27 Jul", amount: -2499 },
  { id: 3, name: "Starbucks", detail: "Coffee", date: "26 Jul", amount: -450 },
  { id: 4, name: "BigBasket", detail: "Groceries", date: "24 Jul", amount: -1890 },
  { id: 5, name: "Uber", detail: "Ride home", date: "23 Jul", amount: -320 },
  { id: 6, name: "Added funds", detail: "From bank", date: "20 Jul", amount: 10000 },
];

const SavingsPot = () => {
  const navigate = useNavigate();
  const [balance, setBalance] = useState(44820);
  const [txns, setTxns] = useState<Txn[]>(INITIAL_TXNS);

  const earnedThisMonth = 230;
  const allowanceTotal = 20000;
  const allowanceLeft = 12600;
  const allowanceSpent = allowanceTotal - allowanceLeft;
  const allowancePct = (allowanceSpent / allowanceTotal) * 100;

  const addFunds = () => {
    setBalance((b) => b + 5000);
    setTxns((t) => [
      { id: Date.now(), name: "Added funds", detail: "From bank", date: "Today", amount: 5000 },
      ...t,
    ]);
    toast.success("₹5,000 added to your pot.");
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
        {/* Balance hero */}
        <div
          className="rounded-2xl px-5 py-6"
          style={{ background: GREEN_GRADIENT, border: "1px solid rgba(120, 190, 140, 0.4)" }}
        >
          <div className="flex items-center gap-1.5" style={{ color: "rgba(234, 245, 236, 0.72)" }}>
            <PiggyBank className="h-4 w-4" strokeWidth={1.8} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Total balance</span>
          </div>
          <p className="mt-2 text-4xl font-bold" style={{ color: "#EAF5EC" }}>{fmt(balance)}</p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold" style={{ color: "#7FE3B0" }}>
            <TrendingUp className="h-3.5 w-3.5" /> {fmt(earnedThisMonth)} earned this month
          </p>
          <button
            type="button"
            onClick={addFunds}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[14px] font-bold transition-transform active:scale-[0.98]"
            style={{ backgroundColor: "#EAF5EC", color: "#0E2C1B" }}
          >
            <Plus className="h-4 w-4" /> Add funds
          </button>
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

        {/* Activity */}
        <div>
          <p className="mb-2 text-[16.2px] font-semibold text-foreground">Activity</p>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {txns.map((t) => {
              const credit = t.amount >= 0;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-foreground">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t.detail} · {t.date}</p>
                  </div>
                  <p
                    className="shrink-0 text-[14px] font-semibold tabular-nums"
                    style={credit ? { color: GREEN } : undefined}
                  >
                    {credit ? "+" : "−"}
                    {fmt(t.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="px-1 text-center text-[11px] text-muted-foreground/70">
          Illustrative demo — balances and transactions are sample data.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default SavingsPot;
