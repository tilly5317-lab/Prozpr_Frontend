import type { PortfolioNavHistoryPoint } from "./api";
import { windowStartIndex, type AnalysisRange } from "./twr";

export interface BuildUp {
  /** Corpus at the start of the window (₹0 for "All" — anchored before inception). */
  startingValue: number;
  /** Money added during the window: invested_end − invested_start (negative = net withdrawal). */
  netInvested: number;
  /** What the market added during the window (negative in a down period). */
  marketGain: number;
  /** Corpus on the latest tracked day. */
  currentValue: number;
}

/**
 * Decompose how the corpus built up over the selected window:
 *
 *   startingValue + netInvested + marketGain = currentValue
 *
 * The identity always holds — for any window and any mix of buys/sells — because
 * it's pure algebra on two stored daily points (window start + latest). For "All"
 * the window is anchored before inception (start value & invested = 0), so the
 * whole corpus reads as contributions + market gain.
 *
 * Returns null when there's too little history (< 2 points) to show a build-up.
 */
export function computeBuildUp(
  points: PortfolioNavHistoryPoint[],
  range: AnalysisRange,
  today: Date
): BuildUp | null {
  if (points.length < 2) return null;

  const end = points[points.length - 1];
  let startValue: number;
  let startInvested: number;
  if (range === "All") {
    startValue = 0;
    startInvested = 0;
  } else {
    const startIdx = windowStartIndex(points.map((p) => p.recorded_date), range, today);
    const start = points[startIdx];
    startValue = start.total_value;
    startInvested = start.total_invested;
  }

  const netInvested = end.total_invested - startInvested;
  const marketGain = end.total_value - startValue - netInvested;
  return {
    startingValue: startValue,
    netInvested,
    marketGain,
    currentValue: end.total_value,
  };
}
