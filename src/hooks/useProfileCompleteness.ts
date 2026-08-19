import { useCallback, useEffect, useState } from "react";
import { getProfileCompleteness, type ProfileCompleteness } from "@/lib/api";

/**
 * The user's profile completeness, from the one endpoint that also drives the
 * chat gate. Refetched on demand after a capture lands, so the header count
 * moves the moment an answer is stored.
 *
 * Fails quiet: a completeness read that errors must never break the surface
 * hosting it, so `data` simply stays null and nothing renders.
 */
export function useProfileCompleteness(enabled = true) {
  const [data, setData] = useState<ProfileCompleteness | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      setData(await getProfileCompleteness());
    } catch {
      // Non-fatal by design — see the note above.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { completeness: data, loading, refresh };
}

export default useProfileCompleteness;
