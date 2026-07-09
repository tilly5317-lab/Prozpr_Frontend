import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { PlannedDonutPayload } from "./types";
import { formatInrMillions } from "@/lib/utils";

// Canonical asset-class palette (app-wide), with lighter tints appended so
// there are enough distinct hues for ~6-8 sub-categories.
const PALETTE = [
  "#2563EB",            // equity
  "hsl(188 52% 41%)",   // debt
  "hsl(38 64% 47%)",    // hybrid
  "hsl(214 14% 47%)",   // cash
  "hsl(348 35% 43%)",   // alternatives
  "hsl(215 50% 65%)",
  "hsl(188 40% 60%)",
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
                  `${formatInrMillions(value)} (${item.payload.percentage.toFixed(1)}%)`,
                  item.payload.name,
                ]}
                contentStyle={{ fontSize: "11px", borderRadius: "6px" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-base font-bold text-foreground tabular-nums">
              {formatInrMillions(total)}
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
