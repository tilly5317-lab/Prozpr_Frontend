/** Minimal shape deriveRebalancingPills needs from a persisted chat message. */
interface ChatMessageLike {
  role: string;
  intent?: string | null;
  ideal_allocation_rebalancing_id?: string | null;
  ideal_allocation_snapshot_id?: string | null;
}

/** Minimal shape from getCurrentRebalancingRun() — id + saved marker. */
interface CurrentRunLike {
  id: string;
  origin?: string | null;
}

/** Pill flags for one chat message (index-aligned to the input history). */
interface DerivedPill {
  showViewExecutePlan: boolean;
  rebalancingRunId?: string;
}

interface DerivedPills {
  /** One entry per input message, same order as `history`. */
  perMessage: DerivedPill[];
  /** Committed run ids (origin === "saved") that are attributable to a message. */
  savedRunIds: string[];
}

function lastIndexMatching<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}

/**
 * Decide each chat message's View/Save pill state on session restore.
 *
 * Preferred path (backend returns per-message ids): every message's pill is
 * derived from ITS OWN ideal_allocation_* fields, and a run is marked "saved"
 * only when the committed current run's id actually matches one of those
 * messages — so a newer, unsaved plan never inherits an older plan's "Saved".
 *
 * Interim path (no message carries the ids yet — backend not deployed): fall
 * back to attaching the global current run to the last rebalancing turn for the
 * View/Save affordance, but NEVER mark it saved (we cannot attribute the save
 * to a specific message → no false "Saved", the reported bug).
 */
export function deriveRebalancingPills(
  history: ChatMessageLike[],
  current: CurrentRunLike | null,
): DerivedPills {
  const hasPerMessageIds = history.some(
    (m) => m.ideal_allocation_rebalancing_id || m.ideal_allocation_snapshot_id,
  );

  if (hasPerMessageIds) {
    const perMessage: DerivedPill[] = history.map((m) => {
      const rebalancingRunId = m.ideal_allocation_rebalancing_id ?? undefined;
      const showViewExecutePlan = Boolean(
        m.ideal_allocation_rebalancing_id || m.ideal_allocation_snapshot_id,
      );
      return rebalancingRunId
        ? { showViewExecutePlan, rebalancingRunId }
        : { showViewExecutePlan };
    });
    const savedRunIds =
      current &&
      current.origin === "saved" &&
      perMessage.some((p) => p.rebalancingRunId === current.id)
        ? [current.id]
        : [];
    return { perMessage, savedRunIds };
  }

  // Interim fallback — preserve today's View affordance, kill the false "Saved".
  const perMessage: DerivedPill[] = history.map(() => ({ showViewExecutePlan: false }));
  if (current) {
    let idx = lastIndexMatching(
      history,
      (m) => m.role === "assistant" && m.intent === "rebalancing",
    );
    if (idx === -1) {
      idx = lastIndexMatching(history, (m) => m.role === "assistant");
    }
    if (idx !== -1) {
      perMessage[idx] = { showViewExecutePlan: true, rebalancingRunId: current.id };
    }
  }
  return { perMessage, savedRunIds: [] };
}
