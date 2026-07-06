import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import NewOnboardingFlow from "@/components/onboarding/NewOnboardingFlow";
import PortfolioDashboard from "@/components/dashboard/PortfolioDashboard";
import { useAuth } from "@/context/AuthContext";
import { markOnboardingComplete } from "@/lib/api";
import { trackOnboardingCompleted } from "@/lib/onboardingAnalytics";

type Screen = "onboarding" | "dashboard";

const Index = () => {
  const navigate = useNavigate();
  const { authenticated, loading, user, refresh } = useAuth();
  const [screen, setScreen] = useState<Screen>("onboarding");

  useEffect(() => {
    if (loading) return;
    const sessionDone = sessionStorage.getItem("onboardingComplete") === "true";
    const backendDone = user?.is_onboarding_complete === true;
    if (authenticated && (sessionDone || backendDone)) {
      setScreen("dashboard");
      return;
    }
    if (authenticated && user && !backendDone && !sessionDone) {
      navigate("/link-accounts", { replace: true });
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

  if (loading) {
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
            <NewOnboardingFlow onComplete={handleOnboardingComplete} />
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
