import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Coins, Pencil, ChevronRight, Check, ArrowRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  getMyLumpSumPlan,
  createLumpSumPlan,
  EMPTY_LUMPSUM_PLAN,
  type LumpSumPlanResponse,
} from "@/lib/api";
import { CurrentVsTargetChart } from "@/components/invest/CurrentVsTargetChart";
import { buildLumpSumTargetRows } from "@/lib/driftRows";
import { formatInr0, formatMoneyInput } from "@/lib/utils";

/** Plain-English horizon the plan leans toward (never surface the raw label). */
const BUCKET_LABEL: Record<NonNullable<LumpSumPlanResponse["target_bucket"]>, string> = {
  short_term: "Weighted toward your short-term goals",
  medium_term: "Weighted toward your medium-term goals",
  long_term: "Building your long-term growth",
};

/** Fund/scheme name tidy-up for display. */
function plainName(raw: string): string {
  return (
    raw
      .replace(/\s*·\s*Folio.*$/i, "")
      .replace(/\s*[-–]\s*(Direct|Regular)\s+Plan\b.*$/i, "")
      .replace(/\s+Growth(?:\s+Option)?$/i, "")
      .trim() || raw
  );
}

/** Rupee amount → the grouped string the amount input expects. */
const toInput = (inr: number) => formatMoneyInput(String(Math.round(inr)));

/**
 * One-time lump-sum plan (Add). Renders the amount, the proposed asset-class
 * split, and each fund's slice — or an inline set-up form that calls the engine
 * directly (``createLumpSumPlan``, cadence=lumpsum).
 */
function LumpSumCard({
  plan,
  onCreated,
}: {
  plan: LumpSumPlanResponse;
  onCreated: (p: LumpSumPlanResponse) => void;
}) {
  const navigate = useNavigate();
  const hasPlan = plan.has_plan && plan.buys.length > 0;
  const [editing, setEditing] = useState(!hasPlan);
  const [amount, setAmount] = useState(hasPlan ? toInput(plan.amount_inr) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Proposed Equity / Debt / Others split of the suggested funds.
  const splitRows = useMemo(() => buildLumpSumTargetRows(plan.alignment_rows), [plan.alignment_rows]);

  const parsed = Number(amount.replace(/,/g, ""));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const p = await createLumpSumPlan(parsed, "add");
      onCreated(p);
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn't set up your lump sum. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Set-up / adjust form ──
  if (editing) {
    return (
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-[hsl(var(--wealth-navy))]" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {hasPlan ? "Adjust your lump sum" : "Invest a lump sum"}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          How much do you want to invest as a one-time lump sum? Pi splits it across the right funds
          for your goals.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mt-3 flex items-center rounded-xl border border-border bg-background px-3">
            <span className="text-sm font-medium text-muted-foreground">₹</span>
            <input
              autoFocus
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
              placeholder="5,00,000"
              disabled={submitting}
              className="w-full bg-transparent px-2 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <span className="shrink-0 text-[11px] text-muted-foreground">one-time</span>
          </div>

          {error && <p className="mt-2 text-[11px] leading-snug text-[#C24C3A]">{error}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={!valid || submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Building your plan…" : hasPlan ? "Update lump sum" : "Plan lump sum"}
            </button>
            {hasPlan && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={submitting}
                className="rounded-full border border-border px-4 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  // ── Existing plan ──
  const bucketLabel = plan.target_bucket ? BUCKET_LABEL[plan.target_bucket] : null;

  return (
    <>
      {/* Amount card — the Edit control sits to the RIGHT of the amount */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5">
          <Coins className="h-3.5 w-3.5 text-[hsl(var(--wealth-navy))]" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your lump sum</p>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-2xl font-bold text-foreground">
            {formatInr0(plan.amount_inr)}
            <span className="ml-1 text-[12px] font-medium text-muted-foreground">one-time</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setAmount(toInput(plan.amount_inr));
              setEditing(true);
            }}
            aria-label="Edit lump sum amount"
            className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
        {bucketLabel && <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{bucketLabel}</p>}
      </div>

      {/* Proposed Split — the Equity / Debt / Others split of the suggested funds. */}
      {splitRows.length > 0 && (
        <div className="mb-3">
          <CurrentVsTargetChart rows={splitRows} bars={["target"]} title="Proposed Split" />
        </div>
      )}

      {/* Funds card — each row opens that fund's detail page */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Suggested funds</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {plan.fund_count} fund{plan.fund_count === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-2.5 space-y-1.5">
          {plan.buys.map((b) => (
            <button
              key={`${b.recommended_fund}-${b.asset_subgroup}`}
              type="button"
              onClick={() => navigate(`/discovery/mf/${encodeURIComponent(b.scheme_code)}`)}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-foreground">{plainName(b.recommended_fund)}</p>
                <p className="truncate text-[11px] text-muted-foreground">{b.sub_category}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[12px] font-semibold tabular-nums text-foreground">
                  {formatInr0(b.amount_inr)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>

        {/* Remainder — only when a material amount couldn't be placed */}
        {plan.undeployed_inr > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {formatInr0(plan.undeployed_inr)} isn't placed yet — per-fund caps or a shortage of
            eligible funds left a remainder.
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Lump-sum planner — the "Lump sum" tab of the Invest section (`/invest/lumpsum`).
 * Enter a one-time amount → the additional-investment engine runs
 * (cadence=lumpsum) → the proposed asset-class split + funds appear. Withdraw is
 * not yet supported (the engine is BUY-only) — its toggle shows "Coming soon".
 */
const LumpSumPlanner = () => {
  const [plan, setPlan] = useState<LumpSumPlanResponse | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyLumpSumPlan()
      .then((p) => !cancelled && setPlan(p))
      .catch(() => !cancelled && setPlan(EMPTY_LUMPSUM_PLAN));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreated = (p: LumpSumPlanResponse) => {
    setPlan(p);
    setAccepted(false);
  };

  const shownPlan = plan ?? EMPTY_LUMPSUM_PLAN;
  const hasPlan = shownPlan.has_plan && shownPlan.buys.length > 0;

  const acceptLumpSum = async () => {
    if (accepting || shownPlan.amount_inr <= 0) return;
    setAccepting(true);
    try {
      const p = await createLumpSumPlan(shownPlan.amount_inr, "add");
      setPlan(p);
      setAccepted(true);
    } catch {
      /* leave the button idle so the user can retry */
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      <div className="px-5 pt-2">
        {/* Add / Withdraw toggle — Withdraw is not yet supported (engine is BUY-only). */}
        <div className="mb-3 flex rounded-full border border-border bg-card p-0.5">
          <button
            type="button"
            className="flex-1 rounded-full bg-foreground py-1.5 text-[12px] font-semibold text-background"
          >
            Add funds
          </button>
          <button
            type="button"
            disabled
            title="Withdrawals are coming soon"
            className="flex flex-1 items-center justify-center gap-1 rounded-full py-1.5 text-[12px] font-semibold text-muted-foreground/60"
          >
            Withdraw
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
              Coming soon
            </span>
          </button>
        </div>

        <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
          Deploy a one-time lump sum. Enter an amount and Pi's engine splits it across the right funds
          for your goals — the same plan you'd get in chat.
        </p>

        {plan ? (
          <LumpSumCard plan={shownPlan} onCreated={handleCreated} />
        ) : (
          <div className="flex items-center justify-center gap-2 pt-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {/* Bottom CTA — mirrors the rebalancing "Approve plan" button. */}
        {hasPlan && (
          <button
            type="button"
            onClick={() => void acceptLumpSum()}
            disabled={accepting || accepted}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : accepted ? <Check className="h-4 w-4" /> : null}
            {accepted ? "Lump sum accepted" : accepting ? "Accepting…" : "Accept lump sum"}
            {!accepted && !accepting && <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default LumpSumPlanner;
