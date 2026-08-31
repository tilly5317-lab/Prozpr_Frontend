import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";

// Radix Dialog touches a couple of DOM APIs jsdom lacks.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock("@/lib/api", () => ({ getRebalancingRunDetail: vi.fn() }));
import { getRebalancingRunDetail } from "@/lib/api";
import { RebalancePlanModal } from "./RebalancePlanModal";

const detail = {
  id: "run-1",
  origin: null,
  trades: [
    { id: "t1", recommended_fund: "Acme Bluechip", action: "BUY", amount_inr: 5000, reason_title: "Top up to target" },
    { id: "t2", recommended_fund: "Old Fund", action: "SELL", amount_inr: 3000, reason_title: "Trim back to target" },
    { id: "t3", recommended_fund: "Exited Fund", action: "EXIT", amount_inr: 2000, reason_title: "Not on recommended list" },
  ],
  totals: { total_buy_inr: 5000, total_sell_inr: 5000, net_cash_flow_inr: 0, total_tax_estimate_inr: 100 },
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const noop = () => {};

describe("RebalancePlanModal", () => {
  it("fetches the given runId and renders its trades", async () => {
    (getRebalancingRunDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    render(<RebalancePlanModal runId="run-1" onClose={noop} isSaved={false} isSaving={false} onSave={noop} />);
    await waitFor(() => expect(getRebalancingRunDetail).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText("Acme Bluechip")).toBeInTheDocument();
    expect(screen.getByText("Old Fund")).toBeInTheDocument();
  });

  it("renders an EXIT trade as a SELL with a negative amount", async () => {
    (getRebalancingRunDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    render(<RebalancePlanModal runId="run-1" onClose={noop} isSaved={false} isSaving={false} onSave={noop} />);
    expect(await screen.findByText("Exited Fund")).toBeInTheDocument();
    // EXIT collapses to a SELL badge and a signed-negative amount (unique to this row).
    expect(screen.getByText("−₹2,000")).toBeInTheDocument();
  });

  it("hides the cost strip when totals is null without crashing", async () => {
    (getRebalancingRunDetail as ReturnType<typeof vi.fn>).mockResolvedValue({ ...detail, totals: null });
    render(<RebalancePlanModal runId="run-2" onClose={noop} isSaved={false} isSaving={false} onSave={noop} />);
    expect(await screen.findByText("Acme Bluechip")).toBeInTheDocument();
    expect(screen.queryByText("Total buy")).not.toBeInTheDocument();
  });

  it("shows the header Saved plan badge when isSaved is true, even if origin is not saved", async () => {
    (getRebalancingRunDetail as ReturnType<typeof vi.fn>).mockResolvedValue(detail);
    render(<RebalancePlanModal runId="run-1" onClose={noop} isSaved={true} isSaving={false} onSave={noop} />);
    expect(await screen.findByText("Acme Bluechip")).toBeInTheDocument();
    expect(screen.getByText("Saved plan")).toBeInTheDocument();
  });
});
