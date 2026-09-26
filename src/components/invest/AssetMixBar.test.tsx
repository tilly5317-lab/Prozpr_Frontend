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

const leftOf = (label: string) =>
  parseFloat(screen.getByRole("slider", { name: label }).style.left);

// Same rule as the class bars: a segment floored to a visible sliver keeps the
// two dividers apart and off the bar's own edge.
describe("AssetMixBar handle separation", () => {
  it("keeps the dividers apart when a class is squeezed to nothing", () => {
    render(<AssetMixBar mode="interactive" mix={{ equity: 100, debt: 0, others: 0 }} onChange={vi.fn()} />);
    expect(leftOf("Debt / Commodity divider")).toBeGreaterThan(leftOf("Equity / Debt divider"));
  });

  it("never puts a divider on the bar's edge", () => {
    render(<AssetMixBar mode="interactive" mix={{ equity: 0, debt: 0, others: 100 }} onChange={vi.fn()} />);
    for (const l of [leftOf("Equity / Debt divider"), leftOf("Debt / Commodity divider")]) {
      expect(l > 0 && l < 100).toBe(true);
    }
  });

  it("prints each class as a whole percent, never a float artifact", () => {
    render(<AssetMixBar mode="reference" mix={{ equity: 62, debt: 28, others: 10 }} />);
    expect(screen.getByText("28%")).toBeTruthy();
  });
});

// The floor exists so two dividers cannot stack on one pixel. A reference bar
// has no dividers, so flooring it only invents a class the customer does not
// hold — and labelMin hides its label, leaving nothing to explain the sliver.
describe("AssetMixBar reference bars draw true shares", () => {
  it("draws nothing at all for a class at zero", () => {
    render(<AssetMixBar mode="reference" mix={{ equity: 70, debt: 30, others: 0 }} />);
    expect(screen.getByTestId("mix-seg-others").style.width).toBe("0%");
  });

  it("still floors the interactive bar, where the dividers live", () => {
    render(
      <AssetMixBar mode="interactive" mix={{ equity: 70, debt: 30, others: 0 }} onChange={vi.fn()} />,
    );
    expect(parseFloat(screen.getByTestId("mix-seg-others").style.width)).toBeGreaterThan(0);
  });
});

// The three bars in the top card read as one control group, so the reference
// bars carry the same height as the interactive one — only the drag handles
// and the flooring below them differ, not the bar's weight on the page.
describe("AssetMixBar bar height", () => {
  const heightOf = (el: Element) => (el as HTMLElement).className.match(/h-\[(\d+)px\]/)?.[1];

  it("draws reference and interactive bars at the same height", () => {
    const mix = { equity: 60, debt: 30, others: 10 };
    const { container: iC } = render(<AssetMixBar mode="interactive" mix={mix} onChange={vi.fn()} />);
    const { container: rC } = render(<AssetMixBar mode="reference" mix={mix} />);
    expect(heightOf(rC.firstChild as Element)).toBe(heightOf(iC.firstChild as Element));
  });
});
