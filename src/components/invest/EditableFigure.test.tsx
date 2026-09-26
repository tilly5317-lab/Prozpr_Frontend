import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import EditableFigure from "./EditableFigure";

afterEach(cleanup);

const figure = (max = 25, onCommit = vi.fn(), value = 18) => {
  render(
    <EditableFigure value={value} max={max} label="Large-cap" onCommit={onCommit} className="w-[46px]" />,
  );
  return onCommit;
};
const resting = () => screen.getByRole("button", { name: "Large-cap share" });
const field = () => screen.getByRole("textbox", { name: "Large-cap share" }) as HTMLInputElement;

describe("EditableFigure", () => {
  it("rests as a figure, not a form", () => {
    figure();
    expect(resting().textContent).toBe("18%");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Single tap, not double: this is a touch-first app, and on iOS a double-tap
  // on text raises the selection callout instead (spec §7.1).
  it("opens on a single click, seeded with the current figure", () => {
    figure();
    fireEvent.click(resting());
    expect(field().value).toBe("18");
  });

  it("commits the typed number on Enter", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "12" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(12);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("commits on blur", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "8" } });
    fireEvent.blur(field());
    expect(onCommit).toHaveBeenCalledWith(8);
  });

  // An over-budget figure is never displayable, so nothing has to be silently
  // rejected on commit — which is what "it ignored me" used to look like.
  it("lets a part-typed value through on its way to a legal one", () => {
    figure(25);
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "" } });
    expect(field().value).toBe("");
    fireEvent.change(field(), { target: { value: "2" } });
    expect(field().value).toBe("2");
  });

  it("restores the figure on Escape and commits nothing", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "12" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(resting().textContent).toBe("18%");
  });

  it("returns focus to the figure when the keyboard closed the edit", () => {
    figure();
    fireEvent.click(resting());
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(document.activeElement).toBe(resting());
  });

  // ...but not otherwise: pulling focus back on blur drags it away from
  // whatever the customer had just tapped.
  it("leaves focus alone when the customer taps away", () => {
    figure();
    fireEvent.click(resting());
    fireEvent.blur(field());
    expect(document.activeElement).not.toBe(resting());
  });

  // A stray tap-then-blur would otherwise engage the customer's own distribution
  // — turning "engine decides" into a pin — and enable Save, changing what a save
  // MEANS with no edit having happened (spec §7.2).
  it("commits nothing when the value did not change", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.blur(field());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("discards a value that is not a number", () => {
    const onCommit = figure();
    fireEvent.click(resting());
    fireEvent.change(field(), { target: { value: "abc" } });
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(resting().textContent).toBe("18%");
  });

  // A hand-checked table protects nothing past the moment someone edits the
  // sanitiser: two defects on this plan (a residual-clipping bug in `spread`,
  // and this component's own missing input floor) already got through
  // review because their behaviour lived in a table a person read once, not
  // in an assertion the suite re-runs. Encoding every row here means a
  // future change that drops, say, the decimal truncation fails CI instead
  // of waiting for the next human to reread the table.
  it("keeps the field a whole number inside the budget, whatever is typed", () => {
    figure(25);
    fireEvent.click(resting());
    const cases: [string, string][] = [
      ["", ""],
      ["18", "18"],
      [".", ""],          // a decimal point is stripped — whole percents only
      ["2.5", "25"],      // the dot drops out, leaving "25", which is within budget
      ["-", ""],
      ["-5", "5"],
      ["1e3", "13"],      // the exponent character is stripped, leaving "13"
      ["25", "25"],
      ["30", "25"],       // clamped to max
      ["999", "25"],      // clamped to max
      ["abc", ""],
    ];
    for (const [typed, expected] of cases) {
      fireEvent.change(field(), { target: { value: typed } });
      expect(field().value).toBe(expected);
    }
  });
});
