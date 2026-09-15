import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import ClassDistributionBars from "@/components/invest/ClassDistributionBars";
import MultiAssetRow from "@/components/invest/MultiAssetRow";
import PctInput from "@/components/invest/PctInput";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  CLASSES,
  classStatus,
  isEngaged,
  MULTI_ASSET_ID,
  type RowValues,
} from "@/lib/investment-preferences";

/** The state word and its colour. `delta` is printed as an absolute figure —
 *  "-6.0% left" would be wrong twice over. */
const STATE_CLASS = {
  under: "text-[hsl(var(--wealth-amber))]",
  over: "text-destructive",
  balanced: "text-[hsl(var(--wealth-green))]",
} as const;

/**
 * The complete distribution the customer owns: every settable category gets a
 * row, grouped under its class, with a live budget header showing what that
 * class's rows have taken of what the bar gives them.
 *
 * The multi-asset fund sits ABOVE the groups because it draws on all three
 * budgets at once — its breakdown and any overdraw message live on that row
 * (spec §6). A class whose budget multi-asset has overdrawn goes fully neutral
 * here: a negative budget is not the group's problem to state.
 *
 * Holds no state. The only state anywhere is the in-flight keystroke string
 * inside each `PctInput`; the value itself lives with the parent.
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
  const engaged = isEngaged(values);
  const multiAsset = subcategories.find((c) => c.id === MULTI_ASSET_ID);
  const set = (id: string, v: number | null) => onChange({ ...values, [id]: v });

  return (
    <section className="mt-2">
      {multiAsset ? (
        <MultiAssetRow
          value={values[multiAsset.id] ?? null}
          label={multiAsset.label}
          recommended={multiAsset.recommended_pct_of_total}
          mix={mix}
          onChange={(v) => set(multiAsset.id, v)}
        />
      ) : null}

      {CLASSES.map((cls) => {
        const rows = subcategories.filter((c) => c.class === cls && c.id !== MULTI_ASSET_ID);
        const { allocated, budget, delta, state } = classStatus(mix, values, subcategories, cls);
        // A class multi-asset has overdrawn shows its name only: the budget is
        // negative and the actionable message is already on the row above.
        // Test this class's OWN budget — a large multi-asset entry can overdraw
        // two classes at once, and multiAssetOverdraw only ever names the first.
        const showBudget = engaged && budget >= 0;

        return (
          <div key={cls} data-testid={`group-${cls}`} className="mt-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              {showBudget ? (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CLASS_COLOR[cls] }}
                />
              ) : null}
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {CLASS_LABEL[cls]}
              </span>
              {showBudget ? (
                <span className="ml-auto flex items-baseline gap-2 text-[11.5px] tabular-nums">
                  <span className="text-muted-foreground">
                    {allocated.toFixed(1)} of {budget.toFixed(1)}%
                  </span>
                  <span className={STATE_CLASS[state]}>
                    {state === "balanced"
                      ? "balanced"
                      : `${Math.abs(delta).toFixed(1)}% ${state === "over" ? "over" : "left"}`}
                  </span>
                </span>
              ) : null}
            </div>

            {/* Same rule as the budget header: stay quiet until the customer
                engages. An untouched screen showing "Yours 0.0% · Prozpr 30.0%"
                in every group is noise, not information (spec §7). */}
            {/* A single-row class (commodity holds only gold) would draw two
                identical full-width bars comparing nothing, duplicating the row
                beneath — so the comparison needs at least two segments. */}
            {showBudget && rows.length > 1 ? (
              <ClassDistributionBars cls={cls} categories={rows} values={values} />
            ) : null}

            {rows.map((c) => (
              <div key={c.id} className="flex items-center gap-3 border-b border-border py-3">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-foreground">{c.label}</div>
                  <div className="mt-0.5 text-[10px] tabular-nums text-[#D4A868]">
                    {`Prozpr ${c.recommended_pct_of_total.toFixed(1)}%`}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2.5">
                  <PctInput
                    label={c.label}
                    value={values[c.id] ?? null}
                    onChange={(v) => set(c.id, v)}
                  />
                  <span className="text-[13px] text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
