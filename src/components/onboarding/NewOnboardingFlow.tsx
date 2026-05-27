import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import WelcomeScreen from "./WelcomeScreen";
import { saveOnboardingProfile } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  Plus,
  X,
  Calendar,
  Target,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface NewOnboardingFlowProps {
  onComplete: () => void;
}

/* ─── Drum-roll date picker ─── */
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => currentYear - 18 - i);

const MONTH_LABELS: Record<number, string> = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
  7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
};

const ITEM_H = 28;
const VISIBLE = 3;

const DrumColumn = ({
  items,
  value,
  onChange,
  renderLabel,
}: {
  items: number[];
  value: number;
  onChange: (v: number) => void;
  renderLabel?: (v: number) => string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isSettling = useRef(false);
  const paddingItems = Math.floor(VISIBLE / 2);

  useEffect(() => {
    if (!ref.current) return;
    const idx = items.indexOf(value);
    if (idx >= 0) {
      isSettling.current = true;
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
      const timer = setTimeout(() => { isSettling.current = false; }, 400);
      return () => clearTimeout(timer);
    }
  }, [value, items]);

  const handleScroll = useCallback(() => {
    if (!ref.current || isSettling.current) return;
    const idx = Math.round(ref.current.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    if (items[clamped] !== value) {
      onChange(items[clamped]);
    }
  }, [items, value, onChange]);

  return (
    <div className="relative flex-1" style={{ height: ITEM_H * VISIBLE }}>
      {/* Centre highlight band */}
      <div
        className="absolute inset-x-1 pointer-events-none z-10 rounded-md bg-primary/6"
        style={{ top: paddingItems * ITEM_H, height: ITEM_H }}
      />
      <div
        ref={ref}
        onScroll={handleScroll}
        className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {/* Top padding so first item can reach centre */}
        {Array.from({ length: paddingItems }).map((_, i) => (
          <div key={`pad-top-${i}`} style={{ height: ITEM_H }} />
        ))}
        {items.map((item) => {
          const idx = items.indexOf(item);
          const selectedIdx = items.indexOf(value);
          const distance = Math.abs(idx - selectedIdx);
          const opacity = distance === 0 ? 1 : 0.15;
          const fontSize = distance === 0 ? '13px' : '11px';
          return (
            <div
              key={item}
              className="flex items-center justify-center snap-center transition-all"
              style={{ height: ITEM_H, opacity, fontWeight: distance === 0 ? 600 : 400, fontSize }}
              onClick={() => onChange(item)}
            >
              {renderLabel ? renderLabel(item) : String(item).padStart(2, "0")}
            </div>
          );
        })}
        {/* Bottom padding so last item can reach centre */}
        {Array.from({ length: paddingItems }).map((_, i) => (
          <div key={`pad-bot-${i}`} style={{ height: ITEM_H }} />
        ))}
      </div>
    </div>
  );
};

/* ─── Format INR ─── */
const formatINR = (v: number) => {
  if (v >= 100000000) return "₹10 Cr+";
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
};

/* ─── Single-value INR input ─── */
const NumberInputINR = ({
  label,
  description,
  value,
  onChange,
  placeholder,
  subtext,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  subtext?: string;
}) => (
  <div className="space-y-1.5">
    <span className="text-sm font-medium text-foreground">{label}</span>
    {description && (
      <p className="text-[11px] text-muted-foreground leading-snug">{description}</p>
    )}
    <div className="relative pt-1">
      <span className="absolute left-3 top-[calc(50%+2px)] -translate-y-1/2 text-sm text-muted-foreground">₹</span>
      <input
        type="text"
        inputMode="numeric"
        value={value > 0 ? String(value) : ""}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          onChange(digits ? Number(digits) : 0);
        }}
        placeholder={placeholder ?? "Enter amount"}
        className="w-full rounded-xl border border-border bg-card pl-7 pr-3 py-2.5 text-sm text-foreground outline-none focus:border-primary transition-colors tabular-nums"
      />
    </div>
    {subtext && <p className="text-[11px] text-muted-foreground italic">{subtext}</p>}
  </div>
);

/* ─── Constants ─── */
const DEFAULT_GOALS = [
  { label: "Buying a home", icon: "🏡" },
  { label: "Retiring", icon: "🌴" },
  { label: "Education", icon: "🎓" },
  { label: "Marriage", icon: "💍" },
];

const HORIZON_OPTIONS = [
  { label: "Short term", sub: "< 2 years" },
  { label: "Medium term", sub: "2–5 years" },
  { label: "Long term", sub: "5+ years" },
];



/* ─── Main component ─── */
const NewOnboardingFlow = ({ onComplete }: NewOnboardingFlowProps) => {
  const navigate = useNavigate();
  // -1 = welcome, 0 = about you
  const [step, setStep] = useState(-1);

  // Section 1 state
  const [dobDay, setDobDay] = useState(15);
  const [dobMonth, setDobMonth] = useState(6);
  const [dobYear, setDobYear] = useState(1990);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState("");
  const [horizon, setHorizon] = useState("");
  const [income, setIncome] = useState<number>(0);
  const [expense, setExpense] = useState<number>(0);
  const [investmentView, setInvestmentView] = useState("");

  const toggleGoal = (g: string) =>
    setSelectedGoals((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );

  const addCustomGoal = () => {
    if (newGoalText.trim()) {
      setCustomGoals((prev) => [...prev, newGoalText.trim()]);
      setSelectedGoals((prev) => [...prev, newGoalText.trim()]);
      setNewGoalText("");
      setAddingGoal(false);
    }
  };

  const handleContinueToLinkAccounts = async () => {
    const dob = `${dobYear}-${String(dobMonth).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`;
    try {
      await saveOnboardingProfile({
        date_of_birth: dob,
        selected_goals: selectedGoals,
        custom_goals: customGoals,
        investment_horizon: horizon || undefined,
        annual_income_min: income,
        annual_income_max: income,
        annual_expense_min: expense,
        annual_expense_max: expense,
      });
    } catch {
      // continue even if save fails
    }
    sessionStorage.setItem("completedTellUs", "true");
    navigate("/link-accounts");
  };

  // Compute subtexts
  const estSavings = Math.max(0, income - expense);
  const expensePct = income > 0 ? Math.round((expense / income) * 100) : 0;

  /* ─── SCREEN 0: Welcome ─── */
  if (step === -1) {
    return (
      <WelcomeScreen onNext={() => setStep(0)} />
    );
  }

  /* ─── Progress bar ─── */
  const renderProgress = () => (
    <div className="px-4 pt-12 pb-1">
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
              step > 0
                ? "bg-wealth-green text-primary-foreground"
                : "wealth-gradient text-primary-foreground"
            }`}
          >
            {step > 0 ? <Check className="h-3 w-3" /> : "1"}
          </div>
          <div className="flex flex-col">
            <span className={`text-[10px] font-medium leading-tight ${step === 0 ? "text-foreground" : "text-muted-foreground"}`}>
              About you
            </span>
            <span className="text-[8px] text-muted-foreground/50 leading-tight">~30 secs</span>
          </div>
        </div>

        <div className="flex-1 h-0.5 rounded-full bg-secondary overflow-hidden mx-1">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: step > 0 ? "100%" : "0%" }}
            transition={{ duration: 0.4 }}
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
              step === 1
                ? "wealth-gradient text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            2
          </div>
          <div className="flex flex-col">
            <span className={`text-[10px] font-medium leading-tight ${step === 1 ? "text-foreground" : "text-muted-foreground"}`}>
              Link accounts
            </span>
            <span className="text-[8px] text-muted-foreground/50 leading-tight">~90 secs</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mobile-container flex flex-col bg-background min-h-screen">
      {renderProgress()}

      <AnimatePresence mode="wait">
        {/* ─── SCREEN 1: Tell us about you ─── */}
        {step === 0 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
            className="flex-1 flex flex-col px-6 pb-24 overflow-y-auto"
          >
            <div className="mt-4 mb-1">
              <h2 className="text-xl font-semibold text-foreground">Tell us about you</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Personalise your financial journey
              </p>
            </div>

            <Accordion type="single" collapsible className="space-y-3">
              {/* Segment 1: Age */}
              <AccordionItem
                value="age"
                className="border rounded-xl bg-card overflow-hidden border-border/60"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Calendar className="h-[20px] w-[20px] text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Age</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="flex gap-1 rounded-xl overflow-hidden bg-secondary/20 p-2 max-w-[260px] mx-auto">
                    <DrumColumn items={DAYS} value={dobDay} onChange={setDobDay} />
                    <DrumColumn
                      items={MONTHS}
                      value={dobMonth}
                      onChange={setDobMonth}
                      renderLabel={(v) => MONTH_LABELS[v]}
                    />
                    <DrumColumn
                      items={YEARS}
                      value={dobYear}
                      onChange={setDobYear}
                      renderLabel={(v) => String(v)}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Segment 2: Financial Goals */}
              <AccordionItem
                value="goals"
                className="border rounded-xl bg-card overflow-hidden border-border/60"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Target className="h-[20px] w-[20px] text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Financial Goals</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-5">
                  {/* Goals chips */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2.5">
                      What are your key financial goals?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[...DEFAULT_GOALS, ...customGoals.map((g) => ({ label: g, icon: "✦" }))].map((g) => {
                        const isSelected = selectedGoals.includes(g.label);
                        return (
                          <button
                            key={g.label}
                            onClick={() => toggleGoal(g.label)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground hover:bg-muted"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                            <span>{g.icon}</span>
                            {g.label}
                          </button>
                        );
                      })}
                      {addingGoal ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={newGoalText}
                            onChange={(e) => setNewGoalText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addCustomGoal()}
                            placeholder="Type goal"
                            className="px-3 py-2 rounded-full text-xs bg-secondary text-foreground outline-none w-28 border border-border"
                          />
                          <button
                            onClick={addCustomGoal}
                            className="p-1.5 rounded-full bg-primary text-primary-foreground"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => { setAddingGoal(false); setNewGoalText(""); }}
                            className="p-1.5 rounded-full bg-secondary text-muted-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingGoal(true)}
                          className="flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium bg-secondary text-muted-foreground hover:bg-muted border border-dashed border-border"
                        >
                          <Plus className="h-3 w-3" /> Add your own
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Horizon pills — auto-sized */}
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2.5">
                      Investment Horizon
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {HORIZON_OPTIONS.map((h) => {
                        const isSelected = horizon === h.label;
                        return (
                          <button
                            key={h.label}
                            onClick={() => setHorizon(h.label)}
                            className={`px-4 py-2.5 rounded-xl text-xs font-medium text-center transition-all ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "bg-secondary text-secondary-foreground hover:bg-muted"
                            }`}
                          >
                            {h.label}
                          </button>
                        );
                      })}
                    </div>
                    {horizon && (
                      <p className="text-[11px] text-muted-foreground mt-2 text-center w-full">
                        {HORIZON_OPTIONS.find((h) => h.label === horizon)?.sub}
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Segment 3: Income & Expenses */}
              <AccordionItem
                value="income"
                className="border rounded-xl bg-card overflow-hidden border-border/60"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Wallet className="h-[20px] w-[20px] text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Income & Expenses</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 space-y-5">
                  <NumberInputINR
                    label="Annual income"
                    description="Includes salary and regular income (e.g. rental income)"
                    value={income}
                    onChange={setIncome}
                    placeholder="e.g. 5000000"
                    subtext={
                      income > 0 && expense > 0
                        ? `Estimated savings: ${formatINR(estSavings)} / year`
                        : undefined
                    }
                  />
                  <NumberInputINR
                    label="Annual expense"
                    description="Excludes all debt obligations (e.g. loans)"
                    value={expense}
                    onChange={setExpense}
                    placeholder="e.g. 1200000"
                    subtext={
                      income > 0 && expense > 0
                        ? `That's roughly ${expensePct}% of your income`
                        : undefined
                    }
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Segment 4: Risk Assessment */}
              <AccordionItem
                value="risk"
                className="border rounded-xl bg-card overflow-hidden border-border/60"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <ShieldCheck className="h-[20px] w-[20px] text-muted-foreground" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">Risk Assessment</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2.5">
                    What is your investment view?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {["Conservative", "Moderate", "Risk Taking"].map((option) => {
                      const isSelected = investmentView === option;
                      return (
                        <button
                          key={option}
                          onClick={() => setInvestmentView(option)}
                          className={`px-4 py-2.5 rounded-xl text-xs font-medium text-center transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-secondary text-secondary-foreground hover:bg-muted"
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Fixed CTA */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent">
              <div className="max-w-md mx-auto">
                <button
                  onClick={handleContinueToLinkAccounts}
                  className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98]"
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
};

export default NewOnboardingFlow;
