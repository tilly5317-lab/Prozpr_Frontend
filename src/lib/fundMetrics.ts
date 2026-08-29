/**
 * Risk and consistency metrics derived from a fund's NAV series.
 *
 * Everything here is computed client-side from the NAV history the fund-detail
 * endpoint already returns — no new backend data. That bounds what's possible:
 * metrics needing the portfolio's holdings (P/E, P/B, sector mix, credit
 * quality) or a benchmark series (alpha, tracking error, information ratio)
 * are NOT here, because deriving them from NAV alone would mean inventing them.
 *
 * Every function returns `null` rather than a misleading number when the series
 * is too short or too sparse to support the calculation.
 */

import type { FundNavPoint } from "@/components/fund/FundScreenUi";

/**
 * Risk-free rate used by Sharpe / Sortino, as a yearly percentage. Roughly the
 * Indian 10-year government bond. It's a stated assumption, not a live rate —
 * the UI says so wherever a ratio built on it is shown, because a reader who
 * doesn't know the rate can't judge the ratio.
 */
export const RISK_FREE_PCT = 6.5;

/** Below this many observations a window is too thin to characterise. */
const MIN_POINTS = 30;

const MS_PER_DAY = 86_400_000;

const daysBetween = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY;

/** Ascending-by-date copy, dropping non-positive NAVs (they break log returns). */
function clean(points: FundNavPoint[]): FundNavPoint[] {
  return points
    .filter((p) => Number.isFinite(p.nav) && p.nav > 0 && !Number.isNaN(Date.parse(p.date)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The trailing slice covering `years` from the last observation. */
export function windowOf(points: FundNavPoint[], years: number): FundNavPoint[] {
  const pts = clean(points);
  if (pts.length === 0) return [];
  const end = new Date(pts[pts.length - 1].date).getTime();
  const cutoff = end - years * 365.25 * MS_PER_DAY;
  return pts.filter((p) => new Date(p.date).getTime() >= cutoff);
}

/**
 * Observations per year in this series. Computed from the actual date span
 * rather than assumed to be 252, so a weekly or gappy series annualises
 * correctly instead of being inflated ~5x.
 */
function obsPerYear(pts: FundNavPoint[]): number | null {
  if (pts.length < 2) return null;
  const span = daysBetween(pts[0].date, pts[pts.length - 1].date);
  if (span <= 0) return null;
  return ((pts.length - 1) / span) * 365.25;
}

/** Simple period-over-period returns as fractions (0.01 = +1%). */
function periodReturns(pts: FundNavPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) out.push(pts[i].nav / pts[i - 1].nav - 1);
  return out;
}

/** Annualised return over the window, as a percentage. CAGR beyond one year. */
export function annualisedReturnPct(points: FundNavPoint[], years: number): number | null {
  const pts = windowOf(points, years);
  if (pts.length < MIN_POINTS) return null;
  const span = daysBetween(pts[0].date, pts[pts.length - 1].date) / 365.25;
  if (span <= 0) return null;
  const growth = pts[pts.length - 1].nav / pts[0].nav;
  if (growth <= 0) return null;
  // Under a year, annualising a short run overstates it wildly — report the
  // plain return instead.
  if (span < 1) return (growth - 1) * 100;
  return (Math.pow(growth, 1 / span) - 1) * 100;
}

/** Annualised standard deviation of returns, as a percentage. */
export function volatilityPct(points: FundNavPoint[], years: number): number | null {
  const pts = windowOf(points, years);
  if (pts.length < MIN_POINTS) return null;
  const perYear = obsPerYear(pts);
  if (perYear == null) return null;
  const rets = periodReturns(pts);
  if (rets.length < 2) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  // Sample variance (n-1): these returns are a sample of the fund's behaviour,
  // not the whole population of it.
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(perYear) * 100;
}

/**
 * Worst peak-to-trough fall in the window, as a NEGATIVE percentage, with the
 * dates that bracket it. This is the number that tells you what holding the
 * fund actually felt like at its worst.
 */
export function maxDrawdown(
  points: FundNavPoint[],
  years: number,
): { pct: number; peakDate: string; troughDate: string; recovered: boolean } | null {
  const pts = windowOf(points, years);
  if (pts.length < MIN_POINTS) return null;

  let peak = pts[0].nav;
  let peakDate = pts[0].date;
  let worst = 0;
  let worstPeakDate = pts[0].date;
  let worstTroughDate = pts[0].date;

  for (const p of pts) {
    if (p.nav > peak) {
      peak = p.nav;
      peakDate = p.date;
    }
    const dd = p.nav / peak - 1;
    if (dd < worst) {
      worst = dd;
      worstPeakDate = peakDate;
      worstTroughDate = p.date;
    }
  }
  if (worst === 0) return null;

  // Did the NAV get back to the pre-fall peak by the end of the window?
  const peakNav = pts.find((p) => p.date === worstPeakDate)?.nav ?? peak;
  const recovered = pts.some((p) => p.date > worstTroughDate && p.nav >= peakNav);

  return { pct: worst * 100, peakDate: worstPeakDate, troughDate: worstTroughDate, recovered };
}

/**
 * Sharpe: excess return over {@link RISK_FREE_PCT} per unit of total
 * volatility. Higher means a smoother ride for the same return.
 */
export function sharpeRatio(points: FundNavPoint[], years: number): number | null {
  const ret = annualisedReturnPct(points, years);
  const vol = volatilityPct(points, years);
  if (ret == null || vol == null || vol <= 0) return null;
  return (ret - RISK_FREE_PCT) / vol;
}

/**
 * Sortino: like Sharpe, but the denominator counts only downside deviation —
 * it doesn't penalise a fund for jumping upward.
 */
export function sortinoRatio(points: FundNavPoint[], years: number): number | null {
  const pts = windowOf(points, years);
  if (pts.length < MIN_POINTS) return null;
  const perYear = obsPerYear(pts);
  const ret = annualisedReturnPct(points, years);
  if (perYear == null || ret == null) return null;

  const rets = periodReturns(pts);
  // Per-period risk-free hurdle; only shortfalls below it count.
  const target = Math.pow(1 + RISK_FREE_PCT / 100, 1 / perYear) - 1;
  const shortfalls = rets.map((r) => Math.min(0, r - target));
  const downVar = shortfalls.reduce((s, d) => s + d * d, 0) / rets.length;
  const downside = Math.sqrt(downVar) * Math.sqrt(perYear) * 100;
  if (downside <= 0) return null;
  return (ret - RISK_FREE_PCT) / downside;
}

/** Best and worst one-year stretch inside the window, as percentages. */
export function bestWorstYear(
  points: FundNavPoint[],
  years: number,
): { best: number; worst: number } | null {
  const pts = windowOf(points, years);
  if (pts.length < MIN_POINTS) return null;

  let best = -Infinity;
  let worst = Infinity;
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    // Advance j to the earliest point at least a year before pts[i].
    while (j < i && daysBetween(pts[j].date, pts[i].date) > 366) j++;
    if (j === 0 && daysBetween(pts[0].date, pts[i].date) < 360) continue;
    const from = pts[Math.max(0, j - 1)];
    if (daysBetween(from.date, pts[i].date) < 360) continue;
    const r = (pts[i].nav / from.nav - 1) * 100;
    if (r > best) best = r;
    if (r < worst) worst = r;
  }
  if (best === -Infinity || worst === Infinity) return null;
  return { best, worst };
}

/**
 * Return for each complete calendar year in the series.
 *
 * A year is measured from the previous year's closing NAV, so the first year is
 * only included when the series actually starts before it — otherwise the
 * "year" would silently be a partial stub and read as underperformance.
 */
export function calendarYearReturns(points: FundNavPoint[]): { year: number; pct: number }[] {
  const pts = clean(points);
  if (pts.length < 2) return [];

  const lastOfYear = new Map<number, FundNavPoint>();
  for (const p of pts) lastOfYear.set(new Date(p.date).getFullYear(), p);

  const years = [...lastOfYear.keys()].sort((a, b) => a - b);
  const firstYear = new Date(pts[0].date).getFullYear();
  const out: { year: number; pct: number }[] = [];

  for (const y of years) {
    const prev = lastOfYear.get(y - 1);
    // Needs a real prior-year close; a partial opening year is skipped.
    if (!prev || y - 1 < firstYear) continue;
    const end = lastOfYear.get(y);
    if (!end) continue;
    out.push({ year: y, pct: (end.nav / prev.nav - 1) * 100 });
  }
  return out;
}

/**
 * Annualised return over the `window` years ending at each calendar year-end.
 *
 * A year is only reported when the series actually reaches back the full
 * window, so a rolling 3-year figure is never a 14-month stub wearing a
 * 3-year label.
 */
export function rollingReturnsByYear(
  points: FundNavPoint[],
  window = 3,
): { year: number; pct: number }[] {
  const pts = clean(points);
  if (pts.length < 2) return [];

  const lastOfYear = new Map<number, FundNavPoint>();
  for (const p of pts) lastOfYear.set(new Date(p.date).getFullYear(), p);

  const out: { year: number; pct: number }[] = [];
  for (const y of [...lastOfYear.keys()].sort((a, b) => a - b)) {
    const end = lastOfYear.get(y);
    const start = lastOfYear.get(y - window);
    if (!end || !start) continue;
    const span = daysBetween(start.date, end.date) / 365.25;
    if (span <= 0) continue;
    const growth = end.nav / start.nav;
    if (growth <= 0) continue;
    out.push({ year: y, pct: (Math.pow(growth, 1 / span) - 1) * 100 });
  }
  return out;
}

/** Everything the risk section shows, for one trailing window. */
export interface FundRiskMetrics {
  years: number;
  /** True when the series is long enough for the window to mean anything. */
  sufficient: boolean;
  annualisedReturnPct: number | null;
  volatilityPct: number | null;
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: ReturnType<typeof maxDrawdown>;
  bestWorst: ReturnType<typeof bestWorstYear>;
}

export function computeFundRiskMetrics(
  points: FundNavPoint[],
  years: number,
): FundRiskMetrics {
  const pts = windowOf(points, years);
  // "Sufficient" means both enough observations AND enough calendar coverage —
  // 200 points inside three months is still not a 3-year record.
  const span = pts.length >= 2 ? daysBetween(pts[0].date, pts[pts.length - 1].date) / 365.25 : 0;
  const sufficient = pts.length >= MIN_POINTS && span >= Math.min(years, 1) * 0.8;

  return {
    years,
    sufficient,
    annualisedReturnPct: sufficient ? annualisedReturnPct(points, years) : null,
    volatilityPct: sufficient ? volatilityPct(points, years) : null,
    sharpe: sufficient ? sharpeRatio(points, years) : null,
    sortino: sufficient ? sortinoRatio(points, years) : null,
    maxDrawdown: sufficient ? maxDrawdown(points, years) : null,
    bestWorst: sufficient ? bestWorstYear(points, years) : null,
  };
}
