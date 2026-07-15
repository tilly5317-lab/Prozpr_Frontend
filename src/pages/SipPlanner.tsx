import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Repeat, Pencil, ChevronRight, Check, ArrowRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  getMySipPlan,
  createSipPlan,
  getOnboardingProfile,
  getRebalancingRunDetail,
  listRebalancingRuns,
  type RebalancingSubgroupSummary,
  type SipPlanResponse,
} from "@/lib/api";
import { CurrentVsTargetChart } from "@/components/invest/CurrentVsTargetChart";
import { buildSipTargetRows, type DriftRow } from "@/lib/driftRows";
import { formatInr0, formatMoneyInput } from "@/lib/utils";
import { KycBanner, useFpStatus } from "@/components/invest/KycGate";

/** Shown when the SIP fetch fails or returns nothing — renders the set-up prompt. */
const EMPTY_SIP: SipPlanResponse = {
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

/** Plain-English horizon the SIP leans toward (never surface the raw label). */
const SIP_BUCKET_LABEL: Record<NonNullable<SipPlanResponse["target_bucket"]>, string> = {
  short_term: "Weighted toward your short-term goals",
  medium_term: "Weighted toward your medium-term goals",
  long_term: "Building your long-term growth",
};

/** Fund/scheme name tidy-up for display. */
function plainName(raw: string): string {
  return raw
    .replace(/\s*·\s*Folio.*$/i, "")
    .replace(/\s*[-–]\s*(Direct|Regular)\s+Plan\b.*$/i, "")
    .replace(/\s+Growth(?:\s+Option)?$/i, "")
    .trim() || raw;
}

/** Rupee amount → the grouped string the amount input expects. */
const toInput = (inr: number) => formatMoneyInput(String(Math.round(inr)));

/**
 * Monthly SIP plan — the additional-investment engine's `sip_monthly` output.
 * Renders the per-month total + each fund's slice, or an inline set-up form that
 * calls the engine directly (`createSipPlan`) when no plan exists / when adjusting.
 * Amount + suggested funds render as two separate cards; each fund row opens
 * that fund's detail page.
 *
 * Submitting also writes the canonical `starting_monthly_investment` (the backend
 * does it in the same transaction), so a SIP set here reaches the goal planner.
 */
function SipPlanCard({
  sip,
  onCreated,
  driftRows,
  monthlyIncome,
}: {
  sip: SipPlanResponse;
  onCreated: (plan: SipPlanResponse) => void;
  driftRows: DriftRow[];
  monthlyIncome: number | null;
}) {
  const navigate = useNavigate();
  const hasPlan = sip.has_plan && sip.buys.length > 0;
  // The canonical SIP the customer may have already set elsewhere (onboarding /
  // goal planner). With no plan yet we pre-fill the form with it rather than
  // asking for an amount they have already given us.
  const canonicalSip = sip.goal_plan_monthly_investment_inr;
  const [editing, setEditing] = useState(!hasPlan);
  const [amount, setAmount] = useState(
    !hasPlan && canonicalSip != null && canonicalSip > 0 ? toInput(canonicalSip) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount.replace(/,/g, ""));
  const valid = Number.isFinite(parsed) && parsed > 0;
  // Guard: a monthly SIP above 100% of monthly income can't be a savings rate —
  // block it client-side before hitting the API. Only enforced when we know the
  // income (otherwise the savings % is hidden and there is nothing to compare).
  const overIncome =
    valid && monthlyIncome != null && monthlyIncome > 0 && parsed > monthlyIncome;

  // The plan's split was computed for an amount the canonical SIP no longer
  // matches — it moved on another surface after this plan was built.
  const staleAmount =
    hasPlan && !sip.goal_plan_in_sync && canonicalSip != null && canonicalSip > 0
      ? canonicalSip
      : null;

  const openEdit = (prefill: number | null = null) => {
    setAmount(prefill != null ? toInput(prefill) : hasPlan ? toInput(sip.monthly_amount_inr) : "");
    setError(null);
    setEditing(true);
  };

  const submit = async () => {
    if (!valid || overIncome || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const plan = await createSipPlan(parsed);
      onCreated(plan);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set up your SIP. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Set-up / adjust form ──
  if (editing) {
    return (
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5 text-[hsl(var(--wealth-navy))]" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {hasPlan ? "Adjust your monthly SIP" : "Start a monthly SIP"}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          How much do you want to invest each month? Pi splits it across the right funds for your goals.
        </p>
        {!hasPlan && canonicalSip != null && canonicalSip > 0 && (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Pre-filled with the <b className="text-foreground">{formatInr0(canonicalSip)}/month</b> from your
            goal plan. Change it here and your goal plan updates too.
          </p>
        )}

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
              placeholder="25,000"
              disabled={submitting}
              className="w-full bg-transparent px-2 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <span className="shrink-0 text-[11px] text-muted-foreground">/ month</span>
          </div>

          {overIncome && monthlyIncome != null && (
            <p className="mt-2 text-[11px] leading-snug text-[#C24C3A]">
              That's more than your monthly income ({formatInr0(monthlyIncome)}). A monthly SIP can't
              be over 100% of what you earn — enter an amount you can save each month.
            </p>
          )}
          {error && <p className="mt-2 text-[11px] leading-snug text-[#C24C3A]">{error}</p>}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="submit"
              disabled={!valid || overIncome || submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitting ? "Building your plan…" : hasPlan ? "Update SIP" : "Set up SIP"}
            </button>
            {hasPlan && (
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null); }}
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
  const bucketLabel = sip.target_bucket ? SIP_BUCKET_LABEL[sip.target_bucket] : null;
  // What share of monthly income this SIP represents (savings rate).
  const savingsPct =
    monthlyIncome && monthlyIncome > 0
      ? Math.round((sip.monthly_amount_inr / monthlyIncome) * 100)
      : null;

  return (
    <>
      {/* Amount card — the Edit control sits to the RIGHT of the amount */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5 text-[hsl(var(--wealth-navy))]" />
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Your monthly SIP</p>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-2xl font-bold text-foreground">
            {formatInr0(sip.monthly_amount_inr)}
            <span className="ml-1 text-[12px] font-medium text-muted-foreground">/ month</span>
          </p>
          <button
            type="button"
            onClick={() => openEdit()}
            aria-label="Edit SIP amount"
            className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
        {savingsPct != null && (
          <p className="mt-1 text-[14px] font-semibold text-wealth-green">
            {savingsPct}% of savings
          </p>
        )}
        {bucketLabel && (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{bucketLabel}</p>
        )}

        {/* The canonical SIP changed elsewhere — these funds still split the old
            amount. One tap recomputes the plan at the canonical figure. */}
        {staleAmount != null && (
          <div className="mt-3 rounded-xl border border-[#D4A868]/40 bg-[#D4A868]/10 p-2.5">
            <p className="text-[11px] leading-snug text-foreground">
              Your goal plan now invests <b>{formatInr0(staleAmount)}/month</b>. These funds still split{" "}
              {formatInr0(sip.monthly_amount_inr)}/month.
            </p>
            <button
              type="button"
              onClick={() => openEdit(staleAmount)}
              className="mt-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
            >
              Update plan to {formatInr0(staleAmount)}
            </button>
          </div>
        )}
      </div>

      {/* Proposed Target — the SIP's recommended split across asset classes,
          right under the monthly SIP amount. */}
      {driftRows.length > 0 && (
        <div className="mb-3">
          <CurrentVsTargetChart rows={driftRows} bars={["target"]} title="Proposed Target" />
        </div>
      )}

      {/* Suggested funds card — each row opens that fund's detail page */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Suggested funds</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {sip.fund_count} fund{sip.fund_count === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-2.5 space-y-1.5">
          {sip.buys.map((b) => (
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
                  {formatInr0(b.monthly_amount_inr)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>

        {/* Undeployed remainder — only when a material amount couldn't be placed */}
        {sip.monthly_undeployed_inr > 0 && (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {formatInr0(sip.monthly_undeployed_inr)}/mo isn&apos;t placed yet — per-fund caps or a shortage of eligible funds left a remainder.
          </p>
        )}
      </div>
    </>
  );
}

/**
 * SIP planner — the "SIP" tab of the Invest section (`/invest/sip`). Set a
 * monthly amount → the additional-investment engine runs → recommended funds
 * appear. The amount IS the customer's canonical monthly SIP
 * (`starting_monthly_investment`): it pre-fills from whatever they set on any
 * other surface, and saving here updates the goal planner. Toggle at top
 * switches to Rebalancing.
 */
const SipPlanner = () => {
  const navigate = useNavigate();
  const [sip, setSip] = useState<SipPlanResponse | null>(null);
  const { loading: fpLoading, ready } = useFpStatus();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [subgroupSummaries, setSubgroupSummaries] = useState<RebalancingSubgroupSummary[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMySipPlan()
      .then((s) => !cancelled && setSip(s))
      .catch(() => !cancelled && setSip(EMPTY_SIP));
    return () => { cancelled = true; };
  }, []);

  const hasPlan = !!sip?.has_plan && (sip?.buys.length ?? 0) > 0;
  // Latest rebalancing run's subgroup summaries — used only as a backend
  // asset_subgroup → asset_class map to classify the SIP's own buys (the amounts
  // are the SIP's, not the rebalancing numbers). Read-only; empty if no run.
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

  // Monthly income → the SIP's savings rate (% of income).
  useEffect(() => {
    let cancelled = false;
    getOnboardingProfile()
      .then((p) => {
        if (!cancelled && p.annual_income != null && p.annual_income > 0) {
          setMonthlyIncome(p.annual_income / 12);
        }
      })
      .catch(() => { /* no income on file — the savings % just hides */ });
    return () => { cancelled = true; };
  }, []);

  // Editing the plan invalidates a prior acceptance.
  const handleCreated = (plan: SipPlanResponse) => {
    setSip(plan);
    setAccepted(false);
  };

  // The SIP's recommended allocation (Equity / Debt / Others), classified from
  // the backend subgroup map and summed from the SIP's own monthly buys.
  const driftRows = useMemo(
    () => buildSipTargetRows(sip?.buys ?? [], subgroupSummaries),
    [sip, subgroupSummaries],
  );
  // Accept the goal plan's newer figure when this plan drifted out of sync,
  // otherwise (re)commit the amount already shown.
  const newAmount =
    sip && !sip.goal_plan_in_sync && sip.goal_plan_monthly_investment_inr
      ? sip.goal_plan_monthly_investment_inr
      : sip?.monthly_amount_inr ?? 0;

  const acceptSip = async () => {
    if (!sip || accepting || newAmount <= 0) return;
    setAccepting(true);
    try {
      const plan = await createSipPlan(newAmount);
      setSip(plan);
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
        <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
          Deploy fresh money every month. Enter an amount and Pi&apos;s engine splits it
          across the right funds for your goals — the same plan you&apos;d get in chat.
        </p>
        <KycBanner hidden={fpLoading || ready} />
        {sip ? (
          <SipPlanCard
            sip={sip}
            onCreated={handleCreated}
            driftRows={driftRows}
            monthlyIncome={monthlyIncome}
          />
        ) : (
          <div className="flex items-center justify-center gap-2 pt-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading your SIP…</span>
          </div>
        )}

        {/* Bottom CTA — mirrors the rebalancing "Approve plan" button. */}
        {hasPlan && (
          <button
            type="button"
            onClick={() => void acceptSip()}
            disabled={accepting || accepted}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[15px] font-semibold tracking-wide text-background transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : accepted ? <Check className="h-4 w-4" /> : null}
            {accepted ? "SIP amount accepted" : accepting ? "Accepting…" : "Accept new SIP amount"}
            {!accepted && !accepting && <ArrowRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default SipPlanner;
