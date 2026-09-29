import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import type { ClassMix } from "@/lib/api";
import { resolve, type RowValues } from "@/lib/investment-preferences";
import { CATALOG, COMP, MINE } from "@/test/preferences-fixtures";
import MultiAssetPanel from "./MultiAssetPanel";

afterEach(cleanup);

const view = (values: RowValues, mix: ClassMix = MINE, today: number | null = 10) => {
  const onChange = vi.fn();
  render(
    <MultiAssetPanel mix={mix} res={resolve(mix, values, CATALOG)} comp={COMP} today={today} onChange={onChange} />,
  );
  return onChange;
};
const button = (name: string | RegExp) => screen.getByRole("button", { name });
/** What the ⓘ says: the fund's make-up, then its limit. */
const info = () => {
  fireEvent.click(button("About multi-asset funds"));
  return screen.getByRole("dialog", { name: "Multi-asset funds" });
};
const AT_LIMIT = "That's the most your mix allows.";

describe("MultiAssetPanel", () => {
  it("shows where the customer is and Prozpr's figure", () => {
    view({ multi_asset: 30 });
    expect(screen.getByText("Today 10% · Prozpr 41%")).toBeInTheDocument();
    expect(button(/^Multi-asset funds percentage/)).toHaveTextContent("30%");
  });

  // 30 in the fund counts as 19 / 8 / 3, each figure on its own class, and the
  // fund's commodity called commodity, as everywhere else. (The figures take
  // their class's colour from CLASS_COLOR, which is a CSS variable — jsdom
  // cannot resolve those, so the colour itself is checked in the browser.)
  it("says what the amount counts as in each class", () => {
    view({ multi_asset: 30 });
    expect(screen.getByTestId("counts-as")).toHaveTextContent("Counts as 19% equity · 8% debt · 3% commodity");
    expect(screen.getByTestId("counts-as-equity")).toHaveTextContent("19%");
    expect(screen.getByTestId("counts-as-debt")).toHaveTextContent("8%");
    expect(screen.getByTestId("counts-as-others")).toHaveTextContent("3%");
    expect(screen.queryByText(/gold/)).toBeNull();
  });

  // The amount is what the customer opened this to change, so it leads.
  it("puts the amount first, above what it counts as", () => {
    view({ multi_asset: 30 });
    const stepper = button(/^Multi-asset funds percentage/);
    expect(Boolean(stepper.compareDocumentPosition(screen.getByTestId("counts-as")) & Node.DOCUMENT_POSITION_FOLLOWING))
      .toBe(true);
  });

  // 85 / 10 / 5 holds at most 41: at 42 the fund's debt part is 10.5 → 11.
  it("keeps the fund's make-up and its limit behind the ⓘ", () => {
    view({ multi_asset: 30 });
    expect(screen.queryByText(/One fund with about/)).toBeNull();
    expect(screen.queryByText(AT_LIMIT)).toBeNull();
    const dialog = info();
    expect(dialog).toHaveTextContent("One fund with about 65% equity, 25% debt and 10% commodity.");
    expect(dialog).toHaveTextContent("You can put up to 41% here with your current mix.");
  });

  // At the limit + greys out, so one line says why on the page; the ⓘ has
  // the full reason.
  it("says so on the page at the limit, with the full reason behind the ⓘ", () => {
    view({ multi_asset: 41 });
    expect(button("Increase Multi-asset funds")).toBeDisabled();
    expect(screen.getByText(AT_LIMIT)).toBeInTheDocument();
    expect(info()).toHaveTextContent(
      "Each multi-asset fund holds about 25% debt. With 10% debt in your mix, 41% is the most you can put here. To add more, raise Debt in your asset mix above.",
    );
  });

  // Zero means zero: a mix with no debt allows no fund at all.
  it("allows no fund in a mix with no debt, and says why", () => {
    view({}, { equity: 100, debt: 0, others: 0 });
    expect(button("Increase Multi-asset funds")).toBeDisabled();
    expect(screen.getByText(AT_LIMIT)).toBeInTheDocument();
    expect(info()).toHaveTextContent(
      "Each multi-asset fund holds about 25% debt. With 0% debt in your mix, you can't put anything here. To add it, raise Debt in your asset mix above.",
    );
  });

  // 54 → commodity 5.4 → 5 fits; 55 → 5.5 → 6 does not.
  it("names a commodity-bound limit as commodity, not gold", () => {
    view({ multi_asset: 54 }, { equity: 70, debt: 25, others: 5 });
    expect(info()).toHaveTextContent(
      "Each multi-asset fund holds about 10% commodity. With 5% commodity in your mix, 54% is the most you can put here. To add more, raise Commodity in your asset mix above.",
    );
  });

  it("names no limit when the fund fits at any amount", () => {
    view({ multi_asset: 30 }, COMP);
    expect(screen.queryByText(AT_LIMIT)).toBeNull();
    expect(info()).toHaveTextContent("Fits your mix at any amount.");
  });

  // A changed amount reads like any other number — black, not amber; the
  // row's "Your preference" already says it is the customer's.
  it("shows a changed amount in the standard colour", () => {
    view({ multi_asset: 30 });
    const figure = button(/^Multi-asset funds percentage/);
    expect(figure).toHaveClass("text-foreground");
    expect(figure).not.toHaveClass("text-wealth-amber");
  });

  it("steps the amount", () => {
    const onChange = view({ multi_asset: 30 });
    fireEvent.click(button("Increase Multi-asset funds"));
    expect(onChange).toHaveBeenCalledWith(31);
  });

  // A link, in the app's accent blue — set apart from the black text around it.
  it("shows Use Prozpr's recommendation in the accent colour", () => {
    view({ multi_asset: 30 });
    expect(button("Use Prozpr's recommendation")).toHaveClass("text-[hsl(var(--accent))]");
  });

  it("goes back to Prozpr's recommendation, and cannot while it is already there", () => {
    const onChange = view({ multi_asset: 30 });
    fireEvent.click(button("Use Prozpr's recommendation"));
    expect(onChange).toHaveBeenCalledWith(null);
    cleanup();
    view({});
    expect(button("Use Prozpr's recommendation")).toBeDisabled();
  });
});
