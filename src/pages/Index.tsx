import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
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
      //   holdings imported / CAMS deferred → /about-you · otherwise the CAMS
      //   step. Onboarding never runs on this route once the account exists, so
      //   an authenticated, unfinished user is always sent onward.
      let cancelled = false;
      setResolvingResume(true);
      void resolveOnboardingResumeRoute()
        .then((route) => {
          if (!cancelled) navigate(route, { replace: true });
        })
        .catch(() => {
          if (!cancelled) navigate("/cams-upload", { replace: true });
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
            {/* Account setup (phone → PIN → name/email). It hands off to the
                first onboarding step itself; `onNext` is only its fallback when
                resume resolution fails. */}
            <WelcomeScreen
              onNext={() => navigate("/cams-upload")}
              onExistingUserLogin={handleOnboardingComplete}
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
