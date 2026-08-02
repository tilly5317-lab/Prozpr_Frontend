/**
 * Sample realised-gains rows, transcribed from the mock statement shipped at
 * `/statements/capital-gains-statement.pdf` (Ananya R. Krishnan · FY 2025-26).
 *
 * Shown on `/reports?tab=gains` when the live MF ledger has no redemptions yet,
 * so the report demonstrates its shape instead of rendering an empty page. The
 * UI labels it "Sample" — it is never mixed with real rows.
 *
 * `taxableGain` < `gain` on the two pre-2018 lots: the PDF applies 31-Jan-2018
 * grandfathering, which the live FIFO engine does not model.
 */
import type { RealisedGainRow } from "./capitalGains";

export const DEMO_GAINS_INVESTOR = "Ananya R. Krishnan";
export const DEMO_GAINS_FY = "FY 2025-26";

export const DEMO_CAPITAL_GAINS: RealisedGainRow[] = [
  {
    id: "demo-cg-1",
    fundName: "Canara Robeco ELSS Tax Saver",
    schemeCode: "DEMO-ELSS",
    folio: "4131 / 34",
    isin: "INF760K01EL8",
    txnType: "Redemption",
    assetType: "EQUITY",
    assetClass: "Equity",
    units: 820,
    purchaseDate: "2016-01-02",
    purchaseNav: 60000 / 820,
    purchaseValue: 60000,
    saleDate: "2025-07-12",
    saleNav: 96420 / 820,
    saleValue: 96420,
    gain: 36420,
    taxableGain: 25190, // grandfathered NAV as on 31 Jan 2018
    holdingDays: 3478,
    term: "LONG",
    fy: "FY 2025-26",
  },
  {
    id: "demo-cg-2",
    fundName: "Axis Small Cap Fund",
    schemeCode: "DEMO-SMALLCAP",
    folio: "4998 4844 93",
    isin: "INF846K01EW2",
    txnType: "Redemption",
    assetType: "EQUITY",
    assetClass: "Equity",
    units: 410,
    purchaseDate: "2024-03-15",
    purchaseNav: 31500 / 410,
    purchaseValue: 31500,
    saleDate: "2025-09-20",
    saleNav: 38900 / 410,
    saleValue: 38900,
    gain: 7400,
    taxableGain: 7400,
    holdingDays: 554,
    term: "SHORT",
    fy: "FY 2025-26",
  },
  {
    id: "demo-cg-3",
    fundName: "Aditya Birla SL Frontline Equity",
    schemeCode: "DEMO-FRONTLINE",
    folio: "4131 / 34",
    isin: "INF209K01UN8",
    txnType: "Switch-out",
    assetType: "EQUITY",
    assetClass: "Equity",
    units: 150,
    purchaseDate: "2019-11-11",
    purchaseNav: 33750 / 150,
    purchaseValue: 33750,
    saleDate: "2026-02-05",
    saleNav: 58600 / 150,
    saleValue: 58600,
    gain: 24850,
    taxableGain: 16720, // grandfathered NAV as on 31 Jan 2018
    holdingDays: 2277,
    term: "LONG",
    fy: "FY 2025-26",
  },
];
