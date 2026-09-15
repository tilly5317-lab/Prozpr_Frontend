import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { ScreenSubcategory } from "@/lib/api";
import ClassDistributionBars from "./ClassDistributionBars";

const EQUITY: ScreenSubcategory[] = [
  { id: "low_beta_equities",    class: "equity", label: "Large-cap", recommended_pct_of_total: 30 },
  { id: "medium_beta_equities", class: "equity", label: "Mid-cap",   recommended_pct_of_total: 10 },
];

afterEach(cleanup);

describe("ClassDistributionBars", () => {
  it("labels both totals so the size difference is not hidden", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY}
      values={{ low_beta_equities: 15, medium_beta_equities: 5 }} />);
    expect(screen.getByTestId("bars-label"))
      .toHaveTextContent("Yours 20.0% · Prozpr 40.0%");
  });

  it("normalises each bar against its OWN total", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY}
      values={{ low_beta_equities: 15, medium_beta_equities: 5 }} />);
    // yours 15/20 = 75%, prozpr 30/40 = 75% — same mix, different size
    expect(screen.getByTestId("yours-low_beta_equities")).toHaveStyle({ width: "75%" });
    expect(screen.getByTestId("prozpr-low_beta_equities")).toHaveStyle({ width: "75%" });
    expect(screen.getByTestId("yours-medium_beta_equities")).toHaveStyle({ width: "25%" });
  });

  it("renders an empty customer bar rather than NaN when nothing is entered", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY} values={{}} />);
    expect(screen.getByTestId("yours-low_beta_equities")).toHaveStyle({ width: "0%" });
    expect(screen.getByTestId("bars-label")).toHaveTextContent("Yours 0.0%");
  });

  it("survives a class whose recommendation is entirely zero", () => {
    const zeroed = EQUITY.map((c) => ({ ...c, recommended_pct_of_total: 0 }));
    render(<ClassDistributionBars cls="equity" categories={zeroed} values={{}} />);
    expect(screen.getByTestId("prozpr-low_beta_equities")).toHaveStyle({ width: "0%" });
  });

  it("orders both bars identically so segments map by position", () => {
    render(<ClassDistributionBars cls="equity" categories={EQUITY}
      values={{ low_beta_equities: 15, medium_beta_equities: 5 }} />);
    const ids = (p: string) => Array.from(
      screen.getByTestId(`bar-${p}`).children).map((el) => el.getAttribute("data-testid"));
    expect(ids("yours")).toEqual(["yours-low_beta_equities", "yours-medium_beta_equities"]);
    expect(ids("prozpr")).toEqual(["prozpr-low_beta_equities", "prozpr-medium_beta_equities"]);
  });
});
