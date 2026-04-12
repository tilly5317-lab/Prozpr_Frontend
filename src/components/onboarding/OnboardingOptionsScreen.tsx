import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight, User, Link2, Check, Pencil } from "lucide-react";

interface OnboardingOptionsScreenProps {
  onSelectTellUs: () => void;
  onSelectLink: () => void;
  onContinueToPortfolio: () => void;
}

const OnboardingOptionsScreen = ({ onSelectTellUs, onSelectLink, onContinueToPortfolio }: OnboardingOptionsScreenProps) => {
  const [completedFlows, setCompletedFlows] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkCompletion = () => {
      const completed = new Set<string>();
      if (sessionStorage.getItem("completedTellUs") === "true") completed.add("tellus");
      if (sessionStorage.getItem("completedLinkAccounts") === "true") completed.add("link");
      setCompletedFlows(completed);
    };
    checkCompletion();
    window.addEventListener("storage", checkCompletion);
    return () => window.removeEventListener("storage", checkCompletion);
  }, []);

  const options = [
    { id: "tellus" as const, icon: User, label: "Tell us about you", subtext: "Takes less than 1 min", onClick: onSelectTellUs },
    { id: "link" as const, icon: Link2, label: "Link your accounts", subtext: "Takes less than 1 min", onClick: onSelectLink },
  ];

  return (
    <div className="mobile-container flex flex-col bg-background px-6 pb-6 pt-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex flex-col"
      >
        <h1 className="font-display text-[2.25rem] leading-[1.1] tracking-tight text-foreground mb-10">
          Let's get started, Bonnie
        </h1>

        <div className="space-y-3 mb-auto">
          {options.map((option, i) => {
            const isCompleted = completedFlows.has(option.id);
            return (
              <motion.div
                key={option.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                onClick={option.onClick}
                className={`flex items-center gap-3 rounded-xl pl-4 pr-4 py-4 border-2 transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                  isCompleted
                    ? "border-accent/30 bg-accent/5 hover:border-accent/50"
                    : "border-border/60 bg-card hover:border-border/80"
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                  isCompleted ? "bg-accent/20" : "bg-muted"
                }`}>
                  <option.icon className={`h-4.5 w-4.5 transition-colors duration-200 ${
                    isCompleted ? "text-accent" : "text-muted-foreground"
                  }`} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-foreground tracking-tight">{option.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{option.subtext}</p>
                </div>
                {isCompleted ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 bg-accent/20 text-accent text-xs font-semibold">
                      <Check className="h-3.5 w-3.5" />
                      Done
                    </div>
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl wealth-gradient px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">
                    Go
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-6"
        >
          <button
            onClick={() => {
              sessionStorage.setItem("onboardingComplete", "true");
              onContinueToPortfolio();
            }}
            className="w-full flex items-center justify-center gap-2 rounded-2xl wealth-gradient py-3.5 text-sm font-semibold text-primary-foreground shadow-wealth-lg transition-all active:scale-[0.98] hover:shadow-xl"
          >
            Load Portfolio
            <ArrowRight className="h-4.5 w-4.5" />
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default OnboardingOptionsScreen;
