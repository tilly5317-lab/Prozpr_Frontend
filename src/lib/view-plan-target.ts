/**
 * Where the chat "View plan" button should take the customer.
 *
 * A plan message can come from rebalancing (opens the rebalancing plan modal in
 * place) or from additional investment (a SIP or lump-sum plan, which opens its
 * own in-chat popup). Rebalancing wins when both are present. Additional
 * investment routes on the CADENCE (which popup: SIP vs lump sum) and, on a
 * what-if turn, ALSO on the run id — so the popup fetches that specific draft by
 * id (an unsaved what-if is firewalled out of the latest-plan reads). An ordinary
 * deploy surfaces its cadence but no run id, so the popup falls back to latest.
 */
export type ViewPlanTarget =
  | { kind: "rebalancing-modal"; runId: string }
  | { kind: "ainv-modal"; cadence: string; runId?: string }
  | { kind: "navigate"; path: string };

export interface ViewPlanMessage {
  rebalancingRunId?: string;
  /** Backend `Cadence` value: "sip_monthly" | "lumpsum". Present whenever the
   *  turn produced an additional-investment plan (ordinary deploy or what-if). */
  additionalInvestmentCadence?: string;
  /** The what-if run id — present only on preference what-if turns (it also gates
   *  "Save preference"). When set, "View plan" fetches this specific draft by id. */
  additionalInvestmentRunId?: string;
}

export function resolveViewPlanTarget(msg: ViewPlanMessage): ViewPlanTarget {
  if (msg.rebalancingRunId) {
    return { kind: "rebalancing-modal", runId: msg.rebalancingRunId };
  }
  if (msg.additionalInvestmentCadence) {
    return {
      kind: "ainv-modal",
      cadence: msg.additionalInvestmentCadence,
      ...(msg.additionalInvestmentRunId
        ? { runId: msg.additionalInvestmentRunId }
        : {}),
    };
  }
  return { kind: "navigate", path: "/invest/rebalance-explanation" };
}
