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

// ── Session import marker ─────────────────────────────────────────────────
// There is deliberately NO auto-opening popup. CAMS is optional, so every
// surface that needs holdings renders an in-page prompt (see CamsMissingNotice)
// and the import opens only when the user taps it. The old
// once-per-session auto-popup helpers were removed with that change.
const IMPORTED_KEY = "camsStatementImported";

/** True if the user already imported a statement this session. */
export function camsImportedThisSession(): boolean {
  try {
    return sessionStorage.getItem(IMPORTED_KEY) === "true";
  } catch {
    return false;
  }
}
