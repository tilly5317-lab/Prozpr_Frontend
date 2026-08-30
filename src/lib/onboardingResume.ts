import { getMe, getRebalancingReadiness } from "@/lib/api";

/**
 * Durable onboarding resume — where should a returning, not-yet-onboarded user
 * land? Decided from BACKEND state (imported holdings + the recorded CAMS
 * deferral), not session flags, so progress survives any time away, another
 * device, or a cleared browser.
 *
 * Step order: account setup (on "/") → /cams-upload → /about-you →
 * /onboarding-loading → done. The CAMS step is OPTIONAL — deferring it ("I'll
 * do this later") is recorded on the user row and counts as done for resume
 * purposes. Every profile question (date of birth, goals, horizon, income,
 * expenses, risk) is asked on /about-you, so there is no separate question step
 * to resume into.
 */

/**
 * Resolve the route to resume an unfinished onboarding at:
 *  - holdings already imported → "/about-you" (last step left)
 *  - CAMS explicitly deferred ("I'll do this later") → "/about-you" too
 *  - otherwise → "/cams-upload", the first step after account setup
 *
 * The deferral is read from the backend (`users.cams_skipped_at`, surfaced as
 * `cams_skipped` on /auth/me), not a session flag — otherwise a reload or a
 * second device would drop the user straight back onto the step they declined.
 */
export async function resolveOnboardingResumeRoute(): Promise<
  "/about-you" | "/cams-upload"
> {
  try {
    const readiness = await getRebalancingReadiness();
    if (readiness.has_holdings) return "/about-you";
  } catch {
    /* unknown → fall through to the CAMS-deferral check */
  }
  try {
    const me = await getMe();
    if (me.cams_skipped) return "/about-you";
  } catch {
    /* unknown → treat as not skipped; the CAMS step is still offered */
  }
  return "/cams-upload";
}
