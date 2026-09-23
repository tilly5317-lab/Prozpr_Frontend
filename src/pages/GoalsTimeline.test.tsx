import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// GoalsTimeline pulls a lot of data on mount — stub the whole API + side-effect
// modules so the timeline renders its year rows without a backend.
vi.mock("@/lib/api", () => ({
  listGoals: vi.fn().mockResolvedValue([]),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  removeGoal: vi.fn(),
  getCashflowLatest: vi.fn().mockResolvedValue(null),
  computeCashflow: vi.fn().mockResolvedValue(null),
  saveCashflowInputs: vi.fn(),
  getOnboardingProfile: vi.fn().mockResolvedValue({ date_of_birth: null }),
  getInvestmentProfile: vi.fn().mockResolvedValue({ retirement_age: null }),
  getPersonalFinance: vi.fn().mockResolvedValue({}),
  // Used by <BottomNav /> for the alerts badge.
  listNotifications: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/detailedOnboardingAnalytics", () => ({
  trackDetailedOnboardingSectionCompleted: vi.fn(),
}));
vi.mock("@/lib/export-xls", () => ({ exportCashflowXls: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }),
}));

import GoalsTimeline from "./GoalsTimeline";

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/goal-planner"]}>
      <GoalsTimeline variant="tornado" />
    </MemoryRouter>,
  );

describe("GoalsTimeline — year bars (mobile readout, not add-goal)", () => {
  it("year bars are labelled to reveal the projected corpus, not to add a goal", async () => {
    renderPage();
    const bars = await screen.findAllByLabelText(/Show \d{4} projected corpus/i);
    expect(bars.length).toBeGreaterThan(0);
    // A year bar must never be an add-goal trigger.
    bars.forEach((b) => expect(b.getAttribute("aria-label")).not.toMatch(/add.*goal/i));
  });

  it("clicking a year bar does NOT open the add-goal sheet", async () => {
    renderPage();
    const bars = await screen.findAllByLabelText(/Show \d{4} projected corpus/i);

    fireEvent.click(bars[0]);

    // The add-goal sheet's tell-tale copy must be absent after a bar click.
    expect(screen.queryByText("New goal")).toBeNull();
    expect(screen.queryByText("Add to timeline")).toBeNull();
    expect(screen.queryByText(/^Plan for \d{4}$/)).toBeNull();
  });
});
