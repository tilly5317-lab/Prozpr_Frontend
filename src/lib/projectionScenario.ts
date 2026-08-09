import type { AnnualCashflowRow } from "./api";

/**
 * Return-sensitivity scenarios for the goals projection.
 *
 * Only return-on-investment reacts to the assumed post-tax rate; contributions,
 * one-offs and goal payouts are held at their engine values, so the user sees
 * the pure effect of returns.
 */
export const PROJECTION_BASE_RATE = 9;

export const BASE_SCENARIO_ID = "base";

export interface ProjectionScenario {
  id: string;
  label: string;
  rate: number;
}

export const PROJECTION_SCENARIOS: ProjectionScenario[] = [
  { id: "cons", label: "Conservative", rate: 7 },
  { id: BASE_SCENARIO_ID, label: "Base", rate: 9 },
  { id: "opt", label: "Optimistic", rate: 11 },
];

export function scenarioById(id: string): ProjectionScenario {
  return PROJECTION_SCENARIOS.find((s) => s.id === id) ?? PROJECTION_SCENARIOS[1];
}

const SAVED_SCENARIO_KEY = "goals-projection-scenario";

/** The applied scenario from a previous visit; Base when nothing was saved. */
export function readSavedScenarioId(): string {
  if (typeof window === "undefined") return BASE_SCENARIO_ID;
  try {
    const stored = window.localStorage.getItem(SAVED_SCENARIO_KEY);
    // Guard against a stale id from a renamed scenario — fall back to Base
    // rather than silently resolving it to Base's numbers under a wrong label.
    return PROJECTION_SCENARIOS.some((s) => s.id === stored) ? stored! : BASE_SCENARIO_ID;
  } catch {
    return BASE_SCENARIO_ID;
  }
}

export function writeSavedScenarioId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_SCENARIO_KEY, id);
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
 * re-derived client-side unless the user actually asks for a scenario.
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
