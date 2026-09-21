import { useEffect, useState } from "react";

import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import ClassSegmentBar from "@/components/invest/ClassSegmentBar";
import EditableFigure from "@/components/invest/EditableFigure";
import MultiAssetBar from "@/components/invest/MultiAssetBar";
import {
  applyTypedEntry,
  CLASS_COLOR,
  CLASS_LABEL,
  CLASSES,
  classAllocated,
  classBudget,
  maxMultiAsset,
  MULTI_ASSET_ID,
  normalise,
  shortLabel,
  type RowValues,
} from "@/lib/investment-preferences";

/**
 * The complete distribution the customer owns: one bar per class whose segments
 * are that class's categories, with the rows listed beneath as a legend.
 *
 * Every edit leaves here through `normalise`, so what the parent receives is
 * always a distribution that sits exactly on the bar — there is no invalid
 * state for the page to detect or report.
 *
 * `values` arrives complete (the page substitutes Prozpr's recommendation
 * until the customer engages), so nothing here is nullable.
 */
export default function SubcategoryPins({
  values,
  subcategories,
  mix,
  today,
  onChange,
}: {
  values: RowValues;
  subcategories: ScreenSubcategory[];
  mix: ClassMix;
  /** Null is the screen's "no today" state — the backend does not send
   *  `current` yet, and every today affordance here hangs off this. */
  today: RowValues | null;
  onChange: (next: RowValues) => void;
}) {
  const multiAsset = subcategories.find((c) => c.id === MULTI_ASSET_ID);
  const commit = (next: RowValues) => onChange(normalise(mix, next, subcategories));

  // Which rows a typed value just moved. Typing rebalances every sibling in
  // the class at once where a drag trades with one neighbour, so the customer
  // has to watch it happen (spec D7).
  const [flashed, setFlashed] = useState<string[]>([]);
  useEffect(() => {
    if (flashed.length === 0) return;
    const t = window.setTimeout(() => setFlashed([]), 600);
    return () => window.clearTimeout(t);
  }, [flashed]);

  const commitTyped = (
    rows: ScreenSubcategory[], budget: number, rowId: string, typed: number,
  ) => {
    const next = applyTypedEntry(rows, values, budget, rowId, typed);
    setFlashed(
      rows
        .filter((r) => r.id !== rowId && (next[r.id] ?? 0) !== (values[r.id] ?? 0))
        .map((r) => r.id),
    );
    commit(next);
  };

  return (
    <section className="mt-3">
      {/* Once for the whole section: the columns are identical all the way
          down, and a header per class group is four copies of the same line. */}
      <div className="mb-1.5 flex items-baseline gap-2 text-[10.5px] text-muted-foreground">
        <span className="ml-auto w-[40px] shrink-0 text-right">Prozpr</span>
        {today ? <span className="w-[40px] shrink-0 text-right">Today</span> : null}
        <span className="w-[46px] shrink-0 text-right">You</span>
      </div>

      {multiAsset ? (
        <MultiAssetBar
          label={multiAsset.label}
          value={values[multiAsset.id] ?? 0}
          max={maxMultiAsset(mix)}
          recommended={multiAsset.recommended_pct_of_total}
          today={today ? (today[multiAsset.id] ?? 0) : null}
          onChange={(v) => commit({ ...values, [multiAsset.id]: v })}
        />
      ) : null}

      {CLASSES.map((cls) => {
        const rows = subcategories.filter((c) => c.class === cls && c.id !== MULTI_ASSET_ID);
        if (rows.length === 0) return null;
        const budget = classBudget(mix, values, cls);

        return (
          <div key={cls} data-testid={`group-${cls}`} className="mt-5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CLASS_COLOR[cls] }} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">
                {CLASS_LABEL[cls]}
              </span>
              <span className="ml-auto flex items-baseline gap-1.5">
                {/* The class's OWN rows today, net of multi-asset — the budget
                    beside it is net of multi-asset too, so the two compare. */}
                {today ? (
                  <span
                    data-testid={`today-${cls}`}
                    className="text-[10.5px] tabular-nums text-muted-foreground"
                  >
                    {`Today ${classAllocated(today, subcategories, cls).toFixed(1)} ·`}
                  </span>
                ) : null}
                <span
                  data-testid={`budget-${cls}`}
                  className="text-[11.5px] font-semibold tabular-nums text-foreground"
                >
                  {`${budget.toFixed(1)}%`}
                </span>
              </span>
            </div>

            {/* A single-row class (commodity holds only gold) has nothing to
                divide — the bar would just duplicate the row beneath it. */}
            {rows.length > 1 ? (
              <ClassSegmentBar
                cls={cls}
                rows={rows}
                values={values}
                budget={budget}
                onChange={(next) => commit(next)}
              />
            ) : null}

            <div className="mt-2.5 flex flex-col gap-1.5">
              {rows.map((c, i) => (
                <div
                  key={c.id}
                  data-testid={`row-${c.id}`}
                  data-flashed={flashed.includes(c.id) ? "true" : undefined}
                  // The tint goes on with NO transition and comes off with one.
                  // Transitioning INTO a 6% alpha over half a second is a swell
                  // nobody perceives; a flash is instant-on, fade-out.
                  // -mx-1 px-1 so it bleeds to the card padding without taking
                  // a pixel of width off the label.
                  className={`-mx-1 flex items-baseline gap-2 rounded px-1 text-[12.5px] ${
                    flashed.includes(c.id)
                      ? "bg-foreground/[0.06]"
                      : "transition-colors duration-500 motion-reduce:transition-none"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm"
                    style={{
                      background: CLASS_COLOR[cls],
                      opacity: rows.length <= 1 ? 1 : 1 - (i / (rows.length - 1)) * 0.6,
                    }}
                  />
                  <span className="min-w-0 truncate text-foreground">{shortLabel(c)}</span>
                  <span className="ml-auto w-[40px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">
                    {c.recommended_pct_of_total.toFixed(1)}
                  </span>
                  {today ? (
                    <span
                      data-testid={`today-${c.id}`}
                      className="w-[40px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground"
                    >
                      {(today[c.id] ?? 0).toFixed(1)}
                    </span>
                  ) : null}
                  {/* A single-row class IS its budget, and a class at budget 0
                      can only ever return 0.0. Either way a field would be a
                      lie — the same condition the bar above uses for its
                      dividers (spec §7.4). */}
                  {rows.length > 1 && budget > 0 ? (
                    <EditableFigure
                      value={values[c.id] ?? 0}
                      max={budget}
                      label={shortLabel(c)}
                      onCommit={(v) => commitTyped(rows, budget, c.id, v)}
                      className="w-[46px] shrink-0 text-[10.5px]"
                    />
                  ) : (
                    <span
                      data-testid={`you-${c.id}`}
                      className="w-[46px] shrink-0 text-right text-[10.5px] font-semibold tabular-nums text-foreground"
                    >
                      {`${(values[c.id] ?? 0).toFixed(1)}%`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
