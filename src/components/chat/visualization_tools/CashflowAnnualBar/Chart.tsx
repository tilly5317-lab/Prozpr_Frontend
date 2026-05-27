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
import { formatInrIndian, exportCashflowXls } from "@/lib/export-xls";
import type { CashflowAnnualBar } from "../types";

interface Props {
  payload: CashflowAnnualBar;
}

export function CashflowAnnualBar({ payload }: Props) {
  const chartData = useMemo(
    () =>
      payload.data.map((r) => ({
        fy: r.fy_label,
        Income: r.income,
        Expenses: r.household_expense,
        Savings: r.savings_post_emi,
        Corpus: r.corpus_closing,
      })),
    [payload.data],
  );

  const tickFormatter = (v: number) => {
    if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
    if (v >= 1e5) return `${(v / 1e5).toFixed(0)}L`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
    return String(v);
  };

  const handleDownload = () => {
    exportCashflowXls(payload.annual_cashflow, payload.monthly_cashflow);
  };

  if (chartData.length === 0) return null;

  return (
    <div className="my-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-foreground">{payload.title}</p>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-[10px] font-medium text-foreground shadow-sm hover:bg-muted/60 transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
          Download XLS
        </button>
      </div>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis
              dataKey="fy"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              interval={chartData.length > 10 ? Math.floor(chartData.length / 6) : 0}
            />
            <YAxis
              tickFormatter={tickFormatter}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatInrIndian(value), name]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
                fontSize: 10,
              }}
              labelStyle={{ fontWeight: 600, fontSize: 10 }}
            />
            <Legend wrapperStyle={{ fontSize: 9, paddingTop: 4 }} iconType="circle" iconSize={7} />
            <Bar dataKey="Income" fill="#22c55e" radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Bar dataKey="Expenses" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Bar dataKey="Savings" fill="#3b82f6" radius={[2, 2, 0, 0]} maxBarSize={14} />
            <Bar dataKey="Corpus" fill="#D4A868" radius={[2, 2, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
