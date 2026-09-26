import { describe, it, expect } from "vitest";
import { BUCKET_META, driftRowsFromBreakdown } from "@/lib/driftRows";

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
