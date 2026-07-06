import { posthog, isPostHogEnabled } from "@/lib/posthog";

/**
 * Onboarding funnel instrumentation.
 *
 * One event per onboarding surface lets PostHog build the funnel, per-step
 * completion, average time-on-step and drop-off/abandonment insights described
 * in the analytics plan. Events emitted here:
 *   - onboarding_step_viewed      (screen shown)
 *   - onboarding_step_completed   (user proceeded to the next step)
 *   - onboarding_step_abandoned   (left the step without completing it)
 *   - onboarding_completed        (whole flow finished — fired once)
 *
 * Every emitter no-ops when PostHog is disabled (local / CI builds with no key),
 * so it is always safe to call these unconditionally.
 */

/**
 * Canonical, ordered list of onboarding steps a NEW user passes through.
 * `step_number` is the 1-based index into this array and `total_steps` is its
 * length — change the flow in ONE place and every event stays consistent.
 *
 * Keep these slugs STABLE: renaming a step orphans its historical PostHog
 * funnel/insight. Add new steps in the position they occur in the real flow.
 */
export const ONBOARDING_STEPS = [
  "phone_entry", // WelcomeScreen — enter mobile number
  "account_setup", // WelcomeScreen — name + PIN + email (new users)
  "cams_upload", // /cams-upload — CAMS / KFintech statement
  "link_accounts", // /link-accounts — confirm imported holdings
  "about_you", // /about-you — DOB, goals, income, risk
  "profile_generation", // /onboarding-loading — portfolio being built
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;

/** 1-based position of a step in the canonical flow (0 if unknown). */
const stepNumber = (step: OnboardingStep): number =>
  ONBOARDING_STEPS.indexOf(step) + 1;

/**
 * When each step was last viewed, so *_completed / *_abandoned can report how
 * long the user spent on it. Keyed by step slug; cleared once the step settles.
 */
const enteredAt = new Map<OnboardingStep, number>();

/** Standard identity props shared by every step event. */
const baseProps = (step: OnboardingStep) => ({
  step_name: step,
  step_number: stepNumber(step),
  total_steps: TOTAL_ONBOARDING_STEPS,
});

/** Whole seconds the user has spent on `step`, or undefined if never viewed. */
const secondsOnStep = (step: OnboardingStep): number | undefined => {
  const t0 = enteredAt.get(step);
  if (t0 == null) return undefined;
  return Math.max(0, Math.round((Date.now() - t0) / 1000));
};

/** Fire when an onboarding screen becomes visible. */
export function trackOnboardingStepViewed(
  step: OnboardingStep,
  props?: Record<string, unknown>,
): void {
  enteredAt.set(step, Date.now());
  if (!isPostHogEnabled) return;
  posthog.capture("onboarding_step_viewed", {
    ...baseProps(step),
    time_entered_ms: Date.now(),
    ...props,
  });
}

/** Fire when the user finishes a step and moves on to the next one. */
export function trackOnboardingStepCompleted(
  step: OnboardingStep,
  props?: Record<string, unknown>,
): void {
  const time_spent_seconds = secondsOnStep(step);
  enteredAt.delete(step);
  if (!isPostHogEnabled) return;
  posthog.capture("onboarding_step_completed", {
    ...baseProps(step),
    drop_off: false,
    ...(time_spent_seconds != null ? { time_spent_seconds } : {}),
    ...props,
  });
}

/** Fire when the user leaves a step without completing it (back / close / exit). */
export function trackOnboardingStepAbandoned(
  step: OnboardingStep,
  props?: Record<string, unknown>,
): void {
  const time_spent_seconds = secondsOnStep(step);
  enteredAt.delete(step);
  if (!isPostHogEnabled) return;
  posthog.capture("onboarding_step_abandoned", {
    ...baseProps(step),
    drop_off: true,
    ...(time_spent_seconds != null ? { time_spent_seconds } : {}),
    ...props,
  });
}

// Guard so the terminal "onboarding_completed" event fires at most once per
// completed onboarding, even though several call sites mark it complete.
const COMPLETED_FLAG = "onboarding_completed_tracked";
let completedTrackedThisLoad = false;

const alreadyTrackedCompletion = (): boolean => {
  if (completedTrackedThisLoad) return true;
  try {
    return sessionStorage.getItem(COMPLETED_FLAG) === "true";
  } catch {
    return false;
  }
};

/** Fire once when the entire onboarding flow is finished. Idempotent. */
export function trackOnboardingCompleted(props?: Record<string, unknown>): void {
  if (alreadyTrackedCompletion()) return;
  completedTrackedThisLoad = true;
  try {
    sessionStorage.setItem(COMPLETED_FLAG, "true");
  } catch {
    /* sessionStorage unavailable — the in-memory flag still de-dupes this load */
  }
  if (!isPostHogEnabled) return;
  posthog.capture("onboarding_completed", {
    total_steps: TOTAL_ONBOARDING_STEPS,
    ...props,
  });
}
