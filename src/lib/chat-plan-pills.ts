/** Minimal shape deriveChatPlanPills needs from a persisted chat message. */
interface ChatMessageLike {
  role: string;
  intent?: string | null;
}

/** "View plan" pill flags for one chat message (index-aligned to the history). */
interface DerivedPill {
  showViewExecutePlan: boolean;
  rebalancingRunId?: string;
  /** Backend `Cadence` ("sip_monthly" | "lumpsum") when this turn's "View plan"
   *  opens the additional-investment popup instead of the rebalancing modal. */
  additionalInvestmentCadence?: string;
  /** Additional-investment run id with an unsaved what-if candidate — restores
   *  this turn's "Save preference" pill (POSTs to /{id}/save-preference). */
  additionalInvestmentRunId?: string;
}

function lastIndexMatching<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i])) return i;
  }
  return -1;
}

/**
 * Decide each chat message's "View plan" pill on session restore.
 *
 * Restored history rows carry no per-message plan ids (only `intent`), so attach
 * the session's current run to the LAST turn OF ITS OWN PLAN TYPE — the
 * rebalancing run to the last rebalancing turn, additional investment (by
 * `ainvCadence` for "View plan" and `ainvSavePreferenceRunId` for the AINV
 * "Save preference" pill) to the last additional-investment turn. Attaching to
 * any last assistant turn regardless of type was the reported bug: it put a
 * rebalancing plan on a SIP / lump-sum turn.
 *
 * Restore never marks a plan "saved" — we cannot attribute a save to a specific
 * message, so a committed run is not surfaced as "Saved" here (the false-"Saved"
 * bug); the save flow owns that state at click time. `ainvSavePreferenceRunId`
 * is the backend's session-scoped "latest unsaved what-if run" — null once the
 * candidate is saved, so "Save preference" only returns while there is a
 * candidate left to save.
 */
export function deriveChatPlanPills(
  history: ChatMessageLike[],
  rebalancingRunId: string | null,
  ainvCadence: string | null = null,
  ainvSavePreferenceRunId: string | null = null,
): DerivedPill[] {
  const perMessage: DerivedPill[] = history.map(() => ({ showViewExecutePlan: false }));

  if (rebalancingRunId) {
    const idx = lastIndexMatching(
      history,
      (m) => m.role === "assistant" && m.intent === "rebalancing",
    );
    if (idx !== -1) {
      perMessage[idx] = { showViewExecutePlan: true, rebalancingRunId };
    }
  }

  if (ainvCadence || ainvSavePreferenceRunId) {
    const idx = lastIndexMatching(
      history,
      (m) => m.role === "assistant" && m.intent === "additional_investment",
    );
    if (idx !== -1) {
      perMessage[idx] = {
        showViewExecutePlan: true,
        ...(ainvCadence ? { additionalInvestmentCadence: ainvCadence } : {}),
        ...(ainvSavePreferenceRunId
          ? { additionalInvestmentRunId: ainvSavePreferenceRunId }
          : {}),
      };
    }
  }

  return perMessage;
}
