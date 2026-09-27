import { describe, it, expect } from "vitest";
import { BUCKET_META, driftRowsFromBreakdown, hasGoalMix } from "@/lib/driftRows";

describe("asset-class bucket labels", () => {
  it("surfaces the third asset class as 'Commodity' (not 'Others')", () => {
    // Backend vocabulary is Equity/Debt/Others; the customer-facing label is
    // Commodity (gold-dominated), consistent with the preferences page.
    expect(BUCKET_META.others.label).toBe("Commodity");
    expect(BUCKET_META.equity.label).toBe("Equity");
    expect(BUCKET_META.debt.label).toBe("Debt");
  });
});

describe("driftRowsFromBreakdown", () => {
  // A target-only deployment breakdown (current_inr = 0), the shape both the SIP
  // and lump-sum "Proposed Target" bars now render.
  const breakdown = {
    rows: [
      { asset_class: "Equity", current_inr: 0, target_inr: 381035 },
      { asset_class: "Debt", current_inr: 0, target_inr: 75475 },
      { asset_class: "Others", current_inr: 0, target_inr: 36090 },
    ],
    current_total_inr: 0,
    target_total_inr: 492600,
  };

  it("maps a deployment breakdown to Equity / Debt / Commodity rows", () => {
    const rows = driftRowsFromBreakdown(breakdown);
    expect(rows.map((r) => r.label)).toEqual(["Equity", "Debt", "Commodity"]);
  });

  it("computes each asset class's target percentage of the deployment", () => {
    const byLabel = Object.fromEntries(driftRowsFromBreakdown(breakdown).map((r) => [r.label, r]));
    expect(byLabel.Equity.target).toBe(77); // 381035 / 492600
    expect(byLabel.Debt.target).toBe(15); // 75475 / 492600
    expect(byLabel.Commodity.target).toBe(7); // 36090 / 492600
    expect(byLabel.Commodity.targetInr).toBe(36090);
  });
});

describe("the goal mix (the third bar)", () => {
  // The real run behind the fix: the customer saved 50/50 equity/debt, the engine
  // aimed there exactly, and the plan could only reach 77/20 because 84% of the
  // holdings were under a year old. All three numbers now ship.
  const withGoal = {
    rows: [
      { asset_class: "Equity", current_inr: 70194, target_inr: 63076, goal_inr: 41000 },
      { asset_class: "Debt", current_inr: 9116, target_inr: 16016, goal_inr: 40900 },
      { asset_class: "Others", current_inr: 2635, target_inr: 2635, goal_inr: 0 },
    ],
    current_total_inr: 81945,
    target_total_inr: 81727,
    goal_total_inr: 81900,
    short_term_locked_inr: 55804,
    gap_note: "Your goal mix is 50% debt; this plan reaches 20%.",
  };

  it("reads goal percentages independently of where the plan lands", () => {
    const byLabel = Object.fromEntries(driftRowsFromBreakdown(withGoal).map((r) => [r.label, r]));
    expect(byLabel.Equity.goal).toBe(50);
    expect(byLabel.Debt.goal).toBe(50);
    expect(byLabel.Commodity.goal).toBe(0);
    // ...and the plan lands somewhere else entirely.
    expect(byLabel.Equity.target).toBe(77);
    expect(byLabel.Debt.target).toBe(20);
  });

  it("keeps a class the goal excludes but the customer still holds", () => {
    // Commodity is goal 0 / current 3% — dropping the row would hide the fact that
    // the plan cannot get rid of it.
    expect(driftRowsFromBreakdown(withGoal).map((r) => r.label)).toContain("Commodity");
  });

  it("keeps a class the goal wants that the customer does not hold yet", () => {
    const rows = driftRowsFromBreakdown({
      rows: [
        { asset_class: "Equity", current_inr: 1000, target_inr: 1000, goal_inr: 500 },
        { asset_class: "Debt", current_inr: 0, target_inr: 0, goal_inr: 500 },
      ],
      current_total_inr: 1000,
      target_total_inr: 1000,
      goal_total_inr: 1000,
    });
    const debt = rows.find((r) => r.label === "Debt");
    expect(debt?.goal).toBe(50);
    expect(debt?.target).toBe(0);
  });

  it("reports goal 0 when the backend ships no goal mix", () => {
    // AINV deployment breakdowns and pre-2026-09-27 runs. The bar must not render.
    const noGoal = {
      rows: [{ asset_class: "Equity", current_inr: 0, target_inr: 1000 }],
      current_total_inr: 0,
      target_total_inr: 1000,
    };
    const rows = driftRowsFromBreakdown(noGoal);
    expect(rows.every((r) => r.goal === 0 && r.goalInr === 0)).toBe(true);
    expect(hasGoalMix(noGoal)).toBe(false);
    expect(hasGoalMix(null)).toBe(false);
    expect(hasGoalMix(undefined)).toBe(false);
    expect(hasGoalMix(withGoal)).toBe(true);
  });
});
