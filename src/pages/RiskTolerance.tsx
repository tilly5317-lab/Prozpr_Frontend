import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { getRiskProfile, updateRiskProfile, RISK_CATEGORIES, BackendOfflineError } from "@/lib/api";

const riskOptions = RISK_CATEGORIES.map((label, i) => ({
  label,
  emoji: ["🛡️", "🌿", "⚖️", "🚀", "⚡"][i],
}));

const dipReactions = [
  { label: "Wait it out", emoji: "😌", desc: "I trust the long game" },
  { label: "Check once and move on", emoji: "👀", desc: "I stay informed, not obsessed" },
  { label: "I see opportunity", emoji: "🚀", desc: "Time to buy the dip" },
];

const fireConfetti = () => {
  const colors = ["#1e3a5f", "#3b82f6", "#ffffff", "#f59e0b"];
  confetti({ particleCount: 80, spread: 70, origin: { y: 0.9 }, colors });
  setTimeout(() => { confetti({ particleCount: 50, spread: 90, origin: { y: 0.85, x: 0.4 }, colors }); }, 200);
};

const RiskTolerance = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { editing?: boolean } | null;
  const isEditing = state?.editing === true;

  const [step, setStep] = useState(0);
  const [riskLevel, setRiskLevel] = useState(1);
  const [sliderTouched, setSliderTouched] = useState(false);
  const [dipReaction, setDipReaction] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [originalRisk, setOriginalRisk] = useState<number | null>(null);
  const [originalDip, setOriginalDip] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rp = await getRiskProfile();
        if (rp.risk_level != null) {
          setRiskLevel(rp.risk_level);
          setSliderTouched(true);
          setOriginalRisk(rp.risk_level);
        }
        if (rp.drop_reaction) {
          setDipReaction(rp.drop_reaction);
          setOriginalDip(rp.drop_reaction);
        }
      } catch {
        // no existing profile
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRiskProfile({
        risk_level: riskLevel,
        drop_reaction: dipReaction || null,
      });
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(`Failed to save risk profile: ${err instanceof Error ? err.message : "unknown error"}`);
      setSaving(false);
      return;
    }
    setSaving(false);

    if (isEditing) {
      const changed = riskLevel !== originalRisk || dipReaction !== originalDip;
      navigate(`/profile/complete?${changed ? "updated=risk" : ""}`, { replace: true });
    } else {
      fireConfetti();
      setTimeout(() => { navigate("/profile/complete?completed=risk", { replace: true }); }, 800);
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
        <button onClick={() => (step === 0 ? navigate(-1) : setStep(0))} className="flex h-8 w-8 items-center justify-center rounded-full bg-background/60 backdrop-blur-sm hover:bg-background/80 transition-colors">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <span className="text-xs font-medium text-muted-foreground">{step + 1} of 2</span>
        <div className="w-8" />
      </div>

      {/* Step indicator */}
      <div className="px-5 pt-1.5 pb-4 flex gap-2">
        <div className="h-1 flex-1 rounded-full bg-foreground/20">
          <div className="h-full rounded-full bg-foreground/70 transition-all duration-300" style={{ width: "100%" }} />
        </div>
        <div className="h-1 flex-1 rounded-full bg-foreground/20">
          <div className="h-full rounded-full bg-foreground/70 transition-all duration-300" style={{ width: step >= 1 ? "100%" : "0%" }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="step1" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="flex-1 flex flex-col px-5">
            <div className="flex-1 flex flex-col justify-center">
              <h1 className="text-xl font-bold text-foreground leading-tight mb-1.5">
                {isEditing ? "Update your\nrisk profile" : "How comfortable\nare you with risk?"}
              </h1>
              <p className="text-sm text-muted-foreground mb-5">There's no right answer — just yours.</p>

              <div className="grid grid-cols-2 gap-2.5">
                {riskOptions.map((option, idx) => {
                  const active = riskLevel === idx;
                  return (
                    <motion.button key={option.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.06, duration: 0.3 }}
                      onClick={() => { setRiskLevel(idx); if (!sliderTouched) setSliderTouched(true); }}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl text-center transition-all duration-200 border-2 ${active ? "border-accent bg-accent/[0.06]" : "border-border bg-card hover:bg-muted/40"}`}
                    >
                      <span className="text-2xl">{option.emoji}</span>
                      <p className={`text-xl font-bold tracking-tight ${active ? "text-accent" : "text-foreground"}`}>{option.label}</p>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="pb-8 pt-4">
              <button onClick={() => setStep(1)} className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all duration-300 bg-foreground text-background hover:opacity-90">
                Next →
              </button>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }} transition={{ duration: 0.3 }} className="flex-1 flex flex-col px-5">
            <div className="mb-5">
              <h1 className="text-xl font-bold text-foreground leading-tight mb-1.5">
                {isEditing ? "Review your\nreaction" : "Markets just\ndropped 20%."}
              </h1>
              <p className="text-sm text-muted-foreground">What's your gut reaction?</p>
            </div>

            <div className="flex-1 space-y-2.5">
              {dipReactions.map((r, i) => {
                const active = dipReaction === r.label;
                return (
                  <motion.button key={r.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1, duration: 0.3 }}
                    onClick={() => setDipReaction(r.label)}
                    className={`w-full flex items-center gap-3.5 rounded-2xl px-4 py-4 text-left transition-all duration-200 ${active ? "bg-primary/10 border-2 border-primary" : "bg-card border-2 border-transparent hover:border-border"}`}
                  >
                    <span className="text-2xl">{r.emoji}</span>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{r.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                    </div>
                    {active && (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>

            <div className="pb-8 pt-4">
              <button onClick={handleSave} className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all duration-300 bg-foreground text-background hover:opacity-90">
                {isEditing ? "Save Changes" : "Save & Continue"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RiskTolerance;
