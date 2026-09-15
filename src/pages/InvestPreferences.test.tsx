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

const CATS = [
  { id: "multi_asset",       class: "equity", label: "Multi-Asset", recommended_pct_of_total: 20 },
  { id: "low_beta_equities", class: "equity", label: "Large-cap",   recommended_pct_of_total: 30 },
  { id: "short_debt",        class: "debt",   label: "Short Debt",  recommended_pct_of_total: 20 },
  { id: "arbitrage",         class: "debt",   label: "Arbitrage",   recommended_pct_of_total: 0 },
  { id: "gold_commodities",  class: "others", label: "Gold",        recommended_pct_of_total: 30 },
];
// look-through of the above: multi-asset 20 -> 13/5/2, so 43 / 25 / 32
const GET = {
  saved: null,
  recommendation: { class_mix: { equity: 43, debt: 25, others: 32 } },
  subcategories: CATS,
};
const SAVED_COMPLETE = {
  class_mix: { equity: 43, debt: 25, others: 32 },
  pins: [
    { subgroup: "multi_asset", pct_of_total: 20 },
    { subgroup: "low_beta_equities", pct_of_total: 30 },
    { subgroup: "short_debt", pct_of_total: 20 },
    { subgroup: "arbitrage", pct_of_total: 0 },
    { subgroup: "gold_commodities", pct_of_total: 30 },
  ],
};

const mockGet = (data: unknown) =>
  (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue(data);
const saveBtn = () => screen.getByRole("button", { name: /save preferences/i });
const ready = () => screen.findByRole("button", { name: /save preferences/i });
const enterValue = (label: string, v: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: v } });
const enterCompleteDistribution = () => {
  enterValue("Multi-Asset", "20");
  enterValue("Large-cap", "30");
  enterValue("Short Debt", "20");
  enterValue("Gold", "30");            // Arbitrage left blank => sent as 0
};
const clearAllRows = () => CATS.forEach((c) => enterValue(c.label, ""));
const nudgeBar = () =>
  fireEvent.keyDown(screen.getByRole("slider", { name: "Equity / Debt divider" }), {
    key: "ArrowRight",
  });
const savedArgs = () =>
  (saveInvestmentPreferences as ReturnType<typeof vi.fn>).mock.calls[0][0];

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
    mockGet(GET);
    renderPage();
    await waitFor(() => expect(screen.getByText("How you want to invest")).toBeInTheDocument());
    expect(screen.getByText("Your preference")).toBeInTheDocument();
    expect(screen.getByText("Prozpr recommends")).toBeInTheDocument();
  });

  it("disables Save until the split changes, then saves { class_mix, pins }", async () => {
    mockGet(GET);
    renderPage();

    const save = await ready();
    expect(save).toBeDisabled();

    // Nudge the equity|debt divider right by 1 → equity 44, debt 24, commodity 32.
    nudgeBar();

    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());

    await waitFor(() =>
      expect(saveInvestmentPreferences).toHaveBeenCalledWith({
        class_mix: { equity: 44, debt: 24, others: 32 },
        pins: [],
      }),
    );
  });
});

describe("InvestPreferences — full distribution", () => {
  it("disables Save while any class is unbalanced", async () => {
    mockGet(GET); renderPage(); await ready();
    enterValue("Large-cap", "24");
    expect(saveBtn()).toBeDisabled();
  });

  it("says which class is holding Save back", async () => {
    mockGet(GET); renderPage(); await ready();
    enterValue("Multi-Asset", "20");
    enterValue("Large-cap", "24");
    expect(screen.getByTestId("save-reason")).toHaveTextContent("Equity 6.0% left");
  });

  it("enables Save once every class balances, and sends every row with zeros", async () => {
    mockGet(GET); renderPage(); await ready();
    enterCompleteDistribution();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toHaveLength(CATS.length);
    expect(savedArgs().pins).toContainEqual({ subgroup: "arbitrage", pct_of_total: 0 });
  });

  it("still saves a bare class mix when subcategories are untouched", async () => {
    mockGet(GET); renderPage(); await ready();
    nudgeBar();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toEqual([]);
  });

  it("shows no allocated figure while untouched", async () => {
    mockGet(GET); renderPage(); await ready();
    nudgeBar();
    expect(screen.queryByText(/allocated/i)).not.toBeInTheDocument();
  });

  it("lets a customer clear a saved distribution back to engine-decides", async () => {
    mockGet({ ...GET, saved: SAVED_COMPLETE }); renderPage(); await ready();
    clearAllRows();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toEqual([]);
  });

  it("Reset to Prozpr lands on a saveable distribution", async () => {
    mockGet(GET); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /reset to prozpr/i }));
    expect(saveBtn()).toBeEnabled();
  });

  it("never claims 100% allocated while Save is disabled", async () => {
    mockGet(GET); renderPage(); await ready();
    // offsetting errors: rows total 100 but equity is 6 over and debt 6 short
    enterValue("Multi-Asset", "20");
    enterValue("Large-cap", "36");
    enterValue("Short Debt", "14");
    enterValue("Gold", "30");
    expect(saveBtn()).toBeDisabled();
    expect(screen.queryByText(/100(\.0)?% allocated/)).not.toBeInTheDocument();
  });
});

describe("InvestPreferences — carve-out notice", () => {
  it("shows no carve-out notice when nothing is at risk", async () => {
    mockGet(GET); renderPage(); await ready();
    expect(screen.queryByText(/replacing our planning/i)).not.toBeInTheDocument();
  });

  it("shows only the bullets that apply", async () => {
    mockGet({ ...GET, carve_outs_at_risk: ["emergency_fund"] }); renderPage(); await ready();
    expect(screen.getByText(/No separate emergency fund/i)).toBeInTheDocument();
    expect(screen.queryByText(/stop offsetting your loans/i)).not.toBeInTheDocument();
  });
});
