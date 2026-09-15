# Subcategory Full Distribution — Invest ▸ Preferences (Frontend)

**Status:** design — not yet implemented
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

### 4.2 The binding rule is per-class, not overall

The headline rule is "your numbers must total 100%", but the rule that actually
binds is stricter:

> **Each class's subcategory values must sum to *exactly* that class's share
> on the bar above.**

Because the bar always totals 100%, per-class exactness makes the overall 100%
fall out automatically. So the UI validates three sums (equity, debt,
commodity), and the overall total is shown as reassurance, not as the check.

This is stricter than "don't exceed the bar" — a class that is *under* its share
is just as invalid as one that is over, because the leftover has nowhere to go.

### 4.3 Blank means zero

Once engaged, an empty row is read as **0%**, not as "engine decides". The
customer never has to type `0` into the seven categories they do not want. This
keeps "all or nothing" intact — the distribution is still wholly theirs; unfilled
simply means *none of this one*.

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

Three stacked regions replace the current fine-tune card. Mobile-first, 375px.

```
┌─ (unchanged) class bar: YOUR PREFERENCE / PROZPR RECOMMENDS ─┐

┌─ SET YOUR CATEGORIES ────────────────────────────────────────┐
│  Multi-asset fund                          Prozpr 20.0%      │
│  [ 20.0 ] %                                                  │
│  ↳ counts as 13.0% equity · 5.0% debt · 2.0% commodity       │
├──────────────────────────────────────────────────────────────┤
│  EQUITY            52.0 of 65.0%          13.0% left    ●    │
│                                                              │
│    YOURS      ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░                │
│    PROZPR     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                │
│                                                              │
│    Large Cap        Prozpr 7.5%           [ 20.0 ] %         │
│    Mid Cap          Prozpr 26.2%          [ 22.0 ] %         │
│    Small Cap        Prozpr 13.1%          [ 10.0 ] %         │
│    US Equities      Prozpr 11.5%          [      ] %         │
│    Value            Prozpr 0.0%           [      ] %         │
├──────────────────────────────────────────────────────────────┤
│  DEBT               9.0 of 9.0%           balanced      ✓    │
│    (same dual-bar + rows: Short-Term Debt, Arbitrage,        │
│     Arbitrage + Income)                                      │
├──────────────────────────────────────────────────────────────┤
│  COMMODITY          6.0 of 6.0%           balanced      ✓    │
│    (Gold / Commodities)                                      │
└──────────────────────────────────────────────────────────────┘

┌─ sticky footer ──────────────────────────────────────────────┐
│  87.0% allocated · 13.0% left      [ Save preferences ]      │
└──────────────────────────────────────────────────────────────┘
```

### 5.1 Grouping by class

Rows are grouped under their asset class because the constraint is per-class.
Each group header carries a **live budget**: allocated / target, and the
remaining gap. This is the primary feedback surface — the customer should be
able to fix an invalid state by looking only at group headers.

### 5.2 Showing the recommendation — mirror the class bar

The recommendation is not a footnote. It gets the **same dual treatment the
class bar already uses**: the customer's split shown against Prozpr's, as two
parallel bars, so the comparison is visual rather than arithmetic.

Applied per class group: a stacked bar of the customer's distribution across
that class's categories, and directly beneath it Prozpr's recommended
distribution across the same categories — segment colours consistent between
the two so the eye maps them without a legend. The per-row `Prozpr N%` figure
stays as the precise number behind the picture.

The principle is fixed: wherever the customer sets a number, what Prozpr
recommends is visible next to it, in the same visual language as the class bar
above.

**Resolved 2026-09-15 — normalised, with a size label.** The two bars can have
different totals: Prozpr's recommendation for a class is its own number, while
the customer's class share is whatever they set. Drawn at true width the bars are
different lengths and the segments are not comparable; normalised they are
comparable but hide that the customer is running a smaller book. So: **both bars
render full width**, and a line above them carries both totals —
`Yours 20.0% · Prozpr 40.0%` — so the mix is comparable *and* the size difference
is stated.

Both bars measure the **rows in the table beneath**, multi-asset excluded from
each. Comparing a class share that silently includes the multi-asset draw against
a table that does not is the same category error the per-class budgets exist to
prevent.

Segment colours come from `CLASS_COLOR` at descending opacity by position — no new
palette, and the two bars map onto each other by index.

### 5.3 The sticky footer

With eleven rows the customer will be scrolled away from any summary, so the
running total and the Save button are pinned to the bottom. Save is disabled
until all three class budgets balance (§7).

---

## 6. Multi-asset — the three-budget problem

This is the hardest interaction in the screen and deserves its own treatment.

Multi-asset is a single fund holding 65% equity / 25% debt / 10% commodity.
Under this design that split is **real maths, not a label**: one number the
customer types draws down all three class budgets at once.

**Placement.** Multi-asset sits *above* the three class groups, in its own
region — it cannot live inside one of them without lying about what it does.

**Live breakdown.** The moment a value is entered, show the decomposition
directly beneath the input:

> `20%  ↳ counts as 13.0% equity · 5.0% debt · 2.0% commodity`

**Budgets are net of it.** Each class group's target is the bar share *minus*
multi-asset's contribution to that class. With the bar at 78/14/8 and
multi-asset at 20%:

| Class | Bar | Multi-asset draw | Budget for the rows below |
|---|---|---|---|
| Equity | 78.0% | 13.0% | **65.0%** |
| Debt | 14.0% | 5.0% | **9.0%** |
| Commodity | 8.0% | 2.0% | **6.0%** |

So the group header reads `EQUITY · 52.0 of 65.0%`, not `of 78%`. Changing the
multi-asset number re-targets all three groups simultaneously — the headers
should animate so that cause and effect are visible.

**Edge case.** If multi-asset is set so high that its draw on any single class
exceeds that class's bar share, the budget for that class goes negative. Surface
it on the multi-asset row itself, not the class group: *"20% multi-asset needs
5.0% debt but your bar only has 4.0% — raise Debt above, or lower this."*

---

## 7. States and validation

| State | Group header | Footer | Save |
|---|---|---|---|
| Untouched (all blank) | neutral, no budget shown | hidden | disabled |
| Under budget | `52.0 of 65.0% · 13.0% left`, amber dot | `13.0% left` | disabled |
| Over budget | `71.0 of 65.0% · 6.0% over`, red dot | `6.0% over` | disabled |
| Balanced | `65.0 of 65.0% · balanced`, green tick | `100% allocated` | **enabled** |
| Clearing a saved preference | all rows emptied | `Preference cleared` | enabled |

**Per-row input rules.** Numeric, one decimal place, 0–100. No spinners on
mobile. Clamp at the class budget on blur rather than mid-keystroke (typing
"2" on the way to "25" should not fight the customer).

**The clear path.** A customer with a saved distribution who empties every row
is asking to go back to engine-decides. That must be saveable — it maps to an
empty `pins` array — so Save stays enabled in that specific state.

---

## 8. Copy

**Section intro** (replaces "Pin a specific category…"):

> Set the share of your whole portfolio for each category. Anything you leave
> blank counts as zero. Each class has to add up to the budget shown next to it —
> the multi-asset fund is counted separately, because it holds all three.

*(Corrected 2026-09-15. The earlier wording — "the numbers in each class need to
add up to what you chose above" — describes a rule the screen does not enforce:
once multi-asset is filled, the rows under Equity add up to the budget, which is
the bar share minus multi-asset's draw, not to the bar itself.)*

**Directional disclaimer** — sits just above the Save button, always visible:

> This is a directional target. We'll get as close to it as we can; the exact
> final split can move slightly when we fit real funds.

**Carve-out notice** — a panel directly above Save, not a modal. First iteration,
written 2026-09-15 from the measured consequences in backend spec §3.3–§3.4:

> **You're replacing our planning, not just our fund picks**
>
> You're telling us where your whole portfolio should sit, so we'll stop making
> these calls for you:
>
> - **No separate emergency fund.** We'd normally hold a reserve back before
>   investing the rest. We won't — all of it follows your split.
> - **Goals in the next five years stop being planned for.** They stay on your
>   record, but your plan gets built around your split, not around their dates.
> - **We'll stop offsetting your loans.** You owe more than you hold, so we
>   currently keep some money in short-term debt to cover that. That stops.
>
> You can clear your preference any time and we'll go back to planning it for you.

Three separate facts, three separate triggers — so each bullet renders only when
its own condition holds:

| Bullet | Trigger | Measured |
|---|---|---|
| Emergency fund | `emergency_fund_needed` | ₹6,00,000 → ₹0 |
| Near-term goals | any goal < 60 months | an 18-month ₹20,00,000 goal absorbed into the long-term pool, absent from `goals_allocated` |
| Liability offset | `net_financial_assets < 0` | `short_debt ₹8,00,000` → absent |

The second bullet says *"stop being planned for"*, not *"stop being earmarked"*,
deliberately: under backend §3.3 a sub-60-month goal does not merely lose its
bucket linkage, it **leaves the plan** — step 4 only selects goals ≥ 60 months.
The third is not an emergency-fund story at all; it is a liability offset a
leveraged customer never expressed a preference about (backend §3.4).

**This needs one new field on GET.** The screen cannot know which bullets apply —
`ScreenPreferenceGetResponse` carries no profile flags. Backend spec §9.1 adds
`carve_outs_at_risk`, the same three conditions Change 8 already evaluates for
`shortfall_reason`. Until it ships, the field is absent and the panel renders
nothing, which is the correct degradation: silence rather than a warning shown to
customers it does not apply to.

**Two different moments — don't conflate them.** This notice fires *before* the
customer commits, so they can change their mind. Separately, the backend now
attaches a post-save disclosure on `shortfall_reason` saying the buffer was
suspended (backend spec §9), which belongs wherever the resulting plan is shown.
Same fact, two places, both wanted: one is a warning, the other is a record.

**Do not invent your own version of `shortfall_reason`.** It is engine-authored
and already carries the cases where the plan could not meet the ask. Render it;
don't second-guess it. (Backend spec §8 also adds a rounding tolerance so a
±0.1pp difference stops producing a spurious "your multi-asset choice was larger
than your split can fund" warning — if you see one of those in testing before
that lands, it is the known bug, not your maths.)

**Group header when balanced:** `balanced` (not "valid" / "OK" — this is money,
not a form).

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
| `src/components/invest/SubcategoryPins.tsx` | Rewrite: dropdown+single-pin → grouped full table |
| `src/components/invest/MultiAssetRow.tsx` | **New** — the three-budget row and its breakdown |
| `src/lib/investment-preferences.ts` | Per-class budget maths incl. 65/25/10 attribution; replace `pinsValid` |
| `src/pages/InvestPreferences.tsx` | Sticky footer, save-gating, cleared-state handling |
| `src/components/invest/ClassDistributionBars.tsx` | **New** — the yours-vs-Prozpr bars per class group (§5.2) |
| `src/lib/api.ts` | Add optional `carve_outs_at_risk` to the GET response (§8). `pct_of_total: 0` already passes — it is typed `number`, with no client-side guard |

## 11. Testing

- `investment-preferences.test.ts` — budget maths: multi-asset attribution,
  per-class sums, the negative-budget edge case, blank-as-zero.
- `SubcategoryPins.test.tsx` — group headers reflect over/under/balanced;
  Save gating; clearing all rows stays saveable.
- `InvestPreferences.test.tsx` — untouched state still saves a bare class mix.

## 12. Decisions taken

- **Recommendation display** — mirrors the class bar's dual treatment, not a
  text annotation (§5.2).
- **Reset to Prozpr** — resets *everything*: the class bar and every
  subcategory row, back to Prozpr's recommendation. Not a bar-only reset.
  What Reset fills the rows with is Prozpr's **real** recommendation — computed
  with the emergency fund, goal funding and the full practical allocation logic
  intact (backend spec §8). Saving it then suspends those carve-outs, so the
  plan the customer ends up with is *labelled* differently — everything becomes
  long-term, goals stop being earmarked — even though the **per-subgroup rupees
  round-trip**. That equivalence depends on backend spec §7 (the debt split);
  until §7 lands, accepting the recommendation can put ₹0 in a debt row the
  screen showed as 9%. Nothing to build here, but don't trust Reset in testing
  before then.
- **Arbitrage stays a settable category** even though its recommendation is
  0%. Confirmed fundable: 182 ranked funds, none excluded — and it is being
  wired into the long-term engine, which it was previously absent from
  (backend spec §4).
- **Recommendation bars — normalised, with both totals labelled above** (§5.2,
  resolved 2026-09-15).
- **The class bar stays draggable once subcategories are filled** (§13.1, resolved
  2026-09-15). Budgets re-target live, the group headers show which classes broke,
  Save disables until they balance. This is today's behaviour, so it costs nothing
  to build; the alternative (locking with an explicit unlock) stays available as a
  later change and needs no maths rework.
- **Blank means zero** once engaged (§4.3), and zeros go on the wire (§9).
- **A stated preference suspends Prozpr's bucket carve-outs** (§4.4) — any
  preference, including a bare class tilt, not just a full distribution.
  Existing saved preferences therefore change behaviour on their next run.

## 13. Open questions

**None blocking.** Both former open questions were resolved on 2026-09-15 and
moved to §12: the bar interaction (§13.1 → stays draggable) and the dual-bar
scaling (§5.2 → normalised with a size label). The carve-out copy in §8 is a
first iteration and will be refined.

*(`sector_equities` fundability — resolved 2026-09-15: it stays selectable and
this screen treats it like any other row. Sector funds will start being rated,
closing the gap in the data. The §5 mock-up omits it for space only; it is a
normal equity row. The engine-side gap this leaves open is recorded in §12 of the
paired backend spec — worth reading before building the equity group, since it
is the one row where what the customer sets may not be what they end up
holding.)*
