import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { formatInrCompact } from "@/lib/utils";
import type { PortfolioHistoryPoint } from "@/lib/api";

const UP = "hsl(151 55% 38%)";
const DOWN = "hsl(4 70% 50%)";

/** "12 Aug" — enough to place the visit without a full date. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/**
 * What changed since the last recorded snapshot.
 *
 * Gives a reason to open the app that isn't checking the number — the number is
 * the same either way, but "up ₹42k since the 12th" is news and "₹52,40,120" is
 * not.
 *
 * ⚠️ Scope: `PortfolioHistoryPoint` carries only `recorded_date` and
 * `total_value`, so this reports the change in value and the window it covers,
 * and deliberately nothing else. Allocation drift and fund-quality changes need
 * the history endpoint to carry an allocation snapshot; claiming them from a
 * value-only series would be invention.
 */
export function PortfolioSinceLast({
  history,
  currentValue,
}: {
  history: PortfolioHistoryPoint[];
  currentValue: number;
}) {
  const change = useMemo(() => {
    if (history.length < 2 || currentValue <= 0) return null;

    const sorted = [...history].sort((a, b) =>
      a.recorded_date.localeCompare(b.recorded_date),
    );
    // Compare against the previous snapshot, not the oldest — "since you last
    // looked" means the last time there was a reading, not since inception.
    const prev = sorted[sorted.length - 2];
    if (!prev || prev.total_value <= 0) return null;

    const delta = currentValue - prev.total_value;
    const pct = (delta / prev.total_value) * 100;
    // Sub-0.05% is rounding, not movement. Saying "up ₹18" is noise.
    if (Math.abs(pct) < 0.05) return null;

    return { delta, pct, since: prev.recorded_date };
  }, [history, currentValue]);

  if (!change) return null;

  const up = change.delta >= 0;
  const tone = up ? UP : DOWN;
  const Icon = up ? TrendingUp : TrendingDown;

  return (
    <div className="mb-2 flex items-center gap-2 rounded-[14px] border border-border bg-card px-3 py-2">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `${tone}1f`, color: tone }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
      </span>
      <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted-foreground">
        Since {shortDate(change.since)}{" "}
        <span className="font-semibold tabular-nums" style={{ color: tone }}>
          {up ? "+" : "−"}
          {formatInrCompact(Math.abs(change.delta))}
        </span>{" "}
        <span className="tabular-nums">
          ({up ? "+" : "−"}
          {Math.abs(change.pct).toFixed(1)}%)
        </span>
      </p>
    </div>
  );
}

export default PortfolioSinceLast;
