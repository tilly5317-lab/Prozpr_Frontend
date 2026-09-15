import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import type { RowValues } from "@/lib/investment-preferences";
import SubcategoryPins from "./SubcategoryPins";

const CATS: ScreenSubcategory[] = [
  { id: "multi_asset",       class: "equity", label: "Multi-Asset", recommended_pct_of_total: 20 },
  { id: "low_beta_equities", class: "equity", label: "Large-cap",   recommended_pct_of_total: 30 },
  { id: "short_debt",        class: "debt",   label: "Short Debt",  recommended_pct_of_total: 20 },
  { id: "arbitrage",         class: "debt",   label: "Arbitrage",   recommended_pct_of_total: 0 },
  { id: "gold_commodities",  class: "others", label: "Gold",        recommended_pct_of_total: 30 },
];
const BAR: ClassMix = { equity: 43, debt: 25, others: 32 };
const view = (values: RowValues, onChange = () => {}) =>
  render(<SubcategoryPins values={values} subcategories={CATS} mix={BAR} onChange={onChange} />);

afterEach(cleanup);

describe("SubcategoryPins", () => {
  it("renders every settable category, not only the filled ones", () => {
    view({});
    for (const c of CATS) expect(screen.getByLabelText(c.label)).toBeInTheDocument();
  });

  it("shows no budgets, warnings or bars until the customer engages", () => {
    view({});
    expect(screen.queryByTestId("bars-label")).not.toBeInTheDocument();
    expect(screen.queryByText(/of 30\.0%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left|over|balanced/i)).not.toBeInTheDocument();
  });

  it("groups rows under their class with a live budget once engaged", () => {
    view({ multi_asset: 20, low_beta_equities: 24 });
    // equity budget = 43 - 13 = 30; allocated 24 => 6 left
    expect(screen.getByTestId("group-equity")).toHaveTextContent("24.0 of 30.0%");
    expect(screen.getByTestId("group-equity")).toHaveTextContent("6.0% left");
  });

  it("never prints a negative amount of room", () => {
    view({ multi_asset: 20, low_beta_equities: 24 });
    expect(screen.getByTestId("group-equity")).not.toHaveTextContent("-6.0");
  });

  it("marks a class balanced when its rows hit the budget exactly", () => {
    view({ multi_asset: 20, gold_commodities: 30 });
    expect(screen.getByTestId("group-others")).toHaveTextContent("balanced");
  });

  it("marks a class over when its rows exceed the budget", () => {
    view({ multi_asset: 20, low_beta_equities: 36 });
    expect(screen.getByTestId("group-equity")).toHaveTextContent("6.0% over");
  });

  it("goes neutral on the class a multi-asset entry overdraws", () => {
    // debt budget = 4 - 5 = -1: the actionable message belongs on the
    // multi-asset row (spec §6), so the group must not print "0.0 of -1.0%".
    render(<SubcategoryPins values={{ multi_asset: 20 }} subcategories={CATS}
      mix={{ equity: 88, debt: 4, others: 8 }} onChange={() => {}} />);
    expect(screen.getByTestId("group-debt")).not.toHaveTextContent("-1.0");
    expect(screen.getByTestId("group-debt")).not.toHaveTextContent("over");
  });

  it("draws the comparison bars per class, but not on the overdrawn one", () => {
    // debt has two rows, so its bars compare something; equity's budget is fine.
    view({ multi_asset: 20, short_debt: 10 });
    expect(within(screen.getByTestId("group-debt")).getByTestId("bars-label"))
      .toBeInTheDocument();
    // same overdraw as above: debt budget = 4 - 5 = -1.
    cleanup();
    render(<SubcategoryPins values={{ multi_asset: 20 }} subcategories={CATS}
      mix={{ equity: 88, debt: 4, others: 8 }} onChange={() => {}} />);
    expect(within(screen.getByTestId("group-debt")).queryByTestId("bars-label"))
      .not.toBeInTheDocument();
  });

  it("does not draw bars for a class with a single row — they compare nothing", () => {
    // Commodity holds only gold, so both bars would be one full-width segment,
    // duplicating the row beneath. Real catalogs have exactly this shape.
    view({ multi_asset: 20, gold_commodities: 30 });
    expect(within(screen.getByTestId("group-others")).queryByTestId("bars-label"))
      .not.toBeInTheDocument();
  });

  it("goes neutral on EVERY class multi-asset overdraws, not just the first", () => {
    // ma 20 draws 13/5/2. With the bar at 95/4/1 BOTH debt (4-5) and commodity
    // (1-2) go negative. multiAssetOverdraw only ever names the first one, so a
    // group gated on that comparison leaves the second rendering "0.0 of -1.0%".
    render(<SubcategoryPins values={{ multi_asset: 20 }} subcategories={CATS}
      mix={{ equity: 95, debt: 4, others: 1 }} onChange={() => {}} />);
    for (const cls of ["debt", "others"]) {
      expect(screen.getByTestId(`group-${cls}`)).not.toHaveTextContent("-1.0");
      expect(screen.getByTestId(`group-${cls}`)).not.toHaveTextContent("over");
      expect(within(screen.getByTestId(`group-${cls}`)).queryByTestId("bars-label"))
        .not.toBeInTheDocument();
    }
  });

  it("emits the whole next RowValues on a keystroke", () => {
    const onChange = vi.fn();
    view({ multi_asset: 20 }, onChange);
    fireEvent.change(screen.getByLabelText("Large-cap"), { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith({ multi_asset: 20, low_beta_equities: 12 });
  });
});
