import posthog from "posthog-js";
import type { UserInfo } from "@/lib/api";

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Analytics is only active when a project key is configured. Local, CI and
 * frontend-only builds usually leave the key empty, so we no-op everywhere
 * instead of calling an uninitialised SDK (which warns/throws on every event).
 */
export const isPostHogEnabled = Boolean(POSTHOG_KEY);

/** Initialise the PostHog browser SDK. Call exactly once at app startup. */
export function initPostHog() {
  if (!isPostHogEnabled) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false, // sent manually on each React-Router navigation
    capture_pageleave: true,
    person_profiles: "identified_only", // only persist profiles for logged-in users
    disable_session_recording: false, // enable session replay (also turn on "Record user sessions" in PostHog → Settings → Replay)
    session_recording: {
      maskAllInputs: true, // never capture what users type into inputs (sensitive financial data)
    },
  });
}

/** Send a SPA pageview for the current URL. */
export function capturePageview() {
  if (!isPostHogEnabled) return;
  posthog.capture("$pageview", { $current_url: window.location.href });
}

/**
 * Tie subsequent events to a known user. Called when the authenticated profile
 * loads; safe to call repeatedly (PostHog de-dupes on the distinct id).
 */
export function identifyUser(user: UserInfo) {
  if (!isPostHogEnabled) return;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  posthog.identify(user.id, {
    email: user.email ?? undefined,
    name: name || undefined,
    onboarding_complete: user.is_onboarding_complete,
  });
}

/** Clear the current identity on sign-out so the next session starts anonymous. */
export function resetUser() {
  if (!isPostHogEnabled) return;
  posthog.reset();
}

export { posthog };
