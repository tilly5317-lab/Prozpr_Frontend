import { useCallback, useRef } from "react";

/**
 * A donut split between equity and debt, edited on the ring itself.
 *
 * The boundary between the two arcs IS the control: press or drag anywhere on
 * the wheel and the split follows the pointer, so a mix is set by pointing at
 * the shape you want rather than by aiming a slider thumb. Arrow keys nudge it
 * by one step for anyone not using a pointer.
 */

const CENTER = 50;
const RADIUS = 36;
const RING = 13;
/** Degrees per equity point — a full turn is 100% equity. */
const DEG_PER_PCT = 3.6;

const EQUITY_COLOR = "#D4A868";
const DEBT_COLOR = "hsl(var(--muted-foreground) / 0.38)";

function pointOnRing(angleDeg: number, r = RADIUS): { x: number; y: number } {
  // 0° at 12 o'clock, sweeping clockwise — the way a split is read.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

/** Arc path from `start` to `end` degrees, clockwise. */
function arcPath(startDeg: number, endDeg: number): string {
  const from = pointOnRing(startDeg);
  const to = pointOnRing(endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${from.x} ${from.y} A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${to.x} ${to.y}`;
}

export default function AssetMixDial({
  equityPct,
  step,
  onChange,
  centerLabel,
  equityNote,
  debtNote,
}: {
  equityPct: number;
  step: number;
  onChange: (pct: number) => void;
  /** Rendered inside the hole — typically the return the mix implies. */
  centerLabel?: string;
  /** Sleeve assumptions, shown beside each arc so the blend is never a mystery. */
  equityNote: string;
  debtNote: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const snap = useCallback(
    (raw: number) => {
      const stepped = Math.round(raw / step) * step;
      return Math.min(100, Math.max(0, stepped));
    },
    [step],
  );

  /** Pointer position → equity share, measured as an angle from 12 o'clock. */
  const pctFromPointer = useCallback(
    (clientX: number, clientY: number): number | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const dx = (clientX - rect.left) / rect.width - 0.5;
      const dy = (clientY - rect.top) / rect.height - 0.5;
      // Dead zone in the hole: a stray tap on the centre readout shouldn't
      // snap the mix to whatever angle it happened to land on.
      if (Math.hypot(dx, dy) < 0.12) return null;
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      return snap(((deg + 360) % 360) / DEG_PER_PCT);
    },
    [snap],
  );

  const handlePointer = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const next = pctFromPointer(e.clientX, e.clientY);
      if (next != null && next !== equityPct) onChange(next);
    },
    [equityPct, onChange, pctFromPointer],
  );

  const boundary = equityPct * DEG_PER_PCT;
  const handle = pointOnRing(boundary);
  const debtPct = 100 - equityPct;

  return (
    <div className="flex items-center gap-4">
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        role="slider"
        tabIndex={0}
        aria-label="Equity share of the portfolio"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={equityPct}
        aria-valuetext={`${equityPct}% equity, ${debtPct}% debt`}
        className="h-[132px] w-[132px] shrink-0 cursor-pointer touch-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handlePointer(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) handlePointer(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(snap(equityPct + step));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(snap(equityPct - step));
          } else if (e.key === "Home") {
            e.preventDefault();
            onChange(0);
          } else if (e.key === "End") {
            e.preventDefault();
            onChange(100);
          }
        }}
      >
        {/* All-one-asset reads as a full ring; anything between draws two arcs. */}
        {equityPct === 0 || equityPct === 100 ? (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={equityPct === 100 ? EQUITY_COLOR : DEBT_COLOR}
            strokeWidth={RING}
          />
        ) : (
          <>
            <path
              d={arcPath(0, boundary)}
              fill="none"
              stroke={EQUITY_COLOR}
              strokeWidth={RING}
              strokeLinecap="butt"
            />
            <path
              d={arcPath(boundary, 360)}
              fill="none"
              stroke={DEBT_COLOR}
              strokeWidth={RING}
              strokeLinecap="butt"
            />
          </>
        )}

        {/* Draggable boundary between the two sleeves. */}
        <circle
          cx={handle.x}
          cy={handle.y}
          r={6}
          fill="hsl(var(--card))"
          stroke={EQUITY_COLOR}
          strokeWidth={2.5}
        />

        <text
          x={CENTER}
          y={CENTER - 3}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontSize: 17, fontWeight: 700 }}
        >
          {equityPct}%
        </text>
        <text
          x={CENTER}
          y={CENTER + 8}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 7.5, letterSpacing: 0.4 }}
        >
          EQUITY
        </text>
        {centerLabel && (
          <text
            x={CENTER}
            y={CENTER + 19}
            textAnchor="middle"
            style={{ fontSize: 8, fontWeight: 700, fill: EQUITY_COLOR }}
          >
            {centerLabel}
          </text>
        )}
      </svg>

      <div className="min-w-0 flex-1 space-y-2">
        <MixLegendRow color={EQUITY_COLOR} name="Equity" pct={equityPct} note={equityNote} />
        <MixLegendRow color={DEBT_COLOR} name="Debt" pct={debtPct} note={debtNote} />
        <p className="text-[10px] leading-snug text-muted-foreground/70">
          Drag the ring to re-split. More equity, higher assumed return.
        </p>
      </div>
    </div>
  );
}

function MixLegendRow({
  color,
  name,
  pct,
  note,
}: {
  color: string;
  name: string;
  pct: number;
  note: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[1px] rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[12px] font-semibold text-foreground">{name}</span>
      <span className="text-[13px] font-bold tabular-nums text-foreground">{pct}%</span>
      <span className="truncate text-[10px] text-muted-foreground/70">{note}</span>
    </div>
  );
}
