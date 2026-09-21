import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import MultiAssetBar from "./MultiAssetBar";

afterEach(cleanup);

const bar = (value: number, max = 100, today: number | null = null, onChange = vi.fn()) => {
  render(
    <MultiAssetBar
      label="multi-asset funds"
      value={value}
      max={max}
      recommended={20}
      today={today}
      onChange={onChange}
    />,
  );
  return onChange;
};
const divider = () => screen.getByRole("slider", { name: "Multi-asset share of your portfolio" });

// jsdom gives every element a zero-width box, and the component refuses to act
// on a bar it cannot measure — the guard that stops a press on an unlaid-out
// bar from silently emptying the sleeve.
const layOut = (width = 300) => {
  const el = screen.getByTestId("ma-bar");
  el.getBoundingClientRect = () =>
    ({ left: 0, right: width, width, top: 0, bottom: 26, height: 26, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
};

describe("MultiAssetBar", () => {
  it("spells out what the sleeve counts as in each class", () => {
    bar(20);
    // 65 / 25 / 10 of 20, equity carrying the residual
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("13.0% Equity");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("5.0% Debt");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("2.0% Commodity");
  });

  it("capitalises the backend's prose label", () => {
    bar(20);
    expect(screen.getByText("Multi-asset funds")).toBeTruthy();
  });

  // The bar spans the WHOLE portfolio, which is what makes a width here mean
  // what a width means on every other bar on the screen (spec §5).
  it("fills its share of the whole portfolio, not of the cap", () => {
    bar(20, 50);
    expect(screen.getByTestId("ma-fill").style.width).toBe("20%");
  });

  it("names the cap the customer's own split can fund", () => {
    bar(20, 50);
    expect(divider().getAttribute("aria-valuemax")).toBe("50");
  });

  // The only thing on the screen that states the ceiling: no tint or pattern
  // in this palette is legible enough to carry it (spec §5).
  it("says in words what the cap is", () => {
    bar(20, 32);
    expect(screen.getByText("Up to 32.0% — that's what your split can fund.")).toBeTruthy();
  });

  it("nudges by a half point with the arrow keys", () => {
    const onChange = bar(20, 50);
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(20.5);
  });

  // The cap is what retired the overdraw error: the divider simply stops, so
  // there is nothing left to warn about.
  it("stops at the cap rather than reporting an overdraw", () => {
    const onChange = bar(50, 50);
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it("stops at zero going the other way", () => {
    const onChange = bar(0, 50);
    fireEvent.keyDown(divider(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("grabs the divider and drags, clamped to the cap", () => {
    const onChange = bar(20, 50);
    const el = layOut(300);
    fireEvent.pointerDown(el, { clientX: 63, pointerId: 1 });   // 21% — on the divider
    expect(onChange).not.toHaveBeenCalled();                     // grabbing moves nothing
    fireEvent.pointerMove(el, { clientX: 270, pointerId: 1 });   // 90% — past the cap
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  // ClassSegmentBar's rule: a press that is not on a divider does nothing. The
  // Radix slider jumped to it, which on a phone is one stray tap from a reset.
  it("ignores a press on open track", () => {
    const onChange = bar(20, 50);
    const el = layOut(300);
    fireEvent.pointerDown(el, { clientX: 30, pointerId: 1 });    // 10%
    fireEvent.pointerMove(el, { clientX: 45, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  // A press alone never commits — that's the grab-only rule every other test
  // here relies on — so a down-only test would pass even with the width guard
  // deleted from onDown. Only a drag (down THEN move) reaches the commit path
  // and actually exercises the guard that stops an unmeasurable bar from
  // jamming the fund to whatever `pctFromClientX` makes of a zero-width box.
  it("never commits a drag on a bar it cannot measure", () => {
    const onChange = bar(20, 50);
    fireEvent.pointerDown(screen.getByTestId("ma-bar"), { clientX: 60, pointerId: 1 });
    fireEvent.pointerMove(screen.getByTestId("ma-bar"), { clientX: 60, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows today's figure when there is one", () => {
    bar(20, 100, 6.4);
    expect(screen.getByTestId("ma-today").textContent).toBe("6.4");
  });

  it("says nothing about today when there is none", () => {
    bar(20);
    expect(screen.queryByTestId("ma-today")).toBeNull();
  });

  it("lets the customer type the figure instead of dragging it", () => {
    const onChange = bar(20, 50);
    fireEvent.click(screen.getByRole("button", { name: "Multi-asset share" }));
    const box = screen.getByRole("textbox", { name: "Multi-asset share" });
    fireEvent.change(box, { target: { value: "40" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(40);
  });

  // The sleeve is 10% commodity, so commodity alone sets the cap: a customer
  // who drags commodity to zero kills this fund. Say so rather than leave two
  // live-but-dead affordances on the screen (spec §5).
  it("explains itself instead of going dead when nothing can fund it", () => {
    bar(0, 0);
    expect(
      screen.getByText("This fund is 10% commodity. Give commodity some room and you can hold it."),
    ).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: "Multi-asset share" })).toBeNull();
  });
});
