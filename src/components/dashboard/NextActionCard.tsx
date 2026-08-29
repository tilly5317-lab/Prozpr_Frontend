import { ArrowRight, Check, Sparkles, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { NextAction } from "@/lib/portfolioVerdicts";

const TONE = {
  act: { color: "hsl(4 70% 50%)", Icon: TriangleAlert },
  watch: { color: "hsl(38 74% 48%)", Icon: Sparkles },
  calm: { color: "hsl(151 55% 38%)", Icon: Check },
} as const;

/**
 * The one thing worth doing next.
 *
 * v1 had Discover, Ideas for you and Everyday spending all competing for this
 * slot, none of them aware of the portfolio they sat under. This card is chosen
 * from the insights feed, so it changes with the portfolio rather than being a
 * fixed menu — and it sits above the others rather than replacing them, because
 * browsing is still a legitimate reason to be here.
 */
export function NextActionCard({
  action,
  onAskPi,
}: {
  action: NextAction;
  /** Opens the chat sheet with a question about this action pre-written. */
  onAskPi?: (prompt: string) => void;
}) {
  const navigate = useNavigate();
  const { color, Icon } = TONE[action.tone];

  return (
    <div className="pt-1">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-[#D4A868]" strokeWidth={2} />
        <p className="text-[16.2px] font-semibold text-foreground">What to do next</p>
      </div>

      <div
        className="rounded-[14px] bg-card p-[14px]"
        style={{ border: `1px solid ${color}59` }}
      >
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}1f`, color }}
          >
            <Icon className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">
              {action.title}
            </p>
            <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
              {action.detail}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => navigate(action.href)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
            style={{ backgroundColor: color }}
          >
            {action.cta}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          {onAskPi && (
            <button
              type="button"
              onClick={() => onAskPi(`${action.title}. Why, and what should I do about it?`)}
              className="shrink-0 rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-semibold text-foreground transition-colors hover:bg-muted/50"
            >
              Ask Pi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default NextActionCard;
