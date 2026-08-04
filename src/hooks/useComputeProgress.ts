import { useEffect, useState } from "react";
import { type ComputeProgress } from "@/lib/api";

const POLL_MS = 1000;

/**
 * Poll a compute-progress endpoint while `active` — used to show the REAL
 * backend pipeline stage + % during a long synchronous compute (rebalancing
 * plan, SIP build). Returns null when idle or before the first sample lands,
 * and resets on deactivation so a later run starts clean.
 */
export function useComputeProgress(
  active: boolean,
  fetchProgress: () => Promise<ComputeProgress>,
): ComputeProgress | null {
  const [progress, setProgress] = useState<ComputeProgress | null>(null);

  useEffect(() => {
    if (!active) {
      setProgress(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const p = await fetchProgress();
        if (!cancelled && p.active) setProgress(p);
      } catch {
        /* transient — keep the last sample */
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // fetchProgress is a stable module-level import at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return progress;
}
