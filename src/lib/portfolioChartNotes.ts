/**
 * Commentary for the portfolio chart: one headline sentence, plus a couple of
 * supporting notes, all derived from the points of the SELECTED range.
 *
 * Everything here is measured from the net-worth series — no invention. The
 * series carries `total_invested` alongside `total_value` on every point, which
 * is what makes the useful sentence possible: how much of the change was money
 * the user added, and how much the market did.
 *
 * Two rules keep it from becoming clutter:
 *
 *  1. **Density scales to the range.** A one-month window gets one note; the
 *     longest window gets three. Never more, whatever the data offers.
 *  2. **Everything re-derives on range switch.** Commentary computed for the 3Y
 *     view sitting on a 1M chart is worse than no commentary, so nothing is
 *     cached across horizons.
 */

import type { PortfolioNavHistoryPoint } from "@/lib/api";

export type Horizon = "1M" | "3M" | "1Y" | "3Y" | "MAX";

/** How many supporting notes each range earns, beyond the headline. */
const NOTE_BUDGET: Record<Horizon, number> = {
  "1M": 1,
  "3M": 2,
  "1Y": 3,
  "3Y": 3,
  MAX: 3,
};

/** Cards the rail may carry. Looser than the notes — the rail scrolls. */
const MOMENT_BUDGET: Record<Horizon, number> = {
  "1M": 2,
  "3M": 3,
  "1Y": 4,
  "3Y": 4,
  MAX: 5,
};

/** Human label for the window, used inside sentences. */
const WINDOW_LABEL: Record<Horizon, string> = {
  "1M": "this month",
  "3M": "over three months",
  "1Y": "over the year",
  "3Y": "over three years",
  MAX: "since you started",
};

/**
 * A moment worth telling the story of: a SPAN of the series, not a point.
 *
 * The span is what lets the rail work — tapping a card highlights that stretch
 * of the line and dims the rest, so the copy and the shape are looking at the
 * same thing.
 */
export interface ChartMoment {
  id: string;
  /** Inclusive range into the series; the chart's x-axis is keyed on index. */
  startIdx: number;
  endIdx: number;
  /** "Apr 2024" — when it happened. */
  when: string;
  /** The headline of the card. */
  title: string;
  /** One line of consequence underneath. */
  body: string;
  kind: "addition" | "drawdown" | "peak" | "crossover";
}

export interface ChartNotes {
  /** The one sentence under the gain chip. Null when the range is too thin. */
  headline: string | null;
  /** Short supporting notes, already trimmed to the range's budget. */
  notes: string[];
  /**
   * Moments for the rail below the chart, trimmed to the range's budget.
   *
   * A scrolling rail carries more than dots on the line can — that was the
   * point of choosing it — so the budget here is looser than the notes', but
   * still scales with the window.
   */
  moments: ChartMoment[];
}

const inr = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 2)}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${Math.round(a / 1e3)}k`;
  return `₹${Math.round(a)}`;
};

const pct = (n: number): string => `${Math.abs(n).toFixed(1)}%`;

const monthOf = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-IN", { month: "long" });

/**
 * Build the commentary for one range.
 *
 * `points` must already be the selected window — this never re-slices, so the
 * caller's horizon and the caller's points can't disagree.
 */
export function chartNotes(
  points: PortfolioNavHistoryPoint[],
  horizon: Horizon,
): ChartNotes {
  const empty: ChartNotes = { headline: null, notes: [], moments: [] };
  // Under a fortnight of readings there is no shape to describe.
  if (!points || points.length < 4) return empty;

  const first = points[0];
  const last = points[points.length - 1];
  if (last.total_value <= 0) return empty;

  const valueDelta = last.total_value - first.total_value;
  const addedDelta = last.total_invested - first.total_invested;
  // What the market did, once the money the user put in is taken out.
  const growthDelta = valueDelta - addedDelta;
  const window = WINDOW_LABEL[horizon];

  /* ── Headline ──────────────────────────────────────────────────────────
     The separation of contribution from growth is the thing a bare value
     chart cannot tell you, so it leads whenever both are material. */
  let headline: string;
  const materialAdd = Math.abs(addedDelta) > Math.abs(valueDelta) * 0.15;

  if (materialAdd && addedDelta > 0 && growthDelta > 0) {
    headline = `You put in ${inr(addedDelta)} ${window}; the market added another ${inr(growthDelta)}.`;
  } else if (materialAdd && addedDelta > 0 && growthDelta < 0) {
    headline = `You put in ${inr(addedDelta)} ${window}, but the market took ${inr(growthDelta)} back off it.`;
  } else if (growthDelta >= 0) {
    headline = `Up ${inr(growthDelta)} ${window} on market movement alone.`;
  } else {
    headline = `Down ${inr(growthDelta)} ${window} — market movement, not money withdrawn.`;
  }

  /* ── Supporting notes, most useful first ───────────────────────────── */
  const notes: string[] = [];
  const moments: ChartMoment[] = [];
  const monthYear = (iso: string) =>
    new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  /** A few points either side, so a highlighted span is visible on the line. */
  const pad = Math.max(2, Math.round(points.length * 0.02));
  const clampLo = (i: number) => Math.max(0, i - pad);
  const clampHi = (i: number) => Math.min(points.length - 1, i + pad);

  // Off the peak, or sitting on it. The first thing people want to know.
  // Tracked by INDEX, not by date: a series with a repeated or out-of-order
  // date would otherwise match the peak to the last point and wrongly claim an
  // all-time high.
  let peakIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].total_value > points[peakIdx].total_value) peakIdx = i;
  }
  const peak = points[peakIdx];
  const offPeak = ((last.total_value - peak.total_value) / peak.total_value) * 100;

  if (peakIdx === points.length - 1) {
    notes.push(`Today is the highest it has been ${window}.`);
  } else if (offPeak <= -1) {
    notes.push(`${pct(offPeak)} below its ${monthOf(peak.recorded_date)} peak.`);
    moments.push({
      id: `peak-${peakIdx}`,
      startIdx: clampLo(peakIdx),
      endIdx: points.length - 1,
      when: monthYear(peak.recorded_date),
      title: "Its high point so far",
      body: `${inr(peak.total_value)} at the peak. You are ${pct(offPeak)} below it now.`,
      kind: "peak",
    });
  }

  /* The worst stretch inside the window — peak to trough, which is what
     holding it actually felt like. The span starts at the peak that preceded
     the fall, so the highlight shows the whole slide rather than its floor. */
  let runPeak = points[0].total_value;
  let runPeakIdx = 0;
  let worst = 0;
  let worstIdx = 0;
  let worstFromIdx = 0;
  for (let i = 0; i < points.length; i++) {
    if (points[i].total_value > runPeak) {
      runPeak = points[i].total_value;
      runPeakIdx = i;
    }
    const dd = ((points[i].total_value - runPeak) / runPeak) * 100;
    if (dd < worst) {
      worst = dd;
      worstIdx = i;
      worstFromIdx = runPeakIdx;
    }
  }
  if (worst <= -3) {
    const at = points[worstIdx];
    notes.push(`Worst fall was ${pct(worst)}, bottoming in ${monthOf(at.recorded_date)}.`);

    // Whether it came back is the whole point of showing a fall.
    const priorPeak = points[worstFromIdx].total_value;
    let recoveredAt: number | null = null;
    for (let i = worstIdx + 1; i < points.length; i++) {
      if (points[i].total_value >= priorPeak) {
        recoveredAt = i;
        break;
      }
    }
    const weeks = Math.max(
      1,
      Math.round(
        (Date.parse(at.recorded_date) - Date.parse(points[worstFromIdx].recorded_date)) /
          (7 * 86_400_000),
      ),
    );

    moments.push({
      id: `fall-${worstIdx}`,
      startIdx: worstFromIdx,
      endIdx: recoveredAt ?? points.length - 1,
      when: monthYear(at.recorded_date),
      title: `Down ${pct(worst)} in ${weeks} week${weeks === 1 ? "" : "s"}`,
      body:
        recoveredAt != null
          ? `You held. Back to level by ${monthOf(points[recoveredAt].recorded_date)}.`
          : `Still ${pct(((last.total_value - priorPeak) / priorPeak) * 100)} below that high.`,
      kind: "drawdown",
    });
  }

  /* The biggest single top-up in the window: the largest one-step rise in
     total_invested, which is money the user actually put in. */
  let addIdx = -1;
  let addAmount = 0;
  for (let i = 1; i < points.length; i++) {
    const step = points[i].total_invested - points[i - 1].total_invested;
    if (step > addAmount) {
      addAmount = step;
      addIdx = i;
    }
  }
  // Only worth a card when it is a real lump, not one instalment of a SIP.
  if (addIdx > 0 && addAmount > last.total_invested * 0.03) {
    const at = points[addIdx];
    const since = ((last.total_value - at.total_value) / at.total_value) * 100;
    moments.push({
      id: `add-${addIdx}`,
      startIdx: clampLo(addIdx),
      endIdx: clampHi(addIdx),
      when: monthYear(at.recorded_date),
      title: "Your biggest single addition",
      body: `${inr(addAmount)} in one go. Portfolio is ${since >= 0 ? "up" : "down"} ${pct(since)} since.`,
      kind: "addition",
    });
  }

  // Whether the whole thing is ahead of what was paid for it.
  if (last.total_invested > 0) {
    const ahead = ((last.total_value - last.total_invested) / last.total_invested) * 100;
    notes.push(
      ahead >= 0
        ? `Worth ${pct(ahead)} more than you have put in.`
        : `Still ${pct(ahead)} below what you have put in.`,
    );
  }

  // The moment it first went from underwater to ahead.
  for (let i = 1; i < points.length; i++) {
    const was = points[i - 1].total_value - points[i - 1].total_invested;
    const now = points[i].total_value - points[i].total_invested;
    if (was < 0 && now >= 0) {
      moments.push({
        id: `cross-${i}`,
        startIdx: clampLo(i),
        endIdx: clampHi(i),
        when: monthYear(points[i].recorded_date),
        title: "Moved into profit",
        body: "Worth more than you had put in, for the first time in this window.",
        kind: "crossover",
      });
      break;
    }
  }

  return {
    headline,
    notes: notes.slice(0, NOTE_BUDGET[horizon]),
    // Oldest first, so the rail reads left-to-right like the chart above it.
    moments: moments
      .sort((a, b) => a.startIdx - b.startIdx)
      .slice(0, MOMENT_BUDGET[horizon]),
  };
}
