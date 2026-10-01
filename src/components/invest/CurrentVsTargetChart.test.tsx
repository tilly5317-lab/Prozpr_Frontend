/**
 * Tests for the "why isn't this my preference?" amber disclosure.
 *
 * A customer saved a 50/50 equity/debt preference, the allocation engine honoured it
 * exactly, and this chart's Target bar read 77/20 — because a rebalance is
 * cash-neutral and 84% of their holdings were under a year old. Both bars were
 * right; nothing on the page said why they differed, so the Target bar read as a
 * broken preference. The disclosure is the fix: one amber line carrying both
 * percentages, detail on tap.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurrentVsTargetChart } from "@/components/invest/CurrentVsTargetChart";

// The real run: current 85.7/11.1/3.2, plan 77.2/19.6/3.2, goal 50.1/49.9/0.
const ROWS = [
  {
    key: "equity",
    label: "Equity",
    color: "#2563EB",
    currentInr: 70194,
    targetInr: 63076,
    goalInr: 41000,
    amountText: "9% overweight · -₹7K",
  },
  {
    key: "debt",
    label: "Debt",
    color: "hsl(188 52% 41%)",
    currentInr: 9116,
    targetInr: 16016,
    goalInr: 40900,
    amountText: "9% underweight · +₹7K",
  },
  {
    key: "others",
    label: "Commodity",
    color: "hsl(38 64% 47%)",
    currentInr: 2635,
    targetInr: 2635,
    goalInr: 0,
    amountText: "On target",
  },
];

const GAP = {
  question: "This plan reaches 20% debt, not your 50%. Why?",
  summary: "Not all of your money is free to move yet.",
  points: [
    "A rebalance adds no new money. Every rupee it buys comes from something it sells.",
    "₹55,804 of your funds are under a year old.",
    "₹13,118 has crossed a year. That's all this plan can move today.",
  ],
  footnote: "A SIP or a lump sum is invested at your goal mix directly.",
};

const THREE_BARS = ["current", "target", "goal"] as const;

describe("the amber gap disclosure", () => {
  it("shows the question collapsed, with the detail hidden", () => {
    render(<CurrentVsTargetChart rows={ROWS} bars={[...THREE_BARS]} gap={GAP} />);
    expect(screen.getByText(GAP.question)).toBeInTheDocument();
    // The whole point of collapsing: the paragraph is not on screen until asked for.
    expect(screen.queryByText(GAP.summary)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Why\?$/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("reveals the summary, every point and the footnote on click", () => {
    render(<CurrentVsTargetChart rows={ROWS} bars={[...THREE_BARS]} gap={GAP} />);
    fireEvent.click(screen.getByRole("button", { name: /Why\?$/ }));

    expect(screen.getByText(GAP.summary)).toBeInTheDocument();
    for (const point of GAP.points) expect(screen.getByText(point)).toBeInTheDocument();
    expect(screen.getByText(GAP.footnote)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Why\?$/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("collapses again on a second click", () => {
    render(<CurrentVsTargetChart rows={ROWS} bars={[...THREE_BARS]} gap={GAP} />);
    const trigger = screen.getByRole("button", { name: /Why\?$/ });
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByText(GAP.summary)).not.toBeInTheDocument();
  });

  it("renders nothing when the plan reaches the goal (gap null)", () => {
    // The backend sends null under GAP_MIN_PCT — no disclosure, no empty divider.
    render(<CurrentVsTargetChart rows={ROWS} bars={[...THREE_BARS]} gap={null} />);
    expect(screen.queryByRole("button", { name: /Why\?$/ })).not.toBeInTheDocument();
  });

  it("omits the footnote when the backend sends none", () => {
    render(
      <CurrentVsTargetChart
        rows={ROWS}
        bars={[...THREE_BARS]}
        gap={{ ...GAP, footnote: null }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Why\?$/ }));
    expect(screen.getByText(GAP.summary)).toBeInTheDocument();
    expect(screen.queryByText(GAP.footnote)).not.toBeInTheDocument();
  });
});

describe("the three bars", () => {
  it("labels them Current / After plan / Your goal", () => {
    // "Target" alone is what customers read as their preference — the bar names
    // now say which is which.
    render(<CurrentVsTargetChart rows={ROWS} bars={[...THREE_BARS]} gap={GAP} />);
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("After plan")).toBeInTheDocument();
    expect(screen.getByText("Your goal")).toBeInTheDocument();
  });

  it("drops a goal segment worth 0 instead of rendering a zero-width bar", () => {
    // Commodity is goal 0. Its Current/After-plan segments still render.
    render(<CurrentVsTargetChart rows={ROWS} bars={[...THREE_BARS]} gap={GAP} />);
    expect(screen.getAllByLabelText(/^Commodity /)).toHaveLength(2);
  });

  it("still works as a target-only chart (the SIP / lump-sum tabs)", () => {
    render(<CurrentVsTargetChart rows={ROWS} bars={["target"]} title="Proposed Target" />);
    expect(screen.getByText("Proposed Target")).toBeInTheDocument();
    expect(screen.queryByText("Your goal")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Why\?$/ })).not.toBeInTheDocument();
  });
});
