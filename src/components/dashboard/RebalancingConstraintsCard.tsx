import { useState } from "react";
import { Settings } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type RiskLevel = "Conservative" | "Moderate" | "Aggressive";
type AlignmentStrategy = "Full Alignment" | "Gradual" | "Minimal";

const PillSelector = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="flex gap-1.5">
    {options.map((opt) => (
      <button
        key={opt}
        onClick={() => onChange(opt)}
        className={`flex-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition-all ${
          value === opt
            ? "bg-accent text-accent-foreground"
            : "border border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        {opt}
      </button>
    ))}
  </div>
);

const RebalancingConstraintsCard = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [maxEquity, setMaxEquity] = useState([70]);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("Moderate");
  const [alignment, setAlignment] = useState<AlignmentStrategy>("Full Alignment");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="wealth-card">
        <CollapsibleTrigger className="flex items-center justify-between w-full">
          <p className="text-xs font-semibold text-foreground">Rebalancing Constraints</p>
          <Settings className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 space-y-4">
          {/* Max Equity Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-muted-foreground">Max Equity Allocation</span>
              <span className="text-xs font-bold text-foreground">{maxEquity[0]}%</span>
            </div>
            <Slider
              value={maxEquity}
              onValueChange={setMaxEquity}
              min={50}
              max={90}
              step={5}
              className="[&_[role=slider]]:bg-accent [&_[role=slider]]:border-accent [&_.relative>div]:bg-accent"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[9px] text-muted-foreground">50%</span>
              <span className="text-[9px] text-muted-foreground">90%</span>
            </div>
          </div>

          {/* Risk Level */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Risk Level</p>
            <PillSelector
              options={["Conservative", "Moderate", "Aggressive"] as const}
              value={riskLevel}
              onChange={(v) => setRiskLevel(v as RiskLevel)}
            />
          </div>

          {/* Alignment Strategy */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-2">Alignment Strategy</p>
            <PillSelector
              options={["Full Alignment", "Gradual", "Minimal"] as const}
              value={alignment}
              onChange={(v) => setAlignment(v as AlignmentStrategy)}
            />
          </div>

          {/* CTA */}
          <button className="w-full py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            Generate Options
          </button>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default RebalancingConstraintsCard;
