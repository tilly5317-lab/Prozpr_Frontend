import { useState, useEffect } from "react";
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

/* ─── Date of birth input (DD/MM/YYYY, slashes inserted automatically) ─── */
// Keep only digits (cap at 8 → DDMMYYYY) and insert "/" after the day & month
// so the user never has to type a slash themselves.
const formatDobInput = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
};

// Parse a complete DD/MM/YYYY string, rejecting impossible dates (e.g. 31/02).
// Returns null until the field holds a real calendar date.
const parseDob = (s: string): { d: number; m: number; y: number } | null => {
  const match = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null;
  }
  return { d, m, y };
};

// A date of birth can never be today or in the future.
const isFutureDob = ({ d, m, y }: { d: number; m: number; y: number }) => {
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dt.getTime() > today.getTime();
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
          <span key={t.value} className="text-[10px] text-muted-foreground/50">
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
  expenses: { title: "And your monthly expenses?", sub: "Across the whole household", Icon: Wallet },
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
  const [dob, setDob] = useState(""); // DD/MM/YYYY (slashes added automatically)
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [addingGoal, setAddingGoal] = useState(false);
  const [newGoalText, setNewGoalText] = useState("");
  const [horizon, setHorizon] = useState("");
  const [incomeRange, setIncomeRange] = useState<[number, number]>([30000000, 70000000]);
  const [monthlyExpense, setMonthlyExpense] = useState<number>(0);
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
        // Stored as YYYY-MM-DD → display as DD/MM/YYYY (parsed manually to avoid TZ shifts).
        const m = profile.date_of_birth.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) setDob(`${m[3]}/${m[2]}/${m[1]}`);
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
        setMonthlyExpense(Math.round(profile.monthly_household_expense));
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
      const p = parseDob(dob);
      if (p) {
        input.date_of_birth = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      }
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
      // User enters a monthly figure; the backend stores an annual one, so ×12.
      const annual = monthlyExpense * 12;
      input.annual_expense_min = annual;
      input.annual_expense_max = annual;
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

  // Compute subtexts. Income is annual (range); expense is monthly → annualise to compare.
  const avgIncome = (incomeRange[0] + incomeRange[1]) / 2;
  const annualExpense = monthlyExpense * 12;
  const expensePct = avgIncome > 0 ? Math.round((annualExpense / avgIncome) * 100) : 0;

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
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
              step > 0
                ? "bg-wealth-green text-primary-foreground"
                : "wealth-gradient text-primary-foreground"
            }`}
          >
            {step > 0 ? <Check className="h-3 w-3" /> : "1"}
          </div>
          <div className="flex flex-col">
            <span className={`text-[11px] font-medium leading-tight ${step === 0 ? "text-foreground" : "text-muted-foreground"}`}>
              About you
            </span>
            <span className="text-[9px] text-muted-foreground/50 leading-tight">~30 secs</span>
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
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
              step === 1
                ? "wealth-gradient text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            2
          </div>
          <div className="flex flex-col">
            <span className={`text-[11px] font-medium leading-tight ${step === 1 ? "text-foreground" : "text-muted-foreground"}`}>
              Link accounts
            </span>
            <span className="text-[9px] text-muted-foreground/50 leading-tight">~90 secs</span>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─── Per-question bodies ─── */
  const renderQuestionBody = (key: QuestionKey) => {
    switch (key) {
      case "dob": {
        const parsed = parseDob(dob);
        const showError = dob.length === 10 && (!parsed || isFutureDob(parsed));
        return (
          <div className="space-y-2 max-w-[260px] mx-auto">
            <input
              type="text"
              inputMode="numeric"
              value={dob}
              onChange={(e) => setDob(formatDobInput(e.target.value))}
              placeholder="DD/MM/YYYY"
              maxLength={10}
              className={`w-full rounded-lg border bg-background px-4 py-3 text-center text-base tracking-[0.25em] text-foreground outline-none focus:border-primary ${
                showError ? "border-destructive" : "border-border"
              }`}
            />
            {showError && (
              <p className="text-[11px] text-center text-destructive">
                {parsed ? "Date of birth can't be in the future" : "Please enter a valid date"}
              </p>
            )}
          </div>
        );
      }
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
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Monthly Expenses (₹)
            </label>
            <div className="flex items-center rounded-lg border border-border bg-background px-3 focus-within:border-primary">
              <span className="text-sm text-muted-foreground">₹</span>
              <input
                type="text"
                inputMode="numeric"
                value={monthlyExpense > 0 ? monthlyExpense.toLocaleString("en-IN") : ""}
                onChange={(e) =>
                  setMonthlyExpense(Number(e.target.value.replace(/[^\d]/g, "")) || 0)
                }
                placeholder="e.g. 80,000"
                className="flex-1 bg-transparent px-2 py-3 text-base text-foreground outline-none"
              />
            </div>
            {monthlyExpense > 0 && expensePct > 0 && (
              <p className="text-[11px] text-muted-foreground italic">
                That's roughly {expensePct}% of your annual income
              </p>
            )}
          </div>
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

  // Block advancing past the DOB question until a valid, non-future date is entered.
  const dobParsed = parseDob(dob);
  const dobValid = !!dobParsed && !isFutureDob(dobParsed);
  const canAdvance = currentKey !== "dob" || dobValid;

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
              <p className="text-[11px] text-muted-foreground/60">Only what's missing</p>
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
                disabled={saving || !canAdvance}
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
