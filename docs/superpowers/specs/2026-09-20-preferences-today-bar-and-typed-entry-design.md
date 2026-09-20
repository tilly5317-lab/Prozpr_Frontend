# Investment Preferences — Today's Holdings, Multi-Asset Bar & Typed Entry — Design Spec

**Status:** approved, 2026-09-20 (Amoul). Frontend-led change to `/invest/preferences`
(`src/pages/InvestPreferences.tsx`), with one additive backend field it degrades gracefully
without. Builds directly on `2026-09-15-subcategory-full-distribution-frontend-design.md`.

---

## 1. Why

The screen shows the customer two futures — **what they want** and **what Prozpr suggests** —
and never shows them their present. A customer deciding whether 60% equity is right for them
cannot see that they are at 71% today, so the decision is made blind. The same gap exists one
level down, inside Equity / Debt / Commodity.

Two smaller problems ride along: the multi-asset control is the one Radix slider on a screen
otherwise built from filled bars with gold dividers, so it reads as a different kind of thing;
and every category value is drag-only, which is precise to a tenth but slow when the customer
already knows the number they want.

## 2. Decisions taken (Amoul, 2026-09-20)

| # | Question | Decision |
|---|---|---|
| D1 | Where does "today" come from? | A new `current` block on `GET /profile/investment-preferences`, not a second endpoint. |
| D2 | Third bar or tab switcher? | Third stacked bar; all three bars shortened so the card holds its height. |
| D3 | What gives when a typed number doesn't fit? | **Nothing above it.** The value is clamped to its class budget and only sibling rows in that class shrink. The Equity/Debt/Commodity bar never moves. |
| D4 | Multi-asset control | Rebuilt as the same filled bar + gold divider the class groups use. |
| D5 | Row layout for three figures | Three right-aligned numeric columns under one `PROZPR · TODAY · YOU` header. |
| D6 | ELSS / direct stock (frozen, unsettable) | **Excluded**, and the remaining rows rescaled to 100. |

## 3. Data contract

### 3.1 The new field

`GET /profile/investment-preferences` gains one optional block:

```jsonc
{
  "saved": { … },
  "recommendation": { "class_mix": { … } },
  "subcategories": [ … ],
  "carve_outs_at_risk": [ … ],
  "current": {
    "holdings": [
      { "subgroup": "low_beta_equities", "pct_of_total": 9.2 },
      { "subgroup": "short_debt",        "pct_of_total": 21.6 }
    ]
  }
}
```

- One entry per **settable** subgroup (the same 11 ids the `subcategories` catalog carries).
- `pct_of_total` sums to **100** across the block.
- Frozen subgroups (`tax_efficient_equities`, `non_mf_equities`) are dropped from the rollup
  and the remainder rescaled to 100 — D6. They have no row on this screen, so including them
  would put a number in a column that reconciles to nothing.
- `current` absent, `null`, or an empty list ⇒ the customer holds nothing this screen can
  speak about. Every "today" affordance disappears and the screen renders exactly as it does
  today. This is what lets the frontend ship ahead of the backend, the same way
  `carve_outs_at_risk` already does.

### 3.2 No class mix on the wire

The backend deliberately sends **no** `current.class_mix`. The frontend derives today's
Equity/Debt/Commodity by look-through of `current.holdings`, using the same function that
already derives Prozpr's bar from Prozpr's rows. One function computes all three bars, so the
today bar and the TODAY column cannot drift apart.

`recommendedMix(cats)` is generalised:

```ts
/** The class bar implied by a complete set of row values — the look-through,
 *  with the multi-asset sleeve split 65/25/10. */
export function mixFromValues(values: RowValues, cats: ScreenSubcategory[]): ClassMix

export function recommendedMix(cats: ScreenSubcategory[]): ClassMix {
  return mixFromValues(recommendedValues(cats), cats);
}
```

`recommendedMix`'s body moves wholesale into `mixFromValues`; its behaviour is unchanged and
its existing tests must pass untouched.

### 3.3 Reading the block

```ts
/** Today's holdings as row values. Every settable category is present — a
 *  category absent from the payload is genuinely not held, so 0, never null. */
export function fromCurrentHoldings(
  holdings: { subgroup: string; pct_of_total: number }[],
  cats: ScreenSubcategory[],
): RowValues
```

`today` is a `RowValues | null` on the page. Null is the "no today" state; it is threaded down
to `SubcategoryPins` and the bar card, and every "today" affordance is conditional on it.

### 3.4 Known divergence from the Invest page

Because frozen holdings are excluded (D6), this screen's today bar will read differently from
the Invest page's "Current vs target" Current bar for any customer holding ELSS or direct
stock — a customer with 20% in direct stock sees a lower equity figure here than there. This is
intended: the two bars answer different questions. A one-line caption under the today bar,
**"Across the categories you set here."**, is part of this spec so the difference is stated
rather than discovered.

## 4. The asset-mix card

`AssetMixBar` gains no props. Three changes:

- Bar height `h-[30px]` → `h-[22px]`; divider lozenge `h-[22px]` → `h-[16px]`. The handle's
  hit area (`px-2.5 py-4`) is **unchanged** — it already extends past the bar and must stay a
  comfortable touch target.
- `labelMin` stays at 9. The bar's *width* is unchanged, and that is what the threshold is
  measured against; the 9px in-segment labels still clear a 22px bar vertically.
- A third `mode="reference"` bar is added by the page, under Prozpr's:

```
YOUR PREFERENCE        ██████████▐██████▐██   ← draggable
PROZPR RECOMMENDS      ████████████████████
WHERE YOU ARE TODAY    ████████████████████
                       Across the categories you set here.
```

The today bar and its label render only when `today !== null`. Label styling matches
"Prozpr recommends" exactly (muted, not the emphasised treatment "Your preference" carries).

Card height: the two existing bars give back 16px, the third bar and its label cost ~43px and
the caption ~16px, so the card grows by roughly 45px rather than the ~75px a third full-height
bar would have cost.

## 5. Multi-asset — `MultiAssetRow` → `MultiAssetBar`

The Radix slider is removed. `@radix-ui/react-slider` stays in the project (other screens use
it) but leaves this component.

**Geometry.** A 26px bar — the same height as `ClassSegmentBar` — whose full width is **100% of
the portfolio**, not `0..max`. This is the point of the change: every bar on the screen now
means the same thing across its width.

- Filled region `0 → value%`: the existing 65/25/10 gradient, unchanged, so the entry still
  reads as a blended fund.
- `value% → max%`: `bg-muted` — the room the customer's class mix can still fund.
- `max% → 100%`: a dimmer tone (`bg-muted/40`) — unreachable, and visibly so, rather than a
  divider that mysteriously stops.
- One gold divider at `value%`, the 3px `ClassSegmentBar` lozenge (not the 7px `AssetMixBar`
  one — this bar lives inside "Set your categories", next to the class bars).

**Interaction.** Pointer handling mirrors `ClassSegmentBar`: handlers on the bar (not on the
divider), pointer capture on down, `round1` on commit. Bar-level handling is also what preserves
the Radix slider's click-to-jump — a press anywhere on the track moves the divider there, which
is how this control behaves today. Arrow keys step 0.5. `role="slider"`,
`aria-valuemin={0}`, `aria-valuemax={max}`, `aria-valuenow={value}`,
`aria-label="Multi-asset share of your portfolio"`. Every position is clamped to
`[0, max]` where `max = maxMultiAsset(mix)` — the same cap as today, unchanged.

**Unchanged.** The header line (label / Prozpr figure / value) and the
`Counts as X% Equity · Y% Debt · Z% Commodity` line, `data-testid="ma-breakdown"` included.
The header line gains a TODAY figure (§6).

There is no floored-share maths here: two regions, no collapsed segments, so `flooredShares`
and its inverse are not involved.

## 6. Three columns in the class groups

Each class group in `SubcategoryPins` gains a column header and a third figure per row.

```
● EQUITY                         today 71.2 · 60.0%
██████████▐██████▐████▐██
                        PROZPR   TODAY     YOU
▪ Large cap               12.0     9.2   18.4%
▪ Mid cap                  8.0    21.6   14.7%
▪ Small cap                4.0     0.0    6.2%
```

- Header line: 10px, uppercase, `tracking-[0.12em]`, muted, right-aligned over the columns.
- Columns: three fixed `w-[44px]`, `text-right`, `tabular-nums`. The label takes the remaining
  width with `truncate` — at 375px that leaves ~135px, which is what the existing rows already
  live with.
- The word "Prozpr" leaves every row; it now appears once per group in the header. That is
  what pays for the third column.
- The class header gains `today 71.2 · ` before its existing budget figure. That figure is
  `classAllocated(today, cats, cls)` — the sum of today's **own rows** in that class, excluding
  multi-asset. It is deliberately not the class's whole share: the budget figure it sits beside
  is also net of multi-asset, and the two must compare like with like.
- Multi-asset's header line gains its TODAY figure in the same position.

**When `today === null`:** there is no column header and no third column. Rows render exactly
as they do now — an inline `Prozpr 12.0` and a `w-[46px]` YOU figure — and the class header shows
only its budget. This is one branch in `SubcategoryPins`, not a second component, and it is what
lets this ship before the backend field exists.

## 7. Typed entry

### 7.1 Interaction

Double-click (double-tap) a **YOU** figure. It becomes an inline input of the same width and
alignment, contents selected. Enter or blur commits; Escape cancels and restores.

For keyboard users the figure is focusable (`tabIndex={0}`, `role="button"`, an aria-label
naming the category) and Enter or Space also enters edit mode. Arrow-key dragging on the bar
already exists and is untouched; this is an additional path to the same value, not a
replacement.

Input is `type="text" inputMode="decimal"` — `type="number"` brings spinners and a locale-
dependent decimal separator this screen does not want. Non-numeric input on commit is
discarded (treated as cancel).

Extracted as `src/components/invest/EditablePct.tsx`, used by both the category rows and the
multi-asset header line.

### 7.2 What commit does — category rows

Per **D3**, the class bar above never moves. A typed value is clamped to its class budget and
only siblings in that class absorb the difference.

```ts
/** A typed value for one row, with its siblings in the same class rescaled to
 *  absorb the difference. Clamped to [0, budget], so the class total — and
 *  therefore the bar above it — is unchanged by construction. */
export function applyTypedValue(
  rows: ScreenSubcategory[],
  values: RowValues,
  budget: number,
  rowId: string,
  typed: number,
): RowValues
```

1. `v = round1(clamp(typed, 0, budget))`.
2. `rest = round1(budget - v)` is shared among the siblings **in proportion** to what they
   hold now.
3. If every sibling sits at 0 there are no proportions to preserve — `rest` is parked on the
   first sibling, mirroring the rule `normalise` already uses for a flattened class.
4. Rounding residual goes to the largest sibling, again mirroring `normalise`.
5. The result is handed to the existing `commit` → `normalise` path. Nothing new is asserted
   about the distribution; a typed edit is just another edit that arrives already balanced.

**Clamping is visible, not silent.** On commit the field snaps to the clamped figure before
reverting to text, so typing 30 into a row whose class holds 25 shows 25.0 landing.

### 7.3 What commit does — multi-asset

Multi-asset is not a member of a class group and does not use `applyTypedValue`. It is clamped
to `[0, maxMultiAsset(mix)]` and set, exactly as a divider drag would — `normalise` then
rescales the class rows underneath, which is the behaviour the slider already has.

### 7.4 Gold is read-only

Commodity holds one settable row (`gold_commodities`), so that row **is** the class budget:
any typed value is clamped straight back to what is already there. Rather than offer an edit
that cannot do anything, a single-row class renders its YOU figure as plain text — no focus
ring, no double-click target. The rule is `rows.length > 1`, the same condition that already
decides whether the class draws a segment bar at all.

## 8. Files

| File | Change |
|---|---|
| `src/lib/api.ts` | `ScreenCurrentHoldings` type; `current?` on `ScreenPreferenceGetResponse`. |
| `src/lib/investment-preferences.ts` | `mixFromValues` (extracted from `recommendedMix`), `fromCurrentHoldings`, `applyTypedValue`. |
| `src/pages/InvestPreferences.tsx` | Read `current` into a `today: RowValues \| null`; third `AssetMixBar` + caption; pass `today` down. |
| `src/components/invest/AssetMixBar.tsx` | Heights only. |
| `src/components/invest/MultiAssetRow.tsx` | Rewritten as `MultiAssetBar.tsx`; old file and its test removed. |
| `src/components/invest/SubcategoryPins.tsx` | Column header, third column, class-header today figure, editable YOU. |
| `src/components/invest/EditablePct.tsx` | New. |

## 9. Tests

**`src/lib/investment-preferences.test.ts`**
- `mixFromValues` reproduces `recommendedMix` on the recommendation (the existing
  `recommendedMix` cases must pass unchanged).
- `fromCurrentHoldings`: a category absent from the payload reads 0, not null.
- `applyTypedValue`: in-range value rescales siblings proportionally; a value above budget
  clamps and zeroes siblings; a negative clamps to 0; all-siblings-at-zero parks `rest` on the
  first; the class total equals `budget` in every case; a two-row class sets the other row to
  the exact complement.

**`src/components/invest/MultiAssetBar.test.tsx`** (replaces `MultiAssetRow.test.tsx`)
- Divider drag past `max` clamps to `max`.
- ArrowRight/ArrowLeft step 0.5 and clamp at both ends.
- The `ma-breakdown` line still reports the 65/25/10 split.

**`src/components/invest/SubcategoryPins.test.tsx`**
- Three columns and the `PROZPR/TODAY/YOU` header when `today` is supplied; two columns and no
  today figures when it is null.
- The class header shows today's class share.
- A single-row class renders its YOU figure as non-interactive text.

**`src/pages/InvestPreferences.test.tsx`**
- Third bar renders when the payload carries `current`; absent entirely when it does not.
- Double-clicking a YOU figure, typing, and pressing Enter rebalances that class's siblings and
  leaves the class bar's budget figure unchanged.
- Escape restores the prior value.

## 10. Out of scope

- Any change to the save payload. "Today" is read-only and never travels back to the backend.
- The Invest page's "Current vs target" chart. §3.4's divergence is accepted, not reconciled.
- Unifying `AssetMixBar`'s 7px lozenge with `ClassSegmentBar`'s 3px one. They sit in different
  cards at different scales; only the multi-asset control was out of family.
