# Preferences — Today's Holdings, Multi-Asset Bar & Typed Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the customer where their portfolio sits today alongside their preference and Prozpr's on `/invest/preferences`, rebuild the multi-asset control in the screen's own bar idiom, and let category percentages be typed rather than only dragged.

**Architecture:** All new maths lands as pure functions in `src/lib/investment-preferences.ts` (no React, no I/O) and is unit-tested there first; components stay thin. Today's holdings arrive as one optional `current` block on the existing preferences GET, are converted to the screen's own `RowValues` shape at the page boundary, and are rendered by the same code that already draws Prozpr's bar and rows. Every "today" affordance is conditional on that block being present, so the frontend ships and behaves correctly before the backend field exists.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind, Vitest + @testing-library/react (jsdom). Test command: `npx vitest run <path>`. Lint: `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-09-20-preferences-today-bar-and-typed-entry-design.md` — read it before starting.

## Global Constraints

- **One decimal is the screen's unit of precision.** Every percentage is put on that grid with `round1` before it is stored, compared or printed. Never compare two percentages with a raw epsilon.
- **`normalise` is the only home of the "distribution sits exactly on the bar" invariant.** Every edit leaves a component through `SubcategoryPins`'s `commit` → `normalise`. Do not add a second place that rebalances.
- **The class bar never moves as a result of a typed value.** A typed value is clamped to its class budget (spec D3).
- **Graceful degrade is a requirement, not a nicety.** With `current` absent the screen must render byte-for-byte as it does today. Every task that adds a "today" affordance must also cover the absent case with a test.
- **Colours come from `CLASS_COLOR`**, the app's only asset-class palette. Gold interactive chrome is the literal `#D4A868` this screen already uses.
- **Match the surrounding comment style:** comments explain *why* a rule exists, not what the line does. The existing files are the reference.
- **Copy is exact:** the today bar's label is `Where you are today`, its caption is `Across the categories you set here.`, and the column headers are `Prozpr` / `Today` / `You`.
- **Do not touch** the save payload, `toSavePins`, `fromSavedPins`, or the Invest page's Current-vs-target chart.

---

### Task 1: Today's holdings — wire type and the two pure readers

**Files:**
- Modify: `src/lib/api.ts` (around the `ScreenPreferenceGetResponse` block, ~line 2838-2860)
- Modify: `src/lib/investment-preferences.ts` (`recommendedMix`, ~line 300)
- Test: `src/lib/investment-preferences.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ScreenCurrentHolding { subgroup: string; pct_of_total: number }` (api.ts)
  - `interface ScreenCurrentHoldings { holdings: ScreenCurrentHolding[] }` (api.ts)
  - `ScreenPreferenceGetResponse.current?: ScreenCurrentHoldings | null`
  - `mixFromValues(values: RowValues, cats: ScreenSubcategory[]): ClassMix`
  - `fromCurrentHoldings(holdings: ScreenCurrentHolding[], cats: ScreenSubcategory[]): RowValues`
  - `recommendedMix(cats: ScreenSubcategory[]): ClassMix` — unchanged signature and behaviour.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/investment-preferences.test.ts`. Add `mixFromValues` and `fromCurrentHoldings` to the existing import block at the top of the file.

```ts
describe("mixFromValues", () => {
  // The same look-through that draws Prozpr's bar now draws today's, so the
  // two are comparable by construction rather than by coincidence.
  it("reads the multi-asset fund through into all three classes", () => {
    // multi-asset 20 -> 13 / 5 / 2, plus large-cap 30, short debt 20, gold 30
    expect(mixFromValues(recommendedValues(CATS), CATS)).toEqual({
      equity: 43, debt: 25, others: 32,
    });
  });

  it("agrees with recommendedMix on the recommendation", () => {
    expect(mixFromValues(recommendedValues(CATS), CATS)).toEqual(recommendedMix(CATS));
  });

  it("always sums to 100", () => {
    const m = mixFromValues({ low_beta_equities: 55, short_debt: 45 }, CATS);
    expect(round1(m.equity + m.debt + m.others)).toBe(100);
  });
});

describe("fromCurrentHoldings", () => {
  // Today is a complete fact, not a partial one: a category the customer holds
  // nothing of is a real zero, which is what separates this from fromSavedPins.
  it("reads a category the customer holds nothing of as 0, never blank", () => {
    const v = fromCurrentHoldings([{ subgroup: "short_debt", pct_of_total: 40 }], CATS);
    expect(v.short_debt).toBe(40);
    expect(v.low_beta_equities).toBe(0);
    expect(isEngaged(v)).toBe(true);
  });

  it("ignores a subgroup the catalog does not carry", () => {
    const v = fromCurrentHoldings(
      [{ subgroup: "tax_efficient_equities", pct_of_total: 15 }, { subgroup: "gold_commodities", pct_of_total: 85 }],
      CATS,
    );
    expect(Object.keys(v).sort()).toEqual(CATS.map((c) => c.id).sort());
    expect(v.gold_commodities).toBe(85);
  });

  it("puts every figure on the one-decimal grid", () => {
    const v = fromCurrentHoldings([{ subgroup: "short_debt", pct_of_total: 21.63 }], CATS);
    expect(v.short_debt).toBe(21.6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/investment-preferences.test.ts`
Expected: FAIL — `mixFromValues is not a function`, `fromCurrentHoldings is not a function`.

- [ ] **Step 3: Add the wire types**

In `src/lib/api.ts`, immediately after the `ScreenSaved` interface:

```ts
/** One settable subcategory's share of what the customer holds TODAY. */
export interface ScreenCurrentHolding {
  subgroup: string;
  pct_of_total: number;
}

/** Where the customer sits today, expressed across the categories THIS screen
 *  can set. Frozen holdings (ELSS, direct stock) have no row here, so the
 *  backend drops them and rescales the rest — `holdings` sums to 100. */
export interface ScreenCurrentHoldings {
  holdings: ScreenCurrentHolding[];
}
```

Then add to `ScreenPreferenceGetResponse`, after `carve_outs_at_risk`:

```ts
  /** Where the customer sits today. Optional: the backend does not send it
   *  yet, and every "today" affordance stays hidden until it does. */
  current?: ScreenCurrentHoldings | null;
```

- [ ] **Step 4: Extract `mixFromValues` and add `fromCurrentHoldings`**

In `src/lib/investment-preferences.ts`, replace the whole existing `recommendedMix` function (and its doc comment) with:

```ts
/** The class bar a complete set of row values implies — the look-through, with
 *  the multi-asset fund split 65/25/10. Deriving a bar FROM its rows is what
 *  lets Reset land balanced instead of accusing Prozpr's own recommendation of
 *  overdrawing the bar, and it is what makes "today" directly comparable with
 *  the other two bars: all three are drawn by this one function. */
export function mixFromValues(values: RowValues, cats: ScreenSubcategory[]): ClassMix {
  const equity = round1(multiAssetDraw(values, "equity") + classAllocated(values, cats, "equity"));
  const debt = round1(multiAssetDraw(values, "debt") + classAllocated(values, cats, "debt"));
  return { equity, debt, others: round1(100 - equity - debt) };
}

/** The class bar that matches Prozpr's rows. */
export function recommendedMix(cats: ScreenSubcategory[]): ClassMix {
  return mixFromValues(recommendedValues(cats), cats);
}

/** Today's holdings as row values. Every settable category is present and a
 *  category the customer holds nothing of reads 0 — today is a complete fact,
 *  which is exactly what `fromSavedPins`'s nullable blank is not. */
export function fromCurrentHoldings(
  holdings: { subgroup: string; pct_of_total: number }[],
  cats: ScreenSubcategory[],
): RowValues {
  const by = new Map(holdings.map((h) => [h.subgroup, h.pct_of_total]));
  const out: RowValues = {};
  for (const c of cats) out[c.id] = round1(by.get(c.id) ?? 0);
  return out;
}
```

`fromCurrentHoldings` takes the holdings parameter as an inline structural shape rather than importing `ScreenCurrentHolding`. That is deliberate and matches the file's existing habit: this module is pure maths, and wire types appear in it only where a boundary function genuinely needs one. Leave it as written.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/investment-preferences.test.ts`
Expected: PASS — including every pre-existing `recommendedMix` test, untouched.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api.ts src/lib/investment-preferences.ts src/lib/investment-preferences.test.ts
git commit -m "feat(invest): read today's holdings into the preferences screen's own shape"
```

---

### Task 2: `applyTypedValue`

**Files:**
- Modify: `src/lib/investment-preferences.ts` (after `applySegmentDrag`)
- Test: `src/lib/investment-preferences.test.ts`

**Interfaces:**
- Consumes: `round1`, the module-private `val`, `type RowValues` — all already in the file.
- Produces: `applyTypedValue(rows: ScreenSubcategory[], values: RowValues, budget: number, rowId: string, typed: number): RowValues`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/investment-preferences.test.ts`, and add `applyTypedValue` to the import block.

```ts
describe("applyTypedValue", () => {
  const ROWS: ScreenSubcategory[] = [
    { id: "a", class: "equity", label: "Large-cap", recommended_pct_of_total: 0 },
    { id: "b", class: "equity", label: "Small-cap", recommended_pct_of_total: 0 },
    { id: "c", class: "equity", label: "US",        recommended_pct_of_total: 0 },
  ];
  const V: RowValues = { a: 30, b: 20, c: 10 };
  const sum = (v: RowValues) => round1(ROWS.reduce((s, r) => s + (v[r.id] ?? 0), 0));

  it("gives the typed row exactly what was typed", () => {
    expect(applyTypedValue(ROWS, V, 60, "a", 24)["a"]).toBe(24);
  });

  it("shrinks the siblings in proportion, not equally", () => {
    // b:20 and c:10 share the remaining 36 in a 2:1 ratio
    expect(applyTypedValue(ROWS, V, 60, "a", 24)).toEqual({ a: 24, b: 24, c: 12 });
  });

  it("clamps above the budget and empties the siblings", () => {
    expect(applyTypedValue(ROWS, V, 60, "a", 95)).toEqual({ a: 60, b: 0, c: 0 });
  });

  it("clamps a negative to zero", () => {
    expect(applyTypedValue(ROWS, V, 60, "a", -5)["a"]).toBe(0);
  });

  // The whole point of D3: the class total is untouched, so the bar above it
  // cannot move no matter what is typed.
  it("leaves the class total exactly on budget in every case", () => {
    for (const typed of [0, 7.3, 24, 59.9, 60, 120, -3]) {
      expect(sum(applyTypedValue(ROWS, V, 60, "a", typed))).toBe(60);
    }
  });

  // A class dragged flat has no proportions left to preserve; park the
  // remainder where it stays reachable, exactly as `normalise` does.
  it("parks the remainder on the first sibling when every sibling is at zero", () => {
    expect(applyTypedValue(ROWS, { a: 60, b: 0, c: 0 }, 60, "a", 10)).toEqual({ a: 10, b: 50, c: 0 });
  });

  it("sets the only other row to the exact complement in a two-row class", () => {
    const two = ROWS.slice(0, 2);
    expect(applyTypedValue(two, { a: 30, b: 30 }, 60, "a", 41.3)).toEqual({ a: 41.3, b: 18.7 });
  });

  it("puts a typed figure on the one-decimal grid", () => {
    expect(applyTypedValue(ROWS, V, 60, "a", 24.06)["a"]).toBe(24.1);
  });

  it("survives a zero budget without dividing by it", () => {
    expect(applyTypedValue(ROWS, { a: 0, b: 0, c: 0 }, 0, "a", 10)).toEqual({ a: 0, b: 0, c: 0 });
  });

  it("leaves rows outside the class alone", () => {
    const next = applyTypedValue(ROWS, { ...V, gold_commodities: 40 }, 60, "a", 24);
    expect(next.gold_commodities).toBe(40);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/investment-preferences.test.ts -t applyTypedValue`
Expected: FAIL — `applyTypedValue is not a function`.

- [ ] **Step 3: Implement it**

In `src/lib/investment-preferences.ts`, directly after `applySegmentDrag`:

```ts
/** A typed value for one row, with its SIBLINGS in the same class rescaled in
 *  proportion to absorb the difference. Clamped to `[0, budget]`, so the class
 *  total — and therefore the bar above it — is unchanged by construction
 *  (spec 2026-09-20 §7.2). Typing is a second way to reach the value a divider
 *  drag reaches, never a way to spend a class's budget on another class. */
export function applyTypedValue(
  rows: ScreenSubcategory[],
  values: RowValues,
  budget: number,
  rowId: string,
  typed: number,
): RowValues {
  const v = round1(Math.max(0, Math.min(budget, typed)));
  const out: RowValues = { ...values, [rowId]: v };
  const siblings = rows.filter((r) => r.id !== rowId);
  if (siblings.length === 0) return out;

  const rest = round1(budget - v);
  const total = siblings.reduce((s, r) => s + val(out, r.id), 0);
  // No proportions left to preserve. Park the remainder on the first sibling
  // so it stays reachable, the same rule `normalise` uses for a flat class.
  if (total <= 0) {
    siblings.forEach((r, i) => { out[r.id] = i === 0 ? rest : 0; });
    return out;
  }

  let sum = 0;
  for (const r of siblings) {
    out[r.id] = round1((val(out, r.id) / total) * rest);
    sum = round1(sum + val(out, r.id));
  }
  // Independent roundings do not land on `rest`; the leftover goes to the
  // largest sibling, where a tenth is least visible.
  const residual = round1(rest - sum);
  if (residual !== 0) {
    const biggest = siblings.reduce((a, b) => (val(out, b.id) > val(out, a.id) ? b : a));
    out[biggest.id] = round1(Math.max(0, val(out, biggest.id) + residual));
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/investment-preferences.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/investment-preferences.ts src/lib/investment-preferences.test.ts
git commit -m "feat(invest): add applyTypedValue, the typed-entry rebalance"
```

---

### Task 3: The third bar

**Files:**
- Modify: `src/components/invest/AssetMixBar.tsx` (heights only)
- Modify: `src/pages/InvestPreferences.tsx`
- Test: `src/pages/InvestPreferences.test.tsx`

**Interfaces:**
- Consumes: `mixFromValues`, `fromCurrentHoldings` (Task 1); `ScreenPreferenceGetResponse.current` (Task 1).
- Produces: a `today: RowValues | null` on the page, passed to `SubcategoryPins` in Task 5.

- [ ] **Step 1: Write the failing tests**

In `src/pages/InvestPreferences.test.tsx`, add a fixture next to the existing `GET` constant:

```ts
// 20 multi-asset -> 13/5/2, plus 30 large-cap, 20 short debt, 30 gold = 43/25/32.
// Today is deliberately a different shape so the bars cannot be confused.
const GET_WITH_TODAY = {
  ...GET,
  current: {
    holdings: [
      { subgroup: "low_beta_equities", pct_of_total: 70 },
      { subgroup: "short_debt", pct_of_total: 30 },
    ],
  },
};
```

and a new describe block at the end of the file:

```ts
describe("InvestPreferences — where you are today", () => {
  it("draws a third bar from the customer's holdings", async () => {
    mockGet(GET_WITH_TODAY);
    renderPage();
    await ready();
    expect(screen.getByText("Where you are today")).toBeInTheDocument();
    expect(screen.getByText("Across the categories you set here.")).toBeInTheDocument();
    // 70 equity / 30 debt / 0 commodity — the look-through of those rows.
    expect(screen.getByText("70.0%")).toBeInTheDocument();
  });

  // The backend does not send `current` yet, and a customer who holds nothing
  // has no today to show. Silence, not an empty bar.
  it("shows nothing about today when the payload carries no holdings", async () => {
    mockGet(GET);
    renderPage();
    await ready();
    expect(screen.queryByText("Where you are today")).toBeNull();
    expect(screen.queryByText("Across the categories you set here.")).toBeNull();
  });

  it("shows nothing about today when the holdings list is empty", async () => {
    mockGet({ ...GET, current: { holdings: [] } });
    renderPage();
    await ready();
    expect(screen.queryByText("Where you are today")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pages/InvestPreferences.test.tsx -t "where you are today"`
Expected: FAIL — `Where you are today` not found.

- [ ] **Step 3: Shorten the bars**

In `src/components/invest/AssetMixBar.tsx`, two class changes and nothing else:

- The bar root: `className={`relative flex h-[30px] rounded-lg bg-muted ...` → `h-[22px]`.
- The handle lozenge: `className="block h-[22px] w-[7px] rounded bg-[#D4A868] ...` → `h-[16px]`.

Leave the handle's `px-2.5 py-4` hit area alone — it already extends past the bar and is the touch target. Leave `labelMin = 9` alone: it is measured against the bar's *width*, which has not changed.

- [ ] **Step 4: Load `current` on the page**

In `src/pages/InvestPreferences.tsx`:

Add to the imports from `@/lib/investment-preferences`: `fromCurrentHoldings`, `mixFromValues`.

Add the state, next to the other `useState` calls:

```tsx
  const [today, setToday] = useState<RowValues | null>(null);
```

In the `.then((data) => { … })` block, after `setCarveOuts(...)`:

```tsx
        // A customer with nothing this screen can speak about has no today to
        // show, and the backend does not send the block at all yet. Either way
        // the bar and every today figure below simply are not there.
        setToday(
          data.current?.holdings?.length
            ? fromCurrentHoldings(data.current.holdings, data.subcategories)
            : null,
        );
```

Reset it on the error path? No — `setLoad("error")` already hides the whole body.

- [ ] **Step 5: Render the third bar**

In `src/pages/InvestPreferences.tsx`, directly after the existing `<AssetMixBar mode="reference" mix={rec} />`:

```tsx
            {today ? (
              <>
                <p className="mb-2 mt-4 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Where you are today
                </p>
                <AssetMixBar mode="reference" mix={mixFromValues(today, subs)} />
                {/* Frozen holdings (ELSS, direct stock) are not on this screen,
                    so this bar is not the whole portfolio — and the Invest page's
                    Current bar, which does include them, will read differently. */}
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  Across the categories you set here.
                </p>
              </>
            ) : null}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/pages/InvestPreferences.test.tsx src/components/invest/AssetMixBar.test.tsx`
Expected: PASS, both files — the existing AssetMixBar tests assert positions and z-index, not heights, so they are unaffected.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/components/invest/AssetMixBar.tsx src/pages/InvestPreferences.tsx src/pages/InvestPreferences.test.tsx
git commit -m "feat(invest): show where the customer is today as a third asset-mix bar"
```

---

### Task 4: `EditablePct` — double-click to type a percentage

**Files:**
- Create: `src/components/invest/EditablePct.tsx`
- Test: `src/components/invest/EditablePct.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `EditablePct`, props
  `{ value: number; label: string; onCommit: (v: number) => void; className?: string }`.
  Renders `12.5%` as text until edited; the input carries `aria-label={`${label} share`}`; the resting figure carries `role="button"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/invest/EditablePct.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import EditablePct from "./EditablePct";

afterEach(cleanup);

const pct = (onCommit = vi.fn(), value = 18.4) => {
  render(<EditablePct value={value} label="Large-cap" onCommit={onCommit} />);
  return onCommit;
};
const figure = () => screen.getByRole("button", { name: /large-cap/i });
const field = () => screen.getByRole("textbox", { name: /large-cap share/i });

describe("EditablePct", () => {
  it("rests as a figure, not a form", () => {
    pct();
    expect(figure().textContent).toBe("18.4%");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("opens an input on double-click, seeded with the current figure", () => {
    pct();
    fireEvent.doubleClick(figure());
    expect((field() as HTMLInputElement).value).toBe("18.4");
  });

  // Double-click is a mouse gesture; the bar's dividers are all arrow-keyable,
  // so this path has to be reachable from the keyboard too.
  it("opens on Enter when the figure is focused", () => {
    pct();
    fireEvent.keyDown(figure(), { key: "Enter" });
    expect(field()).toBeTruthy();
  });

  it("commits the typed number on Enter", () => {
    const onCommit = pct();
    fireEvent.doubleClick(figure());
    fireEvent.change(field(), { target: { value: "24" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(24);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("commits on blur", () => {
    const onCommit = pct();
    fireEvent.doubleClick(figure());
    fireEvent.change(field(), { target: { value: "7.5" } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith(7.5);
  });

  it("commits once, not twice, when Enter is followed by a blur", () => {
    const onCommit = pct();
    fireEvent.doubleClick(figure());
    fireEvent.change(field(), { target: { value: "24" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    fireEvent.blur(figure());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("restores the figure on Escape and commits nothing", () => {
    const onCommit = pct();
    fireEvent.doubleClick(figure());
    fireEvent.change(field(), { target: { value: "24" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(figure().textContent).toBe("18.4%");
  });

  // Nothing changed, so there is nothing to report — the figure just comes back.
  it("discards a value that is not a number", () => {
    const onCommit = pct();
    fireEvent.doubleClick(figure());
    fireEvent.change(field(), { target: { value: "abc" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(figure().textContent).toBe("18.4%");
  });

  it("discards an empty field", () => {
    const onCommit = pct();
    fireEvent.doubleClick(figure());
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/invest/EditablePct.test.tsx`
Expected: FAIL — cannot resolve `./EditablePct`.

- [ ] **Step 3: Implement the component**

Create `src/components/invest/EditablePct.tsx`:

```tsx
import { useState } from "react";

/**
 * A percentage the customer can double-click (or double-tap) to type over.
 *
 * It rests as text, so a row reads as a figure rather than a form, and the
 * input that replaces it is the same width and alignment so nothing shifts.
 * Commits on Enter or blur, cancels on Escape; a value that is not a number is
 * discarded, because nothing changed and there is nothing to report.
 *
 * The caller owns the rules — clamping, rebalancing, what the number may be.
 * This only reports the number that was typed.
 */
export default function EditablePct({
  value,
  label,
  onCommit,
  className = "",
}: {
  value: number;
  label: string;
  onCommit: (v: number) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  // Enter leaves the input mounted for one more tick, so a blur can arrive
  // after it. The null draft that Enter has already committed is the guard.
  const finish = (commit: boolean) => {
    if (draft === null) return;
    const n = Number(draft);
    if (commit && draft.trim() !== "" && Number.isFinite(n)) onCommit(n);
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        type="text"
        // type="number" brings spinners and a locale-dependent separator this
        // screen does not want; the parse below is the only validation needed.
        inputMode="decimal"
        aria-label={`${label} share`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); finish(true); }
          if (e.key === "Escape") { e.preventDefault(); finish(false); }
        }}
        className={`${className} rounded border border-[#D4A868] bg-background px-1 text-right font-medium tabular-nums text-foreground outline-none`}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${label} share, ${value.toFixed(1)} percent — double-click to type a value`}
      onDoubleClick={() => setDraft(value.toFixed(1))}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setDraft(value.toFixed(1));
        }
      }}
      className={`${className} cursor-text rounded text-right font-medium tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50`}
    >
      {`${value.toFixed(1)}%`}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/invest/EditablePct.test.tsx`
Expected: PASS, all ten cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/invest/EditablePct.tsx src/components/invest/EditablePct.test.tsx
git commit -m "feat(invest): add EditablePct, a percentage you can type over"
```

---

### Task 5: `MultiAssetBar` replaces `MultiAssetRow`

**Files:**
- Create: `src/components/invest/MultiAssetBar.tsx`
- Create: `src/components/invest/MultiAssetBar.test.tsx`
- Delete: `src/components/invest/MultiAssetRow.tsx`, `src/components/invest/MultiAssetRow.test.tsx`
- Modify: `src/components/invest/SubcategoryPins.tsx`
- Modify: `src/pages/InvestPreferences.tsx` (pass `today` down)

**Interfaces:**
- Consumes: `EditablePct` (Task 4); `today: RowValues | null` on the page (Task 3).
- Produces:
  - default export `MultiAssetBar`, props `{ value: number; max: number; label: string; recommended: number; today?: number; onChange: (v: number) => void }`
  - `SubcategoryPins` gains a required prop `today: RowValues | null`.

- [ ] **Step 1: Write the failing test**

Create `src/components/invest/MultiAssetBar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import MultiAssetBar from "./MultiAssetBar";

afterEach(cleanup);

const bar = (value: number, max = 100, onChange = vi.fn(), today?: number) => {
  render(
    <MultiAssetBar
      label="multi-asset funds"
      value={value}
      max={max}
      recommended={20}
      today={today}
      onChange={onChange}
    />,
  );
  return onChange;
};
const divider = () => screen.getByRole("slider", { name: /multi-asset share/i });

describe("MultiAssetBar", () => {
  it("spells out what the sleeve counts as in each class", () => {
    bar(20);
    // 65 / 25 / 10 of 20, equity carrying the residual
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("13.0% Equity");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("5.0% Debt");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("2.0% Commodity");
  });

  it("capitalises the backend's prose label", () => {
    bar(20);
    expect(screen.getByText("Multi-asset funds")).toBeTruthy();
  });

  // The bar spans the WHOLE portfolio, which is what makes a width here mean
  // what a width means on every other bar on the screen.
  it("fills its share of the whole portfolio, not of the cap", () => {
    bar(20, 50);
    expect(screen.getByTestId("ma-fill").style.width).toBe("20%");
  });

  it("names the cap the customer's own split can fund", () => {
    bar(20, 50);
    expect(divider().getAttribute("aria-valuemax")).toBe("50");
  });

  it("nudges by a half point with the arrow keys", () => {
    const onChange = bar(20, 50);
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(20.5);
  });

  // The cap is what retired the overdraw error: the divider simply stops, so
  // there is nothing left to warn about.
  it("stops at the cap rather than reporting an overdraw", () => {
    const onChange = bar(50, 50);
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it("stops at zero going the other way", () => {
    const onChange = bar(0, 50);
    fireEvent.keyDown(divider(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("shows today's figure, under a column header, only when there is one", () => {
    bar(20, 100, vi.fn(), 6.4);
    expect(screen.getByTestId("ma-today").textContent).toBe("6.4");
    // These are the first three figures on the screen — they cannot be bare.
    expect(screen.getByText("Prozpr")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    cleanup();
    bar(20);
    expect(screen.queryByTestId("ma-today")).toBeNull();
    expect(screen.queryByText("Today")).toBeNull();
  });

  it("lets the customer type the figure instead of dragging it", () => {
    const onChange = bar(20, 50);
    fireEvent.doubleClick(screen.getByRole("button", { name: /multi-asset share/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /multi-asset share/i }), {
      target: { value: "80" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: /multi-asset share/i }), { key: "Enter" });
    // Clamped to what the customer's own split can fund.
    expect(onChange).toHaveBeenCalledWith(50);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/invest/MultiAssetBar.test.tsx`
Expected: FAIL — cannot resolve `./MultiAssetBar`.

- [ ] **Step 3: Write the component**

Create `src/components/invest/MultiAssetBar.tsx`:

```tsx
import { useRef } from "react";

import EditablePct from "@/components/invest/EditablePct";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  MULTI_ASSET_ID,
  multiAssetDraw,
  round1,
  type RowValues,
} from "@/lib/investment-preferences";

/**
 * The multi-asset fund. One entry drawing on all three class budgets at once
 * (65/25/10), which is why it sits above the class groups rather than inside
 * one (spec §6).
 *
 * Drawn as the same filled bar and gold divider the class groups use, spanning
 * the WHOLE portfolio — so a width here means what a width means everywhere
 * else on the screen. It used to be the one Radix slider among bars, and it
 * read as a different kind of control.
 *
 * The track past `max` is the part the customer's own split cannot fund. The
 * divider stops there, which is what retired the overdraw error: a class budget
 * can no longer go negative, so there is nothing to warn about.
 */
export default function MultiAssetBar({
  value,
  max,
  label,
  recommended,
  today,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  recommended: number;
  today?: number;
  onChange: (v: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const values: RowValues = { [MULTI_ASSET_ID]: value };

  const commit = (pct: number) => onChange(round1(Math.max(0, Math.min(max, pct))));
  const pctFromClientX = (clientX: number): number => {
    const r = barRef.current?.getBoundingClientRect();
    return r && r.width ? ((clientX - r.left) / r.width) * 100 : 0;
  };

  // Pointer handling sits on the BAR, as it does on the class bars — and it is
  // also what preserves the old slider's click-to-jump.
  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    commit(pctFromClientX(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) commit(pctFromClientX(e.clientX));
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowRight" ? 0.5 : e.key === "ArrowLeft" ? -0.5 : 0;
    if (!step) return;
    e.preventDefault();
    commit(value + step);
  };

  return (
    <div className="border-b border-border pb-4">
      {/* The class groups carry this header too. Multi-asset sits above all of
          them, so without it the screen's first three figures are unlabelled. */}
      {today != null ? (
        <div className="mb-1 flex items-baseline gap-2 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
          <span className="ml-auto w-[44px] shrink-0 text-right">Prozpr</span>
          <span className="w-[44px] shrink-0 text-right">Today</span>
          <span className="w-[46px] shrink-0 text-right">You</span>
        </div>
      ) : null}

      <div className="flex items-baseline gap-2">
        <div className="min-w-0 truncate text-[13.5px] font-medium text-foreground">
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </div>
        <div className="ml-auto w-[44px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">
          {recommended.toFixed(1)}
        </div>
        {today != null ? (
          <div
            data-testid="ma-today"
            className="w-[44px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground"
          >
            {today.toFixed(1)}
          </div>
        ) : null}
        <EditablePct
          value={value}
          label="Multi-asset"
          onCommit={commit}
          className="w-[46px] shrink-0 text-[13.5px] font-semibold"
        />
      </div>

      <div
        ref={barRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative mt-3 flex h-[26px] touch-none rounded-lg bg-muted"
      >
        {/* Room the customer's own split cannot fund — visible, so the wall the
            divider hits is not a mystery. */}
        <div
          className="absolute inset-y-0 right-0 rounded-r-lg bg-foreground/[0.06]"
          style={{ width: `${Math.max(0, 100 - max)}%` }}
        />
        <div
          data-testid="ma-fill"
          className="h-full rounded-l-lg"
          style={{
            width: `${value}%`,
            // The fill is the sleeve's own 65/25/10, so the bar shows what the
            // entry counts as — the same fact the breakdown line states below.
            background:
              `linear-gradient(to right, ${CLASS_COLOR.equity} 0 65%, ` +
              `${CLASS_COLOR.debt} 65% 90%, ${CLASS_COLOR.others} 90% 100%)`,
          }}
        />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Multi-asset share of your portfolio"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          onKeyDown={onKey}
          className="group absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none px-2 py-3.5 focus:outline-none"
          style={{ left: `${value}%` }}
        >
          <span
            className="block h-[21px] w-[3px] rounded-full bg-[#D4A868] group-focus-visible:ring-2 group-focus-visible:ring-[#D4A868]/50"
            style={{ boxShadow: "0 1px 5px rgba(0,0,0,0.5)" }}
          />
        </div>
      </div>

      <div className="mt-2 text-[10.5px] tabular-nums">
        <span data-testid="ma-breakdown" className="text-muted-foreground">
          {`Counts as ${multiAssetDraw(values, "equity").toFixed(1)}% ${CLASS_LABEL.equity}` +
            ` · ${multiAssetDraw(values, "debt").toFixed(1)}% ${CLASS_LABEL.debt}` +
            ` · ${multiAssetDraw(values, "others").toFixed(1)}% ${CLASS_LABEL.others}`}
        </span>
      </div>
    </div>
  );
}
```

Note on the divider at `value === 0`: it sits on the bar's left edge. The flooring the other bars use exists to keep *two* dividers apart; there is only one here, its hit area extends past the bar, and a gold line hard left is a fair picture of "none of this". No flooring, and therefore no inverse to maintain.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/invest/MultiAssetBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Swap it in and thread `today` down**

In `src/components/invest/SubcategoryPins.tsx`:

Replace the `MultiAssetRow` import with:

```tsx
import MultiAssetBar from "@/components/invest/MultiAssetBar";
```

Add `today` to the props type and destructuring:

```tsx
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
  /** Where the customer sits today, or null when there is nothing to show. */
  today: RowValues | null;
  onChange: (next: RowValues) => void;
}) {
```

Replace the `<MultiAssetRow … />` element with:

```tsx
        <MultiAssetBar
          label={multiAsset.label}
          value={values[multiAsset.id] ?? 0}
          max={maxMultiAsset(mix)}
          recommended={multiAsset.recommended_pct_of_total}
          today={today ? (today[multiAsset.id] ?? 0) : undefined}
          onChange={(v) => commit({ ...values, [multiAsset.id]: v })}
        />
```

In `src/pages/InvestPreferences.tsx`, pass it:

```tsx
                <SubcategoryPins mix={mix} values={effective} subcategories={subs} today={today} onChange={setValues} />
```

- [ ] **Step 6: Delete the old component and its test**

```bash
git rm src/components/invest/MultiAssetRow.tsx src/components/invest/MultiAssetRow.test.tsx
```

Then confirm nothing else referenced it:

Run: `grep -rn "MultiAssetRow" src/`
Expected: no output.

- [ ] **Step 7: Run the whole suite**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS and clean. `SubcategoryPins.test.tsx` and `InvestPreferences.test.tsx` still pass — `today={null}` must be added to the render helper in `SubcategoryPins.test.tsx`'s `view()` for it to typecheck:

```tsx
const view = (onChange = vi.fn(), values: RowValues = VALUES, today: RowValues | null = null) => {
  render(<SubcategoryPins mix={MIX} values={values} subcategories={CATS} today={today} onChange={onChange} />);
  return onChange;
};
```

Note: `SubcategoryPins.test.tsx`'s existing "hands the parent a distribution that is still exactly on budget" test grabs `getAllByRole("slider")[0]`. The multi-asset divider is now a `slider` and comes first in the DOM, where the Radix thumb also was — so the index is unchanged. Verify it still passes rather than assuming.

- [ ] **Step 8: Commit**

```bash
git add -A src/components/invest src/pages/InvestPreferences.tsx
git commit -m "feat(invest): rebuild the multi-asset control as the screen's own bar"
```

---

### Task 6: Three columns and typed category values

**Files:**
- Modify: `src/components/invest/SubcategoryPins.tsx`
- Test: `src/components/invest/SubcategoryPins.test.tsx`, `src/pages/InvestPreferences.test.tsx`

**Interfaces:**
- Consumes: `applyTypedValue` (Task 2), `EditablePct` (Task 4), `today` prop (Task 5), `classAllocated` (existing).
- Produces: no new exports. New test ids: `today-class-${cls}` (a class's today share), `today-${row.id}` (a row's today share).

- [ ] **Step 1: Write the failing tests**

In `src/components/invest/SubcategoryPins.test.tsx`, add a today fixture beside the existing ones:

```ts
// A deliberately different shape from VALUES, so a today figure can never be
// mistaken for the customer's own.
const TODAY: RowValues = {
  multi_asset: 6, low_beta_equities: 40, high_beta_equities: 4, short_debt: 30, gold_commodities: 20,
};
```

and add these cases to the `SubcategoryPins` describe block:

```tsx
  it("heads a group with the three columns once today is known", () => {
    view(vi.fn(), VALUES, TODAY);
    expect(screen.getAllByText("Prozpr").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Today").length).toBeGreaterThan(0);
    expect(screen.getAllByText("You").length).toBeGreaterThan(0);
  });

  it("gives each row its own today figure", () => {
    view(vi.fn(), VALUES, TODAY);
    expect(screen.getByTestId("today-low_beta_equities").textContent).toBe("40.0");
    expect(screen.getByTestId("today-high_beta_equities").textContent).toBe("4.0");
  });

  // Compared like with like: the budget beside it is also net of multi-asset,
  // so this figure counts the class's own rows and nothing else.
  it("heads a class with today's share of its own rows, net of multi-asset", () => {
    view(vi.fn(), VALUES, TODAY);
    expect(screen.getByTestId("today-class-equity").textContent).toContain("44.0");
  });

  it("says nothing about today when there is no today", () => {
    view();
    expect(screen.queryByTestId("today-low_beta_equities")).toBeNull();
    expect(screen.queryByTestId("today-class-equity")).toBeNull();
    expect(screen.queryByText("Today")).toBeNull();
    // The old inline form survives untouched.
    expect(screen.getByText("Prozpr 18.0")).toBeTruthy();
  });

  it("lets a row be typed, rebalancing its siblings and nothing else", () => {
    const onChange = view();
    fireEvent.doubleClick(screen.getByRole("button", { name: /large-cap share/i }));
    fireEvent.change(screen.getByRole("textbox", { name: /large-cap share/i }), {
      target: { value: "20" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: /large-cap share/i }), { key: "Enter" });
    const next = onChange.mock.calls[0][0] as RowValues;
    expect(next.low_beta_equities).toBe(20);
    // The class total — and so the bar above it — is exactly where it was.
    expect(classAllocated(next, CATS, "equity")).toBe(classBudget(MIX, next, "equity"));
    expect(next.short_debt).toBe(20);
  });

  // Gold is the only commodity row, so it IS the budget: any number typed is
  // clamped straight back. Offer no edit rather than an edit that does nothing.
  it("leaves a single-row class as plain text", () => {
    view(vi.fn(), VALUES, TODAY);
    expect(screen.queryByRole("button", { name: /gold share/i })).toBeNull();
    expect(screen.getByText("30.0%")).toBeTruthy();
  });
```

In `src/pages/InvestPreferences.test.tsx`, add to the `where you are today` describe block:

```tsx
  it("types a category value without moving the class bar", async () => {
    mockGet(GET_WITH_TODAY);
    renderPage();
    await ready();
    openCats();
    const before = screen.getByTestId("budget-debt").textContent;
    fireEvent.doubleClick(screen.getByRole("button", { name: /short-duration share/i }));
    const box = screen.getByRole("textbox", { name: /short-duration share/i });
    fireEvent.change(box, { target: { value: "5" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByTestId("budget-debt").textContent).toBe(before);
    expect(saveBtn()).toBeEnabled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/invest/SubcategoryPins.test.tsx`
Expected: FAIL — `today-low_beta_equities` not found, no `button` named "Large-cap share".

- [ ] **Step 3: Add the imports**

In `src/components/invest/SubcategoryPins.tsx`, add `EditablePct` and extend the lib import:

```tsx
import EditablePct from "@/components/invest/EditablePct";
```

and add `applyTypedValue` and `classAllocated` to the existing `@/lib/investment-preferences` import list.

- [ ] **Step 4: Put today's share in the class header**

Replace the existing class-header budget span:

```tsx
              <span
                data-testid={`budget-${cls}`}
                className="ml-auto text-[11.5px] font-semibold tabular-nums text-foreground"
              >
                {`${budget.toFixed(1)}%`}
              </span>
```

with:

```tsx
              <span className="ml-auto flex items-baseline gap-1.5">
                {/* The class's OWN rows today, net of multi-asset — the budget
                    beside it is net of multi-asset too, so the two compare. */}
                {today ? (
                  <span
                    data-testid={`today-class-${cls}`}
                    className="text-[10.5px] tabular-nums text-muted-foreground"
                  >
                    {`today ${classAllocated(today, subcategories, cls).toFixed(1)} ·`}
                  </span>
                ) : null}
                <span
                  data-testid={`budget-${cls}`}
                  className="text-[11.5px] font-semibold tabular-nums text-foreground"
                >
                  {`${budget.toFixed(1)}%`}
                </span>
              </span>
```

- [ ] **Step 5: Add the column header and rebuild the row**

Replace the whole row list — the `<div className="mt-2.5 flex flex-col gap-1.5">…</div>` block — with:

```tsx
            {/* One header per group rather than the word "Prozpr" on every row:
                dropping that repetition is what buys the third column its width. */}
            {today ? (
              <div className="mt-2.5 flex items-baseline gap-2 text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="ml-auto w-[44px] shrink-0 text-right">Prozpr</span>
                <span className="w-[44px] shrink-0 text-right">Today</span>
                <span className="w-[46px] shrink-0 text-right">You</span>
              </div>
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
                  <span
                    className={`ml-auto shrink-0 text-[10.5px] tabular-nums text-muted-foreground ${
                      today ? "w-[44px] text-right" : ""
                    }`}
                  >
                    {today
                      ? c.recommended_pct_of_total.toFixed(1)
                      : `Prozpr ${c.recommended_pct_of_total.toFixed(1)}`}
                  </span>
                  {today ? (
                    <span
                      data-testid={`today-${c.id}`}
                      className="w-[44px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground"
                    >
                      {(today[c.id] ?? 0).toFixed(1)}
                    </span>
                  ) : null}
                  {/* A single-row class IS its budget: anything typed clamps
                      straight back, so offer text rather than a dead edit. */}
                  {rows.length > 1 ? (
                    <EditablePct
                      value={values[c.id] ?? 0}
                      label={shortLabel(c)}
                      onCommit={(v) => commit(applyTypedValue(rows, values, budget, c.id, v))}
                      className="w-[46px] shrink-0"
                    />
                  ) : (
                    <span className="w-[46px] shrink-0 text-right font-medium tabular-nums text-foreground">
                      {`${(values[c.id] ?? 0).toFixed(1)}%`}
                    </span>
                  )}
                </div>
              ))}
            </div>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/components/invest/SubcategoryPins.test.tsx src/pages/InvestPreferences.test.tsx`
Expected: PASS, both files.

- [ ] **Step 7: Run the whole suite, typecheck and lint**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS and clean.

- [ ] **Step 8: Verify it in the browser**

Run the dev server (`npm run dev`) and open `/invest/preferences` at a 375px-wide viewport.

Because the backend does not send `current` yet, the today affordances will not appear against the real API. To see them, temporarily stub the response — in the browser console is not enough, so add `current: { holdings: [...] }` to the resolved value in a scratch edit, check, then revert it. Do NOT commit the stub.

Confirm by eye:
- Three bars in the asset-mix card at the shorter height, card not noticeably taller than before.
- The multi-asset bar reads as the same kind of control as the class bars; its unreachable region past the cap is visible; the divider stops there.
- Three numeric columns line up down each group and do not wrap or truncate the label to nothing at 375px.
- Double-clicking a YOU figure opens an input the same width, with the text selected; Enter commits, Escape restores.
- Typing a number above a class budget snaps visibly to the budget.
- Gold offers no edit affordance (no focus ring, no cursor change).
- Both light and dark.

- [ ] **Step 9: Commit**

```bash
git add src/components/invest/SubcategoryPins.tsx src/components/invest/SubcategoryPins.test.tsx src/pages/InvestPreferences.test.tsx
git commit -m "feat(invest): show today's holdings per category and let values be typed"
```

---

## Backend dependency

`current` on `GET /profile/investment-preferences` is a separate change in `Prozpr_Backend`. Spec §3 defines the contract. Everything above ships and behaves correctly without it — the today affordances are simply not rendered. The backend work is out of scope for this plan.
