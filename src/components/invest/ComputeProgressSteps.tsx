import { Check, Loader2 } from "lucide-react";
import { type ComputeProgress } from "@/lib/api";

export interface ComputeStep {
  label: string;
  /** Progress % at which this step becomes the active one. */
  from: number;
}

/**
 * Customer-facing checklists for the invest computes. Labels describe what we
 * are doing FOR the user — never engine/strategy internals (ranks, caps, tax
 * lots, caches stay out of the copy). The `from` thresholds mirror the %s the
 * backend publishes at each stage boundary.
 */
export const REBALANCE_STEPS: ComputeStep[] = [
  { label: "Reviewing your portfolio & profile", from: 0 },
  { label: "Designing your personalised target mix", from: 12 },
  { label: "Comparing your investments with your target", from: 58 },
  { label: "Preparing your recommendations", from: 70 },
  { label: "Finalising your plan", from: 90 },
];

export const SIP_STEPS: ComputeStep[] = [
  { label: "Reading your profile & goals", from: 0 },
  { label: "Designing your personalised mix", from: 18 },
  { label: "Shortlisting funds for you", from: 60 },
  { label: "Allocating your monthly amount", from: 75 },
  { label: "Saving your plan", from: 92 },
];

/**
 * The per-task checklist shown while a compute runs (mirrors the onboarding
 * loading page): done steps get a green tick, the current one a spinner,
 * upcoming ones a hollow dot. Driven by the polled real progress %.
 */
export function ComputeProgressSteps({
  steps,
  progress,
}: {
  steps: ComputeStep[];
  progress: ComputeProgress | null;
}) {
  const pct = progress?.progress_pct ?? 0;
  const activeIdx = steps.reduce((acc, s, i) => (pct >= s.from ? i : acc), 0);

  return (
    <div className="w-full space-y-2.5 text-left">
      {steps.map((s, i) => {
        const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "pending";
        return (
          <div key={s.label} className="flex items-center gap-2.5">
            {state === "done" ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-wealth-green text-white">
                <Check className="h-3 w-3" />
              </span>
            ) : state === "active" ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              </span>
            ) : (
              <span className="h-5 w-5 shrink-0 rounded-full border border-border" />
            )}
            <span
              className={`text-[12px] ${
                state === "pending"
                  ? "text-muted-foreground/60"
                  : state === "active"
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
