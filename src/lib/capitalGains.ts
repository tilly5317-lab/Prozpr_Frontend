/**
 * Realised capital-gains engine for the Reports screen.
 *
 * Matches redemptions against purchases FIFO — the same lot order AMCs/RTAs use
 * on a CAMS/KFintech capital-gains statement — per (scheme, folio), then labels
 * each matched lot short- or long-term under the Indian MF rules below.
 *
 * Scope / known simplifications (surfaced to the user as a disclaimer on the
 * report, so nobody files a return off this without checking the RTA statement):
 *   • No 31-Jan-2018 grandfathering for pre-2018 equity lots.
 *   • No indexation for pre-23-Jul-2024 debt lots (removed prospectively anyway).
 *   • No STT/exit-load/stamp-duty adjustment to cost or sale value.
 */
import type { MfTransactionItem } from "./api";

export type GainTerm = "SHORT" | "LONG";
export type GainAssetType = "EQUITY" | "NON_EQUITY";

/** Units in (a lot is created); everything else takes units out. */
const INFLOW_TYPES = new Set(["BUY", "SWITCH_IN", "DIVIDEND_REINVEST"]);

/** Equity-oriented schemes qualify for the 12-month long-term threshold. */
const EQUITY_HINTS = [
  "equity", "elss", "tax saver", "large cap", "largecap", "mid cap", "midcap",
  "small cap", "smallcap", "flexi cap", "flexicap", "multi cap", "multicap",
  "focused", "contra", "value fund", "dividend yield", "sectoral", "thematic",
  "index", "nifty", "sensex", "aggressive hybrid", "arbitrage",
  "balanced advantage", "dynamic asset allocation", "equity savings",
];

/** Checked FIRST — a debt/commodity hint wins over an equity one ("gilt index fund"). */
const NON_EQUITY_HINTS = [
  "debt", "liquid", "gilt", "bond", "credit risk", "duration", "money market",
  "overnight", "banking and psu", "banking & psu", "psu", "floater", "floating rate",
  "gold", "silver", "commodity", "fund of fund", "fof", "international",
  "conservative hybrid", "income fund",
];

/**
 * The Finance Act 2023 cut-off: non-equity units ACQUIRED on/after this date are
 * always short-term regardless of holding period (s.50AA specified mutual funds).
 */
const DEBT_ALWAYS_STCG_FROM = Date.UTC(2023, 3, 1); // 2023-04-01
/** Finance (No. 2) Act 2024 — long-term threshold for non-equity cut 36m → 24m. */
const HOLDING_PERIOD_REFORM_FROM = Date.UTC(2024, 6, 23); // 2024-07-23

/** One redeemed lot: a sale matched against a single purchase. */
export interface RealisedGainRow {
  /** Stable per-row key — sale txn id + lot index. */
  id: string;
  fundName: string;
  schemeCode: string;
  folio: string;
  /** ISIN when the source carries one (the ledger does; live matching may not). */
  isin?: string | null;
  /** "Redemption" / "Switch-out" — how the units left. */
  txnType: string;
  assetType: GainAssetType;
  /** Asset class as shown in the table ("Equity" / "Debt" / "Others"). */
  assetClass: string;
  units: number;
  purchaseDate: string;
  purchaseNav: number;
  purchaseValue: number;
  saleDate: string;
  saleNav: number;
  saleValue: number;
  /** Book gain — sale proceeds minus actual cost. */
  gain: number;
  /**
   * Gain actually charged to tax. Differs from `gain` only where a statement
   * applies 31-Jan-2018 grandfathering; the live FIFO engine doesn't model that,
   * so it leaves this equal to `gain`.
   */
  taxableGain: number;
  holdingDays: number;
  term: GainTerm;
  /** Indian FY of the SALE, e.g. "FY 2024-25". */
  fy: string;
}

export interface CapitalGainsSummary {
  saleValue: number;
  costValue: number;
  totalGain: number;
  /** Σ `taxableGain` — what the tax tiles and the tax summary are based on. */
  totalTaxableGain: number;
  shortTermGain: number;
  longTermGain: number;
  rowCount: number;
}

function toUtcDate(iso: string): number {
  // Backend sends plain `YYYY-MM-DD`; parse as UTC so a local timezone can never
  // shift a 31-Mar sale into the previous financial year.
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

const MS_PER_DAY = 86_400_000;

/** Indian financial year (1 Apr – 31 Mar) containing `iso`, e.g. "FY 2024-25". */
export function financialYearOf(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  const startYear = (m || 1) >= 4 ? y : y - 1;
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * Equity-oriented or not. Prefers the portfolio's own `asset_class` for the
 * scheme (set by the backend classifier); falls back to keyword-matching the
 * ledger's category labels, then the fund name.
 */
export function classifyAssetType(
  txn: MfTransactionItem,
  assetClassByScheme: Record<string, string>,
): { assetType: GainAssetType; assetClass: string } {
  const known = assetClassByScheme[txn.scheme_code];
  if (known) {
    const k = known.trim().toLowerCase();
    if (k === "equity") return { assetType: "EQUITY", assetClass: "Equity" };
    if (k === "debt") return { assetType: "NON_EQUITY", assetClass: "Debt" };
  }
  const text = [txn.sub_group, txn.sub_category, txn.category, txn.fund_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (NON_EQUITY_HINTS.some((h) => text.includes(h))) {
    return { assetType: "NON_EQUITY", assetClass: known || "Debt" };
  }
  if (EQUITY_HINTS.some((h) => text.includes(h))) {
    return { assetType: "EQUITY", assetClass: known || "Equity" };
  }
  // Unknown → treat as non-equity, the conservative (higher-tax) assumption.
  return { assetType: "NON_EQUITY", assetClass: known || "Others" };
}

/**
 * Short vs long term for one matched lot, per the rules documented at the top.
 *
 * Exported so the unrealised-tax view can classify still-held lots by the same
 * rules — duplicating them would let the two drift apart the next time the
 * holding-period law changes.
 */
export function classifyTerm(
  assetType: GainAssetType,
  purchaseIso: string,
  saleIso: string,
  holdingDays: number,
): GainTerm {
  if (assetType === "EQUITY") return holdingDays > 365 ? "LONG" : "SHORT";
  if (toUtcDate(purchaseIso) >= DEBT_ALWAYS_STCG_FROM) return "SHORT";
  const months = toUtcDate(saleIso) >= HOLDING_PERIOD_REFORM_FROM ? 24 : 36;
  return holdingDays > months * 30.44 ? "LONG" : "SHORT";
}

interface Lot {
  date: string;
  nav: number;
  /** Units still unmatched in this lot. */
  units: number;
  /** Cost per unit — derived from the booked amount, not NAV, so loads/duty land in cost. */
  costPerUnit: number;
}

/**
 * FIFO-match every redemption against prior purchases and return one row per
 * matched lot, newest sale first.
 *
 * `assetClassByScheme` maps `scheme_code` → portfolio `asset_class` (build it
 * from `PortfolioDetail.holdings`, whose `ticker_symbol` IS the scheme code).
 */
export function computeRealisedGains(
  transactions: MfTransactionItem[],
  assetClassByScheme: Record<string, string> = {},
): RealisedGainRow[] {
  const byPosition = new Map<string, MfTransactionItem[]>();
  for (const t of transactions) {
    const key = `${t.scheme_code}::${t.folio_number || "-"}`;
    const list = byPosition.get(key);
    if (list) list.push(t);
    else byPosition.set(key, [t]);
  }

  const rows: RealisedGainRow[] = [];

  for (const txns of byPosition.values()) {
    // Same-day purchases must settle before same-day redemptions, else a
    // buy-then-sell pair on one date has no lot to match against.
    const ordered = [...txns].sort((a, b) => {
      const d = a.transaction_date.localeCompare(b.transaction_date);
      if (d !== 0) return d;
      const aIn = INFLOW_TYPES.has(a.transaction_type) ? 0 : 1;
      const bIn = INFLOW_TYPES.has(b.transaction_type) ? 0 : 1;
      return aIn - bIn;
    });

    const lots: Lot[] = [];
    for (const t of ordered) {
      const units = Math.abs(t.units || 0);
      const amount = Math.abs(t.amount || 0);
      if (units <= 1e-6) continue;

      if (INFLOW_TYPES.has(t.transaction_type)) {
        lots.push({
          date: t.transaction_date,
          nav: t.nav || (amount > 0 ? amount / units : 0),
          units,
          costPerUnit: amount > 0 ? amount / units : t.nav || 0,
        });
        continue;
      }

      // Redemption / switch-out — consume oldest lots first.
      const saleNav = t.nav || (amount > 0 ? amount / units : 0);
      const { assetType, assetClass } = classifyAssetType(t, assetClassByScheme);
      let remaining = units;
      let lotIndex = 0;
      while (remaining > 1e-6 && lots.length > 0) {
        const lot = lots[0];
        const matched = Math.min(remaining, lot.units);
        const purchaseValue = matched * lot.costPerUnit;
        const saleValue = matched * saleNav;
        const holdingDays = Math.round(
          (toUtcDate(t.transaction_date) - toUtcDate(lot.date)) / MS_PER_DAY,
        );
        rows.push({
          id: `${t.id}-${lotIndex}`,
          fundName: t.fund_name || t.scheme_code,
          schemeCode: t.scheme_code,
          folio: t.folio_number || "-",
          isin: t.isin,
          txnType: t.transaction_type === "SWITCH_OUT" ? "Switch-out" : "Redemption",
          assetType,
          assetClass,
          units: matched,
          purchaseDate: lot.date,
          purchaseNav: lot.costPerUnit,
          purchaseValue,
          saleDate: t.transaction_date,
          saleNav,
          saleValue,
          gain: saleValue - purchaseValue,
          taxableGain: saleValue - purchaseValue,
          holdingDays,
          term: classifyTerm(assetType, lot.date, t.transaction_date, holdingDays),
          fy: financialYearOf(t.transaction_date),
        });
        lotIndex += 1;
        remaining -= matched;
        lot.units -= matched;
        if (lot.units <= 1e-6) lots.shift();
      }
      // `remaining > 0` means the ledger starts mid-position (CAS pulled from a
      // date after the original purchase). Those units have no known cost, so
      // they're dropped rather than booked as 100% gain.
    }
  }

  return rows.sort((a, b) => b.saleDate.localeCompare(a.saleDate));
}

export function summariseGains(rows: RealisedGainRow[]): CapitalGainsSummary {
  return rows.reduce<CapitalGainsSummary>(
    (acc, r) => {
      acc.saleValue += r.saleValue;
      acc.costValue += r.purchaseValue;
      acc.totalGain += r.gain;
      acc.totalTaxableGain += r.taxableGain;
      // The short/long split is TAXABLE gain — it feeds the Sec 111A / 112A tax
      // heads, where grandfathered relief is already netted out.
      if (r.term === "SHORT") acc.shortTermGain += r.taxableGain;
      else acc.longTermGain += r.taxableGain;
      acc.rowCount += 1;
      return acc;
    },
    {
      saleValue: 0,
      costValue: 0,
      totalGain: 0,
      totalTaxableGain: 0,
      shortTermGain: 0,
      longTermGain: 0,
      rowCount: 0,
    },
  );
}

// ── Indicative tax on the realised gains (FY 2025-26 / AY 2026-27) ──────────

/** Sec 112A exemption — the first ₹1.25 lakh of equity LTCG each year. */
export const LTCG_EXEMPTION = 125_000;
/** Sec 112A rate on equity LTCG above the exemption. */
export const LTCG_RATE_PCT = 12.5;
/** Sec 111A rate on equity STCG. */
export const STCG_RATE_PCT = 20;

export interface TaxHead {
  label: string;
  gain: number;
  exemption: number;
  taxable: number;
  ratePct: number;
  tax: number;
}

/**
 * Indicative tax by head. Excludes cess, surcharge and loss set-off — the same
 * caveat the PDF statement carries.
 */
export function taxHeads(summary: CapitalGainsSummary): TaxHead[] {
  // The exemption column shows the full annual allowance (as the RTA statement
  // does), not the portion consumed — hence no `min` against the gain here.
  const ltTaxable = Math.max(summary.longTermGain - LTCG_EXEMPTION, 0);
  const stTaxable = Math.max(summary.shortTermGain, 0);
  return [
    {
      label: "Long-term (Equity · Sec 112A)",
      gain: summary.longTermGain,
      exemption: LTCG_EXEMPTION,
      taxable: ltTaxable,
      ratePct: LTCG_RATE_PCT,
      tax: (ltTaxable * LTCG_RATE_PCT) / 100,
    },
    {
      label: "Short-term (Equity · Sec 111A)",
      gain: summary.shortTermGain,
      exemption: 0,
      taxable: stTaxable,
      ratePct: STCG_RATE_PCT,
      tax: (stTaxable * STCG_RATE_PCT) / 100,
    },
  ];
}

/** Financial years present in `rows`, newest first — drives the FY filter. */
export function financialYearsIn(rows: RealisedGainRow[]): string[] {
  return [...new Set(rows.map((r) => r.fy))].sort((a, b) => b.localeCompare(a));
}

/** Label for a financial year starting in `startYear`, e.g. 2025 → "FY 2025-26". */
function fyLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/**
 * The last `count` financial years, current first — the report period picker.
 * Derived from the calendar rather than the data so the control is populated
 * even when a statement has no rows of its own.
 */
export function recentFinancialYears(count = 6): string[] {
  const now = new Date();
  const currentStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => fyLabel(currentStart - i));
}
