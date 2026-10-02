/**
 * Pure helpers for the net-worth history chart (PortfolioNavChart): date
 * handling, horizon selection and the series caption. Kept out of the component
 * file so they can be unit-tested and so the component stays fast-refreshable.
 */
import type { PortfolioNavHistoryResponse, PortfolioNavHorizon } from "@/lib/api";

// `new Date("2026-09-09")` is parsed as UTC midnight, but every formatter below
// renders in the *browser's* timezone — so west of UTC the whole chart, tooltip
// included, showed the day before the one the backend recorded. Build the date from
// its parts instead, so a recorded_date always renders as itself.
export function parseSeriesDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// X-axis label format depends on horizon: short windows (1M / 3M) read as
// "dd-mmm" (e.g. 05-Jun); longer windows read as "mmm-yy" (e.g. Jun-26).
export function formatXLabel(iso: string, horizon: PortfolioNavHorizon): string {
  const d = parseSeriesDate(iso);
  const mon = d.toLocaleDateString("en-IN", { month: "short" });
  if (horizon === "1M" || horizon === "3M") {
    const dd = String(d.getDate()).padStart(2, "0");
    return `${dd}-${mon}`;
  }
  const yy = String(d.getFullYear()).slice(-2);
  return `${mon}-${yy}`;
}

export function formatSeriesDate(iso: string): string {
  return parseSeriesDate(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Default horizon is 3Y; an account with less history than that drops to the
// closest shorter standard period. Thresholds sit slightly under each window so an
// account that only just clears a period isn't bumped down a notch by edge days.
export function pickHorizonForSpan(spanDays: number): PortfolioNavHorizon {
  if (spanDays >= 1000) return "3Y";
  if (spanDays >= 300) return "1Y";
  if (spanDays >= 75) return "3M";
  return "1M";
}

export type SeriesMeta = Pick<
  PortfolioNavHistoryResponse,
  "as_of" | "is_stale" | "degraded_schemes" | "ledger_complete"
>;

// One quiet line under the picker that qualifies the chart when the backend says
// the numbers are real but not settled. Nothing is shown on the healthy path.
export function seriesCaption(meta: SeriesMeta | null): string | null {
  if (!meta) return null;
  const notes: string[] = [];
  if (meta.is_stale && meta.as_of) notes.push(`Values as of ${formatSeriesDate(meta.as_of)}`);
  if (meta.degraded_schemes > 0) {
    notes.push(
      meta.degraded_schemes === 1
        ? "1 fund priced provisionally"
        : `${meta.degraded_schemes} funds priced provisionally`
    );
  }
  if (!meta.ledger_complete) notes.push("Holdings from before your statement are estimated");
  return notes.length ? notes.join(" · ") : null;
}
