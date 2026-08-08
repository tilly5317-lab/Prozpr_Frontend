import {
  getMe,
  getOnboardingProfile,
  getRebalancingReadiness,
  getRiskProfile,
  type OnboardingProfileResponse,
  type RiskProfileResponse,
} from "@/lib/api";

/**
 * Durable onboarding resume — where should a returning, not-yet-onboarded user
 * land? Decided from BACKEND state (profile answers + imported holdings), not
 * session flags, so progress survives any time away, another device, or a
 * cleared browser.
 *
 * Step order: tell-us wizard (on "/") → /cams-upload → /about-you → done. The
 * CAMS step is OPTIONAL — deferring it ("I'll do this later") is recorded on the
 * user row and counts as done for resume purposes.
 */

export type OnboardingQuestionKey =
  | "dob"
  | "goals"
  | "horizon"
  | "income"
  | "expenses"
  | "risk";

/**
 * Which tell-us wizard questions still lack an answer on the profile.
 * Single source of truth — NewOnboardingFlow uses this to build its question
 * queue and the resume resolver uses it to decide whether the wizard is done.
 */
export function missingOnboardingQuestions(
  profile: OnboardingProfileResponse | null,
  risk: RiskProfileResponse | null,
): OnboardingQuestionKey[] {
  const missing: OnboardingQuestionKey[] = [];
  if (!profile?.date_of_birth) missing.push("dob");
  if (!(profile?.selected_goals?.length || profile?.custom_goals?.length)) {
    missing.push("goals");
  }
  if (!profile?.investment_horizon) missing.push("horizon");
  if (!(profile?.annual_income != null && profile.annual_income > 0)) {
    missing.push("income");
  }
  if (
    !(
      profile?.monthly_household_expense != null &&
      profile.monthly_household_expense > 0
    )
  ) {
    missing.push("expenses");
  }
  const hasRisk = !!risk && (risk.risk_level != null || !!risk.risk_category);
  if (!hasRisk) missing.push("risk");
  return missing;
}

/**
 * Resolve the route to resume an unfinished onboarding at:
 *  - holdings already imported → "/about-you" (last step left)
 *  - CAMS explicitly deferred ("I'll do this later") → "/about-you" too
 *  - wizard questions all answered → "/cams-upload"
 *  - otherwise → null (stay on "/" and run the tell-us wizard, which itself
 *    only asks the missing questions)
 *
 * The deferral is read from the backend (`users.cams_skipped_at`, surfaced as
 * `cams_skipped` on /auth/me), not a session flag — otherwise a reload or a
 * second device would drop the user straight back onto the step they declined.
 */
export async function resolveOnboardingResumeRoute(): Promise<
  "/about-you" | "/cams-upload" | null
> {
  try {
    const readiness = await getRebalancingReadiness();
    if (readiness.has_holdings) return "/about-you";
  } catch {
    /* unknown → fall through to the question check */
  }
  let profile: OnboardingProfileResponse | null = null;
  try {
    profile = await getOnboardingProfile();
  } catch {
    /* brand-new user — everything is missing */
  }
  let risk: RiskProfileResponse | null = null;
  try {
    risk = await getRiskProfile();
  } catch {
    /* no risk profile yet */
  }
  // Wizard first — the CAMS step sits after it, so an unanswered question wins
  // over any CAMS state.
  if (missingOnboardingQuestions(profile, risk).length > 0) return null;
  try {
    const me = await getMe();
    if (me.cams_skipped) return "/about-you";
  } catch {
    /* unknown → treat as not skipped; the CAMS step is still offered */
  }
  return "/cams-upload";
}
