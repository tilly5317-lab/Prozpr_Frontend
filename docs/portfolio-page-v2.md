# Portfolio page — v2 changes

The portfolio dashboard (`/portfolio`, and `/` for onboarded users) as of v2.
Recorded so the set can be reversed as a unit: **"reverse the portfolio v2
changes"** means undoing everything listed here and nothing else.

Separate from `mf-page-v2.md` and `compare-page-v2.md`. The three version
independently.

## What v2 changed

The theme: the page was **data-first** — every section stated a fact and left
interpretation to the reader. Pi's job is interpretation, so v2 moves the
verdicts Prozpr already computes onto the page itself.

### 2 · Fund verdicts, surfaced

`PortfolioInsightsResponse` already carries `verdict`, `verdict_reason`,
`rebalance_action` and `rebalance_reason` **per fund** — real, computed, and
previously reachable only by opening a modal. Now one line under each holding
row, with a verdict dot.

### 4 · "Since you last looked"

A strip above the value, diffing today against the last recorded snapshot.

**Scope limit, deliberate:** `PortfolioHistoryPoint` carries only
`recorded_date` and `total_value`, so this can honestly report the change in
value and the period it covers — and nothing else. It does NOT report
allocation drift or fund-quality changes; the history endpoint would need to
carry an allocation snapshot first. Claiming drift from a value-only series
would be invention.

### 6 · Ask Pi about this

Chart slices, holdings and the allocation card carry an "Ask Pi" affordance that
opens the chat sheet with the question already written into the composer.

Seeds the composer rather than auto-sending: the user can edit before asking,
and a question they didn't write being sent on their behalf reads as the app
talking to itself.

Required a new optional `prefill` prop threaded `PortfolioDashboard` →
`AIChatSheet` → `AIChatPanel`.

### 8 · One action card

Discover, Ideas for you and Everyday spending previously competed for the same
slot. v2 puts a single Pi-chosen next action above them, derived from the
insights feed (funds flagged for attention) with the others one tap behind it.

## Files v2 added

- `src/components/dashboard/PortfolioSinceLast.tsx` — the "since you last
  looked" strip
- `src/components/dashboard/NextActionCard.tsx` — the single action card
- `src/lib/portfolioVerdicts.ts` — verdict lookup and next-action selection
- `src/lib/portfolioDemoData.ts` — **stand-in verdicts and history for when the
  API is down.** The v2 sections hide on a failed call, which makes them
  impossible to review without a backend. Used ONLY when the real call throws;
  a successful response, even an empty one, always wins. Delete this file and
  the two `.catch` bodies in `PortfolioDashboard.tsx` to restore hide-on-failure.
- `docs/portfolio-page-v2.md` — this file

## Files v2 modified

- `src/components/dashboard/PortfolioDashboard.tsx` — mounts the strip, the
  action card, and the chat prefill state
- `src/components/dashboard/CurrentAllocationCard.tsx` — verdict lines and Ask
  Pi on holding rows
- `src/components/dashboard/AIChatSheet.tsx` — passes `prefill` through
- `src/components/chat/AIChatPanel.tsx` — accepts `prefill`, seeds the composer

## To reverse

Delete the three added components, drop their mounts from
`PortfolioDashboard.tsx`, remove the verdict lines and Ask Pi buttons from
`CurrentAllocationCard.tsx`, and remove the `prefill` prop from `AIChatSheet` and
`AIChatPanel`. No calculation or backend contract changed in v2.
