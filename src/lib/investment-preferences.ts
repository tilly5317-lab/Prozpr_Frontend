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

/** Round the engine's float recommendation to whole percents, letting the
 *  residual class (others) absorb the rounding error so it always sums to 100
 *  — the same convention as applyDividerDrag's second handle. */
export function roundMix(m: ClassMix): ClassMix {
  const equity = Math.round(m.equity);
  const debt = Math.round(m.debt);
  return { equity, debt, others: 100 - equity - debt };
}

type SubMap = Record<string, ScreenSubcategory>;

const classOfPin = (subById: SubMap) => (p: SubcategoryPin): Cls =>
  subById[p.subgroup]?.class ?? "others";

export function pinnedInClass(pins: SubcategoryPin[], subById: SubMap, cls: Cls): number {
  const cp = classOfPin(subById);
  return pins.filter((p) => cp(p) === cls).reduce((s, p) => s + p.pct_of_total, 0);
}

/** % of total still left for our picks inside a class (its share minus its pins). */
export function classRoom(mix: ClassMix, pins: SubcategoryPin[], subById: SubMap, cls: Cls): number {
  return mix[cls] - pinnedInClass(pins, subById, cls);
}

export function pinsValid(mix: ClassMix, pins: SubcategoryPin[], subById: SubMap): boolean {
  if (pins.some((p) => p.pct_of_total <= 0)) return false;
  return CLASSES.every((c) => pinnedInClass(pins, subById, c) <= mix[c] + 0.5);
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
