/**
 * "If you sold this holding today, what would the tax be?"
 *
 * Unlike most of the fund analysis screen, ALL of this is real: it works off
 * the user's own transaction ledger and the latest NAV, using the same holding
 * period rules and rates as the realised capital-gains statement.
 *
 * Method: FIFO-match every redemption against prior purchases, keep what's
 * left, then split the remaining lots into long and short term as at today.
 * Cost comes from the booked amount rather than NAV × units, so loads and stamp
 * duty land in cost the same way they do in the realised statement.
 */

import {
  LTCG_EXEMPTION,
  LTCG_RATE_PCT,
  STCG_RATE_PCT,
  classifyTerm,
  type GainAssetType,
  type GainTerm,
} from "@/lib/capitalGains";
import type { MfHoldingTransactionItem } from "@/lib/api";

const MS_PER_DAY = 86_400_000;
const INFLOW_TYPES = new Set(["BUY", "SWITCH_IN", "DIVIDEND_REINVEST"]);

/** One purchase lot still held today. */
export interface OpenLot {
  purchaseDate: string;
  units: number;
  costPerUnit: number;
  holdingDays: number;
  term: GainTerm;
}

export interface TermBlock {
  term: GainTerm;
  units: number;
  /** Value at the latest NAV. */
  currentValue: number;
  /** Charge for leaving early, on units still inside the exit-load window. */
  exitLoad: number;
  /** currentValue − exitLoad. */
  amountRealised: number;
  /** What those units cost. */
  investmentValue: number;
  /** amountRealised − investmentValue. Can be negative. */
  gains: number;
  /** LTCG's ₹1,25,000 annual allowance; zero for short term. */
  exemption: number;
  taxable: number;
  ratePct: number;
  tax: number;
}

export interface UnrealisedTax {
  long: TermBlock | null;
  short: TermBlock | null;
  totalTax: number;
  totalCurrentValue: number;
  /** NAV the valuation used. */
  navUsed: number;
  navDate: string | null;
  /** True when the ledger is empty — nothing to value. */
  empty: boolean;
}

/** Remaining lots after FIFO-matching every redemption. */
export function openLots(
  transactions: MfHoldingTransactionItem[],
  assetType: GainAssetType,
  asOf: Date = new Date(),
): OpenLot[] {
  const sorted = [...transactions].sort((a, b) =>
    a.transaction_date.localeCompare(b.transaction_date),
  );

  const lots: { date: string; units: number; costPerUnit: number }[] = [];

  for (const t of sorted) {
    const units = Math.abs(t.units);
    if (units <= 0) continue;
    const isInflow = t.is_inflow || INFLOW_TYPES.has(t.transaction_type.toUpperCase());

    if (isInflow) {
      // Cost per unit from the booked amount, so loads and duty sit in cost.
      const amount = Math.abs(t.amount) || units * t.nav;
      lots.push({ date: t.transaction_date, units, costPerUnit: amount / units });
      continue;
    }

    // Redemption — consume oldest lots first.
    let remaining = units;
    while (remaining > 0 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.units, remaining);
      lot.units -= take;
      remaining -= take;
      if (lot.units <= 1e-9) lots.shift();
    }
  }

  const today = asOf.getTime();
  return lots
    .filter((l) => l.units > 1e-9)
    .map((l) => {
      const holdingDays = Math.floor((today - Date.parse(l.date)) / MS_PER_DAY);
      return {
        purchaseDate: l.date,
        units: l.units,
        costPerUnit: l.costPerUnit,
        holdingDays,
        term: classifyTerm(
          assetType,
          l.date,
          new Date(today).toISOString().slice(0, 10),
          holdingDays,
        ),
      };
    });
}

/**
 * Value the open lots at `nav` and work out the tax on selling them all today.
 *
 * `exitLoadPct` / `exitLoadMonths` come from scheme metadata: units bought
 * within the window are charged, older ones are not — which is why the load is
 * computed per lot rather than on the total.
 */
export function computeUnrealisedTax(
  transactions: MfHoldingTransactionItem[],
  opts: {
    nav: number | null;
    navDate: string | null;
    assetType: GainAssetType;
    exitLoadPct: number | null;
    exitLoadMonths: number | null;
    asOf?: Date;
  },
): UnrealisedTax {
  const { nav, navDate, assetType, exitLoadPct, exitLoadMonths } = opts;
  const asOf = opts.asOf ?? new Date();

  const empty = { long: null, short: null, totalTax: 0, totalCurrentValue: 0, navUsed: nav ?? 0, navDate, empty: true };
  if (!nav || nav <= 0 || transactions.length === 0) return empty;

  const lots = openLots(transactions, assetType, asOf);
  if (lots.length === 0) return empty;

  const loadWindowDays = exitLoadMonths != null ? exitLoadMonths * 30.44 : 0;
  const loadPct = exitLoadPct ?? 0;

  const build = (term: GainTerm): TermBlock | null => {
    const rows = lots.filter((l) => l.term === term);
    if (rows.length === 0) return null;

    let units = 0;
    let currentValue = 0;
    let exitLoad = 0;
    let investmentValue = 0;

    for (const l of rows) {
      const value = l.units * nav;
      units += l.units;
      currentValue += value;
      investmentValue += l.units * l.costPerUnit;
      // Only lots still inside the window pay the load.
      if (loadPct > 0 && l.holdingDays < loadWindowDays) {
        exitLoad += (value * loadPct) / 100;
      }
    }

    const amountRealised = currentValue - exitLoad;
    const gains = amountRealised - investmentValue;
    const exemption = term === "LONG" ? Math.min(LTCG_EXEMPTION, Math.max(gains, 0)) : 0;
    const taxable = Math.max(gains - exemption, 0);
    const ratePct = term === "LONG" ? LTCG_RATE_PCT : STCG_RATE_PCT;

    return {
      term,
      units,
      currentValue,
      exitLoad,
      amountRealised,
      investmentValue,
      gains,
      exemption,
      taxable,
      ratePct,
      tax: (taxable * ratePct) / 100,
    };
  };

  const long = build("LONG");
  const short = build("SHORT");

  return {
    long,
    short,
    totalTax: (long?.tax ?? 0) + (short?.tax ?? 0),
    totalCurrentValue: (long?.currentValue ?? 0) + (short?.currentValue ?? 0),
    navUsed: nav,
    navDate,
    empty: false,
  };
}

export { LTCG_EXEMPTION, LTCG_RATE_PCT, STCG_RATE_PCT };

/* ── Holding summary ──────────────────────────────────────────────────────── */

export interface HoldingSummary {
  /** Units still held. */
  units: number;
  /** Units × latest NAV. */
  currentValue: number;
  /** What those units cost, loads and duty included. */
  investedValue: number;
  /** currentValue − investedValue. */
  gains: number;
  /** Gains as a % of what was put in. */
  gainsPct: number;
  /** Weighted average cost per unit. */
  averageNav: number;
  /** Money-weighted annual return. Null when it can't be solved. */
  xirr: number | null;
  firstInvestmentDate: string | null;
  lastInvestmentDate: string | null;
  empty: boolean;
}

/**
 * Money-weighted annual return over dated cashflows.
 *
 * Solved by bisection rather than Newton-Raphson: IRR functions are badly
 * behaved near their roots and Newton can diverge on a lumpy SIP ledger, where
 * bisection always converges as long as the bracket holds a sign change.
 */
export function xirr(
  flows: { date: string; amount: number }[],
  guessLo = -0.9999,
  guessHi = 100,
): number | null {
  if (flows.length < 2) return null;
  // Needs money both in and out, or there is no rate to find.
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;

  const t0 = Date.parse(flows[0].date);
  const npv = (rate: number): number =>
    flows.reduce((sum, f) => {
      const years = (Date.parse(f.date) - t0) / (365.25 * MS_PER_DAY);
      return sum + f.amount / Math.pow(1 + rate, years);
    }, 0);

  let lo = guessLo;
  let hi = guessHi;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (!Number.isFinite(fMid)) return null;
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-9) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * What the user put in, what it's worth now, and the money-weighted return.
 *
 * All REAL — derived from the transaction ledger and the latest NAV. Cost comes
 * from open lots (FIFO), so units already sold don't inflate what's "invested".
 */
export function computeHoldingSummary(
  transactions: MfHoldingTransactionItem[],
  opts: { nav: number | null; assetType: GainAssetType; asOf?: Date },
): HoldingSummary {
  const asOf = opts.asOf ?? new Date();
  const nav = opts.nav;
  const blank: HoldingSummary = {
    units: 0,
    currentValue: 0,
    investedValue: 0,
    gains: 0,
    gainsPct: 0,
    averageNav: 0,
    xirr: null,
    firstInvestmentDate: null,
    lastInvestmentDate: null,
    empty: true,
  };
  if (!nav || nav <= 0 || transactions.length === 0) return blank;

  const lots = openLots(transactions, opts.assetType, asOf);
  if (lots.length === 0) return blank;

  const units = lots.reduce((s, l) => s + l.units, 0);
  const investedValue = lots.reduce((s, l) => s + l.units * l.costPerUnit, 0);
  const currentValue = units * nav;
  const gains = currentValue - investedValue;

  const inflows = transactions
    .filter((t) => t.is_inflow || INFLOW_TYPES.has(t.transaction_type.toUpperCase()))
    .map((t) => t.transaction_date)
    .sort();

  // XIRR over every real cashflow, closed out with today's value. Purchases are
  // money leaving the investor, so they sign negative.
  const flows = [...transactions]
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
    .map((t) => {
      const isInflow = t.is_inflow || INFLOW_TYPES.has(t.transaction_type.toUpperCase());
      const amount = Math.abs(t.amount) || Math.abs(t.units) * t.nav;
      return { date: t.transaction_date, amount: isInflow ? -amount : amount };
    });
  flows.push({ date: asOf.toISOString().slice(0, 10), amount: currentValue });

  return {
    units,
    currentValue,
    investedValue,
    gains,
    gainsPct: investedValue > 0 ? (gains / investedValue) * 100 : 0,
    averageNav: units > 0 ? investedValue / units : 0,
    xirr: xirr(flows),
    firstInvestmentDate: inflows[0] ?? null,
    lastInvestmentDate: inflows[inflows.length - 1] ?? null,
    empty: false,
  };
}
