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
