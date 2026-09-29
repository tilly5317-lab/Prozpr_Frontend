# Invest Preferences — Screen, Pill & Active Indicator (Frontend) — Design Spec

**Status:** draft, 2026-09-06. Frontend companion to the backend S1/S2/S2b/S2c work
(`Prozpr_Backend/docs/superpowers/specs/2026-09-0*-investment-preferences-*`). Backend
S3 (`2026-09-04-investment-preferences-s3-screen-design.md`) specced the screen's card /
chip internals; this spec places that screen in THIS app, adds the preference pill, and
adds the active-preference indicator. Called "S3b" in the backend conversation.

**Placement decision (Amoul, 2026-09-06):** the standing preferences screen lives in the
**Invest** section, reached as its own page ("on the next page"), not a modal or drawer.

---

## 1. Why

Customers can already see and save a rebalancing PLAN (chat pill + Invest-page "Saved plan"
badge). They cannot yet set or see a standing PREFERENCE from a screen, and the chat what-if
that writes a candidate preference has no "save preference" affordance. This spec adds the
preferences screen, the preference pill, and the active-preference indicator, reusing the
plan-pill machinery already in the app.

## 2. What already exists in this repo (do NOT rebuild)

- **Rebalancing plan pill in chat** — `src/lib/rebalancing-pills.ts` (`deriveRebalancingPills`),
  rendered per assistant message in `src/components/chat/AIChatPanel.tsx` as "View execute plan"
  + "Save plan"/"Saved", opening `src/components/chat/RebalancePlanModal.tsx`. Save calls
  `saveRebalancingRun(runId)` → `POST /rebalancing/{id}/save` (`src/lib/api.ts:2753`).
- **Rebalancing active-plan indicator** — `src/pages/RebalanceExplanation.tsx:~782` shows a
  "Saved plan" badge (Bookmark) when `getCurrentRebalancingRun().origin === "saved"`, with a
  "Recalculate" action beside it. This is the pattern to mirror for preferences.
- **The Invest section** — route `/invest` → `InvestLayout` (`src/components/invest/InvestLayout.tsx`)
  with a 3-way gold-pill toggle `InvestTabs` (`src/components/invest/InvestTabs.tsx`):
  Rebalancing (`/invest/rebalance-explanation`), SIP (`/invest/sip`), Lump sum (`/invest/lumpsum`).
- **AINV plan reads** — `getSipPlan()` / `getLumpSumPlan()` (`src/lib/api.ts:1600/1691`) →
  `GET /additional-investment/sip|lumpsum`.
- **Design system** — shadcn/ui in `src/components/ui/` (button, dialog, badge, select, slider,
  sonner toasts). TanStack Query, react-router v6, framer-motion. **No** ToggleGroup / segmented /
  chip primitive exists — the 5-chip control is new.

> Route-name caution: `/profile/investment-preferences` is ALREADY taken by an onboarding
> "investment preference and focus" review step (`src/pages/CompleteProfile.tsx`, a different,
> pre-S1 concept). The new standing screen must NOT reuse that route — see §4.1.

## 3. Scope (the new work)

1. The preferences **screen** as a page in the Invest section (§4).
2. The **preference pill** in chat — rebalancing and AINV what-if turns get "View / Save
   preference", mirroring the plan pill (§5).
3. The **active-preference indicator** (§6).
4. The **API client** additions and types (§7).

## Design finalization — DECIDED (Amoul, 2026-09-07)

**Inherit the app's system — no separate mockup.** The existing Invest-section components and tokens
ARE the design authority: the `InvestTabs` gold-pill toggle (for the 4th tab and the `PreferenceSpectrum`
chips), the `RebalanceExplanation` cards + "Saved plan" badge, the `RebalancePlanModal` sheet (for the
preview drawer), shadcn `button`/`dialog`/`badge`, and sonner toasts. Match spacing, radii, colours, and
type from these; introduce no new visual language. The reuse anchors named throughout this spec are the
design reference the implementer follows.

## 4. The preferences screen

### 4.1 Route & entry point — DECIDED (Amoul, 2026-09-06)
- **Route:** `/invest/preferences` (nested under the existing `/invest` layout, alongside
  `rebalance-explanation` / `sip` / `lumpsum`). Avoids the `/profile/investment-preferences`
  collision and satisfies "in the Invest page".
- **Entry affordance: a fourth tab in `InvestTabs`**, labelled **Preferences**, so a customer can
  set preferences through the UI directly (a standing surface, not only via chat). The toggle goes
  from 3-way to 4-way: **Rebalancing · SIP · Lump sum · Preferences**.
  - `InvestTabs.tsx`: add the `{ key: "preferences", label: "Preferences" }` entry and the
    `activeKey` branch; the shared `layoutId` gold pill still animates across all four.
  - Add the nested route in `App.tsx` under `/invest`: `<Route path="preferences" element={<Preferences />} />`.
  - Space: four labels in the `max-w-md` pill is tight on mobile — shorten to **Prefs** (or an icon)
    if "Preferences" overflows; keep the other three labels unchanged. Minor visual call at build.
- Back navigation returns to the Invest tab the customer came from.

### 4.2 Structure (internals per backend S3 spec §3 — do not re-derive)
One scrollable page: Card A (overall mix) + Card B (fund categories), a preview drawer on any
change, and a Save / Reset-to-Prozpr footer. **No sliders, no percentages shown** (product ruling).

### 4.3 The 5-chip spectrum control (NEW component)
- `src/components/invest/PreferenceSpectrum.tsx` — five ordered chips
  **Not preferred · Less · Neutral · More · Heavy**, one selectable at a time.
- Build from buttons following the `InvestTabs` animated gold-pill pattern (framer-motion
  `layoutId`) for the selected chip; reuse tokens, not the 3-tab component.
- Emits the S1 token: Neutral = facet absent; the four active chips map to
  `more | less | none | heavy`. The screen assembles `{asset_class?, subgroups?}` from the chips.
- Renders selected state from `customer_choices` on load (backend S3 §4) — never from resolved %.
- Card A resets the other two classes to Neutral when one class goes non-neutral (one class at a
  time, structural in the wire format). Gold class chip and the Gold & commodities category row are
  the same control shown twice — keep them in sync.

### 4.4 Preview drawer
- A bottom sheet on shadcn `dialog.tsx` (or `RebalancePlanModal`'s sheet pattern). Renders the
  `confirm=false` response: Prozpr recommendation vs preferred, per-class deviation, and the
  `shortfall` string prominently when present.

### 4.5 Save / Reset footer
- **Save** → `saveInvestmentPreferences(intent, { confirm: true })` → `PUT`; on success, toast +
  refresh (invalidate the preference + plan queries).
- **Reset to Prozpr's recommendation** → `PUT` empty intent + `confirm=true` (the clear path).

## 5. The preference pill (chat)

**General rule (Amoul, 2026-09-06): any pill in chat is INLINE, per assistant message — never a
floating bottom-right FAB.** Mirror the existing rebalancing plan pill exactly.

- **Rebalancing what-if turn** — the assistant message that presented a preference what-if carries
  a candidate preference id (backend surfaces the candidate rebalancing run as
  `ideal_allocation_rebalancing_id`; the "Save plan" pill already activates the candidate preference
  behind it via `POST /rebalancing/{id}/save`). So the EXISTING "Save plan" pill already saves the
  preference too — confirm the copy tells the customer both are kept, and add a "View preferences"
  link that deep-links to `/invest/preferences`.
- **AINV (SIP / lump sum) what-if turn** — new "Save preference" pill on the AINV assistant message,
  identical in behaviour to the rebalancing pill, calling `saveAdditionalInvestmentPreference(runId)` →
  `POST /additional-investment/{id}/save-preference`. **DECIDED (Amoul, 2026-09-06): the backend provides
  the AINV run id on the send response the same way it provides `ideal_allocation_rebalancing_id`
  (backend S2d Task 1), so the AINV pill mirrors rebalancing exactly — no AINV-specific fallback path.**
  Generalise `deriveRebalancingPills` (or add an AINV sibling) to read `additional_investment_run_id`
  off the send response / message the same way it reads the rebalancing id today.
- Saved state + "Saved" copy follow `deriveRebalancingPills`' rule: only mark saved when the committed
  active row attributes to THIS message, so a newer unsaved what-if never inherits an older "Saved".

## 6. Active-preference indicator

- **On `/invest/preferences`:** the lit chips ARE the active-preference display (from `customer_choices`);
  add a small "Your active preference" header state + `saved_at`.
- **On the Invest tabs:** mirror the rebalancing "Saved plan" badge — show a compact "Preference active"
  chip in the Invest header when a standing preference exists, linking to `/invest/preferences`. Absent
  when the customer is on Prozpr's recommendation.
- The rebalancing active-PLAN indicator already exists (§2); AINV gets the same "Saved plan"-style badge
  on `SipPlanner`/`LumpSumPlanner` if not already present (verify during build).

## 7. API client additions (`src/lib/api.ts`)

- `getInvestmentPreferences(): Promise<InvestmentPreferenceResponse>` → `GET /profile/investment-preferences`.
- `saveInvestmentPreferences(intent, opts): Promise<InvestmentPreferencePreviewResponse>` →
  `PUT /profile/investment-preferences` with `{ ...intent, confirm }`.
- `saveAdditionalInvestmentPreference(runId): Promise<{ activated: boolean }>` →
  `POST /additional-investment/{runId}/save-preference`.
- Types mirroring the backend schemas: `InvestmentPreferenceIntent { asset_class?, subgroups?, confirm }`,
  `InvestmentPreferenceResponse { asset_class_requested, asset_class_target, resolved_targets,
  customer_choices, saved_at, recommendation }`, and the preview response
  (`recommendation / preferred / deviation / shortfall`).

## 8. Reuse vs build

| Reuse (exists) | Build (new) |
|---|---|
| plan pill machinery (`deriveRebalancingPills`, AIChatPanel render, RebalancePlanModal) | `PreferenceSpectrum` chip control |
| `saveRebalancingRun`, `getCurrentRebalancingRun`, `getSipPlan/getLumpSumPlan` | `/invest/preferences` page + route |
| Invest layout / tabs / gold-pill animation pattern | preference API client + types (§7) |
| "Saved plan" badge pattern (RebalanceExplanation) | AINV "Save preference" pill + `saveAdditionalInvestmentPreference` |
| shadcn dialog/button/badge/sonner | active-preference indicator (page + Invest header) |

## 9. Decisions — RESOLVED (Amoul, 2026-09-06)

1. **Entry affordance** — a **fourth `InvestTabs` tab labelled "Preferences"** (§4.1). Customers set
   preferences through the UI here, standing, independent of chat.
2. **Pill placement** — **inline, per assistant message**, as the rebalancing pill is today. This is the
   general rule for any chat pill; no floating bottom-right FAB (§5).
3. **AINV pill vs S2d** — the **backend supplies the AINV run id on the send response** (S2d Task 1),
   so the AINV pill mirrors rebalancing exactly; no AINV-specific interim fallback (§5). S2d Task 1 is
   therefore a prerequisite for the AINV pill, and its scope now explicitly mirrors
   `ideal_allocation_rebalancing_id` (backend plan updated 2026-09-06).

## 10. Testing (repo uses vitest + Testing Library)

- Unit: `PreferenceSpectrum` chip→token mapping; screen assembles the correct `{asset_class, subgroups}`
  intent; render of selected chips from a stored `customer_choices` (per backend S3 §4).
- Pill: extend the `rebalancing-pills` derivation tests for the preference/AINV pill; a saved attribution
  never leaks to a newer what-if.
- API: request-shape tests for the three new client functions.
- No new backend tests (backend S1–S2c cover the engine/save/endpoints).

## 11. Out of scope

- Backend changes (tracked separately: S2d, incl. Task 1 AINV run id).
- The onboarding `/profile/investment-preferences` review step — unrelated, left as-is.
- Sliders or any numeric entry (product ruling).
