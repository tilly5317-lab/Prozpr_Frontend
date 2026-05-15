import type { ChartBase } from "./_base";

// ─── AA charts (typed) ───

export interface DonutSlice {
  label: string;
  value: number;
  percentage: number;
  color_hint?: string | null;
}

export interface CurrentDonut extends ChartBase {
  type: "current_donut";
  total_value: number;
  slices: DonutSlice[];
}

export interface ConcentrationHolding {
  label: string;
  value: number;
  percentage: number;
}

export interface ConcentrationRisk extends ChartBase {
  type: "concentration_risk";
  headline: string;
  severity: "ok" | "watch" | "act";
  top_n: number;
  top_holdings: ConcentrationHolding[];
  rest_percentage: number;
  rest_count: number;
}

export interface TargetVsActualBar {
  asset_class: string;
  target_pct: number;
  actual_pct: number;
  drift_pct: number;
}

export interface TargetVsActual extends ChartBase {
  type: "target_vs_actual";
  bars: TargetVsActualBar[];
}

// ─── Performance ───

export interface FundReturnRow {
  name: string;
  return_pct: number;
  current_value: number;
}

export interface TopBottomFunds extends ChartBase {
  type: "top_bottom_funds";
  top: FundReturnRow[];
  bottom: FundReturnRow[];
  portfolio_average_pct: number;
}

// ─── Risk ───

export interface ProfileDial extends ChartBase {
  type: "profile_dial";
  score: number;
  band:
    | "Conservative"
    | "Moderate-Conservative"
    | "Balanced"
    | "Moderate-Aggressive"
    | "Aggressive";
  headline: string;
}

// ─── Rebalancing (now typed, type discriminator) ───

export interface NamedSeries {
  name: string;
  values: number[];
}

export interface CategoryGapBar extends ChartBase {
  type: "category_gap_bar";
  categories: string[];
  series: NamedSeries[];
  caption?: string | null;
}

export interface PlannedDonutSlice {
  label: string;
  value: number;
}

export interface PlannedDonut extends ChartBase {
  type: "planned_donut";
  slices: PlannedDonutSlice[];
  caption?: string | null;
}

export interface TaxCostNamedSeries {
  name: string;
  values: number[];
}

export interface TaxCostTotals {
  tax_estimate_inr: number;
  exit_load_inr: number;
}

export interface TaxCostBar extends ChartBase {
  type: "tax_cost_bar";
  categories: string[];
  series: TaxCostNamedSeries[];
  totals: TaxCostTotals;
  caption?: string | null;
}

export interface BuySellRow {
  name: string;
  sub_category: string;
  buy_inr: number;
  sell_inr: number;
}

export interface BuySellLedger extends ChartBase {
  type: "buy_sell_ledger";
  rows: BuySellRow[];
}

// ─── Unified union ───

export type ChartPayload =
  | CurrentDonut
  | ConcentrationRisk
  | TargetVsActual
  | TopBottomFunds
  | ProfileDial
  | CategoryGapBar
  | PlannedDonut
  | TaxCostBar
  | BuySellLedger;
