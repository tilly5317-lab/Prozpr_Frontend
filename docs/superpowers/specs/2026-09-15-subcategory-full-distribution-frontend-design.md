# Subcategory Full Distribution — Invest ▸ Preferences (Frontend)

**Status:** implemented 2026-09-16 (frontend). Backend in progress.
**Revised 2026-09-16 (b):** a copy and legibility pass — the intro trimmed, the
SIP explainer dropped, the per-class recommendation bar removed, and the
reference figures and headings recoloured. See §5.2, §5.6 and §8.
**Revised 2026-09-16 (a):** the per-row number inputs were replaced by one draggable
bar per class. That change is not cosmetic — it makes a balanced distribution
structural rather than validated, so §4.2, §5, §6 and §7 were rewritten and the
screen's entire error surface was deleted. The wire contract (§9) is unchanged.
**Branch:** `central_investment_preferences` (frontend) / `feat-central_investment_preference` (backend)
**Paired with:** `Prozpr_Backend/docs/superpowers/specs/2026-09-15-subcategory-full-distribution-backend-design.md`
**Supersedes the fine-tune section of:** `2026-09-10-investment-preferences-s4-pct-screen-frontend-design.md`

---

## 1. Context

The Invest ▸ Preferences screen today has two halves. The top half — an explicit
Equity / Debt / Commodity split on a draggable bar — stays exactly as it is. The
bottom half ("FINE-TUNE · OPTIONAL") is what changes.

Today the bottom half is a **partial pin** model: the customer taps "+ Add a
category preference", picks one subcategory from a dropdown, types a share of
the total, and the engine fills everything they did not pin. They can pin one
category or five; whatever is left over is Prozpr's call.

## 2. Goal

Replace partial pinning with a **complete distribution the customer owns**. If
they engage with subcategories at all, they specify the whole picture — every
class adds up, nothing is left to the engine to decide.

## 3. Non-goals

- The class bar (top half) — unchanged, in look *and* interaction. It stays
  draggable once subcategories are filled and re-targets the group budgets live
  (resolved 2026-09-15, §12).
- The chat preference path (`preference_lexicon`) — untouched; this is the
  screen only.
- ELSS and direct stocks — remain non-settable frozen holdings, absent from
  this list (see §4.4, and backend spec §11 for why that matters).
- Changing what the engine does with a *class* preference.

---

## 4. The model shift

### 4.1 From "pin a few" to "all or nothing"

The customer is in exactly one of two states:

| State | What it means | What the engine does |
|---|---|---|
| **Untouched** | No subcategory values at all | Engine decides every subcategory (today's behaviour) |
| **Engaged** | One or more values entered | Customer owns the full distribution; engine places what they asked |

There is no in-between. Entering a single number commits the customer to making
every class add up before they can save.

### 4.2 The binding rule is per-class, not overall — and it is now structural

The headline rule is "your numbers must total 100%", but the rule that actually
binds is stricter:

> **Each class's subcategory values must sum to *exactly* that class's share
> on the bar above.**

Because the bar always totals 100%, per-class exactness makes the overall 100%
fall out automatically.

**Revised 2026-09-16 — this is no longer validated, because it can no longer be
broken.** Each class is drawn as a single bar whose segments are its categories;
a divider trades between the two rows it sits between, so the class total is
invariant under every edit. The only two things that can move a class *budget*
are the bar above and the multi-asset slider, and both run through one function
(`normalise`) that rescales the class's rows in proportion to land back on it.

The consequence is the point: there is no "over", no "under", no invalid state,
no save gate beyond "something changed", and no error copy anywhere on the
screen. The earlier design validated three sums after the fact; this one makes
the sums unbreakable and deletes the validation.

### 4.3 Zero is a real entry

Once engaged, a category at 0% means **"none of this"**, not "engine decides",
and goes on the wire as an explicit `0` (§9).

The earlier design reached zero by *leaving a box blank*. With bars there is no
blank: every row always has a value, and a row reaches zero by being squeezed
flat between its dividers. A flattened row keeps both of its dividers, so it can
always be grown back — see §5.4, which exists only to keep that true.

> **Backend consequence (new — not in the earlier scoping):** a zero in
> `subgroup_emphasis` is a **hard exclusion** in the engine, which is the correct
> reading here. But `resolve_screen_preferences` currently *rejects* a zero
> (`"a pinned share must be above 0%"`) and the GET read-model filters zeros out
> of `saved.pins`. Both must change — see the backend spec.

### 4.4 Setting a preference switches off Prozpr's carve-outs

Decided 2026-09-15 (backend spec §3): once a customer states a preference,
Prozpr stops making bucket decisions for them — no emergency-fund carve-out, no
short- or medium-term goal funding. Their distribution governs the whole corpus.

Two things this screen has to reflect honestly:

- **The 100% is now literally the whole portfolio.** Nothing is skimmed off the
  top before their split applies, so the arithmetic in §4.2 is exact rather than
  approximately-true. (One residual caveat: ELSS and direct stocks are still
  immovable holdings — backend spec §11.)
- **The customer is giving something up, and should be told.** A customer whose
  profile calls for an emergency fund will no longer have one carved, and a goal
  inside five years stops being separately earmarked. That is the deliberate
  trade — autonomy over guardrails — but it should not be a surprise discovered
  later. See the copy in §8.

---

## 5. Screen anatomy

Mobile-first, 375px. **The categories section is collapsed by default** — most
customers are happy with Prozpr's categories, and the detail should not be the
first thing they meet. Its summary line states which state they are in.

```
┌─ Set your asset mix ─────────────────────────────────────────┐
│  (unchanged class bar: YOUR PREFERENCE / PROZPR RECOMMENDS)  │
└──────────────────────────────────────────────────────────────┘

┌─ SET YOUR CATEGORIES                                      ▾ ─┐
│  Following Prozpr's suggestion   (or: Your own split)        │
│    ↑ summary of what is folded away — hidden once expanded   │
└──────────────────────────────────────────────────────────────┘
        │ expanded:
┌───────┴──────────────────────────────────────────────────────┐
│  Multi-asset funds                    Prozpr 47.7    47.7%   │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━○······························ │
│  Counts as 31.0% Equity · 11.9% Debt · 4.8% Commodity        │
├──────────────────────────────────────────────────────────────┤
│  ● EQUITY                                             31.1%  │
│   ▌████████│███████│▌│██████│                                │
│     ↑ one bar; each │ is a draggable divider                 │
│  ● Small-cap               Prozpr 0.0            0.0%        │
│  ● Large-cap               Prozpr 10.5          10.5%        │
│  ● Mid-cap & flexi-cap     Prozpr 10.5          10.5%        │
│  ● Sectoral & thematic     Prozpr 0.0            0.0%        │
│  ● US                      Prozpr 10.1          10.1%        │
│  ● Value                   Prozpr 0.0            0.0%        │
├──────────────────────────────────────────────────────────────┤
│  ● DEBT                                               16.1%  │
│  ● COMMODITY                                           5.1%  │
│    (single-row class — no bar, just the row)                 │
└──────────────────────────────────────────────────────────────┘

┌─ sticky footer ──────────────────────────────────────────────┐
│  [ Reset to Prozpr ]              [ Save preferences ]       │
└──────────────────────────────────────────────────────────────┘
```

**Row labels are shortened on the frontend.** The backend's `SUBGROUP_LABELS`
are written for prose — *"Your large-cap equity sits at ₹4.2L today"* — which is
why they are lowercase and carry a class suffix. Under a group header that
already says EQUITY, `"large-cap equity"` is wrong on both counts, so `shortLabel`
drops the trailing class word and capitalises the first letter. It reads the
class the backend assigned; it never decides one, so the standing rule that the
frontend classifies nothing still holds. `"US"` and `"ELSS (tax-saver)"` survive
untouched because only the first character is altered.

### 5.1 Grouping by class

Rows are grouped under their asset class because the budget is per-class. The
group header carries that budget and nothing else — under the old design it was
the primary feedback surface (`52.0 of 65.0% · 13.0% left`); there is now no
error for it to report, so it states the one fact that matters: how much of the
portfolio this class gets.

### 5.2 Showing the recommendation — a figure per row, not a second bar

Wherever the customer sets a number, what Prozpr recommends is visible next to
it. Each row carries `Prozpr N.N` beside the customer's own value.

**Reversed 2026-09-16.** Earlier revisions of this spec called the dual-bar
treatment a fixed principle: the customer's distribution drawn as a bar with
Prozpr's drawn beneath it, mirroring the class bar at the top of the screen. It
was built, shipped, and then removed.

Why it did not survive contact: the two bars share a palette and sit flush, so
they read as one thick bar rather than a comparison. Fixing that cost a caption,
and the caption then had to move above the bar it labelled to stop being read as
labelling both — and after all that, it was still answering a question the row
figures answer more precisely, in a screen the customer had already told us was
too dense. The per-row figure is exact, needs no legend, and costs no vertical
space.

The principle survives; the *mirroring* did not. The class bar at the top of the
screen keeps its Prozpr twin — there it compares three segments, not eleven.

### 5.3 The interaction

Dragging divider *k* trades rows *k−1* and *k*, clamped by the dividers on
either side. Arrow keys nudge by 1pp. Nothing else in the class moves, so the
total cannot drift.

**Stacked dividers.** A row squeezed to 0% leaves its two dividers on one point.
A press within 16px of both defers the choice until the first movement, then
picks whichever divider is free to travel that way — so a flattened row grows
back from either side. Without this the collapsed row is unrecoverable.

### 5.4 Why the bar is not quite proportional

A 0% row would render zero pixels wide. Three consequences, all bad: its two
dividers stack invisibly, at either end of the class a divider lands on the
bar's own edge where it reads as an end cap, and a class whose budget sits
entirely in one row draws as a solid block with no visible control at all. On
the live dev profile **five of eleven rows are 0.0%**, so this is the normal
case, not an edge case.

So every segment is floored at **1.5% of the bar** (≈4.5px at 375px), and the
shortfall is taken from the rows above the floor in proportion. The large
segments stay within about 1.5pp of their true share; only the invisible ones
are distorted.

This is the one place the bar stops being literally proportional, and it is
contained:

- `segmentLayout` produces the drawn widths, which always sum to 100%.
- `barPosToValue` inverts it, so a drag lands on the value under the finger
  rather than on a raw share of the bar's width. It is monotonic, and a
  boundary maps to exactly that row's cumulative value.
- The numbers beside each row are never transformed. They remain the truth.

A class the bar funds with nothing draws an **empty track** — equal slivers
would read as an even split, which is the opposite of what is true.

**The asset-mix bar at the top uses the same floor** (2026-09-16). It had the
identical fault — squeeze debt flat and its two dividers land on one pixel; push
commodity flat and one sits on the bar's edge — so `flooredShares` /
`sharePosToValue` are the shared primitives and `segmentLayout` /
`barPosToValue` are thin wrappers over them for a class's rows.

### 5.7 The bar must stay on the whole-percent grid

*Revised 2026-09-27: the grid is whole percents, not tenths. `roundPct` (formerly
`round1`) rounds to integers, every figure prints `toFixed(0)`, arrow keys step 1,
typed entry takes digits only, and the values sent on the wire are therefore whole
numbers. The float-artifact reasoning below is unchanged — only the quantum is.*

`applyDividerDrag` snaps every class it returns with `roundPct`.

**Debt is the derived residual on both handles** (`cap − equity`, `cum − floor`).
Subtracting floats therefore returned values like `29.999999999999996`, and
`AssetMixBar` printed the raw number — so the customer saw fifteen decimal places
on the debt segment. Two faults compounding: one that left the grid, and one that
had no formatter to catch it.

Both are fixed, and both rules matter independently — the value goes on the wire
and into every class budget, so it has to be on the grid whether or not anything
prints it. Segment labels are `toFixed(0)`.

### 5.5 The sticky footer

Two buttons: Reset to Prozpr, and Save. The running total, the per-class fault
line and the directional disclaimer have all left it — the first two because the
states they described no longer exist, the third because it belongs with the
other promises (§8). The footer is now a fixed height, so the page reserves a
constant for it rather than measuring.

---

### 5.6 Reference figures must be legible

The `Prozpr N.N` figures are `text-muted-foreground`, not the app's gold accent.

The gold `#D4A868` is hardcoded across the app for graphic accents — bar handles,
the Save button, the tab pill — and is correct there. It is the **dark-theme**
value of `--wealth-amber`, so as small text on the light theme's white card it
lands near 2:1 contrast. It shipped that way at 10px and was reported unreadable.

Rule: the gold is for shapes, never for small text. A figure that exists to be
read takes a foreground token.

**The same fault hit the headings** (2026-09-16). `Set your categories` was an
11px uppercase micro-label at `0.16em` tracking in `muted-foreground` — small,
letter-spaced and low-contrast at once, which is three legibility costs stacked
on the screen's only section heading. It is now 15px semibold sentence-case in
`foreground`. The class labels (EQUITY / DEBT / COMMODITY) keep the uppercase
label style — they name groups rather than head sections — but take a foreground
colour and tighter tracking.

Rule: uppercase + wide tracking is for *labels*, and a label may not also be
low-contrast. Anything that heads a section is sentence case, weighted, and
foreground.

**Both cards carry a heading** — `Set your asset mix` (the three classes) and
`Set your categories` (the eleven subgroups) — so the page reads as a pair of
parallel steps rather than one titled section and one untitled one. "Asset mix"
rather than "split" because §8's notice uses *the split* for the whole
preference, classes and categories together.

Both are real `h2`s under the page's `h1`. The collapsible one uses the standard
accordion pattern, `<h2><button>…</button></h2>` — a heading cannot sit inside a
button, which takes phrasing content only.

## 6. Multi-asset — the three-budget problem

Multi-asset is a single fund holding 65% equity / 25% debt / 10% commodity.
Under this design that split is **real maths, not a label**: one number draws
down all three class budgets at once.

**Placement.** Multi-asset sits *above* the three class groups, in its own
region — it cannot live inside one of them without lying about what it does.

**A capped slider, not a number.** Its maximum is the largest entry the
customer's bar can actually fund: the scarcest class sets the ceiling, and the
published cap steps down until every class is fundable *after* rounding (the
sleeve rounds debt and commodity to a tenth and hands equity the residual, so
the exact ratio can still overdraw by a tenth).

**This retired the overdraw error.** The earlier design let multi-asset outrun a
class and reported it on the row: *"20% multi-asset needs 5.0% debt but your bar
only has 4.0%."* A class budget can no longer go negative, so there is nothing
to warn about — the slider simply stops. `multiAssetOverdraw` is deleted.

**Live breakdown.** Beneath the slider, the decomposition:

> `counts as 31.0% Equity · 11.9% Debt · 4.8% Commodity`

The slider's filled track is a 65/25/10 gradient in the three class colours, so
the control shows the same fact the line states.

**Budgets are net of it.** Each class group's budget is the bar share *minus*
multi-asset's contribution to that class, so the header reads `EQUITY 31.1%`,
not the bar's 62.1%. Moving the slider re-targets all three groups at once and
rescales their rows.

**Accessibility note.** Radix puts `role="slider"` on the *thumb*, so an
`aria-label` on the Root leaves the control unnamed. Label the thumb. This screen
uses the Radix primitive directly rather than the shared `ui/slider` wrapper,
which is styled for `CompleteProfile` and hardcodes its Range and Thumb classes.

---

## 7. States

| State | Group header | Footer | Save |
|---|---|---|---|
| Collapsed, untouched | — | Reset · Save | disabled |
| Expanded, untouched | budget only; bars show Prozpr's recommendation | Reset · Save | disabled |
| Engaged | budget only | Reset · Save | **enabled when changed** |
| Cleared back to engine-decides | budget only | Reset · Save | enabled |

There are no other states. No over, no under, no balanced, no allocated total,
no save-blocked reason — a class is always exactly on its budget, so Save gates
on `dirty` alone.

**Looking is not choosing.** Until the customer moves something, the bars show
Prozpr's recommendation fitted to whatever bar they have set, while `values`
stays blank — so merely opening the section still saves an empty payload, which
means "engine decides". Engagement begins at the first drag.

**Loading a saved distribution.** A saved distribution was stored against the
bar of the day; a later catalog or rounding change can leave it a tenth off. It
is normalised on load, before anyone looks at it.

**The clear path.** Reset to Prozpr sets the bar back to the recommendation and
clears the rows to engine-decides (an empty `pins`), which is the honest meaning
of the button.

---

## 8. Copy

**Page intro.** None since 2026-09-26 — the headline carries it: **"Decide your own
Asset Class Mix"** (renamed 2026-09-26 from "How you want to invest over time", which
had itself just absorbed a one-line intro, "Where you want your whole portfolio to sit
over time.", cut 2026-09-16 from three sentences reading as a wall of text).

**Section intro** (shown when the section is expanded):

> Drag a divider to shift share between categories.

*(Cut 2026-09-16 from a four-line paragraph. The class total and the multi-asset
carve-out are both facts the screen shows continuously; explaining them in prose
as well was redundant.)*

**Removed: the deployment explainer.** A paragraph under the class bar said new
money goes to whatever is furthest from target. It is being dropped because the
deficit-fill logic it describes is itself changing — better silent than stale.

**The collapsed-section summary** (`Following Prozpr's suggestion` / `Your own
split`) — a one-line status under the header while the section was collapsed — was
**removed entirely on 2026-09-26**. The header stands on its own, and the top card's
Your-preference and Prozpr-recommends bars already show whether the customer differs
from the recommendation.

**Scope notice** — a panel above the footer, not a modal. **It always renders**,
because it carries the directional promise, which is true of every saved split.
Only the bullets are conditional.

> **You set the split. We still pick the funds.**   *(amber panel)*
>
> Your preference replaces the allocation we'd have chosen for you. Which funds
> go into each slot, and when to switch them, stays with us.
>
> - **No separate emergency fund.** We'd normally hold a reserve back before
>   investing the rest. With your split, all of it follows your percentages.
> - **We stop offsetting your loans.** You owe more than you hold, so we
>   currently keep some money in short-term debt to cover that. That stops.
>
> This is a directional target — we'll get as close to it as we can, and the
> exact split can move slightly when we fit real funds. You can clear your
> preference any time.

The panel is amber-on-amber (`--wealth-amber` border, `--wealth-amber-light`
ground), not a neutral card — it is the one place on the screen making a promise
about what Prozpr keeps doing, and it should not read as body text.

*(Reframed 2026-09-16. The earlier version led with "You're replacing our
planning, not just our fund picks", which told the customer what they were
taking away without saying what they still get. They are setting the allocation;
fund selection — where Prozpr's work actually shows — is unchanged.)*

**The near-term-goals bullet was removed**, deliberately. It read *"Goals in the
next five years stop being planned for"*, which overstates it: a saved split
changes what a goal's plan is built around, not whether the goal is planned for.
The backend still sends the `near_term_goals` key and the type still carries it;
the frontend simply renders no bullet for it.

Each remaining bullet renders only when its own condition holds:

| Bullet | Trigger | Measured |
|---|---|---|
| Emergency fund | `emergency_fund_needed` | ₹6,00,000 → ₹0 |
| Liability offset | `net_financial_assets < 0` | `short_debt ₹8,00,000` → absent |

**This needs one field on GET.** The screen cannot know which bullets apply —
backend spec §9.1 adds `carve_outs_at_risk`. Until it ships the array is empty
and only the heading and the directional line render, which is the correct
degradation: silence rather than a warning shown to customers it does not apply
to.

**Two different moments — don't conflate them.** This notice fires *before* the
customer commits, so they can change their mind. Separately, the backend
attaches a post-save disclosure on `shortfall_reason` (backend spec §9), which
belongs wherever the resulting plan is shown. Same fact, two places, both wanted:
one is a warning, the other is a record.

**Do not invent your own version of `shortfall_reason`.** It is engine-authored
and already carries the cases where the plan could not meet the ask. Render it;
don't second-guess it.

---

## 9. API contract impact

The existing `PUT /profile/investment-preferences` shape is unchanged in
structure — `{ class_mix, pins[] }`. What changes is what the frontend puts in it:

- When engaged, `pins` carries **every settable category**, not just the ones
  the customer typed into — rows they left blank are sent as explicit `0`.
  This is load-bearing: a row that is *omitted* reads to the engine as
  "unpinned, you decide", which would silently reintroduce partial pinning and
  break all-or-nothing. Blank means zero (§4.3), and zero has to be on the wire
  to mean it.
- So `pins` is either **empty** (untouched, or cleared back to engine-decides)
  or **complete** (one entry per settable category). There is no partial state.

`GET` needs `saved.pins` to round-trip zeros so an emptied row comes back
emptied rather than silently reverting to the engine's number (backend spec §6).

`recommended_pct_of_total` on each `ScreenSubcategory` is already supplied and
is what the per-row "Prozpr N%" reads from — no backend change needed for that.

---

## 10. Files to touch

| File | Change |
|---|---|
| `src/lib/investment-preferences.ts` | Class-budget maths incl. 65/25/10 attribution; `normalise`, `applySegmentDrag`, `maxMultiAsset`, `segmentLayout`, `barPosToValue`, `shortLabel` |
| `src/components/invest/ClassSegmentBar.tsx` | **New** — one class as a draggable segmented bar (§5.3–§5.4) |
| `src/components/invest/SubcategoryPins.tsx` | Rewrite: grouped bars + row legend; every edit leaves through `normalise` |
| `src/components/invest/MultiAssetRow.tsx` | Capped Radix slider with the 65/25/10 gradient and breakdown (§6) |
| `src/components/invest/PreferenceScopeNotice.tsx` | Renamed from `CarveOutNotice`; always renders (§8) |
| `src/pages/InvestPreferences.tsx` | Collapsible section, `normalise` on bar change, fixed-height footer |
| `src/lib/api.ts` | Optional `carve_outs_at_risk` on the GET response (§8) |

**Deleted:** `PctInput.tsx` (no typed entry left), `ClassDistributionBars.tsx`
(absorbed into `ClassSegmentBar`), and from the maths module `distributionValid`,
`resetValues`, `multiAssetOverdraw`, `classStatus` and its `ClassState` — every
one of them describing a state the screen can no longer be in.

## 11. Testing

- `investment-preferences.test.ts` — multi-asset attribution; `normalise` lands
  every class exactly on budget for any bar, including the catalog-rounding case
  (the live catalog sums to 100.1); `applySegmentDrag` preserves the class total
  under any drag and lets a collapsed row grow from either side; `segmentLayout`
  always fills the bar and floors collapsed rows; `barPosToValue` is monotonic
  and maps boundaries back to exact cumulative values; `shortLabel`.
- `ClassSegmentBar.test.tsx` — segment widths, one divider per pair, divider
  naming, keyboard nudge stays on budget, no two dividers on one pixel and none
  on the bar's edge, single-row and zero-budget classes.
- `SubcategoryPins.test.tsx` — budget headers, shortened labels, bar only where
  a class has two or more rows, edits arrive normalised.
- `InvestPreferences.test.tsx` — opening the section does not engage; every row
  sent with explicit zeros once engaged; the distribution stays on the bar when
  the bar moves; untouched still saves a bare class mix; Reset clears to
  engine-decides; the notice always shows the directional line and never the
  near-term-goals bullet.

**Verify against real data, not only fixtures.** Two defects survived a green
unit suite and were caught only in the browser on the live dev profile: the
unlabelled Radix thumb (§6) and the zero-width segments (§5.4). Both were
invisible to tests that supplied tidy values.

## 12. Decisions taken

- **The per-class recommendation bar was removed** (2026-09-16) — reversing a
  principle two earlier revisions called fixed. The reasoning is in §5.2; the
  short version is that it competed with the bar it sat under and answered a
  question the row figures already answered.
- **Gold is for shapes, not small text** (§5.6) — a real contrast defect, not a
  taste call.
- **One segmented bar per class** (2026-09-16) — chosen over per-row sliders and
  over keeping typed boxes with an auto-balance button. It makes balance
  structural (§4.2), which is what let the entire validation and error surface be
  deleted. The cost is that hitting an exact value by dragging is harder than
  typing it; judged acceptable because the screen is a directional target (§8).
- **The bar is floored, not literally proportional** (§5.4) — accepted as a
  deliberate, contained inaccuracy; the row numbers stay exact.
- **The categories section is collapsed by default** (§5).
- **Row labels are shortened on the frontend** (§5) — display only; the backend's
  prose labels are correct for their own use and are not changed.
- **Multi-asset is capped rather than validated** (§6).
- **Recommendation display** — mirrors the class bar's dual treatment, not a
  text annotation (§5.2).
- **Reset to Prozpr** — resets the class bar to the recommendation and clears the
  rows back to engine-decides. What the bars then display is Prozpr's **real**
  recommendation — computed with the emergency fund, goal funding and the full
  practical allocation logic intact (backend spec §8). Saving a distribution then
  suspends those carve-outs, so the plan the customer ends up with is *labelled*
  differently even though the **per-subgroup rupees round-trip**. That equivalence
  depends on backend spec §7 (the debt split); until §7 lands, accepting the
  recommendation can put ₹0 in a debt row the screen showed as 9%.
- **Arbitrage stays a settable category** even though its recommendation is
  0%. Confirmed fundable: 182 ranked funds, none excluded — and it is being
  wired into the long-term engine, which it was previously absent from
  (backend spec §4).
- **The class bar stays draggable once subcategories are set** (§13.1, resolved
  2026-09-15). Budgets re-target live; under the revised design the distribution
  is rescaled to follow rather than being flagged as broken.
- **Zero is a real entry** (§4.3), and zeros go on the wire (§9).
- **A stated preference suspends Prozpr's bucket carve-outs** (§4.4) — any
  preference, including a bare class tilt, not just a full distribution.
  Existing saved preferences therefore change behaviour on their next run.

## 13. Open questions

**None blocking.** The 2026-09-15 questions were resolved and moved to §12: the
bar interaction (§13.1 → stays draggable) and the dual-bar scaling (§5.2 →
normalised with a size label — since superseded, the per-class bar was removed
entirely). The §8 copy is a first iteration and will be refined.

**Not yet exercised end to end.** No real save has run against the backend — the
frontend is verified by unit tests plus a live read of the dev profile. The
contract in §9 is unchanged by the 2026-09-16 revision, so the backend work is
unaffected, but the first genuine round-trip is still the test most likely to
surface a mismatch.

*(`sector_equities` fundability — resolved 2026-09-15: it stays selectable and
this screen treats it like any other row. Sector funds will start being rated,
closing the gap in the data. The §5 mock-up omits it for space only; it is a
normal equity row. The engine-side gap this leaves open is recorded in §12 of the
paired backend spec — worth reading before building the equity group, since it
is the one row where what the customer sets may not be what they end up
holding.)*
