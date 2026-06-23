import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { CurrentDonutPayload } from "./types";
import { formatInrMillions } from "@/lib/utils";

// Canonical asset-class palette (app-wide): Equity = blue, Debt = teal,
// Hybrid/Gold = amber, Cash = slate, Alternatives = maroon.
const ASSET_PALETTE: Record<string, string> = {
  Equity: "#2563EB",
  Debt: "hsl(188 52% 41%)",
  Hybrid: "hsl(38 64% 47%)",
  Gold: "hsl(38 64% 47%)",
  "Real Estate": "hsl(348 35% 43%)",
  Alternatives: "hsl(348 35% 43%)",
  Cash: "hsl(214 14% 47%)",
  Liquid: "hsl(214 14% 47%)",
};

const FALLBACK = [
  "#2563EB",
  "hsl(188 52% 41%)",
  "hsl(38 64% 47%)",
  "hsl(214 14% 47%)",
  "hsl(348 35% 43%)",
];

function colorFor(label: string, i: number): string {
  return ASSET_PALETTE[label] ?? FALLBACK[i % FALLBACK.length];
}

export function CurrentDonut({ payload }: { payload: CurrentDonutPayload }) {
  const data = payload.slices.map((s, i) => ({
    name: s.label,
    value: s.value,
    percentage: s.percentage,
    color: colorFor(s.label, i),
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
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Total
            </span>
            <span className="text-base font-bold text-foreground tabular-nums">
              {formatInrMillions(payload.total_value)}
            </span>
          </div>
        </div>

        <div className="flex-1 space-y-1">
          {data.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between border-b border-dashed border-border/60 py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-xs text-foreground font-medium">
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
