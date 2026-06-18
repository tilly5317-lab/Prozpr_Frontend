import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";
import type { AnnualCashflowRow } from "@/lib/api";
import { formatInrIndian } from "@/lib/export-xls";

interface Props {
  data: AnnualCashflowRow[];
}

export default function AnnualCashflowChart({ data }: Props) {
  const chartData = useMemo(
    () =>
      // Sort chronologically so the full series renders in order regardless of the
      // order the rows arrive in (defensive — the API also orders them now).
      [...data]
        .sort((a, b) => a.fy_end_date.localeCompare(b.fy_end_date))
        .map((r) => ({
          fy: r.fy_label,
          Income: r.income,
          Expenses: r.household_expense + r.existing_mortgage_emi + r.goal_mortgage_emi,
          Savings: r.savings_post_emi,
          Corpus: r.corpus_closing,
        })),
    [data],
  );

  if (chartData.length === 0) return null;

  const tickFormatter = (v: number) => {
    if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
    if (v >= 1e5) return `${(v / 1e5).toFixed(0)}L`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return String(v);
  };

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ minWidth: Math.max(320, chartData.length * 56), height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis
              dataKey="fy"
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval={chartData.length > 12 ? Math.floor(chartData.length / 8) : 0}
            />
            <YAxis
              tickFormatter={tickFormatter}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatInrIndian(value), name]}
              contentStyle={{
                borderRadius: 10,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                fontSize: 11,
              }}
              labelStyle={{ fontWeight: 600, fontSize: 11 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="Income" fill="#22c55e" radius={[2, 2, 0, 0]} maxBarSize={18} />
            <Bar dataKey="Expenses" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={18} />
            <Bar dataKey="Savings" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={18} />
            <Bar dataKey="Corpus" fill="#D4A868" radius={[2, 2, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
