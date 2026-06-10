import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { FamilyProvider } from "@/context/FamilyContext";
import { ThemeProvider } from "@/context/ThemeContext";
import BetaBanner from "@/components/BetaBanner";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Notifications from "./pages/Notifications";
import CompleteProfile from "./pages/CompleteProfile";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import InvestmentPolicyStatement from "./pages/InvestmentPolicyStatement";
import MeetingNotes from "./pages/MeetingNotes";
import MeetingNotesIndex from "./pages/MeetingNotesIndex";
import Rebalancing from "./pages/Rebalancing";
import GoalPlanner from "./pages/GoalPlanner";
import GoalsTimeline from "./pages/GoalsTimeline";
import Invest from "./pages/Invest";
import Execute from "./pages/Execute";
import RebalanceExplanation from "./pages/RebalanceExplanation";
import RebalanceTradeDetail from "./pages/RebalanceTradeDetail";
import Discovery from "./pages/Discovery";
import MfAllFunds from "./pages/MfAllFunds";
import MfCompare from "./pages/MfCompare";
import MfFundDetail from "./pages/MfFundDetail";
import AdvisorMeetings from "./pages/AdvisorMeetings";
import OTP from "./pages/OTP";
import CamsUpload from "./pages/CamsUpload";
import LinkAccounts from "./pages/LinkAccounts";
import AboutYou from "./pages/AboutYou";
import Portfolio from "./pages/Portfolio";
import PortfolioFundDetail from "./pages/PortfolioFundDetail";
import PortfolioPopup from "./pages/PortfolioPopup";
import PortfolioPerformance from "./pages/PortfolioPerformance";
import VoiceOnboarding from "./pages/VoiceOnboarding";
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
          <BetaBanner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/portfolio/fund/:schemeCode" element={<PortfolioFundDetail />} />
            <Route path="/portfolio/performance" element={<PortfolioPerformance />} />
            <Route path="/portfolio-popup" element={<PortfolioPopup />} />
            <Route path="/voice-onboarding" element={<VoiceOnboarding />} />
            <Route path="/otp" element={<OTP />} />
            <Route path="/cams-upload" element={<CamsUpload />} />
            <Route path="/link-accounts" element={<LinkAccounts />} />
            <Route path="/onboarding-loading" element={<OnboardingLoading />} />
            <Route path="/about-you" element={<AboutYou />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/invest" element={<Invest />} />
            <Route path="/execute" element={<Execute />} />
            <Route path="/excecute" element={<Execute />} />
            <Route path="/rebalance-explanation" element={<RebalanceExplanation />} />
            <Route path="/rebalance-explanation/trade/:tradeId" element={<RebalanceTradeDetail />} />
            <Route path="/discovery/compare" element={<MfCompare />} />
            <Route path="/discovery/mf/:schemeCode" element={<MfFundDetail />} />
            <Route path="/discovery/mf" element={<MfAllFunds />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/advisor-meetings" element={<AdvisorMeetings />} />
            <Route path="/profile/complete" element={<CompleteProfile />} />
            <Route path="/profile/ips" element={<InvestmentPolicyStatement />} />
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
