import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { formatDate, type FundNavPoint } from "@/components/fund/FundScreenUi";

export interface CompareSeries {
  id: string;
  name: string;
  color: string;
  /** Range-filtered NAV points, ascending by date. */
  points: FundNavPoint[];
}

const SAMPLE_COUNT = 120;

/** Fixed-length resample so every series shares an x-grid regardless of row count. */
function resample(points: FundNavPoint[], n: number): FundNavPoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) return Array.from({ length: n }, () => ({ ...points[0]! }));
  const out: FundNavPoint[] = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (points.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(points.length - 1, i0 + 1);
    const f = pos - i0;
    out.push({
      date: f < 0.5 ? points[i0]!.date : points[i1]!.date,
      nav: points[i0]!.nav * (1 - f) + points[i1]!.nav * f,
    });
  }
  return out;
}

/**
 * Overlaid multi-fund growth chart. Each series is rebased to a common ₹100
 * start so funds at different NAV price points are comparable on percentage
 * growth — the standard "growth of ₹100" view used by Groww / Morningstar.
 */
export function CompareChart({ series }: { series: CompareSeries[] }) {
  const clipId = useId();

  const { lines, hi, lo, baseY, startLabel, endLabel } = useMemo(() => {
    const usable = series.filter((s) => s.points.length >= 2);
    if (!usable.length) {
      return { lines: [], hi: 0, lo: 0, baseY: 0, startLabel: "", endLabel: "" };
    }
    const rebased = usable.map((s) => {
      const rs = resample(s.points, SAMPLE_COUNT);
      const base = rs[0]!.nav || 1;
      return { ...s, rs, vals: rs.map((p) => (p.nav / base) * 100) };
    });

    const all = rebased.flatMap((r) => r.vals);
    const min = Math.min(...all, 100);
    const max = Math.max(...all, 100);
    const pad = Math.max((max - min) * 0.08, 0.5);
    const lo = min - pad;
    const hi = max + pad;
    const xAt = (i: number) => (i / (SAMPLE_COUNT - 1)) * 100;
    const yAt = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;

    const lines = rebased.map((r) => ({
      id: r.id,
      color: r.color,
      path: r.vals
        .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`)
        .join(" "),
      end: r.vals[r.vals.length - 1]!,
    }));

    const starts = rebased.map((r) => r.rs[0]!.date).sort();
    const ends = rebased.map((r) => r.rs[r.rs.length - 1]!.date).sort();
    return {
      lines,
      hi,
      lo,
      baseY: yAt(100),
      startLabel: formatDate(starts[0]!),
      endLabel: formatDate(ends[ends.length - 1]!),
    };
  }, [series]);

  if (!lines.length) {
    return (
      <div className="grid h-[200px] place-items-center text-[12px] text-muted-foreground">
        Add funds to compare their growth.
      </div>
    );
  }

  const pct = (v: number) => `${v - 100 >= 0 ? "+" : ""}${(v - 100).toFixed(1)}%`;

  return (
    <div className="relative h-[200px] w-full">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId}>
            <motion.rect
              x="0"
              y="0"
              height="100"
              initial={{ width: 0 }}
              animate={{ width: 100 }}
              transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
            />
          </clipPath>
        </defs>

        {/* ₹100 baseline */}
        <line
          x1="0"
          x2="100"
          y1={baseY}
          y2={baseY}
          stroke="hsl(var(--muted-foreground))"
          strokeOpacity={0.25}
          strokeWidth={0.75}
          strokeDasharray="2 2"
          vectorEffect="non-scaling-stroke"
        />

        <g clipPath={`url(#${clipId})`}>
          {lines.map((l) => (
            <path
              key={l.id}
              d={l.path}
              fill="none"
              stroke={l.color}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>

      <div className="pointer-events-none absolute left-1 top-1 rounded bg-background/70 px-1 text-[10px] tabular-nums text-muted-foreground/80">
        {pct(hi)}
      </div>
      <div className="pointer-events-none absolute bottom-6 left-1 rounded bg-background/70 px-1 text-[10px] tabular-nums text-muted-foreground/80">
        {pct(lo)}
      </div>
      <div className="pointer-events-none absolute bottom-1 left-1 text-[10px] text-muted-foreground/80">
        {startLabel}
      </div>
      <div className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-muted-foreground/80">
        {endLabel}
      </div>
    </div>
  );
}
