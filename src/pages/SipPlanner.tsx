import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Repeat, Target, Check, Pencil, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { getMySipPlan, createSipPlan, updatePersonalFinance, type SipPlanResponse } from "@/lib/api";
import { formatInr0, formatMoneyInput } from "@/lib/utils";

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

/**
 * Monthly SIP plan — the additional-investment engine's `sip_monthly` output.
 * Renders the per-month total + each fund's slice, or an inline set-up form that
 * calls the engine directly (`createSipPlan`) when no plan exists / when adjusting.
 * Amount + suggested funds render as two separate cards; each fund row opens
 * that fund's detail page.
 */
function SipPlanCard({
  sip,
  onCreated,
}: {
  sip: SipPlanResponse;
  onCreated: (plan: SipPlanResponse) => void;
}) {
  const navigate = useNavigate();
  const hasPlan = sip.has_plan && sip.buys.length > 0;
  const [editing, setEditing] = useState(!hasPlan);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount.replace(/,/g, ""));
  const valid = Number.isFinite(parsed) && parsed > 0;

  const openEdit = () => {
    setAmount(hasPlan ? formatMoneyInput(String(Math.round(sip.monthly_amount_inr))) : "");
    setError(null);
    setEditing(true);
  };

  const submit = async () => {
    if (!valid || submitting) return;
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
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {hasPlan ? "Adjust your monthly SIP" : "Start a monthly SIP"}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          How much do you want to invest each month? Pi splits it across the right funds for your goals.
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
              placeholder="25,000"
              disabled={submitting}
              className="w-full bg-transparent px-2 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <span className="shrink-0 text-[11px] text-muted-foreground">/ month</span>
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

  return (
    <>
      {/* Amount card — the Edit control sits to the RIGHT of the amount */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5 text-[hsl(var(--wealth-navy))]" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Your monthly SIP</p>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-2xl font-bold text-foreground">
            {formatInr0(sip.monthly_amount_inr)}
            <span className="ml-1 text-[12px] font-medium text-muted-foreground">/ month</span>
          </p>
          <button
            type="button"
            onClick={openEdit}
            aria-label="Edit SIP amount"
            className="flex shrink-0 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
        {bucketLabel && (
          <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">{bucketLabel}</p>
        )}
      </div>

      {/* Suggested funds card — each row opens that fund's detail page */}
      <div className="mb-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Suggested funds</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
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
                <p className="truncate text-[10px] text-muted-foreground">{b.sub_category}</p>
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
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            {formatInr0(sip.monthly_undeployed_inr)}/mo isn&apos;t placed yet — per-fund caps or a shortage of eligible funds left a remainder.
          </p>
        )}
      </div>
    </>
  );
}

/**
 * After a SIP is set up / adjusted, if the goal-planning SIP
 * (starting_monthly_investment) differs from this SIP, offer to sync the two.
 * Confirming writes the new amount via PUT /profile/personal-finance — the
 * single field the cashflow / goal-planning engine reads everywhere.
 */
function GoalPlanNudge({ sip, onSynced }: { sip: SipPlanResponse; onSynced: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = sip.monthly_amount_inr;
  const current = sip.goal_plan_monthly_investment_inr;

  // Show the popup while the goal plan is out of sync, or briefly on success.
  const outOfSync = sip.has_plan && !sip.goal_plan_in_sync;
  if (hidden || (!outOfSync && !done)) return null;

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      await updatePersonalFinance({ starting_monthly_investment: target });
      setDone(true);
      onSynced();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update your goal plan. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Centered modal popup over the page (backdrop click / "Not now" dismisses).
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-6 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={() => { if (!busy) setHidden(true); }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[#D4A868]/30 bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#0f8a5f]/15 text-[#0f8a5f]">
              <Check className="h-5 w-5" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">Goal plan updated</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
              Your plan now invests <b className="text-foreground">{formatInr0(target)}/month</b> toward your goals.
            </p>
            <button
              type="button"
              onClick={() => setHidden(true)}
              className="mt-4 w-full rounded-full px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#D4A868]/15 text-[#B07E22] dark:text-[#D4A868]">
              <Target className="h-5 w-5" />
            </span>
            <p className="text-[15px] font-semibold text-foreground">Update your goal plan?</p>
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
              {current != null && current > 0 ? (
                <>Your goal plan invests <b className="text-foreground">{formatInr0(current)}/month</b>. Update it to <b className="text-foreground">{formatInr0(target)}/month</b> so your goals reflect this SIP.</>
              ) : (
                <>Your goal plan has no monthly SIP set. Add <b className="text-foreground">{formatInr0(target)}/month</b> so your goals reflect this SIP.</>
              )}
            </p>
            {error && <p className="mt-2 text-[12px] leading-snug text-[#C24C3A]">{error}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={sync}
                disabled={busy}
                className="flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? "Updating…" : "Update goal plan"}
              </button>
              <button
                type="button"
                onClick={() => setHidden(true)}
                disabled={busy}
                className="w-full rounded-full border border-border px-4 py-2.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
              >
                Not now
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * SIP planner — the "SIP" tab of the Invest section (`/invest/sip`). Set a
 * monthly amount → the additional-investment engine runs → recommended funds
 * appear → offer to sync the goal plan. Toggle at top switches to Rebalancing.
 */
const SipPlanner = () => {
  const [sip, setSip] = useState<SipPlanResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMySipPlan()
      .then((s) => !cancelled && setSip(s))
      .catch(() => !cancelled && setSip(EMPTY_SIP));
    return () => { cancelled = true; };
  }, []);

  // Re-pull the SIP plan after a goal-plan sync so goal_plan_in_sync refreshes.
  const refetchSip = () => {
    getMySipPlan().then(setSip).catch(() => setSip(EMPTY_SIP));
  };

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      <div className="px-5 pt-2">
        <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
          Deploy fresh money every month. Enter an amount and Pi&apos;s engine splits it
          across the right funds for your goals — the same plan you&apos;d get in chat.
        </p>
        {sip ? (
          <>
            <SipPlanCard sip={sip} onCreated={setSip} />
            <GoalPlanNudge sip={sip} onSynced={refetchSip} />
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 pt-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading your SIP…</span>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default SipPlanner;
