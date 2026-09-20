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
| D6 | ELSS / direct stock (frozen, unsettable) | **Excluded**, remaining rows rescaled to 100. |
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
- **The unreachable region is a hatch, not a tone** (§5). Measured against the real tokens,
  every tonal step is between 1.1:1 and 1.9:1 against the track in both themes; reaching 3:1
  needs a mid-grey that reads as a *filled* segment. The concept cannot be expressed tonally
  in this palette.
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
- Frozen subgroups (`tax_efficient_equities`, `non_mf_equities`) are dropped from the rollup
  and the remainder rescaled to 100 — D6.
- `excluded_pct`: what those frozen holdings were worth, as a share of the customer's whole
  portfolio **before** the rescale. `0` when they hold none. This is the number §3.4's caption
  needs: the surprising fact is not that ELSS is missing but that everything else was inflated
  to fill its place, and no caption can say that without this figure.
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

Today excludes frozen holdings and rescales, so this screen's bar will not match the Invest
page's "Current" bar for any customer holding ELSS or direct stock. The caption under the
today bar therefore names both the exclusion and the rescale:

- `excluded_pct > 0` → **"Excludes the 18.4% you hold in ELSS and direct stocks. The rest is scaled to 100%."**
- `excluded_pct === 0` → **"Across the categories you set here."**

Naming the two frozen categories in frontend copy is a deliberate, narrow coupling: the frozen
set is `FROZEN_SUBGROUPS` on the backend and has been stable. If it ever grows, this copy must
follow.

The Invest page additionally renders whole-number percentages and sources its colours from
`driftRows.BUCKET_META` rather than `CLASS_COLOR`, so in dark mode Debt is a different colour
there. Both are pre-existing and are **out of scope here** — tracked separately.

## 4. The asset-mix card

Three changes to `AssetMixBar`:

1. **Only `mode="reference"` shrinks.** Reference bars go `h-[30px]` → `h-[22px]`. The
   interactive bar and its `h-[22px]` lozenge are untouched: the customer's height concern was
   about the card, and the drag control should not pay for it.
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
- `value% → max%`: `bg-muted`, the room the customer's split can still fund.
- `max% → 100%`: a 45° hatch,
  `repeating-linear-gradient(45deg, transparent 0 4px, hsl(var(--foreground)/0.10) 4px 8px)`.
  A pattern reads at any luminance in both themes, where no flat tone in this palette does.
- One gold divider at `value%` — the 3px `ClassSegmentBar` lozenge, since this bar lives among
  the class bars.
- Widths go through `cssPct`, as `ClassSegmentBar`'s do: `100 - 66.1` is `33.900000000000006`
  and would otherwise be written into the DOM.

**Interaction.** Pointer handlers sit on the bar, as `ClassSegmentBar`'s do, and follow its
rules exactly:

- `onDown` returns early unless the bar has a layout box, **then** captures. Without the guard
  a press on a bar with no box commits `onChange(0)` and silently empties the sleeve.
- `setPointerCapture?.()` — the optional call. jsdom does not implement it, and without the
  optional call the drag path cannot be tested at all.
- **No unconditional jump.** A press within 16px of the divider grabs it and commits nothing;
  only a press on open track moves the value there.
- Arrow keys step 0.5. `role="slider"`, `aria-valuemin={0}`, `aria-valuemax={max}`,
  `aria-valuenow={value}`, `aria-label="Multi-asset share of your portfolio"`.
- Everything clamps to `[0, max]` where `max = maxMultiAsset(mix)`.

**When `max === 0`.** Reachable, and reachable easily: the sleeve is 10% commodity, so dragging
commodity to zero — a reasonable thing to want — kills it. The bar then renders fully hatched
with no divider and `aria-disabled`, the figure renders as plain text, and the breakdown line
is replaced by the reason:

> **"This fund is 10% commodity. Give commodity some room and you can hold it."**

**When `max < 100`,** a second line follows the breakdown: **"Up to 32.0% — that's what your
split can fund."** A sentence carries the ceiling that no amount of grey can.

**Unchanged.** The header line's label and the `Counts as X% Equity · …` line, `ma-breakdown`
included. `MultiAssetBar` renders **no** column header — §6's single header sits above it.

## 6. Columns in the class groups

One header, rendered **once** at the top of the "Set your categories" section, above the
multi-asset row. All rows below — multi-asset and every category — use the same columns, so
they align down the whole card:

```
                            Prozpr  Today     You
Multi-asset funds             12.0    6.4   [ 8.0% ]
████████▐░░░░░░░░░╱╱╱╱╱╱
Counts as 5.2% Equity · 2.0% Debt · 0.8% Commodity
────────────────────────────────────────────────
● EQUITY                        Today 44.0 · 25.0%
██████████▐██████▐████▐██
▪ Large cap                   12.0    9.2   [18.4%]
▪ Mid cap                      8.0   21.6   [14.7%]
```

- Columns: `w-[40px]` for Prozpr and Today with no gap between them (right-aligned columns
  share an edge), `gap-2.5` before a `w-[46px]` YOU. At 375px that leaves **149px** for the
  label — enough for `"Arbitrage plus income"` (128px in DM Sans). The first draft's 44px
  columns left 127px and truncated it. Below ~340px long labels still truncate; accepted.
- Header text is `text-[10.5px]`, **sentence case**, no tracking. The first draft's 9.5px
  uppercase is below both platform minimums and is a type step this screen does not have.
- The class header gains `Today 44.0 · ` before its budget — `classAllocated(today, cats, cls)`,
  the class's **own rows**, since the budget beside it is also net of multi-asset.
- **When `today === null`** the Today column and the class-header figure are omitted; the
  header reads `Prozpr · You` and everything else is identical. Two branches, not seven, and
  no row can lose its Prozpr label while its neighbours keep theirs.

## 7. Typed entry

### 7.1 Interaction

**A single click or tap** on a YOU figure opens an inline input; a double-click does too,
since it is also a click. Single-tap rather than double-tap-only because this is a touch-first
app: `onDoubleClick` appears nowhere else in it, and on iOS Safari a double-tap on text raises
the selection callout instead.

The figure is a real `<button type="button">` — this codebase uses one everywhere it is not
structurally blocked — so Enter and Space come free with no hand-rolled key handler. It carries
`select-none touch-manipulation [-webkit-touch-callout:none]`, and is styled as a tinted pill
(`rounded bg-foreground/[0.04] px-1.5 py-1 -mx-1.5 -my-1`, `font-semibold`). The pill does
three jobs at once: it signals the figure is editable, it makes the customer's own number the
brightest thing on a row carrying three, and it grows a 46×16 target to ~46×28.

Labels: `aria-label={`${label} share`}` on both the button and the input — a short noun phrase,
identical across the state change, matching `"Multi-asset share of your portfolio"` and
`"Equity / Debt divider"`. The gesture goes in `title`, as `ClassSegmentBar` does for
supplementary hover text. The first draft's label restated the value (which `aria-label`
overrides, so it was announced twice) and named a gesture that is wrong for the keyboard path.

Enter or blur commits; Escape cancels. Either way focus returns to the button, so a keyboard
user who cancels is not dumped to `<body>`.

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

**Why this needs D7.** On a six-row equity group with a 25.0 budget, typing `24` into one row
is entirely legal, and collapses the other five to 0.4 / 0.3 / 0.2 / 0.1 / 0.0. Dragging to the
same place trades only with the immediate neighbour. Typing is therefore a far larger gesture
than dragging, and it is the one with no feedback during the act. Hence:

1. **The field clamps as you type.** `EditableFigure` takes `max` and clamps on every keystroke,
   so an over-budget number is never displayable and nothing is silently rejected. This replaces
   the first draft's claim that the value "snaps visibly" on commit — it does not; the input
   unmounts and the span remounts in the same frame, which is indistinguishable from being
   ignored.
2. **Every row that moved flashes** for 600ms after commit (`bg-foreground/[0.06]`,
   `transition-colors`, `motion-reduce:transition-none`). The customer watches five rows change
   rather than discovering it later.
3. **A no-op never commits.** The first draft fired `onCommit` even when the value was
   unchanged, so a stray tap-then-blur would flip an untouched customer from "Following
   Prozpr's suggestion" to "Your own split" and enable Save — changing the saved meaning from
   *engine decides* to *pinned distribution* with no edit having occurred.

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
three bars; the multi-asset bar reading as the same control as the class bars with its hatched
region visible; columns aligned down the whole card with `"Arbitrage plus income"` intact at
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
