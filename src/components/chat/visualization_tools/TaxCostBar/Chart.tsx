import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TaxCostBarPayload } from "./types";
import { formatInrCompact } from "@/lib/utils";

const SERIES_COLOR: Record<string, string> = {
  "Short-term gains": "hsl(0 72% 51%)",        // destructive — STCG hurts most
  "Long-term gains": "hsl(38 80% 48%)",        // wealth-amber — LTCG is taxed less
  "Exit load": "hsl(220 13% 64%)",             // muted — admin friction
};

const FALLBACK = ["hsl(0 72% 51%)", "hsl(38 80% 48%)", "hsl(220 13% 64%)"];

function colorFor(name: string, i: number): string {
  return SERIES_COLOR[name] ?? FALLBACK[i % FALLBACK.length];
}

export function TaxCostBar({ payload }: { payload: TaxCostBarPayload }) {
  const { categories, series, totals } = payload;
  const data = categories.map((category, idx) => {
    const row: Record<string, string | number> = { category };
    for (const s of series) {
      row[s.name] = s.values[idx] ?? 0;
    }
    return row;
  });
  const chartHeight = Math.max(180, categories.length * 40);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-wealth">
      <h3 className="font-display italic text-foreground text-xl leading-tight mb-1">
        {payload.title}
      </h3>
      {payload.subtitle ? (
        <p className="text-xs text-muted-foreground mb-4">{payload.subtitle}</p>
      ) : null}

      <div style={{ width: "100%", height: chartHeight }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) => formatInrCompact(v)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="category"
              width={110}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(value: number, name) => [formatInrCompact(value), name]}
              contentStyle={{ fontSize: "11px", borderRadius: "6px" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} iconSize={10} />
            {series.map((s, i) => (
              <Bar
                key={s.name}
                dataKey={s.name}
                stackId="cost"
                fill={colorFor(s.name, i)}
                radius={[0, 4, 4, 0]}
                barSize={11}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-[11px] text-muted-foreground">Tax estimate</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatInrCompact(totals.tax_estimate_inr)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-[11px] text-muted-foreground">Exit load</span>
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {formatInrCompact(totals.exit_load_inr)}
          </span>
        </div>
      </div>
    </div>
  );
}
