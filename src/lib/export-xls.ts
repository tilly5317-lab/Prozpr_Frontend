import * as XLSX from "xlsx";
import type { AnnualCashflowRow, MonthlyCashflowRow } from "./api";
import { taxHeads, type CapitalGainsSummary, type RealisedGainRow } from "./capitalGains";

const ONE_LAKH = 100_000;
const ONE_CRORE = 10_000_000;

export function formatInrIndian(amount: number | null | undefined): string {
  if (amount == null) return "";
  if (amount === 0) return "₹0";
  const sign = amount < 0 ? "-" : "";
  const val = Math.abs(amount);
  if (val < ONE_LAKH) return `${sign}₹${Math.round(val).toLocaleString("en-IN")}`;
  if (val < ONE_CRORE) {
    const s = (val / ONE_LAKH).toFixed(2).replace(/\.?0+$/, "");
    return `${sign}₹${s} lakh`;
  }
  const s = (val / ONE_CRORE).toFixed(2).replace(/\.?0+$/, "");
  return `${sign}₹${s} crore`;
}

const ANNUAL_HEADERS = [
  "FY",
  "Income",
  "Income Tax",
  "Household Expense",
  "Savings (Pre-EMI)",
  "Existing Mortgage EMI",
  "Goal Mortgage EMI",
  "Savings (Post-EMI)",
  "One-off Inflow",
  "One-off Outflow",
  "Corpus Opening",
  // In the ANNUAL sheet this column is the sum of the FY's monthly investments
  // (an annual total), so label it as such — calling it "Monthly Investment"
  // here makes a ₹10k/mo SIP look like ₹1.2L "per month".
  "Annual Investment",
  "Investment Returns",
  "Goal Payout",
  "Corpus Closing",
  "Funded?",
];

const MONTHLY_HEADERS = [
  "Month",
  "FY",
  "Income",
  "Income Tax",
  "Household Expense",
  "Savings (Pre-EMI)",
  "Existing Mortgage EMI",
  "Goal Mortgage EMI",
  "Savings (Post-EMI)",
  "One-off Inflow",
  "One-off Outflow",
  "Corpus Opening",
  "Monthly Investment",
  "Investment Source",
  "Investment Returns",
  "Goal Payout",
  "Corpus Closing",
  "Funded?",
];

function annualToRows(data: AnnualCashflowRow[]): (string | number | boolean)[][] {
  return data.map((r) => [
    r.fy_label,
    r.income,
    r.income_tax,
    r.household_expense,
    r.savings_pre_emi,
    r.existing_mortgage_emi,
    r.goal_mortgage_emi,
    r.savings_post_emi,
    r.one_off_inflow,
    r.one_off_outflow,
    r.corpus_opening,
    r.monthly_investment,
    r.investment_returns,
    r.goal_payout,
    r.corpus_closing,
    r.is_funded ? "Yes" : "No",
  ]);
}

function monthlyToRows(data: MonthlyCashflowRow[]): (string | number | boolean)[][] {
  return data.map((r) => [
    r.month_end_date,
    r.fy_label,
    r.income,
    r.income_tax,
    r.household_expense,
    r.savings_pre_emi,
    r.existing_mortgage_emi,
    r.goal_mortgage_emi,
    r.savings_post_emi,
    r.one_off_inflow,
    r.one_off_outflow,
    r.corpus_opening,
    r.monthly_investment,
    r.investment_source || "zero",
    r.investment_returns,
    r.goal_payout,
    r.corpus_closing,
    r.is_funded ? "Yes" : "No",
  ]);
}

export function exportCashflowXls(
  annual: AnnualCashflowRow[],
  monthly?: MonthlyCashflowRow[] | null,
  filename = "cashflow_statement.xlsx",
): void {
  const wb = XLSX.utils.book_new();

  if (annual.length > 0) {
    const annualData = [ANNUAL_HEADERS, ...annualToRows(annual)];
    const ws = XLSX.utils.aoa_to_sheet(annualData);
    ws["!cols"] = ANNUAL_HEADERS.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, "Annual Cashflow");
  }

  if (monthly && monthly.length > 0) {
    const monthlyData = [MONTHLY_HEADERS, ...monthlyToRows(monthly)];
    const ws = XLSX.utils.aoa_to_sheet(monthlyData);
    ws["!cols"] = MONTHLY_HEADERS.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Cashflow");
  }

  XLSX.writeFile(wb, filename);
}

// ── Reports screen (/reports) — statement exports ───────────────────────────
// Both exporters take the ALREADY-FILTERED rows the user is looking at, so the
// workbook always matches the table on screen.

const HOLDINGS_HEADERS = [
  "Fund / Instrument",
  "Asset Class",
  "Sub-category",
  "Type",
  "Scheme Code",
  "Units",
  "Avg Cost (₹)",
  "Current NAV / Price (₹)",
  "Invested (₹)",
  "Current Value (₹)",
  "Unrealised Gain (₹)",
  "Gain %",
  "Weight %",
];

/** One row of the holdings statement, pre-derived by the Reports page. */
export interface HoldingsExportRow {
  name: string;
  assetClass: string;
  subCategory: string;
  instrumentType: string;
  schemeCode: string;
  units: number | null;
  avgCost: number | null;
  currentPrice: number | null;
  invested: number | null;
  currentValue: number;
  gain: number | null;
  gainPct: number | null;
  weightPct: number | null;
}

function round2(n: number | null | undefined): number | string {
  if (n == null || !Number.isFinite(n)) return "";
  return Math.round(n * 100) / 100;
}

function round4(n: number | null | undefined): number | string {
  if (n == null || !Number.isFinite(n)) return "";
  return Math.round(n * 10000) / 10000;
}

export function exportHoldingsXls(
  rows: HoldingsExportRow[],
  meta: { generatedOn: string; filterSummary: string },
  filename = "portfolio_holdings_statement.xlsx",
): void {
  const wb = XLSX.utils.book_new();
  const body = rows.map((r) => [
    r.name,
    r.assetClass,
    r.subCategory,
    r.instrumentType,
    r.schemeCode,
    round4(r.units),
    round4(r.avgCost),
    round4(r.currentPrice),
    round2(r.invested),
    round2(r.currentValue),
    round2(r.gain),
    round2(r.gainPct),
    round2(r.weightPct),
  ]);

  const totalInvested = rows.reduce((s, r) => s + (r.invested ?? 0), 0);
  const totalValue = rows.reduce((s, r) => s + r.currentValue, 0);
  const totalGain = totalValue - totalInvested;

  const aoa: (string | number)[][] = [
    ["Portfolio Holdings Statement"],
    [`Generated on: ${meta.generatedOn}`],
    [`Filters: ${meta.filterSummary}`],
    [],
    HOLDINGS_HEADERS,
    ...body,
    [],
    [
      "TOTAL",
      "", "", "", "", "", "", "",
      round2(totalInvested),
      round2(totalValue),
      round2(totalGain),
      round2(totalInvested > 0 ? (totalGain / totalInvested) * 100 : null),
      "",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = HOLDINGS_HEADERS.map((h, i) => ({ wch: i === 0 ? 42 : Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Holdings");
  XLSX.writeFile(wb, filename);
}

const GAINS_HEADERS = [
  "Scheme",
  "ISIN",
  "Folio",
  "Type",
  "Asset Type",
  "Units",
  "Acquired",
  "Purchase NAV (₹)",
  "Purchase Value (₹)",
  "Sold",
  "Sale NAV (₹)",
  "Sale Value (₹)",
  "Days",
  "Term",
  "Financial Year",
  "Book Gain (₹)",
  "Taxable Gain (₹)",
];

export function exportCapitalGainsXls(
  rows: RealisedGainRow[],
  summary: CapitalGainsSummary,
  meta: { generatedOn: string; filterSummary: string },
  filename = "capital_gains_statement.xlsx",
): void {
  const wb = XLSX.utils.book_new();

  const detail: (string | number)[][] = [
    ["Capital Gains Statement (realised)"],
    [`Generated on: ${meta.generatedOn}`],
    [`Filters: ${meta.filterSummary}`],
    [],
    GAINS_HEADERS,
    ...rows.map((r) => [
      r.fundName,
      r.isin ?? "",
      r.folio,
      r.txnType,
      r.assetType === "EQUITY" ? "Equity-oriented" : "Non-equity",
      round4(r.units),
      r.purchaseDate,
      round4(r.purchaseNav),
      round2(r.purchaseValue),
      r.saleDate,
      round4(r.saleNav),
      round2(r.saleValue),
      r.holdingDays,
      r.term === "SHORT" ? "STCG" : "LTCG",
      r.fy,
      round2(r.gain),
      round2(r.taxableGain),
    ]),
    [],
    [
      "TOTAL",
      "", "", "", "", "", "", "",
      round2(summary.costValue),
      "", "",
      round2(summary.saleValue),
      "", "", "",
      round2(summary.totalGain),
      round2(summary.totalTaxableGain),
    ],
  ];
  const wsDetail = XLSX.utils.aoa_to_sheet(detail);
  wsDetail["!cols"] = GAINS_HEADERS.map((h, i) => ({ wch: i === 0 ? 42 : Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsDetail, "Realised Gains");

  const heads = taxHeads(summary);
  const totalTax = heads.reduce((s, h) => s + h.tax, 0);

  const wsSummary = XLSX.utils.aoa_to_sheet([
    ["Capital Gains Summary"],
    [`Filters: ${meta.filterSummary}`],
    [],
    ["Metric", "Amount (₹)"],
    ["Total sale value", round2(summary.saleValue)],
    ["Total cost of acquisition", round2(summary.costValue)],
    ["Book gain", round2(summary.totalGain)],
    ["Taxable gain", round2(summary.totalTaxableGain)],
    ["Short-term capital gain", round2(summary.shortTermGain)],
    ["Long-term capital gain", round2(summary.longTermGain)],
    ["Redeemed lots", summary.rowCount],
    [],
    ["Tax summary (indicative)"],
    ["Head", "Gain (₹)", "Exemption (₹)", "Taxable (₹)", "Rate %", "Tax (₹)"],
    ...heads.map((h) => [
      h.label,
      round2(h.gain),
      round2(h.exemption),
      round2(h.taxable),
      h.ratePct,
      round2(h.tax),
    ]),
    ["Total estimated tax (excl. cess & surcharge)", "", "", "", "", round2(totalTax)],
    [],
    ["Note: FIFO lot matching. Excludes indexation, STT / exit load / stamp duty,"],
    ["cess, surcharge and loss set-off. Verify against your RTA statement before filing."],
  ]);
  wsSummary["!cols"] = [{ wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  XLSX.writeFile(wb, filename);
}
