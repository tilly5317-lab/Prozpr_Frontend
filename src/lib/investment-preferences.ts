/** S4 percentage preferences — pure bar math + validation. No React, no I/O.
 *  Every value is a share of the WHOLE portfolio; the backend owns %-of-class. */
import type { ClassMix, ScreenSubcategory, SubcategoryPin } from "@/lib/api";

export type Cls = "equity" | "debt" | "others";
export const CLASSES: Cls[] = ["equity", "debt", "others"];
export const CLASS_LABEL: Record<Cls, string> = {
  equity: "Equity",
  debt: "Debt",
  others: "Commodity",
};

/** Canonical asset-class colours (single source app-wide). */
export const CLASS_COLOR: Record<Cls, string> = {
  equity: "hsl(var(--bucket-equity))",
  debt: "hsl(var(--bucket-debt))",
  others: "hsl(var(--wealth-amber))",
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Drag a divider inside the bar. Handle 1 = the equity|debt boundary (trades
 *  equity↔debt, commodity fixed); handle 2 = the debt|commodity boundary
 *  (trades commodity↔debt, equity fixed). Integer %s, always summing to 100. */
export function applyDividerDrag(mix: ClassMix, handle: 1 | 2, posPct: number): ClassMix {
  const x = Math.round(clamp(posPct));
  if (handle === 1) {
    const cap = mix.equity + mix.debt; // the second divider — handle 1 can't cross it
    const equity = Math.min(x, cap);
    return { equity, debt: cap - equity, others: mix.others };
  }
  const floor = mix.equity; // the first divider — handle 2 can't cross it
  const cum = Math.max(x, floor); // equity + debt cumulative
  return { equity: mix.equity, debt: cum - floor, others: 100 - cum };
}

/** One decimal place is this screen's unit of precision: it is what the customer
 *  can type, what every figure is printed to, and what validation compares. Two
 *  percentages are only ever compared after both are on this grid — never with a
 *  raw epsilon, which is how a header can end up reading "12.8 of 12.8% · over". */
export const round1 = (x: number): number => Math.round(x * 10) / 10;

/** Round the engine's float recommendation to tenths, letting the residual class
 *  (others) absorb the rounding error so it always sums to 100 — the same
 *  convention as applyDividerDrag's second handle. */
export function roundMix(m: ClassMix): ClassMix {
  const equity = round1(m.equity);
  const debt = round1(m.debt);
  return { equity, debt, others: round1(100 - equity - debt) };
}

export const MULTI_ASSET_ID = "multi_asset";

/** The multi-asset fund's fixed internal split. One entry the customer types
 *  draws on all three class budgets at once — real maths, not a label
 *  (frontend spec §6, backend spec §5). */
const MULTI_ASSET_SPLIT: Record<Cls, number> = { equity: 0.65, debt: 0.25, others: 0.1 };

/** Row inputs keyed by subgroup id. `null` = the field is blank. This is the ONE
 *  shape the maths speaks; `SubcategoryPin[]` appears only at the wire boundary
 *  (Task 2). */
export type RowValues = Record<string, number | null>;

/** Blank reads as 0 once engaged (spec §4.3). Every read of RowValues goes
 *  through here so that rule lives in exactly one place. */
const val = (values: RowValues, id: string): number => values[id] ?? 0;

/** What a multi-asset entry contributes to one class, as % of total.
 *  Debt and commodity round to a tenth; equity carries the residual, so the
 *  three figures the customer sees always add back to the one they typed
 *  (5.0 -> 3.2 / 1.3 / 0.5, not 3.3 / 1.3 / 0.5 = 5.1). */
export function multiAssetDraw(values: RowValues, cls: Cls): number {
  const ma = val(values, MULTI_ASSET_ID);
  const debt = round1(ma * MULTI_ASSET_SPLIT.debt);
  const others = round1(ma * MULTI_ASSET_SPLIT.others);
  if (cls === "debt") return debt;
  if (cls === "others") return others;
  return round1(ma - debt - others);
}

/** The budget a class group's own rows must fill: its share on the bar, minus
 *  whatever multi-asset already draws from it. Rounded — this IS the number the
 *  header prints, so typing it always balances the class. */
export function classBudget(mix: ClassMix, values: RowValues, cls: Cls): number {
  return round1(mix[cls] - multiAssetDraw(values, cls));
}

/** The first class whose budget a multi-asset entry overdraws, or null. */
export function multiAssetOverdraw(mix: ClassMix, values: RowValues): Cls | null {
  return CLASSES.find((c) => classBudget(mix, values, c) < 0) ?? null;
}

/** What the customer put in a class's own rows. Multi-asset is excluded — it is
 *  accounted for by classBudget, so counting it here would double-count. */
export function classAllocated(values: RowValues, cats: ScreenSubcategory[], cls: Cls): number {
  return round1(
    cats
      .filter((c) => c.id !== MULTI_ASSET_ID && c.class === cls)
      .reduce((s, c) => s + val(values, c.id), 0),
  );
}

export type ClassState = "under" | "over" | "balanced";
export interface ClassStatus {
  allocated: number;
  budget: number;
  /** allocated - budget, on the one-decimal grid. Negative means room left. */
  delta: number;
  state: ClassState;
}

export function classStatus(
  mix: ClassMix, values: RowValues, cats: ScreenSubcategory[], cls: Cls,
): ClassStatus {
  const budget = classBudget(mix, values, cls);
  const allocated = classAllocated(values, cats, cls);
  const delta = round1(allocated - budget);
  return { allocated, budget, delta, state: delta === 0 ? "balanced" : delta > 0 ? "over" : "under" };
}

/** Engaged = the customer has entered at least one value. A zero counts: it is a
 *  deliberate "none of this", not an absence (spec §4.3). */
export function isEngaged(values: RowValues): boolean {
  return Object.values(values).some((v) => v != null);
}

/** A complete distribution — every class's rows sum EXACTLY to its budget.
 *  Because the bar always totals 100, per-class exactness makes the overall 100%
 *  fall out automatically (spec §4.2), so there is no separate total check. */
export function distributionValid(
  mix: ClassMix, values: RowValues, cats: ScreenSubcategory[],
): boolean {
  if (!isEngaged(values)) return false;
  return CLASSES.every((c) => classStatus(mix, values, cats, c).state === "balanced");
}

/** Prozpr's recommendation as row values. The backend already rounds each figure
 *  to one decimal, so this is a straight read. */
export function recommendedValues(cats: ScreenSubcategory[]): RowValues {
  const out: RowValues = {};
  for (const c of cats) out[c.id] = c.recommended_pct_of_total;
  return out;
}

/** The class bar that matches those rows — the look-through of the
 *  recommendation, with the multi-asset fund split 65/25/10. Deriving the bar
 *  FROM the rows is what lets Reset land balanced instead of accusing Prozpr's
 *  own recommendation of overdrawing the bar. */
export function recommendedMix(cats: ScreenSubcategory[]): ClassMix {
  const values = recommendedValues(cats);
  const equity = round1(multiAssetDraw(values, "equity") + classAllocated(values, cats, "equity"));
  const debt = round1(multiAssetDraw(values, "debt") + classAllocated(values, cats, "debt"));
  return { equity, debt, others: round1(100 - equity - debt) };
}

/** Prozpr's recommendation as a complete, already-balanced set of row values.
 *  The backend rounds each of the eleven figures independently, so they can sum
 *  to 99.9 or 100.1; the leftover is pushed onto each class's largest row, the
 *  same largest-remainder convention roundMix uses on the bar. */
export function resetValues(cats: ScreenSubcategory[], mix: ClassMix): RowValues {
  const values = recommendedValues(cats);
  for (const cls of CLASSES) {
    const rows = cats.filter((c) => c.id !== MULTI_ASSET_ID && c.class === cls);
    if (rows.length === 0) continue;
    const residual = round1(classBudget(mix, values, cls) - classAllocated(values, cats, cls));
    if (residual === 0) continue;
    const biggest = rows.reduce((a, b) => (val(values, b.id) > val(values, a.id) ? b : a));
    values[biggest.id] = round1(Math.max(0, val(values, biggest.id) + residual));
  }
  return values;
}

export function sameMix(a: ClassMix, b: ClassMix): boolean {
  return a.equity === b.equity && a.debt === b.debt && a.others === b.others;
}

export function samePins(a: SubcategoryPin[], b: SubcategoryPin[]): boolean {
  if (a.length !== b.length) return false;
  const key = (p: SubcategoryPin) => `${p.subgroup}:${p.pct_of_total}`;
  const bs = new Set(b.map(key));
  return a.every((p) => bs.has(key(p)));
}

/** The save payload. Either EMPTY (untouched, or cleared back to engine-decides)
 *  or COMPLETE — one entry per settable category, blanks as explicit zeros. An
 *  omitted row would read to the engine as "you decide" (spec §9). */
export function toSavePins(values: RowValues, cats: ScreenSubcategory[]): SubcategoryPin[] {
  if (!isEngaged(values)) return [];
  return cats.map((c) => ({ subgroup: c.id, pct_of_total: val(values, c.id) }));
}

/** Saved pins back into row values. A stored 0 is a real entry and stays 0;
 *  a category missing from the payload is blank. */
export function fromSavedPins(pins: SubcategoryPin[], cats: ScreenSubcategory[]): RowValues {
  const by = new Map(pins.map((p) => [p.subgroup, p.pct_of_total]));
  const out: RowValues = {};
  for (const c of cats) out[c.id] = by.has(c.id) ? (by.get(c.id) as number) : null;
  return out;
}
