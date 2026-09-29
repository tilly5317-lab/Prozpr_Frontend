# Preferences — Today's Holdings, Multi-Asset Bar & Typed Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the customer where their portfolio sits today alongside their preference and Prozpr's on `/invest/preferences`, rebuild the multi-asset control in the screen's own bar idiom, and let category percentages be typed rather than only dragged.

**Architecture:** All new maths lands as pure functions in `src/lib/investment-preferences.ts` (no React, no I/O), unit-tested first; components stay thin. Today's holdings arrive as one optional `current` block on the existing preferences GET, convert to the screen's own `RowValues` at the page boundary, and are rendered by the same code that draws Prozpr's bar and rows. Every today affordance is conditional on that block, so this ships and behaves correctly before the backend field exists.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind, Vitest + @testing-library/react (jsdom 20). Tests: `npx vitest run <path>`. Types: `npx tsc -p tsconfig.app.json --noEmit`. Lint: `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-09-20-preferences-today-bar-and-typed-entry-design.md`. Read it first, including §2.1, which records what a review overturned in the first draft — several of those are traps you would otherwise fall back into.

## Global Constraints

- **One decimal is the screen's unit of precision.** Put every percentage on that grid with `round1` before storing, comparing or printing. Never compare two percentages with a raw epsilon.
- **`spread` is the only code that divides a budget across rows.** Both `normalise` and `applyTypedEntry` call it. Do not write a second proportional rescale.
- **A typed value never moves the class bar.** Clamped to its class budget (spec D3).
- **Graceful degrade is a requirement.** With `current` absent the screen must work and read correctly. Every task adding a today affordance also tests the absent case. Note the failure mode the review caught: a *partial* degrade, where one row loses its Prozpr label while its neighbours keep theirs, is worse than either state.
- **Colours come from `CLASS_COLOR`.** Gold interactive chrome is the literal `#D4A868` this screen already uses. New surfaces use `--muted` / `--foreground` tokens, never a literal, so they track the theme.
- **Type scale is fixed:** 9 / 10.5 / 11 / 11.5 / 12.5 / 13.5 / 15 / 28 px. Tracking is 0.1em / 0.14em / 0.16em. Do not introduce a new step.
- **Comments explain WHY a rule exists**, never what a line does, and cite spec sections as `(spec §N)` or `(spec §N, revised 2026-09-20)`. `src/lib/investment-preferences.ts` is the reference voice.
- **Commits** carry a `type(scope): subject` line, a body explaining the why, and `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Subjects say what the customer gets, not which symbol was added. Stage files explicitly — never `git add -A`.
- **Exact copy:** bar label `Where you are today`; captions `Excludes the N% you hold outside the categories you set here, such as ELSS and direct stocks. The rest is scaled to 100%.` and `Across the categories you set here.`; column headers `Prozpr` / `Today` / `You` (sentence case); the class header carries that same `Prozpr` / `Today` / `You` trio (revised 2026-09-26 from a `Today N · ` prefix).
- **Do not touch** the save payload, `toSavePins`, `fromSavedPins`, or the Invest page's Current-vs-target chart.

---

### Task 1: `spread`, `lookThroughMix`, `fromCurrentHoldings`, and the wire type

**Files:**
- Modify: `src/lib/api.ts` (the "Investment preferences (standing)" section, ~line 2838)
- Modify: `src/lib/investment-preferences.ts` (`normalise` ~line 147, `recommendedMix` ~line 295)
- Test: `src/lib/investment-preferences.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ScreenCurrentHolding { subgroup: string; pct_of_total: number }` (api.ts)
  - `ScreenPreferenceGetResponse.current?: { holdings: ScreenCurrentHolding[]; excluded_pct: number } | null`
  - `spread(out: RowValues, rows: ScreenSubcategory[], budget: number): void` — **module-private**, not exported
  - `lookThroughMix(values: RowValues, cats: ScreenSubcategory[]): ClassMix`
  - `fromCurrentHoldings(holdings: ScreenCurrentHolding[], cats: ScreenSubcategory[]): RowValues`
  - `recommendedMix(cats)` and `normalise(mix, values, cats)` — signatures and behaviour unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/investment-preferences.test.ts`; add `lookThroughMix` and `fromCurrentHoldings` to the import block at the top.

```ts
describe("lookThroughMix", () => {
  // The recommendation's own look-through is already covered by the existing
  // recommendedMix block; what the extraction buys is a bar from ANY rows.
  it("derives a bar from rows that are nothing like the recommendation", () => {
    expect(lookThroughMix({ low_beta_equities: 70, short_debt: 30 }, CATS)).toEqual({
      equity: 70, debt: 30, others: 0,
    });
  });
});

describe("fromCurrentHoldings", () => {
  // Today is a complete fact, not a partial one: a category the customer holds
  // nothing of is a real zero, which is what separates this from fromSavedPins.
  // The frozen subgroup is the case D6 turns on — it has no row here at all.
  it("covers every catalog row and nothing else", () => {
    const v = fromCurrentHoldings(
      [
        { subgroup: "short_debt", pct_of_total: 40 },
        { subgroup: "tax_efficient_equities", pct_of_total: 15 },
      ],
      CATS,
    );
    expect(Object.keys(v).sort()).toEqual(CATS.map((c) => c.id).sort());
    expect(v.short_debt).toBe(40);
    expect(v.low_beta_equities).toBe(0);
  });

  it("puts every figure on the one-decimal grid", () => {
    const v = fromCurrentHoldings([{ subgroup: "short_debt", pct_of_total: 21.63 }], CATS);
    expect(v.short_debt).toBe(21.6);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/investment-preferences.test.ts`
Expected: FAIL — `lookThroughMix is not a function`, `fromCurrentHoldings is not a function`.

- [ ] **Step 3: Add the wire type**

In `src/lib/api.ts`, immediately after the `ScreenSaved` interface:

```ts
/** One settable subcategory's share of what the customer holds TODAY. */
export interface ScreenCurrentHolding {
  subgroup: string;
  pct_of_total: number;
}
```

and inside `ScreenPreferenceGetResponse`, after `carve_outs_at_risk`:

```ts
  /** Where the customer sits today, across the categories this screen can set.
   *  Frozen holdings (ELSS, direct stock) have no row here, so the backend
   *  drops them and rescales the rest — `holdings` sums to 100 and
   *  `excluded_pct` is what was dropped, as a share of the whole portfolio.
   *  Optional: the backend does not send it yet, and absent, null and an empty
   *  list all read as "nothing to show" (spec §3.1, D8). */
  current?: { holdings: ScreenCurrentHolding[]; excluded_pct: number } | null;
```

- [ ] **Step 4: Extract `spread` out of `normalise`**

In `src/lib/investment-preferences.ts`, insert directly **above** `normalise`:

```ts
/** Spread `budget` across `rows` in proportion to what they hold now, writing
 *  into `out`.
 *
 *  This is the one place the screen knows how to divide a budget. A set that is
 *  entirely zero has no proportions left to preserve, so the whole budget parks
 *  on the first row, where it stays reachable instead of stranded; and eleven
 *  independent roundings do not land on the budget, so the leftover goes to the
 *  largest row, where a tenth is least visible. */
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
    const biggest = rows.reduce((a, b) => (val(out, b.id) > val(out, a.id) ? b : a));
    out[biggest.id] = round1(Math.max(0, val(out, biggest.id) + residual));
  }
}
```

Then replace `normalise`'s body (keep its existing doc comment, which still describes it exactly) with:

```ts
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
```

- [ ] **Step 5: Verify `normalise` is unchanged**

Run: `npx vitest run src/lib/investment-preferences.test.ts -t normalise`
Expected: PASS — the whole existing `normalise` describe block, untouched. If anything fails here, the extraction is wrong; fix it before going on.

- [ ] **Step 6: Extract `lookThroughMix` and add `fromCurrentHoldings`**

Replace the whole existing `recommendedMix` function and its doc comment with:

```ts
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
```

Add `ScreenCurrentHolding` to the existing `import type` on line 3, beside `SubcategoryPin`.

- [ ] **Step 7: Run the tests, typecheck and lint**

Run: `npx vitest run src/lib/investment-preferences.test.ts && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS and clean, including every pre-existing `recommendedMix` and `normalise` test.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api.ts src/lib/investment-preferences.ts src/lib/investment-preferences.test.ts
git commit -F - <<'EOF'
feat(invest): read today's holdings into the preferences screen's own shape

The backend will send `current.holdings` as a share of the settable
categories only, rescaled to 100 with ELSS and direct stock dropped, plus
`excluded_pct` so the screen can say what was left out (spec §3.1).

recommendedMix's body becomes lookThroughMix so the same derivation draws
Prozpr's bar and today's — the two cannot disagree about what a set of rows
adds up to. normalise's proportional rescale becomes `spread`, which
applyTypedEntry will share, so the screen keeps one way to divide a budget.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: `applyTypedEntry`

**Files:**
- Modify: `src/lib/investment-preferences.ts` (after `applySegmentDrag`)
- Test: `src/lib/investment-preferences.test.ts`

**Interfaces:**
- Consumes: `spread`, `round1`, the module-private `val` (Task 1).
- Produces: `applyTypedEntry(rows: ScreenSubcategory[], values: RowValues, budget: number, rowId: string, typed: number): RowValues`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/investment-preferences.test.ts`, and add `applyTypedEntry` to the import block. Reuse the file's existing `EQ_ROWS` fixture (ids `a`/`b`/`c`, class `equity`) rather than declaring another.

```ts
describe("applyTypedEntry", () => {
  const values: RowValues = { a: 30, b: 20, c: 10 };

  it("shrinks the siblings in proportion, not equally", () => {
    // b:20 and c:10 share the remaining 36 in a 2:1 ratio
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", 24)).toEqual({ a: 24, b: 24, c: 12 });
  });

  it("clamps above the budget and empties the siblings", () => {
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", 95)).toEqual({ a: 60, b: 0, c: 0 });
  });

  it("clamps a negative to zero", () => {
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", -5)["a"]).toBe(0);
  });

  // The whole point of D3: the class total is untouched, so the bar above it
  // cannot move no matter what is typed.
  it("leaves the class total exactly on budget in every case", () => {
    for (const typed of [0, 7.3, 24, 59.9, 60, 120, -3]) {
      const next = applyTypedEntry(EQ_ROWS, values, 60, "a", typed);
      expect(classAllocated(next, EQ_ROWS, "equity")).toBe(60);
    }
  });

  it("parks the remainder on the first sibling when every sibling is at zero", () => {
    expect(applyTypedEntry(EQ_ROWS, { a: 60, b: 0, c: 0 }, 60, "a", 10)).toEqual({
      a: 10, b: 50, c: 0,
    });
  });

  it("puts a typed figure on the one-decimal grid", () => {
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", 24.06)["a"]).toBe(24.1);
  });

  // `normalise` floors a budget at 0 and this must too, or a class whose
  // multi-asset draw exceeds its bar emits negative rows.
  it("floors the budget at zero rather than dividing by it or going negative", () => {
    for (const budget of [0, -3]) {
      const next = applyTypedEntry(EQ_ROWS, { a: 5, b: 5, c: 5 }, budget, "a", 10);
      expect(Object.values(next)).toEqual([0, 0, 0]);
    }
  });

  it("leaves rows outside the class alone", () => {
    const next = applyTypedEntry(EQ_ROWS, { ...values, gold_commodities: 40 }, 60, "a", 24);
    expect(next.gold_commodities).toBe(40);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/investment-preferences.test.ts -t applyTypedEntry`
Expected: FAIL — `applyTypedEntry is not a function`.

- [ ] **Step 3: Implement it**

Directly after `applySegmentDrag` in `src/lib/investment-preferences.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/investment-preferences.test.ts`
Expected: PASS, whole file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/investment-preferences.ts src/lib/investment-preferences.test.ts
git commit -F - <<'EOF'
feat(invest): clamp a typed category value to its class budget

A typed value is clamped to [0, budget] and only its siblings in the same
class absorb the difference, so the Equity/Debt/Commodity bar above it is
invariant under typing — the same way applySegmentDrag leaves a class total
untouched by construction (spec §7.2, revised 2026-09-20).

It shares normalise's `spread`, so a typed edit arrives at commit already
balanced and there is still exactly one place that divides a budget.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: The third bar

**Files:**
- Modify: `src/components/invest/AssetMixBar.tsx`
- Modify: `src/pages/InvestPreferences.tsx`
- Test: `src/components/invest/AssetMixBar.test.tsx`, `src/pages/InvestPreferences.test.tsx`

**Interfaces:**
- Consumes: `lookThroughMix`, `fromCurrentHoldings`, `ScreenPreferenceGetResponse.current` (Task 1).
- Produces: `today: RowValues | null` and `excludedPct: number` on the page; `today` is passed to `SubcategoryPins` in Task 5.

- [ ] **Step 1: Write the failing tests**

In `src/components/invest/AssetMixBar.test.tsx`, add:

```tsx
// The floor exists so two dividers cannot stack on one pixel. A reference bar
// has no dividers, so flooring it only invents a class the customer does not
// hold — and labelMin hides its label, leaving nothing to explain the sliver.
describe("AssetMixBar reference bars draw true shares", () => {
  it("draws nothing at all for a class at zero", () => {
    render(<AssetMixBar mode="reference" mix={{ equity: 70, debt: 30, others: 0 }} />);
    expect(screen.getByTestId("mix-seg-others").style.width).toBe("0%");
  });

  it("still floors the interactive bar, where the dividers live", () => {
    render(
      <AssetMixBar mode="interactive" mix={{ equity: 70, debt: 30, others: 0 }} onChange={vi.fn()} />,
    );
    expect(parseFloat(screen.getByTestId("mix-seg-others").style.width)).toBeGreaterThan(0);
  });
});
```

In `src/pages/InvestPreferences.test.tsx`, add a fixture beside `GET`:

```ts
// Today is deliberately a different shape from the recommendation, so the bars
// cannot be confused: 70 equity / 30 debt / 0 commodity.
const GET_WITH_TODAY = {
  ...GET,
  current: {
    holdings: [
      { subgroup: "low_beta_equities", pct_of_total: 70 },
      { subgroup: "short_debt", pct_of_total: 30 },
    ],
    excluded_pct: 18.4,
  },
};
```

and a new describe block at the end:

```tsx
describe("InvestPreferences — where you are today", () => {
  it("draws a third bar from the customer's holdings", async () => {
    mockGet(GET_WITH_TODAY);
    renderPage();
    await ready();
    expect(screen.getByText("Where you are today")).toBeInTheDocument();
    // The look-through of those rows is 70 / 30 / 0. Asserted on the third
    // bar's own segment rather than by text, both because "70.0%" could
    // collide with a label on either bar above it and because this is what
    // catches the live copy-paste risk: passing `rec` to all three bars.
    expect(screen.getAllByTestId("mix-seg-equity")[2].style.width).toBe("70%");
  });

  // The rescale is the surprising part: the surviving figures were inflated to
  // fill the gap, not merely shown without it.
  it("names what was excluded and that the rest was rescaled", async () => {
    mockGet(GET_WITH_TODAY);
    renderPage();
    await ready();
    expect(
      screen.getByText("Excludes the 18.4% you hold outside the categories you set here, such as ELSS and direct stocks. The rest is scaled to 100%."),
    ).toBeInTheDocument();
  });

  it("says only where the customer is when nothing was excluded", async () => {
    mockGet({ ...GET_WITH_TODAY, current: { ...GET_WITH_TODAY.current, excluded_pct: 0 } });
    renderPage();
    await ready();
    expect(screen.getByText("Across the categories you set here.")).toBeInTheDocument();
  });

  // The backend does not send `current` yet, and a customer who holds nothing
  // has no today to show. All three inputs are deliberately one state — the
  // frontend cannot tell them apart and shows nothing for each (spec D8).
  it.each([
    ["absent", undefined],
    ["null", null],
    ["an empty list", { holdings: [], excluded_pct: 0 }],
  ])("shows nothing about today when current is %s", async (_label, current) => {
    mockGet({ ...GET, current });
    renderPage();
    await ready();
    expect(screen.queryByText("Where you are today")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/invest/AssetMixBar.test.tsx src/pages/InvestPreferences.test.tsx`
Expected: FAIL — `mix-seg-others` not found; `Where you are today` not found.

- [ ] **Step 3: Change `AssetMixBar`**

Three edits, nothing else.

Replace the `widths` line and its comment:

```tsx
  // Drawn widths. The floor keeps a class squeezed to nothing from putting its
  // two dividers on the same pixel — but only the interactive bar HAS dividers,
  // so flooring a reference bar would invent a visible sliver of a class the
  // customer does not hold, with its label suppressed by labelMin so nothing
  // explains it (spec §4, revised 2026-09-20).
  const widths =
    mode === "interactive"
      ? flooredShares([mix.equity, mix.debt, mix.others], 100)
      : [mix.equity, mix.debt, mix.others];
```

Replace the bar root's className — only the reference bar shrinks, because the
customer's height concern was about the card and the drag control should not pay for it:

```tsx
      className={`relative flex rounded-lg bg-muted ${
        mode === "interactive" ? "h-[30px] overflow-visible" : "h-[22px] overflow-hidden"
      }`}
```

Add a test id to each segment, so a width can be asserted (the class bars already do this
with `seg-${r.id}`):

```tsx
          data-testid={`mix-seg-${k}`}
```

Leave the handle lozenge at `h-[22px]` and its `px-2.5 py-4` hit area alone.

- [ ] **Step 4: Load `current` on the page**

In `src/pages/InvestPreferences.tsx`, add `fromCurrentHoldings` and `lookThroughMix` to the
`@/lib/investment-preferences` import, and add state beside the others:

```tsx
  const [today, setToday] = useState<RowValues | null>(null);
  const [excludedPct, setExcludedPct] = useState(0);
```

In the `.then((data) => …)` block, after `setCarveOuts(...)`:

```tsx
        // Absent, null and empty all read the same: the backend does not send
        // this yet, and a customer holding nothing has no today either (D8).
        const holdings = data.current?.holdings ?? [];
        setToday(holdings.length ? fromCurrentHoldings(holdings, data.subcategories) : null);
        setExcludedPct(data.current?.excluded_pct ?? 0);
```

- [ ] **Step 5: Render the third bar, and move the drag line under the bar it describes**

In the asset-mix `<section>`, the block from "Your preference" to the closing hint becomes:

```tsx
            <p className="mb-2 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground">
              Your preference
            </p>
            <AssetMixBar mode="interactive" mix={mix} onChange={changeMix} />
            {/* Directly under the bar it describes: with three bars in the card
                it otherwise reads as a note about the today bar. */}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {"Drag the gold handles to set your split — it always totals 100%."}
            </p>

            <p className="mb-2 mt-4 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              Prozpr recommends
            </p>
            <AssetMixBar mode="reference" mix={rec} />

            {today ? (
              <>
                <p className="mb-2 mt-4 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
                  Where you are today
                </p>
                <AssetMixBar mode="reference" mix={lookThroughMix(today, subs)} />
                {/* The rescale is the surprising part, not the omission: these
                    figures were inflated to fill the gap the excluded holdings left (spec §3.4). */}
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  {excludedPct > 0
                    ? `Excludes the ${excludedPct.toFixed(1)}% you hold outside the categories you set here, such as ELSS and direct stocks. The rest is scaled to 100%.`
                    : "Across the categories you set here."}
                </p>
              </>
            ) : null}
```

The old trailing "Drag the gold handles…" paragraph at the bottom of the section is now moved,
not duplicated — delete it from its old position.

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS and clean. The existing `AssetMixBar` tests assert `zIndex`, `left` and label
text, so neither the height nor the floor change touches them — confirm rather than assume.

- [ ] **Step 7: Commit**

```bash
git add src/components/invest/AssetMixBar.tsx src/components/invest/AssetMixBar.test.tsx src/pages/InvestPreferences.tsx src/pages/InvestPreferences.test.tsx
git commit -F - <<'EOF'
feat(invest): show where the customer is today as a third asset-mix bar

A customer deciding whether 60% equity suits them could not see that they
sit at 71% today. The third bar is the look-through of their real holdings,
drawn by the same function as the other two so the three are comparable.

Only the reference bars shrink to 22px: the drag control should not pay for
the card's height. Reference bars also stop flooring a zero class to a
visible sliver — that floor exists to keep two dividers off one pixel, and a
reference bar has none, so on it it only invented gold nobody owns.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: `EditableFigure`

**Files:**
- Create: `src/components/invest/EditableFigure.tsx`
- Test: `src/components/invest/EditableFigure.test.tsx`

**Interfaces:**
- Consumes: `round1` from `@/lib/investment-preferences`.
- Produces: default export `EditableFigure`, props
  `{ value: number; max: number; label: string; onCommit: (v: number) => void; className: string }`.
  Resting state is a `<button>` with `aria-label={`${label} share`}`; editing state is an
  `<input>` with the **same** aria-label.

- [ ] **Step 1: Write the failing test**

Create `src/components/invest/EditableFigure.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import EditableFigure from "./EditableFigure";

afterEach(cleanup);

const figure = (max = 25, onCommit = vi.fn(), value = 18.4) => {
  render(
    <EditableFigure value={value} max={max} label="Large-cap" onCommit={onCommit} className="w-[46px]" />,
  );
  return onCommit;
};
const resting = () => screen.getByRole("button", { name: "Large-cap share" });
const field = () => screen.getByRole("textbox", { name: "Large-cap share" }) as HTMLInputElement;

describe("EditableFigure", () => {
  it("rests as a figure, not a form", () => {
    figure();
    expect(resting().textContent).toBe("18.4%");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Single tap, not double: this is a touch-first app, and on iOS a double-tap
  // on text raises the selection callout instead (spec §7.1).
  it("opens on a single click, seeded with the current figure", () => {
    figure();
    fireEvent.click(resting());
    expect(field().value).toBe("18.4");
  });

  it("commits the typed number on Enter", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "12" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(12);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("commits on blur", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "7.5" } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith(7.5);
  });

  // An over-budget figure is never displayable, so nothing has to be silently
  // rejected on commit — which is what "it ignored me" used to look like.
  it("clamps to max while the customer is still typing", () => {
    figure(25);
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "30" } });
    // `String(max)`, not `max.toFixed(1)`: a clamped "25.0" plus one more
    // keystroke is "25.00", which is not > 25, so it would sail through and
    // put a second decimal on a one-decimal screen.
    expect(field().value).toBe("25");
  });

  it("lets a part-typed value through on its way to a legal one", () => {
    figure(25);
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "" } });
    expect(field().value).toBe("");
    fireEvent.change(field(), { target: { value: "2" } });
    expect(field().value).toBe("2");
  });

  it("restores the figure on Escape and commits nothing", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "12" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(resting().textContent).toBe("18.4%");
  });

  it("returns focus to the figure when the keyboard closed the edit", () => {
    figure();
    fireEvent.click(resting());
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(document.activeElement).toBe(resting());
  });

  // ...but not otherwise: pulling focus back on blur drags it away from
  // whatever the customer had just tapped.
  it("leaves focus alone when the customer taps away", () => {
    figure();
    fireEvent.click(resting());
    fireEvent.blur(field());
    expect(document.activeElement).not.toBe(resting());
  });

  // A stray tap-then-blur would otherwise flip an untouched customer from
  // "Following Prozpr's suggestion" to "Your own split" and enable Save,
  // changing what a save MEANS with no edit having happened (spec §7.2).
  it("commits nothing when the value did not change", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("discards a value that is not a number", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "abc" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(resting().textContent).toBe("18.4%");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/invest/EditableFigure.test.tsx`
Expected: FAIL — cannot resolve `./EditableFigure`.

- [ ] **Step 3: Implement the component**

Create `src/components/invest/EditableFigure.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";

import { round1 } from "@/lib/investment-preferences";

/**
 * A percentage the customer can tap to type over.
 *
 * It rests as a tinted pill rather than bare text, which does three jobs at
 * once: it says the figure is editable, it makes the customer's OWN number the
 * brightest thing on a row that carries three, and it grows a 46×16 target to
 * something a thumb can hit (spec §7.1).
 *
 * The field clamps to `max` on every keystroke, so an over-budget figure is
 * never displayable. That is the whole point: a value rejected at commit and
 * replaced in the same frame is indistinguishable from the app ignoring you.
 *
 * `select-none` also suppresses iOS's selection callout. `touch-manipulation`
 * and `-webkit-touch-callout` are not needed: this app's viewport already
 * disables double-tap zoom, and neither appears anywhere else in `src/`.
 *
 * The caller still owns the rebalance — this only reports a number in range.
 */
export default function EditableFigure({
  value,
  max,
  label,
  onCommit,
  className,
}: {
  value: number;
  max: number;
  label: string;
  onCommit: (v: number) => void;
  className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const restRef = useRef<HTMLButtonElement>(null);
  const byKey = useRef(false);

  // A keyboard user who commits or cancels would otherwise be dropped on
  // <body>: the input unmounts and the button replacing it comes back
  // unfocused. Only the KEY paths — restoring focus after a blur would drag it
  // back from whatever the customer had just tapped.
  useEffect(() => {
    if (draft === null && byKey.current) {
      byKey.current = false;
      restRef.current?.focus();
    }
  }, [draft]);

  const finish = (commit: boolean) => {
    if (draft === null) return;
    const n = round1(Number(draft));
    // An unchanged value must not commit: it would engage the customer's own
    // distribution — turning "engine decides" into a pin — with no edit.
    if (commit && draft.trim() !== "" && Number.isFinite(n) && n !== value) onCommit(n);
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        // type="number" brings spinners and a locale-dependent separator into a
        // 46px cell; the parse in `finish` is the only validation needed.
        type="text"
        inputMode="decimal"
        aria-label={`${label} share`}
        value={draft}
        onChange={(e) => {
          const n = Number(e.target.value);
          // String(max), not toFixed(1): "25.0" plus another keystroke is
          // "25.00", which is not > 25 and would slip a second decimal past.
          setDraft(Number.isFinite(n) && n > max ? String(max) : e.target.value);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== "Escape") return;
          e.preventDefault();
          byKey.current = true;
          finish(e.key === "Enter");
        }}
        className={`rounded bg-muted px-1 text-right font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50 ${className}`}
      />
    );
  }

  return (
    <button
      ref={restRef}
      type="button"
      aria-label={`${label} share`}
      title="Tap to type a value"
      onClick={() => setDraft(value.toFixed(1))}
      className={`select-none rounded bg-foreground/[0.04] px-1 py-1 text-right font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50 ${className}`}
    >
      {`${value.toFixed(1)}%`}
    </button>
  );
}
```

`${className}` goes **last** in both strings so a caller's `text-[13.5px]` wins over the
component's own utilities rather than losing to stylesheet order.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/invest/EditableFigure.test.tsx`
Expected: PASS, all eleven cases.

- [ ] **Step 5: Commit**

```bash
git add src/components/invest/EditableFigure.tsx src/components/invest/EditableFigure.test.tsx
git commit -F - <<'EOF'
feat(invest): type a percentage over any figure on the screen

Tap a figure and it becomes a field. Single tap rather than double-tap-only:
this is a touch-first app, onDoubleClick appears nowhere else in it, and on
iOS a double-tap on text raises the selection callout instead (spec §7.1).

The field clamps to its ceiling on every keystroke, so an over-budget number
is never displayable — a value rejected at commit and replaced in the same
frame reads as the app ignoring you. An unchanged value commits nothing, or
a stray tap would turn "engine decides" into a pinned distribution.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `MultiAssetBar`

Builds the component and nothing else — it is wired in, and `MultiAssetRow` deleted, in Task 6.
Keeping the two apart means no commit ships a half-converted categories section.

**Files:**
- Create: `src/components/invest/MultiAssetBar.tsx`, `src/components/invest/MultiAssetBar.test.tsx`

**Interfaces:**
- Consumes: `EditableFigure` (Task 4).
- Produces: default export `MultiAssetBar`, props
  `{ value: number; max: number; label: string; recommended: number; today: number | null; onChange: (v: number) => void }`.

- [ ] **Step 1: Write the failing test**

Create `src/components/invest/MultiAssetBar.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import MultiAssetBar from "./MultiAssetBar";

afterEach(cleanup);

const bar = (value: number, max = 100, today: number | null = null, onChange = vi.fn()) => {
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
const divider = () => screen.getByRole("slider", { name: "Multi-asset share of your portfolio" });

// jsdom gives every element a zero-width box, and the component refuses to act
// on a bar it cannot measure — the guard that stops a press on an unlaid-out
// bar from silently emptying the sleeve.
const layOut = (width = 300) => {
  const el = screen.getByTestId("ma-bar");
  el.getBoundingClientRect = () =>
    ({ left: 0, right: width, width, top: 0, bottom: 26, height: 26, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
};

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
  // what a width means on every other bar on the screen (spec §5).
  it("fills its share of the whole portfolio, not of the cap", () => {
    bar(20, 50);
    expect(screen.getByTestId("ma-fill").style.width).toBe("20%");
  });

  it("names the cap the customer's own split can fund", () => {
    bar(20, 50);
    expect(divider().getAttribute("aria-valuemax")).toBe("50");
  });

  // The only thing on the screen that states the ceiling: no tint or pattern
  // in this palette is legible enough to carry it (spec §5).
  it("says in words what the cap is", () => {
    bar(20, 32);
    expect(screen.getByText("Up to 32.0% — that's what your split can fund.")).toBeTruthy();
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

  it("grabs the divider and drags, clamped to the cap", () => {
    const onChange = bar(20, 50);
    const el = layOut(300);
    fireEvent.pointerDown(el, { clientX: 63, pointerId: 1 });   // 21% — on the divider
    expect(onChange).not.toHaveBeenCalled();                     // grabbing moves nothing
    fireEvent.pointerMove(el, { clientX: 270, pointerId: 1 });   // 90% — past the cap
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  // ClassSegmentBar's rule: a press that is not on a divider does nothing. The
  // Radix slider jumped to it, which on a phone is one stray tap from a reset.
  it("ignores a press on open track", () => {
    const onChange = bar(20, 50);
    const el = layOut(300);
    fireEvent.pointerDown(el, { clientX: 30, pointerId: 1 });    // 10%
    fireEvent.pointerMove(el, { clientX: 45, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("refuses to act on a bar it cannot measure", () => {
    const onChange = bar(20, 50);
    fireEvent.pointerDown(screen.getByTestId("ma-bar"), { clientX: 60, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows today's figure when there is one", () => {
    bar(20, 100, 6.4);
    expect(screen.getByTestId("ma-today").textContent).toBe("6.4");
  });

  it("says nothing about today when there is none", () => {
    bar(20);
    expect(screen.queryByTestId("ma-today")).toBeNull();
  });

  it("lets the customer type the figure instead of dragging it", () => {
    const onChange = bar(20, 50);
    fireEvent.click(screen.getByRole("button", { name: "Multi-asset share" }));
    const box = screen.getByRole("textbox", { name: "Multi-asset share" });
    fireEvent.change(box, { target: { value: "40" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(40);
  });

  // The sleeve is 10% commodity, so commodity alone sets the cap: a customer
  // who drags commodity to zero kills this fund. Say so rather than leave two
  // live-but-dead affordances on the screen (spec §5).
  it("explains itself instead of going dead when nothing can fund it", () => {
    bar(0, 0);
    expect(
      screen.getByText("This fund is 10% commodity. Give commodity some room and you can hold it."),
    ).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: "Multi-asset share" })).toBeNull();
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

import EditableFigure from "@/components/invest/EditableFigure";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  MULTI_ASSET_ID,
  multiAssetDraw,
  round1,
  type RowValues,
} from "@/lib/investment-preferences";

/** How close to the divider a press has to land to grab it. The same tolerance
 *  `ClassSegmentBar` uses, for the same reason. */
const HIT_PX = 16;

/**
 * The multi-asset fund. One entry drawing on all three class budgets at once
 * (65/25/10), which is why it sits above the class groups rather than inside
 * one (spec §6).
 *
 * Drawn as the same filled bar and gold divider the class groups use, spanning
 * the WHOLE portfolio — so a width here means what a width means everywhere
 * else on the screen. It used to be the one Radix slider among bars, and it
 * read as a different kind of control (spec §5, revised 2026-09-20).
 *
 * The ceiling `max` is stated in words rather than drawn. Measured against the
 * real palette every tonal step sits between 1.1:1 and 1.9:1 against the track,
 * and a 10%-alpha hatch on a 26px bar is barely better — where a sentence is
 * legible in both themes, translatable, and readable by a screen reader.
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
  today: number | null;
  onChange: (v: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const values: RowValues = { [MULTI_ASSET_ID]: value };
  // Commodity alone sets the cap — the sleeve is 10% of it — so a customer who
  // drags commodity to nothing leaves this fund unfundable.
  const live = max > 0;

  const commit = (pct: number) => onChange(round1(Math.max(0, Math.min(max, pct))));
  const pctFromClientX = (clientX: number, r: DOMRect): number => ((clientX - r.left) / r.width) * 100;

  const onDown = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect();
    // A bar with no layout box measures every press at 0%, which would empty
    // the sleeve on a touch. Guard BEFORE capturing, as ClassSegmentBar does.
    if (!live || !r?.width) return;
    // A press grabs the divider or does nothing at all. The Radix slider
    // jumped to the press, which on a phone is one stray tap from a reset.
    if (Math.abs(pctFromClientX(e.clientX, r) - value) > (HIT_PX / r.width) * 100) return;
    dragging.current = true;
    // jsdom has no setPointerCapture; without the optional call the drag path
    // cannot be tested at all.
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    const r = barRef.current?.getBoundingClientRect();
    if (dragging.current && r?.width) commit(pctFromClientX(e.clientX, r));
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
      <div className="flex items-baseline gap-2">
        <div className="min-w-0 truncate text-[13.5px] font-medium text-foreground">
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </div>
        <div className="ml-auto w-[40px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">
          {recommended.toFixed(1)}
        </div>
        {today != null ? (
          <div
            data-testid="ma-today"
            className="w-[40px] shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground"
          >
            {today.toFixed(1)}
          </div>
        ) : null}
        {live ? (
          <EditableFigure
            value={value}
            max={max}
            label="Multi-asset"
            onCommit={commit}
            className="w-[46px] shrink-0 text-[13.5px]"
          />
        ) : (
          <span className="w-[46px] shrink-0 text-right text-[13.5px] font-semibold tabular-nums text-foreground">
            {`${value.toFixed(1)}%`}
          </span>
        )}
      </div>

      <div
        ref={barRef}
        data-testid="ma-bar"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative mt-3 flex h-[26px] touch-none rounded-lg bg-muted"
      >
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
        {/* At value 0 the divider sits on the bar's left edge. The flooring the
            other bars use exists to keep TWO dividers apart; there is only one
            here, its hit area extends past the bar, and a gold line hard left
            is a fair picture of "none of this". */}
        {live ? (
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
        ) : null}
      </div>

      <div className="mt-2 text-[10.5px] leading-relaxed tabular-nums text-muted-foreground">
        {live ? (
          <>
            <span data-testid="ma-breakdown">
              {`Counts as ${multiAssetDraw(values, "equity").toFixed(1)}% ${CLASS_LABEL.equity}` +
                ` · ${multiAssetDraw(values, "debt").toFixed(1)}% ${CLASS_LABEL.debt}` +
                ` · ${multiAssetDraw(values, "others").toFixed(1)}% ${CLASS_LABEL.others}`}
            </span>
            {max < 100 ? (
              <span className="block">{`Up to ${max.toFixed(1)}% — that's what your split can fund.`}</span>
            ) : null}
          </>
        ) : (
          <span>{"This fund is 10% commodity. Give commodity some room and you can hold it."}</span>
        )}
      </div>
    </div>
  );
}
```

Widths are written as bare `${value}%`. `value` is already on the one-decimal grid — `commit`
and `normalise` both `round1` it — so there is no float artifact to trim and no need for
`ClassSegmentBar`'s private `cssPct`.

- [ ] **Step 4: Run the test, typecheck and lint**

Run: `npx vitest run src/components/invest/MultiAssetBar.test.tsx && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS and clean. Nothing renders this component yet, which is intentional.

- [ ] **Step 5: Commit**

```bash
git add src/components/invest/MultiAssetBar.tsx src/components/invest/MultiAssetBar.test.tsx
git commit -F - <<'EOF'
feat(invest): build the multi-asset control as the screen's own bar

It was the one Radix slider among filled bars and read as a different kind
of control. This is the same 26px bar and gold divider the class groups use,
spanning the whole portfolio so a width means what a width means everywhere
else on the screen (spec §5, revised 2026-09-20).

A press grabs the divider or does nothing, matching ClassSegmentBar — the
slider jumped to the press, which on a phone is one stray tap from a reset.
The ceiling is stated in words; no tone or pattern in this palette is legible
enough to carry it. Not yet wired in — Task 6 swaps it for MultiAssetRow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: The categories section — columns, typed rows, and the swap-in

One task because these edits all land in `SubcategoryPins.tsx` and must ship together: half of
them would leave numeric columns with no header, or a multi-asset row labelled differently from
the rows beneath it.

**Files:**
- Modify: `src/components/invest/SubcategoryPins.tsx`, `src/pages/InvestPreferences.tsx`
- Delete: `src/components/invest/MultiAssetRow.tsx`, `src/components/invest/MultiAssetRow.test.tsx`
- Test: `src/components/invest/SubcategoryPins.test.tsx`, `src/pages/InvestPreferences.test.tsx`

**Interfaces:**
- Consumes: `applyTypedEntry` (Task 2), `today` on the page (Task 3), `EditableFigure` (Task 4), `MultiAssetBar` (Task 5), `classAllocated`.
- Produces: `SubcategoryPins` gains a required prop `today: RowValues | null`. Test ids: `today-${cls}`, `today-${row.id}`, `you-${row.id}`, `row-${row.id}`.

- [ ] **Step 1: Write the failing tests**

In `src/components/invest/SubcategoryPins.test.tsx`, update the render helper first — `today` is
required. The callback stays **last**, as `ClassSegmentBar.test.tsx` has it, so the five existing
call sites (`view()` ×4 and `const onChange = view();`) need no edits:

```tsx
const view = (values: RowValues = VALUES, today: RowValues | null = null, onChange = vi.fn()) => {
  render(<SubcategoryPins mix={MIX} values={values} subcategories={CATS} today={today} onChange={onChange} />);
  return onChange;
};
```

Add a fixture beside the existing ones:

```ts
// A deliberately different shape from VALUES, so a today figure can never be
// mistaken for the customer's own.
const TODAY: RowValues = {
  multi_asset: 6, low_beta_equities: 40, high_beta_equities: 4, short_debt: 30, gold_commodities: 20,
};
```

and these cases:

```tsx
  it("heads the whole section with the three columns once today is known", () => {
    view(VALUES, TODAY);
    // Once, above multi-asset — not per group. The columns are identical all
    // the way down, and four copies is three too many.
    expect(screen.getAllByText("Prozpr")).toHaveLength(1);
    expect(screen.getAllByText("Today")).toHaveLength(1);
    expect(screen.getAllByText("You")).toHaveLength(1);
  });

  it("gives each row its own today figure", () => {
    view(VALUES, TODAY);
    expect(screen.getByTestId("today-low_beta_equities").textContent).toBe("40.0");
    expect(screen.getByTestId("today-high_beta_equities").textContent).toBe("4.0");
  });

  // Compared like with like: the budget beside it is also net of multi-asset,
  // so this figure counts the class's own rows and nothing else.
  it("heads a class with today's share of its own rows, net of multi-asset", () => {
    view(VALUES, TODAY);
    expect(screen.getByTestId("today-equity").textContent).toContain("44.0");
  });

  it("drops the today column, and nothing else, when there is no today", () => {
    view();
    expect(screen.getByText("Prozpr")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByTestId("today-low_beta_equities")).toBeNull();
    expect(screen.queryByTestId("today-equity")).toBeNull();
  });

  it("lets a row be typed, rebalancing its siblings and nothing else", () => {
    const onChange = view();
    fireEvent.click(screen.getByRole("button", { name: "Large-cap share" }));
    const box = screen.getByRole("textbox", { name: "Large-cap share" });
    fireEvent.change(box, { target: { value: "20" } });
    fireEvent.keyDown(box, { key: "Enter" });
    const next = onChange.mock.calls[0][0] as RowValues;
    expect(next.low_beta_equities).toBe(20);
    // The class total — and so the bar above it — is exactly where it was.
    expect(classAllocated(next, CATS, "equity")).toBe(classBudget(MIX, next, "equity"));
    expect(next.short_debt).toBe(20);
  });

  // Typing moves every sibling at once where a drag trades with one neighbour,
  // so the customer has to see it happen (spec D7).
  it("flashes the rows a typed value moved", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Large-cap share" }));
    const box = screen.getByRole("textbox", { name: "Large-cap share" });
    fireEvent.change(box, { target: { value: "20" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByTestId("row-high_beta_equities").dataset.flashed).toBe("true");
    expect(screen.getByTestId("row-low_beta_equities").dataset.flashed).toBeUndefined();
  });

  // Gold is the only commodity row, so it IS the budget: any number typed is
  // clamped straight back. Offer no edit rather than an edit that does nothing.
  it("leaves a single-row class as plain text", () => {
    view(VALUES, TODAY);
    expect(screen.queryByRole("button", { name: "Gold share" })).toBeNull();
    expect(screen.getByTestId("you-gold_commodities").textContent).toBe("30.0%");
  });

  // Same rule, same condition ClassSegmentBar uses for its dividers: a field
  // that can only ever return 0.0 is not an affordance.
  it("leaves a class with no budget as plain text", () => {
    view({ ...VALUES, multi_asset: 66.1 });
    expect(screen.queryByRole("button", { name: "Large-cap share" })).toBeNull();
  });
```

In `src/pages/InvestPreferences.test.tsx`, add to the `where you are today` block:

```tsx
  it("types a category value without moving the class bar", async () => {
    mockGet(GET_WITH_TODAY);
    renderPage();
    await ready();
    openCats();
    const before = screen.getByTestId("budget-debt").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Short-duration share" }));
    const box = screen.getByRole("textbox", { name: "Short-duration share" });
    fireEvent.change(box, { target: { value: "5" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByTestId("budget-debt").textContent).toBe(before);
    expect(saveBtn()).toBeEnabled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/invest/SubcategoryPins.test.tsx`
Expected: FAIL — no `Prozpr` header, no `today-low_beta_equities`, no button named
`Large-cap share`.

- [ ] **Step 3: Swap in `MultiAssetBar` and take the `today` prop**

In `src/components/invest/SubcategoryPins.tsx`, replace the `MultiAssetRow` import with
`import MultiAssetBar from "@/components/invest/MultiAssetBar";`, add
`import { useEffect, useState } from "react";` and
`import EditableFigure from "@/components/invest/EditableFigure";`, and add `applyTypedEntry`
and `classAllocated` to the existing lib import.

Add the prop:

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
  /** Null is the screen's "no today" state — the backend does not send
   *  `current` yet, and every today affordance here hangs off this. */
  today: RowValues | null;
  onChange: (next: RowValues) => void;
}) {
```

and replace the `<MultiAssetRow … />` element with:

```tsx
        <MultiAssetBar
          label={multiAsset.label}
          value={values[multiAsset.id] ?? 0}
          max={maxMultiAsset(mix)}
          recommended={multiAsset.recommended_pct_of_total}
          today={today ? (today[multiAsset.id] ?? 0) : null}
          onChange={(v) => commit({ ...values, [multiAsset.id]: v })}
        />
```

In `src/pages/InvestPreferences.tsx`:

```tsx
                <SubcategoryPins mix={mix} values={effective} subcategories={subs} today={today} onChange={setValues} />
```

- [ ] **Step 4: Add the flash state**

The component's doc comment says "Holds no state" — update it: this is the one piece of state,
and it is pure presentation. Add above `commit`:

```tsx
  // Which rows a typed value just moved. Typing rebalances every sibling at
  // once where a drag trades with one neighbour, so the customer has to watch
  // it happen (spec D7).
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
```

- [ ] **Step 5: Add the single column header**

At the top of the returned `<section>`, **above** the `multiAsset ? … : null` block:

```tsx
      {/* Once for the whole section: the columns are identical all the way
          down, and a header per class group is four copies of the same line. */}
      <div className="mb-1.5 flex items-baseline gap-2 text-[10.5px] text-muted-foreground">
        <span className="ml-auto w-[40px] shrink-0 text-right">Prozpr</span>
        {today ? <span className="w-[40px] shrink-0 text-right">Today</span> : null}
        <span className="w-[46px] shrink-0 text-right">You</span>
      </div>
```

- [ ] **Step 6: Put today's share in the class header**

Replace the existing class-header budget span with:

```tsx
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
```

- [ ] **Step 7: Rebuild the row**

Replace the whole `<div className="mt-2.5 flex flex-col gap-1.5">…</div>` block with:

```tsx
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
                      className="w-[46px] shrink-0"
                    />
                  ) : (
                    <span
                      data-testid={`you-${c.id}`}
                      className="w-[46px] shrink-0 text-right font-semibold tabular-nums text-foreground"
                    >
                      {`${(values[c.id] ?? 0).toFixed(1)}%`}
                    </span>
                  )}
                </div>
              ))}
            </div>
```

- [ ] **Step 8: Update the section's instruction line, and delete the old component**

In `src/pages/InvestPreferences.tsx`, the line above `<SubcategoryPins …>`:

```tsx
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  {"Drag a divider to shift share between categories — or tap a number to type it."}
                </p>
```

Then:

```bash
git rm src/components/invest/MultiAssetRow.tsx src/components/invest/MultiAssetRow.test.tsx
```

Run: `grep -rn "MultiAssetRow" src/`
Expected: no output.

- [ ] **Step 9: Run everything**

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run lint`
Expected: PASS and clean.

`SubcategoryPins.test.tsx`'s existing "hands the parent a distribution that is still exactly on
budget" grabs `getAllByRole("slider")[0]`; the multi-asset divider is still first in the DOM,
where the Radix thumb was, so the index holds — confirm it rather than assume.
`@radix-ui/react-slider` still has another consumer (`src/components/ui/slider.tsx` →
`CompleteProfile.tsx`); do not remove the dependency.

- [ ] **Step 10: Verify in the browser**

Run `npm run dev` and work through spec §9's checklist at 375px and 320px in both themes.

The backend does not send `current` yet. To see the today affordances, commit your work first,
then add a `current` block to the resolved payload, check, and `git reset --hard` — so
reverting is mechanical rather than a memory task.

Two things §9 cannot tell you to look at because they are about this plan's own risk:

- The label box is ~135px at 375px with the Today column present. `"Arbitrage plus income"`
  measures ~128px. Check that one label specifically; a few pixels is all the margin there is.
- At 320px long labels truncate. That is accepted, not a bug.

- [ ] **Step 11: Commit**

```bash
git add src/components/invest/SubcategoryPins.tsx src/components/invest/SubcategoryPins.test.tsx src/pages/InvestPreferences.tsx src/pages/InvestPreferences.test.tsx
git commit -F - <<'EOF'
feat(invest): show today's holdings per category and let values be typed

Each row carries Prozpr's figure, today's, and the customer's, under one
column header for the whole section. The customer's own number becomes a
tinted pill: the brightest thing on a row that now holds three numbers, and
the affordance saying it can be typed over.

Typing rebalances every sibling in the class at once where a drag trades
with one neighbour, so the rows that moved flash. A class with one row, or
with no budget, offers plain text instead of a field that could only hand
back the number already there (spec §7.4).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## Backend dependency

`current` on `GET /profile/investment-preferences` is a separate change in `Prozpr_Backend`;
spec §3.1 is the contract. Everything above ships and behaves correctly without it.

## Out of scope, tracked separately

The Invest page's Current bar renders whole-number percentages and sources its colours from
`driftRows.BUCKET_META` rather than `CLASS_COLOR`, so in dark mode Debt is a different colour
there than here. Both pre-existing; this change makes them visible by inviting the comparison.
