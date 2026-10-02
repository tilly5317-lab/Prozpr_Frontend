import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { resolve, type Cls, type RowValues } from "@/lib/investment-preferences";
import { CATALOG, MINE, PLAN } from "@/test/preferences-fixtures";
import ClassCategoriesPanel from "./ClassCategoriesPanel";

afterEach(cleanup);

const TODAY: RowValues = {
  multi_asset: 10, low_beta_equities: 17, medium_beta_equities: 15, us_equities: 5,
  arbitrage: 19, arbitrage_plus_income: 7, short_debt: 11, gold_commodities: 4,
};

/** `rows` overrides the class's shown values — an edit in progress. */
const view = (
  cls: Cls,
  { mix = MINE, values = { multi_asset: 30 } as RowValues, rows = {} as RowValues, today = TODAY as RowValues | null } = {},
) => {
  const res = resolve(mix, values, CATALOG);
  const handlers = { onEdit: vi.fn(), onUseProzpr: vi.fn() };
  render(
    <ClassCategoriesPanel cls={cls} mix={mix} res={res} cats={PLAN} rows={{ ...res.rows, ...rows }} today={today}
      {...handlers} />,
  );
  return handlers;
};
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("ClassCategoriesPanel", () => {
  // The group reads from its total, the fund's line and its rows — no
  // sentence restating them above.
  it.each(["equity", "debt", "others"] as const)("shows no explanation sentence (%s)", (cls) => {
    view(cls);
    expect(screen.queryByText(/Every number is a share|comes through multi-asset funds|held in gold/)).toBeNull();
  });

  it("drops the fund's line when it holds none of the class", () => {
    view("equity", { values: { multi_asset: 0 } });
    expect(screen.queryByTestId("fund-part")).toBeNull();
  });

  // Prozpr's plan: 64 in the fund is all 16 of debt — nothing left to step.
  it("leaves nothing to step when the fund holds all of the class", () => {
    view("debt", { mix: { equity: 78, debt: 16, others: 6 }, values: {} });
    expect(button("Increase Arbitrage")).toBeDisabled();
  });

  // The fund is set in its own group on the same card, so its line here only
  // informs — it is no longer a way to another page.
  it("shows the fund's part as information, not a link", () => {
    view("equity");
    expect(screen.getByTestId("fund-part")).toHaveTextContent("From your 30% in multi-asset funds19%");
    expect(screen.queryByRole("button", { name: /^Multi-asset funds/ })).toBeNull();
  });

  // An edited category reads like any other number — black, not amber.
  it("shows an edited category in the standard colour", () => {
    view("equity", { rows: { us_equities: 27 } });
    const figure = button(/^US percentage/);
    expect(figure).toHaveClass("text-foreground");
    expect(figure).not.toHaveClass("text-wealth-amber");
  });

  // A link, in the app's accent blue — set apart from the black text around it.
  it("shows Use Prozpr's recommendation in the accent colour", () => {
    view("equity", { rows: { us_equities: 27 } });
    expect(button("Use Prozpr's recommendation")).toHaveClass("text-[hsl(var(--accent))]");
  });

  it("shows today and Prozpr's figure for each category, and steps it", () => {
    const { onEdit } = view("equity");
    const midCap = within(screen.getByTestId("row-medium_beta_equities"));
    // The customer's own figure is Prozpr's here too; the stepper's is a button.
    expect(midCap.getByText("15%", { selector: "span" })).toHaveTextContent("Today 15%");
    expect(midCap.getByText("37%", { selector: "span" })).toHaveTextContent("Prozpr 37%");
    fireEvent.click(button("Increase US"));
    expect(onEdit).toHaveBeenCalledWith("us_equities", 30);
  });

  it("leaves the Today column out when there are no holdings", () => {
    view("equity", { today: null });
    expect(screen.queryByText("Today")).toBeNull();
    expect(within(screen.getByTestId("row-medium_beta_equities")).getByText("37%", { selector: "span" }))
      .toHaveTextContent("Prozpr 37%");
  });

  // Stepping a category down, the total is what the customer watches — so it
  // leads the group instead of trailing it.
  it("puts the total at the top, above the fund's part and every category", () => {
    view("equity");
    const total = screen.getByTestId("class-total");
    expect(follows(total, screen.getByTestId("fund-part"))).toBe(true);
    expect(follows(total, screen.getByTestId("row-low_beta_equities"))).toBe(true);
  });

  it("announces the total whenever it changes", () => {
    view("equity", { rows: { us_equities: 27 } });
    expect(screen.getByRole("status")).toHaveTextContent("83% of 85% · add 2%");
  });

  it("confirms a group that adds up, with nothing to go back to", () => {
    view("equity");
    expect(screen.getByTestId("class-total")).toHaveTextContent("Total equity85%");
    expect(button("Use Prozpr's recommendation")).toBeDisabled();
  });

  it.each([
    [{ us_equities: 27 }, "83% of 85% · add 2%"],
    [{ us_equities: 31 }, "87% of 85% · remove 2%"],
  ])("says by how much a group is off, and offers Prozpr's recommendation (%o)", (rows, warning) => {
    const { onUseProzpr } = view("equity", { rows });
    expect(screen.getByTestId("class-total")).toHaveTextContent(warning);
    fireEvent.click(button("Use Prozpr's recommendation"));
    expect(onUseProzpr).toHaveBeenCalled();
  });

  // 5 with 30 in the fund: 3 through it, 2 in gold.
  it("shows commodity as gold only, with nothing to set", () => {
    view("others");
    // The last cell is the You column; Prozpr's figure is 2% too, so the row as a whole cannot tell.
    expect(screen.getByTestId("row-gold_commodities").lastElementChild).toHaveTextContent(/^2%$/);
    expect(screen.queryByRole("button", { name: /Gold/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Use Prozpr's recommendation" })).toBeNull();
    expect(screen.getByText(
      "Gold is the only commodity we offer right now. To hold more or less, change Commodity in your asset mix above.",
    )).toBeInTheDocument();
  });
});
