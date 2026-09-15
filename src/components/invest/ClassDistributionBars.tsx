import type { ScreenSubcategory } from "@/lib/api";
import {
  CLASS_COLOR, classAllocated, recommendedValues, type Cls, type RowValues,
} from "@/lib/investment-preferences";

/** Segment shade for the nth category in a class: the class colour at descending
 *  opacity. The two bars iterate the same array, so position maps position, and
 *  CLASS_COLOR stays the app's only asset-class palette. */
const shade = (cls: Cls, i: number, n: number) => ({
  background: CLASS_COLOR[cls],
  opacity: n <= 1 ? 1 : 1 - (i / (n - 1)) * 0.6,
});

/** The customer's distribution across one class's categories, with Prozpr's
 *  beneath it. Both bars are drawn full width so the MIX is comparable; the
 *  label above carries both totals so the SIZE difference is still visible
 *  (spec §5.2). Multi-asset is excluded from both — these bars describe the rows
 *  in the table directly below. */
export default function ClassDistributionBars({
  cls, categories, values,
}: {
  cls: Cls;
  categories: ScreenSubcategory[];
  values: RowValues;
}) {
  const rec = recommendedValues(categories);
  const yoursTotal = classAllocated(values, categories, cls);
  const prozprTotal = classAllocated(rec, categories, cls);

  const bar = (prefix: "yours" | "prozpr", src: RowValues, total: number) => (
    <div data-testid={`bar-${prefix}`} className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {categories.map((c, i) => (
        <span
          key={c.id}
          data-testid={`${prefix}-${c.id}`}
          title={`${c.label} ${(src[c.id] ?? 0).toFixed(1)}%`}
          style={{ width: `${total > 0 ? ((src[c.id] ?? 0) / total) * 100 : 0}%`, ...shade(cls, i, categories.length) }}
        />
      ))}
    </div>
  );

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div data-testid="bars-label" className="text-[10px] tabular-nums tracking-wide text-muted-foreground">
        Yours {yoursTotal.toFixed(1)}% &middot; Prozpr {prozprTotal.toFixed(1)}%
      </div>
      {bar("yours", values, yoursTotal)}
      {bar("prozpr", rec, prozprTotal)}
    </div>
  );
}
