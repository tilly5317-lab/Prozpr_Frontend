import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Coins, Pencil, ChevronRight, Check, ArrowRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  getMyLumpSumPlan,
  createLumpSumPlan,
  getRebalancingRunDetail,
  listRebalancingRuns,
  type LumpSumAction,
  type RebalancingSubgroupSummary,
  type SipPlanResponse,
} from "@/lib/api";
import { CurrentVsTargetChart } from "@/components/invest/CurrentVsTargetChart";
import { buildSipTargetRows, type DriftRow } from "@/lib/driftRows";
import { formatInr0, formatMoneyInput } from "@/lib/utils";

/** Shown when the fetch fails or returns nothing — renders the set-up prompt. */
const EMPTY_PLAN: SipPlanResponse = {
  has_plan: false,
  run_id: null,
  created_at: null,
  monthly_amount_inr: 0,
  monthly_deployed_inr: 0,
  monthly_undeployed_inr: 0,
  target_bucket: null,
  fund_count: 0,
  buys: [],
  goal_plan_monthly_investment_inr: null,
  goal_plan_in_sync: true,
};

/** Plain-English horizon the plan leans toward (never surface the raw label). */
const BUCKET_LABEL: Record<NonNullable<SipPlanResponse["target_bucket"]>, string> = {
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
 * One-time lump-sum plan — add (deploy fresh money) or withdraw (redeem holdings
 * to raise cash). Renders the amount + each fund's slice, or an inline set-up
 * form that calls the engine directly (``createLumpSumPlan``). Mirrors the SIP
 * tab, but the amount is a single one-time transaction.
 */
function LumpSumCard({
  plan,
  action,
  onCreated,
  driftRows,
}: {
  plan: SipPlanResponse;
  action: LumpSumAction;
  onCreated: (p: SipPlanResponse) => void;
  driftRows: DriftRow[];
}) {
  const navigate = useNavigate();
  const isWithdraw = action === "withdraw";
  const hasPlan = plan.has_plan && plan.buys.length > 0;
  const [editing, setEditing] = useState(!hasPlan);
  const [amount, setAmount] = useState(hasPlan ? toInput(plan.monthly_amount_inr) : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount.replace(/,/g, ""));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const p = await createLumpSumPlan(parsed, action);
      onCreated(p);
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Couldn't set up your ${isWithdraw ? "withdrawal" : "lump sum"}. Please try again.`,
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
            {isWithdraw
              ? hasPlan
                ? "Adjust your withdrawal"
                : "Withdraw funds"
              : hasPlan
                ? "Adjust your lump sum"
                : "Invest a lump sum"}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {isWithdraw
            ? "How much do you want to withdraw? Pi picks which holdings to redeem to raise it tax-efficiently."
            : "How much do you want to invest as a one-time lump sum? Pi splits it across the right funds for your goals."}
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
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {isWithdraw ? "to withdraw" : "one-time"}
            </span>
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
              {submitting
                ? "Building your plan…"
                : isWithdraw
                  ? hasPlan
                    ? "Update withdrawal"
                    : "Plan withdrawal"
                  : hasPlan
                    ? "Update lump sum"
                    : "Plan lump sum"}
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
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isWithdraw ? "Your withdrawal" : "Your lump sum"}
          </p>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-2xl font-bold text-foreground">
            {formatInr0(plan.monthly_amount_inr)}
            <span className="ml-1 text-[12px] font-medium text-muted-foreground">
              {isWithdraw ? "withdrawal" : "one-time"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setAmount(toInput(plan.monthly_amount_inr));
              setEditing(true);
            }}
            aria-label={isWithdraw ? "Edit withdrawal amount" : "Edit lump sum amount"}
            className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
        {bucketLabel && !isWithdraw && (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{bucketLabel}</p>
        )}
      </div>

      {/* Proposed Target — only for deployments (a target allocation is meaningless
          when withdrawing). */}
      {!isWithdraw && driftRows.length > 0 && (
        <div className="mb-3">
          <CurrentVsTargetChart rows={driftRows} bars={["target"]} title="Proposed Target" />
        </div>
      )}

      {/* Funds card — each row opens that fund's detail page */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {isWithdraw ? "Redeem from these funds" : "Suggested funds"}
          </p>
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
                  {isWithdraw ? "−" : ""}
                  {formatInr0(b.monthly_amount_inr)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>

        {/* Remainder — only when a material amount couldn't be placed / raised */}
        {plan.monthly_undeployed_inr > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {formatInr0(plan.monthly_undeployed_inr)}{" "}
            {isWithdraw
              ? "couldn't be raised — not enough eligible holdings to redeem."
              : "isn't placed yet — per-fund caps or a shortage of eligible funds left a remainder."}
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Lump-sum planner — the "Lump sum" tab of the Invest section (`/invest/lumpsum`).
 * Toggle Add / Withdraw, enter a one-time amount → the additional-investment
 * engine runs (cadence=lumpsum) → funds appear. Toggle at top switches sections.
 */
const LumpSumPlanner = () => {
  const [plan, setPlan] = useState<SipPlanResponse | null>(null);
  // Which action produced the current `plan` — so toggling to the other action
  // shows its set-up form instead of mislabelling the existing plan.
  const [planAction, setPlanAction] = useState<LumpSumAction>("add");
  const [action, setAction] = useState<LumpSumAction>("add");
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [subgroupSummaries, setSubgroupSummaries] = useState<RebalancingSubgroupSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    getMyLumpSumPlan()
      .then((p) => !cancelled && setPlan(p))
      .catch(() => !cancelled && setPlan(EMPTY_PLAN));
    return () => {
      cancelled = true;
    };
  }, []);

  // Backend asset_subgroup → asset_class map (from the latest rebalancing run)
  // used only to classify the lump sum's own buys for the Proposed Target chart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const run = (await listRebalancingRuns())[0];
        if (!run) return;
        const detail = await getRebalancingRunDetail(run.id);
        if (!cancelled) setSubgroupSummaries(detail.subgroup_summaries ?? []);
      } catch {
        /* no run — the chart just stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreated = (p: SipPlanResponse) => {
    setPlan(p);
    setPlanAction(action);
    setAccepted(false);
  };

  // Only show the fetched/created plan under the action that produced it.
  const shownPlan = plan && planAction === action ? plan : EMPTY_PLAN;
  const hasPlan = shownPlan.has_plan && shownPlan.buys.length > 0;
  const driftRows = useMemo(
    () => (action === "add" ? buildSipTargetRows(shownPlan.buys, subgroupSummaries) : []),
    [action, shownPlan, subgroupSummaries],
  );

  const acceptLumpSum = async () => {
    if (accepting || shownPlan.monthly_amount_inr <= 0) return;
    setAccepting(true);
    try {
      const p = await createLumpSumPlan(shownPlan.monthly_amount_inr, action);
      setPlan(p);
      setPlanAction(action);
      setAccepted(true);
    } catch {
      /* leave the button idle so the user can retry */
    } finally {
      setAccepting(false);
    }
  };

  const isWithdraw = action === "withdraw";

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      <div className="px-5 pt-2">
        {/* Add / Withdraw toggle */}
        <div className="mb-3 flex rounded-full border border-border bg-card p-0.5">
          {(["add", "withdraw"] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setAction(a);
                setAccepted(false);
              }}
              className={`flex-1 rounded-full py-1.5 text-[12px] font-semibold transition-colors ${
                action === a ? "bg-foreground text-background" : "text-muted-foreground"
              }`}
            >
              {a === "add" ? "Add funds" : "Withdraw funds"}
            </button>
          ))}
        </div>

        <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
          {isWithdraw
            ? "Take money out in one go. Enter an amount and Pi's engine picks which holdings to redeem — tax-efficiently, the same plan you'd get in chat."
            : "Deploy a one-time lump sum. Enter an amount and Pi's engine splits it across the right funds for your goals — the same plan you'd get in chat."}
        </p>

        {plan ? (
          <LumpSumCard
            key={action}
            plan={shownPlan}
            action={action}
            onCreated={handleCreated}
            driftRows={driftRows}
          />
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
            {accepted
              ? isWithdraw
                ? "Withdrawal accepted"
                : "Lump sum accepted"
              : accepting
                ? "Accepting…"
                : isWithdraw
                  ? "Accept withdrawal"
                  : "Accept lump sum"}
            {!accepted && !accepting && <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default LumpSumPlanner;
