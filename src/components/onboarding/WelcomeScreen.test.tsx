import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const checkMobileStatus = vi.fn();
const signup = vi.fn();

vi.mock("@/lib/api", () => ({
  checkMobileStatus: (...a: unknown[]) => checkMobileStatus(...a),
  signup: (...a: unknown[]) => signup(...a),
  login: vi.fn(),
  getMe: vi.fn(),
  updateMe: vi.fn(),
  requestPinReset: vi.fn(),
  confirmPinReset: vi.fn(),
}));
vi.mock("@/lib/onboardingResume", () => ({
  resolveOnboardingResumeRoute: vi.fn().mockResolvedValue("/cams-upload"),
}));
vi.mock("@/lib/onboardingAnalytics", () => ({
  trackOnboardingStepViewed: vi.fn(),
  trackOnboardingStepCompleted: vi.fn(),
}));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ refresh: vi.fn() }),
}));

import WelcomeScreen from "./WelcomeScreen";

// The PIN step's input-otp observes its own size; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<WelcomeScreen onNext={vi.fn()} />} />
        <Route path="/earlyaccess" element={<div>early-access-page</div>} />
      </Routes>
    </MemoryRouter>,
  );

const enterNumber = async (digits: string) => {
  fireEvent.change(screen.getByPlaceholderText("10-digit mobile number"), {
    target: { value: digits },
  });
  fireEvent.click(screen.getByText("Get Started"));
  await waitFor(() => expect(checkMobileStatus).toHaveBeenCalledTimes(1));
};

beforeEach(() => {
  checkMobileStatus.mockReset();
  signup.mockReset();
});

describe("WelcomeScreen — sign-ups closed during the private beta", () => {
  it("sends an unknown number to the early-access list instead of account setup", async () => {
    checkMobileStatus.mockResolvedValue({
      exists: false,
      is_onboarding_complete: false,
      email_hint: null,
    });
    renderScreen();
    await enterNumber("9876543210");

    expect(await screen.findByText("Sign-ups are closed for now")).toBeInTheDocument();
    expect(screen.queryByText("Set up your account")).not.toBeInTheDocument();
    expect(signup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Join the early-access list"));
    expect(await screen.findByText("early-access-page")).toBeInTheDocument();
  });

  it("still lets a known number sign in with its PIN", async () => {
    checkMobileStatus.mockResolvedValue({
      exists: true,
      is_onboarding_complete: true,
      email_hint: null,
    });
    renderScreen();
    await enterNumber("9876543210");
    expect(await screen.findByText("Welcome back")).toBeInTheDocument();
  });
});
