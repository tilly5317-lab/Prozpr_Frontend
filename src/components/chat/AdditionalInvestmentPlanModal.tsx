import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getMyLumpSumPlan,
  getMySipPlan,
  type LumpSumPlanResponse,
  type SipPlanResponse,
} from "@/lib/api";
import { plainName } from "@/lib/utils";

const fmtINR = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const BUY_GREEN = "#2E9C7E";

interface PlanRow {
  key: string;
  fund: string;
  subCategory: string;
  amount: number;
}
interface PlanView {
  amountLabel: string;
  fundCount: number;
  rows: PlanRow[];
  /** Per-row amount suffix — "/mo" for SIP, "" for a one-time lump sum. */
  rowSuffix: string;
  undeployed: number;
}

function sipView(p: SipPlanResponse): PlanView {
  return {
    amountLabel: `${fmtINR(p.monthly_amount_inr)} / month`,
    fundCount: p.fund_count,
    rows: p.buys.map((b) => ({
      key: `${b.scheme_code}-${b.asset_subgroup}`,
      fund: plainName(b.recommended_fund),
      subCategory: b.sub_category,
      amount: b.monthly_amount_inr,
    })),
    rowSuffix: "/mo",
    undeployed: p.monthly_undeployed_inr,
  };
}

function lumpView(p: LumpSumPlanResponse): PlanView {
  return {
    amountLabel: `${fmtINR(p.amount_inr)} one-time`,
    fundCount: p.fund_count,
    rows: p.buys.map((b) => ({
      key: `${b.scheme_code}-${b.asset_subgroup}`,
      fund: plainName(b.recommended_fund),
      subCategory: b.sub_category,
      amount: b.amount_inr,
    })),
    rowSuffix: "",
    undeployed: p.undeployed_inr,
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; view: PlanView };

/**
 * In-chat popup for an additional-investment plan — the SIP / lump-sum
 * counterpart to `RebalancePlanModal`. Read-only: additional investment is
 * BUY-only / write-once, so there is no "Save plan" footer. It reuses the same
 * latest-plan reads the Invest tabs render (`getMySipPlan` / `getMyLumpSumPlan`),
 * picked by `cadence`.
 */
export function AdditionalInvestmentPlanModal({
  cadence,
  onClose,
}: {
  cadence: string;
  onClose: () => void;
}) {
  const isSip = cadence === "sip_monthly";
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const load = isSip ? getMySipPlan().then(sipView) : getMyLumpSumPlan().then(lumpView);
    load
      .then((view) => {
        if (!cancelled) setState({ status: "loaded", view });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [isSip, reloadKey]);

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isSip ? "Your SIP plan" : "Your lump-sum plan"}</DialogTitle>
          <DialogDescription className="text-xs">
            Review the funds this plan deploys into.
          </DialogDescription>
        </DialogHeader>

        {state.status === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your plan…
          </div>
        ) : state.status === "error" ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <p>Couldn&apos;t load this plan.</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/40"
            >
              Try again
            </button>
          </div>
        ) : (
          <PlanBody view={state.view} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PlanBody({ view }: { view: PlanView }) {
  if (view.rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        This plan has no funds yet.
      </p>
    );
  }
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-bold text-foreground">{view.amountLabel}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {view.fundCount} fund{view.fundCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-1.5">
        {view.rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
          >
            <span
              className="w-11 shrink-0 rounded-md py-1 text-center text-[11px] font-bold tracking-wide"
              style={{ backgroundColor: `${BUY_GREEN}1f`, color: BUY_GREEN }}
            >
              BUY
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{r.fund}</p>
              <p className="truncate text-[11px] text-muted-foreground">{r.subCategory}</p>
            </div>
            <p className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: BUY_GREEN }}>
              {fmtINR(r.amount)}
              {view.rowSuffix}
            </p>
          </div>
        ))}
      </div>

      {view.undeployed > 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {fmtINR(view.undeployed)} isn&apos;t placed yet — per-fund caps or a shortage of
          eligible funds left a remainder.
        </p>
      )}
    </div>
  );
}
