import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ConcentrationRiskPayload } from "./types";
import { formatInrCompact } from "@/lib/utils";

const SEVERITY_PILL: Record<
  "ok" | "watch" | "act",
  { label: string; bg: string; fg: string }
> = {
  ok: {
    label: "Diversified",
    bg: "hsl(160 30% 93%)",
    fg: "hsl(160 50% 28%)",
  },
  watch: {
    label: "Watch",
    bg: "hsl(38 60% 93%)",
    fg: "hsl(38 80% 30%)",
  },
  act: {
    label: "Concentrated",
    bg: "hsl(0 86% 95%)",
    fg: "hsl(0 72% 38%)",
  },
};

export function ConcentrationRisk({ payload }: { payload: ConcentrationRiskPayload }) {
  const pill = SEVERITY_PILL[payload.severity];

  const rows = [
    ...payload.top_holdings.map((h) => ({
      name: h.label,
      value: h.value,
      percentage: h.percentage,
      isRest: false,
    })),
    ...(payload.rest_count > 0
      ? [
          {
            name: `Other ${payload.rest_count} fund${payload.rest_count === 1 ? "" : "s"}`,
            value: payload.rest_percentage,
            percentage: payload.rest_percentage,
            isRest: true,
          },
        ]
      : []),
  ];

  const chartHeight = Math.max(180, rows.length * 36);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-wealth">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h3 className="font-display italic text-foreground text-xl leading-tight">
          {payload.title}
        </h3>
        <span
          className="text-xs font-semibold rounded-full px-2.5 py-0.5 shrink-0"
          style={{ backgroundColor: pill.bg, color: pill.fg }}
        >
          {pill.label}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{payload.headline}</p>

      <div style={{ width: "100%", height: chartHeight }}>
        <ResponsiveContainer>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              formatter={(_value: number, _name, item) => [
                `${item.payload.percentage.toFixed(1)}%`,
                item.payload.name,
              ]}
              contentStyle={{ fontSize: "11px", borderRadius: "6px" }}
            />
            <Bar
              dataKey="percentage"
              radius={[0, 6, 6, 0]}
              barSize={14}
            >
              {rows.map((r) => (
                <Cell
                  key={r.name}
                  fill={r.isRest ? "hsl(220 13% 80%)" : "hsl(215 60% 48%)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {payload.rest_count > 0 ? (
        <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
          {`Top ${payload.top_n} = ${(100 - payload.rest_percentage).toFixed(0)}% · ${formatInrCompact(
            payload.top_holdings.reduce((sum, h) => sum + h.value, 0)
          )}`}
        </p>
      ) : null}
    </div>
  );
}
