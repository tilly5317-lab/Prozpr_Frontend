import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import Chat from "./pages/Chat";
import MeetingNotes from "./pages/MeetingNotes";
import MeetingNotesIndex from "./pages/MeetingNotesIndex";
import GoalPlanner from "./pages/GoalPlanner";
import GoalsTimeline from "./pages/GoalsTimeline";
import SipPlanner from "./pages/SipPlanner";
import LumpSumPlanner from "./pages/LumpSumPlanner";
import InvestLayout from "@/components/invest/InvestLayout";
import Execute from "./pages/Execute";
import RebalanceExplanation from "./pages/RebalanceExplanation";
import Discovery from "./pages/Discovery";
import MfAllFunds from "./pages/MfAllFunds";
import MfCompare from "./pages/MfCompare";
import MfFundDetail from "./pages/MfFundDetail";
// Zoom team-call feature disabled for now — keep the code, don't delete.
// import AdvisorMeetings from "./pages/AdvisorMeetings";
import CamsUpload from "./pages/CamsUpload";
import LinkAccounts from "./pages/LinkAccounts";
import AboutYou from "./pages/AboutYou";
import Portfolio from "./pages/Portfolio";
import PortfolioFundDetail from "./pages/PortfolioFundDetail";
import OnboardingLoading from "./pages/OnboardingLoading";
import FamilyMembers from "./pages/FamilyMembers";

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
            <Route path="/" element={<Index />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/portfolio/fund/:schemeCode" element={<PortfolioFundDetail />} />
            <Route path="/cams-upload" element={<CamsUpload />} />
            <Route path="/link-accounts" element={<LinkAccounts />} />
            <Route path="/onboarding-loading" element={<OnboardingLoading />} />
            <Route path="/about-you" element={<AboutYou />} />
            <Route path="/profile" element={<Profile />} />
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
            <Route path="/execute" element={<Execute />} />
            <Route path="/excecute" element={<Execute />} />
            {/* Back-compat: old flat rebalancing URLs redirect into the invest section */}
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
            <Route path="/meeting-notes" element={<MeetingNotesIndex />} />
            <Route path="/meeting-notes/detail" element={<MeetingNotes />} />
            <Route path="/rebalancing" element={<Execute />} />
            <Route path="/goal-planner" element={<GoalsTimeline variant="tornado" />} />
            <Route path="/goal-planner/cards" element={<GoalPlanner />} />
            <Route path="/goal-planner/timeline" element={<GoalsTimeline />} />
            <Route path="/goal-planner/timeline-2" element={<GoalsTimeline variant="tornado" />} />
            <Route path="/family" element={<FamilyMembers />} />
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
