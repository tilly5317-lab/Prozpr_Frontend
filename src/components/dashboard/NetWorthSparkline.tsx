import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";

interface NetWorthSparklineProps {
  compact?: boolean;
  /** When provided, chart reflects DB portfolio history (oldest → newest). */
  values?: number[];
}

const fallbackData = [
  { v: 32 }, { v: 34 }, { v: 33 }, { v: 36 }, { v: 38 },
  { v: 35 }, { v: 37 }, { v: 40 }, { v: 39 }, { v: 42 },
  { v: 41 }, { v: 44 }, { v: 43 }, { v: 45 }, { v: 44 },
  { v: 46 }, { v: 47 }, { v: 45 }, { v: 48 }, { v: 47.8 },
];

const NetWorthSparkline = ({ compact = false, values }: NetWorthSparklineProps) => {
  const data =
    values && values.length > 1
      ? values.map((v) => ({ v }))
      : values && values.length === 1
        ? [{ v: values[0] * 0.95 }, { v: values[0] }]
        : fallbackData;

  return (
    <div className={compact ? "h-8 w-full" : "h-16 w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.22} />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={["dataMin - 2", "dataMax + 2"]} hide />
          <Area
            type="monotone"
            dataKey="v"
            stroke="hsl(var(--accent))"
            strokeWidth={compact ? 1.75 : 2.25}
            fill="url(#sparkGrad)"
            dot={false}
            activeDot={{ r: 3.5, fill: "hsl(var(--accent))", stroke: "hsl(var(--card))", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default NetWorthSparkline;
