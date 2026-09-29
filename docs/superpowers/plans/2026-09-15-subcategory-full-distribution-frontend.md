# Subcategory Full Distribution — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Invest ▸ Preferences "FINE-TUNE · OPTIONAL" partial-pin UI with a complete distribution the customer owns — every class summing exactly to its share on the bar above.

**Architecture:** All validation lives in the pure `src/lib/investment-preferences.ts` module (no React, no I/O), tested standalone. Components consume it and stay presentational. The multi-asset row sits outside the three class groups because it draws on all three budgets at once.

**Tech Stack:** Vite + React 18 + TypeScript + shadcn/ui + Tailwind. Tests: vitest (`npm test`). Dev server via the preview tooling, `.claude/launch.json` entry `frontend`, port 8080.

**Spec:** `docs/superpowers/specs/2026-09-15-subcategory-full-distribution-frontend-design.md`
**Paired backend spec:** `../Prozpr_Backend/docs/superpowers/specs/2026-09-15-subcategory-full-distribution-backend-design.md`

*Revised 2026-09-15 after a full audit of v1. The changes are recorded in "What changed from v1" at the foot of this document — read it if you saw the earlier version.*

## Global Constraints

- **The backend is not implemented yet.** Build to the target contract. Today's API rejects `pct_of_total: 0` and filters zeros out of `saved.pins`. Do not "fix" the frontend to match current API behaviour.
- **Every value is a share of the WHOLE portfolio**, never of its class.
- **One decimal place is the unit of precision.** Everything the customer types, everything the screen prints, and everything validation compares lives on the 0.1 grid. Never compare two percentages with a raw epsilon — see Task 1.
- **Verified facts you can rely on** (checked against the backend on 2026-09-15, do not re-derive):
  - The catalog's `recommended_pct_of_total` values are **already rounded to one decimal** by the backend (`screen_preference_service.subcategory_catalog`). They are rounded *independently*, so the eleven can sum to 99.9 or 100.1 rather than exactly 100. Task 1 absorbs that.
  - The catalog covers the **whole** portfolio. ELSS and direct stocks are excluded from it, but the screen's path passes no `CorpusPin`, so `elss_corpus` and `non_mf_equity_corpus` are both `0.0` and the frozen rows are never produced. There is no hidden slice to account for. (The risk that this changes is backend spec §11's, not this plan's.)
  - There is **no client-side guard rejecting `pct_of_total: 0`**. `SubcategoryPin.pct_of_total` is typed `number`, so nothing on the client has to change for zeros. The one `api.ts` edit in this plan is the optional `carve_outs_at_risk` field in Task 6.
  - `@testing-library/user-event` is **not installed**. Use `fireEvent`, like every existing test in this repo.
  - **`npx tsc --noEmit` is a no-op here** and always exits 0. `tsconfig.json` is solution-style (`"files": []` + project references), so the bare invocation checks nothing. The real check is `npx tsc -p tsconfig.app.json --noEmit`. Found the hard way in Task 1.
- **Do not run a dev server via bash** — use the preview tooling.
- **Do not `git commit` or `git add`** unless the user explicitly asks.
- **Nothing is gated.** Spec §5.2 and §13.1 were both answered on 2026-09-15 and are written into Task 7; the carve-out copy is written into Task 6. All seven tasks are buildable.
- Branch: `central_investment_preferences`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/investment-preferences.ts` | **Modify.** All budget maths + validation. Pure. |
| `src/lib/investment-preferences.test.ts` | **Modify.** Unit tests for the above. |
| `src/components/invest/MultiAssetRow.tsx` | **Create.** The multi-asset input + its three-class breakdown. |
| `src/components/invest/MultiAssetRow.test.tsx` | **Create.** |
| `src/components/invest/SubcategoryPins.tsx` | **Rewrite.** Class groups, per-row inputs, live budget headers. |
| `src/components/invest/SubcategoryPins.test.tsx` | **Rewrite.** |
| `src/pages/InvestPreferences.tsx` | **Modify.** Sticky footer, save gating, cleared state, payload assembly. |
| `src/pages/InvestPreferences.test.tsx` | **Modify.** |
| `src/components/invest/ClassDistributionBars.tsx` | **Create** (Task 7). Yours-vs-Prozpr bars per class group. |
| `src/components/invest/ClassDistributionBars.test.tsx` | **Create** (Task 7). |
| `src/lib/api.ts` | **Modify** (Task 6). One optional field: `carve_outs_at_risk`. |

`src/components/invest/AssetMixBar.tsx` is **not** modified. Its drag and keyboard handlers keep snapping to whole numbers; the bar simply becomes able to *hold* a one-decimal value when we seed it. `applyDividerDrag` already preserves that — dragging a 78.3/13.9/7.8 bar yields 78/14.2/7.8, still totalling 100.

---

### Task 1: Budget maths on the one-decimal grid

**Files:**
- Modify: `src/lib/investment-preferences.ts`
- Test: `src/lib/investment-preferences.test.ts`

**Interfaces:**
- Consumes: `ClassMix`, `ScreenSubcategory`, `SubcategoryPin` from `@/lib/api` (already imported).
- Produces: `round1`, `MULTI_ASSET_ID`, `MULTI_ASSET_SPLIT`, `RowValues`, `multiAssetDraw`, `classBudget`, `classAllocated`, `classStatus`, `ClassStatus`, `ClassState`, `multiAssetOverdraw`, `isEngaged`, `distributionValid`, `recommendedValues`, `recommendedMix`, `resetValues`. Tasks 3–5 consume these.
- Changes: `roundMix` rounds to **one decimal** instead of whole numbers.
- Removes: `pinsValid`, `classRoom`, `pinnedInClass` — all three ignore the multi-asset draw, and their only consumers are rewritten in Tasks 4–5.

**Why this shape.** Two numbers have to agree exactly: the budget a class's rows must fill, and what the customer typed into them. v1 computed the budget as a raw float and compared it with a `0.05` tolerance. That produced headers reading `12.8 of 12.8% · 0.1% over` (the printed numbers match, the verdict says they don't) and twelve budgets on a 78/14/8 bar that no one-decimal entry could hit. The fix is to put the budget on the same grid as the input: round it to one decimal *before* anyone sees it or compares it, so the number on the header is literally the number to type. There is then no tolerance constant at all — `delta === 0` is exact.

- [ ] **Step 1: Write the failing tests**

Replace the `classRoom` / `pinsValid` imports and their `describe` blocks in `src/lib/investment-preferences.test.ts` with the following. Keep the existing `applyDividerDrag`, `sameMix` and `samePins` blocks untouched; **update the `roundMix` block** — it now rounds to one decimal.

```ts
import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import {
  classAllocated, classBudget, classStatus, distributionValid, isEngaged,
  multiAssetDraw, multiAssetOverdraw, recommendedMix, resetValues, round1,
  roundMix, type RowValues,
} from "@/lib/investment-preferences";

const CATS: ScreenSubcategory[] = [
  { id: "multi_asset",           class: "equity", label: "Multi-Asset",  recommended_pct_of_total: 20 },
  { id: "low_beta_equities",     class: "equity", label: "Large-cap",    recommended_pct_of_total: 30 },
  { id: "short_debt",            class: "debt",   label: "Short Debt",   recommended_pct_of_total: 20 },
  { id: "arbitrage",             class: "debt",   label: "Arbitrage",    recommended_pct_of_total: 0 },
  { id: "gold_commodities",      class: "others", label: "Gold",         recommended_pct_of_total: 30 },
];
const BAR: ClassMix = { equity: 43, debt: 25, others: 32 };

describe("roundMix now keeps one decimal", () => {
  it("rounds to a tenth and lets others absorb the residual", () => {
    expect(roundMix({ equity: 72.02, debt: 21.36, others: 6.61 }))
      .toEqual({ equity: 72, debt: 21.4, others: 6.6 });
  });
  it("always sums to 100", () => {
    const m = roundMix({ equity: 72.44, debt: 21.34, others: 6.22 });
    expect(round1(m.equity + m.debt + m.others)).toBe(100);
  });
  it("leaves an already-whole mix unchanged", () => {
    expect(roundMix({ equity: 72, debt: 18, others: 10 }))
      .toEqual({ equity: 72, debt: 18, others: 10 });
  });
});

describe("multiAssetDraw", () => {
  it("splits an entry 65/25/10 across the classes", () => {
    const v: RowValues = { multi_asset: 20 };
    expect(multiAssetDraw(v, "equity")).toBe(13);
    expect(multiAssetDraw(v, "debt")).toBe(5);
    expect(multiAssetDraw(v, "others")).toBe(2);
  });

  it("keeps the three draws adding back to what was typed", () => {
    // 5.0 splits to 3.25 / 1.25 / 0.50 — equity carries the rounding residual
    // so the three printed figures still total 5.0 and not 5.1.
    const v: RowValues = { multi_asset: 5 };
    expect(multiAssetDraw(v, "debt")).toBe(1.3);
    expect(multiAssetDraw(v, "others")).toBe(0.5);
    expect(multiAssetDraw(v, "equity")).toBe(3.2);
    expect(round1(3.2 + 1.3 + 0.5)).toBe(5);
  });

  it("is zero when multi-asset is blank", () => {
    expect(multiAssetDraw({}, "equity")).toBe(0);
  });
});

describe("classBudget", () => {
  it("nets each class down by its draw, on the one-decimal grid", () => {
    const v: RowValues = { multi_asset: 20 };
    expect(classBudget(BAR, v, "equity")).toBe(30);
    expect(classBudget(BAR, v, "debt")).toBe(20);
    expect(classBudget(BAR, v, "others")).toBe(30);
  });

  it("is always reachable by typing the number it returns", () => {
    // The bug this replaces: a raw budget of 12.75 printed as "12.8" that
    // neither 12.7 nor 12.8 could satisfy.
    const bar: ClassMix = { equity: 78, debt: 14, others: 8 };
    for (let k = 1; k <= 200; k++) {
      const v: RowValues = { multi_asset: k / 10 };
      const budget = classBudget(bar, v, "debt");
      if (budget < 0) continue;
      expect(classStatus(bar, { ...v, short_debt: budget }, CATS, "debt").state).toBe("balanced");
    }
  });

  it("flags the class a too-large multi-asset entry overdraws", () => {
    expect(multiAssetOverdraw({ equity: 88, debt: 4, others: 8 }, { multi_asset: 20 })).toBe("debt");
    expect(multiAssetOverdraw(BAR, { multi_asset: 20 })).toBeNull();
  });
});

describe("classAllocated excludes multi-asset", () => {
  it("counts only the class's own rows", () => {
    expect(classAllocated({ multi_asset: 20, low_beta_equities: 30 }, CATS, "equity")).toBe(30);
  });
  it("reads a blank row as zero", () => {
    expect(classAllocated({ low_beta_equities: null }, CATS, "equity")).toBe(0);
  });
});

describe("classStatus", () => {
  const v = (eq: number): RowValues => ({ multi_asset: 20, low_beta_equities: eq });
  it("is under when the rows do not fill the budget", () => {
    expect(classStatus(BAR, v(24), CATS, "equity")).toMatchObject({ state: "under", delta: -6 });
  });
  it("is over when they exceed it", () => {
    expect(classStatus(BAR, v(36), CATS, "equity")).toMatchObject({ state: "over", delta: 6 });
  });
  it("is balanced on an exact match — no tolerance involved", () => {
    expect(classStatus(BAR, v(30), CATS, "equity")).toMatchObject({ state: "balanced", delta: 0 });
  });
});

describe("isEngaged", () => {
  it("is false when every row is blank", () => {
    expect(isEngaged({})).toBe(false);
    expect(isEngaged({ multi_asset: null, gold_commodities: null })).toBe(false);
  });
  it("treats a zero as a real entry, not as absent", () => {
    expect(isEngaged({ gold_commodities: 0 })).toBe(true);
  });
});

describe("distributionValid", () => {
  const complete: RowValues = {
    multi_asset: 20, low_beta_equities: 30, short_debt: 20, gold_commodities: 30,
  };
  it("accepts a distribution where every class balances", () => {
    expect(distributionValid(BAR, complete, CATS)).toBe(true);
  });
  it("rejects one where a single class is short", () => {
    expect(distributionValid(BAR, { ...complete, short_debt: 19 }, CATS)).toBe(false);
  });
  it("rejects an untouched distribution", () => {
    expect(distributionValid(BAR, {}, CATS)).toBe(false);
  });
});

describe("Reset to Prozpr lands balanced by construction", () => {
  const withTotal = (nudge: number): ScreenSubcategory[] =>
    CATS.map((c) => c.id === "low_beta_equities"
      ? { ...c, recommended_pct_of_total: round1(c.recommended_pct_of_total + nudge) } : c);

  // The backend rounds each row to one decimal INDEPENDENTLY, so the catalog
  // can sum to 99.9 or 100.1. Reset has to balance in all three cases.
  it.each([-0.1, 0, 0.1])("balances when the catalog is nudged by %s", (nudge) => {
    const cats = withTotal(nudge);
    const mix = recommendedMix(cats);
    expect(round1(mix.equity + mix.debt + mix.others)).toBe(100);
    expect(distributionValid(mix, resetValues(cats, mix), cats)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- investment-preferences`
Expected: FAIL — `round1 is not a function`, `multiAssetDraw is not a function`, and the `roundMix` block failing on `{equity: 72, debt: 21, others: 7}` vs the new one-decimal expectation.

- [ ] **Step 3: Implement**

In `src/lib/investment-preferences.ts`: **delete `pinnedInClass`, `classRoom` and `pinsValid`**, replace `roundMix`, and append the rest. Keep `applyDividerDrag`, `sameMix` and `samePins` exactly as they are.

```ts
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
export const MULTI_ASSET_SPLIT: Record<Cls, number> = { equity: 0.65, debt: 0.25, others: 0.1 };

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
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test -- investment-preferences`
Expected: PASS, including the 200-iteration reachability loop and all three catalog-total cases.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p tsconfig.app.json --noEmit`
Expected: errors only in `SubcategoryPins.tsx` and `InvestPreferences.tsx`, where `classRoom` / `pinnedInClass` / `pinsValid` were consumed. Those files are rewritten in Tasks 4 and 5; the repo is green again at the end of Task 5.

---

### Task 2: The save payload — every settable row, zeros included

**Files:**
- Modify: `src/lib/investment-preferences.ts`
- Test: `src/lib/investment-preferences.test.ts`

**Interfaces:**
- Produces: `toSavePins`, `fromSavedPins`. Task 5 consumes both.

This is the single most bug-prone rule in the feature: an **omitted** row reads to the engine as *"unpinned, you decide"*, which silently reinstates partial pinning. Blank means zero, and zero has to be on the wire to mean it (spec §9).

- [ ] **Step 1: Write the failing tests**

```ts
import { toSavePins, fromSavedPins } from "@/lib/investment-preferences";

describe("toSavePins", () => {
  it("sends EVERY settable row once engaged, blanks as explicit zeros", () => {
    const out = toSavePins({ multi_asset: 20, low_beta_equities: 30 }, CATS);
    expect(out).toHaveLength(CATS.length);
    expect(out.find((p) => p.subgroup === "gold_commodities"))
      .toEqual({ subgroup: "gold_commodities", pct_of_total: 0 });
  });

  it("sends nothing at all when untouched", () => {
    expect(toSavePins({}, CATS)).toEqual([]);
    expect(toSavePins({ multi_asset: null }, CATS)).toEqual([]);
  });

  it("round-trips through fromSavedPins", () => {
    const back = fromSavedPins(
      toSavePins({ multi_asset: 20, low_beta_equities: 30, gold_commodities: 0 }, CATS), CATS);
    expect(back.multi_asset).toBe(20);
    expect(back.gold_commodities).toBe(0);   // a saved zero stays a zero, not a blank
  });

  it("reads an empty saved payload back as all blanks", () => {
    expect(fromSavedPins([], CATS)).toEqual({
      multi_asset: null, low_beta_equities: null, short_debt: null,
      arbitrage: null, gold_commodities: null,
    });
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npm test -- investment-preferences`
Expected: FAIL — `toSavePins is not a function`.

- [ ] **Step 3: Implement**

```ts
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
```

`isEngaged` is reused here rather than a second `cats.some(...)` check — one definition of "engaged", in one shape.

- [ ] **Step 4: Run and watch pass**

Run: `npm test -- investment-preferences`
Expected: PASS.

---

### Task 3: `MultiAssetRow` — one number, three budgets

**Files:**
- Create: `src/components/invest/MultiAssetRow.tsx`
- Test: `src/components/invest/MultiAssetRow.test.tsx`

**Interfaces:**
- Consumes: `multiAssetDraw`, `multiAssetOverdraw`, `MULTI_ASSET_ID`, `CLASS_LABEL`, `round1` (Task 1).
- Produces: default export `MultiAssetRow` with props
  `{ value: number | null; label: string; recommended: number; mix: ClassMix; onChange: (v: number | null) => void }`.
  Task 4 renders it above the class groups and passes `label` straight from the catalog — the backend is the only source of subgroup names (`SubcategoryPins.tsx` already follows that rule).

- [ ] **Step 1: Write the failing test**

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import MultiAssetRow from "./MultiAssetRow";

const BAR = { equity: 78, debt: 14, others: 8 };
const props = { label: "Multi-Asset", recommended: 20, mix: BAR, onChange: () => {} };

afterEach(cleanup);

describe("MultiAssetRow", () => {
  it("shows the three-class breakdown of the entered value", () => {
    render(<MultiAssetRow {...props} value={20} />);
    expect(screen.getByTestId("ma-breakdown"))
      .toHaveTextContent("counts as 13.0% Equity · 5.0% Debt · 2.0% Commodity");
  });

  it("prints Prozpr's figure to one decimal", () => {
    render(<MultiAssetRow {...props} value={null} recommended={8} />);
    expect(screen.getByText("Prozpr 8.0%")).toBeInTheDocument();
  });

  it("names the class when the entry overdraws one", () => {
    render(<MultiAssetRow {...props} value={20} mix={{ equity: 88, debt: 4, others: 8 }} />);
    // scoped: the breakdown line also contains the word "debt"
    expect(within(screen.getByTestId("ma-overdraw")).getByText(
      /20\.0% multi-asset needs 5\.0% Debt but your bar only has 4\.0%/i)).toBeInTheDocument();
  });

  it("shows no breakdown and no error when blank", () => {
    render(<MultiAssetRow {...props} value={null} />);
    expect(screen.queryByTestId("ma-breakdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ma-overdraw")).not.toBeInTheDocument();
  });

  it("snaps an over-precise entry onto the one-decimal grid on blur", () => {
    const onChange = vi.fn();
    render(<MultiAssetRow {...props} value={20} onChange={onChange} />);
    const input = screen.getByLabelText("Multi-Asset");
    fireEvent.change(input, { target: { value: "12.34" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(12.3);
  });

  it("reports a cleared field as blank, not as zero", () => {
    const onChange = vi.fn();
    render(<MultiAssetRow {...props} value={20} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Multi-Asset"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npm test -- MultiAssetRow`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Follow the card/typography patterns already in `SubcategoryPins.tsx`. Required behaviour:

- A numeric input with `aria-label={label}`, `inputMode="decimal"`, no spinners, plus `Prozpr {recommended.toFixed(1)}%`.
- An empty field emits `null`, not `0`. Any other input is parsed and, **on blur only** (typing "2" on the way to "25" must not fight the customer), clamped to 0–100 **and snapped onto the grid with `round1`**. The grid rule is load-bearing, not cosmetic: `toSavePins` sends row values to the wire verbatim, while `classAllocated` rounds the class *sum*. An un-snapped `12.34` would therefore validate as balanced and still go on the wire as `12.34`, so what we checked is not what we sent.
- When `value != null`, a `data-testid="ma-breakdown"` line built from `multiAssetDraw`:
  `counts as {eq}% {CLASS_LABEL.equity} · {dt}% {CLASS_LABEL.debt} · {ot}% {CLASS_LABEL.others}`, each `.toFixed(1)`.
- When `multiAssetOverdraw(mix, { [MULTI_ASSET_ID]: value })` returns a class `c`, a `data-testid="ma-overdraw"` line:
  `{value.toFixed(1)}% multi-asset needs {multiAssetDraw(...,c).toFixed(1)}% {CLASS_LABEL[c]} but your bar only has {mix[c].toFixed(1)}% — raise {CLASS_LABEL[c]} above, or lower this.`
  Every percentage in it is `.toFixed(1)`, including the customer's own figure and the bar share — the bar carries one decimal now, so a raw `{mix[c]}` would print "13.9%" here and "4%" there.
  The error renders on **this row**, never on the class group (spec §6).
- Neither line renders when `value == null`.

- [ ] **Step 4: Run and watch pass**

Run: `npm test -- MultiAssetRow`
Expected: PASS.

---

### Task 4: `SubcategoryPins` — grouped full table

**Files:**
- Create: `src/components/invest/PctInput.tsx`
- Create: `src/components/invest/PctInput.test.tsx`
- Modify: `src/components/invest/MultiAssetRow.tsx` (adopt `PctInput`)
- Rewrite: `src/components/invest/SubcategoryPins.tsx`
- Rewrite: `src/components/invest/SubcategoryPins.test.tsx`

**Interfaces:**
- Consumes: `classStatus`, `multiAssetOverdraw`, `isEngaged`, `round1`, `CLASS_LABEL`, `CLASS_COLOR`, `CLASSES`, `MULTI_ASSET_ID`, `RowValues` (Task 1); `MultiAssetRow` (Task 3).
- Produces: `PctInput`, consumed by `MultiAssetRow` and by every class row.

**Why `PctInput` exists — learned building Task 3.** The blur contract cannot be
stateless. On blur the field must snap what the customer *typed*, and the parent
has not necessarily re-rendered with it, so the raw keystrokes have to live
somewhere between focus and blur. Task 3 discovered this and put a `draft` state
inside `MultiAssetRow`. Ten class rows need exactly the same fiddly
parse/clamp/snap/blank logic, so it is extracted once rather than written twice
and drifting. `SubcategoryPins` itself still holds no state — `PctInput` owns only
the in-flight string, never the value.
- Produces: default export with props
  `{ values: RowValues; subcategories: ScreenSubcategory[]; mix: ClassMix; onChange: (next: RowValues) => void }`.
  Task 5 owns the state and passes it down.

Replaces the dropdown + "Add pin" flow entirely. The old props (`pins`, `onAdd`, `onRemove`) go, and so do the two existing tests in this file.

- [ ] **Step 1: Write `PctInput`'s failing tests**

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import PctInput from "./PctInput";

afterEach(cleanup);

describe("PctInput", () => {
  const view = (value: number | null, onChange = () => {}) =>
    render(<PctInput label="Large-cap" value={value} onChange={onChange} />);

  it("snaps onto the one-decimal grid on blur", () => {
    const onChange = vi.fn();
    view(20, onChange);
    const el = screen.getByLabelText("Large-cap");
    fireEvent.change(el, { target: { value: "12.34" } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(12.3);
  });

  it("clamps to 0-100 on blur", () => {
    const onChange = vi.fn();
    view(20, onChange);
    const el = screen.getByLabelText("Large-cap");
    fireEvent.change(el, { target: { value: "140" } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("does not clamp mid-keystroke", () => {
    const onChange = vi.fn();
    view(null, onChange);
    fireEvent.change(screen.getByLabelText("Large-cap"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith(2);   // not snapped, not clamped, no blur yet
  });

  it("emits null for an empty field, never 0", () => {
    const onChange = vi.fn();
    view(20, onChange);
    const el = screen.getByLabelText("Large-cap");
    fireEvent.change(el, { target: { value: "" } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("shows a blank field for a null value", () => {
    view(null);
    expect(screen.getByLabelText("Large-cap")).toHaveValue(null);
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npm test -- PctInput`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PctInput`**

Lift the logic Task 3 already wrote and proved, verbatim — the `parse` helper, the
`draft` state, the `onChange`/`onBlur` pair, and the input's class names including
the spinner suppression.

```tsx
import { useState, type ChangeEvent } from "react";

import { round1 } from "@/lib/investment-preferences";

/** Blank stays blank. An empty field is `null` — a deliberate "nothing here" —
 *  never 0, which would read as a real entry (spec §4.3). */
const parse = (raw: string): number | null => {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** One percentage field. It owns the raw keystrokes between focus and blur so the
 *  grid rule can wait: typing "2" on the way to "25" must not be clamped or
 *  snapped under the customer. On blur the value is clamped to 0-100 and snapped
 *  with `round1` — the snap is load-bearing, because `toSavePins` sends row values
 *  to the wire verbatim while validation rounds the class sum. */
export default function PctInput({
  label, value, onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? "" : String(value));

  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={label}
      value={shown}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        setDraft(e.target.value);
        onChange(parse(e.target.value));
      }}
      onBlur={() => {
        if (draft === null) return;
        const n = parse(draft);
        setDraft(null);
        onChange(n === null ? null : round1(Math.min(100, Math.max(0, n))));
      }}
      className="w-[84px] rounded-lg border border-input bg-background px-2.5 py-2 text-right text-[13.5px] tabular-nums text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}
```

- [ ] **Step 4: Run and watch pass**

Run: `npm test -- PctInput`
Expected: PASS, 5 tests.

- [ ] **Step 5: Refactor `MultiAssetRow` onto it**

Replace the input element, the `draft` state, the `parse` helper and the
`handleChange` / `handleBlur` pair in `MultiAssetRow.tsx` with a single
`<PctInput label={label} value={value} onChange={onChange} />`. Everything else on
that component — the breakdown line, the overdraw line, the `Prozpr N%` figure —
is untouched.

Run: `npm test -- MultiAssetRow`
Expected: PASS, all 6 tests, **with the test file unmodified**. That is the point
of doing the refactor under an existing green suite: if a test needs editing, the
refactor changed behaviour and is wrong.

- [ ] **Step 6: Write `SubcategoryPins`' failing tests**

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import type { RowValues } from "@/lib/investment-preferences";
import SubcategoryPins from "./SubcategoryPins";

const CATS: ScreenSubcategory[] = [
  { id: "multi_asset",       class: "equity", label: "Multi-Asset", recommended_pct_of_total: 20 },
  { id: "low_beta_equities", class: "equity", label: "Large-cap",   recommended_pct_of_total: 30 },
  { id: "short_debt",        class: "debt",   label: "Short Debt",  recommended_pct_of_total: 20 },
  { id: "arbitrage",         class: "debt",   label: "Arbitrage",   recommended_pct_of_total: 0 },
  { id: "gold_commodities",  class: "others", label: "Gold",        recommended_pct_of_total: 30 },
];
const BAR: ClassMix = { equity: 43, debt: 25, others: 32 };
const view = (values: RowValues, onChange = () => {}) =>
  render(<SubcategoryPins values={values} subcategories={CATS} mix={BAR} onChange={onChange} />);

afterEach(cleanup);

describe("SubcategoryPins", () => {
  it("renders every settable category, not only the filled ones", () => {
    view({});
    for (const c of CATS) expect(screen.getByLabelText(c.label)).toBeInTheDocument();
  });

  it("shows no budgets and no warnings until the customer engages", () => {
    view({});
    expect(screen.queryByText(/of 30\.0%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left|over|balanced/i)).not.toBeInTheDocument();
  });

  it("groups rows under their class with a live budget once engaged", () => {
    view({ multi_asset: 20, low_beta_equities: 24 });
    // equity budget = 43 - 13 = 30; allocated 24 => 6 left
    expect(screen.getByTestId("group-equity")).toHaveTextContent("24.0 of 30.0%");
    expect(screen.getByTestId("group-equity")).toHaveTextContent("6.0% left");
  });

  it("never prints a negative amount of room", () => {
    view({ multi_asset: 20, low_beta_equities: 24 });
    expect(screen.getByTestId("group-equity")).not.toHaveTextContent("-6.0");
  });

  it("marks a class balanced when its rows hit the budget exactly", () => {
    view({ multi_asset: 20, gold_commodities: 30 });
    expect(screen.getByTestId("group-others")).toHaveTextContent("balanced");
  });

  it("marks a class over when its rows exceed the budget", () => {
    view({ multi_asset: 20, low_beta_equities: 36 });
    expect(screen.getByTestId("group-equity")).toHaveTextContent("6.0% over");
  });

  it("goes neutral on the class a multi-asset entry overdraws", () => {
    // debt budget = 4 - 5 = -1: the actionable message belongs on the
    // multi-asset row (spec §6), so the group must not print "0.0 of -1.0%".
    render(<SubcategoryPins values={{ multi_asset: 20 }} subcategories={CATS}
      mix={{ equity: 88, debt: 4, others: 8 }} onChange={() => {}} />);
    expect(screen.getByTestId("group-debt")).not.toHaveTextContent("-1.0");
    expect(screen.getByTestId("group-debt")).not.toHaveTextContent("over");
  });

  it("emits the whole next RowValues on a keystroke", () => {
    const onChange = vi.fn();
    view({ multi_asset: 20 }, onChange);
    fireEvent.change(screen.getByLabelText("Large-cap"), { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith({ multi_asset: 20, low_beta_equities: 12 });
  });
});
```

- [ ] **Step 7: Run and watch fail**

Run: `npm test -- SubcategoryPins`
Expected: FAIL — the old component takes `pins`, renders a dropdown, and has no `group-*` testids.

- [ ] **Step 8: Implement**

Structure, per spec §5:

1. `MultiAssetRow` at the top, outside the class groups. `label` and `recommended` come from `subcategories.find(c => c.id === MULTI_ASSET_ID)`.
2. Then one group per class in `CLASSES` order, each wrapped in ``data-testid={`group-${cls}`}``, containing:
   - a header: `{CLASS_LABEL[cls]}` plus, **only when `isEngaged(values)`**, `{allocated.toFixed(1)} of {budget.toFixed(1)}%` and one of
     `{Math.abs(delta).toFixed(1)}% left` / `{Math.abs(delta).toFixed(1)}% over` / `balanced`, with the state colour from `classStatus` (amber under, red over, green balanced). **Print the absolute value** — `-6.0% left` is wrong twice over.
   - **Exception:** when `multiAssetOverdraw(mix, values) === cls`, the header shows the class name only — no numbers, no state, no dot. That class's budget is negative and the actionable message is already on the multi-asset row (spec §6).
   - one row per category of that class (`subcategories.filter(c => c.class === cls && c.id !== MULTI_ASSET_ID)`), each showing `label`, `Prozpr {recommended_pct_of_total.toFixed(1)}%`, and a numeric input with `aria-label={c.label}` bound to `values[c.id]`.
3. Input rules (spec §7): `inputMode="decimal"`, no spinners, empty emits `null`. **On blur only**, clamp to 0–100 **and snap onto the grid with `round1`** — see Task 3 for why the snap matters. Do not clamp to the class budget. A per-row clamp against a budget shared by five rows either does nothing (the row is under budget while the class is over) or silently rewrites a number the customer typed into a row that was not the problem. Over-allocation is the group header's job; it is the stated primary feedback surface (spec §5.1).
4. `onChange` emits the whole next `RowValues`. `SubcategoryPins` holds no state of
   its own — the only state anywhere is the in-flight keystroke string inside each
   `PctInput`.

**Do not build the dual comparison bars in this task** — they are Task 7, which slots into the same group markup afterwards.

- [ ] **Step 9: Run and watch pass**

Run: `npm test -- SubcategoryPins`, then `npm test -- PctInput MultiAssetRow` to
confirm the refactor still holds, then `npx tsc -p tsconfig.app.json --noEmit`.
Expected: PASS. The typecheck should show exactly TWO remaining errors, both in
`InvestPreferences.tsx` and both fixed by Task 5: the missing `pinsValid` import,
and the call site still passing v1's props (`pins` / `onChange={setPins}`) to the
new prop shape. Changing this component's props necessarily breaks its only
caller, and that caller is out of Task 4's file set — a clean typecheck is not
reachable until Task 5. The two `InvestPreferences.test.tsx` failures are the same
cause and equally expected.

---

### Task 5: `InvestPreferences` — sticky footer, save gating, payload

**Files:**
- Modify: `src/pages/InvestPreferences.tsx`
- Modify: `src/pages/InvestPreferences.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: no new exports; this is the composition root.

**Test harness — match the file that already exists.** `InvestPreferences.test.tsx` mocks the whole api module (`vi.mock("@/lib/api")`) and drives the UI with `fireEvent`. Assert on the arguments `saveInvestmentPreferences` was called with, exactly as the existing test at line 60 does. There is no request body to parse, and `@testing-library/user-event` is not installed.

- [ ] **Step 1: Write the failing tests**

Extend the existing `GET` fixture to the five-category catalog and add this block:

```tsx
const CATS = [
  { id: "multi_asset",       class: "equity", label: "Multi-Asset", recommended_pct_of_total: 20 },
  { id: "low_beta_equities", class: "equity", label: "Large-cap",   recommended_pct_of_total: 30 },
  { id: "short_debt",        class: "debt",   label: "Short Debt",  recommended_pct_of_total: 20 },
  { id: "arbitrage",         class: "debt",   label: "Arbitrage",   recommended_pct_of_total: 0 },
  { id: "gold_commodities",  class: "others", label: "Gold",        recommended_pct_of_total: 30 },
];
// look-through of the above: multi-asset 20 -> 13/5/2, so 43 / 25 / 32
const GET = {
  saved: null,
  recommendation: { class_mix: { equity: 43, debt: 25, others: 32 } },
  subcategories: CATS,
};
const SAVED_COMPLETE = {
  class_mix: { equity: 43, debt: 25, others: 32 },
  pins: [
    { subgroup: "multi_asset", pct_of_total: 20 },
    { subgroup: "low_beta_equities", pct_of_total: 30 },
    { subgroup: "short_debt", pct_of_total: 20 },
    { subgroup: "arbitrage", pct_of_total: 0 },
    { subgroup: "gold_commodities", pct_of_total: 30 },
  ],
};

const mockGet = (data: unknown) =>
  (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue(data);
const saveBtn = () => screen.getByRole("button", { name: /save preferences/i });
const ready = () => screen.findByRole("button", { name: /save preferences/i });
const enterValue = (label: string, v: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
const enterCompleteDistribution = () => {
  enterValue("Multi-Asset", "20");
  enterValue("Large-cap", "30");
  enterValue("Short Debt", "20");
  enterValue("Gold", "30");            // Arbitrage left blank => sent as 0
};
const clearAllRows = () => CATS.forEach((c) => enterValue(c.label, ""));
const nudgeBar = () =>
  fireEvent.keyDown(screen.getByRole("slider", { name: "Equity / Debt divider" }), {
    key: "ArrowRight",
  });
const savedArgs = () =>
  (saveInvestmentPreferences as ReturnType<typeof vi.fn>).mock.calls[0][0];

describe("InvestPreferences — full distribution", () => {
  it("disables Save while any class is unbalanced", async () => {
    mockGet(GET); renderPage(); await ready();
    enterValue("Large-cap", "24");
    expect(saveBtn()).toBeDisabled();
  });

  it("says which class is holding Save back", async () => {
    mockGet(GET); renderPage(); await ready();
    enterValue("Multi-Asset", "20");
    enterValue("Large-cap", "24");
    expect(screen.getByTestId("save-reason")).toHaveTextContent("Equity 6.0% left");
  });

  it("enables Save once every class balances, and sends every row with zeros", async () => {
    mockGet(GET); renderPage(); await ready();
    enterCompleteDistribution();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toHaveLength(CATS.length);
    expect(savedArgs().pins).toContainEqual({ subgroup: "arbitrage", pct_of_total: 0 });
  });

  it("still saves a bare class mix when subcategories are untouched", async () => {
    mockGet(GET); renderPage(); await ready();
    nudgeBar();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toEqual([]);
  });

  it("shows no allocated figure while untouched", async () => {
    mockGet(GET); renderPage(); await ready();
    nudgeBar();
    expect(screen.queryByText(/allocated/i)).not.toBeInTheDocument();
  });

  it("lets a customer clear a saved distribution back to engine-decides", async () => {
    mockGet({ ...GET, saved: SAVED_COMPLETE }); renderPage(); await ready();
    clearAllRows();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toEqual([]);
  });

  it("Reset to Prozpr lands on a saveable distribution", async () => {
    mockGet(GET); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /reset to prozpr/i }));
    expect(saveBtn()).toBeEnabled();
  });

  it("never claims 100% allocated while Save is disabled", async () => {
    mockGet(GET); renderPage(); await ready();
    // offsetting errors: rows total 100 but equity is 6 over and debt 6 short
    enterValue("Multi-Asset", "20");
    enterValue("Large-cap", "36");
    enterValue("Short Debt", "14");
    enterValue("Gold", "30");
    expect(saveBtn()).toBeDisabled();
    expect(screen.queryByText(/100(\.0)?% allocated/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npm test -- InvestPreferences`
Expected: FAIL — the page still holds `pins`, gates on `pinsValid`, has no labelled row inputs, no `save-reason`, and no footer.

- [ ] **Step 3: Implement**

1. Replace `pins: SubcategoryPin[]` state with `values: RowValues`, seeded via `fromSavedPins(data.saved?.pins ?? [], data.subcategories)`. Keep `initialValues` alongside it for the dirty check.
2. The recommendation bar and the reset target come from the catalog, not from `data.recommendation.class_mix`:
   ```ts
   const recMix = recommendedMix(data.subcategories);
   const startMix = data.saved?.class_mix ? roundMix(data.saved.class_mix) : recMix;
   ```
   Deriving the bar from the same rows Reset fills is what makes Reset balanced by construction. `data.recommendation.class_mix` is the engine's own figure for the same run and is no longer read.
3. Derive on each render — no new helper, `samePins` already does the comparison:
   ```ts
   const statuses = CLASSES.map((c) => ({ cls: c, ...classStatus(mix, values, subs, c) }));
   const engaged = isEngaged(values);
   const valid = !engaged || distributionValid(mix, values, subs);
   const dirty = !sameMix(mix, initialMix)
     || !samePins(toSavePins(values, subs), toSavePins(initialValues, subs));
   ```
4. Save enabled when `dirty && valid && !saving` — which covers the clear path, since an all-blank `values` is `!engaged` and therefore valid.
5. `handleSave` sends `{ class_mix: mix, pins: toSavePins(values, subs) }`.
6. **Sticky footer**, fixed above `BottomNav`, holding the Save button in all states:
   - `!engaged` → the Save button only. No allocated/left figures: a customer who has only moved the bar has not allocated "0%", and saying so next to an enabled Save button is nonsense.
   - engaged and every class balanced → `100% allocated`.
   - engaged and not → a `data-testid="save-reason"` summary built **from `statuses`, never from the sum of the rows**: the unbalanced classes and their deltas, e.g. `Equity 6.0% left · Debt 6.0% over`. Offsetting errors can make the rows total exactly 100 while two classes are wrong, so a total-based footer would print `100% allocated` beside a dead button.
   - The `<p>` carrying that summary also carries `id="save-reason"`, and the disabled button
     references it via `aria-describedby={"save-reason"}` — the attribute takes an **id**, not the
     text — so the reason is announced as well as shown.
   - **Reset to Prozpr moves into this footer too.** Save cannot stay inline once the footer owns it
     (two buttons matching `/save preferences/i` would break every query), and splitting the pair
     across two places reads worse than keeping them together. Page padding goes `pb-24` → `pb-44`
     to clear it; the footer sits at `bottom-[72px] z-40`, matching the `CashflowGate` precedent.
7. **Reset to Prozpr** sets `setMix(recMix)` and `setValues(resetValues(subs, recMix))` (spec §12).

- [ ] **Step 4: Run and watch pass**

Run: `npm test -- InvestPreferences`, then the full suite `npm test`, then `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS, no regressions, no type errors anywhere.

- [ ] **Step 5: Verify in the browser**

Start the preview (`frontend`, port 8080), stub the API, set a 375×812 viewport, and confirm: budgets re-target live when multi-asset changes; the untouched screen shows no amber warnings; Save stays disabled until all three balance and says which class is short; the overdraw error appears on the multi-asset row while that class's group header goes quiet; Reset to Prozpr leaves Save enabled.

---

### Task 6: Copy

**Files:** Modify: `src/pages/InvestPreferences.tsx`

- [ ] **Step 1:** Replace the section intro. Spec §8's wording ("the numbers in each class need to add up to what you chose above") describes a rule the screen does not enforce — once multi-asset is filled, the rows under Equity add up to the *budget*, not to the bar. Use:

  > Set the share of your whole portfolio for each category. Anything you leave blank counts as zero. Each class has to add up to the budget shown next to it — the multi-asset fund is counted separately, because it holds all three.

- [ ] **Step 2:** Add the directional disclaimer above Save, always visible, from spec §8:

  > This is a directional target. We'll get as close to it as we can; the exact final split can move slightly when we fit real funds.

- [ ] **Step 3:** Group header when balanced reads `balanced` — not "valid" / "OK". This is money, not a form.

- [ ] **Step 4:** The carve-out notice. Renders **only** for customers it applies to, driven by
  `carve_outs_at_risk` on the GET response (backend spec §9.1). A panel directly above the Save
  button — not a modal. Render only the bullets whose key is present, in this order:

  > **You're replacing our planning, not just our fund picks**
  >
  > You're telling us where your whole portfolio should sit, so we'll stop making these calls for you:
  >
  > - `emergency_fund` — **No separate emergency fund.** We'd normally hold a reserve back before investing the rest. We won't — all of it follows your split.
  > - `near_term_goals` — **Goals in the next five years stop being planned for.** They stay on your record, but your plan gets built around your split, not around their dates.
  > - `liability_offset` — **We'll stop offsetting your loans.** You owe more than you hold, so we currently keep some money in short-term debt to cover that. That stops.
  >
  > You can clear your preference any time and we'll go back to planning it for you.

  Each bullet is grounded in a measured consequence in backend spec §3.3–§3.4, not a paraphrase:
  emergency ₹6,00,000 → ₹0; an 18-month goal absorbed into the long-term pool and absent from
  `goals_allocated` entirely; `short_debt ₹8,00,000 → absent` for a customer with negative
  `net_financial_assets`. The second bullet says "stop being planned for" rather than "stop being
  earmarked" deliberately — under §3.3 a sub-60-month goal does not merely lose its bucket, it
  leaves the plan.

  This is the pre-commit warning. It is **not** the same as the post-save `shortfall_reason`
  disclosure the backend attaches (spec §8, "two different moments — don't conflate them"). Render
  `shortfall_reason` where the resulting plan is shown; never re-word it here.

  First iteration — the user has said they will refine this copy later.

- [ ] **Step 5:** Test it renders nothing when `carve_outs_at_risk` is absent or empty, and exactly
  one bullet when one key is present.

```tsx
it("shows no carve-out notice when nothing is at risk", async () => {
  mockGet(GET); renderPage(); await ready();
  expect(screen.queryByText(/replacing our planning/i)).not.toBeInTheDocument();
});

it("shows only the bullets that apply", async () => {
  mockGet({ ...GET, carve_outs_at_risk: ["emergency_fund"] }); renderPage(); await ready();
  expect(screen.getByText(/No separate emergency fund/i)).toBeInTheDocument();
  expect(screen.queryByText(/stop offsetting your loans/i)).not.toBeInTheDocument();
});
```

`carve_outs_at_risk?: ("emergency_fund" | "near_term_goals" | "liability_offset")[]` is added to
`ScreenPreferenceGetResponse` in `src/lib/api.ts` — optional, so the screen degrades to showing
nothing until the backend ships it.

---

### Task 7: The dual comparison bars

**Decided 2026-09-15** (spec §5.2 and §13.1, both previously open):
- **§5.2 — normalised bars with a size label.** Both bars render full width so the *mix* is directly
  comparable, with a line above carrying the two totals so the *size* difference is not hidden.
- **§13.1 — the class bar stays draggable.** Budgets re-target live, group headers show what broke,
  Save disables until it balances. This is today's behaviour and what Tasks 1–5 already build, so
  nothing in them changes.

**Files:**
- Create: `src/components/invest/ClassDistributionBars.tsx`
- Create: `src/components/invest/ClassDistributionBars.test.tsx`
- Modify: `src/components/invest/SubcategoryPins.tsx` (render it inside each group)

**Interfaces:**
- Consumes: `classAllocated`, `recommendedValues`, `CLASS_COLOR`, `RowValues`, `Cls` (Task 1).
- Produces: default export `ClassDistributionBars` with props
  `{ cls: Cls; categories: ScreenSubcategory[]; values: RowValues }` — `categories` is that class's
  own rows, multi-asset already excluded by the caller.

**Why row-sums, not class shares.** Both bars compare the rows the customer can see in the table
directly beneath, so both exclude the multi-asset draw — `classAllocated` on the customer's values
and `classAllocated` on `recommendedValues`. Comparing a class share that silently includes
multi-asset against a table that does not is the same category error the group budgets were fixed to
avoid.

**Segment colours.** No new palette. Each segment is `CLASS_COLOR[cls]` at descending opacity by
position, so the two bars map onto each other by index and the canonical class colours stay the
single source (per the app-wide rule that `CLASS_COLOR` is the only asset-class palette).

- [ ] **Step 1: Write the failing tests**

```tsx
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { ScreenSubcategory } from "@/lib/api";
import ClassDistributionBars from "./ClassDistributionBars";

const EQUITY: ScreenSubcategory[] = [
  { id: "low_beta_equities",    class: "equity", label: "Large-cap", recommended_pct_of_total: 30 },
  { id: "medium_beta_equities", class: "equity", label: "Mid-cap",   recommended_pct_of_total: 10 },
];

afterEach(cleanup);

describe("ClassDistributionBars", () => {
  it("labels both totals so the size difference is not hidden", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY}
      values={{ low_beta_equities: 15, medium_beta_equities: 5 }} />);
    expect(screen.getByTestId("bars-label"))
      .toHaveTextContent("Yours 20.0% · Prozpr 40.0%");
  });

  it("normalises each bar against its OWN total", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY}
      values={{ low_beta_equities: 15, medium_beta_equities: 5 }} />);
    // yours 15/20 = 75%, prozpr 30/40 = 75% — same mix, different size
    expect(screen.getByTestId("yours-low_beta_equities")).toHaveStyle({ width: "75%" });
    expect(screen.getByTestId("prozpr-low_beta_equities")).toHaveStyle({ width: "75%" });
    expect(screen.getByTestId("yours-medium_beta_equities")).toHaveStyle({ width: "25%" });
  });

  it("renders an empty customer bar rather than NaN when nothing is entered", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY} values={{}} />);
    expect(screen.getByTestId("yours-low_beta_equities")).toHaveStyle({ width: "0%" });
    expect(screen.getByTestId("bars-label")).toHaveTextContent("Yours 0.0%");
  });

  it("survives a class whose recommendation is entirely zero", () => {
    const zeroed = EQUITY.map((c) => ({ ...c, recommended_pct_of_total: 0 }));
    render(<ClassDistributionBars cls="equity" categories={zeroed} values={{}} />);
    expect(screen.getByTestId("prozpr-low_beta_equities")).toHaveStyle({ width: "0%" });
  });

  it("orders both bars identically so segments map by position", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY}
      values={{ low_beta_equities: 15, medium_beta_equities: 5 }} />);
    const ids = (p: string) => Array.from(
      screen.getByTestId(`bar-${p}`).children).map((el) => el.getAttribute("data-testid"));
    expect(ids("yours")).toEqual(["yours-low_beta_equities", "yours-medium_beta_equities"]);
    expect(ids("prozpr")).toEqual(["prozpr-low_beta_equities", "prozpr-medium_beta_equities"]);
  });
});
```

- [ ] **Step 2: Run and watch fail**

Run: `npm test -- ClassDistributionBars`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
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
```

- [ ] **Step 4: Run and watch pass**

Run: `npm test -- ClassDistributionBars`
Expected: PASS.

- [ ] **Step 5: Render it inside each class group**

In `SubcategoryPins.tsx`, between the group header and the group's rows:

```tsx
<ClassDistributionBars cls={cls} categories={rowsFor(cls)} values={values} />
```

where `rowsFor(cls)` is the same `subcategories.filter(c => c.class === cls && c.id !== MULTI_ASSET_ID)`
the rows already use — one expression, not a second filter that could drift out of step.

Suppress the bars for a class where `multiAssetOverdraw(mix, values) === cls`, for the same reason
the header goes neutral there (Task 4): that class's budget is negative and the actionable message
lives on the multi-asset row.

- [ ] **Step 6: Run the full suite**

Run: `npm test` then `npx tsc -p tsconfig.app.json --noEmit`
Expected: PASS, no regressions. Add one assertion to `SubcategoryPins.test.tsx` that the bars render
for a normal class and do not render for the overdrawn one.

---

## Self-Review

- **Spec coverage:** §4.2 per-class exactness → Task 1. §4.3 blank-as-zero → Tasks 1–2. §5 anatomy → Tasks 3–4. §5.3 sticky footer → Task 5. §6 multi-asset incl. the negative-budget case → Tasks 1, 3, 4. §7 state table, all five rows → Tasks 4–5. §8 copy → Task 6. §9 payload → Tasks 2, 5. §12 Reset → Task 1 (`resetValues`) + Task 5. §5.2 bars → Task 7. §13.1 → Task 7 (bar stays draggable; nothing to build).
- **Type consistency:** `RowValues` is the single shape from Task 1 through Task 5; `SubcategoryPin[]` appears only in `toSavePins` / `fromSavedPins`. Every symbol used in Tasks 3–5 is exported by Task 1 or 2 — there is no `sameValues`, no `rowsToPins`, no `pinnedInClass`.
- **Deletions are explicit:** `pinsValid`, `classRoom` and `pinnedInClass` are removed in Task 1 Step 3; their consumers are rewritten in Tasks 4–5, and the repo typechecks clean at the end of Task 5. `samePins` stays — Task 5 uses it for the dirty check.
- **No integration testing until the backend lands** — zeros are rejected and multi-asset validation disagrees today. Unit tests and the stubbed browser check are the verification available.

## What changed from v1

v1 was audited on 2026-09-15 (six lenses, adversarial verification). Fourteen distinct findings; all are folded in above.

| Was | Now |
|---|---|
| `TOL = 0.05` compared against raw float budgets | Budgets rounded to one decimal at source; `delta === 0`, no tolerance constant. v1 produced headers reading `12.8 of 12.8% · 0.1% over` and 12 unreachable budgets on a 78/14/8 bar |
| Bar rounded to whole numbers, rows kept engine floats | `roundMix` keeps one decimal; the bar is derived from the rows via `recommendedMix`; `resetValues` absorbs the backend's per-row rounding. v1's Reset landed +0.3 over / −0.3 under with Save disabled |
| `RowValues` and `SubcategoryPin[]` both used in the maths | `RowValues` only; pins appear at the wire boundary. `rowsToPins` deleted |
| `isEngaged(pins)` — a shape the app never held, so its guard was dead and its test false-passed | `isEngaged(values)`, one definition, used by both `distributionValid` and `toSavePins` |
| `sameValues` used but never defined | Deleted; `samePins(toSavePins(…), toSavePins(…))` |
| Tests used `userEvent` (not installed) and a fetch-level PUT stub (the api module is mocked) | `fireEvent` + assertions on `saveInvestmentPreferences` args, matching the existing file |
| Six test helpers referenced, none written | All written out |
| `MultiAssetRow` had no `label`; its overdraw test matched two elements | `label` prop from the catalog; assertions scoped by testid |
| Negative class budget rendered as `0.0 of -1.0% · 1.0% over` | That group goes neutral; the message stays on the multi-asset row (spec §6) |
| Untouched screen showed three amber "under budget" warnings | Budgets and state hidden until `isEngaged` |
| Footer summed the rows — `100% allocated` beside a dead button, `0.0% allocated` with a full bar | Footer derives from the per-class statuses; hidden figures when untouched; names the offending class |
| `{delta} left` printed `-13.0% left` | `Math.abs(delta)` |
| `Prozpr {recommended_pct_of_total}%` printed a raw float | `.toFixed(1)` |
| Blur-clamped to the class budget | Clamps 0–100 only; over-allocation is the header's job |
| `src/lib/api.ts` listed as needing a change | Removed — no client-side guard exists and `pct_of_total` is already `number` |

One v1 finding was **withdrawn** on verification: that the catalog omits ELSS and direct stocks and so sums to less than 100. It does omit them, but the screen's path passes no `CorpusPin`, so `elss_corpus` and `non_mf_equity_corpus` are both zero and the frozen rows are never produced. The catalog covers the whole portfolio. The residual risk — that the screen recommends as though the customer holds no ELSS — is real and belongs to backend spec §11, which already proposes the regression test that pins it.
