import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import FigureTable, { FigureRow } from "./FigureTable";

afterEach(cleanup);

const view = (today: number | null) =>
  render(
    <FigureTable showToday={today !== null}>
      <FigureRow testId="row" name="Equity" today={today} prozpr={71} you={<span>80%</span>} />
    </FigureTable>,
  );

describe("FigureTable", () => {
  // The header and every row share one order, so a figure sits under its name.
  it("heads the columns Today, Prozpr and You, and fills each row in that order", () => {
    const { container } = view(55);
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("TodayProzprYou");
    expect(screen.getByTestId("row")).toHaveTextContent("EquityToday 55%Prozpr 71%80%");
  });

  // Each figure says which column it is in, so the header is only for the eye.
  it("names each reference figure for a screen reader", () => {
    view(55);
    expect(screen.getByText("55%")).toHaveTextContent("Today 55%");
    expect(screen.getByText("71%")).toHaveTextContent("Prozpr 71%");
  });

  it("leaves the Today column out when there are no holdings", () => {
    view(null);
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.getByTestId("row")).toHaveTextContent("EquityProzpr 71%80%");
  });
});
