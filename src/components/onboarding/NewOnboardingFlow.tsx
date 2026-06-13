import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import WelcomeScreen from "./WelcomeScreen";
import {
  getOnboardingProfile,
  getRiskProfile,
  persistOnboardingProfile,
  type PersistOnboardingInput,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Loader2,
  Plus,
  X,
  Calendar,
  Target,
  Wallet,
  ShieldCheck,
} from "lucide-react";

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

/* ─── Dual Range Slider ─── */
const SLIDER_TICKS = [
  { value: 0, label: "₹0" },
  { value: 2500000, label: "₹25L" },
  { value: 5000000, label: "₹50L" },
  { value: 10000000, label: "₹1Cr" },
  { value: 50000000, label: "₹5Cr" },
  { value: 100000000, label: "₹10Cr+" },
];

const DualRangeSlider = ({
  label,
  range,
  onChange,
  subtext,
}: {
  label: string;
  range: [number, number];
  onChange: (r: [number, number]) => void;
  subtext?: string;
}) => {
  const max = 100000000;
  const minPct = (range[0] / max) * 100;
  const maxPct = (range[1] / max) * 100;
  const isSingleValue = range[0] === range[1];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold text-foreground">
          {isSingleValue ? formatINR(range[0]) : `${formatINR(range[0])} – ${formatINR(range[1])}`}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-secondary">
        <div
          className="absolute h-full rounded-full bg-primary"
          style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }}
        />
        <input
          type="range"
          min={0}
          max={max}
          step={100000}
          value={range[0]}
          onChange={(e) => {
            const v = Math.max(0, Math.min(Number(e.target.value), range[1]));
            onChange([v, range[1]]);
          }}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-md pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
        />
        <input
          type="range"
          min={0}
          max={max}
          step={100000}
          value={range[1]}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), range[0]);
            onChange([range[0], v]);
          }}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-md pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
        />
      </div>
      <div className="flex justify-between">
        {SLIDER_TICKS.map((t) => (
          <span key={t.value} className="text-[9px] text-muted-foreground/50">
            {t.label}
          </span>
        ))}
      </div>
      {subtext && (
        <p className="text-[11px] text-muted-foreground italic">{subtext}</p>
      )}
    </div>
  );
};

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

const INVESTMENT_VIEW_TO_RISK_LEVEL: Record<string, number> = {
  Conservative: 0,
  Moderate: 2,
  "Risk Taking": 4,
};

/* ─── One-question-at-a-time wizard ───
   Each question is asked on its own screen, and a question is only included
   when the answer is missing from the user's existing profile (so returning
   users are never re-asked what we already know). */
type QuestionKey = "dob" | "goals" | "horizon" | "income" | "expenses" | "risk";

const QUESTION_META: Record<QuestionKey, { title: string; sub: string; Icon: typeof Calendar }> = {
  dob: { title: "When were you born?", sub: "We use your age to plan over your lifetime", Icon: Calendar },
  goals: { title: "What are your key financial goals?", sub: "Pick any that apply — or add your own", Icon: Target },
  horizon: { title: "What's your investment horizon?", sub: "How long you expect to stay invested", Icon: Target },
  income: { title: "What's your annual income range?", sub: "A rough range is fine", Icon: Wallet },
  expenses: { title: "And your annual expenses?", sub: "Across the whole household", Icon: Wallet },
  risk: { title: "What is your investment view?", sub: "How you feel about market ups and downs", Icon: ShieldCheck },
};

/* ─── Main component ─── */
const NewOnboardingFlow = ({ onComplete }: NewOnboardingFlowProps) => {
  const navigate = useNavigate();
  // -1 = welcome, 0 = about you
  const [step, setStep] = useState(-1);

  // Which questions still need answers (null = still checking the profile).
  const [askKeys, setAskKeys] = useState<QuestionKey[] | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Answer state
  const [dobDay, setDobDay] = useState(15);
  const [dobMonth, setDobMonth] = useState(6);
  const [dobYear, setDobYear] = useState(1990);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState("");
  const [horizon, setHorizon] = useState("");
  const [incomeRange, setIncomeRange] = useState<[number, number]>([30000000, 70000000]);
  const [expenseRange, setExpenseRange] = useState<[number, number]>([20000000, 50000000]);
  const [investmentView, setInvestmentView] = useState("");

  // On entering "About you": read what's already on the profile, prefill it,
  // and only queue the questions whose answers are missing.
  useEffect(() => {
    if (step !== 0 || askKeys !== null) return;
    let cancelled = false;
    (async () => {
      const missing: QuestionKey[] = [];
      let profile: Awaited<ReturnType<typeof getOnboardingProfile>> | null = null;
      try {
        profile = await getOnboardingProfile();
      } catch {
        /* brand-new user — everything is missing */
      }
      let risk: Awaited<ReturnType<typeof getRiskProfile>> | null = null;
      try {
        risk = await getRiskProfile();
      } catch {
        /* no risk profile yet */
      }
      if (cancelled) return;

      if (profile?.date_of_birth) {
        const d = new Date(profile.date_of_birth);
        if (!Number.isNaN(d.getTime())) {
          setDobYear(d.getFullYear());
          setDobMonth(d.getMonth() + 1);
          setDobDay(d.getDate());
        }
      } else {
        missing.push("dob");
      }

      const existingSelected = profile?.selected_goals ?? [];
      const existingCustom = profile?.custom_goals ?? [];
      if (existingSelected.length || existingCustom.length) {
        setSelectedGoals([...existingSelected, ...existingCustom.filter((g) => !existingSelected.includes(g))]);
        setCustomGoals(existingCustom);
      } else {
        missing.push("goals");
      }

      if (profile?.investment_horizon) setHorizon(profile.investment_horizon);
      else missing.push("horizon");

      if (profile?.annual_income != null && profile.annual_income > 0) {
        setIncomeRange([profile.annual_income, profile.annual_income]);
      } else {
        missing.push("income");
      }

      if (profile?.monthly_household_expense != null && profile.monthly_household_expense > 0) {
        const annual = profile.monthly_household_expense * 12;
        setExpenseRange([annual, annual]);
      } else {
        missing.push("expenses");
      }

      const hasRisk = !!risk && (risk.risk_level != null || !!risk.risk_category);
      if (!hasRisk) missing.push("risk");

      setAskKeys(missing);
      setQIndex(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [step, askKeys]);

  // Everything already answered → skip straight to link-accounts.
  useEffect(() => {
    if (step === 0 && askKeys !== null && askKeys.length === 0) {
      sessionStorage.setItem("completedTellUs", "true");
      navigate("/link-accounts");
    }
  }, [step, askKeys, navigate]);

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

  // Persist only the questions we actually asked — never overwrite existing
  // answers with the wizard's defaults for questions we skipped.
  const handleFinish = async () => {
    if (!askKeys) return;
    const asked = (k: QuestionKey) => askKeys.includes(k);
    const input: PersistOnboardingInput = {};
    if (asked("dob")) {
      input.date_of_birth = `${dobYear}-${String(dobMonth).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`;
    }
    if (asked("goals")) {
      input.selected_goals = selectedGoals;
      input.custom_goals = customGoals;
    }
    if (asked("horizon") && horizon) input.investment_horizon = horizon;
    if (asked("income")) {
      input.annual_income_min = incomeRange[0];
      input.annual_income_max = incomeRange[1];
    }
    if (asked("expenses")) {
      input.annual_expense_min = expenseRange[0];
      input.annual_expense_max = expenseRange[1];
    }
    if (asked("risk") && investmentView) {
      input.risk_level = INVESTMENT_VIEW_TO_RISK_LEVEL[investmentView];
    }
    setSaving(true);
    try {
      await persistOnboardingProfile(input);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save your answers.";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
      setSaving(false);
      return;
    }
    setSaving(false);
    sessionStorage.setItem("completedTellUs", "true");
    navigate("/link-accounts");
  };

  // Compute subtexts
  const avgIncome = (incomeRange[0] + incomeRange[1]) / 2;
  const avgExpense = (expenseRange[0] + expenseRange[1]) / 2;
  const expensePct = avgIncome > 0 ? Math.round((avgExpense / avgIncome) * 100) : 0;

  /* ─── SCREEN 0: Welcome ─── */
  if (step === -1) {
    return (
      <WelcomeScreen onNext={() => setStep(0)} onExistingUserLogin={onComplete} />
    );
  }

  /* ─── Progress bar (About you → Link accounts) ─── */
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

  /* ─── Per-question bodies ─── */
  const renderQuestionBody = (key: QuestionKey) => {
    switch (key) {
      case "dob":
        return (
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
        );
      case "goals":
        return (
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
        );
      case "horizon":
        return (
          <div>
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
        );
      case "income":
        return (
          <DualRangeSlider
            label="Annual Income Range (₹)"
            range={incomeRange}
            onChange={setIncomeRange}
          />
        );
      case "expenses":
        return (
          <DualRangeSlider
            label="Annual Expenses Range (₹)"
            range={expenseRange}
            onChange={setExpenseRange}
            subtext={`That's roughly ${expensePct}% of your income range`}
          />
        );
      case "risk":
        return (
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
        );
    }
  };

  const totalQ = askKeys?.length ?? 0;
  const currentKey = askKeys && totalQ > 0 ? askKeys[Math.min(qIndex, totalQ - 1)] : null;
  const isLast = qIndex >= totalQ - 1;
  const meta = currentKey ? QUESTION_META[currentKey] : null;

  return (
    <div className="mobile-container flex flex-col bg-background min-h-screen">
      {renderProgress()}

      {/* Checking the profile for already-answered questions */}
      {askKeys === null && (
        <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Checking what we already know…</span>
        </div>
      )}

      {askKeys !== null && askKeys.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          All set — taking you to the next step…
        </div>
      )}

      {askKeys !== null && currentKey && meta && (
        <div className="flex-1 flex flex-col px-6 pb-28">
          {/* Question progress */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-medium text-muted-foreground">
                Question {qIndex + 1} of {totalQ}
              </p>
              <p className="text-[10px] text-muted-foreground/60">Only what's missing</p>
            </div>
            <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary"
                animate={{ width: `${((qIndex + 1) / totalQ) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentKey}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.25 }}
              className="mt-6"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <meta.Icon className="h-[20px] w-[20px] text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-foreground leading-tight">{meta.title}</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-5 ml-12">{meta.sub}</p>

              <div className="rounded-xl border border-border/60 bg-card p-4">
                {renderQuestionBody(currentKey)}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Fixed CTA */}
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent">
            <div className="max-w-md mx-auto flex items-center gap-3">
              {qIndex > 0 && (
                <button
                  onClick={() => setQIndex((i) => Math.max(0, i - 1))}
                  disabled={saving}
                  className="flex items-center justify-center gap-1 rounded-xl border border-border bg-card px-4 py-3.5 text-[14px] font-semibold text-foreground transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
              )}
              <button
                onClick={() => (isLast ? void handleFinish() : setQIndex((i) => i + 1))}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : isLast ? (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NewOnboardingFlow;
