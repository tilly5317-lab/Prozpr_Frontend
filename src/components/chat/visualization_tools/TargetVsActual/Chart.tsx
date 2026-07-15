import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { TargetVsActualPayload } from "./types";

// Asset-class colours — match the rebalancing page's buckets so the two
// current-vs-target views read the same.
const ASSET_COLORS: Record<string, string> = {
  equity: "#2563EB",
  debt: "hsl(188 52% 41%)",
  others: "hsl(38 64% 47%)",
  hybrid: "hsl(38 64% 47%)",
  cash: "hsl(214 14% 47%)",
  gold: "hsl(45 74% 47%)",
  alternatives: "hsl(348 35% 43%)",
};
const FALLBACK = ["#2563EB", "hsl(188 52% 41%)", "hsl(38 64% 47%)", "hsl(214 14% 47%)", "hsl(348 35% 43%)"];
const colorFor = (assetClass: string, i: number) =>
  ASSET_COLORS[assetClass.trim().toLowerCase()] ?? FALLBACK[i % FALLBACK.length];

export function TargetVsActual({ payload }: { payload: TargetVsActualPayload }) {
  const assets = payload.bars.map((b, i) => ({
    name: b.asset_class,
    color: colorFor(b.asset_class, i),
  }));

  // Two stacked rows — Current (actual) and Target — each a single 100%-width
  // bar split into Equity / Debt / Others segments, instead of three separate
  // clustered rows.
  const currentRow: Record<string, number | string> = { name: "Current" };
  const targetRow: Record<string, number | string> = { name: "Target" };
  for (const b of payload.bars) {
    currentRow[b.asset_class] = b.actual_pct;
    targetRow[b.asset_class] = b.target_pct;
  }
  const data = [currentRow, targetRow];

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-wealth">
      <h3 className="font-display italic text-foreground text-xl leading-tight mb-1">
        {payload.title}
      </h3>
      {payload.subtitle ? (
        <p className="text-xs text-muted-foreground mb-4">{payload.subtitle}</p>
      ) : null}

      <div style={{ width: "100%", height: 132 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
            stackOffset="expand"
          >
            <XAxis
              type="number"
              domain={[0, 1]}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={56}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(value: number, name) => [`${value.toFixed(1)}%`, name]}
              contentStyle={{ fontSize: "11px", borderRadius: "6px" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} iconSize={10} />
            {assets.map((a) => (
              <Bar key={a.name} dataKey={a.name} stackId="mix" fill={a.color} barSize={22} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {payload.bars.map((b) => {
          const drift = b.drift_pct;
          const sign = drift >= 0 ? "+" : "";
          const tone =
            Math.abs(drift) < 2
              ? "text-muted-foreground"
              : drift > 0
                ? "text-[hsl(160_50%_28%)]"
                : "text-destructive";
          return (
            <div key={b.asset_class} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{b.asset_class}</span>
              <span className={`tabular-nums font-semibold ${tone}`}>
                {sign}
                {drift.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
