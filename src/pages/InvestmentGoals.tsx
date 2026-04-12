import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { getInvestmentProfile, updateInvestmentProfile, BackendOfflineError } from "@/lib/api";

const goalOptions = [
  { label: "Financial Freedom", desc: "Build lasting independence and flexibility." },
  { label: "Early Retirement", desc: "Create the option to stop working sooner." },
  { label: "Growing Long-Term Wealth", desc: "Compound capital steadily over time." },
  { label: "Passive Income", desc: "Generate consistent income from investments." },
  { label: "A Major Life Milestone", desc: "Prepare for an important future event." },
  { label: "Just Getting Started", desc: "Establish a strong financial foundation." },
];

const horizonAnchors = [
  { range: "0–3 years", label: "Building momentum" },
  { range: "3–10 years", label: "Growing steadily" },
  { range: "10+ years", label: "Compounding for the long run" },
];

const fireConfetti = () => {
  const colors = ["#1e3a5f", "#3b82f6", "#ffffff", "#f59e0b"];
  confetti({ particleCount: 80, spread: 70, origin: { y: 0.9 }, colors });
  setTimeout(() => { confetti({ particleCount: 50, spread: 90, origin: { y: 0.85, x: 0.4 }, colors }); }, 200);
};

const HORIZON_TO_TIMELINE: Record<number, string> = {
  0: "0-3 years",
  1: "3-10 years",
  2: "10+ years",
};

const TIMELINE_TO_HORIZON: Record<string, number> = {
  "0-3 years": 0,
  "3-10 years": 1,
  "10+ years": 2,
};

const InvestmentGoals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { editing?: boolean } | null;
  const isEditing = state?.editing === true;

  const [step, setStep] = useState(0);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [horizon, setHorizon] = useState(1);
  const [horizonTouched, setHorizonTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [originalGoals, setOriginalGoals] = useState<string[]>([]);
  const [originalHorizon, setOriginalHorizon] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const ip = await getInvestmentProfile();
        if (ip.objectives?.length) {
          setSelectedGoals(ip.objectives);
          setOriginalGoals(ip.objectives);
        }
        if (ip.target_timeline) {
          const idx = TIMELINE_TO_HORIZON[ip.target_timeline];
          if (idx != null) {
            setHorizon(idx);
            setHorizonTouched(true);
            setOriginalHorizon(idx);
          }
        }
      } catch {
        // no profile yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const handleHorizonChange = (v: number[]) => { setHorizon(v[0]); if (!horizonTouched) setHorizonTouched(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateInvestmentProfile({
        objectives: selectedGoals.length ? selectedGoals : null,
        target_timeline: HORIZON_TO_TIMELINE[horizon] ?? null,
      });
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(`Failed to save: ${err instanceof Error ? err.message : "unknown error"}`);
      setSaving(false);
      return;
    }
    setSaving(false);

    if (isEditing) {
      const changed = JSON.stringify(selectedGoals.sort()) !== JSON.stringify([...originalGoals].sort()) || horizon !== originalHorizon;
      navigate(`/profile/complete?${changed ? "updated=goals" : ""}`, { replace: true });
    } else {
      fireConfetti();
      setTimeout(() => { navigate("/profile/complete?completed=goals", { replace: true }); }, 800);
    }
  };

  if (!loaded) {
    return (
      <div className="mobile-container min-h-screen flex items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  return (
    <div className="mobile-container min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="px-5 pt-10 pb-1 flex items-center justify-between">
        <button onClick={() => (step === 0 ? navigate(-1) : setStep(0))} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <span className="text-xs font-medium text-muted-foreground tracking-wide">Step {step + 1} of 2</span>
        <div className="w-8" />
      </div>

      {/* Step indicator */}
      <div className="px-5 pt-1.5 pb-5 flex gap-2">
        <div className="h-[3px] flex-1 rounded-full bg-border">
          <div className="h-full rounded-full bg-foreground transition-all duration-500" style={{ width: "100%" }} />
        </div>
        <div className="h-[3px] flex-1 rounded-full bg-border">
          <div className="h-full rounded-full bg-foreground transition-all duration-500" style={{ width: step >= 1 ? "100%" : "0%" }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="goal-step" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: "easeOut" }} className="flex-1 flex flex-col px-5">
            <div className="mb-5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground leading-tight mb-1">
                {isEditing ? "Update your investment goal" : "What are we building toward?"}
              </h1>
              <p className="text-sm text-muted-foreground">Choose all goals that matter to you.</p>
            </div>

            <div className="flex-1 space-y-2 pb-3">
              {goalOptions.map((option, i) => {
                const active = selectedGoals.includes(option.label);
                return (
                  <motion.button key={option.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}
                    onClick={() => setSelectedGoals(prev => prev.includes(option.label) ? prev.filter(g => g !== option.label) : [...prev, option.label])}
                    className={`w-full text-left rounded-xl px-4 py-3 transition-all duration-200 border-2 ${active ? "border-foreground bg-foreground/[0.04]" : "border-transparent bg-card hover:bg-muted/60"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold tracking-tight text-foreground">{option.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{option.desc}</p>
                      </div>
                      {active && (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground ml-3">
                          <Check className="h-3 w-3 text-background" />
                        </motion.div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className="pb-8 pt-3">
              <button onClick={() => setStep(1)} disabled={selectedGoals.length === 0}
                className={`w-full rounded-xl py-3 text-sm font-semibold tracking-tight transition-all duration-300 ${selectedGoals.length > 0 ? "bg-foreground text-background hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
              >Continue</button>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="horizon-step" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.3, ease: "easeOut" }} className="flex-1 flex flex-col px-5">
            <div className="mb-8">
              <h1 className="text-xl font-semibold tracking-tight text-foreground leading-tight mb-1">
                {isEditing ? "Update your time horizon" : "When do you want your money to work for you?"}
              </h1>
              <p className="text-sm text-muted-foreground">Drag the slider to set your investment timeline.</p>
            </div>

            <div className="flex-1 flex flex-col justify-center">
              <div className="text-center mb-8">
                <motion.p key={`range-${horizon}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1.5">
                  {horizonAnchors[horizon].range}
                </motion.p>
                <motion.h2 key={`label-${horizon}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-lg font-semibold tracking-tight text-foreground">
                  {horizonAnchors[horizon].label}
                </motion.h2>
              </div>

              <div className="px-2">
                <Slider value={[horizon]} onValueChange={handleHorizonChange} min={0} max={2} step={1} className="mb-4" />
                <div className="flex justify-between">
                  {horizonAnchors.map((anchor, idx) => (
                    <span key={anchor.range} className={`text-[10px] font-medium transition-colors duration-300 ${idx === horizon ? "text-foreground" : "text-muted-foreground/40"}`}>
                      {anchor.range}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pb-8 pt-4">
              <button onClick={handleSave} disabled={!horizonTouched}
                className={`w-full rounded-xl py-3 text-sm font-semibold tracking-tight transition-all duration-300 ${horizonTouched ? "bg-foreground text-background hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
              >{isEditing ? "Save Changes" : "Save & Continue"}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InvestmentGoals;
