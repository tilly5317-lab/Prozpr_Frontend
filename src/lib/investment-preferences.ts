/** S4 percentage preferences — pure bar math + validation. No React, no I/O.
 *  Every value is a share of the WHOLE portfolio; the backend owns %-of-class. */
import type { ClassMix, ScreenSubcategory, SubcategoryPin, ScreenCurrentHolding } from "@/lib/api";

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

/** The class word a group header already carries, so a row underneath it need
 *  not repeat it. The backend's labels are written for prose — "Your large-cap
 *  equity sits at ₹4.2L today" — which is why they are lowercase and carry the
 *  suffix; as standalone row labels they read wrong on both counts. */
const CLASS_SUFFIX: Record<Cls, string> = { equity: "equity", debt: "debt", others: "" };

/** A category's label as a row heading: the redundant class word dropped, first
 *  letter capitalised, everything else left exactly as the backend wrote it —
 *  "US" and "ELSS (tax-saver)" must survive untouched. This reads the class the
 *  backend already assigned; it never decides one. */
export function shortLabel(cat: ScreenSubcategory): string {
  const suffix = CLASS_SUFFIX[cat.class];
  let s = cat.label.trim();
  if (suffix && s.toLowerCase().endsWith(` ${suffix}`)) s = s.slice(0, -(suffix.length + 1)).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}


const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Drag a divider inside the bar. Handle 1 = the equity|debt boundary (trades
 *  equity↔debt, commodity fixed); handle 2 = the debt|commodity boundary
 *  (trades commodity↔debt, equity fixed). Integer %s, always summing to 100. */
export function applyDividerDrag(mix: ClassMix, handle: 1 | 2, posPct: number): ClassMix {
  const x = Math.round(clamp(posPct));
  // Every result is snapped with round1. The mix arrives on the one-decimal grid
  // (a recommendation is 62.1 / 28 / 9.9), and debt is the derived residual on
  // BOTH handles — so a bare subtraction returns 29.099999999999994 and puts
  // that on the screen and on the wire.
  if (handle === 1) {
    const cap = round1(mix.equity + mix.debt); // the second divider — handle 1 can't cross it
    const equity = round1(Math.min(x, cap));
    return { equity, debt: round1(cap - equity), others: mix.others };
  }
  const floor = mix.equity; // the first divider — handle 2 can't cross it
  const cum = round1(Math.max(x, floor)); // equity + debt cumulative
  return { equity: mix.equity, debt: round1(cum - floor), others: round1(100 - cum) };
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

/** The largest multi-asset entry the bar can actually fund. The sleeve draws
 *  65/25/10, so the scarcest class sets the ceiling — capping the slider here is
 *  what makes an overdrawn class impossible rather than an error to report. */
export function maxMultiAsset(mix: ClassMix): number {
  const ratio = Math.min(
    ...CLASSES.map((c) => mix[c] / MULTI_ASSET_SPLIT[c]),
  );
  let cap = Math.min(100, Math.floor(ratio * 10) / 10);
  // The exact ratio is not enough: multiAssetDraw rounds debt and commodity to a
  // tenth and hands equity the residual, so the cap can still overdraw a class
  // by a tenth. Step down until every class is fundable at the published cap.
  while (cap > 0 && CLASSES.some((c) => classBudget(mix, { [MULTI_ASSET_ID]: cap }, c) < 0)) {
    cap = round1(cap - 0.1);
  }
  return cap;
}


/** The budget a class group's own rows must fill: its share on the bar, minus
 *  whatever multi-asset already draws from it. Rounded — this IS the number the
 *  header prints, so typing it always balances the class. */
export function classBudget(mix: ClassMix, values: RowValues, cls: Cls): number {
  return round1(mix[cls] - multiAssetDraw(values, cls));
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

/** Spread `budget` across `rows` in proportion to what they hold now, writing
 *  into `out`.
 *
 *  This is the one place the screen knows how to divide a budget. A set that is
 *  entirely zero has no proportions left to preserve, so the whole budget parks
 *  on the first row, where it stays reachable instead of stranded; and eleven
 *  independent roundings do not land on the budget, so the residual is
 *  distributed across rows starting from the largest, where a tenth is least
 *  visible — never clipped, ensuring the sum is always exactly `budget` on the
 *  one-decimal grid (spec §7.2). */
function spread(out: RowValues, rows: ScreenSubcategory[], budget: number): void {
  if (rows.length === 0) return;
  const total = rows.reduce((s, r) => s + val(out, r.id), 0);
  if (total <= 0) {
    rows.forEach((r, i) => {
      out[r.id] = i === 0 ? budget : 0;
    });
    return;
  }

  let sum = 0;
  for (const r of rows) {
    out[r.id] = round1((val(out, r.id) / total) * budget);
    sum = round1(sum + val(out, r.id));
  }
  const residual = round1(budget - sum);
  if (residual !== 0) {
    // Distribute the residual across rows largest-first so adjustments are least
    // visible. This is the only place that corrects rounding errors, so the sum
    // must ALWAYS reach exactly budget, never clipped.
    const rowIds = rows.map(r => r.id).sort((a, b) => val(out, b) - val(out, a));
    let remaining = residual;
    for (const id of rowIds) {
      if (remaining === 0) break;
      const current = val(out, id);
      // Adjust as much of the remaining correction as this row can absorb without
      // going negative. If the residual is negative (over-allocated), this takes
      // from multiple rows if the first one is too small.
      const adjustment = Math.max(-current, remaining);
      out[id] = round1(current + adjustment);
      remaining = round1(remaining - adjustment);
    }
  }
}

/** Put the distribution back on the bar. Every class's rows are rescaled — in
 *  proportion, so the shape the customer chose survives — to sum EXACTLY to that
 *  class's budget, and multi-asset is clamped to what the bar can fund.
 *
 *  This is the invariant's single home. The class bars can only ever trade
 *  within a budget, so the only things that can break the sum are the two that
 *  move a budget: dragging the top bar, and moving the multi-asset slider. Both
 *  run through here, which is why no screen state for "over" or "under" exists.
 */
export function normalise(mix: ClassMix, values: RowValues, cats: ScreenSubcategory[]): RowValues {
  const out: RowValues = { ...values };
  if (out[MULTI_ASSET_ID] != null) {
    out[MULTI_ASSET_ID] = Math.min(round1(out[MULTI_ASSET_ID]), maxMultiAsset(mix));
  }
  for (const cls of CLASSES) {
    const rows = cats.filter((c) => c.id !== MULTI_ASSET_ID && c.class === cls);
    spread(out, rows, Math.max(0, classBudget(mix, out, cls)));
  }
  return out;
}

/** Every segment gets at least this share of the bar, so a 0% row still renders
 *  a grabbable sliver instead of nothing — otherwise its two dividers stack on
 *  one pixel and, at either end of a class, sit on the bar's own edge where they
 *  read as end caps. Capped in aggregate so a long class list cannot distort the
 *  bar: with more than eight rows the floor shrinks instead. */
const MIN_SEGMENT_SHARE = 1.5;
const MAX_FLOOR_BUDGET = 12;

/** Display widths for one class's segments, as percentages of the bar summing to
 *  100. Rows below the floor are lifted to it and the shortfall is taken from
 *  the rows above it, in proportion — so the big segments stay within a point or
 *  two of their true share and only the invisible ones are distorted.
 *
 *  This is the ONE place a bar stops being literally proportional. The printed
 *  numbers remain the truth; `sharePosToValue` inverts this so a drag still
 *  lands on the value the customer sees under their finger.
 *
 *  Shared by both bars on the screen: the class bars (via `segmentLayout`) and
 *  the Equity/Debt/Commodity bar at the top, which had the same handles-on-top
 *  -of-each-other problem. */
export function flooredShares(values: number[], total: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  // A bar funded with nothing draws an empty track. Equal slivers would read as
  // an even split, which is the opposite of what is true.
  if (total <= 0) return values.map(() => 0);

  const floor = Math.min(MIN_SEGMENT_SHARE, MAX_FLOOR_BUDGET / n);
  const shares = values.map((v) => (v / total) * 100);
  const need = shares.reduce((s, x) => s + Math.max(0, floor - x), 0);
  const pool = shares.reduce((s, x) => s + (x > floor ? x : 0), 0);
  // Guard, not a normal path: a balanced set always has entries above the floor.
  // Without it an all-zero set at a positive total divides by zero.
  if (pool <= need) return values.map(() => 100 / n);

  const scale = (pool - need) / pool;
  return shares.map((x) => (x > floor ? x * scale : floor));
}

/** `flooredShares` for a class's rows. */
export function segmentLayout(
  rows: ScreenSubcategory[], values: RowValues, budget: number,
): number[] {
  return flooredShares(rows.map((r) => val(values, r.id)), budget);
}

/** A position along a bar (0-100) back to a position in value space, walking
 *  the same segments `flooredShares` drew. Piecewise-linear and monotonic, so a
 *  boundary maps to exactly that row's cumulative value and a drag never jumps
 *  backwards. A floored row is a flat step: its sliver of bar carries no value,
 *  which is precisely what makes it safe to draw. */
export function sharePosToValue(values: number[], total: number, displayPct: number): number {
  const widths = flooredShares(values, total);
  const p = Math.max(0, Math.min(100, displayPct));
  let accDisplay = 0;
  let accValue = 0;
  for (let i = 0; i < values.length; i++) {
    const w = widths[i];
    if (p <= accDisplay + w) {
      return round1(accValue + (w > 0 ? ((p - accDisplay) / w) * values[i] : 0));
    }
    accDisplay += w;
    accValue += values[i];
  }
  return total;
}

/** `sharePosToValue` for a class's rows. */
export function barPosToValue(
  rows: ScreenSubcategory[], values: RowValues, budget: number, displayPct: number,
): number {
  return sharePosToValue(rows.map((r) => val(values, r.id)), budget, displayPct);
}


/** Drag the divider that sits after `rows[handle - 1]`. It trades those two
 *  neighbours and nothing else, clamped by the dividers on either side — so the
 *  class total is untouched by construction, exactly like applyDividerDrag on
 *  the bar above. `posPct` is a position along the bar, which spans `budget`. */
export function applySegmentDrag(
  rows: ScreenSubcategory[], values: RowValues, budget: number, handle: number, posPct: number,
): RowValues {
  const cum = (k: number) => round1(rows.slice(0, k).reduce((s, r) => s + val(values, r.id), 0));
  const floor = cum(handle - 1);
  const ceiling = cum(handle + 1);
  const target = round1((Math.max(0, Math.min(100, posPct)) / 100) * budget);
  const at = Math.max(floor, Math.min(ceiling, target));
  return {
    ...values,
    [rows[handle - 1].id]: round1(at - floor),
    [rows[handle].id]: round1(ceiling - at),
  };
}

/** A typed value for one row, with its SIBLINGS in the same class rescaled in
 *  proportion to absorb the difference. Clamped to `[0, budget]`, so the class
 *  total — and therefore the bar above it — is unchanged by construction
 *  (spec §7.2, revised 2026-09-20). Typing is a second way to reach the value a
 *  drag reaches, never a way to spend one class's budget on another.
 *
 *  It is a far LARGER gesture than a drag, which only ever trades with the
 *  immediate neighbour: typing 24 into a six-row class with a 25 budget
 *  collapses the other five. That is why the field clamps as the customer types
 *  and the rows that moved flash (spec D7) — the maths here is the easy half. */
export function applyTypedEntry(
  rows: ScreenSubcategory[],
  values: RowValues,
  budget: number,
  rowId: string,
  typed: number,
): RowValues {
  const cap = Math.max(0, budget);
  const v = round1(Math.max(0, Math.min(cap, typed)));
  const out: RowValues = { ...values, [rowId]: v };
  spread(out, rows.filter((r) => r.id !== rowId), round1(cap - v));
  return out;
}


/** Engaged = the customer has entered at least one value. A zero counts: it is a
 *  deliberate "none of this", not an absence (spec §4.3). */
export function isEngaged(values: RowValues): boolean {
  return Object.values(values).some((v) => v != null);
}

/** Prozpr's recommendation as row values. The backend already rounds each figure
 *  to one decimal, so this is a straight read. */
export function recommendedValues(cats: ScreenSubcategory[]): RowValues {
  const out: RowValues = {};
  for (const c of cats) out[c.id] = c.recommended_pct_of_total;
  return out;
}

/** The class bar a complete set of row values implies — the look-through, with
 *  the multi-asset fund split 65/25/10. Deriving a bar FROM its rows is what
 *  lets Reset land balanced instead of accusing Prozpr's own recommendation of
 *  overdrawing the bar, and it is what makes "today" comparable with the other
 *  two bars: one function draws all three (spec §3.2). */
export function lookThroughMix(values: RowValues, cats: ScreenSubcategory[]): ClassMix {
  const equity = round1(multiAssetDraw(values, "equity") + classAllocated(values, cats, "equity"));
  const debt = round1(multiAssetDraw(values, "debt") + classAllocated(values, cats, "debt"));
  return { equity, debt, others: round1(100 - equity - debt) };
}

/** Prozpr's rows as a bar. Kept as its own name because Reset and the reference
 *  bar both ask for exactly this one, and neither should have to know that "the
 *  recommendation" is just another set of row values. */
export function recommendedMix(cats: ScreenSubcategory[]): ClassMix {
  return lookThroughMix(recommendedValues(cats), cats);
}

/** Today's holdings as row values. Every settable category is present and one
 *  the customer holds nothing of reads 0 — today is a complete fact, which is
 *  exactly what `fromSavedPins`'s nullable blank is not. */
export function fromCurrentHoldings(
  holdings: ScreenCurrentHolding[],
  cats: ScreenSubcategory[],
): RowValues {
  const by = new Map(holdings.map((h) => [h.subgroup, h.pct_of_total]));
  const out: RowValues = {};
  for (const c of cats) out[c.id] = round1(by.get(c.id) ?? 0);
  return out;
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
