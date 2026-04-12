import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import NewOnboardingFlow from "@/components/onboarding/NewOnboardingFlow";
import PortfolioDashboard from "@/components/dashboard/PortfolioDashboard";
import { useAuth } from "@/context/AuthContext";

type Screen = "onboarding" | "dashboard";

const Index = () => {
  const { authenticated, loading } = useAuth();
  const [screen, setScreen] = useState<Screen>("onboarding");

  useEffect(() => {
    if (loading) return;
    const hasCompletedOnboarding = sessionStorage.getItem("onboardingComplete") === "true";
    if (authenticated && hasCompletedOnboarding) {
      setScreen("dashboard");
    }
  }, [authenticated, loading]);

  const handleOnboardingComplete = () => {
    sessionStorage.setItem("onboardingComplete", "true");
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
