# Investment Preferences S4 (Percentage Screen) — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the old spectrum/stance preferences screen with the approved percentage screen — Equity/Debt/Commodity set on a draggable two-divider bar against Prozpr's bar, optional subcategory pins — wired to the S4 backend contract.

**Architecture:** A rewritten `InvestPreferences` page composing two new components — `AssetMixBar` (interactive + reference) and `SubcategoryPins` — over a thin, well-tested lib (bar math + validation). The old spectrum screen, its components, and its lib are deleted. The page works entirely in **% of total**; the backend owns the %-of-class conversion.

**Tech Stack:** Vite + React + TS, Tailwind + shadcn/ui, vitest + @testing-library. Repo: `Prozpr_Frontend`.

## Global Constraints

- **Approved design** (final mockup): `https://claude.ai/code/artifact/6a60873c-9b6d-4475-b274-73ae1e11154b` — gold-pill `InvestTabs` chrome; **Instrument Serif** headline "How you want to invest"; lede "We've suggested a mix for your goals — now tweak it to match your own preferences. It's your portfolio to shape."; two **equal-height bars** (Your preference / Prozpr recommends) with inline % and slim **gold lozenge** handles; hairline "Fine-tune · optional" with pin rows (your % + Prozpr %) and an add-flow; footer Reset (ghost) + Save (gold).
- **No fund classification in the frontend.** All subcategory ids, labels, classes, and Prozpr %s come from the backend GET `subcategories`.
- **% of total end-to-end.** No %-of-class math on the client.
- **Match the app design system:** DM Sans (`font-sans`), Instrument Serif (`font-display`), tokens `bg-card` / `border-border` / `text-muted-foreground`, gold `#D4A868`; asset colours from the canonical tokens — Equity `hsl(var(--bucket-equity))`, Debt `hsl(var(--bucket-debt))`, Commodity `hsl(var(--wealth-amber))`. Reuse `InvestTabs`/`InvestLayout` — do not re-implement the tab chrome.
- **Commits:** the user commits; leave changes in the working tree (do not `git commit`).
- Run tests: `npx vitest run <path>`.

Backend contract (already shipped): `GET /profile/investment-preferences` → `{ saved: { class_mix, pins:[{subgroup,pct_of_total}], saved_at } | null, recommendation: { class_mix }, subcategories: [{ id, class, label, recommended_pct_of_total }] }`; `PUT` body `{ class_mix, pins }` → `{ ok, saved_at?, blocked?, no_op? }`. No "clear" endpoint.

## Design decision — "Reset to Prozpr"

The new backend has **no clear/deactivate path**. So "Reset to Prozpr" **repopulates the editor to `recommendation.class_mix` and clears pins (client-side only)** — it does not save. The customer can then Save (persisting a mix equal to Prozpr's, which the engine treats as neutral). This keeps the backend surface minimal; a true "delete my preference" is out of scope for v1.

## File Structure

- **Rewrite** `src/lib/investment-preferences.ts` → minimal S4 helpers (types + bar math + validation). Rewrite its test.
- **Rewrite** `src/pages/InvestPreferences.tsx` → the percentage screen. Rewrite its test.
- **Create** `src/components/invest/AssetMixBar.tsx` — interactive + reference bar.
- **Create** `src/components/invest/SubcategoryPins.tsx` — pin list + add-flow.
- **Modify** `src/lib/api.ts` — swap the preferences types + functions to the S4 contract.
- **Delete** `src/components/invest/PreferenceDial.tsx`, `PreferenceSpectrum.tsx`, `PreferencePreviewDrawer.tsx` (only the old screen used them).

---

### Task 1: API contract (`src/lib/api.ts`)

Replace the old preference types + functions (lines ~2784–2832) with the S4 contract.

**Files:** Modify `src/lib/api.ts`.

**Interfaces produced:**
- `ClassMix = { equity: number; debt: number; others: number }`
- `SubcategoryPin = { subgroup: string; pct_of_total: number }`
- `ScreenSubcategory = { id: string; class: "equity"|"debt"|"others"; label: string; recommended_pct_of_total: number }`
- `ScreenPreferenceGetResponse = { saved: { class_mix: ClassMix; pins: SubcategoryPin[]; saved_at?: string|null } | null; recommendation: { class_mix: ClassMix }; subcategories: ScreenSubcategory[] }`
- `ScreenSaveResponse = { ok: boolean; saved_at?: string|null; blocked?: string|null; no_op?: boolean }`
- `getInvestmentPreferences(): Promise<ScreenPreferenceGetResponse>`
- `saveInvestmentPreferences(body: { class_mix: ClassMix; pins: SubcategoryPin[] }): Promise<ScreenSaveResponse>`

- [ ] **Step 1: Replace types + functions**

```ts
export interface ClassMix { equity: number; debt: number; others: number; }
export interface SubcategoryPin { subgroup: string; pct_of_total: number; }
export interface ScreenSubcategory {
  id: string;
  class: "equity" | "debt" | "others";
  label: string;
  recommended_pct_of_total: number;
}
export interface ScreenSaved { class_mix: ClassMix; pins: SubcategoryPin[]; saved_at?: string | null; }
export interface ScreenPreferenceGetResponse {
  saved: ScreenSaved | null;
  recommendation: { class_mix: ClassMix };
  subcategories: ScreenSubcategory[];
}
export interface ScreenSaveResponse { ok: boolean; saved_at?: string | null; blocked?: string | null; no_op?: boolean; }

export async function getInvestmentPreferences(): Promise<ScreenPreferenceGetResponse> {
  return request<ScreenPreferenceGetResponse>("/profile/investment-preferences");
}

export async function saveInvestmentPreferences(
  body: { class_mix: ClassMix; pins: SubcategoryPin[] },
): Promise<ScreenSaveResponse> {
  return request<ScreenPreferenceGetResponse extends never ? never : ScreenSaveResponse>(
    "/profile/investment-preferences",
    { method: "PUT", body: JSON.stringify(body) },
  );
}
```

Delete the old `InvestmentPreferenceIntent` / `InvestmentPreferenceResponse` / `InvestmentPreferencePreviewResponse` interfaces and the old function bodies. Keep `saveAdditionalInvestmentPreference` (chat pill — unrelated). If `PreferenceAssetClass` / `PreferenceDirection` / `PreferenceSubgroupToken` are now unused (grep confirms zero other consumers), delete them too.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "api.ts|error TS" | head`
Expected: no new errors in `api.ts` (errors in the old screen/lib are expected until later tasks land — that's fine).

- [ ] **Step 3: Commit** (skip — user commits)

---

### Task 2: Lib — bar math + validation (`src/lib/investment-preferences.ts`)

Rewrite the file to the S4 model: pure helpers only.

**Files:** Rewrite `src/lib/investment-preferences.ts`; rewrite `src/lib/investment-preferences.test.ts`.

**Interfaces produced:**
- `type Cls = "equity" | "debt" | "others"`
- `applyDividerDrag(mix: ClassMix, handle: 1 | 2, posPct: number): ClassMix` — moving the equity|debt divider (handle 1) trades equity↔debt (commodity fixed); the debt|commodity divider (handle 2) trades commodity↔debt (equity fixed). Rounds to integers, always sums to 100.
- `classRoom(mix: ClassMix, pins: SubcategoryPin[], cls: Cls): number` — `mix[cls] − Σ pins in cls` (% of total left for our picks).
- `pinsValid(mix, pins, subById): boolean` — every pin > 0 and each class's pinned total ≤ its class share.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { applyDividerDrag, classRoom } from "./investment-preferences";

const mix = { equity: 72, debt: 18, others: 10 };

describe("applyDividerDrag", () => {
  it("handle 1 trades equity with debt, commodity fixed", () => {
    expect(applyDividerDrag(mix, 1, 80)).toEqual({ equity: 80, debt: 10, others: 10 });
  });
  it("handle 2 trades commodity with debt, equity fixed", () => {
    // pos 95 => equity+debt = 95 => debt 23, commodity 5
    expect(applyDividerDrag(mix, 2, 95)).toEqual({ equity: 72, debt: 23, others: 5 });
  });
  it("clamps handle 1 at the second divider", () => {
    expect(applyDividerDrag(mix, 1, 99)).toEqual({ equity: 90, debt: 0, others: 10 });
  });
  it("always sums to 100", () => {
    const m = applyDividerDrag(mix, 1, 33);
    expect(m.equity + m.debt + m.others).toBe(100);
  });
});

describe("classRoom", () => {
  it("is class share minus pinned in that class", () => {
    expect(classRoom(mix, [{ subgroup: "low_beta_equities", pct_of_total: 25 }], "equity")).toBe(47);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/investment-preferences.test.ts`
Expected: FAIL — new functions not exported (the file still holds the old spectrum exports).

- [ ] **Step 3: Rewrite the lib**

```ts
/** S4 percentage preferences — pure bar math + validation. No React, no I/O.
 *  All values are % of the whole portfolio; the backend owns %-of-class. */
import type { ClassMix, SubcategoryPin, ScreenSubcategory } from "@/lib/api";

export type Cls = "equity" | "debt" | "others";
export const CLASSES: Cls[] = ["equity", "debt", "others"];
export const CLASS_LABEL: Record<Cls, string> = { equity: "Equity", debt: "Debt", others: "Commodity" };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Drag a divider inside the bar. Handle 1 = equity|debt boundary (trades
 *  equity↔debt, commodity fixed); handle 2 = debt|commodity boundary (trades
 *  commodity↔debt, equity fixed). Integer %s, always summing to 100. */
export function applyDividerDrag(mix: ClassMix, handle: 1 | 2, posPct: number): ClassMix {
  const x = Math.round(clamp(posPct));
  if (handle === 1) {
    const cap = mix.equity + mix.debt;          // second divider position
    const equity = Math.min(x, cap);
    return { equity, debt: cap - equity, others: mix.others };
  }
  const floor = mix.equity;                       // first divider position
  const cum = Math.max(x, floor);                 // equity+debt cumulative
  return { equity: mix.equity, debt: cum - floor, others: 100 - cum };
}

const classOf = (pins: SubcategoryPin[], subById: Record<string, ScreenSubcategory>) =>
  (p: SubcategoryPin) => subById[p.subgroup]?.class ?? "others";

export function classRoom(mix: ClassMix, pins: SubcategoryPin[], cls: Cls): number {
  const pinned = pins.filter((p) => cls === (globalThis as never)); // replaced below
  return mix[cls];
}
```

Then correct `classRoom`/add `pinsValid` using the subcategory map (the caller passes `subById`):

```ts
export function pinnedInClass(
  pins: SubcategoryPin[], subById: Record<string, ScreenSubcategory>, cls: Cls,
): number {
  return pins.filter((p) => (subById[p.subgroup]?.class ?? "others") === cls)
             .reduce((s, p) => s + p.pct_of_total, 0);
}
export function classRoom(
  mix: ClassMix, pins: SubcategoryPin[], subById: Record<string, ScreenSubcategory>, cls: Cls,
): number {
  return mix[cls] - pinnedInClass(pins, subById, cls);
}
export function pinsValid(
  mix: ClassMix, pins: SubcategoryPin[], subById: Record<string, ScreenSubcategory>,
): boolean {
  if (pins.some((p) => p.pct_of_total <= 0)) return false;
  return CLASSES.every((c) => pinnedInClass(pins, subById, c) <= mix[c] + 0.5);
}
export function sameMix(a: ClassMix, b: ClassMix): boolean {
  return a.equity === b.equity && a.debt === b.debt && a.others === b.others;
}
export function samePins(a: SubcategoryPin[], b: SubcategoryPin[]): boolean {
  if (a.length !== b.length) return false;
  const key = (p: SubcategoryPin) => `${p.subgroup}:${p.pct_of_total}`;
  const bs = new Set(b.map(key));
  return a.every((p) => bs.has(key(p)));
}
```

(Adjust the `classRoom` test to the final signature `classRoom(mix, pins, subById, "equity")` — pass `subById = { low_beta_equities: { class: "equity", ... } }`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/investment-preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit** (skip — user commits)

---

### Task 3: `AssetMixBar` component

**Files:** Create `src/components/invest/AssetMixBar.tsx`.

**Interfaces produced:**
- `AssetMixBar({ mode, mix, onChange? })` — `mode: "interactive" | "reference"`, `mix: ClassMix`, `onChange?(mix: ClassMix)`.

- [ ] **Step 1: Implement** (drag via pointer events → `applyDividerDrag`; keyboard on handles; inline % hidden under ~14%)

```tsx
import { useRef } from "react";
import type { ClassMix } from "@/lib/api";
import { applyDividerDrag } from "@/lib/investment-preferences";

const SEG = [
  { k: "equity" as const, color: "hsl(var(--bucket-equity))" },
  { k: "debt" as const, color: "hsl(var(--bucket-debt))" },
  { k: "others" as const, color: "hsl(var(--wealth-amber))" },
];

export default function AssetMixBar({
  mode, mix, onChange,
}: { mode: "interactive" | "reference"; mix: ClassMix; onChange?: (m: ClassMix) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const active = useRef<1 | 2 | null>(null);

  const pctFromEvent = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 100;
  };
  const onDown = (h: 1 | 2) => (e: React.PointerEvent) => {
    if (mode !== "interactive") return;
    active.current = h; (e.target as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault();
  };
  const onMove = (e: React.PointerEvent) => {
    if (active.current == null || !onChange) return;
    onChange(applyDividerDrag(mix, active.current, pctFromEvent(e.clientX)));
  };
  const onUp = () => { active.current = null; };
  const onKey = (h: 1 | 2) => (e: React.KeyboardEvent) => {
    if (mode !== "interactive" || !onChange) return;
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return; e.preventDefault();
    const cur = h === 1 ? mix.equity : mix.equity + mix.debt;
    onChange(applyDividerDrag(mix, h, cur + d));
  };

  const handles = mode === "interactive"
    ? [{ h: 1 as const, left: mix.equity }, { h: 2 as const, left: mix.equity + mix.debt }]
    : [];

  return (
    <div
      ref={barRef}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className={`relative flex h-[30px] rounded-lg bg-muted ${mode === "interactive" ? "overflow-visible" : "overflow-hidden"}`}
    >
      {SEG.map((s, i) => (
        <div
          key={s.k}
          className={`flex h-full items-center justify-center overflow-hidden ${i === 0 ? "rounded-l-lg" : ""} ${i === 2 ? "rounded-r-lg" : ""}`}
          style={{ width: `${mix[s.k]}%`, background: s.color }}
        >
          {mix[s.k] >= 14 && (
            <span className="text-[9px] font-semibold tabular-nums text-white/95">{mix[s.k]}%</span>
          )}
        </div>
      ))}
      {handles.map(({ h, left }) => (
        <div
          key={h}
          role="slider" tabIndex={0}
          aria-label={h === 1 ? "Equity / Debt divider" : "Debt / Commodity divider"}
          aria-valuenow={left}
          onPointerDown={onDown(h)} onKeyDown={onKey(h)}
          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize px-2.5 py-4 touch-none focus:outline-none"
          style={{ left: `${left}%` }}
        >
          <span
            className="block h-[22px] w-[7px] rounded bg-[#D4A868] shadow-[0_2px_9px_rgba(0,0,0,0.55)] transition-transform group-hover:scale-110"
            style={{ boxShadow: "0 2px 9px rgba(0,0,0,.55)" }}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep AssetMixBar` → no errors.

- [ ] **Step 3: Commit** (skip — user commits)

---

### Task 4: `SubcategoryPins` component

**Files:** Create `src/components/invest/SubcategoryPins.tsx`.

**Interfaces produced:**
- `SubcategoryPins({ mix, pins, subcategories, onChange })` — renders pin rows (name, "inside <Class>", your % + "Prozpr N%", remove), the per-class guardrail, and an add-flow (a `Select` grouped by class from `subcategories` minus already-pinned, a % input showing the room + Prozpr's rec, Add/Cancel). Uses `classRoom` + `CLASS_LABEL`.

- [ ] **Step 1: Implement** — grouped `<select>` (or shadcn `Select`) whose options are `subcategories` filtered to the pin's class-room > 0 and not already pinned; the % input defaults to `min(recommended, room)` and validates `≤ room` (block with a plain message); Add appends `{subgroup, pct_of_total}`; each row's × removes it. Prozpr N% for a row = `subcategories.find(id).recommended_pct_of_total`. (Full component code follows the mockup's fine-tune section; hairline rows via `border-t border-border`.)

- [ ] **Step 2: Typecheck** → no errors.
- [ ] **Step 3: Commit** (skip)

---

### Task 5: Rewrite `InvestPreferences.tsx`

**Files:** Rewrite `src/pages/InvestPreferences.tsx`.

- [ ] **Step 1: Compose the screen** — load via `getInvestmentPreferences()`; seed `mix`/`pins` from `saved` or, when `saved` is null, from `recommendation.class_mix` (default to Prozpr's mix, no pins); build `subById` from `subcategories`. Render:
  - Header: eyebrow-less; `<h1 className="font-display …">How you want to invest</h1>` + the lede.
  - Legend (Equity/Debt/Commodity dots using the asset tokens).
  - **"Your preference"** label + `<AssetMixBar mode="interactive" mix={mix} onChange={setMix} />`.
  - **"Prozpr recommends"** label + `<AssetMixBar mode="reference" mix={rec} />`.
  - Hint line.
  - `<SubcategoryPins mix={mix} pins={pins} subcategories={subs} onChange={setPins} />`.
  - Footer: **Reset to Prozpr** (ghost) → `setMix(rec); setPins([])` (client-side, per the design decision); **Save preferences** (gold) → `saveInvestmentPreferences({ class_mix: mix, pins })`, then toast (`no_op` → "No changes"; `blocked` → error; else "Saved — your plans were refreshed") and refetch.
  - Save disabled unless `dirty` (`!sameMix(mix, initialMix) || !samePins(pins, initialPins)`) and `pinsValid(mix, pins, subById)`.
  - Keep `BottomNav`; the `InvestTabs` chrome comes from `InvestLayout` (this page renders inside it).

- [ ] **Step 2: Typecheck + run any page test** → green.
- [ ] **Step 3: Commit** (skip)

---

### Task 6: Delete the old screen pieces + fix tests

**Files:** Delete `PreferenceDial.tsx`, `PreferenceSpectrum.tsx`, `PreferencePreviewDrawer.tsx`. Rewrite `InvestPreferences.test.tsx` and `investment-preferences.test.ts` (done in Task 2) to the new components. Remove any now-orphaned old api types.

- [ ] **Step 1: Delete the three old components** (only `InvestPreferences` + its test imported them).
- [ ] **Step 2: Rewrite `InvestPreferences.test.tsx`** — a render test: mock `getInvestmentPreferences` to return a `saved`+`recommendation`+`subcategories` fixture; assert the headline, both bars render, and Save calls `saveInvestmentPreferences` with `{ class_mix, pins }`. Delete assertions referencing the old dial/spectrum.
- [ ] **Step 3: Full suite** — `npx vitest run` → green (old preference tests gone, new ones pass).
- [ ] **Step 4: Typecheck** — `npx tsc --noEmit -p tsconfig.app.json` → clean (no dangling imports of deleted symbols).
- [ ] **Step 5: Commit** (skip — user commits)

---

## Self-Review notes

- **Spec coverage:** API contract (T1), bar math + validation (T2), interactive/reference bar (T3), pins + add-flow (T4), page compose + wiring + Reset decision (T5), delete old + tests (T6). Labels/catalog from backend (no classifier) ✓; % of total end-to-end ✓.
- **Reset semantics** resolved to client-side repopulate (no backend clear). Flagged.
- **Open items for execution:** exact `Select` (native vs shadcn) in T4; whether to show a live "Prozpr's mix below" note; a11y focus-visible ring on handles + reduced-motion. Verify in the browser preview after T5.
- **Deletion safety:** grep confirmed the three old components + old lib are only consumed by the old screen + its tests.
