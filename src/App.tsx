import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { FamilyProvider } from "@/context/FamilyContext";
import { ThemeProvider } from "@/context/ThemeContext";
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
import Invest from "./pages/Invest";
import Execute from "./pages/Execute";
import Discovery from "./pages/Discovery";
import OTP from "./pages/OTP";
import LinkAccounts from "./pages/LinkAccounts";
import AboutYou from "./pages/AboutYou";
import Portfolio from "./pages/Portfolio";
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
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/portfolio/performance" element={<PortfolioPerformance />} />
            <Route path="/portfolio-popup" element={<PortfolioPopup />} />
            <Route path="/voice-onboarding" element={<VoiceOnboarding />} />
            <Route path="/otp" element={<OTP />} />
            <Route path="/link-accounts" element={<LinkAccounts />} />
            <Route path="/onboarding-loading" element={<OnboardingLoading />} />
            <Route path="/about-you" element={<AboutYou />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/invest" element={<Invest />} />
            <Route path="/execute" element={<Execute />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/profile/complete" element={<CompleteProfile />} />
            <Route path="/profile/ips" element={<InvestmentPolicyStatement />} />
            <Route path="/meeting-notes" element={<MeetingNotesIndex />} />
            <Route path="/meeting-notes/detail" element={<MeetingNotes />} />
            <Route path="/rebalancing" element={<Rebalancing />} />
            <Route path="/goal-planner" element={<GoalPlanner />} />
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
