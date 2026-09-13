/**
 * Where the chat "View plan" button should take the customer.
 *
 * A plan message can come from rebalancing (opens the rebalancing plan modal in
 * place) or from additional investment (a SIP or lump-sum plan, which opens its
 * own in-chat popup). Rebalancing wins when both are present. Additional
 * investment routes on the CADENCE, not a run id — an ordinary deploy surfaces
 * its cadence but no run id (the run id gates "Save preference", not viewing).
 */
export type ViewPlanTarget =
  | { kind: "rebalancing-modal"; runId: string }
  | { kind: "ainv-modal"; cadence: string }
  | { kind: "navigate"; path: string };

export interface ViewPlanMessage {
  rebalancingRunId?: string;
  /** Backend `Cadence` value: "sip_monthly" | "lumpsum". Present whenever the
   *  turn produced an additional-investment plan (ordinary deploy or what-if). */
  additionalInvestmentCadence?: string;
}

export function resolveViewPlanTarget(msg: ViewPlanMessage): ViewPlanTarget {
  if (msg.rebalancingRunId) {
    return { kind: "rebalancing-modal", runId: msg.rebalancingRunId };
  }
  if (msg.additionalInvestmentCadence) {
    return { kind: "ainv-modal", cadence: msg.additionalInvestmentCadence };
  }
  return { kind: "navigate", path: "/invest/rebalance-explanation" };
}
