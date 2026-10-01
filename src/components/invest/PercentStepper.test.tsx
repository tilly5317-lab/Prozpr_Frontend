import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import PercentStepper from "./PercentStepper";

afterEach(cleanup);

const view = (value: number, max = 100) => {
  const onChange = vi.fn();
  render(<PercentStepper value={value} max={max} label="Large-cap" onChange={onChange} />);
  return onChange;
};

describe("PercentStepper", () => {
  it("steps by one either way", () => {
    const onChange = view(11);
    fireEvent.click(screen.getByRole("button", { name: "Increase Large-cap" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease Large-cap" }));
    expect(onChange.mock.calls).toEqual([[12], [10]]);
  });

  // Each end on its own, so a swapped pair of conditions cannot pass.
  it("stops at 0 and at its max", () => {
    view(0, 5);
    expect(screen.getByRole("button", { name: "Decrease Large-cap" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase Large-cap" })).toBeEnabled();
    cleanup();
    view(5, 5);
    expect(screen.getByRole("button", { name: "Decrease Large-cap" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Increase Large-cap" })).toBeDisabled();
  });

  it("takes a typed value, held to its max", () => {
    const onChange = view(11, 40);
    fireEvent.click(screen.getByRole("button", { name: /^Large-cap percentage/ }));
    const box = screen.getByRole("textbox", { name: "Large-cap percentage" });
    expect(box).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(box, { target: { value: "9a9" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(40);
  });
});
