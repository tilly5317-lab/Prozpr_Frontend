import { describe, it, expect } from "vitest";
import { deriveChatPlanPills } from "@/lib/chat-plan-pills";

const asst = (extra: Record<string, unknown> = {}) => ({
  role: "assistant",
  intent: "rebalancing",
  ...extra,
});

describe("deriveChatPlanPills", () => {
  it("attaches the current rebalancing run to the last rebalancing turn", () => {
    const history = [{ role: "user", intent: null }, asst({})];
    const perMessage = deriveChatPlanPills(history, "X");
    expect(perMessage[0]).toEqual({ showViewExecutePlan: false });
    expect(perMessage[1]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "X" });
  });

  it("does nothing when there is no current run and no cadence", () => {
    const perMessage = deriveChatPlanPills([asst({})], null);
    expect(perMessage[0]).toEqual({ showViewExecutePlan: false });
  });

  it("never attaches the rebalancing run to a non-rebalancing turn (the bug)", () => {
    const history = [
      { role: "user", intent: null },
      asst({ intent: "additional_investment" }),
    ];
    const perMessage = deriveChatPlanPills(history, "X");
    expect(perMessage[1].rebalancingRunId).toBeUndefined();
    expect(perMessage[1].showViewExecutePlan).toBe(false);
  });

  it("attaches the AINV plan by cadence to the last additional-investment turn", () => {
    const history = [
      { role: "user", intent: null },
      asst({ intent: "additional_investment" }),
    ];
    const perMessage = deriveChatPlanPills(history, null, "lumpsum");
    expect(perMessage[1]).toEqual({
      showViewExecutePlan: true,
      additionalInvestmentCadence: "lumpsum",
    });
  });

  it("routes each plan type to its own turn when both exist", () => {
    const history = [
      asst({ intent: "rebalancing" }),
      asst({ intent: "additional_investment" }),
    ];
    const perMessage = deriveChatPlanPills(history, "R", "sip_monthly");
    expect(perMessage[0]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "R" });
    expect(perMessage[1]).toEqual({
      showViewExecutePlan: true,
      additionalInvestmentCadence: "sip_monthly",
    });
  });

  it("attaches both cadence and save-preference run id to the same AINV turn", () => {
    const history = [
      { role: "user", intent: null },
      asst({ intent: "additional_investment" }),
    ];
    const perMessage = deriveChatPlanPills(history, null, "lumpsum", "RUN-1");
    expect(perMessage[1]).toEqual({
      showViewExecutePlan: true,
      additionalInvestmentCadence: "lumpsum",
      additionalInvestmentRunId: "RUN-1",
    });
  });

  it("does not attach a save-preference run id without an AINV turn", () => {
    const history = [asst({ intent: "rebalancing" })];
    const perMessage = deriveChatPlanPills(history, null, null, "RUN-1");
    expect(perMessage[0]).toEqual({ showViewExecutePlan: false });
  });
});
