import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Briefcase, Calendar, Check, Plus, Target, Wallet, X, ShieldCheck, ChevronDown } from "lucide-react";
import { persistOnboardingProfile, markOnboardingComplete } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface Props {
  onComplete: () => void;
  onBack: () => void;
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
  items, value, onChange, renderLabel,
}: {
  items: number[]; value: number; onChange: (v: number) => void; renderLabel?: (v: number) => string;
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
    if (items[clamped] !== value) onChange(items[clamped]);
  }, [items, value, onChange]);

  return (
    <div className="relative flex-1" style={{ height: ITEM_H * VISIBLE }}>
      <div className="absolute inset-x-1 pointer-events-none z-10 rounded-md bg-primary/6" style={{ top: Math.floor(VISIBLE / 2) * ITEM_H, height: ITEM_H }} />
      <div ref={ref} onScroll={handleScroll} className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide" style={{ scrollSnapType: "y mandatory" }}>
        {Array.from({ length: paddingItems }).map((_, i) => (<div key={`pad-top-${i}`} style={{ height: ITEM_H }} />))}
        {items.map((item) => {
          const idx = items.indexOf(item);
          const selectedIdx = items.indexOf(value);
          const distance = Math.abs(idx - selectedIdx);
          const opacity = distance === 0 ? 1 : 0.15;
          const fontSize = distance === 0 ? "13px" : "11px";
          return (
            <div key={item} className="flex items-center justify-center snap-center transition-all" style={{ height: ITEM_H, opacity, fontWeight: distance === 0 ? 600 : 400, fontSize }} onClick={() => onChange(item)}>
              {renderLabel ? renderLabel(item) : String(item).padStart(2, "0")}
            </div>
          );
        })}
        {Array.from({ length: paddingItems }).map((_, i) => (<div key={`pad-bot-${i}`} style={{ height: ITEM_H }} />))}
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
  label, description, value, onChange, placeholder, subtext,
}: {
  label: string; description?: string; value: number; onChange: (v: number) => void; placeholder?: string; subtext?: string;
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
        value={value > 0 ? value.toLocaleString("en-IN") : ""}
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
  { label: "Buying a home", icon: "🏡" }, { label: "Retiring", icon: "🌴" },
  { label: "Education", icon: "🎓" }, { label: "Marriage", icon: "💍" },
];

const HORIZON_OPTIONS = [
  { label: "< 2 years", sub: "Short-term investments" },
  { label: "2–5 years", sub: "Medium-term growth" },
  { label: "5+ years", sub: "Long-term wealth building" },
];

const INVESTMENT_PREF_OPTIONS = [
  { letter: "A", equity: 10, debt: 90, best: 10, worst: -2, riskLabel: "Conservative" },
  { letter: "B", equity: 30, debt: 70, best: 15, worst: -5, riskLabel: "Moderately conservative" },
  { letter: "C", equity: 50, debt: 50, best: 25, worst: -15, riskLabel: "Balanced" },
  { letter: "D", equity: 70, debt: 30, best: 30, worst: -20, riskLabel: "Moderately aggressive" },
  { letter: "E", equity: 90, debt: 10, best: 40, worst: -30, riskLabel: "Aggressive" },
];



type SectionId = "basic" | "goals" | "income" | "risk";
const SECTION_ORDER: SectionId[] = ["basic", "goals", "income", "risk"];

const TellUsAboutYou = ({ onComplete, onBack }: Props) => {
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
  const [occupation, setOccupation] = useState("");
  const [occupationOther, setOccupationOther] = useState("");

  const [openSection, setOpenSection] = useState<SectionId | null>("basic");

  const isSectionComplete = (id: SectionId): boolean => {
    switch (id) {
      case "basic": return occupation !== "" && (occupation !== "Other" || occupationOther.trim() !== "");
      case "goals": return selectedGoals.length > 0 && horizon !== "";
      case "income": return income > 0 && expense > 0;
      case "risk": return investmentView !== "";
    }
  };

  const allComplete = SECTION_ORDER.every(isSectionComplete);

  // Auto-advance: when the current open section becomes complete, open the next incomplete one
  useEffect(() => {
    if (openSection == null || !isSectionComplete(openSection)) return;
    const currentIdx = SECTION_ORDER.indexOf(openSection);
    for (let i = currentIdx + 1; i < SECTION_ORDER.length; i++) {
      if (!isSectionComplete(SECTION_ORDER[i])) {
        const timer = setTimeout(() => setOpenSection(SECTION_ORDER[i]), 400);
        return () => clearTimeout(timer);
      }
    }
  }, [occupation, occupationOther, selectedGoals, horizon, income, expense, investmentView, openSection]);

  const toggleGoal = (g: string) =>
    setSelectedGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  const addCustomGoal = () => {
    if (newGoalText.trim()) {
      setCustomGoals((prev) => [...prev, newGoalText.trim()]);
      setSelectedGoals((prev) => [...prev, newGoalText.trim()]);
      setNewGoalText("");
      setAddingGoal(false);
    }
  };

  const handleSaveAndContinue = async () => {
    const dob = `${dobYear}-${String(dobMonth).padStart(2, "0")}-${String(dobDay).padStart(2, "0")}`;
    const occupationLabel =
      occupation === "Other" ? occupationOther.trim() : occupation;
    try {
      await persistOnboardingProfile({
        date_of_birth: dob,
        occupation: occupationLabel || undefined,
        selected_goals: selectedGoals,
        custom_goals: customGoals,
        investment_horizon: horizon || undefined,
        annual_income_min: income,
        annual_income_max: income,
        annual_expense_min: expense,
        annual_expense_max: expense,
        risk_choice_letter: investmentView || undefined,
      });
      await markOnboardingComplete();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save your profile.";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
      return;
    }
    onComplete();
  };

  const estSavings = Math.max(0, income - expense);
  const expensePct = income > 0 ? Math.round((expense / income) * 100) : 0;

  const toggleSection = (id: SectionId) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  const sectionHeader = (id: SectionId, icon: React.ReactNode, title: string) => {
    const isOpen = openSection === id;
    const complete = isSectionComplete(id);
    return (
      <button onClick={() => toggleSection(id)} className="flex items-center gap-3 w-full px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
          {icon}
        </div>
        <p className="text-sm font-semibold text-foreground flex-1 text-left">{title}</p>
        <div className="flex items-center gap-2">
          {complete && !isOpen && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
              <Check className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </button>
    );
  };

  return (
    <div className="mobile-container flex flex-col bg-background min-h-screen">
      {/* Stepper */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-0 px-4 pt-8 pb-6 w-full max-w-[340px] mx-auto">
        <div className="flex flex-col items-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
            <Check className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground mt-1.5">Link accounts</span>
          <span className="text-[10px] text-muted-foreground">~90 secs</span>
        </div>
        <div className="flex-1 h-[1.5px] bg-border mx-2 mt-[-22px]" />
        <div className="flex flex-col items-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground">
            <span className="text-xs font-semibold text-primary-foreground">2</span>
          </div>
          <span className="text-[10px] text-foreground font-medium mt-1.5">About you</span>
          <span className="text-[10px] text-muted-foreground">~30 secs</span>
        </div>
      </motion.div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-6 pb-24 overflow-y-auto">
        <div className="mt-4 mb-1">
          <h2 className="text-lg font-semibold text-foreground">Tell us about you</h2>
          <p className="text-xs text-muted-foreground mt-1">Personalise your financial journey</p>
        </div>

        <div className="space-y-3">
          {/* Basic Information */}
          <div className="border rounded-xl bg-card overflow-hidden border-border/60">
            {sectionHeader("basic", <Calendar className="h-[20px] w-[20px] text-muted-foreground" />, "Basic Information")}
            <AnimatePresence initial={false}>
              {openSection === "basic" && (
                <motion.div
                  key="basic-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-5">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2.5">Age</p>
                      <div className="flex gap-1 rounded-xl overflow-hidden bg-secondary/20 p-2 max-w-[260px] mx-auto">
                        <DrumColumn items={DAYS} value={dobDay} onChange={setDobDay} />
                        <DrumColumn items={MONTHS} value={dobMonth} onChange={setDobMonth} renderLabel={(v) => MONTH_LABELS[v]} />
                        <DrumColumn items={YEARS} value={dobYear} onChange={setDobYear} renderLabel={(v) => String(v)} />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2.5">Occupation</p>
                      <div className="flex flex-wrap gap-2">
                        {["Salaried", "Business", "Freelance", "Homemaker", "Retired"].map((opt) => {
                          const isSelected = occupation === opt;
                          return (
                            <button key={opt} onClick={() => { setOccupation(opt); setOccupationOther(""); }}
                              className={`px-3 py-2 rounded-full text-xs font-medium text-center transition-all ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
                              {opt}
                            </button>
                          );
                        })}
                        {occupation === "Other" && occupationOther.trim() ? (
                          <button onClick={() => { setOccupation(""); setOccupationOther(""); }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />{occupationOther}
                          </button>
                        ) : occupation === "Other" ? (
                          <input autoFocus value={occupationOther}
                            onChange={(e) => setOccupationOther(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && occupationOther.trim()) { /* keep Other state */ } }}
                            onBlur={() => { if (!occupationOther.trim()) { setOccupation(""); } }}
                            placeholder="Type occupation"
                            className="px-3 py-2 rounded-full text-xs bg-secondary text-foreground outline-none w-32 border border-border" />
                        ) : (
                          <button onClick={() => setOccupation("Other")}
                            className="flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium bg-secondary text-muted-foreground hover:bg-muted border border-dashed border-border">
                            <Plus className="h-3 w-3" /> Other
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Financial Goals */}
          <div className="border rounded-xl bg-card overflow-hidden border-border/60">
            {sectionHeader("goals", <Target className="h-[20px] w-[20px] text-muted-foreground" />, "Financial Goals")}
            <AnimatePresence initial={false}>
              {openSection === "goals" && (
                <motion.div
                  key="goals-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-5">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2.5">What are your key financial goals?</p>
                      <div className="flex flex-wrap gap-2">
                        {[...DEFAULT_GOALS, ...customGoals.map((g) => ({ label: g, icon: "✦" }))].map((g) => {
                          const isSelected = selectedGoals.includes(g.label);
                          return (
                            <button key={g.label} onClick={() => toggleGoal(g.label)}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
                              {isSelected && <Check className="h-3 w-3" />}
                              <span>{g.icon}</span>
                              {g.label}
                            </button>
                          );
                        })}
                        {addingGoal ? (
                          <input autoFocus value={newGoalText} onChange={(e) => setNewGoalText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { addCustomGoal(); } }}
                            onBlur={() => { if (newGoalText.trim()) { addCustomGoal(); } else { setAddingGoal(false); setNewGoalText(""); } }}
                            placeholder="Type goal"
                            className="px-3 py-2 rounded-full text-xs bg-secondary text-foreground outline-none w-28 border border-border" />
                        ) : (
                          <button onClick={() => setAddingGoal(true)} className="flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium bg-secondary text-muted-foreground hover:bg-muted border border-dashed border-border">
                            <Plus className="h-3 w-3" /> Other
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-2.5">Investment Horizon</p>
                      <div className="flex flex-wrap gap-2">
                        {HORIZON_OPTIONS.map((h) => {
                          const isSelected = horizon === h.label;
                          return (
                            <button key={h.label} onClick={() => setHorizon(h.label)}
                              className={`px-4 py-2.5 rounded-xl text-xs font-medium text-center transition-all ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
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
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Income & Expenses */}
          <div className="border rounded-xl bg-card overflow-hidden border-border/60">
            {sectionHeader("income", <Wallet className="h-[20px] w-[20px] text-muted-foreground" />, "Income & Expenses")}
            <AnimatePresence initial={false}>
              {openSection === "income" && (
                <motion.div
                  key="income-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-5">
                    <NumberInputINR
                      label="Annual income"
                      description="Includes salary and regular income (e.g. rental income)"
                      value={income}
                      onChange={setIncome}
                      placeholder="e.g. 5000000"
                      subtext={income > 0 && expense > 0 ? `Estimated savings: ${formatINR(estSavings)} / year` : undefined}
                    />
                    <NumberInputINR
                      label="Annual expense"
                      description="Excludes all debt obligations (e.g. loans)"
                      value={expense}
                      onChange={setExpense}
                      placeholder="e.g. 1200000"
                      subtext={income > 0 && expense > 0 ? `That's roughly ${expensePct}% of your income` : undefined}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Investment Preference */}
          <div className="border rounded-xl bg-card overflow-hidden border-border/60">
            {sectionHeader("risk", <ShieldCheck className="h-[20px] w-[20px] text-muted-foreground" />, "Investment Preference")}
            <AnimatePresence initial={false}>
              {openSection === "risk" && (
                <motion.div
                  key="risk-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Which scenario best fits your comfort level?</p>
                    <p className="text-[11px] italic text-muted-foreground/80 mb-3 leading-snug">
                      <span className="font-semibold text-foreground/80">Worst</span> = the drop in a bad year, <span className="font-semibold text-foreground/80">Best</span> = the gain in a good one. Higher upside, deeper drawdowns — pick the combination you're most comfortable with.
                    </p>
                    <div className="space-y-2">
                      {INVESTMENT_PREF_OPTIONS.map((opt) => {
                        const isSelected = investmentView === opt.letter;
                        const worstLabel = opt.worst >= 0 ? `${opt.worst}%` : `${opt.worst}%`;
                        return (
                          <button key={opt.letter} onClick={() => setInvestmentView(opt.letter)}
                            className={`w-full text-left px-4 py-3 rounded-xl text-xs font-medium transition-all ${isSelected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"}`}>
                            {opt.letter} — Worst {worstLabel} / Best {opt.best}%
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Fixed bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-md mx-auto flex flex-col items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </button>
          <button onClick={handleSaveAndContinue} disabled={!allComplete}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold tracking-wide transition-all active:scale-[0.98] disabled:pointer-events-none ${allComplete ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"}`}>
            Generate my portfolio ✦
          </button>
        </div>
      </div>
    </div>
  );
};

const AboutYouPage = () => {
  const navigate = useNavigate();
  return (
    <TellUsAboutYou
      onComplete={() => navigate("/onboarding-loading")}
      onBack={() => navigate("/link-accounts")}
    />
  );
};

export default AboutYouPage;
