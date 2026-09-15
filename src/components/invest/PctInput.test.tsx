import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import PctInput from "./PctInput";

afterEach(cleanup);

describe("PctInput", () => {
  const view = (value: number | null, onChange = () => {}) =>
    render(<PctInput label="Large-cap" value={value} onChange={onChange} />);

  it("snaps onto the one-decimal grid on blur", () => {
    const onChange = vi.fn();
    view(20, onChange);
    const el = screen.getByLabelText("Large-cap");
    fireEvent.change(el, { target: { value: "12.34" } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(12.3);
  });

  it("keeps a half-typed decimal in the field", () => {
    // <input type="number"> reports "" for "7.", so a controlled field bound to
    // it wipes the customer's keystrokes the moment they type the point — on a
    // screen whose whole premise is one-decimal precision.
    const onChange = vi.fn();
    view(null, onChange);
    const el = screen.getByLabelText("Large-cap") as HTMLInputElement;
    fireEvent.change(el, { target: { value: "7" } });
    fireEvent.change(el, { target: { value: "7." } });
    expect(el.value).toBe("7.");
    fireEvent.change(el, { target: { value: "7.5" } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(7.5);
  });

  it("clamps to 0-100 on blur", () => {
    const onChange = vi.fn();
    view(20, onChange);
    const el = screen.getByLabelText("Large-cap");
    fireEvent.change(el, { target: { value: "140" } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(100);
  });

  it("does not clamp mid-keystroke", () => {
    const onChange = vi.fn();
    view(null, onChange);
    fireEvent.change(screen.getByLabelText("Large-cap"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith(2);   // not snapped, not clamped, no blur yet
  });

  it("emits null for an empty field, never 0", () => {
    const onChange = vi.fn();
    view(20, onChange);
    const el = screen.getByLabelText("Large-cap");
    fireEvent.change(el, { target: { value: "" } });
    fireEvent.blur(el);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("shows a blank field for a null value", () => {
    view(null);
    expect(screen.getByLabelText("Large-cap")).toHaveValue("");
  });
});
