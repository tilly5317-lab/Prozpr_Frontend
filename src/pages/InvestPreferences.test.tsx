import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  getInvestmentPreferences: vi.fn(),
  saveInvestmentPreferences: vi.fn(),
}));
vi.mock("@/components/BottomNav", () => ({ default: () => null }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { getInvestmentPreferences, saveInvestmentPreferences } from "@/lib/api";
import InvestPreferences from "./InvestPreferences";

const GET = {
  saved: null,
  recommendation: { class_mix: { equity: 72, debt: 18, others: 10 } },
  subcategories: [
    { id: "low_beta_equities", class: "equity", label: "Large-cap", recommended_pct_of_total: 15 },
  ],
};

const renderPage = () => render(<MemoryRouter><InvestPreferences /></MemoryRouter>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  (saveInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
});

describe("InvestPreferences (percentage screen)", () => {
  it("renders the headline and both bars from the recommendation", async () => {
    (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue(GET);
    renderPage();
    await waitFor(() => expect(screen.getByText("How you want to invest")).toBeInTheDocument());
    expect(screen.getByText("Your preference")).toBeInTheDocument();
    expect(screen.getByText("Prozpr recommends")).toBeInTheDocument();
  });

  it("disables Save until the split changes, then saves { class_mix, pins }", async () => {
    (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue(GET);
    renderPage();

    const save = await screen.findByRole("button", { name: /save preferences/i });
    expect(save).toBeDisabled();

    // Nudge the equity|debt divider right by 1 → equity 73, debt 17, commodity 10.
    fireEvent.keyDown(screen.getByRole("slider", { name: "Equity / Debt divider" }), {
      key: "ArrowRight",
    });

    expect(screen.getByRole("button", { name: /save preferences/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() =>
      expect(saveInvestmentPreferences).toHaveBeenCalledWith({
        class_mix: { equity: 73, debt: 17, others: 10 },
        pins: [],
      }),
    );
  });
});
