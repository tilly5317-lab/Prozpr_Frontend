import type { ChartPayload } from "./types";
import { CurrentDonut } from "./CurrentDonut/Chart";
import { ConcentrationRisk } from "./ConcentrationRisk/Chart";
import { TargetVsActual } from "./TargetVsActual/Chart";
import { TopBottomFunds } from "./TopBottomFunds/Chart";
import { ProfileDial } from "./ProfileDial/Chart";
import { CategoryGapBar } from "./CategoryGapBar/Chart";
import { PlannedDonut } from "./PlannedDonut/Chart";
import { TaxCostBar } from "./TaxCostBar/Chart";
import { BuySellLedger } from "./BuySellLedger/Chart";

interface ChartRendererProps {
  payload: ChartPayload;
}

export function ChartRenderer({ payload }: ChartRendererProps) {
  switch (payload.type) {
    case "current_donut":
      return <CurrentDonut payload={payload} />;
    case "concentration_risk":
      return <ConcentrationRisk payload={payload} />;
    case "target_vs_actual":
      return <TargetVsActual payload={payload} />;
    case "top_bottom_funds":
      return <TopBottomFunds payload={payload} />;
    case "profile_dial":
      return <ProfileDial payload={payload} />;
    case "category_gap_bar":
      return <CategoryGapBar payload={payload} />;
    case "planned_donut":
      return <PlannedDonut payload={payload} />;
    case "tax_cost_bar":
      return <TaxCostBar payload={payload} />;
    case "buy_sell_ledger":
      return <BuySellLedger payload={payload} />;
    default: {
      const _exhaustive: never = payload;
      return null;
    }
  }
}
