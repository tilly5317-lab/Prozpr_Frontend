import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import CategoriesCard, { type Editor } from "./CategoriesCard";

afterEach(cleanup);

type Mine = { multiAsset: boolean; equity: boolean; debt: boolean; others: boolean };
const PROZPR: Mine = { multiAsset: false, equity: false, debt: false, others: false };

const view = ({
  mine = PROZPR,
  open = null as Editor | null,
  unbalanced = [] as ("equity" | "debt")[],
} = {}) => {
  const onToggle = vi.fn();
  render(
    <CategoriesCard
      mine={mine}
      unbalanced={unbalanced}
      open={open}
      onToggle={onToggle}
      renderPanel={(e) => <p>{`panel ${e}`}</p>}
    />,
  );
  return onToggle;
};
const row = (name: RegExp) => screen.getByRole("button", { name });
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("CategoriesCard", () => {
  it("says each row is Prozpr's recommendation while it is", () => {
    view();
    expect(row(/^Multi-asset funds/)).toHaveTextContent("Prozpr's recommendation");
    expect(row(/^Equity categories/)).toHaveTextContent("Prozpr's recommendation");
    expect(row(/^Debt categories/)).toHaveTextContent("Prozpr's recommendation");
    expect(row(/^Commodity categories/)).toHaveTextContent("Prozpr's recommendation");
    expect(row(/^Commodity categories/)).not.toHaveTextContent("Gold");
  });

  // The row names whose choice it is, like every other row — not an amount.
  it("shows no percentage on the multi-asset row", () => {
    view({ mine: { ...PROZPR, multiAsset: true } });
    expect(row(/^Multi-asset funds/)).not.toHaveTextContent("%");
  });

  it("says which rows are the customer's preference", () => {
    view({ mine: { multiAsset: true, equity: true, debt: false, others: true } });
    expect(row(/^Multi-asset funds/)).toHaveTextContent("Your preference");
    expect(row(/^Equity categories/)).toHaveTextContent("Your preference");
    expect(row(/^Debt categories/)).toHaveTextContent("Prozpr's recommendation");
    expect(row(/^Commodity categories/)).toHaveTextContent("Your preference");
  });

  // Closed, the row is the only place left that says the group needs fixing.
  it("flags a group that doesn't add up yet", () => {
    view({ mine: { ...PROZPR, equity: true }, unbalanced: ["equity"] });
    expect(row(/^Equity categories/)).toHaveTextContent("Doesn't add up");
    expect(row(/^Debt categories/)).toHaveTextContent("Prozpr's recommendation");
  });

  it("opens only the group it is told to, right under its own row", () => {
    view({ open: "equity" });
    expect(row(/^Equity categories/)).toHaveAttribute("aria-expanded", "true");
    expect(row(/^Debt categories/)).toHaveAttribute("aria-expanded", "false");
    const panel = screen.getByText("panel equity");
    expect(screen.queryByText("panel debt")).toBeNull();
    expect(follows(row(/^Equity categories/), panel)).toBe(true);
    expect(follows(panel, row(/^Debt categories/))).toBe(true);
  });

  // How the card works is there when asked for, not always on it.
  it("keeps its explanation behind an ⓘ by the heading", () => {
    view();
    expect(screen.queryByText("We pick these to match your mix. Tap one to set your own.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About categories" }));
    const dialog = screen.getByRole("dialog", { name: "Categories" });
    expect(dialog).toHaveTextContent("We pick these to match your mix. Tap one to set your own.");
    expect(dialog).toHaveTextContent(
      "This is a directional target — we'll get as close to it as we can, and the exact split can move slightly when we fit real funds. You can clear your preference any time.",
    );
  });

  // Open, the row is only the group's title: the status line would repeat
  // what the open group already shows. Closed rows keep theirs.
  it("hides an open group's status, and only its", () => {
    view({ open: "multi-asset", mine: { ...PROZPR, equity: true }, unbalanced: ["equity"] });
    expect(row(/^Multi-asset funds/)).toHaveTextContent(/^Multi-asset funds$/);
    expect(row(/^Equity categories/)).toHaveTextContent("Doesn't add up");
    expect(row(/^Debt categories/)).toHaveTextContent("Prozpr's recommendation");
    cleanup();
    view({ open: "equity", mine: { ...PROZPR, equity: true }, unbalanced: ["equity"] });
    expect(row(/^Equity categories/)).toHaveTextContent(/^Equity categories$/);
    expect(row(/^Multi-asset funds/)).toHaveTextContent("Prozpr's recommendation");
  });

  it("toggles the group each row names", () => {
    const onToggle = view();
    for (const name of [/^Multi-asset funds/, /^Equity categories/, /^Debt categories/, /^Commodity categories/]) {
      fireEvent.click(row(name));
    }
    expect(onToggle.mock.calls).toEqual([["multi-asset"], ["equity"], ["debt"], ["others"]]);
  });
});
