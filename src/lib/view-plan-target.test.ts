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
