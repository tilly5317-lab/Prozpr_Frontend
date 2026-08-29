import { useMemo } from "react";

import type { FundNavPoint } from "@/components/fund/FundScreenUi";
import {
  categoryProfile,
  fundProfile,
  type CategoryProfile,
  type FundProfile,
} from "@/lib/fundCategory";
import type { MfFundInvestorDetailResponse } from "@/lib/api";

/**
 * The category and fund profiles the analysis screen is built from.
 *
 * Lifted out of the component so the page can hold them too — the Excel export
 * lives in the header, away from the sections it describes, and both need to
 * read exactly the same numbers.
 */
export function useFundProfiles(opts: {
  schemeCode: string;
  history: FundNavPoint[];
  categoryName: string;
  assetClass: string | null;
  facts: MfFundInvestorDetailResponse | null;
}): { cat: CategoryProfile; fund: FundProfile } {
  const { schemeCode, history, categoryName, assetClass, facts } = opts;

  const cat = useMemo(
    () => categoryProfile(categoryName, assetClass),
    [categoryName, assetClass],
  );

  const fund = useMemo(
    () =>
      fundProfile(schemeCode, history, cat, {
        mcap: facts
          ? {
              large: facts.large_cap_equity_pct,
              mid: facts.mid_cap_equity_pct,
              small: facts.small_cap_equity_pct,
            }
          : undefined,
        othersPct: facts?.others_pct ?? null,
        assetClass,
      }),
    [schemeCode, history, cat, facts, assetClass],
  );

  return { cat, fund };
}
