import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Index only needs the onboarding-complete write; BottomNav needs the alerts badge.
vi.mock("@/lib/api", () => ({
  markOnboardingComplete: vi.fn().mockResolvedValue(undefined),
  listNotifications: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/onboardingResume", () => ({
  resolveOnboardingResumeRoute: vi.fn().mockResolvedValue("/cams-upload"),
}));
vi.mock("@/lib/onboardingAnalytics", () => ({ trackOnboardingCompleted: vi.fn() }));
vi.mock("@/components/onboarding/WelcomeScreen", () => ({
  default: () => <div>welcome-screen</div>,
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    authenticated: true,
    loading: false,
    user: { id: "u1", is_onboarding_complete: true },
    refresh: vi.fn(),
  }),
}));

import Index from "./Index";
import BottomNav from "@/components/BottomNav";

const renderLanding = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/portfolio" element={<BottomNav />} />
      </Routes>
    </MemoryRouter>,
  );

describe("Index — landing for an onboarded user", () => {
  it("sends the first view of the dashboard to /portfolio, not '/'", async () => {
    renderLanding();
    // BottomNav only renders on /portfolio, so finding it proves the redirect ran.
    expect(await screen.findByText("Portfolio")).toBeInTheDocument();
    expect(screen.queryByText("welcome-screen")).not.toBeInTheDocument();
  });

  it("highlights the Portfolio tab on that very first landing", async () => {
    renderLanding();
    const label = await screen.findByText("Portfolio");
    expect(label.className).toContain("text-primary");
    // A non-active tab must stay muted, so the assertion above means something.
    expect(screen.getByText("Chat").className).not.toContain("text-primary");
  });
});
