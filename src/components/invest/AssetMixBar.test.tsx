import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import AssetMixBar from "./AssetMixBar";

afterEach(cleanup);

const zIndexOf = (label: string) =>
  Number(screen.getByRole("slider", { name: label }).style.zIndex);

// When a class is 0 the two dividers land on the same spot. The handle still
// free to move must sit on top, or the pointer grabs the pinned one and the
// bar looks stuck (the 100%-equity saved-preference bug).
describe("AssetMixBar overlapping dividers", () => {
  it("keeps the equity handle on top at 100% equity (debt 0)", () => {
    render(<AssetMixBar mode="interactive" mix={{ equity: 100, debt: 0, others: 0 }} onChange={vi.fn()} />);
    expect(zIndexOf("Equity / Debt divider")).toBeGreaterThan(zIndexOf("Debt / Commodity divider"));
  });

  it("keeps the commodity handle on top at 100% commodity (equity 0)", () => {
    render(<AssetMixBar mode="interactive" mix={{ equity: 0, debt: 0, others: 100 }} onChange={vi.fn()} />);
    expect(zIndexOf("Debt / Commodity divider")).toBeGreaterThan(zIndexOf("Equity / Debt divider"));
  });
});
