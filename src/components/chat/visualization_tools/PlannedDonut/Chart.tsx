import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { PlannedDonutPayload } from "./types";
import { formatInrCompact } from "@/lib/utils";

// Tinted-blue rotation for sub-categories — keeps the editorial-wealth feel
// while offering enough distinct hues for ~6-8 categories.
const PALETTE = [
  "hsl(215 60% 48%)",
  "hsl(222 47% 14%)",
  "hsl(160 50% 38%)",
  "hsl(38 80% 48%)",
  "hsl(220 35% 28%)",
  "hsl(215 50% 65%)",
  "hsl(160 30% 55%)",
  "hsl(38 60% 65%)",
];

export function PlannedDonut({ payload }: { payload: PlannedDonutPayload }) {
  const slices = payload.slices ?? [];
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const data = slices.map((s, i) => ({
    name: s.label,
    value: s.value,
    percentage: total > 0 ? (s.value / total) * 100 : 0,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-wealth">
      <h3 className="font-display italic text-foreground text-xl leading-tight mb-1">
        {payload.title}
      </h3>
      {payload.subtitle ? (
        <p className="text-xs text-muted-foreground mb-4">{payload.subtitle}</p>
      ) : null}

      <div className="flex items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={60}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number, _name, item) => [
                  `${formatInrCompact(value)} (${item.payload.percentage.toFixed(1)}%)`,
                  item.payload.name,
                ]}
                contentStyle={{ fontSize: "11px", borderRadius: "6px" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-base font-bold text-foreground tabular-nums">
              {formatInrCompact(total)}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-1">
          {data.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between border-b border-dashed border-border/60 py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-2.5 w-2.5 rounded shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-foreground font-medium truncate">
                  {item.name}
                </span>
              </div>
              <span className="text-xs font-semibold text-foreground tabular-nums">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
