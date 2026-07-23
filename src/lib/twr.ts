import type { TwrPoint } from "./api";

export type AnalysisRange = "1M" | "3M" | "YTD" | "1Y" | "3Y" | "All";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Index of the first date at/after the window's start (All → 0). Takes a list of
 *  ISO date strings so any dated series (TWR, nav history) can reuse it. */
export function windowStartIndex(dates: string[], range: AnalysisRange, today: Date): number {
  if (range === "All" || dates.length === 0) return 0;
  const cutoff = new Date(today);
  if (range === "YTD") {
    cutoff.setMonth(0, 1);
    cutoff.setHours(0, 0, 0, 0);
  } else {
    const days = range === "1M" ? 30 : range === "3M" ? 90 : range === "1Y" ? 365 : 365 * 3;
    cutoff.setDate(cutoff.getDate() - days);
  }
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const idx = dates.findIndex((d) => d >= cutoffStr);
  return idx < 0 ? Math.max(0, dates.length - 1) : idx;
}

export interface RebasedPoint {
  i: number;
  date: string;
  twr: number;
  bench_nifty50?: number;
}

export interface RebasedTwr {
  twr: number;
  niftyTwr: number | null;
  series: RebasedPoint[];
}

/** Rebase a growth-of-1 series to the window start: value_t / value_start − 1 (as %). */
export function rebaseTwr(points: TwrPoint[], startIdx: number): RebasedTwr {
  const window = points.slice(startIdx);
  if (window.length === 0) return { twr: 0, niftyTwr: null, series: [] };
  const base = window[0];
  // Benchmark base = first point IN THE WINDOW that has a value: the stored Nifty
  // series can start after (or stop before) the portfolio series, so the window's
  // first point having no benchmark must not drop the line for the whole range.
  const niftyBase = window.find((p) => p.nifty_index != null)?.nifty_index ?? null;
  const series: RebasedPoint[] = window.map((p, i) => {
    const pt: RebasedPoint = {
      i,
      date: p.date,
      twr: round1((p.portfolio_index / base.portfolio_index - 1) * 100),
    };
    if (niftyBase != null && p.nifty_index != null) {
      pt.bench_nifty50 = round1((p.nifty_index / niftyBase - 1) * 100);
    }
    return pt;
  });
  const last = window[window.length - 1];
  const twr = round1((last.portfolio_index / base.portfolio_index - 1) * 100);
  // Last benchmark value in the window (the series may end before the portfolio
  // series does when benchmark data is a few days stale).
  const lastNifty = [...window].reverse().find((p) => p.nifty_index != null)?.nifty_index ?? null;
  const niftyTwr =
    niftyBase != null && lastNifty != null
      ? round1((lastNifty / niftyBase - 1) * 100)
      : null;
  return { twr, niftyTwr, series };
}
