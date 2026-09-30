/** Preferences screen maths — pure, no React, no I/O.
 *  Every value is a share of the WHOLE portfolio, on whole percents. */
import type { ClassMix, ScreenSubcategory, SubcategoryPin, ScreenCurrentHolding } from "@/lib/api";

export type Cls = "equity" | "debt" | "others";
export const CLASSES: Cls[] = ["equity", "debt", "others"];
export const CLASS_LABEL: Record<Cls, string> = {
  equity: "Equity",
  debt: "Debt",
  others: "Commodity",
};
/** A class's name mid-sentence: "your 10% in debt". */
export const classWord = (cls: Cls): string => CLASS_LABEL[cls].toLowerCase();

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

/** Whole percents are this screen's unit of precision (revised 2026-09-26 from
 *  tenths): what the customer can type, what every figure is printed to, and what
 *  validation compares. Two percentages are only ever compared after both are on
 *  this grid — never with a raw epsilon. */
export const roundPct = (x: number): number => Math.round(x);

/** Round a set of numbers to whole numbers that still sum to `target`, giving the
 *  spare units to the largest fractional parts (largest-remainder). Its inputs
 *  already sum to ~`target`, so it only ever spreads a unit or two. */
function roundToSum(values: number[], target: number): number[] {
  const out = values.map((v) => Math.floor(v));
  let residual = Math.round(target - out.reduce((s, x) => s + x, 0));
  const byFrac = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; residual > 0 && byFrac.length; k++, residual--) out[byFrac[k % byFrac.length].i]++;
  return out;
}

/** Round a class mix to whole percents, letting the residual class (others)
 *  absorb the rounding error so it always sums to 100. */
export function roundMix(m: ClassMix): ClassMix {
  const equity = roundPct(m.equity);
  const debt = roundPct(m.debt);
  return { equity, debt, others: roundPct(100 - equity - debt) };
}

export const MULTI_ASSET_ID = "multi_asset";

/** Row inputs keyed by subgroup id. `null` = blank: a class whose rows are all
 *  blank follows Prozpr's split, and a blank multi-asset follows Prozpr's pick.
 *  This is the ONE shape the maths speaks; `SubcategoryPin[]` appears only at
 *  the wire boundary. */
export type RowValues = Record<string, number | null>;

/** What the screen needs from the backend beyond the customer's own numbers:
 *  the category catalog (with Prozpr's within-class weights) and the
 *  multi-asset fund's make-up, as percents. Neither is hardcoded here. */
export interface Catalog {
  cats: ScreenSubcategory[];
  comp: ClassMix;
}

const val = (values: RowValues, id: string): number => values[id] ?? 0;

/** A class's own categories — everything but the multi-asset fund. */
export function classRows(cats: ScreenSubcategory[], cls: Cls): ScreenSubcategory[] {
  return cats.filter((c) => c.class === cls && c.id !== MULTI_ASSET_ID);
}

/** What a multi-asset amount counts as in each class. Debt and commodity round
 *  to a whole percent; equity takes the rest, so the three always add back to
 *  the amount itself. */
export function multiAssetParts(amount: number, comp: ClassMix): ClassMix {
  const debt = roundPct((amount * comp.debt) / 100);
  const others = roundPct((amount * comp.others) / 100);
  return { equity: amount - debt - others, debt, others };
}

/** Whether `amount` in the fund takes class `c` past the customer's share of
 *  it. Zero means zero: any amount of the fund carries some of every class it
 *  holds, which whole percents can hide (1% of it is 0.25% debt → 0) — and the
 *  engine builds no fund at all for a mix with none of debt (`_sleeve_size`). */
const overflows = (c: Cls, amount: number, parts: ClassMix, mix: ClassMix, comp: ClassMix): boolean =>
  parts[c] > mix[c] || (amount > 0 && mix[c] === 0 && comp[c] > 0);

const fits = (amount: number, mix: ClassMix, comp: ClassMix): boolean => {
  const parts = multiAssetParts(amount, comp);
  return CLASSES.every((c) => !overflows(c, amount, parts, mix, comp));
};

/** The most multi-asset the mix can hold: the largest whole amount whose every
 *  part fits inside the customer's share of that class. */
export function maxMultiAsset(mix: ClassMix, comp: ClassMix): number {
  let amount = 100;
  while (amount > 0 && !fits(amount, mix, comp)) amount--;
  return amount;
}

/** The class whose share stops multi-asset going past `maxMultiAsset`, or null
 *  when nothing does (the fund fits at 100%). */
export function limitingClass(mix: ClassMix, comp: ClassMix): Cls | null {
  const max = maxMultiAsset(mix, comp);
  if (max >= 100) return null;
  const over = multiAssetParts(max + 1, comp);
  return CLASSES.find((c) => overflows(c, max + 1, over, mix, comp)) ?? null;
}

/** Divide `total` across `rows` in proportion to `weights`, on whole percents
 *  that add up to exactly `total` (largest remainder). With nothing to go by —
 *  every weight 0 — the rows share it evenly. */
function divide(rows: ScreenSubcategory[], weights: number[], total: number): RowValues {
  const sum = weights.reduce((s, w) => s + w, 0);
  const shares = sum > 0 ? weights.map((w) => (w / sum) * total) : rows.map(() => total / rows.length);
  const whole = roundToSum(shares, total);
  const out: RowValues = {};
  rows.forEach((r, i) => { out[r.id] = whole[i]; });
  return out;
}

/** Prozpr's split of `total` across a class's rows: our within-class weights
 *  applied to what the customer has left in that class. */
export function prozprSplit(rows: ScreenSubcategory[], total: number): RowValues {
  return divide(rows, rows.map((r) => r.weight_in_class ?? 0), total);
}

/** A class the customer has set: any of its rows holds a number. A zero counts
 *  — stepped down to on purpose — so a group whose every row reaches 0 stays
 *  the customer's instead of jumping back to Prozpr's split. */
function isSet(rows: ScreenSubcategory[], values: RowValues): boolean {
  return rows.some((r) => values[r.id] != null);
}

/** Everything the screen shows, derived from what the customer set. */
export interface Resolved {
  /** The most multi-asset the mix can hold. */
  limit: number;
  /** Multi-asset as held: the customer's pick (or Prozpr's), capped at `limit`. */
  multiAsset: number;
  /** Prozpr's pick, capped at `limit`. */
  prozprMultiAsset: number;
  /** What `multiAsset` counts as in each class. */
  parts: ClassMix;
  /** Each class's share left for its own categories: mix − parts. */
  remainder: ClassMix;
  /** Every category's value, multi-asset included — complete, never blank. */
  rows: RowValues;
  /** Prozpr's split of each class's remainder. */
  prozprRows: RowValues;
  /** Classes the customer set whose rows no longer add up to their remainder. */
  unbalanced: Cls[];
}

/** The single derivation behind every screen: cap multi-asset at what the mix
 *  can hold, then fill each class's categories. A class the customer has not
 *  set follows Prozpr's split of what is left. A class they have set keeps
 *  their numbers exactly — nothing is rescaled to fit, so when its share moves
 *  it can stop adding up, and is listed in `unbalanced` for the customer to
 *  fix. */
export function resolve(mix: ClassMix, values: RowValues, catalog: Catalog): Resolved {
  const { cats, comp } = catalog;
  const limit = maxMultiAsset(mix, comp);
  const prozprMultiAsset = Math.min(recommendedValues(cats)[MULTI_ASSET_ID] ?? 0, limit);
  const own = values[MULTI_ASSET_ID];
  const multiAsset = own == null ? prozprMultiAsset : Math.min(own, limit);
  const parts = multiAssetParts(multiAsset, comp);
  const remainder = {} as ClassMix;
  const rows: RowValues = { [MULTI_ASSET_ID]: multiAsset };
  const prozprRows: RowValues = { [MULTI_ASSET_ID]: prozprMultiAsset };
  const unbalanced: Cls[] = [];
  for (const cls of CLASSES) {
    remainder[cls] = mix[cls] - parts[cls];
    const cr = classRows(cats, cls);
    const split = prozprSplit(cr, remainder[cls]);
    Object.assign(prozprRows, split);
    if (isSet(cr, values)) {
      cr.forEach((r) => { rows[r.id] = val(values, r.id); });
      if (cr.reduce((sum, r) => sum + val(values, r.id), 0) !== remainder[cls]) unbalanced.push(cls);
    } else {
      Object.assign(rows, split);
    }
  }
  return { limit, multiAsset, prozprMultiAsset, parts, remainder, rows, prozprRows, unbalanced };
}

/** Whether `list`'s categories sit exactly on Prozpr's split. */
export function matchesProzpr(rows: RowValues, prozprRows: RowValues, list: ScreenSubcategory[]): boolean {
  return list.every((r) => rows[r.id] === prozprRows[r.id]);
}

/** Hand back to Prozpr whatever already equals Prozpr's numbers, so it follows
 *  Prozpr exactly from then on.
 *
 *  A class (of `classes`) on Prozpr's split is blanked: rescaling the same
 *  numbers as "the customer's" would round a point away from Prozpr's the next
 *  time the mix moves. A fund pick equal to Prozpr's own recommendation is
 *  blanked too — the limit caps both alike, so nothing on screen changes, but
 *  a pick stepped away and back no longer counts as a change to save. */
export function followProzprWhereMatching(
  mix: ClassMix, values: RowValues, catalog: Catalog, classes: Cls[] = CLASSES,
): RowValues {
  const res = resolve(mix, values, catalog);
  const out: RowValues = { ...values };
  if (out[MULTI_ASSET_ID] === recommendedValues(catalog.cats)[MULTI_ASSET_ID]) out[MULTI_ASSET_ID] = null;
  for (const cls of classes) {
    const cr = classRows(catalog.cats, cls);
    if (matchesProzpr(res.rows, res.prozprRows, cr)) cr.forEach((r) => { out[r.id] = null; });
  }
  return out;
}

/** Engaged = the customer has set at least one value. A zero counts: it is a
 *  deliberate "none of this", not an absence. */
export function isEngaged(values: RowValues): boolean {
  return Object.values(values).some((v) => v != null);
}

/** Prozpr's recommendation as row values. The backend sends each figure on the
 *  tenth grid; this screen is whole-percent, so the set is rounded to integers
 *  summing to 100 (largest-remainder). */
export function recommendedValues(cats: ScreenSubcategory[]): RowValues {
  const rounded = roundToSum(cats.map((c) => c.recommended_pct_of_total), 100);
  const out: RowValues = {};
  cats.forEach((c, i) => { out[c.id] = rounded[i]; });
  return out;
}

/** The class mix a complete set of row values implies — the look-through, with
 *  the multi-asset fund split by its make-up. One function gives Prozpr's and
 *  today's class figures, so the two stay comparable. Its callers pass whole
 *  numbers summing to 100, so the result does too. */
export function lookThroughMix(values: RowValues, catalog: Catalog): ClassMix {
  const parts = multiAssetParts(val(values, MULTI_ASSET_ID), catalog.comp);
  const own = (cls: Cls) => classRows(catalog.cats, cls).reduce((s, r) => s + val(values, r.id), 0);
  return { equity: parts.equity + own("equity"), debt: parts.debt + own("debt"), others: parts.others + own("others") };
}

/** Prozpr's rows as a class mix — what Reset to Prozpr sets. */
export function recommendedMix(catalog: Catalog): ClassMix {
  return lookThroughMix(recommendedValues(catalog.cats), catalog);
}

/** Today's holdings as row values, or null when the customer holds nothing
 *  here — absent, empty and all-zero payloads alike, since a set of zeros is
 *  not a mix anyone holds. Every settable category is present and
 *  one the customer holds none of reads 0: today is a complete fact, which is
 *  exactly what `fromSavedPins`'s nullable blank is not.
 *
 *  Rounding each holding independently can leave the set a point short of or
 *  over 100, which the Today column would print as a mix adding up to 99 or
 *  101, so the set is put back on exactly 100, in proportion. */
export function fromCurrentHoldings(
  holdings: ScreenCurrentHolding[],
  cats: ScreenSubcategory[],
): RowValues | null {
  const by = new Map(holdings.map((h) => [h.subgroup, h.pct_of_total]));
  const raw = cats.map((c) => by.get(c.id) ?? 0);
  return raw.some((v) => v > 0) ? divide(cats, raw, 100) : null;
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

/** The save payload. EMPTY while the customer has set nothing (engine
 *  decides); otherwise COMPLETE — every category at the number shown (`rows`,
 *  from `resolve`). An omitted row would read to the engine as "you decide". */
export function toSavePins(values: RowValues, rows: RowValues, cats: ScreenSubcategory[]): SubcategoryPin[] {
  if (!isEngaged(values)) return [];
  return cats.map((c) => ({ subgroup: c.id, pct_of_total: val(rows, c.id) }));
}

/** Saved pins back into row values, on the whole-percent grid. A stored 0 is a
 *  real entry and stays 0; a category missing from the payload is blank. */
export function fromSavedPins(pins: SubcategoryPin[], cats: ScreenSubcategory[]): RowValues {
  const by = new Map(pins.map((p) => [p.subgroup, p.pct_of_total]));
  const out: RowValues = {};
  for (const c of cats) out[c.id] = by.has(c.id) ? roundPct(by.get(c.id) as number) : null;
  return out;
}
