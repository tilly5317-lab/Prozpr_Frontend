import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import MultiAssetRow from "./MultiAssetRow";

afterEach(cleanup);

const row = (value: number, max = 100) =>
  render(
    <MultiAssetRow label="multi-asset funds" value={value} max={max} recommended={20} onChange={vi.fn()} />,
  );

describe("MultiAssetRow", () => {
  it("spells out what the sleeve counts as in each class", () => {
    row(20);
    // 65 / 25 / 10 of 20, equity carrying the residual
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("13.0% Equity");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("5.0% Debt");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("2.0% Commodity");
  });

  // The cap is what makes an overdrawn class impossible: the slider simply
  // stops, so there is no error left to report.
  it("stops at the largest entry the bar can fund", () => {
    row(20, 50);
    // The name matters as much as the cap: Radix puts role="slider" on the
    // thumb, so a label on the Root leaves the control unnamed.
    const thumb = screen.getByRole("slider", { name: /multi-asset share/i });
    expect(thumb.getAttribute("aria-valuemax")).toBe("50");
  });

  it("capitalises the backend's prose label", () => {
    row(20);
    expect(screen.getByText("Multi-asset funds")).toBeTruthy();
  });
});
