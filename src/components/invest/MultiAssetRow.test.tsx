import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import MultiAssetRow from "./MultiAssetRow";

const BAR = { equity: 78, debt: 14, others: 8 };
const props = { label: "Multi-Asset", recommended: 20, mix: BAR, onChange: () => {} };

afterEach(cleanup);

describe("MultiAssetRow", () => {
  it("shows the three-class breakdown of the entered value", () => {
    render(<MultiAssetRow {...props} value={20} />);
    expect(screen.getByTestId("ma-breakdown"))
      .toHaveTextContent("counts as 13.0% Equity · 5.0% Debt · 2.0% Commodity");
  });

  it("prints Prozpr's figure to one decimal", () => {
    render(<MultiAssetRow {...props} value={null} recommended={8} />);
    expect(screen.getByText("Prozpr 8.0%")).toBeInTheDocument();
  });

  it("names the class when the entry overdraws one", () => {
    render(<MultiAssetRow {...props} value={20} mix={{ equity: 88, debt: 4, others: 8 }} />);
    // scoped: the breakdown line also contains the word "debt"
    expect(within(screen.getByTestId("ma-overdraw")).getByText(
      /20\.0% multi-asset needs 5\.0% Debt but your bar only has 4\.0%/i)).toBeInTheDocument();
  });

  it("shows no breakdown and no error when blank", () => {
    render(<MultiAssetRow {...props} value={null} />);
    expect(screen.queryByTestId("ma-breakdown")).not.toBeInTheDocument();
    expect(screen.queryByTestId("ma-overdraw")).not.toBeInTheDocument();
  });

  it("snaps an over-precise entry onto the one-decimal grid on blur", () => {
    const onChange = vi.fn();
    render(<MultiAssetRow {...props} value={20} onChange={onChange} />);
    const input = screen.getByLabelText("Multi-Asset");
    fireEvent.change(input, { target: { value: "12.34" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith(12.3);
  });

  it("reports a cleared field as blank, not as zero", () => {
    const onChange = vi.fn();
    render(<MultiAssetRow {...props} value={20} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Multi-Asset"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
