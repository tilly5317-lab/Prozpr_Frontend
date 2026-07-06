import { useCallback, useEffect, useRef } from "react";
import {
  trackOnboardingStepViewed,
  trackOnboardingStepCompleted,
  trackOnboardingStepAbandoned,
  type OnboardingStep,
} from "@/lib/onboardingAnalytics";

interface UseOnboardingStepOptions {
  /**
   * When false the hook is inert (no events at all). Use for surfaces that are
   * only sometimes part of onboarding — e.g. the CAMS page opened from Profile
   * to update holdings rather than during first-run onboarding.
   * Must be stable for the lifetime of the screen.
   */
  enabled?: boolean;
}

interface UseOnboardingStepResult {
  /** Call when the user successfully proceeds to the next step. */
  completeStep: (props?: Record<string, unknown>) => void;
}

/**
 * Instruments a single route-based onboarding screen:
 *   - fires `onboarding_step_viewed` on mount,
 *   - returns `completeStep()` to fire `onboarding_step_completed` when the user
 *     proceeds,
 *   - fires `onboarding_step_abandoned` if the screen unmounts (back / route
 *     change) or the tab is closed/backgrounded before `completeStep()` ran.
 *
 * Safe to call unconditionally — pass `{ enabled: false }` to disable, and note
 * that all underlying emitters no-op when PostHog itself is disabled.
 */
export function useOnboardingStep(
  step: OnboardingStep,
  { enabled = true }: UseOnboardingStepOptions = {},
): UseOnboardingStepResult {
  // Refs survive re-renders so the unmount cleanup sees the latest state.
  const completedRef = useRef(false);
  const settledRef = useRef(false); // completed OR abandoned already emitted

  useEffect(() => {
    if (!enabled) return;

    // Fresh slate on every (re)mount — also keeps React StrictMode's
    // mount→unmount→mount cycle from wedging the settled guard in dev.
    completedRef.current = false;
    settledRef.current = false;

    // Emit abandonment at most once, whether via unmount or tab-close.
    const emitAbandonedOnce = () => {
      if (settledRef.current) return;
      settledRef.current = true;
      trackOnboardingStepAbandoned(step);
    };

    trackOnboardingStepViewed(step);

    // Real browser exit: tab close, hard navigation, or mobile backgrounding.
    // SPA route changes go through the unmount cleanup below instead.
    const onPageHide = () => {
      if (!completedRef.current) emitAbandonedOnce();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      if (!completedRef.current) emitAbandonedOnce();
    };
  }, [step, enabled]);

  // Stable identity so callers can safely list it in effect dependency arrays.
  const completeStep = useCallback(
    (props?: Record<string, unknown>) => {
      if (!enabled || completedRef.current) return;
      completedRef.current = true;
      settledRef.current = true; // stop the cleanup from also firing "abandoned"
      trackOnboardingStepCompleted(step, props);
    },
    [step, enabled],
  );

  return { completeStep };
}
