# Chat rebalancing plan: anchor to its own run + show trades in a modal

- **Date:** 2026-08-30
- **Branch:** `saving_rebalancing_tilts`
- **Status:** Approved design, revised after adversarial audit; pending final review

## Problem

When a customer asks for portfolio changes in chat, the AI reply renders two pills:
**View plan** and **Save plan** ([`AIChatPanel.tsx:1969-2022`](../../../src/components/chat/AIChatPanel.tsx)).
Two problems were reported:

1. **False "Saved" state.** After clicking *View plan* and returning to chat, the pill
   displays as "Saved" even though the customer never saved the plan.
2. **Divergence.** The plan reached via *View plan* can differ from what the customer
   expects (and from what the Invest page shows).

## What actually happens today

- *View plan* is **pure navigation** — `navigate("/invest/rebalance-explanation")`
  ([`AIChatPanel.tsx:1975`](../../../src/components/chat/AIChatPanel.tsx)). It does **not**
  save anything. The destination page ([`RebalanceExplanation.tsx`](../../../src/pages/RebalanceExplanation.tsx))
  is read-only (its execute CTA is disabled; it imports no save function).
- The **"Saved" badge is a rehydration artifact.** Every time the chat panel re-mounts,
  `rehydrateRebalancingPill` ([`AIChatPanel.tsx:1048-1069`](../../../src/components/chat/AIChatPanel.tsx),
  called at `:1360` on session restore and `:1230` on session select) calls
  `getCurrentRebalancingRun()`. That endpoint returns *"the committed (saved) run if one
  exists, else the latest run"* ([`api.ts:2752-2756`](../../../src/lib/api.ts)). The function
  then **stamps that run's id and its `origin === "saved"` flag onto the newest rebalancing
  message** (`:1063`, `:1066-1068`). So if the customer ever saved *any* plan, their newest
  message's pill lights up "Saved."
- The persisted message type `ChatMessageInfo` ([`api.ts:933-940`](../../../src/lib/api.ts))
  carries **no rebalancing run id** (it has id, role, content, intent, intent_confidence,
  intent_reasoning, chart_payloads, created_at). That absence is *why* the code falls back to
  the global "current" lookup on restore, and it is the shared root of both problems.

### Root cause (unified)

The chat pill's saved-state **and** the *View plan* destination both resolve through a
**global "current plan"** lookup instead of the **specific run the message produced**. Each
freshly-sent message already knows its run (`msg.rebalancingRunId`, set at
[`AIChatPanel.tsx:1641-1652`](../../../src/components/chat/AIChatPanel.tsx)), but that identity
is lost on restore and overwritten by the global current run.

## Decisions (confirmed with the user)

1. **Backend scope: in.** The backend will add the run id to chat history so restored
   messages know their own plan. This is the clean, complete fix.
2. **Modal content: trades + cost summary.** The modal shows the proposed trades plus a
   compact totals strip (total buy, total sell, net cash, estimated tax).
3. **Pill structure: keep two pills** (surgical). *View plan* opens the modal; *Save plan*
   remains the explicit deliberate save. The modal footer also offers "Save this plan" so
   review-then-save works in one place.
4. **Modal is self-contained; no link back to the full Invest page.** (See "Revisions from
   audit" — an "open full breakdown" link would reintroduce divergence, so it is cut.) The
   drift chart remains available via the "Invest" bottom-nav tab, which continues to show the
   global current plan.

## Goals

- The *View plan* pill opens the **exact** run its own message produced.
- "Saved" is shown **only** when that specific message's run has actually been committed.
- No navigation and no save side-effects happen merely from viewing a plan.
- Snapshot-only messages (no rebalancing run) keep working exactly as today.
- Frontend degrades gracefully if the backend field is not yet deployed.

## Non-goals

- Executing/placing trades (the "Place these trades" CTA remains out of scope / disabled).
- Redesigning the Invest / RebalanceExplanation page or making it load a specific run. It
  stays as the "Invest" bottom-nav tab ([`BottomNav.tsx:10`](../../../src/components/BottomNav.tsx))
  showing the global current plan. **This spec does not touch that page.**
- Changing how a rebalancing run is computed or what the backend engine returns.

## Design

### A. Contract change — the run id travels with each message

The backend already knows `ideal_allocation_rebalancing_id` at send time
([`ChatSendResponse`, api.ts:947-948](../../../src/lib/api.ts)); it simply is not returned in
chat history. Change:

- **Backend (separate repo — spec'd here, not implemented in this repo):** include
  `ideal_allocation_rebalancing_id` and `ideal_allocation_snapshot_id` on the persisted
  `ChatMessageInfo` returned by the chat-history endpoint.
- **Frontend:** mirror those two optional fields on the `ChatMessageInfo` type
  ([`api.ts:933-940`](../../../src/lib/api.ts)). Read-only; the frontend never writes them.

Two fields (not just the rebalancing id) so restore can reproduce the same
`showViewExecutePlan` trigger used on fresh send (rebalancing id **or** snapshot id present).

### B. Core bug fix — a pure, testable derivation, anchored per message

Extract the pill derivation into a **pure, exported function** so it is unit-testable without
rendering the component:

```
// src/lib/rebalancing-pills.ts  (new)
// Given restored messages and the backend's current run, decide each message's
// pill flags and which run ids are saved — no React, no side effects.
deriveRebalancingPills(
  messages: Array<{ id; role; ideal_allocation_rebalancing_id?; ideal_allocation_snapshot_id? }>,
  current: { id: string; origin: string | null } | null,
): {
  perMessage: Record<messageId, { showViewExecutePlan: boolean; rebalancingRunId?: string }>,
  savedRunIds: string[],
}
```

Rules:

1. For **each** message, derive from **its own** persisted fields (mirroring fresh-send at
   `:1641-1652`, applied per message):
   - `showViewExecutePlan = Boolean(ideal_allocation_rebalancing_id || ideal_allocation_snapshot_id)`
   - `rebalancingRunId = ideal_allocation_rebalancing_id ?? undefined` (never overwritten by a
     global value).
2. `savedRunIds` contains a run id **iff** some message's `rebalancingRunId === current.id`
   **and** `current.origin === "saved"`. No other message is marked saved.

`rehydrateRebalancingPill` ([`AIChatPanel.tsx:1048-1069`](../../../src/components/chat/AIChatPanel.tsx))
becomes a thin wrapper: call `getCurrentRebalancingRun()` once (only to learn *which* run is
committed), call `deriveRebalancingPills`, then apply the result via `setMessages` /
`setSavedRunIds`. `savedRunIds` is still only ever mutated by `handleSavePlan` (real save,
`:1035`) and this path. This fixes both call sites (`:1360` restore, `:1230` session select).

Result: a plan the customer saved shows "Saved"; a newer unsaved plan shows "Save plan"; the
false badge is gone.

### C. View plan → in-chat modal (built on the existing Dialog primitive)

**Pill wiring** ([`AIChatPanel.tsx:1971-1981`](../../../src/components/chat/AIChatPanel.tsx)):
the *View plan* button's `onClick` branches on the message's own run id:

- `msg.rebalancingRunId` present → open `RebalancePlanModal` for that run id.
- **Snapshot-only** (`showViewExecutePlan` true but no `rebalancingRunId`) → keep today's
  behavior: `navigate("/invest/rebalance-explanation")`. There are no trades to show, so the
  modal does not apply. This keeps `RebalancePlanModal`'s `runId` prop non-optional and never
  fetches `/rebalancing/undefined`.

**New component** `src/components/chat/RebalancePlanModal.tsx`:

- **Built on the existing `Dialog` primitive** from [`@/components/ui/dialog`](../../../src/components/ui/dialog.tsx)
  (Radix-backed, mirroring [`ReportIssueDialog.tsx`](../../../src/components/ReportIssueDialog.tsx)).
  This provides focus trap, Escape-to-close, `aria-modal`/labelled title, and focus restoration
  for free — do **not** hand-roll an overlay.
- Props: `runId: string`, `isSaved: boolean`, `isSaving: boolean`, `onSave: () => void`,
  `open: boolean`, `onOpenChange: (open: boolean) => void`.
- On open, fetches `getRebalancingRunDetail(runId)` ([api.ts:2742-2744](../../../src/lib/api.ts))
  — the **exact** run, not the global current.
- **State matrix** (with concrete copy):
  - *loading*: spinner + "Loading your plan…"
  - *error* (fetch rejects): "Couldn't load this plan. Try again." + a Retry button.
  - *empty* (`detail.trades.length === 0`): "This plan has no trades — your portfolio is
    already on target."
  - *loaded*: cost strip + trades (below).
- **Cost summary strip** — only when `detail.totals !== null` (`totals` is
  `RebalancingTotals | null`, [api.ts:2725](../../../src/lib/api.ts)); if null, omit the strip
  and render trades alone. Fields: total buy (`total_buy_inr`), total sell (`total_sell_inr`),
  net cash (`net_cash_flow_inr`), estimated tax (`total_tax_estimate_inr`)
  ([api.ts:2673-2676](../../../src/lib/api.ts)).
- **Proposed trades** from `detail.trades` (non-null): each row shows a BUY/SELL badge (collapse
  `action === "EXIT"` → SELL), fund name (`recommended_fund`), and signed INR amount
  (`amount_inr`), grouped by reason (`reason_title`). Rendered **self-contained** in the modal
  (a small local map/group + INR formatter) — this spec does not refactor the Invest page.
- **Header** shows a "Saved plan" badge when `detail.origin === "saved"`, using the **same gold
  treatment** as the existing saved pill (`rgba(212,168,104,…)` / `#9A7B2E`,
  [`AIChatPanel.tsx:~1994-2010`](../../../src/components/chat/AIChatPanel.tsx)) for visual parity.
- **Footer**: "Save this plan" (calls `onSave` → existing `handleSavePlan`; reflects
  saving/saved/disabled from the `isSaving`/`isSaved` props, which are read from the same
  `savingRunId`/`savedRunIds` state the pill uses, so a save from either surface reflects in
  both) + Close.
- **Mobile**: the trades list is variable-length and `DialogContent` is a fixed centered box
  with no scroll ([`ui/dialog.tsx`](../../../src/components/ui/dialog.tsx)), so wrap the modal
  body in a height-capped scroll container (`max-h-[70vh] overflow-y-auto`) and keep clear of
  the BottomNav / safe area.

### D. Graceful degradation (backend field not yet deployed)

If **no** restored message carries the new fields (backend not yet deployed),
`deriveRebalancingPills` takes an interim path: it attaches the global current run to the
**last rebalancing turn** for the View/Save affordance, but marks **nothing** saved. Concretely:

- **No false "Saved."** This is the reported bug, and it is eliminated in the interim (we never
  add to `savedRunIds` when we can't attribute the save to a specific message).
- **View plan still works** on that message — it opens the modal for the global current run
  (the best available identity in the interim), so the affordance is never a dead button. Once
  the backend field ships, every message resolves to its *own* run instead.
- **Honest trade-off:** in the interim, a genuinely-saved *newest* plan may briefly show "Save
  plan" instead of "Saved" (a harmless false-negative — `saveRebalancingRun` is idempotent,
  [api.ts:2746-2750](../../../src/lib/api.ts)). This is the deliberate cost of never showing a
  false "Saved"; it disappears once the backend field ships and every message resolves exactly.

## Testing

- **`deriveRebalancingPills` unit tests** (vitest — the repo's `test` script; place beside
  [`rebalancing-save.test.ts`](../../../src/lib/rebalancing-save.test.ts)):
  1. **Saved attribution:** multiple rebalancing messages each with its own run id + a
     `current` run with `origin === "saved"` → **only** the message whose run id equals
     `current.id` is in `savedRunIds`; a newer unsaved message is not.
  2. **No false saved:** messages lacking the new fields → `savedRunIds` empty, all
     `rebalancingRunId` undefined.
  3. **Snapshot-only:** a message with only `ideal_allocation_snapshot_id` →
     `showViewExecutePlan: true`, `rebalancingRunId: undefined`.
- **Modal smoke test** (optional, React Testing Library is available — `@testing-library/react`
  + jsdom, [`src/test/setup.ts`](../../../src/test/setup.ts)): with a mocked
  `getRebalancingRunDetail`, opening for a run id fetches that id (not the global current) and
  renders its trades; null `totals` hides the cost strip without crashing.

## Files touched

**Frontend:**
- `src/lib/rebalancing-pills.ts` — **new** pure `deriveRebalancingPills` helper.
- `src/lib/rebalancing-pills.test.ts` — **new** unit tests (or extend `rebalancing-save.test.ts`).
- `src/components/chat/RebalancePlanModal.tsx` — **new** modal on the `ui/dialog` primitive.
- `src/components/chat/AIChatPanel.tsx` — rewrite `rehydrateRebalancingPill` to use the helper;
  branch the *View plan* onClick (modal vs navigation); mount the modal.
- `src/lib/api.ts` — add two optional fields to `ChatMessageInfo` (type only).
- *(RebalanceExplanation.tsx is **not** touched.)*

**Backend (separate repo — required contract change, not implemented here):**
- Add `ideal_allocation_rebalancing_id` and `ideal_allocation_snapshot_id` to the
  `ChatMessageInfo` returned by chat history.

## Revisions from the adversarial audit

The first draft was audited against the code by five independent lenses. Changes folded in:

- **Blocker — snapshot-only messages.** `showViewExecutePlan` can be true with no run id;
  the modal required one. **Fix:** View plan branches — modal when a run id exists, else
  navigation (§C).
- **Major — "open full breakdown" link reintroduced divergence** (the Invest page always loads
  the global current run). **Fix:** link cut; modal is self-contained (Decision 4, §C).
- **Major — shared-util extraction** pulled 6 transitive symbols out of a working page for only
  presentation parity, which run-id anchoring already makes unnecessary. **Fix:** dropped; modal
  renders trades self-contained (§C). RebalanceExplanation.tsx untouched.
- **Major — null `totals`** would crash the cost strip. **Fix:** guard added (§C).
- **Major — modal a11y / reuse.** **Fix:** build on the existing Radix `Dialog` primitive (§C).
- **Major — test #1 not implementable** (`rehydrateRebalancingPill` is an un-exported closure).
  **Fix:** extract pure `deriveRebalancingPills` and test that (§B, Testing).
- **Major — mobile overflow.** **Fix:** height-capped scroll container (§C).
- **Minor — degradation over-claimed "never worse than today."** **Fix:** stated the honest
  false-negative trade-off (§D).
- **Nits — api.ts line anchors + "only intent" wording.** Corrected throughout.
