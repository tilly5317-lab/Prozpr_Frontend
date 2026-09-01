import { describe, it, expect } from "vitest";
import { deriveRebalancingPills } from "@/lib/rebalancing-pills";

const asst = (extra: Record<string, unknown> = {}) => ({
  role: "assistant",
  intent: "rebalancing",
  ...extra,
});

describe("deriveRebalancingPills — backend provides per-message ids", () => {
  it("marks only the message whose run matches the committed run", () => {
    const history = [
      asst({ ideal_allocation_rebalancing_id: "A" }),
      asst({ ideal_allocation_rebalancing_id: "B" }),
    ];
    // Older plan A is the committed one; newer B is unsaved.
    const { perMessage, savedRunIds } = deriveRebalancingPills(history, {
      id: "A",
      origin: "saved",
    });
    expect(perMessage[0]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "A" });
    expect(perMessage[1]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "B" });
    expect(savedRunIds).toEqual(["A"]); // B must NOT be marked saved
  });

  it("marks nothing saved when the current run is the unsaved latest", () => {
    const history = [asst({ ideal_allocation_rebalancing_id: "B" })];
    const { savedRunIds } = deriveRebalancingPills(history, { id: "B", origin: null });
    expect(savedRunIds).toEqual([]);
  });

  it("attributes saved to the matching newest message", () => {
    const history = [
      asst({ ideal_allocation_rebalancing_id: "A" }),
      asst({ ideal_allocation_rebalancing_id: "B" }),
    ];
    const { savedRunIds } = deriveRebalancingPills(history, { id: "B", origin: "saved" });
    expect(savedRunIds).toEqual(["B"]);
  });

  it("shows View for a snapshot-only turn but gives it no run id", () => {
    const history = [asst({ ideal_allocation_snapshot_id: "snap-1" })];
    const { perMessage } = deriveRebalancingPills(history, null);
    expect(perMessage[0]).toEqual({ showViewExecutePlan: true });
    expect(perMessage[0].rebalancingRunId).toBeUndefined();
  });
});

describe("deriveRebalancingPills — interim fallback (backend field absent)", () => {
  it("attaches the current run to the last rebalancing turn but never marks it saved", () => {
    const history = [
      { role: "user", intent: null },
      asst({}), // no ideal_allocation_* fields yet
    ];
    const { perMessage, savedRunIds } = deriveRebalancingPills(history, {
      id: "X",
      origin: "saved", // an older saved plan exists — today's false-"Saved" trigger
    });
    expect(perMessage[0]).toEqual({ showViewExecutePlan: false });
    expect(perMessage[1]).toEqual({ showViewExecutePlan: true, rebalancingRunId: "X" });
    expect(savedRunIds).toEqual([]); // the reported bug must stay fixed in the interim
  });

  it("does nothing when there is no current run", () => {
    const history = [asst({})];
    const { perMessage, savedRunIds } = deriveRebalancingPills(history, null);
    expect(perMessage[0]).toEqual({ showViewExecutePlan: false });
    expect(savedRunIds).toEqual([]);
  });
});
