# Invest Preferences Frontend (S3b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the standing investment-preferences screen (Invest section, 4th tab), the 5-chip spectrum control, the chat preference pills (AINV "Save preference" + rebalancing "View preferences" deep-link), and the active-preference indicator — all reusing the existing plan-pill / Invest-tab machinery.

**Architecture:** A new `/invest/preferences` page renders two chip cards (overall mix + fund categories) built on a new `PreferenceSpectrum` control (the `InvestTabs` gold-pill pattern). A pure mapping module (`src/lib/investment-preferences.ts`) converts between the 5-chip UI and the S1 wire format; the page reads/writes it through three new `api.ts` functions. Chat gets an AINV "Save preference" pill (mirroring the rebalancing "Save plan" pill, gated on the backend-sent `additional_investment_run_id`) and a "View preferences" deep-link on rebalancing plan turns. Data loading is manual `useEffect` + `api.ts` (the repo has zero `useQuery` call sites — do NOT introduce one).

**Tech Stack:** Vite + React 18 + TypeScript, shadcn/ui, Tailwind, framer-motion, sonner, react-router v6. Tests: vitest + Testing Library (`bun run test`).

## Global Constraints

- **Do NOT commit or push.** Leave all changes in the working tree; the human commits. (This overrides the writing-plans skill's per-task `git commit` steps — replace every "Commit" step with "leave staged/unstaged in the tree".)
- **Product name is exactly `Prozpr`** (never "Prozper").
- **No new UI libraries.** Reuse shadcn/ui in `src/components/ui/`, framer-motion, sonner, and the existing gold tokens (`#D4A868`, `#E5C079`, `hsl(var(--card))`, `text-muted-foreground`, `text-primary`, `bg-primary/10`).
- **No sliders. No percentages shown to the customer** (product ruling). Chips only.
- **Route is `/invest/preferences`.** Do NOT reuse `/profile/investment-preferences` (taken by an unrelated onboarding step).
- **Wire format mirrors the backend S1 contract verbatim** — `Prozpr_Backend/app/domains/profile/schemas/investment_preferences.py`. Classes are `equity | debt | others`; subgroup tokens are `more | heavy | less | none` (neutral = facet absent).
- **Package manager is bun.** Verify with `bun run test`, `bun run lint`, `bun run build`. (Note: `bun test` runs bun's own runner, NOT vitest — always use `bun run test`.)
- **Tests are colocated** `*.test.ts(x)` next to the file, vitest + Testing Library, mock the API with `vi.mock("@/lib/api", () => ({ ... }))`. jsdom + `src/test/setup.ts` are already configured.
- **CRLF caution:** edit existing files with the Edit/Write tools, not text-mode scripts (some `app/`-style files use CRLF; the tools preserve line endings).

---

## File structure

**Create**
- `src/lib/investment-preferences.ts` — pure UI↔wire mapping (types, labels, subgroup tables, `buildIntent`, `stateFromChoices`, chip getters/setters). No I/O.
- `src/lib/investment-preferences.test.ts`
- `src/lib/api.investment-preferences.test.ts` — request-shape tests for the 3 new client fns.
- `src/components/invest/PreferenceSpectrum.tsx` — the 5-chip gold-pill control.
- `src/components/invest/PreferenceSpectrum.test.tsx`
- `src/components/invest/PreferencePreviewDrawer.tsx` — shadcn-dialog preview (confirm=false → confirm=true).
- `src/components/invest/PreferencePreviewDrawer.test.tsx`
- `src/pages/InvestPreferences.tsx` — the page (two cards + footer + active header).
- `src/pages/InvestPreferences.test.tsx`

**Modify**
- `src/lib/api.ts` — add preference types + `getInvestmentPreferences` / `saveInvestmentPreferences` / `saveAdditionalInvestmentPreference`; add `additional_investment_run_id?` to `ChatSendResponse`.
- `src/components/invest/InvestTabs.tsx` — add 4th "Preferences" tab + activeKey branch.
- `src/components/invest/InvestLayout.tsx` — add the "Preference active" header chip.
- `src/App.tsx` — import `InvestPreferences`; add `<Route path="preferences" …>` under `/invest`.
- `src/components/chat/AIChatPanel.tsx` — AINV "Save preference" pill + rebalancing "View preferences" deep-link.

**Do NOT touch**
- `src/lib/rebalancing-pills.ts` (the AINV pill is live-response-only — no history rehydrate, no fallback, per spec §5/§9.3).

---

## Backend contract (already merged on `feat-central_investment_preference`) — reference

Verified in the backend repo; the frontend types mirror these exactly.

- **GET `/profile/investment-preferences`** → `InvestmentPreferenceResponse`:
  `asset_class_requested?: {class:pct} | null`, `asset_class_target?`, `resolved_targets?`,
  `customer_choices?: object | null` (**render selected chips from this**), `saved_at?: datetime | null`, `recommendation?: {class:pct} | null`.
- **PUT `/profile/investment-preferences`** body `InvestmentPreferenceIntent` `{ asset_class?, subgroups?, confirm }`:
  - `asset_class` = `{ class: "equity"|"debt"|"others", direction?: "more"|"heavy"|"less"|"none"|"target", target_pct?: number }`.
  - `subgroups` = `{ <engine_subgroup>: "more"|"heavy"|"less"|"none" | number }`.
  - `confirm=false` → preview; `confirm=true` → save. → `InvestmentPreferencePreviewResponse`
    `{ recommendation?, preferred?, deviation?, shortfall?, no_op }`.
- **POST `/additional-investment/{run_id}/save-preference`** → `{ activated: boolean }`. Returns `false` gracefully when the run had no candidate preference (an ordinary deploy) — no error.
- **Chat send response** already carries `additional_investment_run_id?: uuid | null` on ALL AINV compute turns (ordinary deploy AND preference what-if); it is absent on clarify/gate turns. The backend does NOT yet persist it per-message in chat history, so the AINV pill is **live-response-only**.

Canonical engine subgroup keys (from `preference_lexicon.py` — get these right or the save is a silent no-op): `low_beta_equities, medium_beta_equities, high_beta_equities, value_equities, sector_equities, us_equities, multi_asset, short_debt, arbitrage, gold_commodities`. **Arbitrage's key is `arbitrage`, not `arbitrage_plus_income`.**

**Gold encoding (subtle — read twice).** The SCREEN drives gold through the **others class** (`asset_class: {class:"others", direction}`), per backend S3 §3.1 / D-B (gold is the sole settable "others" subgroup). The "Gold & others" Card-A class chip and the "Gold & commodities" Card-B row are the *same control seen twice* — both bound to `assetClass` with class `others`. Chat, by contrast, stores gold under `subgroups.gold_commodities`; when RENDERING stored choices, honour that as a fallback so a chat-set gold still lights the row (handled in `stateFromChoices`).

---

### Task 1: Preference API client (types + functions)

**Files:**
- Modify: `src/lib/api.ts` (add a new section near the rebalancing run functions ~2755; add one field to `ChatSendResponse` ~962)
- Test: `src/lib/api.investment-preferences.test.ts`

**Interfaces:**
- Produces (consumed by every later task):
  - `InvestmentPreferenceIntent`, `InvestmentPreferenceResponse`, `InvestmentPreferencePreviewResponse`, `PreferenceActivationResponse`
  - `getInvestmentPreferences(): Promise<InvestmentPreferenceResponse>`
  - `saveInvestmentPreferences(intent: InvestmentPreferenceIntent, opts: { confirm: boolean }): Promise<InvestmentPreferencePreviewResponse>`
  - `saveAdditionalInvestmentPreference(runId: string): Promise<PreferenceActivationResponse>`
  - `ChatSendResponse.additional_investment_run_id?: string | null`

- [ ] **Step 1: Write the failing test** — `src/lib/api.investment-preferences.test.ts`

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getInvestmentPreferences,
  saveInvestmentPreferences,
  saveAdditionalInvestmentPreference,
} from "@/lib/api";

const okJson = (body: unknown) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);

describe("investment-preferences API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    localStorage.setItem("askProzpr_token", "t");
  });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("GET hits /profile/investment-preferences", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(okJson({ saved_at: null }));
    await getInvestmentPreferences();
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/profile\/investment-preferences$/);
    expect((init?.method ?? "GET")).toBe("GET");
  });

  it("PUT sends intent + confirm flag in one body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(okJson({ no_op: false }));
    await saveInvestmentPreferences(
      { asset_class: { class: "equity", direction: "more" }, subgroups: { us_equities: "none" } },
      { confirm: true },
    );
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/profile\/investment-preferences$/);
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init!.body as string)).toEqual({
      asset_class: { class: "equity", direction: "more" },
      subgroups: { us_equities: "none" },
      confirm: true,
    });
  });

  it("POST save-preference hits the run's endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(okJson({ activated: true }));
    const res = await saveAdditionalInvestmentPreference("run-42");
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/additional-investment\/run-42\/save-preference$/);
    expect(init?.method).toBe("POST");
    expect(res).toEqual({ activated: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/api.investment-preferences.test.ts`
Expected: FAIL — the three functions are not exported yet.

- [ ] **Step 3: Add the field to `ChatSendResponse`**

In `src/lib/api.ts`, inside `export interface ChatSendResponse` (right after `ideal_allocation_snapshot_id?` ~line 950), add:

```ts
  /** Present when a chat additional-investment run was persisted — enables the
   *  "Save preference" pill → POST /additional-investment/{id}/save-preference.
   *  Sent on every AINV compute turn (ordinary deploy AND preference what-if). */
  additional_investment_run_id?: string | null;
```

- [ ] **Step 4: Add the types + functions**

Append a new section to `src/lib/api.ts` (place it just after `getCurrentRebalancingRun` ~line 2762, so it sits with the other "saved run" helpers):

```ts
// ── Investment preferences (standing) ─────────────────────
// Wire format mirrors the backend S1 contract
// (app/domains/profile/schemas/investment_preferences.py).

export type PreferenceAssetClass = "equity" | "debt" | "others";
export type PreferenceDirection = "more" | "heavy" | "less" | "none" | "target";
export type PreferenceSubgroupToken = "more" | "heavy" | "less" | "none";

export interface InvestmentPreferenceIntent {
  asset_class?: {
    class: PreferenceAssetClass;
    direction?: PreferenceDirection;
    target_pct?: number;
  } | null;
  /** Engine subgroup key → token (a bare number = explicit class-share target; chat only). */
  subgroups?: Record<string, PreferenceSubgroupToken | number> | null;
  confirm?: boolean;
}

export interface InvestmentPreferenceResponse {
  asset_class_requested?: Record<string, number> | null;
  asset_class_target?: Record<string, number> | null;
  resolved_targets?: Record<string, number> | null;
  /** The verbatim intent the customer tapped/spoke — the screen renders selected chips from THIS. */
  customer_choices?: Record<string, unknown> | null;
  saved_at?: string | null;
  recommendation?: Record<string, number> | null;
}

export interface InvestmentPreferencePreviewResponse {
  recommendation?: Record<string, number> | null;
  preferred?: Record<string, number> | null;
  deviation?: Record<string, number> | null;
  shortfall?: string | null;
  no_op?: boolean;
}

export interface PreferenceActivationResponse {
  activated: boolean;
}

/** The active standing preference + the neutral recommendation block. */
export async function getInvestmentPreferences(): Promise<InvestmentPreferenceResponse> {
  return request<InvestmentPreferenceResponse>("/profile/investment-preferences");
}

/** Preview (confirm=false, side-effect-free) or save (confirm=true) a standing
 *  preference. The body is the intent plus the confirm flag, as the backend PUT expects. */
export async function saveInvestmentPreferences(
  intent: InvestmentPreferenceIntent,
  opts: { confirm: boolean },
): Promise<InvestmentPreferencePreviewResponse> {
  return request<InvestmentPreferencePreviewResponse>("/profile/investment-preferences", {
    method: "PUT",
    body: JSON.stringify({ ...intent, confirm: opts.confirm }),
  });
}

/** Activate the candidate investment preference a chat AINV what-if run was
 *  computed under (mirrors saveRebalancingRun). Returns { activated:false }
 *  gracefully when the run had no candidate (an ordinary deploy). */
export async function saveAdditionalInvestmentPreference(
  runId: string,
): Promise<PreferenceActivationResponse> {
  return request<PreferenceActivationResponse>(
    `/additional-investment/${runId}/save-preference`,
    { method: "POST" },
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/lib/api.investment-preferences.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Leave changes in the working tree** (do not commit).

---

### Task 2: Pure UI↔wire mapping module

**Files:**
- Create: `src/lib/investment-preferences.ts`
- Test: `src/lib/investment-preferences.test.ts`

**Interfaces:**
- Consumes: `InvestmentPreferenceIntent` (from `@/lib/api`).
- Produces: `PreferenceToken`, `PreferenceChip`, `PreferenceClass`, `SPECTRUM_ORDER`, `CHIP_LABELS`, `CLASS_ROWS`, `SUBGROUP_ROWS`, `GOLD_SUBGROUP_KEY`, `GOLD_ROW_LABEL`, `FROZEN_ROWS`, `PreferenceScreenState`, `emptyPreferenceState`, `buildIntent`, `stateFromChoices`, `classChip`, `setClassChip`, `subgroupChip`, `setSubgroupChip`, `goldChip`, `setGoldChip`, `hasAnyLean`, `sameState`.

- [ ] **Step 1: Write the failing test** — `src/lib/investment-preferences.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  buildIntent, stateFromChoices, emptyPreferenceState,
  setClassChip, setSubgroupChip, setGoldChip, classChip, goldChip,
  subgroupChip, chipToToken, tokenToChip, hasAnyLean, sameState,
} from "@/lib/investment-preferences";

describe("chip ↔ token", () => {
  it("neutral is the absent facet", () => {
    expect(chipToToken("neutral")).toBeUndefined();
    expect(chipToToken("heavy")).toBe("heavy");
    expect(tokenToChip(undefined)).toBe("neutral");
    expect(tokenToChip("none")).toBe("none");
  });
});

describe("buildIntent", () => {
  it("equity More → single asset_class facet", () => {
    const s = setClassChip(emptyPreferenceState(), "equity", "more");
    expect(buildIntent(s)).toEqual({ asset_class: { class: "equity", direction: "more" } });
  });
  it("small-cap Heavy + exclude US → subgroups map", () => {
    let s = setSubgroupChip(emptyPreferenceState(), "high_beta_equities", "heavy");
    s = setSubgroupChip(s, "us_equities", "none");
    expect(buildIntent(s)).toEqual({
      subgroups: { high_beta_equities: "heavy", us_equities: "none" },
    });
  });
  it("gold More routes to the others class, never subgroups", () => {
    const s = setGoldChip(emptyPreferenceState(), "more");
    expect(buildIntent(s)).toEqual({ asset_class: { class: "others", direction: "more" } });
  });
  it("all-neutral → empty intent (Prozpr's recommendation)", () => {
    expect(buildIntent(emptyPreferenceState())).toEqual({});
  });
});

describe("one class non-neutral at a time", () => {
  it("setting debt clears a prior equity lean", () => {
    let s = setClassChip(emptyPreferenceState(), "equity", "more");
    s = setClassChip(s, "debt", "heavy");
    expect(classChip(s, "equity")).toBe("neutral");
    expect(classChip(s, "debt")).toBe("heavy");
  });
  it("gold and the others-class chip are the same control", () => {
    const s = setGoldChip(emptyPreferenceState(), "heavy");
    expect(goldChip(s)).toBe("heavy");
    expect(classChip(s, "others")).toBe("heavy");
  });
});

describe("stateFromChoices", () => {
  it("round-trips a screen-shaped choice", () => {
    const s = stateFromChoices({
      asset_class: { class: "equity", direction: "more" },
      subgroups: { high_beta_equities: "heavy", us_equities: "none" },
    });
    expect(classChip(s, "equity")).toBe("more");
    expect(subgroupChip(s, "high_beta_equities")).toBe("heavy");
    expect(subgroupChip(s, "us_equities")).toBe("none");
  });
  it("renders a chat-origin gold (subgroups.gold_commodities) on the gold row", () => {
    const s = stateFromChoices({ subgroups: { gold_commodities: "more" } });
    expect(goldChip(s)).toBe("more");
  });
  it("prefers the others class over a gold subgroup fallback", () => {
    const s = stateFromChoices({
      asset_class: { class: "others", direction: "heavy" },
      subgroups: { gold_commodities: "less" },
    });
    expect(goldChip(s)).toBe("heavy");
  });
  it("ignores a chat-only 'target' direction (screen shows no %)", () => {
    const s = stateFromChoices({ asset_class: { class: "equity", direction: "target", target_pct: 70 } });
    expect(hasAnyLean(s)).toBe(false);
  });
  it("empty / null → empty state", () => {
    expect(hasAnyLean(stateFromChoices(null))).toBe(false);
    expect(hasAnyLean(stateFromChoices({}))).toBe(false);
  });
});

describe("sameState (idempotent-save guard)", () => {
  it("equal lean sets compare equal regardless of key order", () => {
    let a = setSubgroupChip(emptyPreferenceState(), "us_equities", "none");
    a = setSubgroupChip(a, "high_beta_equities", "heavy");
    let b = setSubgroupChip(emptyPreferenceState(), "high_beta_equities", "heavy");
    b = setSubgroupChip(b, "us_equities", "none");
    expect(sameState(a, b)).toBe(true);
  });
  it("a changed direction is not equal", () => {
    const a = setClassChip(emptyPreferenceState(), "equity", "more");
    const b = setClassChip(emptyPreferenceState(), "equity", "heavy");
    expect(sameState(a, b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/investment-preferences.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** — `src/lib/investment-preferences.ts`

```ts
/** Pure mapping between the 5-chip spectrum UI and the S1 investment-preference
 *  wire format (backend app/domains/profile/schemas/investment_preferences.py).
 *  No I/O, no React. */
import type { InvestmentPreferenceIntent } from "@/lib/api";

export type PreferenceToken = "more" | "heavy" | "less" | "none";
export type PreferenceChip = PreferenceToken | "neutral";
export type PreferenceClass = "equity" | "debt" | "others";

/** Left → right intensity order shown in the control. */
export const SPECTRUM_ORDER: readonly PreferenceChip[] = [
  "none", "less", "neutral", "more", "heavy",
] as const;

export const CHIP_LABELS: Record<PreferenceChip, string> = {
  none: "Not preferred",
  less: "Less",
  neutral: "Neutral",
  more: "More",
  heavy: "Heavy",
};

export function chipToToken(chip: PreferenceChip): PreferenceToken | undefined {
  return chip === "neutral" ? undefined : chip;
}
export function tokenToChip(token: PreferenceToken | undefined | null): PreferenceChip {
  return token == null ? "neutral" : token;
}

/** Card A classes shown as rows. "Gold & others" IS the "others" class. */
export const CLASS_ROWS: { key: PreferenceClass; label: string }[] = [
  { key: "equity", label: "Equity" },
  { key: "debt", label: "Debt" },
  { key: "others", label: "Gold & others" },
];

/** Settable Card B subgroups — engine key → screen label (backend S3 §3.2).
 *  Gold is NOT here: it is driven through the "others" class (S1 ruling 14 / D-B)
 *  and shown as its own synced row (GOLD_SUBGROUP_KEY) instead. */
export const SUBGROUP_ROWS: { key: string; label: string }[] = [
  { key: "low_beta_equities", label: "Large-cap funds" },
  { key: "medium_beta_equities", label: "Mid-cap funds" },
  { key: "high_beta_equities", label: "Small-cap funds" },
  { key: "value_equities", label: "Value funds" },
  { key: "sector_equities", label: "Sector / thematic" },
  { key: "us_equities", label: "US & international" },
  { key: "multi_asset", label: "Multi-asset funds" },
  { key: "short_debt", label: "Short-term debt" },
  { key: "arbitrage", label: "Arbitrage (+ income)" },
];

/** The gold row in Card B — the same control as the "others" class chip. */
export const GOLD_SUBGROUP_KEY = "gold_commodities";
export const GOLD_ROW_LABEL = "Gold & commodities";

/** Display-only frozen rows (never settable) — backend S3 §3.2. */
export const FROZEN_ROWS: { label: string; reason: string }[] = [
  { label: "ELSS (tax-saver)", reason: "Locked in by your tax plan" },
  { label: "Direct stocks", reason: "Managed outside your funds" },
];

export interface PreferenceScreenState {
  /** Card A: at most one class non-neutral (structural in the wire format). */
  assetClass: { class: PreferenceClass; direction: PreferenceToken } | null;
  /** Card B subgroups (excludes gold — gold lives in assetClass "others"). */
  subgroups: Partial<Record<string, PreferenceToken>>;
}

export function emptyPreferenceState(): PreferenceScreenState {
  return { assetClass: null, subgroups: {} };
}

const TOKENS: readonly PreferenceToken[] = ["more", "heavy", "less", "none"];
const isToken = (v: unknown): v is PreferenceToken =>
  typeof v === "string" && (TOKENS as readonly string[]).includes(v);
const isClass = (v: unknown): v is PreferenceClass =>
  v === "equity" || v === "debt" || v === "others";

/** Build the S1 PUT intent from screen state (the caller adds `confirm`). */
export function buildIntent(state: PreferenceScreenState): InvestmentPreferenceIntent {
  const intent: InvestmentPreferenceIntent = {};
  if (state.assetClass) {
    intent.asset_class = { class: state.assetClass.class, direction: state.assetClass.direction };
  }
  const subgroups: Record<string, PreferenceToken> = {};
  for (const [k, v] of Object.entries(state.subgroups)) if (v) subgroups[k] = v;
  if (Object.keys(subgroups).length > 0) intent.subgroups = subgroups;
  return intent;
}

/** Reconstruct screen state from the stored verbatim intent (customer_choices).
 *  Gold: prefer asset_class "others"; else fall back to a chat-stored
 *  subgroups.gold_commodities so a chat-set gold still lights the row. */
export function stateFromChoices(
  choices: Record<string, unknown> | null | undefined,
): PreferenceScreenState {
  const state = emptyPreferenceState();
  if (!choices || typeof choices !== "object") return state;

  const ac = (choices as { asset_class?: { class?: unknown; direction?: unknown } }).asset_class;
  if (ac && isClass(ac.class) && isToken(ac.direction)) {
    state.assetClass = { class: ac.class, direction: ac.direction };
  }

  const sgs = (choices as { subgroups?: Record<string, unknown> }).subgroups;
  if (sgs && typeof sgs === "object") {
    for (const row of SUBGROUP_ROWS) {
      const v = sgs[row.key];
      if (isToken(v)) state.subgroups[row.key] = v;
    }
    // A chat-origin gold pref lands in subgroups.gold_commodities. Only honour it
    // when no explicit class lean already occupies the single asset_class slot.
    const gold = sgs[GOLD_SUBGROUP_KEY];
    if (!state.assetClass && isToken(gold)) {
      state.assetClass = { class: "others", direction: gold };
    }
  }
  return state;
}

export function classChip(state: PreferenceScreenState, cls: PreferenceClass): PreferenceChip {
  return state.assetClass?.class === cls ? tokenToChip(state.assetClass.direction) : "neutral";
}
/** Apply a chip to a Card A class row — one class non-neutral at a time. */
export function setClassChip(
  state: PreferenceScreenState, cls: PreferenceClass, chip: PreferenceChip,
): PreferenceScreenState {
  const token = chipToToken(chip);
  return { ...state, assetClass: token ? { class: cls, direction: token } : null };
}
export function subgroupChip(state: PreferenceScreenState, key: string): PreferenceChip {
  return tokenToChip(state.subgroups[key] ?? null);
}
export function setSubgroupChip(
  state: PreferenceScreenState, key: string, chip: PreferenceChip,
): PreferenceScreenState {
  const token = chipToToken(chip);
  const subgroups = { ...state.subgroups };
  if (token) subgroups[key] = token; else delete subgroups[key];
  return { ...state, subgroups };
}
/** The gold row and the Card A "others" class chip are the same control. */
export function goldChip(state: PreferenceScreenState): PreferenceChip {
  return classChip(state, "others");
}
export function setGoldChip(state: PreferenceScreenState, chip: PreferenceChip): PreferenceScreenState {
  return setClassChip(state, "others", chip);
}

/** Any non-neutral lean present? (drives Save enablement). */
export function hasAnyLean(state: PreferenceScreenState): boolean {
  return state.assetClass !== null || Object.keys(state.subgroups).length > 0;
}

/** Same lean set? (drives dirty / idempotent-save detection). */
export function sameState(a: PreferenceScreenState, b: PreferenceScreenState): boolean {
  const acA = a.assetClass, acB = b.assetClass;
  const acEq = (!acA && !acB) ||
    (!!acA && !!acB && acA.class === acB.class && acA.direction === acB.direction);
  if (!acEq) return false;
  const ka = Object.keys(a.subgroups).sort();
  const kb = Object.keys(b.subgroups).sort();
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
  return ka.every((k) => a.subgroups[k] === b.subgroups[k]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/investment-preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Leave changes in the working tree** (do not commit).

---

### Task 3: `PreferenceSpectrum` control

**Files:**
- Create: `src/components/invest/PreferenceSpectrum.tsx`
- Test: `src/components/invest/PreferenceSpectrum.test.tsx`

**Interfaces:**
- Consumes: `PreferenceChip`, `SPECTRUM_ORDER`, `CHIP_LABELS` from `@/lib/investment-preferences`.
- Produces: default export `PreferenceSpectrum` with props
  `{ value: PreferenceChip; onChange: (next: PreferenceChip) => void; layoutId: string; disabled?: boolean; ariaLabel?: string }`.
  (`layoutId` MUST be unique per instance so the gold pill animates within that one control, never across rows.)

- [ ] **Step 1: Write the failing test** — `src/components/invest/PreferenceSpectrum.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import PreferenceSpectrum from "./PreferenceSpectrum";

afterEach(cleanup);

describe("PreferenceSpectrum", () => {
  it("renders all five labels and marks the selected chip pressed", () => {
    render(<PreferenceSpectrum value="more" onChange={() => {}} layoutId="t1" ariaLabel="Equity" />);
    for (const label of ["Not preferred", "Less", "Neutral", "More", "Heavy"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Neutral" })).toHaveAttribute("aria-pressed", "false");
  });

  it("emits the chip token on click", () => {
    const onChange = vi.fn();
    render(<PreferenceSpectrum value="neutral" onChange={onChange} layoutId="t2" ariaLabel="Debt" />);
    fireEvent.click(screen.getByRole("button", { name: "Heavy" }));
    expect(onChange).toHaveBeenCalledWith("heavy");
  });

  it("does not emit when disabled", () => {
    const onChange = vi.fn();
    render(<PreferenceSpectrum value="neutral" onChange={onChange} layoutId="t3" disabled ariaLabel="Gold" />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/invest/PreferenceSpectrum.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation** — `src/components/invest/PreferenceSpectrum.tsx`

Follow the `InvestTabs` gold-pill pattern exactly (motion.span with a shared `layoutId`, the same spring, `#D4A868` fill, dark ink on the active chip). Five chips from `SPECTRUM_ORDER`.

```tsx
import { motion } from "framer-motion";
import {
  SPECTRUM_ORDER, CHIP_LABELS, type PreferenceChip,
} from "@/lib/investment-preferences";

export interface PreferenceSpectrumProps {
  value: PreferenceChip;
  onChange: (next: PreferenceChip) => void;
  /** Unique per instance so the gold pill animates WITHIN this control only. */
  layoutId: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Five ordered chips — Not preferred · Less · Neutral · More · Heavy — one
 * selectable at a time. Built like the InvestTabs gold pill (shared-layout
 * motion.span) so the selection slides between chips. No sliders, no numbers.
 */
export default function PreferenceSpectrum({
  value, onChange, layoutId, disabled = false, ariaLabel,
}: PreferenceSpectrumProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative flex rounded-full border border-[#D4A868]/25 bg-card p-0.5 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {SPECTRUM_ORDER.map((chip) => {
        const active = chip === value;
        return (
          <button
            key={chip}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(chip)}
            className="relative z-10 flex-1 rounded-full py-1.5 text-[11px] font-semibold disabled:cursor-default"
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-full shadow-sm"
                style={{ backgroundColor: "#D4A868" }}
                transition={{ type: "spring", stiffness: 280, damping: 14, mass: 1.1 }}
              />
            )}
            <span
              className={`relative transition-colors duration-200 ${active ? "" : "text-muted-foreground"}`}
              style={active ? { color: "#1a1206" } : undefined}
            >
              {CHIP_LABELS[chip]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/components/invest/PreferenceSpectrum.test.tsx`
Expected: PASS.

- [ ] **Step 5: Leave changes in the working tree** (do not commit).

---

### Task 4: `InvestPreferences` page — cards, render-from-choices, Reset, active header

Builds the page shell, both cards, load/render, the Reset footer button, and the active-preference header. The **Save** button is present but opens the preview drawer built in Task 5 (leave an `onSaveClick` that toggles a `previewOpen` state that Task 5 wires to the drawer — in this task, Save may simply set `previewOpen` with a placeholder `null` render, so the page compiles and Reset/render are independently reviewable).

**Files:**
- Create: `src/pages/InvestPreferences.tsx`
- Test: `src/pages/InvestPreferences.test.tsx`

**Interfaces:**
- Consumes: `getInvestmentPreferences`, `saveInvestmentPreferences` (`@/lib/api`); everything from `@/lib/investment-preferences`; `PreferenceSpectrum` (Task 3).
- Produces: default export `InvestPreferences` (a routed page).

**Reuse anchors:**
- Page shell: mirror `SipPlanner.tsx` — outer `<div className="mobile-container bg-background min-h-screen pb-24">` … `<BottomNav />`; `import BottomNav from "@/components/BottomNav"`.
- Data loading: manual `useEffect` + `.then/.catch` with a `cancelled` guard (mirror `RebalancePlanModal`'s effect; the repo has NO `useQuery` call sites — do not add one).
- "Saved plan" badge visual for the active header: `RebalanceExplanation.tsx:782` (`rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary` + `Bookmark`).
- Gold Save button style: the `GOLD_STYLE` / gradient from `RebalancePlanModal.tsx:22`.

- [ ] **Step 1: Write the failing test** — `src/pages/InvestPreferences.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  getInvestmentPreferences: vi.fn(),
  saveInvestmentPreferences: vi.fn(),
}));
vi.mock("@/components/BottomNav", () => ({ default: () => null }));
import { getInvestmentPreferences, saveInvestmentPreferences } from "@/lib/api";
import InvestPreferences from "./InvestPreferences";

const renderPage = () =>
  render(<MemoryRouter><InvestPreferences /></MemoryRouter>);

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {
  (saveInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({ no_op: false });
});

describe("InvestPreferences", () => {
  it("lights the stored chips from customer_choices and shows the active header", async () => {
    (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      saved_at: "2026-09-06T10:00:00Z",
      customer_choices: { asset_class: { class: "equity", direction: "more" } },
      recommendation: { equity: 60, debt: 30, others: 10 },
    });
    renderPage();
    // Equity's "More" chip is pressed once loaded.
    await waitFor(() => {
      const equityGroup = screen.getByRole("group", { name: "Equity" });
      const more = within(equityGroup).getByRole("button", { name: "More" });
      expect(more).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByText(/active preference/i)).toBeInTheDocument();
  });

  it("shows no active header when on Prozpr's recommendation", async () => {
    (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      saved_at: null, customer_choices: null,
    });
    renderPage();
    await waitFor(() => expect(getInvestmentPreferences).toHaveBeenCalled());
    expect(screen.queryByText(/active preference/i)).not.toBeInTheDocument();
  });

  it("Reset sends an empty confirmed intent", async () => {
    (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      saved_at: "2026-09-06T10:00:00Z",
      customer_choices: { asset_class: { class: "equity", direction: "more" } },
    });
    renderPage();
    const reset = await screen.findByRole("button", { name: /reset to prozpr/i });
    fireEvent.click(reset);
    // If Reset is behind a confirm affordance, click the confirming control here.
    await waitFor(() =>
      expect(saveInvestmentPreferences).toHaveBeenCalledWith({}, { confirm: true }),
    );
  });
});

// NOTE: add `import { within } from "@testing-library/react";` at the top.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/pages/InvestPreferences.test.tsx`
Expected: FAIL — page not found.

- [ ] **Step 3: Write the page** — `src/pages/InvestPreferences.tsx`

Implement:
- Load via `useEffect` → `getInvestmentPreferences()`; keep `loading`, `error`, `recommendation`, `savedAt`, and two state values: `state` (working) and `initial` (the loaded baseline, for dirty/Reset). Initialise both from `stateFromChoices(resp.customer_choices)`.
- **Card A "Overall mix"**: for each `CLASS_ROWS` entry render a labelled row + `PreferenceSpectrum` with `value={classChip(state, key)}`, `onChange={(c) => setState((s) => setClassChip(s, key, c))}`, `layoutId={`pref-class-${key}`}`, `ariaLabel={label}`. A one-line helper text: "One lean at a time — choosing a class relaxes the others." (setClassChip already enforces it.)
- **Card B "Fund categories"**: for each `SUBGROUP_ROWS` entry render a row + `PreferenceSpectrum` (`value={subgroupChip(state, key)}`, `onChange` → `setSubgroupChip`, `layoutId={`pref-sg-${key}`}`, `ariaLabel={label}`). Then the **gold row** (label `GOLD_ROW_LABEL`) bound to `goldChip(state)` / `setGoldChip` (`layoutId="pref-sg-gold"`, `ariaLabel={GOLD_ROW_LABEL}`) — this is the same control as Card A's "Gold & others". Then `FROZEN_ROWS` as disabled display rows (greyed label + a `Lock` icon + the reason; do not render a spectrum, or render `PreferenceSpectrum` with `disabled` and `value="neutral"`).
- **Active header**: when `savedAt` is truthy, show a "Your active preference" badge (Bookmark, primary tint) + the formatted `savedAt` (e.g. `new Date(savedAt).toLocaleDateString("en-IN")`).
- **Footer**:
  - **Save** (gold gradient) — `disabled={!dirty}` where `dirty = !sameState(state, initial)`. `onClick` opens the preview drawer (Task 5). In THIS task, `onClick` sets `previewOpen=true`; render a `null` placeholder where the drawer will mount (a `{/* Task 5: <PreferencePreviewDrawer/> */}` comment).
  - **Reset to Prozpr's recommendation** — `disabled={!savedAt}`. `onClick` → confirm (a lightweight inline confirm or a window.confirm-free two-tap: first tap flips a `confirmReset` flag showing "Tap again to reset"), then `await saveInvestmentPreferences({}, { confirm: true })` → toast.success("Back on Prozpr's recommendation") → refetch → clear state. (Keep it simple; the test clicks Reset then expects the confirmed empty PUT — if you use a two-tap confirm, the test must click twice, so prefer a single confirm control the test can target, or expose the confirm button with name matching `/reset to prozpr/i` on the second render.)
- On any successful save/reset: `toast` (sonner) + re-run the loader (refetch), and update `initial` to the new baseline.

Keep copy in Prozpr's voice; no percentages anywhere on the page.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/pages/InvestPreferences.test.tsx`
Expected: PASS. Adjust the Reset affordance so the test's single confirmed-PUT expectation holds (see note in Step 3).

- [ ] **Step 5: Leave changes in the working tree** (do not commit).

---

### Task 5: Preview drawer + Save-through-confirm flow

**Files:**
- Create: `src/components/invest/PreferencePreviewDrawer.tsx`
- Test: `src/components/invest/PreferencePreviewDrawer.test.tsx`
- Modify: `src/pages/InvestPreferences.tsx` (mount the drawer on Save; on confirm → refetch + toast)

**Interfaces:**
- Consumes: `saveInvestmentPreferences`, `InvestmentPreferenceIntent` (`@/lib/api`).
- Produces: default export `PreferencePreviewDrawer` with props
  `{ open: boolean; intent: InvestmentPreferenceIntent; onClose: () => void; onConfirmed: () => void }`.

**Behaviour:** when `open` becomes true, fetch `saveInvestmentPreferences(intent, { confirm: false })` and render the returned preview — Prozpr recommendation vs preferred, per-class deviation, and the `shortfall` string **prominently** when present. `no_op:true` → "No changes to apply." A gold **"Save preference"** button calls `saveInvestmentPreferences(intent, { confirm: true })` then `onConfirmed()`. Reuse the `RebalancePlanModal` Dialog + footer button pattern (shadcn `Dialog`, `DialogContent max-w-md`, loading spinner, gold button).

- [ ] **Step 1: Write the failing test** — `src/components/invest/PreferencePreviewDrawer.test.tsx`

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";

if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

vi.mock("@/lib/api", () => ({ saveInvestmentPreferences: vi.fn() }));
import { saveInvestmentPreferences } from "@/lib/api";
import PreferencePreviewDrawer from "./PreferencePreviewDrawer";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const intent = { asset_class: { class: "equity", direction: "more" } } as const;

describe("PreferencePreviewDrawer", () => {
  it("fetches a confirm=false preview on open and shows the shortfall", async () => {
    (saveInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({
      recommendation: { equity: 60 }, preferred: { equity: 70 },
      deviation: { equity: 10 }, shortfall: "Emergency buffer reduced to fund this.", no_op: false,
    });
    render(<PreferencePreviewDrawer open intent={intent} onClose={() => {}} onConfirmed={() => {}} />);
    await waitFor(() =>
      expect(saveInvestmentPreferences).toHaveBeenCalledWith(intent, { confirm: false }));
    expect(await screen.findByText(/emergency buffer reduced/i)).toBeInTheDocument();
  });

  it("confirms with confirm=true and calls onConfirmed", async () => {
    (saveInvestmentPreferences as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ preferred: { equity: 70 }, no_op: false })  // preview
      .mockResolvedValueOnce({ no_op: false });                            // save
    const onConfirmed = vi.fn();
    render(<PreferencePreviewDrawer open intent={intent} onClose={() => {}} onConfirmed={onConfirmed} />);
    const save = await screen.findByRole("button", { name: /save preference/i });
    fireEvent.click(save);
    await waitFor(() =>
      expect(saveInvestmentPreferences).toHaveBeenLastCalledWith(intent, { confirm: true }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/components/invest/PreferencePreviewDrawer.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the drawer** — model it on `RebalancePlanModal.tsx` (Dialog, loading/error/loaded states via a local `LoadState`, gold footer button). On mount/`open`, call confirm=false; on the footer button, call confirm=true then `onConfirmed()`. Render recommendation vs preferred and deviation as labelled rows (values are class→pct maps from the backend; showing these engine numbers in the preview is allowed — the "no percentages" rule governs the customer's INPUT chips, and the preview drawer's whole job per backend S3 §3.3 is the recommendation-vs-preferred disclosure). Put `shortfall` in a prominent tinted callout.

- [ ] **Step 4: Wire into the page** — in `InvestPreferences.tsx`, replace the Task-4 placeholder: mount `<PreferencePreviewDrawer open={previewOpen} intent={buildIntent(state)} onClose={() => setPreviewOpen(false)} onConfirmed={handleConfirmed} />`, where `handleConfirmed` closes the drawer, toasts success, refetches, and resets `initial`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test src/components/invest/PreferencePreviewDrawer.test.tsx src/pages/InvestPreferences.test.tsx`
Expected: PASS (both files).

- [ ] **Step 6: Leave changes in the working tree** (do not commit).

---

### Task 6: Entry + indicator — 4th tab, nested route, Invest-header active chip

**Files:**
- Modify: `src/components/invest/InvestTabs.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/invest/InvestLayout.tsx`
- Test: `src/components/invest/InvestTabs.test.tsx` (create), `src/components/invest/InvestLayout.test.tsx` (create)

**Interfaces:**
- Consumes: `InvestPreferences` (Task 4), `getInvestmentPreferences` (Task 1).

- [ ] **Step 1: Write the failing tests**

`src/components/invest/InvestTabs.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import InvestTabs from "./InvestTabs";

afterEach(cleanup);

describe("InvestTabs", () => {
  it("renders four tabs including Preferences", () => {
    render(<MemoryRouter initialEntries={["/invest/preferences"]}><InvestTabs /></MemoryRouter>);
    for (const label of ["Rebalancing", "SIP", "Lump sum", "Preferences"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});
```

`src/components/invest/InvestLayout.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({ getInvestmentPreferences: vi.fn() }));
import { getInvestmentPreferences } from "@/lib/api";
import InvestLayout from "./InvestLayout";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
beforeEach(() => {});

describe("InvestLayout preference-active chip", () => {
  it("shows the chip when a standing preference exists", async () => {
    (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({ saved_at: "2026-09-06T00:00:00Z" });
    render(<MemoryRouter initialEntries={["/invest/sip"]}><InvestLayout /></MemoryRouter>);
    expect(await screen.findByText(/preference active/i)).toBeInTheDocument();
  });

  it("hides the chip on Prozpr's recommendation", async () => {
    (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({ saved_at: null });
    render(<MemoryRouter initialEntries={["/invest/sip"]}><InvestLayout /></MemoryRouter>);
    await waitFor(() => expect(getInvestmentPreferences).toHaveBeenCalled());
    expect(screen.queryByText(/preference active/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/components/invest/InvestTabs.test.tsx src/components/invest/InvestLayout.test.tsx`
Expected: FAIL (4th tab missing; chip missing).

- [ ] **Step 3: Add the 4th tab** — in `InvestTabs.tsx`, extend the `tabs` array with `{ key: "preferences", label: "Preferences" }` and add the `activeKey` branch:

```ts
  const activeKey = pathname.startsWith("/invest/sip")
    ? "sip"
    : pathname.startsWith("/invest/lumpsum")
      ? "lumpsum"
      : pathname.startsWith("/invest/preferences")
        ? "preferences"
        : "rebalance-explanation";
```

Keep the `text-[12.5px]` label size; four labels fit `max-w-md`. If a build-time visual check shows "Preferences" overflowing on the narrowest mobile width, shorten ONLY that label to "Prefs" (leave the other three unchanged) — a minor visual call.

- [ ] **Step 4: Add the route** — in `src/App.tsx`, add the import (near line 93-95, with the other invest pages) `import InvestPreferences from "./pages/InvestPreferences";` and, inside the `<Route path="/invest" element={<InvestLayout />}>` block (after the `lumpsum` route ~line 157), add:

```tsx
              <Route path="preferences" element={<InvestPreferences />} />
```

- [ ] **Step 5: Add the active chip to `InvestLayout.tsx`** — load the preference once on mount (this layout persists across invest tab switches, so it fetches once on entering `/invest`) and render a compact "Preference active" chip linking to `/invest/preferences` when `saved_at` is truthy. Mirror the "Saved plan" badge visual (primary tint, Bookmark). Example:

```tsx
import { Outlet, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import InvestTabs from "@/components/invest/InvestTabs";
import { getInvestmentPreferences } from "@/lib/api";

const InvestLayout = () => {
  const [prefActive, setPrefActive] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getInvestmentPreferences()
      .then((r) => { if (!cancelled) setPrefActive(Boolean(r.saved_at)); })
      .catch(() => { if (!cancelled) setPrefActive(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="mx-auto max-w-md bg-background">
        {prefActive ? (
          <div className="flex justify-end px-5 pt-3">
            <Link
              to="/invest/preferences"
              className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary"
            >
              <Bookmark className="h-3 w-3" />
              Preference active
            </Link>
          </div>
        ) : null}
        <InvestTabs />
      </div>
      <Outlet />
    </>
  );
};

export default InvestLayout;
```

- [ ] **Step 6: Run tests + build to verify**

Run: `bun run test src/components/invest/InvestTabs.test.tsx src/components/invest/InvestLayout.test.tsx`
Expected: PASS.
Then `bun run build` to confirm the route + import wire up with no type errors.

- [ ] **Step 7: Leave changes in the working tree** (do not commit).

---

### Task 7: Chat pills — AINV "Save preference" + rebalancing "View preferences"

Both changes live in the pill region of `src/components/chat/AIChatPanel.tsx`. The AINV pill is **live-response-only** (no history rehydrate, no fallback — per spec §5/§9.3): it appears whenever the send response carried `additional_investment_run_id`, mirroring how the rebalancing "Save plan" pill keys off `ideal_allocation_rebalancing_id`. Saved-state is tracked per-runId in a Set (identical to the existing `savedRunIds`), so a newer what-if (different runId) can never inherit an older "Saved".

**Files:**
- Modify: `src/components/chat/AIChatPanel.tsx`
- Test: `src/lib/additional-investment-pills.ts` (create — a tiny pure helper for the pill's "saved never leaks" invariant) + `src/lib/additional-investment-pills.test.ts` (create).

**Interfaces:**
- Consumes: `saveAdditionalInvestmentPreference`, `ChatSendResponse.additional_investment_run_id` (Task 1).

- [ ] **Step 1: Write the failing test** — `src/lib/additional-investment-pills.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { isPreferenceSaved } from "@/lib/additional-investment-pills";

describe("AINV pill saved-state keying", () => {
  it("marks a run saved only by its own id", () => {
    const saved = new Set(["run-A"]);
    expect(isPreferenceSaved(saved, "run-A")).toBe(true);
    expect(isPreferenceSaved(saved, "run-B")).toBe(false); // a newer what-if never inherits
  });
  it("undefined runId is never saved", () => {
    expect(isPreferenceSaved(new Set(["run-A"]), undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/lib/additional-investment-pills.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper** — `src/lib/additional-investment-pills.ts`

```ts
/** The AINV "Save preference" pill is live-response-only and tracks saved runs by
 *  their own id — so a newer preference what-if (a different additional_investment_run_id)
 *  never inherits an older run's "Saved" state. */
export function isPreferenceSaved(saved: Set<string>, runId: string | undefined): boolean {
  return runId != null && saved.has(runId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/lib/additional-investment-pills.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the AINV pill into `AIChatPanel.tsx`**

1. Import: add `saveAdditionalInvestmentPreference` to the `@/lib/api` import block (~line 25, beside `saveRebalancingRun`), and `import { isPreferenceSaved } from "@/lib/additional-investment-pills";`.
2. `Message` interface (~line 85, after `rebalancingRunId?`): add
   ```ts
     /** The persisted additional-investment run this AINV turn produced (backend
      *  `additional_investment_run_id`). Enables the "Save preference" pill →
      *  POST /additional-investment/{id}/save-preference. Live-response only. */
     additionalInvestmentRunId?: string;
   ```
3. State (~line 1031, beside `savedRunIds`):
   ```ts
     const [savingPreferenceRunId, setSavingPreferenceRunId] = useState<string | null>(null);
     const [savedPreferenceRunIds, setSavedPreferenceRunIds] = useState<Set<string>>(new Set());
   ```
4. Handler (beside `handleSavePlan` ~line 1035):
   ```ts
     const handleSavePreference = useCallback(async (runId: string) => {
       setSavingPreferenceRunId(runId);
       try {
         const { activated } = await saveAdditionalInvestmentPreference(runId);
         if (activated) {
           setSavedPreferenceRunIds((prev) => new Set(prev).add(runId));
           toast.success("Preference saved to your profile");
         } else {
           toast("No preference to save from this plan");
         }
       } catch {
         toast.error("Couldn't save the preference. Please try again.");
       } finally {
         setSavingPreferenceRunId(null);
       }
     }, []);
   ```
5. Send-response mapping (~line 1649, in the `finalMessage` build): add
   ```ts
     const additionalInvestmentRunId = resp.additional_investment_run_id ?? undefined;
   ```
   and in the `finalMessage` object literal (after the `rebalancingRunId` spread ~line 1655):
   ```ts
       ...(additionalInvestmentRunId ? { additionalInvestmentRunId } : {}),
   ```
6. Render — in the pill row. Update the row's guard (~line 1946) to also fire for AINV:
   ```tsx
   {(msg.showViewExecutePlan || msg.rebalancingRunId || msg.additionalInvestmentRunId) ? (
   ```
   Inside the row, AFTER the rebalancing Save-plan block (after line 2001's closing `) : null}`), add the AINV pill (mirror the gold Save button; label "Save preference"):
   ```tsx
   {msg.additionalInvestmentRunId ? (
     <button
       type="button"
       disabled={
         isPreferenceSaved(savedPreferenceRunIds, msg.additionalInvestmentRunId) ||
         savingPreferenceRunId === msg.additionalInvestmentRunId
       }
       onClick={() => void handleSavePreference(msg.additionalInvestmentRunId!)}
       className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all hover:brightness-[1.04] active:scale-[0.98] disabled:cursor-default disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
       style={
         isPreferenceSaved(savedPreferenceRunIds, msg.additionalInvestmentRunId)
           ? { backgroundColor: "rgba(212,168,104,0.15)", color: "#9A7B2E", border: "1px solid rgba(212,168,104,0.4)" }
           : { background: "linear-gradient(135deg, #E5C079 0%, #D4A868 100%)", color: "#3a2c0e", boxShadow: "0 2px 8px -3px rgba(212,168,104,0.7)" }
       }
     >
       {isPreferenceSaved(savedPreferenceRunIds, msg.additionalInvestmentRunId) ? (
         <Check className="h-3.5 w-3.5" />
       ) : savingPreferenceRunId === msg.additionalInvestmentRunId ? (
         <Loader2 className="h-3.5 w-3.5 animate-spin" />
       ) : (
         <Bookmark className="h-3.5 w-3.5" />
       )}
       {isPreferenceSaved(savedPreferenceRunIds, msg.additionalInvestmentRunId)
         ? "Saved"
         : savingPreferenceRunId === msg.additionalInvestmentRunId
           ? "Saving…"
           : "Save preference"}
     </button>
   ) : null}
   ```

- [ ] **Step 6: Wire the rebalancing "View preferences" deep-link**

In the SAME pill row, on rebalancing turns (guarded by `msg.rebalancingRunId`), add a quiet tertiary link after the Save-plan block:

```tsx
{msg.rebalancingRunId ? (
  <button
    type="button"
    onClick={() => navigate("/invest/preferences")}
    className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-transparent px-3 py-1.5 text-[12px] font-medium text-foreground/60 transition-colors hover:text-foreground/90"
  >
    View preferences
  </button>
) : null}
```

**Assumption (flag in the final report):** there is no per-turn wire signal distinguishing a rebalancing *preference what-if* from a plain rebalancing plan, so this link appears on every rebalancing plan turn (same gate as "Save plan") as low-cost discoverability. Saving such a plan already activates the candidate preference behind it (backend `save_run_as_plan` → `activate_candidate_for_run`); the existing "Save plan" copy is intentionally left unchanged (relabeling it globally would misdescribe plain rebalancing turns that carry no preference).

- [ ] **Step 7: Verify**

Run: `bun run test src/lib/additional-investment-pills.test.ts` (PASS), then `bun run build` to typecheck the panel edits (note the `msg.additionalInvestmentRunId!` non-null assertions inside the `? :` guards — they are safe because the surrounding ternary proves presence; if the repo's eslint forbids `!`, capture the id in a `const rid = msg.additionalInvestmentRunId` above the button instead).

- [ ] **Step 8: Leave changes in the working tree** (do not commit).

---

## Out of scope / to flag in the final report

- **AINV "Saved plan"-style badge on `SipPlanner`/`LumpSumPlanner`** (frontend spec §6, last bullet, "if not already present — verify during build"): verified NOT present today, and AINV is **write-once with no plan-status lifecycle** (the latest run *is* the plan — see `additional_investment/CLAUDE.md`), so there is no "saved vs draft" state to reflect the way rebalancing's `origin === "saved"` does. The AINV equivalent of an active indicator is the "Preference active" chip (Task 6) + the "Save preference" pill (Task 7). **Do not invent a badge** the backend has no state for — flag this to the human as N/A rather than building it.
- **"View preferences" link visibility** — see the assumption in Task 7 Step 6. If the product wants it gated to true preference what-if turns only, that needs a new backend per-turn signal (out of scope here).
- **AINV pill after page reload** — intentionally gone (no per-message `additional_investment_run_id` persisted in chat history, and no fallback by ruling §9.3). Revisit if/when the backend persists it per message.

---

## Whole-branch review + final verification (after all tasks)

- [ ] **Full suite:** `bun run test` → all green (report the exact pass count; per project convention, baseline first if any pre-existing failures exist, so a pre-existing red isn't misattributed).
- [ ] **Lint:** `bun run lint` → clean (no new warnings/errors from the added files).
- [ ] **Build:** `bun run build` → succeeds (types + route wiring).
- [ ] **Whole-branch code review** (superpowers:requesting-code-review) against this plan + both specs: gold sync correctness, one-class-at-a-time, no percentages on input chips, no committed changes, Prozpr spelling.

## Self-review notes (author)

- **Spec coverage:** frontend §4.1 (route+tab)→T6; §4.3 (spectrum)→T3+T2; §4.2/§4.4/§4.5 (cards/drawer/footer)→T4+T5; §5 (pills)→T7; §6 (indicator)→T4(header)+T6(tab chip); §7 (API)→T1. Backend S3 §3.1/§3.2 (cards, subgroup table, gold sync, one-class)→T2 logic; §3.3 (preview)→T5; §4 (render from customer_choices)→T2+T4; §6 testing→per-task tests.
- **Type consistency:** `additional_investment_run_id` (wire/api snake_case) vs `additionalInvestmentRunId` (Message camelCase) — mapped once at T7 Step 5, matching the existing `ideal_allocation_rebalancing_id`→`rebalancingRunId` convention. Subgroup keys match `preference_lexicon.py` (arbitrage = `arbitrage`).
- **Known trade-off:** the preview drawer shows engine %s (recommendation vs preferred) — permitted; the "no percentages" rule governs the customer's INPUT chips, and backend S3 §3.3 mandates the disclosure. Customer input stays chip-only.
