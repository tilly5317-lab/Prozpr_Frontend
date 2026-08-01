import { Check, Loader2 } from "lucide-react";
import { type ComputeProgress } from "@/lib/api";

/**
 * Live "thinking aloud" timeline for the invest computes. The backend keeps
 * the full stage history (`messages`), so every completed step is always
 * shown — even stages that flipped faster than the poll interval. Done steps
 * get a green tick on a connector line; the newest keeps a spinner until the
 * whole compute finishes and the page swaps to the result.
 */
export function ComputeProgressSteps({
  progress,
  startingLabel = "Getting started…",
}: {
  progress: ComputeProgress | null;
  startingLabel?: string;
}) {
  const history = progress?.messages?.length
    ? progress.messages
    : progress?.message
      ? [progress.message]
      : [];
  const lines = history.length ? history : [startingLabel];

  return (
    <div className="w-full text-left" role="status" aria-live="polite">
      {lines.map((label, i) => {
        const active = i === lines.length - 1;
        return (
          <div
            key={`${i}-${label}`}
            className="relative flex gap-3 pb-4 last:pb-0 animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            {/* Connector to the next step — green once this step is done. */}
            {i < lines.length - 1 && (
              <span className="absolute left-[11px] top-6 -bottom-0.5 w-px bg-wealth-green/35" />
            )}
            {active ? (
              <span className="relative z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              </span>
            ) : (
              <span className="relative z-10 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full bg-wealth-green text-white">
                <Check className="h-3 w-3" />
              </span>
            )}
            <span
              className={`pt-[3px] text-[12.5px] leading-snug ${
                active ? "font-medium text-foreground animate-pulse" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
