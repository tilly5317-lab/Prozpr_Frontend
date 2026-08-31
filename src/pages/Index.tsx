import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import WelcomeScreen from "@/components/onboarding/WelcomeScreen";
import { useAuth } from "@/context/AuthContext";
import { markOnboardingComplete } from "@/lib/api";
import { resolveOnboardingResumeRoute } from "@/lib/onboardingResume";
import { trackOnboardingCompleted } from "@/lib/onboardingAnalytics";

/** Session fallback set when the backend "onboarding complete" write fails. */
function sessionOnboardingDone(): boolean {
  try {
    return sessionStorage.getItem("onboardingComplete") === "true";
  } catch {
    return false; // private mode
  }
}

const Index = () => {
  const navigate = useNavigate();
  const { authenticated, loading, user, refresh } = useAuth();
  // True while we're deciding where a returning, unfinished user should resume.
  const [resolvingResume, setResolvingResume] = useState(false);

  // Mirrors RequireOnboarded in App.tsx — a finished user belongs on /portfolio.
  const onboarded =
    authenticated && (user?.is_onboarding_complete === true || sessionOnboardingDone());

  useEffect(() => {
    if (loading || onboarded) return;
    if (authenticated && user) {
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
  }, [authenticated, loading, onboarded, user, navigate]);

  const handleOnboardingComplete = async () => {
    try {
      await markOnboardingComplete();
      await refresh();
    } catch {
      sessionStorage.setItem("onboardingComplete", "true");
    }
    trackOnboardingCompleted();
    navigate("/portfolio", { replace: true });
  };

  if (loading || resolvingResume) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The dashboard has its own route. Landing on it by URL (instead of rendering
  // it inline here) keeps location.pathname honest, which is what BottomNav
  // reads to decide which tab is active — otherwise the very first view of the
  // portfolio sits on "/" with no tab highlighted until the user navigates.
  if (onboarded) return <Navigate to="/portfolio" replace />;

  return (
    <div className="min-h-screen bg-background">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        {/* Account setup (phone → PIN → name/email). It hands off to the
            first onboarding step itself; `onNext` is only its fallback when
            resume resolution fails. */}
        <WelcomeScreen
          onNext={() => navigate("/cams-upload")}
          onExistingUserLogin={handleOnboardingComplete}
        />
      </motion.div>
    </div>
  );
};

export default Index;
