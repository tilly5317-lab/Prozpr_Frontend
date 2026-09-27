import type { ClassMix } from "@/lib/api";
import { CLASS_COLOR, CLASSES } from "@/lib/investment-preferences";

/** One thin Equity / Debt / Commodity bar, for display. A class at 0 is skipped
 *  rather than drawn at zero width, which would still leave a stray gap.
 *
 *  `showGap` draws what a mix is short of 100 as an empty segment at the end,
 *  so a bar being filled in cannot look complete before it is. */
export default function MixBar({ id, mix, showGap = false }: { id: string; mix: ClassMix; showGap?: boolean }) {
  const gap = showGap ? Math.max(0, 100 - CLASSES.reduce((s, c) => s + mix[c], 0)) : 0;
  return (
    <div data-testid={id} className="flex h-2 gap-0.5">
      {CLASSES.filter((c) => mix[c] > 0).map((c) => (
        <div
          key={c}
          data-testid={`${id}-${c}`}
          className="h-full basis-0 rounded-full"
          style={{ flexGrow: mix[c], background: CLASS_COLOR[c] }}
        />
      ))}
      {gap > 0 ? (
        <div data-testid={`${id}-gap`} className="h-full basis-0 rounded-full bg-muted" style={{ flexGrow: gap }} />
      ) : null}
    </div>
  );
}
