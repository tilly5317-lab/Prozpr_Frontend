import * as XLSX from "xlsx";
import type { AnnualCashflowRow, MonthlyCashflowRow } from "./api";

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
