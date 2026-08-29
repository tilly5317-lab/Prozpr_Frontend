/**
 * The valuation & risk metrics shown on the fund analysis screen.
 *
 * Lives in lib rather than beside the component so the screen and the Excel
 * export read from one list and cannot drift apart.
 */

export interface RatioSpec {
  k: string;
  label: string;
  d: number;
  hi: boolean;
  suf?: string;
  help: string;
}

export const RATIOS: RatioSpec[] = [
  { k: "pe", label: "P/E (TTM)", d: 1, hi: false, suf: "x", help: "What the fund's holdings cost per ₹1 of their yearly profit. Lower means you're paying less for the same earnings." },
  { k: "pb", label: "P/B (TTM)", d: 1, hi: false, suf: "x", help: "Price paid per ₹1 of the companies' book value. Lower is cheaper, but very low can signal weaker businesses." },
  { k: "ps", label: "P/S (TTM)", d: 1, hi: false, suf: "x", help: "Price paid per ₹1 of sales. Useful when profits swing around a lot." },
  { k: "dy", label: "Prospective dividend yield", d: 2, hi: true, suf: "%", help: "Dividends the holdings are expected to pay, as a share of their price. Higher means more cash income." },
  { k: "alpha", label: "Alpha ratio", d: 1, hi: true, help: "Return the manager added beyond what the market move alone explains. Above zero is value added." },
  { k: "mdd", label: "Max drawdown, 3 yr", d: 1, hi: true, suf: "%", help: "The worst peak-to-bottom fall in the last three years. A smaller fall is easier to sit through." },
  { k: "mean3", label: "3 yr mean return", d: 1, hi: true, suf: "%", help: "Average yearly return over three years." },
  { k: "sharpe", label: "Sharpe ratio, 3 yr", d: 2, hi: true, help: "Return earned for each unit of ups and downs. Higher means a smoother ride for the same return." },
  { k: "sortino", label: "Sortino ratio, 3 yr", d: 2, hi: true, help: "Like Sharpe, but only counts the falls. Higher means fewer painful drops." },
  { k: "ir", label: "Information ratio, 3 yr", d: 2, hi: true, help: "How reliably the fund beats its benchmark. Higher means the outperformance is consistent, not luck." },
  { k: "te", label: "Tracking error, 3 yr", d: 1, hi: false, suf: "%", help: "How far the fund strays from its benchmark. Higher means a more active, less predictable path." },
];
