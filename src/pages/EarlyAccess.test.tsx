import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const submitEarlyAccessSignup = vi.fn();
const getEarlyAccessSeats = vi.fn();

vi.mock("@/lib/api", () => ({
  EARLY_ACCESS_PROFESSIONS: ["Finance", "Tech", "Other"],
  submitEarlyAccessSignup: (...args: unknown[]) => submitEarlyAccessSignup(...args),
  getEarlyAccessSeats: () => getEarlyAccessSeats(),
}));
vi.mock("@/lib/posthog", () => ({ isPostHogEnabled: false, posthog: { capture: vi.fn() } }));

import EarlyAccess from "./EarlyAccess";

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/earlyaccess"]}>
      <EarlyAccess />
    </MemoryRouter>,
  );

const seats = { seats_total: 100, seats_claimed: 60, seats_left: 40 };

beforeEach(() => {
  localStorage.clear();
  submitEarlyAccessSignup.mockReset();
  getEarlyAccessSeats.mockReset().mockResolvedValue(seats);
});

describe("/earlyaccess", () => {
  it("shows the live seat count from the backend", async () => {
    renderPage();
    expect(await screen.findAllByText("40 seats left")).not.toHaveLength(0);
    expect(document.title).toContain("founding tester");
  });

  it("validates before submitting and sends the sign-up to the backend", async () => {
    submitEarlyAccessSignup.mockResolvedValue({ ok: true, ...seats, seats_claimed: 61, seats_left: 39 });
    renderPage();
    fireEvent.click((await screen.findAllByText(/Claim 1 of the last/))[0]);

    fireEvent.click(screen.getByText("Confirm my seat"));
    expect(screen.getByText("Please enter your name.")).toBeInTheDocument();
    expect(submitEarlyAccessSignup).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "Asha@Example.com" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Tech" } });
    fireEvent.click(screen.getByText("Confirm my seat"));

    await waitFor(() => expect(submitEarlyAccessSignup).toHaveBeenCalledTimes(1));
    expect(submitEarlyAccessSignup).toHaveBeenCalledWith({
      name: "Asha",
      email: "asha@example.com",
      whatsapp: null,
      profession: "Tech",
      source: "earlyaccess_page",
    });
    expect(await screen.findAllByText("You're on the list.")).not.toHaveLength(0);
    // The meter moves to the count the backend returned with the sign-up.
    expect(screen.getAllByText("39 seats left").length).toBeGreaterThan(0);
  });

  it("surfaces the backend's error and keeps the form open", async () => {
    submitEarlyAccessSignup.mockRejectedValue(new Error("Email already registered"));
    renderPage();
    fireEvent.click((await screen.findAllByText(/Claim 1 of the last/))[0]);
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "asha@example.com" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Other" } });
    fireEvent.click(screen.getByText("Confirm my seat"));
    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
    expect(screen.queryByText("You're on the list.")).not.toBeInTheDocument();
  });
});
