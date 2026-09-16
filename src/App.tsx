import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { FamilyProvider } from "@/context/FamilyContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { capturePageview, identifyUser, resetUser } from "@/lib/posthog";

/** Emit a PostHog pageview on every client-side route change. */
function PostHogPageView() {
  const location = useLocation();
  useEffect(() => {
    capturePageview();
  }, [location]);
  return null;
}

/**
 * Auth gate for every app page: the token is verified against the backend
 * (AuthContext → getMe(); a stale/invalid token is cleared), so typing a URL
 * by hand never renders a page without a valid session — visitors are
 * redirected to "/" (welcome / sign-in) instead.
 */
function RequireAuth() {
  const { authenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!authenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Second gate for the app proper: a signed-in user who hasn't FINISHED the
 * initial onboarding (CAMS import → about-you) can't deep-link into
 * app pages — they're sent to "/" where the resume logic drops them at their
 * exact onboarding step. The onboarding routes themselves sit outside this
 * gate (auth-only), so the flow can actually be completed.
 */
function RequireOnboarded() {
  const { user } = useAuth();
  let sessionDone = false;
  try {
    sessionDone = sessionStorage.getItem("onboardingComplete") === "true";
  } catch {
    /* private mode */
  }
  if (user?.is_onboarding_complete !== true && !sessionDone) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

/** Keep the PostHog identity in sync with the authenticated user. */
function PostHogIdentify() {
  const { user } = useAuth();
  const lastIdentified = useRef<string | null>(null);
  useEffect(() => {
    if (user) {
      if (lastIdentified.current !== user.id) {
        identifyUser(user);
        lastIdentified.current = user.id;
      }
    } else if (lastIdentified.current) {
      resetUser(); // user signed out
      lastIdentified.current = null;
    }
  }, [user]);
  return null;
}
import BetaBanner from "@/components/BetaBanner";
import ReportIssueFab from "@/components/ReportIssueFab";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
import CompleteProfile from "./pages/CompleteProfile";
import Profile from "./pages/Profile";
import CasStatements from "./pages/CasStatements";
import AccountCenter from "./pages/AccountCenter";
import SensitiveChange from "./pages/SensitiveChange";
import ComingSoon from "./pages/ComingSoon";
import ResetPin from "./pages/ResetPin";
import Chat from "./pages/Chat";
import GoalsTimeline from "./pages/GoalsTimeline";
import SipPlanner from "./pages/SipPlanner";
import LumpSumPlanner from "./pages/LumpSumPlanner";
import InvestLayout from "@/components/invest/InvestLayout";
import RebalanceExplanation from "./pages/RebalanceExplanation";
import RebalancingHowItWorks from "./pages/RebalancingHowItWorks";
import InvestingHowItWorks from "./pages/InvestingHowItWorks";
import Discovery from "./pages/Discovery";
import MfAllFunds from "./pages/MfAllFunds";
import MfCompare from "./pages/MfCompare";
import MfFundDetail from "./pages/MfFundDetail";
// Zoom team-call feature disabled for now — keep the code, don't delete.
// import AdvisorMeetings from "./pages/AdvisorMeetings";
import CamsUpload from "./pages/CamsUpload";
import AboutYou from "./pages/AboutYou";
import Portfolio from "./pages/Portfolio";
import PortfolioFundDetail from "./pages/PortfolioFundDetail";
import OnboardingLoading from "./pages/OnboardingLoading";
// Family sharing is locked — /family serves ComingSoon. The page is kept in
// the tree; restore this import and the route below to turn it back on.
// import FamilyMembers from "./pages/FamilyMembers";
import LiquidFunds from "./pages/LiquidFunds";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AuthProvider>
      <FamilyProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <PostHogPageView />
          <PostHogIdentify />
          <BetaBanner />
          <ReportIssueFab />
          <Routes>
            {/* Public entry — hosts sign-in/sign-up; everything else requires a
                valid, backend-verified session (see RequireAuth). */}
            <Route path="/" element={<Index />} />
            <Route element={<RequireAuth />}>
            {/* Onboarding steps — need a valid session, but must stay reachable
                BEFORE onboarding is complete. */}
            <Route path="/cams-upload" element={<CamsUpload />} />
            <Route path="/onboarding-loading" element={<OnboardingLoading />} />
            <Route path="/about-you" element={<AboutYou />} />
            {/* App pages — valid session AND completed onboarding. */}
            <Route element={<RequireOnboarded />}>
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/portfolio/fund/:schemeCode" element={<PortfolioFundDetail />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/account" element={<AccountCenter />} />
            <Route path="/account/pin" element={<ResetPin />} />
            {/* One screen per sensitive change — see SensitiveChange. Declared
                after /account/pin so that literal path wins over :field. */}
            <Route path="/account/:field" element={<SensitiveChange />} />
            <Route path="/cas-statements" element={<CasStatements />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/notifications" element={<Notifications />} />
            {/* Invest section — layout route so the top toggle (InvestTabs)
                persists across Rebalancing ↔ SIP (enables the sliding pill). */}
            <Route path="/invest" element={<InvestLayout />}>
              <Route index element={<Navigate to="/invest/rebalance-explanation" replace />} />
              <Route path="rebalance-explanation" element={<RebalanceExplanation />} />
              <Route path="sip" element={<SipPlanner />} />
              <Route path="lumpsum" element={<LumpSumPlanner />} />
            </Route>
            {/* Rebalancing explainer — sits OUTSIDE the layout above on purpose:
                no InvestTabs entry matches it, so it carries its own back header
                rather than rendering the toggle with nothing selected. */}
            <Route path="/invest/how-it-works" element={<RebalancingHowItWorks />} />
            {/* Buy-side explainer, shared by the SIP and Lump sum tabs (?from= picks
                which one the back arrow returns to). Outside the layout for the
                same reason as the rebalancing explainer above. */}
            <Route path="/invest/how-investing-works" element={<InvestingHowItWorks />} />
            {/* Back-compat: old flat rebalancing/execute URLs redirect into the invest section */}
            <Route path="/execute" element={<Navigate to="/invest/rebalance-explanation" replace />} />
            <Route path="/rebalancing" element={<Navigate to="/invest/rebalance-explanation" replace />} />
            <Route path="/rebalance-explanation" element={<Navigate to="/invest/rebalance-explanation" replace />} />
            <Route path="/rebalance-explanation/trade/:tradeId" element={<Navigate to="/invest/rebalance-explanation" replace />} />
            <Route path="/discovery/compare" element={<MfCompare />} />
            <Route path="/discovery/mf/:schemeCode" element={<MfFundDetail />} />
            <Route path="/discovery/mf" element={<MfAllFunds />} />
            <Route path="/discovery" element={<Discovery />} />
            {/* Zoom team-call feature disabled for now */}
            {/* <Route path="/advisor-meetings" element={<AdvisorMeetings />} /> */}
            {/* Profile-completion onboarding: one mounted page (pathless layout
                route) whose URL names the open section, so each step is linkable
                and survives browser back/forward without reloading the page. */}
            <Route element={<CompleteProfile />}>
              <Route path="/profile/complete" element={null} />
              <Route path="/profile/financial-picture" element={null} />
              <Route path="/profile/goals" element={null} />
              <Route path="/profile/investment-preferences" element={null} />
              <Route path="/profile/tax-details" element={null} />
            </Route>
            <Route path="/goal-planner" element={<GoalsTimeline variant="tornado" />} />
            <Route path="/goal-planner/cards" element={<Navigate to="/goal-planner" replace />} />
            <Route path="/goal-planner/timeline" element={<GoalsTimeline />} />
            <Route path="/goal-planner/timeline-2" element={<GoalsTimeline variant="tornado" />} />
            {/* Family sharing is locked. The route serves ComingSoon instead of
                FamilyMembers so none of that page's fetches or writes run;
                FamilyMembers itself is left untouched, so re-enabling it is
                this one line. */}
            <Route
              path="/family"
              element={
                <ComingSoon
                  title="Family"
                  blurb="Invite the people you plan with, see a combined picture of the household, and switch between their portfolios. We're still building it."
                />
              }
            />
            <Route path="/liquid-funds" element={<LiquidFunds />} />
            </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </FamilyProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
