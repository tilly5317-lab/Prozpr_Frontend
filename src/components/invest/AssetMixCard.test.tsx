import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ClassMix } from "@/lib/api";
import AssetMixCard from "./AssetMixCard";

afterEach(cleanup);

const START: ClassMix = { equity: 78, debt: 16, others: 6 };
// Distinct from START and from each other, so a figure shown in the wrong
// place cannot pass for the right one.
const REC: ClassMix = { equity: 70, debt: 20, others: 10 };
const TODAY: ClassMix = { equity: 55, debt: 40, others: 5 };

/** Holds the mix the way the page does. */
function Harness({ start = START, today = null }: { start?: ClassMix; today?: ClassMix | null }) {
  const [mix, setMix] = useState(start);
  return <AssetMixCard mix={mix} rec={REC} today={today} onChange={setMix} />;
}

const tap = (dir: "Increase" | "Decrease", label: string, times = 1) => {
  for (let i = 0; i < times; i++) {
    fireEvent.click(screen.getByRole("button", { name: `${dir} ${label}` }));
  }
};
const shown = () =>
  ["Equity", "Debt", "Commodity"]
    .map((l) => screen.getByRole("button", { name: new RegExp(`^${l} percentage`) }).textContent)
    .join(" / ");
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("AssetMixCard", () => {
  // No auto-scaling: when one class pulled the other two after it, a customer
  // stepping between classes could never land on the split they wanted.
  it("moves only the class it is set on", () => {
    render(<Harness />);
    tap("Increase", "Equity", 7);
    expect(shown()).toBe("85% / 16% / 6%");
    expect(screen.getByTestId("bar-you-equity").style.flexGrow).toBe("85");
    tap("Decrease", "Debt", 7);
    expect(shown()).toBe("85% / 9% / 6%");
  });

  it("lands a typed value on its own class alone", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^Equity percentage/ }));
    const box = screen.getByRole("textbox", { name: "Equity percentage" });
    fireEvent.change(box, { target: { value: "84" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(shown()).toBe("84% / 16% / 6%");
  });

  it("confirms a mix that adds up", () => {
    render(<Harness />);
    expect(screen.getByTestId("mix-total")).toHaveTextContent("Total100%");
  });

  // A status, so a screen reader hears the total move with every step.
  it.each([
    ["Decrease", "Debt", 5, "95% of 100% · add 5%"],
    ["Increase", "Commodity", 3, "103% of 100% · remove 3%"],
  ] as const)("says how far the mix is from a hundred (%s %s)", (dir, label, times, text) => {
    render(<Harness />);
    tap(dir, label, times);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  // Where the category groups keep theirs: in view while the customer steps.
  it("puts the total above the classes", () => {
    render(<Harness />);
    expect(follows(screen.getByTestId("mix-total"), screen.getByRole("button", { name: "Decrease Equity" }))).toBe(true);
  });

  // Under 100 the You bar shows what is missing, so it cannot look complete.
  it("leaves the missing part of the You bar empty", () => {
    render(<Harness />);
    expect(screen.queryByTestId("bar-you-gap")).toBeNull();
    tap("Decrease", "Debt", 5);
    expect(screen.getByTestId("bar-you-gap").style.flexGrow).toBe("5");
  });

  it("stops each class at 0% and 100%, and never at the others' total", () => {
    render(<Harness start={{ equity: 100, debt: 0, others: 0 }} />);
    expect(screen.getByRole("button", { name: "Increase Equity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease Debt" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Decrease Commodity" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Increase Debt" })).toBeEnabled();
  });

  it("puts today's and Prozpr's figures under each class", () => {
    render(<Harness today={TODAY} />);
    expect(screen.getByText("Today 55% · Prozpr 70%")).toBeInTheDocument();
    expect(screen.getByText("Today 5% · Prozpr 10%")).toBeInTheDocument();
  });

  it("leaves today out of the rows and the bars when there is none", () => {
    render(<Harness />);
    expect(screen.getByText("Prozpr 70%")).toBeInTheDocument();
    expect(screen.queryByTestId("bar-today")).toBeNull();
  });

  // The customer's bar sits in the grid like the other two — no gold ring
  // wrapped around it to single it out.
  it("draws the customer's bar like Today's and Prozpr's", () => {
    render(<Harness today={TODAY} />);
    const holder = (id: string) => screen.getByTestId(id).parentElement;
    expect(holder("bar-you")).toBe(holder("bar-prozpr"));
    expect(holder("bar-you")).toBe(holder("bar-today"));
  });
});
