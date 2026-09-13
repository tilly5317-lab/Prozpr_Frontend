import { useRef } from "react";

import type { ClassMix } from "@/lib/api";
import { applyDividerDrag, CLASS_COLOR, CLASSES } from "@/lib/investment-preferences";

/**
 * The Equity / Debt / Commodity split as one bar. `interactive` mode carries
 * two draggable gold-lozenge dividers (drag or ←/→) that trade between
 * neighbours and always total 100%; `reference` mode is Prozpr's static bar.
 * A segment's % label hides under ~14% so it never collides with a handle.
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

  const pctFromClientX = (clientX: number): number => {
    const r = barRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 100;
  };

  const onDown = (e: React.PointerEvent) => {
    if (mode !== "interactive") return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onMove = (h: 1 | 2) => (e: React.PointerEvent) => {
    if (!dragging.current || !onChange) return;
    onChange(applyDividerDrag(mixRef.current, h, pctFromClientX(e.clientX)));
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

  // Show the % on any segment wide enough to hold it: the bar is ~3.7px per %
  // and "N%" is ~14px, so below ~5% the digits crowd the handle / clip.
  const labelMin = 5;

  // When debt is 0 both dividers land on the same spot. The one still free to
  // move must sit on top (z-index also decides which one the pointer grabs):
  // handle 1 (drag left to shed equity) unless we're pinned at the far left.
  const topHandle: 1 | 2 = mix.equity === 0 ? 2 : 1;

  const handles =
    mode === "interactive"
      ? ([
          { h: 1 as const, left: mix.equity, label: "Equity / Debt divider", now: mix.equity },
          { h: 2 as const, left: mix.equity + mix.debt, label: "Debt / Commodity divider", now: mix.equity + mix.debt },
        ] as const)
      : [];

  return (
    <div
      ref={barRef}
      className={`relative flex h-[30px] rounded-lg bg-muted ${
        mode === "interactive" ? "overflow-visible" : "overflow-hidden"
      }`}
    >
      {CLASSES.map((k, i) => (
        <div
          key={k}
          className={`flex h-full items-center justify-center overflow-hidden whitespace-nowrap ${
            i === 0 ? "rounded-l-lg" : ""
          } ${i === CLASSES.length - 1 ? "rounded-r-lg" : ""}`}
          style={{ width: `${mix[k]}%`, background: CLASS_COLOR[k] }}
        >
          {mix[k] >= labelMin && (
            <span className="text-[9px] font-semibold tabular-nums text-white/95">{mix[k]}%</span>
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
