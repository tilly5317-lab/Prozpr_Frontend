import { parseISO, subMonths, subYears } from "date-fns";
import { motion } from "framer-motion";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { MfHoldingNavPoint } from "@/lib/api";

export type NavRange = "1M" | "3M" | "1Y" | "3Y" | "MAX";

export const NAV_RANGES: NavRange[] = ["1M", "3M", "1Y", "3Y", "MAX"];

export type FundNavPoint = { date: string; nav: number };

function parsePointDate(iso: string): Date {
  try {
    return parseISO(iso);
  } catch {
    return new Date(iso);
  }
}

/** Calendar start for a horizon ending on `endDate` (defaults to today). */
export function rangeStartDate(range: NavRange, endDate: Date = new Date()): Date | null {
  if (range === "MAX") return null;
  const end = new Date(endDate);
  let start: Date;
  switch (range) {
    case "1M":
      start = subMonths(end, 1);
      break;
    case "3M":
      start = subMonths(end, 3);
      break;
    case "1Y":
      start = subYears(end, 1);
      break;
    case "3Y":
      start = subYears(end, 3);
      break;
    default:
      return null;
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

export function navPointsFromApi(points: MfHoldingNavPoint[]): FundNavPoint[] {
  return points.map((p) => ({ date: p.nav_date, nav: p.nav }));
}

/**
 * Filter NAV rows to a calendar window: same day-of-month N months/years ago → today.
 * e.g. 1M on 27 May → 27 Apr … 27 May; 3Y → 27 May three years ago … today.
 */
export function filterNavByRange(
  points: FundNavPoint[],
  range: NavRange,
  endDate: Date = new Date(),
): FundNavPoint[] {
  if (range === "MAX" || points.length === 0) {
    return [...points].sort(
      (a, b) => parsePointDate(a.date).getTime() - parsePointDate(b.date).getTime(),
    );
  }

  const sorted = [...points].sort(
    (a, b) => parsePointDate(a.date).getTime() - parsePointDate(b.date).getTime(),
  );

  const start = rangeStartDate(range, endDate);
  if (!start) return sorted;

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const filtered = sorted.filter((p) => {
    const d = parsePointDate(p.date);
    return d >= start && d <= end;
  });

  if (filtered.length >= 2) return filtered;
  return sorted.length >= 2 ? sorted.slice(-2) : sorted;
}

export function formatINRPaisa(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  return `${v < 0 ? "−" : ""}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatINRCompact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v < 0) return `−${formatINRCompact(-v)}`;
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)}Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export function formatUnits(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatPct(n: number | null): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

/** Percentage with a single decimal, e.g. +12.3% / −4.5%. */
export function formatPct1(n: number | null): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function formatNav(n: number): string {
  return n.toFixed(4);
}

/** NAV / per-unit value with a single decimal, e.g. 123.1. */
export function formatNav1(n: number): string {
  return n.toFixed(1);
}

export function pctReturnForRange(
  history: FundNavPoint[],
  range: NavRange,
  endDate: Date = new Date(),
): number | null {
  if (range === "MAX" || history.length < 2) return null;

  const sorted = [...history].sort(
    (a, b) => parsePointDate(a.date).getTime() - parsePointDate(b.date).getTime(),
  );
  const start = rangeStartDate(range, endDate);
  if (!start) return null;

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  let latestPoint: FundNavPoint | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (parsePointDate(sorted[i]!.date) <= end) {
      latestPoint = sorted[i]!;
      break;
    }
  }

  let startPoint: FundNavPoint | null = null;
  for (const p of sorted) {
    if (parsePointDate(p.date) >= start) {
      startPoint = p;
      break;
    }
  }
  if (!startPoint) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (parsePointDate(sorted[i]!.date) <= start) {
        startPoint = sorted[i]!;
        break;
      }
    }
  }

  if (!latestPoint || !startPoint || startPoint.nav <= 0) return null;
  return ((latestPoint.nav - startPoint.nav) / startPoint.nav) * 100;
}

/** @deprecated Prefer {@link pctReturnForRange} for calendar horizons. */
export function pctBetween(history: FundNavPoint[], daysAgo: number): number | null {
  if (history.length < 2) return null;
  const latest = history[history.length - 1]!.nav;
  const targetIdx = Math.max(0, history.length - 1 - daysAgo);
  const past = history[targetIdx]!.nav;
  if (past <= 0) return null;
  return ((latest - past) / past) * 100;
}

export function ProzprRatingCard() {
  return (
    <motion.section
      className="relative overflow-hidden rounded-2xl border px-3.5 py-2.5"
      style={{ borderColor: "rgba(212, 168, 104, 0.45)" }}
      initial={{ backgroundColor: "rgba(212, 168, 104, 0.95)" }}
      animate={{
        backgroundColor: [
          "rgba(212, 168, 104, 0.95)",
          "#F5EEDC",
          "rgba(212, 168, 104, 0.85)",
          "#F5EEDC",
          "#F5EEDC",
        ],
      }}
      transition={{
        duration: 3.6,
        ease: "easeInOut",
        times: [0, 0.3, 0.5, 0.85, 1],
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-[10px] uppercase tracking-[1.4px]"
          style={{ color: "#5C4313", fontWeight: 700 }}
        >
          Prozpr rating
        </p>
        <div className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <Star
              key={i}
              className="h-3.5 w-3.5"
              style={{ color: "#D4A868", fill: "#D4A868" }}
            />
          ))}
          <Star
            className="h-3.5 w-3.5"
            style={{ color: "#D4A868", fill: "url(#half-star-gradient)" }}
          />
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
              <linearGradient id="half-star-gradient">
                <stop offset="50%" stopColor="#D4A868" />
                <stop offset="50%" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug" style={{ color: "#2E2207" }}>
        Strong 5-year risk-adjusted returns with below-peer drawdowns. Stable management and a
        diversified mandate keep it in our top quartile.
      </p>
    </motion.section>
  );
}

const CHART_EASE = [0.4, 0, 0.2, 1] as const;
const CHART_POINT_COUNT = 120;
const MORPH_TRANSITION = { duration: 0.55, ease: CHART_EASE } as const;
const REVEAL_TRANSITION = { duration: 1.05, ease: CHART_EASE } as const;

/** Fixed-length series so path `d` can morph smoothly when the horizon changes. */
function resampleSeries(points: FundNavPoint[], targetCount: number): FundNavPoint[] {
  if (points.length === 0) return [];
  if (points.length === 1) {
    return Array.from({ length: targetCount }, () => ({ ...points[0]! }));
  }
  const out: FundNavPoint[] = [];
  for (let i = 0; i < targetCount; i++) {
    const t = i / (targetCount - 1);
    const pos = t * (points.length - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(points.length - 1, i0 + 1);
    const f = pos - i0;
    const nav = points[i0]!.nav * (1 - f) + points[i1]!.nav * f;
    out.push({ date: f < 0.5 ? points[i0]!.date : points[i1]!.date, nav });
  }
  return out;
}

function buildPaths(
  sampled: FundNavPoint[],
  benchScaled: number[] | null,
): {
  linePath: string;
  areaPath: string;
  benchPath: string | null;
  hi: number;
  lo: number;
} {
  const fundVals = sampled.map((p) => p.nav);
  const allVals = benchScaled ? [...fundVals, ...benchScaled] : fundVals;
  const min = Math.min(...allVals);
  const max = Math.max(...allVals);
  const pad = Math.max((max - min) * 0.08, 0.001);
  const lo = min - pad;
  const hi = max + pad;
  const n = sampled.length;
  const xAt = (i: number) => (i / (n - 1)) * 100;
  const yAt = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;

  const linePath = sampled
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(p.nav).toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;
  const benchPath = benchScaled
    ? benchScaled
        .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`)
        .join(" ")
    : null;

  return { linePath, areaPath, benchPath, hi, lo };
}

export function NavChart({
  points,
  isUp,
  benchmarkPoints,
}: {
  points: FundNavPoint[];
  isUp: boolean;
  benchmarkPoints?: FundNavPoint[];
}) {
  const fillGradientId = useId();
  const revealStartedRef = useRef(false);
  const [revealDone, setRevealDone] = useState(false);
  const [revealClip, setRevealClip] = useState("inset(0 100% 0 0)");
  const containerRef = useRef<HTMLDivElement>(null);
  // Index into `sampled` of the NAV point under the pointer (null = not hovering).
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hasData = points.length >= 2;

  const { sampled, benchScaled } = useMemo(() => {
    if (!hasData) return { sampled: [] as FundNavPoint[], benchScaled: null as number[] | null };
    const s = resampleSeries(points, CHART_POINT_COUNT);
    let bench: number[] | null = null;
    if (benchmarkPoints && benchmarkPoints.length > 1) {
      const benchSampled = resampleSeries(benchmarkPoints, CHART_POINT_COUNT);
      const bStart = benchSampled[0]?.nav || 1;
      const fundStart = s[0]?.nav ?? 1;
      bench = benchSampled.map((p) => (fundStart * p.nav) / bStart);
    }
    return { sampled: s, benchScaled: bench };
  }, [points, benchmarkPoints, hasData]);

  const paths = useMemo(
    () => (hasData ? buildPaths(sampled, benchScaled) : null),
    [sampled, benchScaled, hasData],
  );

  const stroke = isUp ? "hsl(160 50% 38%)" : "hsl(0 84% 50%)";
  const fillStart = isUp ? "hsl(160 50% 38% / 0.18)" : "hsl(0 84% 50% / 0.18)";
  const fillEnd = isUp ? "hsl(160 50% 38% / 0.02)" : "hsl(0 84% 50% / 0.02)";

  // First load: clip wipes left → right. Horizon changes only morph path shape underneath.
  useEffect(() => {
    if (!hasData || revealStartedRef.current) return;
    revealStartedRef.current = true;
    const frame = requestAnimationFrame(() => setRevealClip("inset(0 0% 0 0)"));
    return () => cancelAnimationFrame(frame);
  }, [hasData]);

  if (!hasData || !paths) {
    return (
      <div className="grid h-[180px] place-items-center text-[12px] text-muted-foreground">
        Not enough data to chart.
      </div>
    );
  }

  const { linePath, areaPath, benchPath, hi, lo } = paths;
  const morphTransition = revealDone ? MORPH_TRANSITION : { duration: 0 };

  // Hover read-out. The SVG stretches a 0..100 viewBox over the box
  // (preserveAspectRatio="none"), so these percentages map straight to the
  // overlay's CSS left/top — the guide, dot and tooltip line up with the curve.
  const n = sampled.length;
  const active = hoverIdx != null && hoverIdx >= 0 && hoverIdx < n ? sampled[hoverIdx]! : null;
  const hoverXPct = active ? (hoverIdx! / (n - 1)) * 100 : 0;
  const hoverYPct = active ? 100 - ((active.nav - lo) / (hi - lo)) * 100 : 0;

  // Map a pointer x-coordinate to the nearest sampled point (mouse, touch & pen).
  const updateHoverFromClientX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(frac * (n - 1)));
  };

  return (
    <div ref={containerRef} className="relative h-[180px] w-full">
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ clipPath: revealClip }}
        transition={REVEAL_TRANSITION}
        onAnimationComplete={() => setRevealDone(true)}
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
            <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillStart} />
              <stop offset="100%" stopColor={fillEnd} />
            </linearGradient>
          </defs>
          <motion.path
            initial={false}
            d={areaPath}
            fill={`url(#${fillGradientId})`}
            animate={{ d: areaPath }}
            transition={morphTransition}
          />
          {benchPath && (
            <motion.path
              initial={false}
              d={benchPath}
              fill="none"
              stroke="#D4A868"
              strokeOpacity={0.85}
              strokeWidth={1.25}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
              animate={{ d: benchPath }}
              transition={morphTransition}
            />
          )}
          <motion.path
            initial={false}
            d={linePath}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            animate={{ d: linePath, stroke }}
            transition={morphTransition}
          />
        </svg>
      </motion.div>
      <div className="pointer-events-none absolute left-1 top-1 text-[10px] tabular-nums text-muted-foreground/80">
        ₹{hi.toFixed(2)}
      </div>
      <div className="pointer-events-none absolute right-1 top-1 text-[10px] tabular-nums text-muted-foreground/80">
        ₹{lo.toFixed(2)}
      </div>
      <div className="pointer-events-none absolute bottom-1 left-1 text-[10px] text-muted-foreground/80">
        {formatDate(sampled[0]!.date)}
      </div>
      <div className="pointer-events-none absolute bottom-1 right-1 text-[10px] text-muted-foreground/80">
        {formatDate(sampled[sampled.length - 1]!.date)}
      </div>

      {/* Transparent layer that captures hover/touch and reports the nearest point. */}
      <div
        className="absolute inset-0 z-10"
        style={{ touchAction: "none" }}
        onPointerMove={(e) => updateHoverFromClientX(e.clientX)}
        onPointerDown={(e) => updateHoverFromClientX(e.clientX)}
        onPointerLeave={() => setHoverIdx(null)}
        onPointerUp={() => setHoverIdx(null)}
      />
      {active && (
        <>
          {/* Vertical guide at the hovered date. */}
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-foreground/25"
            style={{ left: `${hoverXPct}%` }}
          />
          {/* Marker dot sitting on the NAV line. */}
          <div
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background"
            style={{ left: `${hoverXPct}%`, top: `${hoverYPct}%`, backgroundColor: stroke }}
          />
          {/* Date-wise NAV read-out, clamped so it stays inside the chart. */}
          <div
            className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-card px-2 py-1 text-center shadow-sm"
            style={{ left: `${Math.min(82, Math.max(18, hoverXPct))}%` }}
          >
            <p className="text-[10px] text-muted-foreground">{formatDate(active.date)}</p>
            <p className="text-[12px] font-semibold tabular-nums text-foreground">
              ₹{formatNav(active.nav)}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export function StatBlock({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-[14px] font-semibold tabular-nums"
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: valueColor ?? "hsl(var(--foreground))",
        }}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RangePills({
  range,
  onRange,
}: {
  range: NavRange;
  onRange: (r: NavRange) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {NAV_RANGES.map((r) => {
        const active = r === range;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onRange(r)}
            className={`rounded-full px-3 py-1 text-[11.5px] font-semibold tabular-nums transition-colors ${
              active
                ? "bg-foreground text-background"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
            aria-pressed={active}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
