import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Minimal row shape the chart needs (satisfied by lib/driftRows DriftRow). */
interface CvtRow {
  key: string;
  label: string;
  color: string;
  currentInr: number;
  targetInr: number;
  /** The goal mix. Only read when "goal" is in `bars`; 0 everywhere else. */
  goalInr?: number;
  amountText: string;
}

type BarKind = "current" | "target" | "goal";

/** The amber disclosure under the bars (satisfied by api RebalancingPlanGap). */
interface CvtGap {
  question: string;
  summary: string;
  points: string[];
  footnote?: string | null;
}

// Row labels. "Target" is where the PLAN lands, which is not the same thing as the
// customer's goal mix — a rebalance is cash-neutral and cannot sell short-term
// units, so the two legitimately differ. Naming them apart is half the fix for
// customers who read the Target bar as the preference they had saved.
const BAR_LABEL: Record<BarKind, string> = {
  current: "Current",
  target: "After plan",
  goal: "Your goal",
};

// Drift caption colours — semantic so they track the active light/dark theme.
const OVERWEIGHT = "hsl(var(--destructive))";
const UNDERWEIGHT = "hsl(var(--wealth-green))";
const NEUTRAL = "hsl(var(--muted-foreground))";
const cardStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 16,
} as const;

/** Unsigned compact ₹ for axis ticks (e.g. ₹2L, ₹4.5L, ₹1.2Cr). */
function axisINR(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${Math.round(a / 1e3)}K`;
  return `₹${Math.round(a)}`;
}

/**
 * "Current vs target" — Equity, Debt and Others combined into one bar per view
 * (segments coloured per asset class) sharing a single ₹ x-axis. Axis max = the
 * largest rendered total so each 100%-allocation bar fills the full width; segment
 * % labels are largest-remainder-rounded to sum to exactly 100. Shared by the
 * rebalancing page and the SIP / lump-sum tabs.
 *
 * Up to three bars: Current (held today), After plan (where this plan lands) and
 * Your goal (the mix goals + risk + saved preference call for). `gap` renders below
 * them as ONE tappable amber line — the constraint that keeps "After plan" off
 * "Your goal" takes a paragraph to state honestly, and a paragraph parked under a
 * chart goes unread, so the line carries the two percentages and the detail opens
 * on demand. Amber matches PreferenceScopeNotice, the other preference caveat.
 */
export function CurrentVsTargetChart({
  rows,
  bars = ["current", "target"],
  title = "Current vs target",
  gap,
}: {
  rows: CvtRow[];
  /** Which bars to render, in order. Pass ["target"] for target-only. */
  bars?: BarKind[];
  title?: string;
  /** Why "After plan" is not "Your goal". Null when the plan reaches the goal. */
  gap?: CvtGap | null;
}) {
  // Hooks must run before the early return below, so this sits above it.
  const [gapOpen, setGapOpen] = useState(false);

  if (rows.length === 0) return null;

  const includeCur = bars.includes("current");
  const includeTgt = bars.includes("target");
  const includeGoal = bars.includes("goal");
  const barEase = [0.22, 1, 0.36, 1] as const;
  const inrFor = (row: CvtRow, which: BarKind) =>
    which === "current" ? row.currentInr : which === "target" ? row.targetInr : (row.goalInr ?? 0);
  const totalCurInr = rows.reduce((s, r) => s + r.currentInr, 0);
  const totalTgtInr = rows.reduce((s, r) => s + r.targetInr, 0);
  const totalGoalInr = rows.reduce((s, r) => s + (r.goalInr ?? 0), 0);
  const axisMax = Math.max(
    1,
    includeCur ? totalCurInr : 0,
    includeTgt ? totalTgtInr : 0,
    includeGoal ? totalGoalInr : 0,
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * axisMax);

  // Whole-number percentages that sum to exactly 100 per bar (largest-remainder
  // rounding), so the segment labels add up instead of drifting to 99/101.
  const pctsTo100 = (values: number[]): number[] => {
    const total = values.reduce((s, v) => s + v, 0);
    if (total <= 0) return values.map(() => 0);
    const raw = values.map((v) => (v / total) * 100);
    const out = raw.map((r) => Math.floor(r));
    let left = 100 - out.reduce((s, v) => s + v, 0);
    raw
      .map((r, i) => ({ i, frac: r - Math.floor(r) }))
      .sort((a, b) => b.frac - a.frac)
      .forEach(({ i }) => {
        if (left > 0) {
          out[i] += 1;
          left -= 1;
        }
      });
    return out;
  };
  const curPcts = pctsTo100(rows.map((r) => r.currentInr));
  const tgtPcts = pctsTo100(rows.map((r) => r.targetInr));
  const goalPcts = pctsTo100(rows.map((r) => r.goalInr ?? 0));
  const pctFor = (i: number, which: BarKind) =>
    which === "current" ? curPcts[i] : which === "target" ? tgtPcts[i] : goalPcts[i];
  const barDefs = bars.map((which) => ({ which, label: BAR_LABEL[which] }));

  return (
    <section style={cardStyle} className="px-3 py-3">
      <p className="text-[11px] tracking-[0.16em] uppercase text-muted-foreground">
        {title}
      </p>

      {/* Legend — colour identifies the asset class. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {rows.map((row) => (
          <span key={row.key} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
            {row.label}
          </span>
        ))}
      </div>

      <TooltipProvider delayDuration={100}>
        <div className="mt-2 space-y-2.5">
          {barDefs.map(({ which, label }, bi) => (
            <div key={which} className="flex items-center gap-2.5">
              <span className="w-[68px] shrink-0 text-[12px] leading-tight text-muted-foreground">{label}</span>
              <div className="flex h-[25px] flex-1 overflow-hidden rounded-[3px] bg-muted">
                {rows.map((row, i) => {
                  const curPct = curPcts[i];
                  const tgtPct = tgtPcts[i];
                  const pct = pctFor(i, which);
                  const inr = inrFor(row, which);
                  const w = (inr / axisMax) * 100;
                  if (w <= 0) return null;
                  const drift = curPct - tgtPct;
                  return (
                    <Tooltip key={`${which}-${row.key}`}>
                      <TooltipTrigger asChild>
                        <motion.div
                          // Focusable so a tap opens the tooltip on touch devices
                          // (Radix tooltips open on hover/focus, never on tap).
                          tabIndex={0}
                          role="button"
                          aria-label={`${row.label} ${pct}%`}
                          className="flex h-full cursor-pointer items-center justify-center focus:outline-none"
                          style={{ background: row.color, flexShrink: 0 }}
                          initial={{ width: 0 }}
                          animate={{ width: `${w}%` }}
                          transition={{ duration: 0.85, ease: barEase, delay: bi * 0.12 + i * 0.06 }}
                        >
                          {pct > 0 && (
                            <span className="px-0.5 text-[9px] font-semibold leading-none tabular-nums text-white/95">
                              {pct}%
                            </span>
                          )}
                        </motion.div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="px-3 py-2">
                        <div className="mb-1 flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                          <span className="text-[11px] font-semibold">{row.label}</span>
                        </div>
                        <div className="space-y-0.5 text-[11px]">
                          {includeCur && (
                            <div className="flex items-center justify-between gap-5">
                              <span className="text-muted-foreground">Current</span>
                              <span className="font-medium tabular-nums">
                                {curPct}% · {axisINR(row.currentInr)}
                              </span>
                            </div>
                          )}
                          {includeTgt && (
                            <div className="flex items-center justify-between gap-5">
                              <span className="text-muted-foreground">After plan</span>
                              <span className="font-medium tabular-nums">
                                {tgtPct}% · {axisINR(row.targetInr)}
                              </span>
                            </div>
                          )}
                          {includeGoal && (
                            <div className="flex items-center justify-between gap-5">
                              <span className="text-muted-foreground">Your goal</span>
                              <span className="font-medium tabular-nums">
                                {goalPcts[i]}% · {axisINR(row.goalInr ?? 0)}
                              </span>
                            </div>
                          )}
                          {includeCur && includeTgt && (
                            <div
                              className="pt-0.5 font-medium"
                              style={{ color: drift > 0 ? OVERWEIGHT : drift < 0 ? UNDERWEIGHT : NEUTRAL }}
                            >
                              {row.amountText}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </TooltipProvider>

      {/* Shared ₹ x-axis — aligned with the bar area (past the Current / Target label column). */}
      <div className="mt-2 flex items-start gap-2.5">
        <span className="w-[68px] shrink-0" />
        <div className="relative h-4 flex-1">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute top-0 text-[10px] tabular-nums text-muted-foreground"
              style={{
                left: `${i * 25}%`,
                transform:
                  i === 0 ? "none" : i === ticks.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {axisINR(t)}
            </span>
          ))}
        </div>
      </div>

      {gap && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setGapOpen((open) => !open)}
            aria-expanded={gapOpen}
            className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--wealth-amber))] focus-visible:ring-offset-2 rounded"
          >
            <span className="text-[12.5px] font-semibold leading-snug text-[hsl(var(--wealth-amber))]">
              {gap.question}
            </span>
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 shrink-0 text-[hsl(var(--wealth-amber))] transition-transform duration-200 ${
                gapOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {gapOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: barEase }}
              className="mt-2.5 rounded-xl border border-[hsl(var(--wealth-amber))] bg-[hsl(var(--wealth-amber-light))] p-3"
            >
              <p className="text-[12px] font-semibold leading-snug text-foreground">
                {gap.summary}
              </p>
              <ul className="mt-2 space-y-1.5">
                {gap.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground"
                  >
                    <span aria-hidden className="text-[hsl(var(--wealth-amber))]">
                      &bull;
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              {gap.footnote && (
                <p className="mt-2.5 border-t border-[hsl(var(--wealth-amber))]/35 pt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  {gap.footnote}
                </p>
              )}
            </motion.div>
          )}
        </div>
      )}
    </section>
  );
}
