import { useRef } from "react";

import type { ClassMix } from "@/lib/api";
import {
  applyDividerDrag, CLASS_COLOR, CLASSES, flooredShares, sharePosToValue,
} from "@/lib/investment-preferences";

/**
 * The Equity / Debt / Commodity split as one bar. `interactive` mode carries
 * two draggable gold-lozenge dividers (drag or ←/→) that trade between
 * neighbours and always total 100%; `reference` mode is Prozpr's static bar.
 * A segment's % label hides on a narrow segment so it never collides with a
 * handle, and in interactive mode every segment is floored to a visible
 * sliver — reference bars draw true shares instead (see `widths`).
 */
export default function AssetMixBar({
  mode,
  mix,
  onChange,
}: {
  mode: "interactive" | "reference";
  mix: ClassMix;
  onChange?: (m: ClassMix) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const mixRef = useRef(mix);
  mixRef.current = mix; // always the latest split for in-flight drags
  const dragging = useRef(false);

  // Drawn widths. The floor keeps a class squeezed to nothing from putting its
  // two dividers on the same pixel — but only the interactive bar HAS dividers,
  // so flooring a reference bar would invent a visible sliver of a class the
  // customer does not hold, with its label suppressed by labelMin so nothing
  // explains it (spec §4, revised 2026-09-20).
  const widths =
    mode === "interactive"
      ? flooredShares([mix.equity, mix.debt, mix.others], 100)
      : [mix.equity, mix.debt, mix.others];
  const shares = () => [mixRef.current.equity, mixRef.current.debt, mixRef.current.others];

  /** Pointer position → a position in VALUE space, inverting the floor. */
  const valueFromClientX = (clientX: number): number => {
    const r = barRef.current!.getBoundingClientRect();
    if (!r.width) return 0;
    return sharePosToValue(shares(), 100, ((clientX - r.left) / r.width) * 100);
  };

  const onDown = (e: React.PointerEvent) => {
    if (mode !== "interactive") return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (h: 1 | 2) => (e: React.PointerEvent) => {
    if (!dragging.current || !onChange) return;
    onChange(applyDividerDrag(mixRef.current, h, valueFromClientX(e.clientX)));
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (h: 1 | 2) => (e: React.KeyboardEvent) => {
    if (mode !== "interactive" || !onChange) return;
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const cur = h === 1 ? mix.equity : mix.equity + mix.debt;
    onChange(applyDividerDrag(mix, h, cur + d));
  };

  // Show the % on any segment wide enough to hold it. "62.1%" is ~28px at 9px
  // type and the bar is ~3.4px per drawn %, so anything under ~9% clips or
  // crowds a handle. Measured against the DRAWN width, not the value.
  const labelMin = 9;

  // The floor keeps the dividers ~5px apart at worst, but their hit areas are
  // 20px wide and still overlap there, and z-index decides which one the pointer
  // grabs. The one still free to move must win: handle 1 (drag left to shed
  // equity) unless we are pinned at the far left.
  const topHandle: 1 | 2 = mix.equity === 0 ? 2 : 1;

  const handles =
    mode === "interactive"
      ? ([
          { h: 1 as const, left: widths[0], label: "Equity / Debt divider", now: mix.equity },
          {
            h: 2 as const,
            left: widths[0] + widths[1],
            label: "Debt / Commodity divider",
            now: mix.equity + mix.debt,
          },
        ] as const)
      : [];

  return (
    <div
      ref={barRef}
      className={`relative flex rounded-lg bg-muted ${
        mode === "interactive" ? "h-[30px] overflow-visible" : "h-[30px] overflow-hidden"
      }`}
    >
      {CLASSES.map((k, i) => (
        <div
          key={k}
          data-testid={`mix-seg-${k}`}
          className={`flex h-full items-center justify-center overflow-hidden whitespace-nowrap ${
            i === 0 ? "rounded-l-lg" : ""
          } ${i === CLASSES.length - 1 ? "rounded-r-lg" : ""}`}
          style={{ width: `${widths[i]}%`, background: CLASS_COLOR[k] }}
        >
          {widths[i] >= labelMin && (
            <span className="text-[9px] font-semibold tabular-nums text-white/95">
              {mix[k].toFixed(0)}%
            </span>
          )}
        </div>
      ))}

      {handles.map(({ h, left, label, now }) => (
        <div
          key={h}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={now}
          onPointerDown={onDown}
          onPointerMove={onMove(h)}
          onPointerUp={onUp}
          onKeyDown={onKey(h)}
          className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none px-2.5 py-4 focus:outline-none"
          style={{ left: `${left}%`, zIndex: h === topHandle ? 20 : 10 }}
        >
          <span
            className="block h-[22px] w-[7px] rounded bg-[#D4A868] transition-transform group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-[#D4A868]/40 motion-reduce:transition-none"
            style={{ boxShadow: "0 2px 9px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(120,80,20,0.35)" }}
          />
        </div>
      ))}
    </div>
  );
}
