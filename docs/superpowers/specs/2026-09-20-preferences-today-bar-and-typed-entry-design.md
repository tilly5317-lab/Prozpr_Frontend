# Investment Preferences — Today's Holdings, Multi-Asset Bar & Typed Entry — Design Spec

**Status:** approved 2026-09-20 (Amoul); revised 2026-09-20 after a four-way adversarial
review of the first draft. Frontend-led change to `/invest/preferences`
(`src/pages/InvestPreferences.tsx`) with one additive backend field it degrades gracefully
without. Builds on `2026-09-15-subcategory-full-distribution-frontend-design.md`.

---

## 1. Why

The screen shows the customer two futures — **what they want** and **what Prozpr suggests** —
and never their present. A customer deciding whether 60% equity is right for them cannot see
that they sit at 71% today, so the decision is made blind. The same gap exists one level down,
inside Equity / Debt / Commodity.

Two smaller problems ride along: the multi-asset control is the one Radix slider on a screen
otherwise built from filled bars with gold dividers, so it reads as a different kind of thing;
and every category value is drag-only, which is precise to a tenth but slow when the customer
already knows the number they want.

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| D1 | Where does "today" come from? | A new `current` block on `GET /profile/investment-preferences`, not a second endpoint. |
| D2 | Third bar or tab switcher? | Third stacked bar. |
| D3 | What gives when a typed number doesn't fit? | **Nothing above it.** Clamped to its class budget; only siblings in that class move. The Equity/Debt/Commodity bar never moves. |
| D4 | Multi-asset control | Rebuilt as the same filled bar + gold divider the class groups use. |
| D5 | Row layout for three figures | Three right-aligned numeric columns under one `Prozpr · Today · You` header. |
| D6 | Holdings outside the 11 settable rows (frozen ELSS / direct stock, categories the screen cannot set, bank deposits, unclassified) | **Excluded**, remaining rows rescaled to 100. Widened from the frozen rows alone by the backend decision of 2026-09-26. |
| D7 | The destructive typed edit (§7.2) | Clamp **in the field, as they type**, and **flash the rows that moved**. No undo affordance. |
| D8 | Extra contract fields | `excluded_pct` **yes**. An `as_of` date, and distinguishing "holds nothing" from "not shipped yet", **no** — absent, null and empty all collapse to silence. |

### 2.1 What the review changed

The first draft was reviewed for correctness, simplicity, convention and UX. Decisions it
overturned, recorded so they are not re-litigated:

- **Only the reference bars shrink** (§4). The first draft shrank the interactive bar and its
  drag handle too, paying for card height out of the grabability of the one control the
  customer actually drags — and on arithmetic that did not reconcile.
- **Reference bars draw true shares** (§4). `flooredShares` floors a 0% class to a 1.5% sliver
  so two dividers cannot stack on one pixel. Reference bars have no dividers, so on them the
  floor is pure fabrication: most customers hold no gold and would see a phantom amber sliver
  under "Where you are today".
- **No click-to-jump on the multi-asset bar** (§5). The first draft claimed to copy
  `ClassSegmentBar` and did the opposite: that component requires a press within 16px of a
  divider and ignores it otherwise. Unconditional jump means a stray tap sets multi-asset to
  80%, and grabbing the divider off-centre moves the value before any drag.
- **The multi-asset ceiling is a sentence, not a shaded region** (§5). Measured against the
  real tokens every tonal step sits between 1.1:1 and 1.9:1 against the track, and the first
  revision's 10%-alpha hatch on a 26px bar was barely better. A sentence is legible in both
  themes, translatable, and readable by a screen reader.
- **A press on the multi-asset bar never moves the value** (§5). The first revision fixed only
  half of this: it stopped a press near the handle from jumping, and still let a press on open
  track set the sleeve to whatever was tapped.
- **One column header, always columns** (§6). The first draft kept the old inline `Prozpr 12.0`
  form alive alongside the new column form, branching on `today` in seven places across two
  files — and shipped a bug where the multi-asset row lost its "Prozpr" label in the no-today
  state while the rows below kept theirs.
- **`applyTypedEntry` shares `normalise`'s spread step** (§7.2) rather than copying it.

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
    ],
    "excluded_pct": 18.4
  }
}
```

- `holdings`: one entry per **settable** subgroup (the same 11 ids the `subcategories` catalog
  carries), summing to **100**.
- Everything outside those 11 rows is dropped from the rollup and the remainder rescaled to
  100 — D6. That is the frozen subgroups (`tax_efficient_equities`, `non_mf_equities`), held
  categories this screen cannot set (corporate-bond / high-risk debt, dividend yield, silver,
  China), bank deposits held in `portfolio_holdings`, and holdings whose metadata never
  classified (backend decision 2026-09-26; originally the frozen rows alone).
- `excluded_pct`: what all of that was worth, as a share of the customer's whole portfolio
  **before** the rescale. `0` when they hold none. This is the number §3.4's caption needs:
  the surprising fact is not that some holdings are missing but that everything else was
  inflated to fill their place, and no caption can say that without this figure.
- `current` absent, `null`, or `holdings` empty ⇒ every "today" affordance disappears and the
  screen renders as it does today. Per **D8** these three are deliberately not distinguished:
  the frontend cannot tell "the backend has not shipped this" from "this customer holds
  nothing", and shows nothing in both cases.

### 3.2 No class mix on the wire

The backend sends **no** `current.class_mix`. The frontend derives today's
Equity/Debt/Commodity by look-through of `holdings`, using the same function that derives
Prozpr's bar from Prozpr's rows — so the today bar and the TODAY column cannot drift apart.

`recommendedMix`'s body is extracted:

```ts
/** The class bar a complete set of row values implies. */
export function lookThroughMix(values: RowValues, cats: ScreenSubcategory[]): ClassMix

export function recommendedMix(cats: ScreenSubcategory[]): ClassMix {
  return lookThroughMix(recommendedValues(cats), cats);
}
```

Named `lookThroughMix` because that is what this file already calls the operation (`"the
look-through of the recommendation"`); `from…`/`to…` in that module is reserved for the two
wire-boundary converters, `toSavePins` and `fromSavedPins`.

### 3.3 Reading the block

```ts
/** Today's holdings as row values. Every settable category is present and one
 *  the customer holds nothing of reads 0 — today is a complete fact, which is
 *  exactly what `fromSavedPins`'s nullable blank is not. */
export function fromCurrentHoldings(
  holdings: ScreenCurrentHolding[],
  cats: ScreenSubcategory[],
): RowValues
```

The wire type is imported from `@/lib/api`, beside the existing `SubcategoryPin` import — this
is a boundary converter and the file already names wire types in exactly these two places.

The page holds `today: RowValues | null` and `excludedPct: number`. Null is the "no today"
state; every today affordance is conditional on it.

### 3.4 The caption, and the divergence it discloses

Today excludes everything outside the settable rows and rescales, so this screen's bar will
not match the Invest page's "Current" bar for any customer holding ELSS, direct stock, or a
category this screen cannot set. The caption under the today bar therefore names both the
exclusion and the rescale:

- `excluded_pct > 0` → **"Excludes the 18.4% you hold outside the categories you set here, such as ELSS and direct stocks. The rest is scaled to 100%."**
- `excluded_pct === 0` → **"Across the categories you set here."**

ELSS and direct stock are named as examples, not as the whole of what was excluded: since the
backend decision of 2026-09-26, `excluded_pct` counts everything outside the 11 settable rows
(§3.1). On the dev smoke account that is 60.2%, of which only 35% is direct stock, so the copy
says "outside the categories you set here" and offers the two frozen rows as illustrations.
The only coupling left is that those examples stay real frozen rows (`FROZEN_SUBGROUPS` on
the backend); the copy no longer has to follow that set if it grows.

The Invest page additionally renders whole-number percentages and sources its colours from
`driftRows.BUCKET_META` rather than `CLASS_COLOR`, so in dark mode Debt is a different colour
there. Both are pre-existing and are **out of scope here** — tracked separately.

## 4. The asset-mix card

Three changes to `AssetMixBar`:

1. **All three bars share one height.** Both modes are `h-[30px]` (revised 2026-09-26 so the
   three top-card bars read as one control group). An earlier revision shrank the reference
   bars to `h-[22px]`; that is reverted. Only the drag handles and the flooring below them still
   set the interactive bar apart, not its weight on the page. The card also gives all three
   labels the same semibold/foreground treatment `"Your preference"` already had.
2. **Reference bars draw true shares.** `flooredShares` applies only in interactive mode:

   ```ts
   const widths = mode === "interactive"
     ? flooredShares([mix.equity, mix.debt, mix.others], 100)
     : [mix.equity, mix.debt, mix.others];
   ```

   The floor exists to keep two dividers off one pixel; reference bars have none. Without this
   a customer holding no gold sees a 4.5px amber sliver under "Where you are today", with its
   label suppressed so nothing explains it.
3. `labelMin` stays 9 — it is measured against the bar's *width*, which has not changed.

The page then renders, in order: the "Your preference" label and interactive bar, **the
existing "Drag the gold handles…" line moved to sit directly under it**, then "Prozpr
recommends", then "Where you are today" and its caption. The drag instruction currently ends up
three bars and two captions below the bar it describes, reading as a note about the today bar.

Card height: two reference bars give back 16px; the third bar, its label and its caption cost
roughly 80px. Net ≈ **+64px**. At 375×667 the collapsed "Set your categories" header still
sits above the fold with little to spare — confirm in the browser (§9), do not assume.

## 5. Multi-asset — `MultiAssetRow` → `MultiAssetBar`

The Radix slider leaves this component. (`@radix-ui/react-slider` stays in the project —
`src/components/ui/slider.tsx` still has a consumer.)

**Geometry.** A 26px bar — the same height as `ClassSegmentBar` — whose full width is **100% of
the portfolio**, so a width here means what a width means everywhere else on the screen.

- `0 → value%`: the existing 65/25/10 gradient, so the entry still reads as a blended fund.
- `value% → 100%`: `bg-muted`. The ceiling is carried by the sentence below and by the divider
  refusing to travel past it — not by a tint or a pattern, neither of which survives this
  palette at a legible contrast.
- One gold divider at `value%` — the 3px `ClassSegmentBar` lozenge, since this bar lives among
  the class bars.

**Interaction.** Pointer handlers sit on the bar, as `ClassSegmentBar`'s do, and follow its
rules exactly:

- `onDown` returns early unless the bar has a layout box, **then** captures. Without the guard
  a press on a bar with no box commits `onChange(0)` and silently empties the sleeve.
- `setPointerCapture?.()` — the optional call. jsdom does not implement it, and without the
  optional call the drag path cannot be tested at all.
- **A press never moves the value.** It grabs the divider, or it does nothing — exactly
  `ClassSegmentBar`'s rule (`if (cands.length === 0) return;`). The Radix slider jumped to the
  press, which on a phone means one stray tap on open track resets the sleeve.
- Arrow keys step 1. `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={max}`,
  `aria-valuenow={value}`, `aria-label="Multi-asset share of your portfolio"`.
- Everything clamps to `[0, max]` where `max = maxMultiAsset(mix)`.

**When `max === 0`.** Reachable, and reachable easily: the sleeve draws on all three classes,
so dragging any one of them to zero — commodity most plausibly, at 10% of the sleeve — kills
it. The bar then renders empty with no divider, the figure renders as plain text, and the
breakdown line is replaced by the reason, naming whichever class or classes sit at zero
(revised 2026-09-26; it used to blame commodity whatever the customer had starved):

- **"This fund is 10% commodity. Give commodity some room and you can hold it."**
- **"This fund is 25% debt. Give debt some room and you can hold it."**
- **"This fund is 65% equity and 10% commodity. Give them some room and you can hold it."**

`MultiAssetBar` takes the class `mix` and derives the cap itself, so the sentence and the cap
can never disagree about which class is empty.

**When `max < 100`,** a second line follows the breakdown: **"Up to 32% — that's what your
split can fund."** This is the only thing on the screen that states the ceiling, which is why
§2.1 dropped the shaded region rather than the sentence.

**Unchanged.** The header line's label and the `Counts as X% Equity · …` line, `ma-breakdown`
included. `MultiAssetBar` renders **no** column header — §6's single header sits above it.

## 6. Columns in the class groups

One header, rendered **once** at the top of the "Set your categories" section, above the
multi-asset row. All rows below — multi-asset and every category — use the same columns, so
they align down the whole card:

```
                            Prozpr  Today     You
Multi-asset funds               12      6   [  8% ]
████████▐░░░░░░░░░╱╱╱╱╱╱
Counts as 5% Equity · 2% Debt · 1% Commodity
────────────────────────────────────────────────
● EQUITY                        30     44     25%
██████████▐██████▐████▐██
▪ Large cap                     12      9   [ 18% ]
▪ Mid cap                        8     22   [ 15% ]
──────────────────────────────────────────────── ← same hairline between every group
● DEBT                           8      0     20%
```

- Columns: `w-[40px]` for Prozpr and Today with no gap between them (right-aligned columns
  share an edge), `gap-2.5` before a `w-[46px]` YOU. At 375px that leaves **149px** for the
  label — enough for `"Arbitrage plus income"` (128px in DM Sans). The first draft's 44px
  columns left 127px and truncated it. Below ~340px long labels still truncate; accepted.
- Header text is `text-[10.5px]`, **sentence case**, no tracking. The first draft's 9.5px
  uppercase is below both platform minimums and is a type step this screen does not have.
- The class header carries the full **Prozpr / Today / You** trio in the same three columns as
  the multi-asset row and the rows below (revised 2026-09-26; it previously showed only a
  `Today 44.0 · ` prefix before the budget and omitted Prozpr). Prozpr is
  `classAllocated(recommendedValues, cats, cls)`, Today is `classAllocated(today, cats, cls)`
  — both the class's **own rows**, net of multi-asset, so all three compare with the budget.
- Each class group is parted from the next by the same `border-b` hairline the multi-asset row
  carries above the first group — but **not after the last group**, where it would float above
  the card's own padding (added 2026-09-26).
- **When `today === null`** the Today column is omitted from the header and every row; each
  header then reads `Prozpr · You` and everything else is identical. Two branches, not seven,
  and no row can lose its Prozpr figure while its neighbours keep theirs.

## 7. Typed entry

### 7.1 Interaction

**A single click or tap** on a YOU figure opens an inline input; a double-click does too,
since it is also a click. Single-tap rather than double-tap-only because this is a touch-first
app: `onDoubleClick` appears nowhere else in it, and on iOS Safari a double-tap on text raises
the selection callout instead.

The figure is a real `<button type="button">` — this codebase uses one everywhere it is not
structurally blocked — so Enter and Space come free with no hand-rolled key handler. It carries
`select-none`, which also suppresses iOS's selection callout, and is styled as a tinted pill
(`rounded bg-foreground/[0.04] px-1.5 py-1 -mx-1.5 -my-1`, `font-semibold`). The pill does
three jobs at once: it signals the figure is editable, it makes the customer's own number the
brightest thing on a row carrying three, and it grows a 46×16 target to ~46×28.

Labels: `aria-label={`${label} share`}` on both the button and the input — a short noun phrase,
identical across the state change, matching `"Multi-asset share of your portfolio"` and
`"Equity / Debt divider"`. The gesture goes in `title`, as `ClassSegmentBar` does for
supplementary hover text. The first draft's label restated the value (which `aria-label`
overrides, so it was announced twice) and named a gesture that is wrong for the keyboard path.

Enter or blur commits; Escape cancels. Focus returns to the button after the **keyboard** paths
only: a keyboard user who cancels must not be dumped on `<body>`, but restoring focus after a
blur would drag it back from wherever the customer had just tapped.

Input is `type="text" inputMode="decimal"` — `type="number"` brings spinners and a
locale-dependent separator into a 46px cell. It carries `bg-muted` and a focus ring rather than
relying on a `#D4A868` hairline, which is 2.04:1 in light mode and would be the field's only
focus indicator.

Extracted as `src/components/invest/EditableFigure.tsx`. Whole words: `Pct` appears in this
codebase only in local identifiers, never in a component name.

### 7.2 Commit — category rows

Per **D3** the class bar never moves: a typed value is clamped to its class budget and only
siblings in that class absorb the difference, in proportion.

```ts
/** A typed value for one row, with its siblings in the same class rescaled to
 *  absorb the difference. Clamped to [0, budget], so the class total — and the
 *  bar above it — is unchanged by construction. */
export function applyTypedEntry(
  rows: ScreenSubcategory[], values: RowValues, budget: number,
  rowId: string, typed: number,
): RowValues
```

Its body is four lines, because the proportional-spread-with-residual step is lifted out of
`normalise` and shared:

```ts
/** Spread `budget` across `rows` in proportion to what they hold now. */
function spread(out: RowValues, rows: ScreenSubcategory[], budget: number): void
```

`normalise`'s per-class loop then calls `spread` too. This is the difference between a comment
claiming to mirror `normalise` and code that demonstrably does, and it keeps the screen's one
invariant in one place as intended.

`budget` is floored at 0 inside `applyTypedEntry`, as `normalise` already floors it — otherwise
a negative budget produces negative row values.

**Why this needs D7.** On a six-row equity group with a 25 budget, typing `24` into one row
is entirely legal, and collapses the other five to 1 / 0 / 0 / 0 / 0. Dragging to the
same place trades only with the immediate neighbour. Typing is therefore a far larger gesture
than dragging, and it is the one with no feedback during the act. Hence:

1. **The field clamps as you type.** `EditableFigure` takes `max` and clamps on every keystroke,
   so an over-budget number is never displayable and nothing is silently rejected. This replaces
   the first draft's claim that the value "snaps visibly" on commit — it does not; the input
   unmounts and the span remounts in the same frame, which is indistinguishable from being
   ignored.
2. **Every row that moved flashes** — tinted the instant the commit lands, then fading out over
   500ms. The tint goes on with no transition and comes off with one: transitioning *into* a 6%
   alpha over half a second is a swell nobody perceives, which is what the first revision
   specified.
3. **A no-op never commits.** The first draft fired `onCommit` even when the value was
   unchanged, so a stray tap-then-blur would flip an untouched customer from *engine decides* to
   a *pinned distribution* and enable Save — the saved meaning changing with no edit having
   occurred.

### 7.3 Commit — multi-asset

Not a member of a class group and not routed through `applyTypedEntry`: clamped to
`[0, maxMultiAsset(mix)]` and set, exactly as a divider drag would. `normalise` then rescales
the class rows, which is what the slider already did.

### 7.4 Where there is nothing to edit

The YOU figure renders as plain text, not a button, when `rows.length <= 1 || budget <= 0`:

- **A single-row class** (Commodity holds only Gold) *is* its budget; any typed value clamps
  straight back.
- **A class at budget 0** (drag equity to zero) can only ever return `0.0`.

This is the same condition `ClassSegmentBar` already uses to decide whether its dividers exist.
The first draft gated on `rows.length > 1` alone, and so offered a live field that could only
return zero — the exact thing §7.4 was written to avoid.

## 8. Files

| File | Change |
|---|---|
| `src/lib/api.ts` | `ScreenCurrentHolding`; `current?: { holdings; excluded_pct } \| null`. |
| `src/lib/investment-preferences.ts` | `spread` (extracted from `normalise`), `lookThroughMix` (extracted from `recommendedMix`), `fromCurrentHoldings`, `applyTypedEntry`. |
| `src/pages/InvestPreferences.tsx` | `today` + `excludedPct`; third bar and caption; drag line moved; pass `today` down. |
| `src/components/invest/AssetMixBar.tsx` | Reference-only height; floor only when interactive. |
| `src/components/invest/MultiAssetRow.tsx` | Rewritten as `MultiAssetBar.tsx`; old file and test removed. |
| `src/components/invest/SubcategoryPins.tsx` | Single column header, Today column, class-header today figure, editable YOU, flash-on-change. |
| `src/components/invest/EditableFigure.tsx` | New. |

## 9. Verification

Unit tests per task (see the plan). In the browser at 375px and at 320px, in both themes:
three bars; the multi-asset bar reading as the same control as the class bars, its ceiling
stated in words and its divider unmoved by a press on open track; columns aligned down the whole card with `"Arbitrage plus income"` intact at
375px; tap-to-edit opening a field; an over-budget number unable to be typed; the rows that
moved flashing; Gold and a zero-budget class offering no edit; commodity dragged to 0 producing
the explained multi-asset state; the accordion header still above the fold.

## 10. Out of scope

- The save payload. Today is read-only and never travels back.
- The Invest page's Current bar: its whole-number precision and its hardcoded `BUCKET_META`
  colours (§3.4). Both pre-existing, tracked separately.
- Unifying `AssetMixBar`'s 7px lozenge with `ClassSegmentBar`'s 3px one — different cards,
  different scales. Only the multi-asset control was out of family.
- An undo affordance for typed edits (D7).
