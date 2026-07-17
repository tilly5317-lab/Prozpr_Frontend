/**
 * Marginal income-tax slab options — the SINGLE source of truth for the tax-rate
 * dropdown shown on both `/profile/complete` (Tax details) and the goal-planning
 * cashflow inputs (CashflowGate). `value` is the slab percentage as a string and
 * matches the stored `tax_profile.income_tax_rate`. Keep this list in one place so
 * the two screens never drift apart.
 *
 * Slabs follow the New Tax Regime for FY 2025-26 (AY 2026-27) — contiguous, with
 * no gaps or overlaps. Update here (and only here) if the Budget revises them.
 */
export interface MarginalTaxRateOption {
  value: string;
  label: string;
  slab: string;
}

export const MARGINAL_TAX_RATE_OPTIONS: MarginalTaxRateOption[] = [
  { value: "0", label: "0%", slab: "Income up to ₹4,00,000" },
  { value: "5", label: "5%", slab: "₹4,00,001 – ₹8,00,000" },
  { value: "10", label: "10%", slab: "₹8,00,001 – ₹12,00,000" },
  { value: "15", label: "15%", slab: "₹12,00,001 – ₹16,00,000" },
  { value: "20", label: "20%", slab: "₹16,00,001 – ₹20,00,000" },
  { value: "25", label: "25%", slab: "₹20,00,001 – ₹24,00,000" },
  { value: "30", label: "30%", slab: "Above ₹24,00,000" },
];
