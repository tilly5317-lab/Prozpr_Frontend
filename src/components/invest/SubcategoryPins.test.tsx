import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ScreenSubcategory } from "@/lib/api";
import SubcategoryPins from "./SubcategoryPins";

const MIX = { equity: 60, debt: 30, others: 10 };
const SUBS: ScreenSubcategory[] = [
  { id: "low_beta_equities", class: "equity", label: "Large-cap", recommended_pct_of_total: 15 },
  { id: "gold", class: "others", label: "Gold", recommended_pct_of_total: 8 },
];

afterEach(cleanup);

describe("SubcategoryPins add-flow", () => {
  it("pins a category to the entered share of total", () => {
    const onChange = vi.fn();
    render(<SubcategoryPins mix={MIX} pins={[]} subcategories={SUBS} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add a category preference/i }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: /add pin/i }));

    expect(onChange).toHaveBeenCalledWith([{ subgroup: "low_beta_equities", pct_of_total: 20 }]);
  });

  it("rejects a share larger than the class has room for", () => {
    const onChange = vi.fn();
    render(<SubcategoryPins mix={MIX} pins={[]} subcategories={SUBS} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /add a category preference/i }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: /add pin/i }));

    expect(screen.getByText(/more than Equity/i)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
