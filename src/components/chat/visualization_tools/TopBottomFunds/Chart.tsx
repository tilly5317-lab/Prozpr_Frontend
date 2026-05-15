import type { TopBottomFundsPayload, FundReturnRow } from "./types";

function Row({ row, tone }: { row: FundReturnRow; tone: "up" | "down" }) {
  const sign = row.return_pct >= 0 ? "+" : "";
  const colorClass = tone === "up" ? "text-[hsl(160_50%_28%)]" : "text-destructive";
  const barColor = tone === "up" ? "hsl(160 50% 38%)" : "hsl(0 72% 51%)";
  // Bar width is proportional to absolute return, capped at 100% for visual scaling.
  const widthPct = Math.min(100, Math.abs(row.return_pct) * 3);
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-foreground font-medium truncate flex-1 min-w-0">
        {row.name}
      </span>
      <div className="relative h-2 w-24 bg-muted rounded">
        <div
          className="absolute left-0 top-0 h-full rounded"
          style={{ backgroundColor: barColor, width: `${widthPct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold tabular-nums w-12 text-right ${colorClass}`}>
        {sign}
        {row.return_pct.toFixed(1)}%
      </span>
    </div>
  );
}

export function TopBottomFunds({ payload }: { payload: TopBottomFundsPayload }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-wealth">
      <h3 className="font-display italic text-foreground text-xl leading-tight mb-1">
        {payload.title}
      </h3>
      {payload.subtitle ? (
        <p className="text-xs text-muted-foreground mb-4">{payload.subtitle}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">
            Top performers
          </p>
          <div className="divide-y divide-border/60">
            {payload.top.map((r) => (
              <Row key={`top-${r.name}`} row={r} tone="up" />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">
            Bottom performers
          </p>
          <div className="divide-y divide-border/60">
            {payload.bottom.map((r) => (
              <Row key={`bot-${r.name}`} row={r} tone="down" />
            ))}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground tabular-nums">
        Portfolio average: {payload.portfolio_average_pct >= 0 ? "+" : ""}
        {payload.portfolio_average_pct.toFixed(1)}%
      </p>
    </div>
  );
}
