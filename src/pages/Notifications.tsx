import { motion } from "framer-motion";
import { Gift, ChevronRight, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

const Notifications = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Notifications</h1>
      </div>

      <div className="px-5">
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          onClick={() => navigate("/profile/complete")}
          className="w-full text-left wealth-card !p-4 border border-accent/15 relative overflow-hidden"
        >
          <div className="absolute top-2.5 right-2.5">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">New</span>
          </div>
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <Gift className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1 pr-8">
              <p className="text-sm font-semibold text-foreground mb-0.5">Tell us more about you and get rewarded!</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Tap to complete your investor profile and unlock personalised insights.</p>
            </div>
          </div>
          <div className="flex items-center justify-end mt-2">
            <span className="text-[11px] font-medium text-accent flex items-center gap-0.5">
              Complete now <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="w-full text-left wealth-card !p-4 border border-accent/15 relative overflow-hidden mt-3"
        >
          <div className="absolute top-2.5 right-2.5">
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">New</span>
          </div>
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10">
              <TrendingUp className="h-4 w-4 text-accent" />
            </div>
            <div className="flex-1 pr-8">
              <p className="text-sm font-semibold text-foreground mb-0.5">Time to rebalance?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">Based on your chat with Tilly, moving 3% from your current allocation into US equities could improve your risk-adjusted returns.</p>
            </div>
          </div>
          <div className="flex items-center justify-end mt-2">
            <span className="text-[11px] font-medium text-accent flex items-center gap-0.5">
              Review reallocation <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        </motion.button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Notifications;
