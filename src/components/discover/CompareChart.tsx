import { useId, useMemo, useState } from "react";
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

interface SamplePoint {
  date: string;
  values: { id: string; color: string; v: number }[];
}

/**
 * Overlaid multi-fund growth chart. Each series is rebased to a common ₹100
 * start so funds at different NAV price points are comparable on percentage
 * growth — the standard "growth of ₹100" view used by Groww / Morningstar.
 * Hover/drag shows a per-date card with each fund's value of ₹100 invested.
 */
export function CompareChart({ series }: { series: CompareSeries[] }) {
  const clipId = useId();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { lines, hi, lo, baseY, startLabel, endLabel, samples } = useMemo(() => {
    const usable = series.filter((s) => s.points.length >= 2);
    if (!usable.length) {
      return {
        lines: [],
        hi: 0,
        lo: 0,
        baseY: 0,
        startLabel: "",
        endLabel: "",
        samples: [] as SamplePoint[],
      };
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
    }));

    // Dates for the hover card come from the series with the densest history.
    const dateSource = rebased.reduce((a, b) => (b.points.length > a.points.length ? b : a));
    const samples: SamplePoint[] = Array.from({ length: SAMPLE_COUNT }, (_, i) => ({
      date: dateSource.rs[i]!.date,
      values: rebased.map((r) => ({ id: r.id, color: r.color, v: r.vals[i]! })),
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
      samples,
    };
  }, [series]);

  if (!lines.length) {
    return (
      <div className="grid h-[200px] place-items-center text-[12px] text-muted-foreground">
        Add funds to compare their growth.
      </div>
    );
  }

  const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(frac * (SAMPLE_COUNT - 1)));
  };

  const hover = hoverIdx != null ? samples[hoverIdx] : null;
  const hoverX = hoverIdx != null ? (hoverIdx / (SAMPLE_COUNT - 1)) * 100 : 0;
  const yPctOf = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const cardOnLeft = hoverX > 55;

  return (
    <div
      className="relative h-[200px] w-full touch-none select-none"
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      // Only clear on mouse-out (desktop). On touch, keep the readout visible
      // after the finger lifts — it stays until the next touch on the chart.
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setHoverIdx(null);
      }}
    >
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

        {hover && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1="0"
            y2="100"
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.5}
            strokeWidth={0.75}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* Hover markers — one dot per fund on the guide line */}
      {hover &&
        hover.values.map((s) => (
          <span
            key={s.id}
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background"
            style={{
              left: `${hoverX}%`,
              top: `${yPctOf(s.v)}%`,
              backgroundColor: s.color,
            }}
          />
        ))}

      {/* Floating card: value of ₹100 invested in each fund on the hovered date */}
      {hover && (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg border border-border/70 bg-background/95 px-2.5 py-1.5 shadow-md backdrop-blur-sm"
          style={cardOnLeft ? { right: `${100 - hoverX + 2}%` } : { left: `${hoverX + 2}%` }}
        >
          <p className="mb-1 whitespace-nowrap text-[10px] font-medium text-muted-foreground">
            {formatDate(hover.date)}
          </p>
          <div className="space-y-0.5">
            {hover.values.map((s) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[11px] font-semibold tabular-nums text-foreground">
                  ₹{s.v.toFixed(1)}
                </span>
                <span
                  className={`text-[10px] tabular-nums ${
                    s.v >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  }`}
                >
                  {s.v - 100 >= 0 ? "+" : ""}
                  {(s.v - 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-1 left-1 text-[11px] text-muted-foreground/80">
        {startLabel}
      </div>
      <div className="pointer-events-none absolute bottom-1 right-1 text-[11px] text-muted-foreground/80">
        {endLabel}
      </div>
    </div>
  );
}
