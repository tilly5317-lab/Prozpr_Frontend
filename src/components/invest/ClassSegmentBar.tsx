import { useRef } from "react";

import type { ScreenSubcategory } from "@/lib/api";
import {
  applySegmentDrag,
  barPosToValue,
  CLASS_COLOR,
  roundPct,
  segmentLayout,
  shortLabel,
  type Cls,
  type RowValues,
} from "@/lib/investment-preferences";

/** Segment shade for the nth row in a class: the class colour at descending
 *  opacity. The row legend beneath uses the same ramp by index, so a segment and
 *  its row read as the same thing, and CLASS_COLOR stays the app's only
 *  asset-class palette. */
const shade = (cls: Cls, i: number, n: number) => ({
  background: CLASS_COLOR[cls],
  // n === 1 is a divide-by-zero guard, not a style choice.
  opacity: n <= 1 ? 1 : 1 - (i / (n - 1)) * 0.6,
});

/** A bar percentage as a CSS length, trimmed to four decimals so the string
 *  stays readable and stable across renders. */
const cssPct = (p: number): string => `${Math.round(p * 1e4) / 1e4}%`;

/** How close to a divider a press has to land to grab it. */
const HIT_PX = 16;

/**
 * One class's rows as a single bar: each row is a segment, and each divider
 * trades the two rows it sits between. The class therefore always sums to its
 * budget — there is no way to express "over" or "under", which is why this
 * screen has no error states (spec §4.2, revised 2026-09-16).
 *
 * Prozpr's recommendation is carried per row in the legend beneath, as a figure
 * rather than a second bar (spec §5.2, revised 2026-09-16).
 */
export default function ClassSegmentBar({
  cls,
  rows,
  values,
  budget,
  onChange,
}: {
  cls: Cls;
  rows: ScreenSubcategory[];
  values: RowValues;
  budget: number;
  onChange: (next: RowValues) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  // Always the latest values for an in-flight drag, the same reason
  // AssetMixBar keeps a mixRef.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const drag = useRef<{ cands: number[]; handle: number | null; startX: number } | null>(null);

  const cum = (k: number) => roundPct(rows.slice(0, k).reduce((s, r) => s + (values[r.id] ?? 0), 0));
  // Drawn widths, not raw shares: a 0% row is floored to a visible sliver, so
  // where a divider SITS and what it is WORTH are no longer the same number.
  const widths = segmentLayout(rows, values, budget);
  const cumDisplay = (k: number) => widths.slice(0, k).reduce((s, w) => s + w, 0);
  const interactive = budget > 0 && rows.length > 1;
  const handles = interactive
    ? rows.slice(0, -1).map((_, i) => ({ k: i + 1, at: cum(i + 1), left: cumDisplay(i + 1) }))
    : [];

  const pctFromClientX = (clientX: number): number => {
    const r = barRef.current?.getBoundingClientRect();
    return r && r.width ? ((clientX - r.left) / r.width) * 100 : 0;
  };

  // Pointer handling lives on the BAR, not on each divider: when a row is at 0
  // its two dividers sit on the same pixel, and only the bar can see that the
  // press matched both of them.
  const onDown = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!interactive || !r?.width) return;
    const p = pctFromClientX(e.clientX);
    const tol = (HIT_PX / r.width) * 100;
    const cands = handles.filter((h) => Math.abs(h.left - p) <= tol).map((h) => h.k);
    if (cands.length === 0) return;
    drag.current = { cands, handle: cands.length === 1 ? cands[0] : null, startX: e.clientX };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.handle === null) {
      // Dividers stacked on a collapsed row: that row can only grow, so the one
      // that moves is whichever is free to travel the way the finger went.
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) < 2) return;
      d.handle = dx > 0 ? Math.max(...d.cands) : Math.min(...d.cands);
    }
    // Through the layout inverse, so the divider lands on the value sitting
    // under the finger rather than on a raw share of the bar's width.
    const v = barPosToValue(rows, valuesRef.current, budget, pctFromClientX(e.clientX));
    onChange(applySegmentDrag(rows, valuesRef.current, budget, d.handle, (v / budget) * 100));
  };

  const onUp = () => {
    drag.current = null;
  };

  const onKey = (k: number) => (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    onChange(applySegmentDrag(rows, values, budget, k, ((cum(k) + step) / budget) * 100));
  };

  return (
    <div
      ref={barRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="relative mt-2.5 flex h-[26px] touch-none rounded-lg bg-muted"
    >
      {rows.map((r, i) => (
        <div
          key={r.id}
          data-testid={`seg-${r.id}`}
          title={`${shortLabel(r)} ${(values[r.id] ?? 0).toFixed(0)}%`}
          className={`h-full ${i === 0 ? "rounded-l-lg" : ""} ${
            i === rows.length - 1 ? "rounded-r-lg" : ""
          }`}
          style={{ width: cssPct(widths[i]), ...shade(cls, i, rows.length) }}
        />
      ))}

      {handles.map(({ k, at, left }) => (
        <div
          key={k}
          role="slider"
          tabIndex={0}
          aria-label={`${shortLabel(rows[k - 1])} / ${shortLabel(rows[k])} divider`}
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-valuenow={at}
          onKeyDown={onKey(k)}
          className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none px-2 py-3.5 focus:outline-none"
          style={{ left: cssPct(left), zIndex: 10 + k }}
        >
          <span
            className="block h-[21px] w-[3px] rounded-full bg-[#D4A868] group-focus-visible:ring-2 group-focus-visible:ring-[#D4A868]/50"
            style={{ boxShadow: "0 1px 5px rgba(0,0,0,0.5)" }}
          />
        </div>
      ))}
    </div>
  );
}
