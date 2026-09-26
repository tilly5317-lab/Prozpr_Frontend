import { useEffect, useState } from "react";

import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import ClassSegmentBar from "@/components/invest/ClassSegmentBar";
import EditableFigure from "@/components/invest/EditableFigure";
import { COL_REF, COL_YOU } from "@/components/invest/columns";
import MultiAssetBar from "@/components/invest/MultiAssetBar";
import {
  applyTypedEntry,
  CLASS_COLOR,
  CLASS_LABEL,
  CLASSES,
  classAllocated,
  classBudget,
  MULTI_ASSET_ID,
  normalise,
  recommendedValues,
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
  // Prozpr's own-rows total for a class — the aggregate of the per-row Prozpr
  // figures below, net of multi-asset, so it lines up with the class's budget.
  const recValues = recommendedValues(subcategories);
  // Only the classes that actually have settable rows get a group. Knowing them
  // up front lets each group but the last carry the same hairline the
  // multi-asset row draws above the first one.
  const shownClasses = CLASSES.filter((cls) =>
    subcategories.some((c) => c.class === cls && c.id !== MULTI_ASSET_ID),
  );

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
        <span className={`ml-auto ${COL_REF}`}>Prozpr</span>
        {today ? <span className={COL_REF}>Today</span> : null}
        <span className={`${COL_YOU} text-right`}>You</span>
      </div>

      {multiAsset ? (
        <MultiAssetBar
          label={multiAsset.label}
          value={values[multiAsset.id] ?? 0}
          mix={mix}
          recommended={recValues[multiAsset.id] ?? 0}
          today={today ? (today[multiAsset.id] ?? 0) : null}
          onChange={(v) => commit({ ...values, [multiAsset.id]: v })}
        />
      ) : null}

      {shownClasses.map((cls, gi) => {
        const rows = subcategories.filter((c) => c.class === cls && c.id !== MULTI_ASSET_ID);
        const budget = classBudget(mix, values, cls);

        return (
          <div
            key={cls}
            data-testid={`group-${cls}`}
            className={`mt-5 ${gi < shownClasses.length - 1 ? "border-b border-border pb-4" : ""}`}
          >
            {/* The class summary carries Prozpr / Today / You in the same three
                columns as the multi-asset row above and the rows below, so every
                figure on the card lines up. All three are net of multi-asset. */}
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CLASS_COLOR[cls] }} />
              <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">
                {CLASS_LABEL[cls]}
              </span>
              <span
                data-testid={`prozpr-${cls}`}
                className={`ml-auto ${COL_REF} text-[10.5px] tabular-nums text-muted-foreground`}
              >
                {classAllocated(recValues, subcategories, cls).toFixed(0)}
              </span>
              {today ? (
                <span
                  data-testid={`today-${cls}`}
                  className={`${COL_REF} text-[10.5px] tabular-nums text-muted-foreground`}
                >
                  {classAllocated(today, subcategories, cls).toFixed(0)}
                </span>
              ) : null}
              <span
                data-testid={`budget-${cls}`}
                className={`${COL_YOU} text-right text-[10.5px] font-semibold tabular-nums text-foreground`}
              >
                {`${budget.toFixed(0)}%`}
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
                  <span className={`ml-auto ${COL_REF} text-[10.5px] tabular-nums text-muted-foreground`}>
                    {(recValues[c.id] ?? 0).toFixed(0)}
                  </span>
                  {today ? (
                    <span
                      data-testid={`today-${c.id}`}
                      className={`${COL_REF} text-[10.5px] tabular-nums text-muted-foreground`}
                    >
                      {(today[c.id] ?? 0).toFixed(0)}
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
                      className={`${COL_YOU} text-[10.5px]`}
                    />
                  ) : (
                    <span
                      data-testid={`you-${c.id}`}
                      className={`${COL_YOU} text-right text-[10.5px] font-semibold tabular-nums text-foreground`}
                    >
                      {`${(values[c.id] ?? 0).toFixed(0)}%`}
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
