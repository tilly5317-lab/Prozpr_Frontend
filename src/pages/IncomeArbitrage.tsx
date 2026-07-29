import BottomNav from "@/components/BottomNav";
import { Coins } from "lucide-react";

const IncomeArbitrage = () => {
  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col pb-20">
      <div className="px-5 pt-10 pb-3">
        <h1 className="text-lg font-semibold text-foreground">Income + Arbitrage</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60">
          <Coins className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />
        </div>
        <p className="text-[15px] font-semibold text-foreground">Coming soon</p>
        <p className="max-w-[280px] text-[13px] leading-relaxed text-muted-foreground">
          Steady, tax-efficient returns from income and arbitrage funds — lower
          risk than equity, better than a savings account. On the way.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default IncomeArbitrage;
