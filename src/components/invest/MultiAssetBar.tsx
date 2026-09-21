import { useRef } from "react";

import EditableFigure from "@/components/invest/EditableFigure";
import { COL_REF, COL_YOU } from "@/components/invest/columns";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  MULTI_ASSET_ID,
  multiAssetDraw,
  round1,
  type RowValues,
} from "@/lib/investment-preferences";

/** How close to the divider a press has to land to grab it. The same tolerance
 *  `ClassSegmentBar` uses, for the same reason. */
const HIT_PX = 16;

/**
 * The multi-asset fund. One entry drawing on all three class budgets at once
 * (65/25/10), which is why it sits above the class groups rather than inside
 * one (spec §6).
 *
 * Drawn as the same filled bar and gold divider the class groups use, spanning
 * the WHOLE portfolio — so a width here means what a width means everywhere
 * else on the screen. It used to be the one Radix slider among bars, and it
 * read as a different kind of control (spec §5, revised 2026-09-20).
 *
 * The ceiling `max` is stated in words rather than drawn. Measured against the
 * real palette every tonal step sits between 1.1:1 and 1.9:1 against the track,
 * and a 10%-alpha hatch on a 26px bar is barely better — where a sentence is
 * legible in both themes, translatable, and readable by a screen reader.
 */
export default function MultiAssetBar({
  value,
  max,
  label,
  recommended,
  today,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  recommended: number;
  today: number | null;
  onChange: (v: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const values: RowValues = { [MULTI_ASSET_ID]: value };
  // Commodity alone sets the cap — the sleeve is 10% of it — so a customer who
  // drags commodity to nothing leaves this fund unfundable.
  const live = max > 0;

  const commit = (pct: number) => onChange(round1(Math.max(0, Math.min(max, pct))));
  const pctFromClientX = (clientX: number, r: DOMRect): number => ((clientX - r.left) / r.width) * 100;

  const onDown = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect();
    // A bar with no layout box measures every press at 0%, which would empty
    // the sleeve on a touch. Guard BEFORE capturing, as ClassSegmentBar does.
    if (!live || !r?.width) return;
    // A press grabs the divider or does nothing at all. The Radix slider
    // jumped to the press, which on a phone is one stray tap from a reset.
    if (Math.abs(pctFromClientX(e.clientX, r) - value) > (HIT_PX / r.width) * 100) return;
    dragging.current = true;
    // jsdom has no setPointerCapture; without the optional call the drag path
    // cannot be tested at all.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect();
    if (dragging.current && r?.width) commit(pctFromClientX(e.clientX, r));
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 0.5 : e.key === "ArrowLeft" ? -0.5 : 0;
    if (!step) return;
    e.preventDefault();
    commit(value + step);
  };

  return (
    <div className="border-b border-border pb-4">
      <div className="flex items-baseline gap-2">
        <div className="min-w-0 truncate text-[13.5px] font-medium text-foreground">
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </div>
        <div className={`ml-auto ${COL_REF} text-[10.5px] tabular-nums text-muted-foreground`}>
          {recommended.toFixed(1)}
        </div>
        {today != null ? (
          <div
            data-testid="ma-today"
            className={`${COL_REF} text-[10.5px] tabular-nums text-muted-foreground`}
          >
            {today.toFixed(1)}
          </div>
        ) : null}
        {live ? (
          <EditableFigure
            value={value}
            max={max}
            label="Multi-asset"
            onCommit={commit}
            className={`${COL_YOU} text-[10.5px]`}
          />
        ) : (
          <span className={`${COL_YOU} text-right text-[10.5px] font-semibold tabular-nums text-foreground`}>
            {`${value.toFixed(1)}%`}
          </span>
        )}
      </div>

      <div
        ref={barRef}
        data-testid="ma-bar"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative mt-3 flex h-[26px] touch-none rounded-lg bg-muted"
      >
        <div
          data-testid="ma-fill"
          className="h-full rounded-l-lg"
          style={{
            width: `${value}%`,
            // The fill is the sleeve's own 65/25/10, so the bar shows what the
            // entry counts as — the same fact the breakdown line states below.
            background:
              `linear-gradient(to right, ${CLASS_COLOR.equity} 0 65%, ` +
              `${CLASS_COLOR.debt} 65% 90%, ${CLASS_COLOR.others} 90% 100%)`,
          }}
        />
        {/* At value 0 the divider sits on the bar's left edge. The flooring the
            other bars use exists to keep TWO dividers apart; there is only one
            here, its hit area extends past the bar, and a gold line hard left
            is a fair picture of "none of this". */}
        {live ? (
          <div
            role="slider"
            tabIndex={0}
            aria-label="Multi-asset share of your portfolio"
            aria-valuemin={0}
            aria-valuemax={max}
            aria-valuenow={value}
            onKeyDown={onKey}
            className="group absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none px-2 py-3.5 focus:outline-none"
            style={{ left: `${value}%` }}
          >
            <span
              className="block h-[21px] w-[3px] rounded-full bg-[#D4A868] group-focus-visible:ring-2 group-focus-visible:ring-[#D4A868]/50"
              style={{ boxShadow: "0 1px 5px rgba(0,0,0,0.5)" }}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-2 text-[10.5px] leading-relaxed tabular-nums text-muted-foreground">
        {live ? (
          <>
            <span data-testid="ma-breakdown">
              {`Counts as ${multiAssetDraw(values, "equity").toFixed(1)}% ${CLASS_LABEL.equity}` +
                ` · ${multiAssetDraw(values, "debt").toFixed(1)}% ${CLASS_LABEL.debt}` +
                ` · ${multiAssetDraw(values, "others").toFixed(1)}% ${CLASS_LABEL.others}`}
            </span>
            {max < 100 ? (
              <span className="block">{`Up to ${max.toFixed(1)}% — that's what your split can fund.`}</span>
            ) : null}
          </>
        ) : (
          <span>{"This fund is 10% commodity. Give commodity some room and you can hold it."}</span>
        )}
      </div>
    </div>
  );
}
