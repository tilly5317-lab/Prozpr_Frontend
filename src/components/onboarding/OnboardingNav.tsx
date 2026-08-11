import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

/**
 * The Back / Next pair every onboarding step ends with.
 *
 * Onboarding runs across three routes plus several in-page sub-steps, and each
 * had grown its own navigation: a Back link floating at the top of one screen,
 * a bottom row on another, a stacked text link on a third. This puts the pair in
 * ONE place — full-width primary action, with Back (and any step-specific
 * alternative) on the row beneath it — so moving forwards and backwards looks
 * and sits the same everywhere.
 *
 * `onBack` is optional on purpose: the first step of the flow and the terminal
 * "done" step have nowhere to go back to, and a button that dead-ends is worse
 * than no button. Everything else passes one.
 */
export interface OnboardingNavProps {
  /** Label for the forward action, e.g. "Continue". */
  nextLabel: ReactNode;
  onNext: () => void;
  nextDisabled?: boolean;
  /** Swaps the label for a spinner + `loadingLabel` while work is in flight. */
  nextLoading?: boolean;
  loadingLabel?: string;
  /** Leading icon; the trailing arrow is dropped when one is given. */
  nextIcon?: ReactNode;
  /** Set false where the label already reads as the destination. */
  nextArrow?: boolean;
  /** Omit where there is no previous step (first step, terminal step). */
  onBack?: () => void;
  backLabel?: string;
  backDisabled?: boolean;
  /** Optional step-specific action shown at the right of the Back row. */
  secondary?: ReactNode;
  /**
   * "gradient" is the flow's standard CTA; "foreground" is the flatter fill the
   * final onboarding step uses, which greys out until every section is filled.
   */
  tone?: "gradient" | "foreground";
  className?: string;
  /** Extra full-width actions, rendered between the primary and the Back row. */
  children?: ReactNode;
}

const OnboardingNav = ({
  nextLabel,
  onNext,
  nextDisabled = false,
  nextLoading = false,
  loadingLabel,
  nextIcon,
  nextArrow = true,
  onBack,
  backLabel = "Back",
  backDisabled = false,
  secondary,
  tone = "gradient",
  className = "",
  children,
}: OnboardingNavProps) => {
  const disabled = nextDisabled || nextLoading;
  const primaryTone =
    tone === "gradient"
      ? "wealth-gradient text-primary-foreground disabled:opacity-50"
      : disabled
        ? "bg-secondary text-muted-foreground"
        : "bg-foreground text-background";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold tracking-wide transition-all active:scale-[0.98] disabled:pointer-events-none ${primaryTone}`}
      >
        {nextLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingLabel ?? nextLabel}
          </>
        ) : (
          <>
            {nextIcon}
            {nextLabel}
            {!nextIcon && nextArrow && <ArrowRight className="h-4 w-4" />}
          </>
        )}
      </button>

      {children}

      {/* The row exists whenever there is a Back or an alternative action.
          `justify-between` keeps Back left-aligned even when it is alone. */}
      {(onBack || secondary) && (
        <div className="mt-3 flex items-center justify-between">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={backDisabled || nextLoading}
              className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {backLabel}
            </button>
          ) : (
            <span />
          )}
          {secondary}
        </div>
      )}
    </div>
  );
};

export default OnboardingNav;
