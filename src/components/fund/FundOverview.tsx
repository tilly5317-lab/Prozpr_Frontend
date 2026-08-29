import { useId, useMemo, useRef, useState } from "react";

import { formatDate, type FundNavPoint } from "@/components/fund/FundScreenUi";
import { CAT_COLOR, FUND_COLOR, Seg } from "@/components/fund/FundAnalysisUi";
import { Term } from "@/components/fund/InfoTip";
import {
  RETURN_RANGES,
  type CategoryProfile,
  type FundProfile,
  type ReturnRange,
  cumulativeSeries,
  pctInRange,
  toneColor,
} from "@/lib/fundCategory";
import {
  RISK_COLORS,
  RISK_LEVELS,
  type FactRow,
  type RiskRow,
  type SnapshotRow,
  type TrackRow,
} from "@/lib/fundSnapshot";

/** Third line on the returns chart — a broad index fund. */
const INDEX_COLOR = "hsl(268 60% 62%)";

const GRID = "hsl(var(--border))";

/**
 * Cumulative growth over the selected window, starting at 0% and adding up.
 *
 * Drawn the same way as the NAV / unit chart: a 0..100 viewBox stretched over
 * the box with `preserveAspectRatio="none"`, so chart percentages map straight
 * to the overlay's CSS positions and the guide, dot and tooltip line up with
 * the curve. That also lets the plot run edge to edge — the axis labels float
 * over it rather than reserving a gutter.
 *
 * The fund line is REAL. The index and category lines are GENERATED — Prozpr
 * has no per-fund benchmark series and no peer aggregate.
 */
function GrowthChart({
  series,
  categoryName,
}: {
  series: { date: string; fund: number; index: number; category: number }[];
  categoryName: string;
}) {
  const fillId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const all = series.flatMap((p) => [p.fund, p.index, p.category]);
  const rawLo = Math.min(0, ...all);
  const rawHi = Math.max(...all);
  const pad = (rawHi - rawLo) * 0.1 || 1;
  const lo = rawLo - pad;
  const hi = rawHi + pad;

  const n = series.length;
  const X = (i: number) => (i / (n - 1 || 1)) * 100;
  const Y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100;

  const line = (key: "fund" | "index" | "category") =>
    series.map((p, i) => `${i === 0 ? "M" : "L"} ${X(i).toFixed(2)} ${Y(p[key]).toFixed(2)}`).join(" ");

  const fundPath = line("fund");
  const areaPath = `${fundPath} L 100 100 L 0 100 Z`;

  // Three or four ticks, rounded to something legible rather than raw extremes.
  const step = (() => {
    const raw = (hi - lo) / 3;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
    return Math.ceil(raw / mag) * mag;
  })();
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);

  const active = hoverIdx != null && hoverIdx >= 0 && hoverIdx < n ? series[hoverIdx] : null;
  const hoverX = active ? X(hoverIdx!) : 0;
  const hoverY = active ? Y(active.fund) : 0;

  /** Map a pointer x-coordinate to the nearest sampled point. */
  const updateHover = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverIdx(Math.round(frac * (n - 1)));
  };

  const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

  return (
    <div ref={containerRef} className="relative h-[170px] w-full">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FUND_COLOR} stopOpacity="0.18" />
            <stop offset="100%" stopColor={FUND_COLOR} stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <line
            key={t}
            x1="0"
            x2="100"
            y1={Y(t)}
            y2={Y(t)}
            stroke={GRID}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            opacity={t === 0 ? 0.9 : 0.35}
          />
        ))}

        <path d={areaPath} fill={`url(#${fillId})`} />
        <path
          d={line("category")}
          fill="none"
          stroke={CAT_COLOR}
          strokeWidth="1.3"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={line("index")}
          fill="none"
          stroke={INDEX_COLOR}
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={fundPath}
          fill="none"
          stroke={FUND_COLOR}
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Axis labels float over the plot so the chart can run edge to edge. */}
      {ticks.map((t) => (
        <span
          key={t}
          className="pointer-events-none absolute right-0 -translate-y-1/2 bg-card/70 pl-1 text-[11px] tabular-nums text-muted-foreground/80"
          style={{ top: `${Y(t)}%` }}
        >
          {Math.round(t)}%
        </span>
      ))}
      <span className="pointer-events-none absolute bottom-0 left-0 text-[11px] text-muted-foreground/80">
        {formatDate(series[0].date)}
      </span>
      <span className="pointer-events-none absolute bottom-0 right-0 text-[11px] text-muted-foreground/80">
        {formatDate(series[n - 1].date)}
      </span>

      {/* Transparent layer that captures hover/touch and reports the nearest point. */}
      <div
        className="absolute inset-0 z-10"
        style={{ touchAction: "none" }}
        onPointerMove={(e) => updateHover(e.clientX)}
        onPointerDown={(e) => updateHover(e.clientX)}
        onPointerLeave={() => setHoverIdx(null)}
        onPointerUp={() => setHoverIdx(null)}
      />

      {active && (
        <>
          <div
            className="pointer-events-none absolute bottom-0 top-0 w-px bg-foreground/25"
            style={{ left: `${hoverX}%` }}
          />
          <div
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
            style={{ left: `${hoverX}%`, top: `${hoverY}%`, backgroundColor: FUND_COLOR }}
          />
          {/* All three series at that date — the comparison is the point. */}
          <div
            className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-card px-2 py-1.5 shadow-sm"
            style={{ left: `${Math.min(76, Math.max(24, hoverX))}%` }}
          >
            <p className="mb-0.5 text-[10px] text-muted-foreground">{formatDate(active.date)}</p>
            {(
              [
                ["This fund", active.fund, FUND_COLOR],
                ["Index fund", active.index, INDEX_COLOR],
                [`${categoryName} avg`, active.category, CAT_COLOR],
              ] as [string, number, string][]
            ).map(([label, value, color]) => (
              <p key={label} className="flex items-center gap-2 text-[10.5px] leading-tight">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="flex-1 text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums text-foreground">{pct(value)}</span>
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One Snapshot row: the headline figure, and a track placing it against the
 * category average within the category's range.
 */
export function MiniTrack({
  label,
  value,
  display,
  lo,
  hi,
  catValue,
  catDisplay,
  loDisplay,
  hiDisplay,
  higherBetter,
  term,
}: TrackRow) {
  const span = hi - lo || 1;
  const pos = (v: number) => Math.max(4, Math.min(96, ((v - lo) / span) * 100));
  const tone = toneColor(pctInRange(value, lo, hi, higherBetter, catValue));
  const x = pos(value);

  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Term term={term} className="text-[12.5px] text-foreground">
          {label}
        </Term>
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-foreground">
          {display}
        </span>
      </div>

      <div className="relative mt-3 h-[34px]">
        {/* Fund's own figure, called out above its mark. */}
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-bold tabular-nums"
          style={{ left: `${x}%`, color: tone }}
        >
          {display}
        </span>
        <div className="absolute inset-x-0 top-[17px] h-px bg-border" />
        {/* Category average — a thin tick, labelled below. */}
        <span
          className="absolute top-[11px] h-3 w-px"
          style={{ left: `${pos(catValue)}%`, backgroundColor: CAT_COLOR }}
          aria-hidden="true"
        />
        <span
          className="absolute top-[21px] -translate-x-1/2 whitespace-nowrap text-[9.5px] tabular-nums text-muted-foreground"
          style={{ left: `${pos(catValue)}%` }}
        >
          cat {catDisplay}
        </span>
        {/* The fund — a solid bar, so it reads louder than the tick. */}
        <span
          className="absolute top-[10px] h-[15px] w-[3px] -translate-x-1/2 rounded-full"
          style={{ left: `${x}%`, backgroundColor: tone }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-[9.5px] tabular-nums text-muted-foreground/70">
        <span>{loDisplay}</span>
        <span>{hiDisplay}</span>
      </div>
    </div>
  );
}

/**
 * SEBI's six-step riskometer. Every step is drawn so the reader sees where this
 * fund sits on the whole scale, not just its label — "Moderately High" means
 * little without the steps either side of it.
 */
export function Riskometer({
  level,
  levelLabel,
  term,
}: {
  level: number;
  levelLabel: string;
  term?: string;
}) {
  return (
    <div className="py-2.5">
      <Term term={term} className="text-[12.5px] text-foreground">
        Indian risk level (Riskometer)
      </Term>
      <div className="mt-2 flex gap-1">
        {RISK_LEVELS.map((name, i) => {
          const active = i === level;
          return (
            <span
              key={name}
              title={name}
              className="h-2.5 flex-1 rounded-full"
              style={{
                backgroundColor: RISK_COLORS[i],
                // Inactive steps stay visible but recede, so the active one reads
                // as a position on a scale rather than the only lit segment.
                opacity: active ? 1 : 0.28,
                outline: active ? `2px solid ${RISK_COLORS[i]}` : "none",
                outlineOffset: 2,
              }}
            />
          );
        })}
      </div>
      <div className="relative mt-2 flex items-baseline justify-between text-[9.5px] text-muted-foreground">
        <span>Low</span>
        <span
          className="absolute left-1/2 -translate-x-1/2 text-[11px] font-bold"
          style={{ color: RISK_COLORS[level] }}
        >
          {levelLabel}
        </span>
        <span>Very high</span>
      </div>
    </div>
  );
}

/** A plain fact row — label left, value right, or stacked when it's a sentence. */
export function Fact({ label, value, tone, block, term }: FactRow) {
  const dot =
    tone == null ? null : (
      <span
        className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
        style={{
          backgroundColor: tone === "yes" ? "hsl(151 55% 40%)" : "hsl(var(--muted-foreground))",
        }}
      />
    );

  if (block) {
    return (
      <div className="py-2.5">
        <Term term={term} className="text-[12.5px] text-muted-foreground">
          {label}
        </Term>
        <p className="mt-1 text-[12.5px] font-semibold text-foreground">
          {dot}
          {value}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <Term term={term} className="text-[12.5px] text-foreground">
        {label}
      </Term>
      <span className="shrink-0 text-[12.5px] font-semibold text-foreground">
        {dot}
        {value}
      </span>
    </div>
  );
}

/**
 * The Returns hero — cumulative growth against an index fund and the category
 * average, with the window picker.
 */
export function FundReturnsHero({
  history,
  seed,
  categoryName,
  range,
  onRange,
}: {
  history: FundNavPoint[];
  seed: string;
  categoryName: string;
  range: ReturnRange;
  onRange: (r: ReturnRange) => void;
}) {
  const series = useMemo(
    () => cumulativeSeries(history, range, seed),
    [history, range, seed],
  );

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-[13.5px] font-semibold text-foreground">Returns</p>
      <p className="mt-0.5 mb-2 text-[11px] leading-snug text-muted-foreground">
        Starts at 0% and adds up over the period · against the {categoryName} average and an index
        fund
      </p>

      {series.length < 2 ? (
        <p className="py-6 text-center text-[11.5px] text-muted-foreground">
          Not enough NAV history for this window.
        </p>
      ) : (
        <GrowthChart series={series} categoryName={categoryName} />
      )}

      <div className="mt-2">
        <Seg
          options={RETURN_RANGES}
          value={range}
          onChange={(v) => onRange(v as ReturnRange)}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-[2.5px] w-3.5 rounded-full" style={{ backgroundColor: FUND_COLOR }} />
          This fund
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="h-[2.5px] w-3.5 rounded-full" style={{ backgroundColor: INDEX_COLOR }} />
          Index fund
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span
            className="h-0 w-3.5 border-t-2 border-dashed"
            style={{ borderColor: CAT_COLOR }}
          />
          {categoryName} average
        </span>
      </div>
    </section>
  );
}

/** Snapshot — the handful of numbers that decide most of the verdict. */
export function FundSnapshot({ rows, n = 1 }: { rows: SnapshotRow[]; n?: number }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full px-4 pb-3 pt-3.5 text-left"
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10.5px] font-bold text-muted-foreground">
            {n}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold leading-tight text-foreground">Snapshot</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              The numbers that decide most of it, each against the category
            </p>
          </div>
          <svg
            width="14"
            height="9"
            viewBox="0 0 12 8"
            className={`mt-1.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M1 1.5L6 6.5l5-5"
              fill="none"
              stroke="currentColor"
              className="text-muted-foreground"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {rows.map((row, i) => (
            <div
              key={`${row.kind}-${"label" in row ? row.label : i}`}
              className="border-t border-border/60 first:border-t-0"
            >
              {row.kind === "track" ? (
                <MiniTrack {...row} />
              ) : row.kind === "risk" ? (
                <Riskometer level={row.level} levelLabel={row.levelLabel} term={row.term} />
              ) : (
                <Fact {...row} />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
