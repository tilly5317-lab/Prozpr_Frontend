import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import {
  Sprout,
  TrendingUp,
  Clock,
  ShieldCheck,
  PiggyBank,
  Bell,
  Check,
} from "lucide-react";

// Dark "plant growing" green for the hero.
const GREEN_GRADIENT = "linear-gradient(135deg, #1F5A38 0%, #0E2C1B 100%)";
const GREEN = "#2E9C7E";

const BENEFITS = [
  {
    icon: TrendingUp,
    title: "Up to ~2x your savings",
    body: "Typically ~6% a year vs ~3% in a savings account.",
  },
  {
    icon: Clock,
    title: "Withdraw anytime",
    body: "No lock-in — money reaches your bank in about a day.",
  },
  {
    icon: ShieldCheck,
    title: "Low risk",
    body: "Parks cash in very short-term, high-quality debt.",
  },
];

const LiquidFunds = () => {
  const navigate = useNavigate();
  const [potNotified, setPotNotified] = useState(false);

  const notifyPot = () => {
    setPotNotified(true);
    toast.success("We'll notify you the moment Savings pots go live.");
  };

  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-24">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Liquid funds</h1>
      </div>

      <div className="px-5 space-y-4">
        {/* Hero — the 2x hook, on a "plant growing" green */}
        <div
          className="rounded-2xl px-5 py-6 text-center"
          style={{ background: GREEN_GRADIENT, border: "1px solid rgba(120, 190, 140, 0.4)" }}
        >
          <div
            className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(234, 245, 236, 0.14)" }}
          >
            <Sprout className="h-5 w-5" strokeWidth={1.8} style={{ color: "#EAF5EC" }} />
          </div>
          <p
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "rgba(234, 245, 236, 0.72)" }}
          >
            Put idle cash to work
          </p>
          <p className="mt-1 text-3xl font-bold" style={{ color: "#EAF5EC" }}>
            Save &amp; earn up to 2x
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: "rgba(234, 245, 236, 0.82)" }}>
            Move money you don&apos;t need right now into liquid funds and earn
            roughly double a savings account — while keeping it within easy reach.
          </p>
        </div>

        {/* Quick comparison on ₹1,00,000 in a year */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] font-medium text-muted-foreground">Savings account</p>
            <p className="mt-1 text-2xl font-bold text-foreground">~3%</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">₹1,00,000 → ₹1,03,000</p>
          </div>
          <div
            className="rounded-2xl border p-4"
            style={{ borderColor: `${GREEN}80`, backgroundColor: `${GREEN}14` }}
          >
            <p className="text-[11px] font-medium" style={{ color: GREEN }}>Liquid fund</p>
            <p className="mt-1 text-2xl font-bold text-foreground">~6%</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">₹1,00,000 → ₹1,06,000</p>
          </div>
        </div>

        {/* Savings pot — notify when available */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => navigate("/savings-pot")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform active:scale-95"
              style={{ backgroundColor: `${GREEN}1f` }}
              aria-label="Open your Savings pot"
            >
              <PiggyBank className="h-5 w-5" strokeWidth={1.8} style={{ color: GREEN }} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-foreground">Turn it into a Savings pot</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Auto-save spare cash and round-ups into your liquid fund — a pot
                that quietly grows in the background.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={notifyPot}
            disabled={potNotified}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-100"
            style={{ backgroundColor: `${GREEN}1f`, color: GREEN }}
          >
            {potNotified ? (
              <>
                <Check className="h-3.5 w-3.5" /> You&apos;ll be notified
              </>
            ) : (
              <>
                <Bell className="h-3.5 w-3.5" /> Notify me when available
              </>
            )}
          </button>
        </div>

        {/* Simple benefits */}
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3.5">
          {BENEFITS.map((b) => (
            <div key={b.title} className="flex gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${GREEN}1f` }}
              >
                <b.icon className="h-4 w-4" strokeWidth={1.8} style={{ color: GREEN }} />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground">{b.title}</p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">{b.body}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="px-1 text-center text-[11px] text-muted-foreground/70">
          Illustrative rates — actual returns vary and aren&apos;t guaranteed. Investing coming soon.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default LiquidFunds;
