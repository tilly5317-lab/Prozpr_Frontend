import BottomNav from "@/components/BottomNav";
import { Droplet } from "lucide-react";

const LiquidFunds = () => {
  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-20">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Liquid funds</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
          <Droplet className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
        </div>
        <p className="text-[15px] font-semibold text-foreground">Coming soon</p>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
          Park idle cash in low-risk liquid funds and earn better-than-savings
          returns. This section is on the way.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default LiquidFunds;
