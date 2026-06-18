import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useBenchmarkHistory, useBenchmarks } from "@/hooks/use-benchmarks";
import { windowStartIndex, type AnalysisRange } from "@/lib/twr";

const CARD = "bg-card rounded-[14px] p-[14px]" as const;
const CARD_BORDER = { border: "1px solid hsl(var(--border))" } as const;
const SECTION_LABEL = {
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase" as const,
  letterSpacing: "1.5px",
  color: "hsl(var(--muted-foreground))",
};

const RANGES: AnalysisRange[] = ["1M", "3M", "YTD", "1Y", "3Y", "All"];
const PREFERRED_CODE = "NIFTY 50";

const fmtIndex = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/**
 * Small dashboard card: lists available benchmark indices and plots the EOD
 * (Total Return Index) history of the selected one — defaults to Nifty 50.
 * Data comes from the `benchmarks` domain via {@link useBenchmarks}.
 */
export default function BenchmarkHistoryCard() {
  const { data: benchmarks, loading: listLoading } = useBenchmarks();
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<AnalysisRange>("1Y");

  // Default selection: Nifty 50 if present, else the first index.
  const code =
    selected ??
    benchmarks?.find((b) => b.code === PREFERRED_CODE)?.code ??
    benchmarks?.[0]?.code ??
    null;

  const { data: history, loading: histLoading } = useBenchmarkHistory(code);

  const { chartData, changePct, latest } = useMemo(() => {
    const points = history?.points ?? [];
    if (points.length === 0) {
      return { chartData: [], changePct: null as number | null, latest: null as number | null };
    }
    const dates = points.map((p) => p.value_date);
    const startIdx = windowStartIndex(dates, range, new Date());
    const windowed = points.slice(startIdx);
    const data = windowed.map((p, i) => ({ i, date: p.value_date, value: p.tri_value }));
    const first = windowed[0]?.tri_value;
    const last = windowed[windowed.length - 1]?.tri_value;
    const pct = first ? ((last - first) / first) * 100 : null;
    return { chartData: data, changePct: pct, latest: last ?? null };
  }, [history, range]);

  if (!listLoading && (!benchmarks || benchmarks.length === 0)) {
    return null; // nothing to show yet (no indices seeded)
  }

  const up = (changePct ?? 0) >= 0;

  return (
    <div className={CARD} style={CARD_BORDER}>
      <div className="mb-3 flex items-center justify-between">
        <p style={SECTION_LABEL}>Benchmarks</p>
        {benchmarks && benchmarks.length > 1 && (
          <select
            value={code ?? ""}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-full bg-muted/60 px-2 py-1 text-[10px] font-semibold text-foreground"
          >
            {benchmarks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.short_name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-baseline gap-2.5">
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {latest != null ? fmtIndex(latest) : "—"}
        </p>
        {changePct != null && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              up ? "bg-wealth-green/15 text-wealth-green" : "bg-destructive/15 text-destructive"
            }`}
          >
            {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </span>
        )}
      </div>
      <p className="mb-3 mt-1 text-[10px] text-muted-foreground/80">
        {history?.display_name ?? "Nifty 50"} · Total Return Index ({range})
      </p>

      <div className="mb-3 flex gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
              range === r
                ? "bg-accent/15 text-accent"
                : "bg-muted/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="h-28 w-full">
        {histLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          </div>
        ) : chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="2 4" />
              <XAxis dataKey="date" hide />
              <YAxis domain={["dataMin", "dataMax"]} hide />
              <Tooltip
                formatter={(v: number) => [fmtIndex(v), "TRI"]}
                labelFormatter={(l) => String(l)}
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 8,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            No benchmark history yet.
          </div>
        )}
      </div>
    </div>
  );
}
