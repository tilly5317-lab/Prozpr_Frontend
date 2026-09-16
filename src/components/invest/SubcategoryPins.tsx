import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import ClassSegmentBar from "@/components/invest/ClassSegmentBar";
import MultiAssetRow from "@/components/invest/MultiAssetRow";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  CLASSES,
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
 * Holds no state. `values` arrives complete (the page substitutes Prozpr's
 * recommendation until the customer engages), so nothing here is nullable.
 */
export default function SubcategoryPins({
  values,
  subcategories,
  mix,
  onChange,
}: {
  values: RowValues;
  subcategories: ScreenSubcategory[];
  mix: ClassMix;
  onChange: (next: RowValues) => void;
}) {
  const multiAsset = subcategories.find((c) => c.id === MULTI_ASSET_ID);
  const commit = (next: RowValues) => onChange(normalise(mix, next, subcategories));

  return (
    <section className="mt-3">
      {multiAsset ? (
        <MultiAssetRow
          label={multiAsset.label}
          value={values[multiAsset.id] ?? 0}
          max={maxMultiAsset(mix)}
          recommended={multiAsset.recommended_pct_of_total}
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
              <span
                data-testid={`budget-${cls}`}
                className="ml-auto text-[11.5px] font-semibold tabular-nums text-foreground"
              >
                {`${budget.toFixed(1)}%`}
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
                <div key={c.id} className="flex items-baseline gap-2 text-[12.5px]">
                  <span
                    className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-sm"
                    style={{
                      background: CLASS_COLOR[cls],
                      opacity: rows.length <= 1 ? 1 : 1 - (i / (rows.length - 1)) * 0.6,
                    }}
                  />
                  <span className="min-w-0 truncate text-foreground">{shortLabel(c)}</span>
                  <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
                    {`Prozpr ${c.recommended_pct_of_total.toFixed(1)}`}
                  </span>
                  <span className="w-[46px] shrink-0 text-right font-medium tabular-nums text-foreground">
                    {`${(values[c.id] ?? 0).toFixed(1)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
