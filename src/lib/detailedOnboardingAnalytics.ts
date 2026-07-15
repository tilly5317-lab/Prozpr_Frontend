import { posthog, isPostHogEnabled } from "@/lib/posthog";

/**
 * "Detailed onboarding" funnel — the four sections of the profile-completion flow
 * (/profile/complete and its section routes). Two events per section let PostHog
 * measure how many users start vs. complete each one.
 *
 * The section_name values below are CONTRACTUAL — our analytics funnels match on
 * them exactly, so do not rename them.
 *
 * Both emitters no-op when PostHog is disabled (local / CI builds with no key),
 * so they are always safe to call unconditionally.
 */
export type DetailedOnboardingSection =
  | "financial_picture" // Your money map — /profile/financial-picture
  | "goal_planning" // Goal planning — the "Your cashflow inputs" step
  | "investment_preferences" // Risk behaviour — /profile/investment-preferences
  | "tax_details"; // Tax details — /profile/tax-details

/** Fire once when a section opens / becomes active. */
export function trackDetailedOnboardingSectionStarted(
  sectionName: DetailedOnboardingSection,
): void {
  if (!isPostHogEnabled) return;
  posthog.capture("detailed_onboarding_section_started", { section_name: sectionName });
}

/**
 * Fire when the user successfully saves/confirms/continues past a section —
 * only on the success path (after validation/save resolves), never on the raw
 * button click.
 */
export function trackDetailedOnboardingSectionCompleted(
  sectionName: DetailedOnboardingSection,
): void {
  if (!isPostHogEnabled) return;
  posthog.capture("detailed_onboarding_section_completed", { section_name: sectionName });
}
