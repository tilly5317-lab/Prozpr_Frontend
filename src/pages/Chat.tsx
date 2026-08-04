import { useSearchParams } from "react-router-dom";
import AIChatPanel from "@/components/chat/AIChatPanel";
import BottomNav from "@/components/BottomNav";

const Chat = () => {
  const [searchParams] = useSearchParams();
  const goalPlanningDemo = searchParams.get("mode") === "goal-planning";

  return (
    <div className="mobile-container h-dvh bg-background flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden min-h-0 pb-[calc(56px+env(safe-area-inset-bottom,8px))]">
        <AIChatPanel
          isOpen={true}
          onClose={() => {}}
          embedded
          chatFirst
          goalPlanningDemo={goalPlanningDemo}
        />
      </div>
      <BottomNav />
    </div>
  );
};

export default Chat;
