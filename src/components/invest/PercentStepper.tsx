import { Minus, Plus } from "lucide-react";

import EditableFigure from "@/components/invest/EditableFigure";

// 32px to see, 44px tall to tap: the ::after pad reaches 6px past the box above
// and below, so a row stays compact without a smaller target for the thumb.
const STEP =
  "relative grid h-8 w-8 place-items-center text-foreground after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] disabled:opacity-30";

/**
 * [−] [number%] [+] for one percentage: steps of 1, and the number can be
 * tapped to type over (digits only, held to `max`). Every control is 32px
 * to look at and 44px tall to tap.
 */
export default function PercentStepper({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center rounded-lg border border-border">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(value - 1)}
        className={STEP}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <EditableFigure
        value={value}
        max={max}
        label={label}
        onCommit={onChange}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={STEP}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
