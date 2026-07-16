import { motion } from "framer-motion";
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
  amountText: string;
}

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
 * "Current vs target" — Equity, Debt and Others combined into a single Current
 * bar and a single Target bar (segments coloured per asset class) that share one
 * ₹ x-axis. Axis max = the (larger) portfolio total so each 100%-allocation bar
 * fills the full width; segment % labels are largest-remainder-rounded to sum to
 * exactly 100. Shared by the rebalancing page and the SIP tab.
 */
export function CurrentVsTargetChart({
  rows,
  bars = ["current", "target"],
  title = "Current vs target",
}: {
  rows: CvtRow[];
  /** Which bars to render. Default shows both; pass ["target"] for target-only. */
  bars?: Array<"current" | "target">;
  title?: string;
}) {
  if (rows.length === 0) return null;

  const includeCur = bars.includes("current");
  const includeTgt = bars.includes("target");
  const barEase = [0.22, 1, 0.36, 1] as const;
  const totalCurInr = rows.reduce((s, r) => s + r.currentInr, 0);
  const totalTgtInr = rows.reduce((s, r) => s + r.targetInr, 0);
  const axisMax = Math.max(1, includeCur ? totalCurInr : 0, includeTgt ? totalTgtInr : 0);
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
  const barDefs = bars.map((which) => ({
    which,
    label: which === "current" ? "Current" : "Target",
  }));

  return (
    <section style={cardStyle} className="px-4 py-4">
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
        <div className="mt-4 space-y-2.5">
          {barDefs.map(({ which, label }, bi) => (
            <div key={which} className="flex items-center gap-2.5">
              <span className="w-14 shrink-0 text-[12px] text-muted-foreground">{label}</span>
              <div className="flex h-[25px] flex-1 overflow-hidden rounded-[3px] bg-muted">
                {rows.map((row, i) => {
                  const curPct = curPcts[i];
                  const tgtPct = tgtPcts[i];
                  const pct = which === "current" ? curPct : tgtPct;
                  const inr = which === "current" ? row.currentInr : row.targetInr;
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
                              <span className="text-muted-foreground">Target</span>
                              <span className="font-medium tabular-nums">
                                {tgtPct}% · {axisINR(row.targetInr)}
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
        <span className="w-14 shrink-0" />
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
    </section>
  );
}
