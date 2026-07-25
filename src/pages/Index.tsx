import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import NewOnboardingFlow from "@/components/onboarding/NewOnboardingFlow";
import PortfolioDashboard from "@/components/dashboard/PortfolioDashboard";
import { useAuth } from "@/context/AuthContext";
import { markOnboardingComplete } from "@/lib/api";
import { resolveOnboardingResumeRoute } from "@/lib/onboardingResume";
import { trackOnboardingCompleted } from "@/lib/onboardingAnalytics";

type Screen = "onboarding" | "dashboard";

const Index = () => {
  const navigate = useNavigate();
  const { authenticated, loading, user, refresh } = useAuth();
  const [screen, setScreen] = useState<Screen>("onboarding");
  // True while we're deciding where a returning, unfinished user should resume.
  const [resolvingResume, setResolvingResume] = useState(false);
  // Authenticated users resuming the wizard skip the welcome/phone screens.
  const [startAtQuestions, setStartAtQuestions] = useState(false);

  useEffect(() => {
    if (loading) return;
    const sessionDone = sessionStorage.getItem("onboardingComplete") === "true";
    const backendDone = user?.is_onboarding_complete === true;
    if (authenticated && (sessionDone || backendDone)) {
      setScreen("dashboard");
      return;
    }
    if (authenticated && user && !backendDone && !sessionDone) {
      // Resume an unfinished onboarding exactly where the user left off —
      // resolved from backend state, so it survives any time away:
      //   holdings imported → /about-you · questions answered → /cams-upload ·
      //   otherwise the tell-us wizard right here (questions only, no phone).
      let cancelled = false;
      setResolvingResume(true);
      void resolveOnboardingResumeRoute()
        .then((route) => {
          if (cancelled) return;
          if (route) {
            navigate(route, { replace: true });
          } else {
            setStartAtQuestions(true);
            setResolvingResume(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setStartAtQuestions(true);
            setResolvingResume(false);
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [authenticated, loading, user, navigate]);

  const handleOnboardingComplete = async () => {
    try {
      await markOnboardingComplete();
      await refresh();
    } catch {
      sessionStorage.setItem("onboardingComplete", "true");
    }
    trackOnboardingCompleted();
    setScreen("dashboard");
  };

  if (loading || resolvingResume) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AnimatePresence mode="wait">
        {screen === "onboarding" && (
          <motion.div key="onboarding" exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <NewOnboardingFlow
              onComplete={handleOnboardingComplete}
              startAtQuestions={startAtQuestions}
            />
          </motion.div>
        )}
        {screen === "dashboard" && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            <PortfolioDashboard />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Index;
