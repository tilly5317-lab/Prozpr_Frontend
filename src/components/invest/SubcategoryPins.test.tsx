import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import { classAllocated, classBudget, type RowValues } from "@/lib/investment-preferences";
import SubcategoryPins from "./SubcategoryPins";

afterEach(cleanup);

const CATS: ScreenSubcategory[] = [
  { id: "multi_asset",       class: "equity", label: "multi-asset funds",     recommended_pct_of_total: 20 },
  { id: "low_beta_equities", class: "equity", label: "large-cap equity",      recommended_pct_of_total: 18 },
  { id: "high_beta_equities",class: "equity", label: "small-cap equity",      recommended_pct_of_total: 12 },
  { id: "short_debt",        class: "debt",   label: "short-duration debt",   recommended_pct_of_total: 20 },
  { id: "gold_commodities",  class: "others", label: "gold",                  recommended_pct_of_total: 30 },
];
const MIX: ClassMix = { equity: 43, debt: 25, others: 32 };
const VALUES: RowValues = {
  multi_asset: 20, low_beta_equities: 18, high_beta_equities: 12, short_debt: 20, gold_commodities: 30,
};

const view = (onChange = vi.fn(), values: RowValues = VALUES) => {
  render(<SubcategoryPins mix={MIX} values={values} subcategories={CATS} onChange={onChange} />);
  return onChange;
};

describe("SubcategoryPins", () => {
  it("heads each class with the budget its rows divide up", () => {
    view();
    expect(screen.getByTestId("budget-equity").textContent).toBe(
      `${classBudget(MIX, VALUES, "equity").toFixed(1)}%`,
    );
  });

  it("labels rows without repeating the class word above them", () => {
    view();
    expect(screen.getByText("Large-cap")).toBeTruthy();
    expect(screen.getByText("Short-duration")).toBeTruthy();
    expect(screen.queryByText(/large-cap equity/i)).toBeNull();
  });

  it("gives a class with two or more rows a bar to divide", () => {
    view();
    expect(screen.getByTestId("seg-low_beta_equities")).toBeTruthy();
  });

  // Gold is the only commodity row: a bar comparing it with nothing would just
  // duplicate the row beneath it.
  it("shows no bar for a class holding a single row", () => {
    view();
    expect(screen.queryByTestId("seg-gold_commodities")).toBeNull();
    expect(screen.getByText("Gold")).toBeTruthy();
  });

  it("hands the parent a distribution that is still exactly on budget", () => {
    const onChange = view();
    fireEvent.keyDown(screen.getAllByRole("slider")[0], { key: "ArrowLeft" });
    const next = onChange.mock.calls[0][0] as RowValues;
    expect(classAllocated(next, CATS, "equity")).toBe(classBudget(MIX, next, "equity"));
  });
});
