/**
 * Regression tests for the current-allocation donut's slice drill-down.
 *
 * A blended fund (here Flexi Cap) is look-through split by the backend across
 * Equity/Debt/Others. The drill-down must render that split — `sub_categories`
 * off the tapped allocation — rather than grouping `holdings` by their single,
 * undivided `asset_class`. Grouping locally put the whole fund under Equity and
 * left Debt/Others showing "No sub-categories recorded in this bucket."
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PortfolioDetail } from "@/lib/api";

// jsdom gives an SVG no layout, so a real recharts donut renders nothing
// clickable. Stub Pie down to the contract this component actually uses: one
// clickable target per datum, handing back its index.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Pie: ({
      data,
      onClick,
    }: {
      data: { name: string }[];
      onClick: (entry: unknown, index: number) => void;
    }) => (
      <div>
        {data.map((d, i) => (
          <button key={d.name} type="button" onClick={() => onClick(d, i)}>
            {`slice:${d.name}`}
          </button>
        ))}
      </div>
    ),
    Cell: () => null,
  };
});

import CurrentAllocationCard from "./CurrentAllocationCard";

const L = 100_000;

/** ₹50L Flexi Cap + ₹50L Large Cap, split 72.5/17.5/10 by the backend. */
const portfolio = {
  id: "p1",
  name: "Primary",
  total_value: 100 * L,
  total_invested: 90 * L,
  total_gain_percentage: 11.1,
  is_primary: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  allocations: [
    {
      id: "a1",
      asset_class: "Equity",
      allocation_percentage: 86.25,
      amount: 86.25 * L,
      performance_percentage: null,
      sub_categories: [
        { name: "Large Cap Fund", amount: 50 * L },
        { name: "Flexi Cap Fund", amount: 36.25 * L },
      ],
    },
    {
      id: "a2",
      asset_class: "Debt",
      allocation_percentage: 8.75,
      amount: 8.75 * L,
      performance_percentage: null,
      sub_categories: [{ name: "Flexi Cap Fund", amount: 8.75 * L }],
    },
    {
      id: "a3",
      asset_class: "Others",
      allocation_percentage: 5,
      amount: 5 * L,
      performance_percentage: null,
      sub_categories: [{ name: "Flexi Cap Fund", amount: 5 * L }],
    },
  ],
  // Every holding carries ONE undivided asset_class — note nothing is tagged
  // Debt or Others, which is precisely why local grouping left them empty.
  holdings: [
    {
      id: "h1",
      instrument_name: "Some Flexi Cap Fund",
      instrument_type: "mutual_fund",
      ticker_symbol: null,
      quantity: 1,
      average_cost: 45 * L,
      current_price: 50 * L,
      current_value: 50 * L,
      allocation_percentage: 50,
      asset_class: "Equity",
      sub_category: "Flexi Cap Fund",
    },
    {
      id: "h2",
      instrument_name: "Some Large Cap Fund",
      instrument_type: "mutual_fund",
      ticker_symbol: null,
      quantity: 1,
      average_cost: 45 * L,
      current_price: 50 * L,
      current_value: 50 * L,
      allocation_percentage: 50,
      asset_class: "Equity",
      sub_category: "Large Cap Fund",
    },
  ],
} as unknown as PortfolioDetail;

function renderCard() {
  return render(
    <MemoryRouter>
      <CurrentAllocationCard portfolio={portfolio} riskCategory="Aggressive" horizonLabel="5+ years" />
    </MemoryRouter>,
  );
}

/** The amount rendered next to a sub-category name in the open slice detail. */
function amountForSubCategory(name: string): string {
  const row = screen.getByText(name).parentElement!;
  return within(row).getByText(/^₹/).textContent!;
}

describe("CurrentAllocationCard slice drill-down", () => {
  it("shows the debt sleeve of a blended fund under the Debt slice", () => {
    renderCard();

    fireEvent.click(screen.getByText("slice:Debt"));

    // Pre-fix this bucket was empty: no holding is tagged asset_class "Debt".
    expect(screen.queryByText(/No sub-categories recorded/i)).not.toBeInTheDocument();
    expect(amountForSubCategory("Flexi Cap Fund")).toBe("₹8.8L");
  });

  it("shows the others sleeve of a blended fund under the Others slice", () => {
    renderCard();

    fireEvent.click(screen.getByText("slice:Others"));

    expect(screen.queryByText(/No sub-categories recorded/i)).not.toBeInTheDocument();
    expect(amountForSubCategory("Flexi Cap Fund")).toBe("₹5.0L");
  });

  it("counts only the equity sleeve of a blended fund under the Equity slice", () => {
    renderCard();

    fireEvent.click(screen.getByText("slice:Equity"));

    // 36.25L, not the fund's whole ₹50L — that over-count was the original bug.
    expect(amountForSubCategory("Flexi Cap Fund")).toBe("₹36.3L");
    // A pure equity fund is untouched by the look-through.
    expect(amountForSubCategory("Large Cap Fund")).toBe("₹50.0L");
  });
});
