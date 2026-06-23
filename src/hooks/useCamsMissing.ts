import { useCallback, useEffect, useState } from "react";
import { getRebalancingReadiness } from "@/lib/api";

/**
 * Shared CAMS-presence signal for the portfolio / invest surfaces.
 *
 * "CAMS missing" maps 1:1 to the rebalancing engine's `has_holdings` flag — the
 * same signal RebalanceGate uses — because mutual-fund holdings can only come
 * from a CAMS / KFintech statement. When it's false the user has no real
 * holdings to value or rebalance against, so we surface an upload affordance.
 */
export interface CamsMissingState {
  /** null while we don't yet know (loading or the check failed). */
  hasCams: boolean | null;
  /** True only once we KNOW there are no mutual-fund holdings. */
  missing: boolean;
  loading: boolean;
  /** Re-check after an upload (or any holdings change). */
  refresh: () => void;
}

export function useCamsMissing(): CamsMissingState {
  const [hasCams, setHasCams] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getRebalancingReadiness()
      .then((r) => {
        if (!cancelled) setHasCams(!!r.has_holdings);
      })
      .catch(() => {
        // Unknown → treat as "not missing" so we never nag on a transient error.
        if (!cancelled) setHasCams(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => run(), [run]);

  return { hasCams, missing: hasCams === false, loading, refresh: run };
}

// ── One-time-per-session upload prompt ────────────────────────────────────
// The CAMS upload popup auto-opens at most once per browser session, shared
// across every surface (portfolio, invest), so the user is nudged a single time
// and never pestered repeatedly.
const PROMPT_SHOWN_KEY = "camsUploadPromptShown";
const IMPORTED_KEY = "camsStatementImported";

/** True if the auto-popup has already been shown this session. */
export function camsPromptAlreadyShown(): boolean {
  try {
    return sessionStorage.getItem(PROMPT_SHOWN_KEY) === "true";
  } catch {
    return false;
  }
}

export function markCamsPromptShown(): void {
  try {
    sessionStorage.setItem(PROMPT_SHOWN_KEY, "true");
  } catch {
    /* ignore (private mode) */
  }
}

/** True if the user already imported a statement this session. */
export function camsImportedThisSession(): boolean {
  try {
    return sessionStorage.getItem(IMPORTED_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Decide whether to auto-open the upload popup now: only when we know CAMS is
 * missing, it hasn't been shown this session, and nothing was imported yet.
 * Marks it shown (so it won't fire again) and returns true when it should open.
 */
export function shouldAutoOpenCamsPrompt(missing: boolean): boolean {
  if (!missing) return false;
  if (camsPromptAlreadyShown()) return false;
  if (camsImportedThisSession()) return false;
  markCamsPromptShown();
  return true;
}
