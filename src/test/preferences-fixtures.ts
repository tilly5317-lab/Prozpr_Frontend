import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import type { Catalog } from "@/lib/investment-preferences";

/** Test-only: the preferences screen's example plan and customer. */

export const COMP: ClassMix = { equity: 65, debt: 25, others: 10 };

export const cat = (
  id: string, cls: ScreenSubcategory["class"], label: string, rec: number, weight: number | null,
): ScreenSubcategory => ({ id, class: cls, label, recommended_pct_of_total: rec, weight_in_class: weight });

// 78 / 16 / 6 with 64% multi-asset: equity is 42% through the fund + 20%
// mid/flexi-cap + 16% US, and all of debt and commodity come through the fund.
// Debt and commodity weights are the engine's defaults for a class the plan
// puts nothing in.
export const PLAN: ScreenSubcategory[] = [
  cat("multi_asset", "equity", "multi-asset funds", 64, null),
  cat("low_beta_equities", "equity", "large-cap equity", 0, 0),
  cat("medium_beta_equities", "equity", "mid-cap & flexi-cap equity", 20, 20 / 36),
  cat("us_equities", "equity", "US equity", 16, 16 / 36),
  cat("arbitrage", "debt", "arbitrage", 0, 0),
  cat("arbitrage_plus_income", "debt", "arbitrage & income", 0, 1),
  cat("short_debt", "debt", "short-duration debt", 0, 0),
  cat("gold_commodities", "others", "gold", 0, 1),
];

export const CATALOG: Catalog = { cats: PLAN, comp: COMP };

/** The screenshots' customer: 85 / 10 / 5. */
export const MINE: ClassMix = { equity: 85, debt: 10, others: 5 };
