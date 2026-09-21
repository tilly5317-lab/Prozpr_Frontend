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
  { id: "multi_asset",       class: "equity", label: "multi-asset funds", recommended_pct_of_total: 20 },
  { id: "low_beta_equities", class: "equity", label: "large-cap equity",  recommended_pct_of_total: 30 },
  { id: "short_debt",        class: "debt",   label: "short-duration debt", recommended_pct_of_total: 20 },
  { id: "arbitrage",         class: "debt",   label: "arbitrage",         recommended_pct_of_total: 0 },
  { id: "gold_commodities",  class: "others", label: "gold",              recommended_pct_of_total: 30 },
];
// look-through of the above: multi-asset 20 -> 13/5/2, so 43 / 25 / 32
const GET = {
  saved: null,
  recommendation: { class_mix: { equity: 43, debt: 25, others: 32 } },
  subcategories: CATS,
};
// Today is deliberately a different shape from the recommendation, so the bars
// cannot be confused: 70 equity / 30 debt / 0 commodity.
const GET_WITH_TODAY = {
  ...GET,
  current: {
    holdings: [
      { subgroup: "low_beta_equities", pct_of_total: 70 },
      { subgroup: "short_debt", pct_of_total: 30 },
    ],
    excluded_pct: 18.4,
  },
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
const openCats = () =>
  fireEvent.click(screen.getByRole("button", { name: /set your categories/i }));
// The only class with two rows in this catalog, so the only bar with a divider.
const nudgeDebt = (key: "ArrowLeft" | "ArrowRight") =>
  fireEvent.keyDown(screen.getByRole("slider", { name: "Short-duration / Arbitrage divider" }), { key });
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
  it("does not commit the customer just for opening the section", async () => {
    mockGet(GET); renderPage(); await ready();
    openCats();
    // Prozpr's shape is on display, but looking is not choosing.
    expect(screen.getByText("Short-duration")).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
  });

  it("sends every row once a class is divided, blanks as explicit zeros", async () => {
    mockGet(GET); renderPage(); await ready();
    openCats();
    nudgeDebt("ArrowRight");          // clamped by the next divider: shape unchanged
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toHaveLength(CATS.length);
    expect(savedArgs().pins).toContainEqual({ subgroup: "arbitrage", pct_of_total: 0 });
  });

  // The bar sets every class budget, so moving it has to carry the distribution
  // with it — this is the invariant the whole screen rests on.
  it("keeps the distribution on the bar when the bar itself moves", async () => {
    mockGet(GET); renderPage(); await ready();
    openCats();
    nudgeDebt("ArrowRight");
    nudgeBar();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    const total = savedArgs().pins.reduce((s: number, p: { pct_of_total: number }) => s + p.pct_of_total, 0);
    expect(Math.round(total * 10) / 10).toBe(100);
  });

  it("still saves a bare class mix when the categories are untouched", async () => {
    mockGet(GET); renderPage(); await ready();
    nudgeBar();
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toEqual([]);
  });

  it("lets Reset to Prozpr clear a saved distribution back to engine-decides", async () => {
    mockGet({ ...GET, saved: SAVED_COMPLETE }); renderPage(); await ready();
    fireEvent.click(screen.getByRole("button", { name: /reset to prozpr/i }));
    expect(saveBtn()).toBeEnabled();
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toEqual([]);
  });
});

describe("InvestPreferences — scope notice", () => {
  it("always promises a directional target, even with nothing at risk", async () => {
    mockGet(GET); renderPage(); await ready();
    expect(screen.getByText(/directional target/i)).toBeInTheDocument();
    expect(screen.queryByText(/No separate emergency fund/i)).not.toBeInTheDocument();
  });

  it("shows only the bullets that apply", async () => {
    mockGet({ ...GET, carve_outs_at_risk: ["emergency_fund"] }); renderPage(); await ready();
    expect(screen.getByText(/No separate emergency fund/i)).toBeInTheDocument();
    expect(screen.queryByText(/stop offsetting your loans/i)).not.toBeInTheDocument();
  });

  // A saved split changes what a goal's plan is built around; it does not stop
  // us planning for the goal. The backend still sends the key.
  it("never says near-term goals stop being planned for", async () => {
    mockGet({ ...GET, carve_outs_at_risk: ["near_term_goals"] }); renderPage(); await ready();
    expect(screen.queryByText(/stop being planned for/i)).not.toBeInTheDocument();
  });
});

describe("InvestPreferences — where you are today", () => {
  it("draws a third bar from the customer's holdings", async () => {
    mockGet(GET_WITH_TODAY);
    renderPage();
    await ready();
    expect(screen.getByText("Where you are today")).toBeInTheDocument();
    // The look-through of those rows is 70 / 30 / 0. Asserted on the third
    // bar's own segment rather than by text, both because "70.0%" could
    // collide with a label on either bar above it and because this is what
    // catches the live copy-paste risk: passing `rec` to all three bars.
    expect(screen.getAllByTestId("mix-seg-equity")[2].style.width).toBe("70%");
  });

  // The rescale is the surprising part: the surviving figures were inflated to
  // fill the gap, not merely shown without it.
  it("names what was excluded and that the rest was rescaled", async () => {
    mockGet(GET_WITH_TODAY);
    renderPage();
    await ready();
    expect(
      screen.getByText("Excludes the 18.4% you hold in ELSS and direct stocks. The rest is scaled to 100%."),
    ).toBeInTheDocument();
  });

  it("says only where the customer is when nothing was excluded", async () => {
    mockGet({ ...GET_WITH_TODAY, current: { ...GET_WITH_TODAY.current, excluded_pct: 0 } });
    renderPage();
    await ready();
    expect(screen.getByText("Across the categories you set here.")).toBeInTheDocument();
  });

  // The backend does not send `current` yet, and a customer who holds nothing
  // has no today to show. All three inputs are deliberately one state — the
  // frontend cannot tell them apart and shows nothing for each (spec D8).
  it.each([
    ["absent", undefined],
    ["null", null],
    ["an empty list", { holdings: [], excluded_pct: 0 }],
  ])("shows nothing about today when current is %s", async (_label, current) => {
    mockGet({ ...GET, current });
    renderPage();
    await ready();
    expect(screen.queryByText("Where you are today")).toBeNull();
  });
});
