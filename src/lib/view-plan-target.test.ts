import { describe, it, expect } from "vitest";

import { resolveViewPlanTarget } from "./view-plan-target";

describe("resolveViewPlanTarget", () => {
  it("opens the rebalancing modal when the message carries a rebalancing run", () => {
    expect(resolveViewPlanTarget({ rebalancingRunId: "reb-1" })).toEqual({
      kind: "rebalancing-modal",
      runId: "reb-1",
    });
  });

  it("opens the SIP plan popup for a SIP additional-investment message", () => {
    expect(
      resolveViewPlanTarget({ additionalInvestmentCadence: "sip_monthly" }),
    ).toEqual({ kind: "ainv-modal", cadence: "sip_monthly" });
  });

  it("opens the lump-sum plan popup for a lump-sum additional-investment message", () => {
    expect(
      resolveViewPlanTarget({ additionalInvestmentCadence: "lumpsum" }),
    ).toEqual({ kind: "ainv-modal", cadence: "lumpsum" });
  });

  it("carries the what-if run id so the popup opens that specific draft by id", () => {
    expect(
      resolveViewPlanTarget({
        additionalInvestmentCadence: "sip_monthly",
        additionalInvestmentRunId: "run-9",
      }),
    ).toEqual({ kind: "ainv-modal", cadence: "sip_monthly", runId: "run-9" });
  });

  it("omits the run id for an ordinary deploy (popup falls back to latest)", () => {
    const target = resolveViewPlanTarget({ additionalInvestmentCadence: "lumpsum" });
    expect(target).toEqual({ kind: "ainv-modal", cadence: "lumpsum" });
    expect((target as { runId?: string }).runId).toBeUndefined();
  });

  it("falls back to the rebalancing tab when there is no plan to open", () => {
    expect(resolveViewPlanTarget({})).toEqual({
      kind: "navigate",
      path: "/invest/rebalance-explanation",
    });
  });

  it("prefers the rebalancing modal when both a rebalancing run and a cadence are present", () => {
    expect(
      resolveViewPlanTarget({
        rebalancingRunId: "reb-1",
        additionalInvestmentCadence: "lumpsum",
      }),
    ).toEqual({ kind: "rebalancing-modal", runId: "reb-1" });
  });
});
