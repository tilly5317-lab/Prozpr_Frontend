import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ClassMix } from "@/lib/api";
import MultiAssetBar from "./MultiAssetBar";

afterEach(cleanup);

// The cap is the scarcest class over the sleeve's 65/25/10 draw, so these
// splits fund the whole sleeve, half of it, 40% of it, and none of it.
const FULL: ClassMix = { equity: 65, debt: 25, others: 10 };
const HALF: ClassMix = { equity: 70, debt: 25, others: 5 };
const FORTY: ClassMix = { equity: 66, debt: 30, others: 4 };
const NO_COMMODITY: ClassMix = { equity: 70, debt: 30, others: 0 };

const bar = (value: number, mix: ClassMix = FULL, today: number | null = null, onChange = vi.fn()) => {
  render(
    <MultiAssetBar
      label="multi-asset funds"
      value={value}
      mix={mix}
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
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("13% Equity");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("5% Debt");
    expect(screen.getByTestId("ma-breakdown").textContent).toContain("2% Commodity");
  });

  it("capitalises the backend's prose label", () => {
    bar(20);
    expect(screen.getByText("Multi-asset funds")).toBeTruthy();
  });

  // The bar spans the WHOLE portfolio, which is what makes a width here mean
  // what a width means on every other bar on the screen (spec §5).
  it("fills its share of the whole portfolio, not of the cap", () => {
    bar(20, HALF);
    expect(screen.getByTestId("ma-fill").style.width).toBe("20%");
  });

  it("names the cap the customer's own split can fund", () => {
    bar(20, HALF);
    expect(divider().getAttribute("aria-valuemax")).toBe("50");
  });

  // The only thing on the screen that states the ceiling: no tint or pattern
  // in this palette is legible enough to carry it (spec §5).
  it("says in words what the cap is", () => {
    bar(20, FORTY);
    expect(screen.getByText("Up to 40% — that's what your split can fund.")).toBeTruthy();
  });

  // Without this, the `max < 100` condition could be deleted and every other
  // test would stay green — nothing else asserts the caption is ever ABSENT.
  it("hides the cap caption when the split can fund the whole thing", () => {
    bar(20, FULL);
    expect(screen.queryByText("Up to 100% — that's what your split can fund.")).toBeNull();
  });

  it("nudges by a whole point with the arrow keys", () => {
    const onChange = bar(20, HALF);
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(21);
  });

  // The cap is what retired the overdraw error: the divider simply stops, so
  // there is nothing left to warn about.
  it("stops at the cap rather than reporting an overdraw", () => {
    const onChange = bar(50, HALF);
    fireEvent.keyDown(divider(), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(50);
  });

  it("stops at zero going the other way", () => {
    const onChange = bar(0, HALF);
    fireEvent.keyDown(divider(), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it("grabs the divider and drags, clamped to the cap", () => {
    const onChange = bar(20, HALF);
    const el = layOut(300);
    fireEvent.pointerDown(el, { clientX: 63, pointerId: 1 });   // 21% — on the divider
    expect(onChange).not.toHaveBeenCalled();                     // grabbing moves nothing
    fireEvent.pointerMove(el, { clientX: 270, pointerId: 1 });   // 90% — past the cap
    expect(onChange).toHaveBeenLastCalledWith(50);
  });

  // ClassSegmentBar's rule: a press that is not on a divider does nothing. The
  // Radix slider jumped to it, which on a phone is one stray tap from a reset.
  it("ignores a press on open track", () => {
    const onChange = bar(20, HALF);
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
    const onChange = bar(20, HALF);
    fireEvent.pointerDown(screen.getByTestId("ma-bar"), { clientX: 60, pointerId: 1 });
    fireEvent.pointerMove(screen.getByTestId("ma-bar"), { clientX: 60, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows today's figure when there is one", () => {
    bar(20, FULL, 6);
    expect(screen.getByTestId("ma-today").textContent).toBe("6");
  });

  it("says nothing about today when there is none", () => {
    bar(20);
    expect(screen.queryByTestId("ma-today")).toBeNull();
  });

  it("lets the customer type the figure instead of dragging it", () => {
    const onChange = bar(20, HALF);
    fireEvent.click(screen.getByRole("button", { name: "Multi-asset share" }));
    const box = screen.getByRole("textbox", { name: "Multi-asset share" });
    fireEvent.change(box, { target: { value: "40" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(40);
  });

  // The case above never reaches the clamp — 40 is under the cap of 50, so it
  // only proves the type -> onChange wire. This guards the `max` PASSED DOWN
  // to EditableFigure: if that wiring were ever dropped or hardcoded to 100,
  // a customer could type a share their own split cannot fund, and nothing
  // else on this branch would notice — EditableFigure's own tests only see a
  // standalone component with whatever `max` they hand it directly.
  //
  // The assertion is on the DRAFT, not just the eventual commit: MultiAssetBar's
  // own `commit` re-clamps to `max` regardless of what EditableFigure passes it,
  // so typing "80" lands on onChange(50) whether or not `max` ever reached
  // EditableFigure — that clamp alone can't tell wired-correctly from
  // wired-wrong-but-caught-downstream. Only the draft, checked before Enter, can
  // see whether EditableFigure itself clamped as the customer typed.
  it("clamps a typed figure to what the split can fund", () => {
    const onChange = bar(20, HALF);
    fireEvent.click(screen.getByRole("button", { name: "Multi-asset share" }));
    const box = screen.getByRole("textbox", { name: "Multi-asset share" }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "80" } });
    expect(box.value).toBe("50");
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(50);
  });

  // The sleeve draws on all three classes, so any class at zero kills this
  // fund. Say so rather than leave two live-but-dead affordances on the screen
  // (spec §5).
  it("explains itself instead of going dead when nothing can fund it", () => {
    bar(0, NO_COMMODITY);
    expect(
      screen.getByText("This fund is 10% commodity. Give commodity some room and you can hold it."),
    ).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: "Multi-asset share" })).toBeNull();
  });

  // ...and say WHICH class. It used to blame commodity whatever the customer
  // had actually starved.
  it.each([
    [{ equity: 90, debt: 0, others: 10 }, "This fund is 25% debt. Give debt some room and you can hold it."],
    [{ equity: 0, debt: 90, others: 10 }, "This fund is 65% equity. Give equity some room and you can hold it."],
    [{ equity: 0, debt: 100, others: 0 }, "This fund is 65% equity and 10% commodity. Give them some room and you can hold it."],
  ])("names whichever class the customer starved (%o)", (mix, message) => {
    bar(0, mix);
    expect(screen.getByText(message)).toBeTruthy();
  });
});
