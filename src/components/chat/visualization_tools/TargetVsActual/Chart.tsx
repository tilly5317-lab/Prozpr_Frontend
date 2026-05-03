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
import type { TargetVsActualPayload } from "./types";

export function TargetVsActual({ payload }: { payload: TargetVsActualPayload }) {
  const data = payload.bars.map((b) => ({
    name: b.asset_class,
    Target: b.target_pct,
    Actual: b.actual_pct,
    drift: b.drift_pct,
  }));

  const chartHeight = Math.max(180, payload.bars.length * 44);

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
            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
            barGap={4}
          >
            <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v: number) => `${v.toFixed(0)}%`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={100}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(value: number, name) => [`${value.toFixed(1)}%`, name]}
              contentStyle={{ fontSize: "11px", borderRadius: "6px" }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }}
              iconSize={10}
            />
            <Bar dataKey="Target" fill="hsl(222 47% 14%)" radius={[0, 4, 4, 0]} barSize={10} />
            <Bar dataKey="Actual" fill="hsl(215 60% 48%)" radius={[0, 4, 4, 0]} barSize={10} />
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
