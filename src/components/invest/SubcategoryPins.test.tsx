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
// A deliberately different shape from VALUES, so a today figure can never be
// mistaken for the customer's own.
const TODAY: RowValues = {
  multi_asset: 6, low_beta_equities: 40, high_beta_equities: 4, short_debt: 30, gold_commodities: 20,
};

const view = (values: RowValues = VALUES, today: RowValues | null = null, onChange = vi.fn()) => {
  render(<SubcategoryPins mix={MIX} values={values} subcategories={CATS} today={today} onChange={onChange} />);
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

  it("heads the whole section with the three columns once today is known", () => {
    view(VALUES, TODAY);
    // Once, above multi-asset — not per group. The columns are identical all
    // the way down, and four copies is three too many.
    expect(screen.getAllByText("Prozpr")).toHaveLength(1);
    expect(screen.getAllByText("Today")).toHaveLength(1);
    expect(screen.getAllByText("You")).toHaveLength(1);
  });

  it("gives each row its own today figure", () => {
    view(VALUES, TODAY);
    expect(screen.getByTestId("today-low_beta_equities").textContent).toBe("40.0");
    expect(screen.getByTestId("today-high_beta_equities").textContent).toBe("4.0");
  });

  // Compared like with like: the budget beside it is also net of multi-asset,
  // so this figure counts the class's own rows and nothing else.
  it("heads a class with today's share of its own rows, net of multi-asset", () => {
    view(VALUES, TODAY);
    expect(screen.getByTestId("today-equity").textContent).toContain("44.0");
  });

  it("drops the today column, and nothing else, when there is no today", () => {
    view();
    expect(screen.getByText("Prozpr")).toBeTruthy();
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByTestId("today-low_beta_equities")).toBeNull();
    expect(screen.queryByTestId("today-equity")).toBeNull();
  });

  it("lets a row be typed, rebalancing its siblings and nothing else", () => {
    const onChange = view();
    fireEvent.click(screen.getByRole("button", { name: "Large-cap share" }));
    const box = screen.getByRole("textbox", { name: "Large-cap share" });
    fireEvent.change(box, { target: { value: "20" } });
    fireEvent.keyDown(box, { key: "Enter" });
    const next = onChange.mock.calls[0][0] as RowValues;
    expect(next.low_beta_equities).toBe(20);
    // The class total — and so the bar above it — is exactly where it was.
    expect(classAllocated(next, CATS, "equity")).toBe(classBudget(MIX, next, "equity"));
    expect(next.short_debt).toBe(20);
  });

  // Typing moves every sibling at once where a drag trades with one neighbour,
  // so the customer has to see it happen (spec D7).
  it("flashes the rows a typed value moved", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Large-cap share" }));
    const box = screen.getByRole("textbox", { name: "Large-cap share" });
    fireEvent.change(box, { target: { value: "20" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.getByTestId("row-high_beta_equities").dataset.flashed).toBe("true");
    expect(screen.getByTestId("row-low_beta_equities").dataset.flashed).toBeUndefined();
  });

  // Gold is the only commodity row, so it IS the budget: any number typed is
  // clamped straight back. Offer no edit rather than an edit that does nothing.
  it("leaves a single-row class as plain text", () => {
    view(VALUES, TODAY);
    expect(screen.queryByRole("button", { name: "Gold share" })).toBeNull();
    expect(screen.getByTestId("you-gold_commodities").textContent).toBe("30.0%");
  });

  // Same rule, same condition ClassSegmentBar uses for its dividers: a field
  // that can only ever return 0.0 is not an affordance.
  it("leaves a class with no budget as plain text", () => {
    view({ ...VALUES, multi_asset: 66.1 });
    expect(screen.queryByRole("button", { name: "Large-cap share" })).toBeNull();
  });
});
