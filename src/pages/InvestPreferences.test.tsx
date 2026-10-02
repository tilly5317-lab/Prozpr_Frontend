import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({
  getInvestmentPreferences: vi.fn(),
  saveInvestmentPreferences: vi.fn(),
}));
vi.mock("@/components/BottomNav", () => ({
  default: () => null,
  BOTTOM_NAV_HEIGHT_VAR: "--bottom-nav-h",
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

import { getInvestmentPreferences, saveInvestmentPreferences } from "@/lib/api";
import { COMP, PLAN } from "@/test/preferences-fixtures";
import InvestPreferences from "./InvestPreferences";

// Prozpr's plan: 78 / 16 / 6 with 64% multi-asset (42 / 16 / 6 of it), so
// equity divides 36 as 0 large-cap / 20 mid-cap / 16 US, and debt and
// commodity have nothing left to divide.
const GET = {
  saved: null,
  recommendation: { class_mix: { equity: 78, debt: 16, others: 6 } },
  subcategories: PLAN,
  multi_asset_composition: COMP,
};
// Today is deliberately nothing like the plan, so the figures cannot be confused:
// 70 equity / 30 debt / 0 commodity.
const GET_WITH_TODAY = {
  ...GET,
  current: {
    holdings: [
      { subgroup: "low_beta_equities", pct_of_total: 70 },
      { subgroup: "short_debt", pct_of_total: 30 },
    ],
    excluded_pct: 18.4,
  },
};
// The plan's mix, with equity divided the customer's own way.
const SAVED = {
  class_mix: { equity: 78, debt: 16, others: 6 },
  pins: [
    { subgroup: "multi_asset", pct_of_total: 64 },
    { subgroup: "low_beta_equities", pct_of_total: 10 },
    { subgroup: "medium_beta_equities", pct_of_total: 10 },
    { subgroup: "us_equities", pct_of_total: 16 },
    { subgroup: "arbitrage", pct_of_total: 0 },
    { subgroup: "arbitrage_plus_income", pct_of_total: 0 },
    { subgroup: "short_debt", pct_of_total: 0 },
    { subgroup: "gold_commodities", pct_of_total: 0 },
  ],
};

const mockGet = (data: unknown) =>
  (getInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue(data);
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const tap = (name: string | RegExp, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(button(name));
};
const saveBtn = () => button(/^save preferences$/i);
/** A figure in a class's row of the mix, as a screen reader hears it ("Today 70%"). */
const mixFigure = (cls: string, text: string) =>
  within(screen.getByTestId(`mix-row-${cls}`)).getByText(text).textContent;
const ready = () => screen.findByRole("button", { name: /^save preferences$/i });
const heading = (name: string) => screen.getByRole("heading", { level: 1, name });
/** A group's own row in the Categories card. Its open panel can hold a
 *  stepper that starts with the same words ("Multi-asset funds percentage"). */
const row = (title: string) =>
  screen.getAllByRole("button", { name: new RegExp(`^${title}`) }).find((b) => b.hasAttribute("aria-expanded"))!;
const toggle = (title: string) => fireEvent.click(row(title));
/** A group's status as its closed row shows it — an open row shows only its
 *  title. Closes an open group to read it, then opens it again, so a test can
 *  carry on stepping inside it. */
const statusOf = (title: string): string => {
  const open = row(title).getAttribute("aria-expanded") === "true";
  if (open) toggle(title);
  const text = row(title).textContent ?? "";
  if (open) toggle(title);
  return text;
};
const shownEquity = () =>
  ["Large-cap", "Mid-cap & flexi-cap", "US"].map((l) => button(new RegExp(`^${l} percentage`)).textContent);
const savedArgs = () =>
  (saveInvestmentPreferences as ReturnType<typeof vi.fn>).mock.calls[0][0];
const pinOf = (subgroup: string) =>
  savedArgs().pins.find((p: { subgroup: string }) => p.subgroup === subgroup)?.pct_of_total;

const renderPage = (at = "/invest/preferences") =>
  render(<MemoryRouter initialEntries={[at]}><InvestPreferences /></MemoryRouter>);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
beforeEach(() => {
  (saveInvestmentPreferences as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  window.scrollTo = vi.fn();
});

describe("InvestPreferences — the mix", () => {
  it("disables Save my mix until something changes, then saves { class_mix, pins }", async () => {
    mockGet(GET); renderPage();
    expect(await ready()).toBeDisabled();

    // Each class moves on its own: +1 Equity alone is 101, so 1 comes off Debt.
    tap("Increase Equity");
    tap("Decrease Debt");

    // Only now do the two figures differ, so only now can Prozpr's be told
    // apart from a copy of the customer's.
    expect(mixFigure("equity", "78%")).toBe("Prozpr 78%");
    expect(button(/^Equity percentage/)).toHaveTextContent("79%");
    fireEvent.click(saveBtn());
    await waitFor(() =>
      expect(saveInvestmentPreferences).toHaveBeenCalledWith({
        class_mix: { equity: 79, debt: 15, others: 6 },
        pins: [],
      }),
    );
  });

  // Everything shown is derived from what the customer set, so stepping the
  // mix away and back lands on exactly what was saved.
  it("leaves nothing to save once the mix is stepped away and back", async () => {
    mockGet({ ...GET, saved: SAVED }); renderPage(); await ready();
    tap("Increase Equity", 7);
    tap("Decrease Equity", 7);
    expect(saveBtn()).toBeDisabled();
  });

  it("lets Reset to Prozpr clear a saved preference back to engine-decides", async () => {
    mockGet({ ...GET, saved: SAVED }); renderPage(); await ready();
    tap("Prozpr Recommendation");
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().pins).toEqual([]);
  });

  // No auto-scaling, so the customer can be mid-way — and Save waits.
  it("holds Save until the asset mix adds up to 100%, and says by how much", async () => {
    mockGet(GET); renderPage(); await ready();
    tap("Increase Equity");
    expect(screen.getByTestId("mix-total")).toHaveTextContent("101% of 100% · remove 1%");
    expect(saveBtn()).toBeDisabled();
    expect(saveBtn()).toHaveAccessibleDescription("Your asset mix adds up to 101%. Remove 1% to save.");
    tap("Decrease Debt");
    expect(saveBtn()).toBeEnabled();
  });

  // +1 Debt leaves the fund and equity's share alone, so the unfinished
  // equity group stays unfinished — and the mix is what Save names first.
  it("names the asset mix first when a category group is off too", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Increase Large-cap");
    tap("Increase Debt");
    expect(statusOf("Equity categories")).toContain("Doesn't add up");
    expect(saveBtn()).toHaveAccessibleDescription("Your asset mix adds up to 101%. Remove 1% to save.");
  });

  it("names its actions after the customer's preferences and Prozpr's recommendation", async () => {
    mockGet(GET); renderPage(); await ready();
    expect(button("Save Preferences")).toBeInTheDocument();
    expect(button("Prozpr Recommendation")).toBeInTheDocument();
  });

  // Changing the plan is about fit, not about disagreeing with it.
  it("invites changes without framing them as disagreement", async () => {
    mockGet(GET); renderPage(); await ready();
    expect(heading("Your asset mix").nextElementSibling)
      .toHaveTextContent("Start from our plan and change only what suits your needs better.");
  });
});

describe("InvestPreferences — categories", () => {
  it("opens a group in place under its row, and closes it again", async () => {
    mockGet(GET); renderPage(); await ready();
    expect(statusOf("Equity categories")).toContain("Prozpr's recommendation");
    // Gold is the only commodity, so its split is always Prozpr's.
    expect(statusOf("Commodity categories")).toContain("Prozpr's recommendation");
    tap(/^Equity categories/);
    expect(button(/^Equity categories/)).toHaveAttribute("aria-expanded", "true");
    expect(button("Increase US")).toBeInTheDocument();
    // Still the one screen: nothing navigated away.
    expect(heading("Your asset mix")).toBeInTheDocument();
    tap(/^Equity categories/);
    expect(screen.queryByRole("button", { name: "Increase US" })).toBeNull();
    expect(saveBtn()).toBeDisabled();
  });

  it("opens one group at a time", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap(/^Debt categories/);
    expect(button(/^Equity categories/)).toHaveAttribute("aria-expanded", "false");
    expect(button("Increase Short-duration")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Increase US" })).toBeNull();
  });

  it("keeps a group's edits once they add up, and saves every category with the mix", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Decrease US");
    tap("Increase Large-cap");
    expect(statusOf("Equity categories")).toContain("Your preference");
    expect(statusOf("Debt categories")).toContain("Prozpr's recommendation");
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().class_mix).toEqual({ equity: 78, debt: 16, others: 6 });
    expect(savedArgs().pins).toHaveLength(PLAN.length);
    expect([pinOf("multi_asset"), pinOf("low_beta_equities"), pinOf("us_equities"), pinOf("short_debt")])
      .toEqual([64, 1, 15, 0]);
  });

  // Stepped back onto Prozpr's numbers, the group is Prozpr's again.
  it("treats an edit undone as no edit", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Decrease US");
    tap("Increase Large-cap");
    tap("Decrease Large-cap");
    tap("Increase US");
    expect(statusOf("Equity categories")).toContain("Prozpr's recommendation");
    expect(saveBtn()).toBeDisabled();
  });

  it("takes a group back to Prozpr's recommendation", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Decrease US");
    tap("Increase Large-cap");
    tap("Use Prozpr's recommendation");
    expect(statusOf("Equity categories")).toContain("Prozpr's recommendation");
    expect(shownEquity()).toEqual(["0%", "20%", "16%"]);
    expect(saveBtn()).toBeDisabled();
  });

  // 79 of 78: the edits stay, Save waits, and both the total and the note by
  // Save say what to fix.
  it("holds Save while a group doesn't add up, and says which group and by how much", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Increase Large-cap");
    expect(screen.getByTestId("class-total")).toHaveTextContent("79% of 78% · remove 1%");
    expect(saveBtn()).toBeDisabled();
    expect(saveBtn()).toHaveAccessibleDescription("Equity categories add up to 79% of 78%. Remove 1% to save.");
    // Closing the group keeps the edit, and the row says it still needs fixing.
    tap(/^Equity categories/);
    expect(statusOf("Equity categories")).toContain("Doesn't add up");
    tap(/^Equity categories/);
    expect(shownEquity()).toEqual(["1%", "20%", "16%"]);
    tap("Decrease US");
    expect(screen.getByTestId("class-total")).toHaveTextContent("Total equity78%");
    expect(statusOf("Equity categories")).toContain("Your preference");
    expect(saveBtn()).toBeEnabled();
  });

  it("clears a group that doesn't add up on Reset to Prozpr", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Increase Large-cap");
    tap("Prozpr Recommendation");
    expect(screen.getByTestId("class-total")).toHaveTextContent("Total equity78%");
    expect(statusOf("Equity categories")).toContain("Prozpr's recommendation");
    expect(saveBtn()).toBeDisabled();
  });

  // 64 → 60 in the fund counts 39 / 15 / 6, leaving equity 39 to divide. No
  // auto-scaling: the customer's 1 / 20 / 16 stays exactly as entered — now
  // 37 of 39 — and the group keeps saying so.
  it("keeps a group as entered when the fund changes underneath it", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Increase Large-cap");
    expect(screen.getByTestId("fund-part")).toHaveTextContent("From your 64% in multi-asset funds42%");
    toggle("Multi-asset funds");
    tap("Decrease Multi-asset funds", 4);
    expect(statusOf("Equity categories")).toContain("Doesn't add up");
    tap(/^Equity categories/);
    expect(screen.getByTestId("fund-part")).toHaveTextContent("From your 60% in multi-asset funds39%");
    expect(shownEquity()).toEqual(["1%", "20%", "16%"]);
    expect(screen.getByTestId("class-total")).toHaveTextContent("76% of 78% · add 2%");
    expect(saveBtn()).toBeDisabled();
  });

  // The fund at 40 leaves debt 6: the customer puts it all in short-duration.
  // Back at 64, debt has nothing left and so "matches" Prozpr — which must not
  // cost it that split when an Equity edit is kept.
  it("leaves the other groups alone when one group's edit is kept", async () => {
    mockGet(GET); renderPage(); await ready();
    toggle("Multi-asset funds");
    tap("Decrease Multi-asset funds", 24);
    tap(/^Debt categories/);
    tap("Decrease Arbitrage & income", 6);
    tap("Increase Short-duration", 6);
    toggle("Multi-asset funds");
    tap("Use Prozpr's recommendation");
    tap(/^Equity categories/);
    tap("Decrease US");
    tap("Increase Large-cap");
    toggle("Multi-asset funds");
    tap("Decrease Multi-asset funds", 24);
    expect(statusOf("Debt categories")).toContain("Your preference");
  });

  // Saved at 77 / 16 / 7 with equity on Prozpr's 0 / 19 / 16 (of 35). With the
  // fund lowered to 56, equity has 41 to divide: Prozpr's weights give
  // 23 / 18, while rescaling the saved 19 : 16 would give 22 / 19 — a split
  // the customer never chose, suddenly called theirs.
  it("keeps a class saved on Prozpr's numbers on Prozpr's recommendation as the fund changes", async () => {
    const pins = SAVED.pins.map((p) => ({
      ...p,
      pct_of_total: { low_beta_equities: 0, medium_beta_equities: 19, us_equities: 16, gold_commodities: 1 }[p.subgroup]
        ?? p.pct_of_total,
    }));
    mockGet({ ...GET, saved: { class_mix: { equity: 77, debt: 16, others: 7 }, pins } }); renderPage(); await ready();
    toggle("Multi-asset funds");
    tap("Decrease Multi-asset funds", 8);
    expect(statusOf("Multi-asset funds")).toContain("Your preference");
    expect(statusOf("Equity categories")).toContain("Prozpr's recommendation");
  });

  // Stepping back onto Prozpr's pick is following Prozpr, not a pick to save.
  it("leaves nothing to save once the fund is stepped away and back", async () => {
    mockGet(GET); renderPage(); await ready();
    toggle("Multi-asset funds");
    tap("Decrease Multi-asset funds");
    tap("Increase Multi-asset funds");
    expect(statusOf("Multi-asset funds")).toContain("Prozpr's recommendation");
    expect(saveBtn()).toBeDisabled();
  });

  it("shows a changed fund as the customer's preference", async () => {
    mockGet(GET); renderPage(); await ready();
    toggle("Multi-asset funds");
    tap("Decrease Multi-asset funds");
    expect(statusOf("Multi-asset funds")).toContain("Your preference");
    expect(saveBtn()).toBeEnabled();
  });

  // +1 Commodity and −1 Equity take the mix to 77 / 16 / 7. The fund still
  // fits at 64 (42 / 16 / 6), leaving equity 35 and commodity 1. No
  // auto-scaling: the customer's equity 1 / 20 / 15 stays 36 of 35 until they
  // fix it; gold, still Prozpr's, simply follows to 1.
  it("keeps a group's own numbers when the mix moves, and holds Save until they add up", async () => {
    mockGet(GET); renderPage(); await ready();
    tap(/^Equity categories/);
    tap("Decrease US");
    tap("Increase Large-cap");
    tap("Increase Commodity");
    tap("Decrease Equity");
    expect(shownEquity()).toEqual(["1%", "20%", "15%"]);
    expect(saveBtn()).toBeDisabled();
    expect(saveBtn()).toHaveAccessibleDescription("Equity categories add up to 78% of 77%. Remove 1% to save.");
    tap("Decrease US");
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveInvestmentPreferences).toHaveBeenCalled());
    expect(savedArgs().class_mix).toEqual({ equity: 77, debt: 16, others: 7 });
    const ids = ["multi_asset", "low_beta_equities", "medium_beta_equities", "us_equities", "gold_commodities"];
    expect(ids.map(pinOf)).toEqual([64, 1, 20, 14, 1]);
  });

  // A group still on Prozpr's recommendation has nothing of the customer's to
  // keep, so it follows Prozpr's split to the new share with nothing to fix.
  it("moves a group that follows Prozpr along with its share", async () => {
    mockGet(GET); renderPage(); await ready();
    tap("Increase Equity");
    tap("Decrease Debt");
    expect(statusOf("Equity categories")).toContain("Prozpr's recommendation");
    expect(saveBtn()).toBeEnabled();
  });

  // The sub-pages are gone; a link or bookmark to one lands on the screen
  // with nothing open rather than on nothing at all.
  it("shows the main screen for an old link to a sub-page", async () => {
    mockGet(GET); renderPage("/invest/preferences?edit=equity"); await ready();
    expect(heading("Your asset mix")).toBeInTheDocument();
    expect(button(/^Equity categories/)).toHaveAttribute("aria-expanded", "false");
  });
});

describe("InvestPreferences — how a preference works", () => {
  // There when asked for, not always on the page.
  it("keeps the explanation behind the ⓘ until it is tapped", async () => {
    mockGet(GET); renderPage(); await ready();
    expect(screen.queryByText("You set the split. We still pick the funds.")).toBeNull();
    tap("How your preference works");
    const dialog = screen.getByRole("dialog", { name: "You set the split. We still pick the funds." });
    expect(dialog).toHaveTextContent(
      "Your preference replaces the allocation we'd have chosen for you. Which funds go into each slot, and when to switch them, stays with us.",
    );
    expect(dialog).toHaveTextContent(/directional target/i);
    tap("OK");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Removed for now, even though the backend still flags them.
  it("shows none of the planning warnings", async () => {
    mockGet({ ...GET, carve_outs_at_risk: ["emergency_fund", "liability_offset", "near_term_goals"] });
    renderPage(); await ready();
    tap("How your preference works");
    expect(screen.queryByText(/No separate emergency fund/i)).toBeNull();
    expect(screen.queryByText(/stop offsetting your loans/i)).toBeNull();
    expect(screen.queryByText(/stop being planned for/i)).toBeNull();
  });
});

describe("InvestPreferences — where you are today", () => {
  it("shows today's mix from the customer's holdings", async () => {
    mockGet(GET_WITH_TODAY); renderPage(); await ready();
    expect(mixFigure("equity", "70%")).toBe("Today 70%");
    expect(mixFigure("debt", "30%")).toBe("Today 30%");
    expect(mixFigure("others", "0%")).toBe("Today 0%");
  });

  // 20 in the fund counts as 13 / 5 / 2, alongside each class's own rows.
  it("counts today's multi-asset holding in every class it holds", async () => {
    const holdings = [
      { subgroup: "multi_asset", pct_of_total: 20 },
      { subgroup: "low_beta_equities", pct_of_total: 30 },
      { subgroup: "short_debt", pct_of_total: 20 },
      { subgroup: "arbitrage", pct_of_total: 10 },
      { subgroup: "gold_commodities", pct_of_total: 20 },
    ];
    mockGet({ ...GET, current: { holdings, excluded_pct: 0 } }); renderPage(); await ready();
    expect(mixFigure("equity", "43%")).toBe("Today 43%");
    expect(mixFigure("debt", "35%")).toBe("Today 35%");
    expect(mixFigure("others", "22%")).toBe("Today 22%");
  });

  // The rescale is the surprising part: the surviving figures were inflated to
  // fill the gap, not merely shown without it. Said in the ⓘ, not on the card.
  it("names what was excluded and that the rest was rescaled, behind the ⓘ", async () => {
    mockGet(GET_WITH_TODAY); renderPage(); await ready();
    const line = "Today leaves out the 18% of your holdings this plan doesn't cover, such as ELSS (tax-saver) funds. The rest is scaled to 100%.";
    expect(screen.queryByText(line)).toBeNull();
    tap("How your preference works");
    expect(screen.getByRole("dialog")).toHaveTextContent(line);
  });

  it("claims no exclusion when nothing was excluded", async () => {
    mockGet({ ...GET_WITH_TODAY, current: { ...GET_WITH_TODAY.current, excluded_pct: 0 } });
    renderPage(); await ready();
    tap("How your preference works");
    expect(screen.queryByText(/Today leaves out/)).toBeNull();
  });

  // Absent, null, empty and all-zero are one state: nothing to show. A set of
  // zeros is not a mix anyone holds.
  it.each([
    ["absent", undefined],
    ["null", null],
    // Everything excluded: there is no today left for a footnote to qualify.
    ["an empty list", { holdings: [], excluded_pct: 100 }],
    ["a non-empty list that is all zero", {
      holdings: [{ subgroup: "short_debt", pct_of_total: 0 }], excluded_pct: 0,
    }],
  ])("shows nothing about today when current is %s", async (_label, current) => {
    mockGet({ ...GET, current }); renderPage(); await ready();
    expect(screen.queryByText("Today")).toBeNull();
    tap("How your preference works");
    expect(screen.queryByText(/Today leaves out/)).toBeNull();
  });
});
