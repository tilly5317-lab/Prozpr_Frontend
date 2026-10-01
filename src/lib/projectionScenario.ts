import type { AnnualCashflowRow } from "./api";

/**
 * Return sensitivity for the goals projection.
 *
 * The assumed post-tax return is a continuous choice on a 0-20% scale. Only
 * return-on-investment reacts to it; contributions, one-offs and goal payouts
 * stay at their engine values, so the user sees the pure effect of returns.
 *
 * The named bands give a number meaning — 4% is a conservative assumption, 14%
 * an optimistic one — but the rate itself drives every calculation, so a band is
 * only ever a label on the number.
 */
export const PROJECTION_BASE_RATE = 9;

export const RETURN_MIN = 0;
export const RETURN_MAX = 20;
/** Half-point steps: fine enough to matter over 20 years, coarse enough to aim at. */
export const RETURN_STEP = 0.5;

export interface ReturnBand {
  label: string;
  /** Inclusive lower bound. */
  from: number;
  /** Exclusive upper bound — except the top band, which includes RETURN_MAX. */
  to: number;
  blurb: string;
}

export const RETURN_BANDS: ReturnBand[] = [
  { label: "Conservative", from: 0, to: 5, blurb: "Cash-like to defensive debt" },
  { label: "Base", from: 5, to: 11, blurb: "Around what your plan assumes" },
  { label: "Optimistic", from: 11, to: 20, blurb: "Sustained equity outperformance" },
];

/** The band a rate falls in. A boundary belongs to the higher band — 5% is Base. */
export function bandForRate(rate: number): ReturnBand {
  for (const band of RETURN_BANDS) {
    if (rate >= band.from && rate < band.to) return band;
  }
  // RETURN_MAX itself, and anything past it, is the top band.
  return RETURN_BANDS[RETURN_BANDS.length - 1];
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return PROJECTION_BASE_RATE;
  return Math.min(RETURN_MAX, Math.max(RETURN_MIN, rate));
}

/** Where a rate sits along the track, 0-100, for painting fills and ticks. */
export function ratePct(rate: number): number {
  return ((clampRate(rate) - RETURN_MIN) / (RETURN_MAX - RETURN_MIN)) * 100;
}

/** One decimal only when there is one, so 9% doesn't render as "9.0%". */
export function formatRate(rate: number): string {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(1)}%`;
}

const SAVED_RATE_KEY = "goals-projection-rate";

/** The applied rate from a previous visit; the engine's own rate if none. */
export function readSavedRate(): number {
  if (typeof window === "undefined") return PROJECTION_BASE_RATE;
  try {
    const stored = window.localStorage.getItem(SAVED_RATE_KEY);
    if (stored === null) return PROJECTION_BASE_RATE;
    const n = Number(stored);
    // Junk or out-of-range falls back to the engine's rate rather than silently
    // projecting on a number the user never chose.
    if (!Number.isFinite(n) || n < RETURN_MIN || n > RETURN_MAX) return PROJECTION_BASE_RATE;
    return n;
  } catch {
    return PROJECTION_BASE_RATE;
  }
}

export function writeSavedRate(rate: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_RATE_KEY, String(rate));
  } catch {
    /* private mode / quota — the choice just won't survive the reload */
  }
}

/**
 * Replay the engine's per-FY corpus path under a different post-tax return.
 *
 * Only returns react. Each year's contributions, one-offs and goal payouts are
 * lifted out as a single residual (closing − opening − returns) and replayed
 * untouched, so a scenario can never invent or delete a cashflow — it just
 * changes what the corpus earns on the way.
 *
 * At the base rate this is a no-op by construction (the same array is handed
 * back). That is what keeps the default view the engine's SSOT — nothing is
 * re-derived client-side unless the user actually moves the slider off it.
 */
export function scaleAnnualRowsToRate(
  rows: AnnualCashflowRow[],
  rate: number,
): AnnualCashflowRow[] {
  if (rate === PROJECTION_BASE_RATE || rows.length === 0) return rows;
  const factor = rate / PROJECTION_BASE_RATE;
  const ordered = [...rows].sort(
    (a, b) => Date.parse(a.fy_end_date) - Date.parse(b.fy_end_date),
  );
  let opening = ordered[0].corpus_opening;
  return ordered.map((row) => {
    const flows = row.corpus_closing - row.corpus_opening - row.investment_returns;
    // Yield the engine earned on that year's opening corpus, applied to the
    // scenario's (drifted) opening balance. With no opening balance there is no
    // yield to read off, so the return itself is scaled instead.
    const investment_returns =
      Math.abs(row.corpus_opening) > 1
        ? opening * (row.investment_returns / row.corpus_opening) * factor
        : row.investment_returns * factor;
    const corpus_closing = opening + flows + investment_returns;
    const scaled: AnnualCashflowRow = {
      ...row,
      corpus_opening: opening,
      investment_returns,
      corpus_closing,
    };
    opening = corpus_closing;
    return scaled;
  });
}
