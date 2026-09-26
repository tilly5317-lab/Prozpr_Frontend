import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Radix Dialog touches a couple of DOM APIs jsdom lacks.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock("@/lib/api", () => ({ getMySipPlan: vi.fn(), getMyLumpSumPlan: vi.fn() }));
import { getMySipPlan, getMyLumpSumPlan } from "@/lib/api";
import { AdditionalInvestmentPlanModal } from "./AdditionalInvestmentPlanModal";

const sipPlan = {
  has_plan: true,
  run_id: "s1",
  created_at: null,
  monthly_amount_inr: 25000,
  monthly_deployed_inr: 25000,
  monthly_undeployed_inr: 0,
  target_bucket: "long_term",
  fund_count: 2,
  buys: [
    { recommended_fund: "HDFC Top 100", sub_category: "Large Cap Fund", asset_subgroup: "low_beta_equities", scheme_code: "101", monthly_amount_inr: 15000, rank: 1, reason: "" },
    { recommended_fund: "ICICI Ultra Short", sub_category: "Ultra Short Duration", asset_subgroup: "short_debt", scheme_code: "102", monthly_amount_inr: 10000, rank: 1, reason: "" },
  ],
  goal_plan_monthly_investment_inr: 25000,
  goal_plan_in_sync: true,
};

const lumpPlan = {
  has_plan: true,
  run_id: "l1",
  created_at: null,
  amount_inr: 500000,
  deployed_inr: 500000,
  undeployed_inr: 0,
  target_bucket: "long_term",
  fund_count: 1,
  buys: [
    { recommended_fund: "Parag Parikh Flexi Cap", sub_category: "Flexi Cap Fund", asset_subgroup: "low_beta_equities", scheme_code: "201", amount_inr: 300000, rank: 1, reason: "" },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const noop = () => {};

describe("AdditionalInvestmentPlanModal", () => {
  it("fetches and renders the SIP plan for a sip_monthly turn", async () => {
    (getMySipPlan as ReturnType<typeof vi.fn>).mockResolvedValue(sipPlan);
    render(<AdditionalInvestmentPlanModal cadence="sip_monthly" onClose={noop} />);
    await waitFor(() => expect(getMySipPlan).toHaveBeenCalled());
    expect(getMyLumpSumPlan).not.toHaveBeenCalled();
    expect(await screen.findByText("Your SIP plan")).toBeInTheDocument();
    expect(screen.getByText(/\/ month/)).toBeInTheDocument();
    expect(screen.getByText("HDFC Top 100")).toBeInTheDocument();
  });

  it("fetches and renders the lump-sum plan for a lumpsum turn", async () => {
    (getMyLumpSumPlan as ReturnType<typeof vi.fn>).mockResolvedValue(lumpPlan);
    render(<AdditionalInvestmentPlanModal cadence="lumpsum" onClose={noop} />);
    await waitFor(() => expect(getMyLumpSumPlan).toHaveBeenCalled());
    expect(getMySipPlan).not.toHaveBeenCalled();
    expect(await screen.findByText("Your lump-sum plan")).toBeInTheDocument();
    expect(screen.getByText(/one-time/)).toBeInTheDocument();
    expect(screen.getByText("Parag Parikh Flexi Cap")).toBeInTheDocument();
  });
});
