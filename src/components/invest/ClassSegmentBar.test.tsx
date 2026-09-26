import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ScreenSubcategory } from "@/lib/api";
import { classAllocated, type RowValues } from "@/lib/investment-preferences";
import ClassSegmentBar from "./ClassSegmentBar";

afterEach(cleanup);

const ROWS: ScreenSubcategory[] = [
  { id: "a", class: "equity", label: "large-cap equity", recommended_pct_of_total: 30 },
  { id: "b", class: "equity", label: "small-cap equity", recommended_pct_of_total: 20 },
  { id: "c", class: "equity", label: "US equity", recommended_pct_of_total: 10 },
];
const VALUES: RowValues = { a: 30, b: 20, c: 10 };

const bar = (values = VALUES, budget = 60, onChange = vi.fn()) => {
  render(<ClassSegmentBar cls="equity" rows={ROWS} values={values} budget={budget} onChange={onChange} />);
  return onChange;
};

describe("ClassSegmentBar", () => {
  it("sizes each segment by its share of the budget", () => {
    bar();
    expect(screen.getByTestId("seg-a").style.width).toBe("50%");
    expect(screen.getByTestId("seg-b").style.width).toBe("33.3333%");
  });

  it("puts a divider between every pair of rows and nowhere else", () => {
    bar();
    expect(screen.getAllByRole("slider")).toHaveLength(ROWS.length - 1);
  });

  it("names a divider by the two rows it trades, in customer-facing words", () => {
    bar();
    expect(screen.getByRole("slider", { name: "Large-cap / Small-cap divider" })).toBeTruthy();
  });

  it("nudges with the arrow keys and stays exactly on budget", () => {
    const onChange = bar();
    fireEvent.keyDown(screen.getAllByRole("slider")[0], { key: "ArrowRight" });
    const next = onChange.mock.calls[0][0] as RowValues;
    expect(next).toMatchObject({ a: 31, b: 19, c: 10 });
    expect(classAllocated(next, ROWS, "equity")).toBe(60);
  });

  // A class dragged flat leaves two dividers on the same spot. Both must still
  // be in the DOM, or the collapsed row can never be grown back.
  it("keeps both dividers of a collapsed row reachable", () => {
    bar({ a: 30, b: 0, c: 30 });
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    fireEvent.keyDown(screen.getAllByRole("slider")[1], { key: "ArrowRight" });
  });

  it("gives a collapsed row a grabbable sliver, not zero pixels", () => {
    bar({ a: 30, b: 0, c: 30 });
    expect(screen.getByTestId("seg-b").style.width).toBe("1.5%");
  });

  // Stacked dividers are grabbable but indistinguishable, and a divider on the
  // bar's own edge reads as an end cap rather than a control.
  it("never lands two dividers on one pixel, nor one on the bar's edge", () => {
    bar({ a: 30, b: 0, c: 30 });
    const lefts = screen.getAllByRole("slider").map((h) => parseFloat(h.style.left));
    expect(new Set(lefts).size).toBe(lefts.length);
    for (const l of lefts) expect(l > 0 && l < 100).toBe(true);
  });

  it("has nothing to drag when the class holds a single row", () => {
    render(
      <ClassSegmentBar cls="others" rows={[ROWS[0]]} values={{ a: 40 }} budget={40} onChange={vi.fn()} />,
    );
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("survives a zero budget without dividing by it", () => {
    bar({ a: 0, b: 0, c: 0 }, 0);
    expect(screen.getByTestId("seg-a").style.width).toBe("0%");
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });
});
