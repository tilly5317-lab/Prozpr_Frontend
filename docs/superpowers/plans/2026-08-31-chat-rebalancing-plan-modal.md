# Chat Rebalancing Plan Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chat "View plan" pill open an in-chat modal showing that message's exact rebalancing trades, and show "Saved" only when that specific plan was actually committed.

**Architecture:** A pure `deriveRebalancingPills` function decides each restored chat message's View/Save pill state from the message's *own* rebalancing run id (falling back safely when the backend hasn't shipped that id yet). A new `RebalancePlanModal`, built on the existing Radix `Dialog` primitive, fetches `getRebalancingRunDetail(runId)` and renders the trades + a cost summary. `AIChatPanel` wires the pill to the modal (or to navigation for snapshot-only turns).

**Tech Stack:** React + TypeScript (Vite), Tailwind, Radix Dialog (`@/components/ui/dialog`), Vitest + React Testing Library (jsdom is the global test env; jest-dom is set up in `src/test/setup.ts`), `sonner` toasts.

## Global Constraints

- Test runner: `npm run test` (`vitest run`); single file: `npx vitest run <path>`. Lint: `npm run lint`. **Typecheck: `npx tsc --noEmit -p tsconfig.app.json`** (the `build` script uses SWC and does **not** typecheck).
- Path alias `@/` → `src/`.
- Preview app: dev server config name `frontend`, port `8080`.
- Keep the existing **two-pill** structure (View + Save). Do not remove the Save pill.
- Saved/gold styling (reuse verbatim for parity): saved chip `backgroundColor: "rgba(212,168,104,0.15)"`, `color: "#9A7B2E"`, `border: "1px solid rgba(212,168,104,0.4)"`; unsaved gold button `background: "linear-gradient(135deg, #E5C079 0%, #D4A868 100%)"`, `color: "#3a2c0e"`, `boxShadow: "0 2px 8px -3px rgba(212,168,104,0.7)"`.
- INR format: `` `₹${Math.round(n).toLocaleString("en-IN")}` ``.
- Trade colors: buys green `#2E9C7E`; sells/exits orange `#E0772F`.
- **Do NOT touch** `src/pages/RebalanceExplanation.tsx` (no shared-util extraction; the modal renders self-contained).
- **Backend dependency (separate repo, out of scope here):** the persisted `ChatMessageInfo` from chat history must add `ideal_allocation_rebalancing_id` and `ideal_allocation_snapshot_id`. This plan makes the frontend read them when present and degrade safely when absent.

## File Structure

- `src/lib/rebalancing-pills.ts` — **new.** Pure `deriveRebalancingPills(history, current)`. No React, no I/O.
- `src/lib/rebalancing-pills.test.ts` — **new.** Vitest unit tests for the above.
- `src/components/chat/RebalancePlanModal.tsx` — **new.** Modal on `@/components/ui/dialog`.
- `src/components/chat/RebalancePlanModal.test.tsx` — **new.** RTL smoke tests.
- `src/lib/api.ts` — **modify.** Add two optional fields to `ChatMessageInfo` (type only).
- `src/components/chat/AIChatPanel.tsx` — **modify.** Rewrite `rehydrateRebalancingPill`; branch the View-plan `onClick`; mount the modal.

---

### Task 1: Pure `deriveRebalancingPills` helper

**Files:**
- Create: `src/lib/rebalancing-pills.ts`
- Test: `src/lib/rebalancing-pills.test.ts`

**Interfaces:**
- Consumes: nothing (pure; defines its own structural input types, all module-local).
- Produces (only `deriveRebalancingPills` is exported; the interfaces stay module-local — no other module imports them):
  - `interface ChatMessageLike { role: string; intent?: string | null; ideal_allocation_rebalancing_id?: string | null; ideal_allocation_snapshot_id?: string | null }`
  - `interface CurrentRunLike { id: string; origin?: string | null }`
  - `interface DerivedPill { showViewExecutePlan: boolean; rebalancingRunId?: string }`
  - `interface DerivedPills { perMessage: DerivedPill[]; savedRunIds: string[] }`  (`perMessage` is index-aligned to `history`)
  - `export function deriveRebalancingPills(history: ChatMessageLike[], current: CurrentRunLike | null): DerivedPills`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rebalancing-pills.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveRebalancingPills } from "@/lib/rebalancing-pills";

const asst = (extra: Record<string, unknown> = {}) => ({
  role: "assistant",
  intent: "rebalancing",
  ...extra,
});

describe("deriveRebalancingPills — backend provides per-message ids", () => {
  it("marks only the message whose run matches the committed run", () => {
    const history = [
      asst({ ideal_allocation_rebalancing_id: "A" }),
      asst({ ideal_allocation_rebalancing_id: "B" }),
    ];
    // Older plan A is the committed one; newer B is unsaved.
    const { perMessage, savedRunIds } = deriveRebalancingPills(history, {
      id: "A",
      origin: "saved",
    });
    expect(perMessage[0]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "A" });
    expect(perMessage[1]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "B" });
    expect(savedRunIds).toEqual(["A"]); // B must NOT be marked saved
  });

  it("marks nothing saved when the current run is the unsaved latest", () => {
    const history = [asst({ ideal_allocation_rebalancing_id: "B" })];
    const { savedRunIds } = deriveRebalancingPills(history, { id: "B", origin: null });
    expect(savedRunIds).toEqual([]);
  });

  it("attributes saved to the matching newest message", () => {
    const history = [
      asst({ ideal_allocation_rebalancing_id: "A" }),
      asst({ ideal_allocation_rebalancing_id: "B" }),
    ];
    const { savedRunIds } = deriveRebalancingPills(history, { id: "B", origin: "saved" });
    expect(savedRunIds).toEqual(["B"]);
  });

  it("shows View for a snapshot-only turn but gives it no run id", () => {
    const history = [asst({ ideal_allocation_snapshot_id: "snap-1" })];
    const { perMessage } = deriveRebalancingPills(history, null);
    expect(perMessage[0]).toEqual({ showViewExecutePlan: true });
    expect(perMessage[0].rebalancingRunId).toBeUndefined();
  });
});

describe("deriveRebalancingPills — interim fallback (backend field absent)", () => {
  it("attaches the current run to the last rebalancing turn but never marks it saved", () => {
    const history = [
      { role: "user", intent: null },
      asst({}), // no ideal_allocation_* fields yet
    ];
    const { perMessage, savedRunIds } = deriveRebalancingPills(history, {
      id: "X",
      origin: "saved", // an older saved plan exists — today's false-"Saved" trigger
    });
    expect(perMessage[0]).toEqual({ showViewExecutePlan: false });
    expect(perMessage[1]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "X" });
    expect(savedRunIds).toEqual([]); // the reported bug must stay fixed in the interim
  });

  it("does nothing when there is no current run", () => {
    const history = [asst({})];
    const { perMessage, savedRunIds } = deriveRebalancingPills(history, null);
    expect(perMessage[0]).toEqual({ showViewExecutePlan: false });
    expect(savedRunIds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/rebalancing-pills.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/rebalancing-pills"` / `deriveRebalancingPills is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/rebalancing-pills.ts`:

```ts
/** Minimal shape deriveRebalancingPills needs from a persisted chat message. */
interface ChatMessageLike {
  role: string;
  intent?: string | null;
  ideal_allocation_rebalancing_id?: string | null;
  ideal_allocation_snapshot_id?: string | null;
}

/** Minimal shape from getCurrentRebalancingRun() — id + saved marker. */
interface CurrentRunLike {
  id: string;
  origin?: string | null;
}

/** Pill flags for one chat message (index-aligned to the input history). */
interface DerivedPill {
  showViewExecutePlan: boolean;
  rebalancingRunId?: string;
}

interface DerivedPills {
  /** One entry per input message, same order as `history`. */
  perMessage: DerivedPill[];
  /** Committed run ids (origin === "saved") that are attributable to a message. */
  savedRunIds: string[];
}

function lastIndexMatching<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}

/**
 * Decide each chat message's View/Save pill state on session restore.
 *
 * Preferred path (backend returns per-message ids): every message's pill is
 * derived from ITS OWN ideal_allocation_* fields, and a run is marked "saved"
 * only when the committed current run's id actually matches one of those
 * messages — so a newer, unsaved plan never inherits an older plan's "Saved".
 *
 * Interim path (no message carries the ids yet — backend not deployed): fall
 * back to attaching the global current run to the last rebalancing turn for the
 * View/Save affordance, but NEVER mark it saved (we cannot attribute the save
 * to a specific message → no false "Saved", the reported bug).
 */
export function deriveRebalancingPills(
  history: ChatMessageLike[],
  current: CurrentRunLike | null,
): DerivedPills {
  const hasPerMessageIds = history.some(
    (m) => m.ideal_allocation_rebalancing_id || m.ideal_allocation_snapshot_id,
  );

  if (hasPerMessageIds) {
    const perMessage: DerivedPill[] = history.map((m) => {
      const rebalancingRunId = m.ideal_allocation_rebalancing_id ?? undefined;
      const showViewExecutePlan = Boolean(
        m.ideal_allocation_rebalancing_id || m.ideal_allocation_snapshot_id,
      );
      return rebalancingRunId
        ? { showViewExecutePlan, rebalancingRunId }
        : { showViewExecutePlan };
    });
    const savedRunIds =
      current &&
      current.origin === "saved" &&
      perMessage.some((p) => p.rebalancingRunId === current.id)
        ? [current.id]
        : [];
    return { perMessage, savedRunIds };
  }

  // Interim fallback — preserve today's View affordance, kill the false "Saved".
  const perMessage: DerivedPill[] = history.map(() => ({ showViewExecutePlan: false }));
  if (current) {
    let idx = lastIndexMatching(
      history,
      (m) => m.role === "assistant" && m.intent === "rebalancing",
    );
    if (idx === -1) {
      idx = lastIndexMatching(history, (m) => m.role === "assistant");
    }
    if (idx !== -1) {
      perMessage[idx] = { showViewExecutePlan: true, rebalancingRunId: current.id };
    }
  }
  return { perMessage, savedRunIds: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/rebalancing-pills.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rebalancing-pills.ts src/lib/rebalancing-pills.test.ts
git commit -m "feat: pure deriveRebalancingPills for per-message pill state"
```

---

### Task 2: Anchor rehydration to each message's own run (fixes false "Saved")

**Files:**
- Modify: `src/lib/api.ts` (add two optional fields to `ChatMessageInfo`, ~line 929-938)
- Modify: `src/components/chat/AIChatPanel.tsx` (rewrite `rehydrateRebalancingPill`, comment + callback lines 1044-1069; add import)

**Interfaces:**
- Consumes: `deriveRebalancingPills` from `@/lib/rebalancing-pills` (Task 1); existing `getCurrentRebalancingRun` and `ChatMessageInfo` from `@/lib/api`.
- Produces: no new exports. `rehydrateRebalancingPill(history: ChatMessageInfo[])` keeps its signature and call sites (`AIChatPanel.tsx:1230`, `:1360`).

> No unit test wraps the component closure directly; the logic under test lives in `deriveRebalancingPills` (Task 1). Verification here is: Task 1 tests still green, typecheck + lint clean, and a manual preview check of the false-"Saved" fix.

- [ ] **Step 1: Add the optional fields to `ChatMessageInfo`**

In `src/lib/api.ts`, the interface is:

```ts
export interface ChatMessageInfo {
  id: string;
  role: string;
  content: string;
  intent: string | null;
  intent_confidence: number | null;
  intent_reasoning: string | null;
  chart_payloads: ChatChartPayload[] | null;
  created_at: string;
}
```

Add the two optional fields (mirror of `ChatSendResponse`), so restored messages can carry their own run:

```ts
export interface ChatMessageInfo {
  id: string;
  role: string;
  content: string;
  intent: string | null;
  intent_confidence: number | null;
  intent_reasoning: string | null;
  chart_payloads: ChatChartPayload[] | null;
  created_at: string;
  /** The rebalancing run this turn produced. Backend adds this to chat history;
   *  absent until that ships (frontend degrades gracefully). */
  ideal_allocation_rebalancing_id?: string | null;
  /** The ideal-allocation snapshot this turn produced, if any. */
  ideal_allocation_snapshot_id?: string | null;
}
```

- [ ] **Step 2: Import the helper in `AIChatPanel.tsx`**

Add near the other `@/lib` imports (e.g. below the `@/lib/api` import block):

```ts
import { deriveRebalancingPills } from "@/lib/rebalancing-pills";
```

- [ ] **Step 3: Rewrite `rehydrateRebalancingPill`**

Replace the existing comment **and** callback at `src/components/chat/AIChatPanel.tsx:1044-1069` (i.e. delete the old `// On returning to chat, history rehydrates ...` comment block too, so it isn't left stale above the new one) with:

```ts
  // On returning to chat, history rehydrates without the pill flags. Re-derive
  // them from each message's OWN persisted run (deriveRebalancingPills), so a
  // newer unsaved plan never inherits an older plan's "Saved". `perMessage` is
  // index-aligned to `history`, and `messages` was just set 1:1 from the same
  // `session.messages` at both call sites (1230, 1360), so mapping by index is safe.
  const rehydrateRebalancingPill = useCallback(async (history: ChatMessageInfo[]) => {
    const current = await getCurrentRebalancingRun().catch(() => null);
    const { perMessage, savedRunIds } = deriveRebalancingPills(history, current);
    setMessages((prev) =>
      prev.map((m, i) => {
        const pill = perMessage[i];
        if (!pill || !pill.showViewExecutePlan) return m;
        return {
          ...m,
          showViewExecutePlan: true,
          ...(pill.rebalancingRunId ? { rebalancingRunId: pill.rebalancingRunId } : {}),
        };
      }),
    );
    if (savedRunIds.length > 0) {
      setSavedRunIds((prev) => {
        const next = new Set(prev);
        savedRunIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, []);
```

- [ ] **Step 4: Verify tests, lint, and typecheck**

Run: `npx vitest run src/lib/rebalancing-pills.test.ts`
Expected: PASS (unchanged).

Run: `npm run lint`
Expected: no new errors in `AIChatPanel.tsx` / `api.ts`.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 0 errors (no TS errors for the new fields / import).

- [ ] **Step 5: Manual preview check (false-"Saved" fix)**

Start the preview (dev server name `frontend`, port 8080). In chat, produce a rebalancing plan, save it, then ask for a *new* change so a second plan pill appears. Reload the page. Expected: the newest plan's pill shows **"Save plan"** (not a false "Saved"); the previously-saved plan's pill shows "Saved". Nothing is saved merely by viewing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api.ts src/components/chat/AIChatPanel.tsx
git commit -m "fix: attribute chat rebalancing 'Saved' to the message's own run"
```

---

### Task 3: `RebalancePlanModal` component

**Files:**
- Create: `src/components/chat/RebalancePlanModal.tsx`
- Test: `src/components/chat/RebalancePlanModal.test.tsx`

**Interfaces:**
- Consumes: `getRebalancingRunDetail`, `RebalancingRunDetail` from `@/lib/api`; `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` from `@/components/ui/dialog`.
- Produces:
  - `interface RebalancePlanModalProps { runId: string; onClose: () => void; isSaved: boolean; isSaving: boolean; onSave: () => void }`
  - `function RebalancePlanModal(props: RebalancePlanModalProps): JSX.Element`  (self-manages a single always-open Dialog; parent mounts it only while a plan is being viewed)

- [ ] **Step 1: Write the failing test**

Create `src/components/chat/RebalancePlanModal.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Radix Dialog touches a couple of DOM APIs jsdom lacks.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock("@/lib/api", () => ({ getRebalancingRunDetail: vi.fn() }));
import { getRebalancingRunDetail } from "@/lib/api";
import { RebalancePlanModal } from "./RebalancePlanModal";

const detail = {
  id: "run-1",
  origin: null,
  trades: [
    { id: "t1", recommended_fund: "Acme Bluechip", action: "BUY", amount_inr: 5000, reason_title: "Top up to target" },
    { id: "t2", recommended_fund: "Old Fund", action: "SELL", amount_inr: 3000, reason_title: "Trim back to target" },
    { id: "t3", recommended_fund: "Exited Fund", action: "EXIT", amount_inr: 2000, reason_title: "Not on recommended list" },
  ],
  totals: { total_buy_inr: 5000, total_sell_inr: 5000, net_cash_flow_inr: 0, total_tax_estimate_inr: 100 },
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const noop = () => {};

describe("RebalancePlanModal", () => {
  it("fetches the given runId and renders its trades", async () => {
    (getRebalancingRunDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    render(<RebalancePlanModal runId="run-1" onClose={noop} isSaved={false} isSaving={false} onSave={noop} />);
    await waitFor(() => expect(getRebalancingRunDetail).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText("Acme Bluechip")).toBeInTheDocument();
    expect(screen.getByText("Old Fund")).toBeInTheDocument();
  });

  it("renders an EXIT trade as a SELL with a negative amount", async () => {
    (getRebalancingRunDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    render(<RebalancePlanModal runId="run-1" onClose={noop} isSaved={false} isSaving={false} onSave={noop} />);
    expect(await screen.findByText("Exited Fund")).toBeInTheDocument();
    // EXIT collapses to a SELL badge and a signed-negative amount (unique to this row).
    expect(screen.getByText("−₹2,000")).toBeInTheDocument();
  });

  it("hides the cost strip when totals is null without crashing", async () => {
    (getRebalancingRunDetail as ReturnType<typeof vi.fn>).mockResolvedValue({ ...detail, totals: null });
    render(<RebalancePlanModal runId="run-2" onClose={noop} isSaved={false} isSaving={false} onSave={noop} />);
    expect(await screen.findByText("Acme Bluechip")).toBeInTheDocument();
    expect(screen.queryByText("Total buy")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/RebalancePlanModal.test.tsx`
Expected: FAIL — cannot resolve `./RebalancePlanModal`.

- [ ] **Step 3: Write the component**

Create `src/components/chat/RebalancePlanModal.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Bookmark, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRebalancingRunDetail, type RebalancingRunDetail } from "@/lib/api";

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const BUY_GREEN = "#2E9C7E";
const SELL_ORANGE = "#E0772F";

const SAVED_STYLE = {
  backgroundColor: "rgba(212,168,104,0.15)",
  color: "#9A7B2E",
  border: "1px solid rgba(212,168,104,0.4)",
} as const;
const GOLD_STYLE = {
  background: "linear-gradient(135deg, #E5C079 0%, #D4A868 100%)",
  color: "#3a2c0e",
  boxShadow: "0 2px 8px -3px rgba(212,168,104,0.7)",
} as const;

export interface RebalancePlanModalProps {
  runId: string;
  onClose: () => void;
  isSaved: boolean;
  isSaving: boolean;
  onSave: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; detail: RebalancingRunDetail };

export function RebalancePlanModal({
  runId,
  onClose,
  isSaved,
  isSaving,
  onSave,
}: RebalancePlanModalProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getRebalancingRunDetail(runId)
      .then((detail) => {
        if (!cancelled) setState({ status: "loaded", detail });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [runId, reloadKey]);

  const saved = state.status === "loaded" && state.detail.origin === "saved";

  // Mounted only while a plan is being viewed, so the Dialog is always open;
  // Escape / overlay-click / the X trigger onOpenChange(false) → onClose().
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Your rebalancing plan
            {saved ? (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={SAVED_STYLE}>
                Saved plan
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Review the proposed trades and cost summary for this plan.
          </DialogDescription>
        </DialogHeader>

        {state.status === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your plan…
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <p>Couldn't load this plan.</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/40"
            >
              Try again
            </button>
          </div>
        ) : (
          <PlanBody detail={state.detail} />
        )}

        <DialogFooter>
          <button
            type="button"
            disabled={isSaved || isSaving}
            onClick={onSave}
            className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold transition-all disabled:cursor-default"
            style={isSaved ? SAVED_STYLE : GOLD_STYLE}
          >
            {isSaved ? (
              <Check className="h-4 w-4" />
            ) : isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
            {isSaved ? "Saved" : isSaving ? "Saving…" : "Save this plan"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanBody({ detail }: { detail: RebalancingRunDetail }) {
  if (detail.trades.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        This plan has no trades — your portfolio is already on target.
      </p>
    );
  }

  const groups = new Map<string, RebalancingRunDetail["trades"]>();
  for (const t of detail.trades) {
    const key = t.reason_title || "Other";
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  const totals = detail.totals;

  return (
    <div className="max-h-[60vh] space-y-4 overflow-y-auto">
      {totals ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/30 p-3 text-[12px]">
          <Stat label="Total buy" value={fmtINR(totals.total_buy_inr)} />
          <Stat label="Total sell" value={fmtINR(totals.total_sell_inr)} />
          <Stat label="Net cash" value={fmtINR(totals.net_cash_flow_inr)} />
          <Stat label="Est. tax" value={fmtINR(totals.total_tax_estimate_inr)} />
        </div>
      ) : null}

      <div className="space-y-4">
        {[...groups.entries()].map(([reason, trades]) => (
          <div key={reason}>
            <p className="pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {reason}
            </p>
            <div className="space-y-1.5">
              {trades.map((t) => {
                const isSell = t.action !== "BUY"; // SELL or EXIT
                const tone = isSell ? SELL_ORANGE : BUY_GREEN;
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <span
                      className="w-11 shrink-0 rounded-md py-1 text-center text-[11px] font-bold tracking-wide"
                      style={{ backgroundColor: `${tone}1f`, color: tone }}
                    >
                      {isSell ? "SELL" : "BUY"}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                      {t.recommended_fund}
                    </p>
                    <p className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: tone }}>
                      {isSell ? "−" : "+"}
                      {fmtINR(t.amount_inr)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/chat/RebalancePlanModal.test.tsx`
Expected: PASS (3 tests). If a jsdom API is still missing (Radix), add the missing method as a one-line polyfill beside the two at the top of the test file.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/RebalancePlanModal.tsx src/components/chat/RebalancePlanModal.test.tsx
git commit -m "feat: RebalancePlanModal showing a run's trades + cost summary"
```

---

### Task 4: Wire "View plan" to the modal (with snapshot-only fallback)

**Files:**
- Modify: `src/components/chat/AIChatPanel.tsx` (add import + modal open state; branch the View `onClick` at ~1975; mount the modal near the component's JSX root)

**Interfaces:**
- Consumes: `RebalancePlanModal` (Task 3); existing `savedRunIds`, `savingRunId`, `handleSavePlan`, `navigate`.
- Produces: none.

> No unit test wraps this wiring; verification is typecheck + lint + a preview walkthrough. The modal's own behavior is covered by Task 3.

- [ ] **Step 1: Import the modal**

Add beside the other `@/components/chat` imports in `AIChatPanel.tsx`:

```ts
import { RebalancePlanModal } from "@/components/chat/RebalancePlanModal";
```

- [ ] **Step 2: Add modal open state**

Just after the saved-run state (`AIChatPanel.tsx:1029`, `const [savedRunIds, ...]`):

```ts
  // The rebalancing run whose plan the View-plan modal is showing (null = closed).
  const [planModalRunId, setPlanModalRunId] = useState<string | null>(null);
```

- [ ] **Step 3: Branch the View-plan onClick**

Replace the View button's handler at `AIChatPanel.tsx:1975`:

```tsx
                      onClick={() => navigate("/invest/rebalance-explanation")}
```

with (open the modal when this message has its own run; otherwise keep today's navigation for snapshot-only turns):

```tsx
                      onClick={() =>
                        msg.rebalancingRunId
                          ? setPlanModalRunId(msg.rebalancingRunId)
                          : navigate("/invest/rebalance-explanation")
                      }
```

- [ ] **Step 4: Mount the modal once**

Render it once, controlled by `planModalRunId`. Place it just before the component's outermost closing wrapper (co-located with other top-level overlays/sheets in the panel's return). Mounting only while a plan is open keeps `runId` a real string; the trade-off is the Dialog's close animation is skipped (acceptable for this fix). Use this exact block:

```tsx
      {planModalRunId ? (
        <RebalancePlanModal
          runId={planModalRunId}
          onClose={() => setPlanModalRunId(null)}
          isSaved={savedRunIds.has(planModalRunId)}
          isSaving={savingRunId === planModalRunId}
          onSave={() => void handleSavePlan(planModalRunId)}
        />
      ) : null}
```

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint`
Expected: no new errors.

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: 0 errors.

- [ ] **Step 6: Preview walkthrough**

Start the `frontend` preview (port 8080). Verify:
1. Ask chat for a portfolio change → a plan appears. Tap **View plan** → the modal opens showing that plan's trades + cost strip; the URL does **not** change to `/invest/rebalance-explanation`.
2. Tap **Save this plan** in the modal footer → it shows "Saving…" then "Saved"; the chat pill's Save button also reflects "Saved" (shared state). Reopen the modal → header shows the "Saved plan" badge.
3. Close and reopen the modal → it refetches and renders without error.
4. (Regression) The Save pill on the message still works independently.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/AIChatPanel.tsx
git commit -m "feat: open the rebalancing plan modal from the chat View plan pill"
```

---

## Self-Review (completed against the spec)

**1. Spec coverage:**
- Contract change (spec §A) → Task 2 Step 1 (frontend type); backend field noted in Global Constraints as out-of-repo.
- Per-message anchoring + correct "Saved" attribution (spec §B) → Task 1 (pure logic) + Task 2 (rehydrate rewrite).
- View plan → modal on the Dialog primitive, trades + cost strip, null-totals guard, loading/error/empty, scroll cap, saved badge, a11y description, footer save (spec §C) → Task 3.
- Snapshot-only fallback to navigation (spec Goals) → Task 4 Step 3 branch.
- Graceful degradation, no false "Saved" in the interim (spec §D) → Task 1 interim-fallback tests + Task 2.
- Tests (spec Testing) → Task 1 unit tests + Task 3 RTL smoke tests (incl. the EXIT→SELL branch).
- No touch to RebalanceExplanation.tsx (spec Non-goals) → honored; no task modifies it.

**2. Placeholder scan:** none — every code and command step is concrete.

**3. Type consistency:** `deriveRebalancingPills(history, current)` returns `{ perMessage, savedRunIds }`, destructured identically in Task 2; `RebalancePlanModalProps { runId; onClose; isSaved; isSaving; onSave }` matches the mount site in Task 4; `getRebalancingRunDetail(runId: string)` and `RebalancingRunDetail.totals: RebalancingTotals | null` match Task 3's usage and null guard.

## Applied from the plan audit (craft pass)

- Interfaces in `rebalancing-pills.ts` kept module-local (only `deriveRebalancingPills` exported) — no unused public surface.
- Task 2 Step 3 replace range widened to `1044-1069` so the old rehydrate comment isn't left stale.
- Typecheck gate switched from `npm run build` (SWC, no typecheck) to `npx tsc --noEmit -p tsconfig.app.json`.
- Modal gains a `DialogDescription` (matches `ReportIssueDialog`, satisfies Radix a11y, silences the console warning).
- Modal contract simplified to `onClose` (removed the always-true `open` expression); close-animation trade-off noted.
- Test: dropped the redundant `@vitest-environment jsdom` pragma (jsdom is global), switched to jest-dom matchers (`toBeInTheDocument`), and added an EXIT-trade case for the one non-obvious branch.
