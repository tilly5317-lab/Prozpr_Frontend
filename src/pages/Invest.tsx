import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const Invest = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container bg-background min-h-screen pb-20">
      <div className="px-5 pt-12 pb-1">
        <h1 className="text-xl font-bold text-foreground">Invest</h1>
      </div>

      <div className="flex-1 flex items-center justify-center px-5 pt-32">
        <div className="w-full rounded-2xl bg-card border border-border p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground mb-6">
            Your recommended plan is ready.
          </p>
          <button
            onClick={() => navigate("/execute")}
            className="inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold text-primary-foreground px-6 py-3 transition-colors hover:opacity-90"
            style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
          >
            Review & Execute
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Invest;
