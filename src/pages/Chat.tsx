import { useSearchParams } from "react-router-dom";
import AIChatPanel from "@/components/chat/AIChatPanel";
import BottomNav from "@/components/BottomNav";

const PORTFOLIO_MESSAGE =
  "Your **recommended** portfolio is built around a diversified mix of Indian equity ETFs (Nifty 50, Next 50, Midcap 150), a US equity allocation via the S&P 500, government bonds through Bharat Bond, and tactical positions in sectoral (PSU Banks, IT) and gold ETFs. This blend suits your risk profile because it balances long-term growth from equities with stability from bonds and inflation protection from gold — all calibrated to your goals and comfort with volatility. The aim is steady, risk-adjusted wealth accumulation while keeping costs low through passive ETFs.\n\nFeel free to ask me anything about your portfolio.";

const Chat = () => {
  const [searchParams] = useSearchParams();
  const goalPlanningDemo = searchParams.get("mode") === "goal-planning";
  const fromExecute = searchParams.get("from") === "execute" && !goalPlanningDemo;

  return (
    <div className="mobile-container h-dvh bg-background flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden min-h-0 pb-[calc(56px+env(safe-area-inset-bottom,8px))]">
        <AIChatPanel
          isOpen={true}
          onClose={() => {}}
          embedded
          chatFirst
          goalPlanningDemo={goalPlanningDemo}
          initialAiMessage={fromExecute ? PORTFOLIO_MESSAGE : undefined}
          showBackToInvest={fromExecute}
        />
      </div>
      <BottomNav />
    </div>
  );
};

export default Chat;
