import * as SliderPrimitive from "@radix-ui/react-slider";

import { CLASS_COLOR } from "@/lib/investment-preferences";
import {
  CLASS_LABEL,
  MULTI_ASSET_ID,
  multiAssetDraw,
  round1,
  type RowValues,
} from "@/lib/investment-preferences";

/**
 * The multi-asset fund. One entry drawing on all three class budgets at once
 * (65/25/10), which is why it sits above the class groups rather than inside
 * one (spec §6).
 *
 * Its slider stops at `max` — the largest entry the customer's bar can actually
 * fund. That cap is what retired the overdraw error: a class budget can no
 * longer go negative, so there is nothing to warn about.
 */
export default function MultiAssetRow({
  value,
  max,
  label,
  recommended,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  recommended: number;
  onChange: (v: number) => void;
}) {
  const values: RowValues = { [MULTI_ASSET_ID]: value };

  return (
    <div className="border-b border-border pb-4">
      <div className="flex items-baseline gap-2.5">
        <div className="text-[13.5px] font-medium text-foreground">
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </div>
        <div className="ml-auto text-[10.5px] tabular-nums text-muted-foreground">
          {`Prozpr ${recommended.toFixed(1)}`}
        </div>
        <div className="text-[13.5px] font-semibold tabular-nums text-foreground">
          {value.toFixed(1)}%
        </div>
      </div>

      <SliderPrimitive.Root
        className="relative mt-3 flex h-5 w-full touch-none select-none items-center"
        value={[Math.min(value, max)]}
        min={0}
        max={max}
        step={0.5}
        onValueChange={([v]) => onChange(round1(v))}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
          {/* The fill is the sleeve's own 65/25/10, so the bar shows what the
              entry counts as — the same fact the breakdown line states below. */}
          <SliderPrimitive.Range
            className="absolute h-full"
            style={{
              background:
                `linear-gradient(to right, ${CLASS_COLOR.equity} 0 65%, ` +
                `${CLASS_COLOR.debt} 65% 90%, ${CLASS_COLOR.others} 90% 100%)`,
            }}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          aria-label="Multi-asset share of your portfolio"
          className="block h-[18px] w-[18px] rounded-full border-2 border-[#D4A868] bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50"
          style={{ boxShadow: "0 2px 9px rgba(0,0,0,0.45)" }}
        />
      </SliderPrimitive.Root>

      <div className="mt-2 text-[10.5px] tabular-nums">
        <span data-testid="ma-breakdown" className="text-muted-foreground">
          {`Counts as ${multiAssetDraw(values, "equity").toFixed(1)}% ${CLASS_LABEL.equity}` +
            ` · ${multiAssetDraw(values, "debt").toFixed(1)}% ${CLASS_LABEL.debt}` +
            ` · ${multiAssetDraw(values, "others").toFixed(1)}% ${CLASS_LABEL.others}`}
        </span>
      </div>
    </div>
  );
}
