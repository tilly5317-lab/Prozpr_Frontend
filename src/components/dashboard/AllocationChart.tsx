import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

const data = [
  { name: "Equity", value: 62, color: "hsl(210, 80%, 55%)" },
  { name: "Debt", value: 24, color: "hsl(220, 55%, 18%)" },
  { name: "Real Estate", value: 11, color: "hsl(152, 60%, 42%)" },
  { name: "Cash", value: 3, color: "hsl(38, 92%, 50%)" },
];

const lightColors = [
  "hsla(210, 80%, 75%, 0.9)",
  "hsla(220, 30%, 60%, 0.8)",
  "hsla(152, 50%, 60%, 0.8)",
  "hsla(38, 80%, 65%, 0.8)",
];

interface Props {
  variant?: "default" | "light";
  compact?: boolean;
}

const AllocationChart = ({ variant = "default", compact = false }: Props) => {
  const isLight = variant === "light";
  const colors = isLight ? lightColors : data.map((d) => d.color);

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={18}
                outerRadius={30}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, idx) => (
                  <Cell key={entry.name} fill={colors[idx]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {data.map((item, idx) => (
            <div key={item.name} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[idx] }} />
              <span className="text-[10px] text-muted-foreground">{item.name}</span>
              <span className="text-[10px] font-semibold text-foreground">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5">
      <div className="h-28 w-28 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={52}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, idx) => (
                <Cell key={entry.name} fill={colors[idx]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-2.5">
        {data.map((item, idx) => (
          <div key={item.name} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[idx] }} />
              <span className={isLight ? "text-primary-foreground/60" : "text-muted-foreground"}>{item.name}</span>
            </div>
            <span className={`font-semibold ${isLight ? "text-primary-foreground" : "text-foreground"}`}>{item.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AllocationChart;
