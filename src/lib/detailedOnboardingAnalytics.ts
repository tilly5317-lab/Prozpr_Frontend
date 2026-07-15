import { posthog, isPostHogEnabled } from "@/lib/posthog";

/**
 * Detailed-onboarding (profile-completion) funnel instrumentation.
 *
 * The /profile/complete hub has four sections, each with its own URL — but
 * pageviews alone can't measure completion, and the goal-planning section
 * never even gets its own pathname (it forwards to /goal-planner?inputs=1).
 * These two events make started/completed measurable per section:
 *   - detailed_onboarding_section_started    (user opened a section)
 *   - detailed_onboarding_section_completed  (section confirmed / first goal saved)
 *
 * The "detailed_onboarding analytics" PostHog dashboard is built on these —
 * keep the event names and section slugs STABLE or its insights go blind.
 *
 * Every emitter no-ops when PostHog is disabled (local / CI builds with no key),
 * so it is always safe to call these unconditionally.
 */

/**
 * Section slugs, index-aligned with SECTION_TITLES in CompleteProfile.tsx:
 *   0 "Your financial picture"            → money_map
 *   1 "What are you trying to achieve?"   → goal_planning (lives in /goal-planner)
 *   2 "Your investment preference..."     → risk_behaviour
 *   3 "Tax details"                       → tax_details
 */
export const DETAILED_ONBOARDING_SECTIONS = [
  "money_map",
  "goal_planning",
  "risk_behaviour",
  "tax_details",
] as const;

export type DetailedOnboardingSection =
  (typeof DETAILED_ONBOARDING_SECTIONS)[number];

/** Slug for a CompleteProfile section index, or undefined if out of range. */
export const detailedOnboardingSectionForIndex = (
  idx: number,
): DetailedOnboardingSection | undefined => DETAILED_ONBOARDING_SECTIONS[idx];

const baseProps = (section: DetailedOnboardingSection) => ({
  section_name: section,
  section_number: DETAILED_ONBOARDING_SECTIONS.indexOf(section) + 1,
  total_sections: DETAILED_ONBOARDING_SECTIONS.length,
});

/** Fire when the user opens a section (from the card list or a deep link). */
export function trackDetailedOnboardingSectionStarted(
  section: DetailedOnboardingSection,
  props?: Record<string, unknown>,
): void {
  if (!isPostHogEnabled) return;
  posthog.capture("detailed_onboarding_section_started", {
    ...baseProps(section),
    ...props,
  });
}

/**
 * Fire when a section reaches its "confirmed" condition: the confirm button
 * for money_map / risk_behaviour / tax_details, or a goal being saved for
 * goal_planning (a section counts as done once the user has ≥1 goal).
 */
export function trackDetailedOnboardingSectionCompleted(
  section: DetailedOnboardingSection,
  props?: Record<string, unknown>,
): void {
  if (!isPostHogEnabled) return;
  posthog.capture("detailed_onboarding_section_completed", {
    ...baseProps(section),
    ...props,
  });
}
