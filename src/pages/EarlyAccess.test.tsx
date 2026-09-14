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
      referrer_note: "",
    });
    expect(await screen.findAllByText("You're on the list.")).not.toHaveLength(0);
    // The meter moves to the count the backend returned with the sign-up.
    expect(screen.getAllByText("39 seats left").length).toBeGreaterThan(0);
  });

  it("renders the claimed count the backend reported", async () => {
    renderPage();
    expect(await screen.findByText(/of 100 seats claimed/)).toBeInTheDocument();
    // The counter animates up to the real figure rather than landing on it.
    await waitFor(() => expect(screen.getByText("60")).toBeInTheDocument(), { timeout: 2500 });
  });

  it("never invents a seat count when the live figure is unreadable", async () => {
    // A fabricated fallback would state a signup number to visitors that
    // nothing backs. The page must say less instead.
    getEarlyAccessSeats.mockReset().mockRejectedValue(new Error("503"));
    renderPage();

    expect(await screen.findAllByText("Claim your seat")).not.toHaveLength(0);
    expect(screen.queryByText(/seats claimed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/seats left/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Claim 1 of the last/)).not.toBeInTheDocument();
  });

  it("still lets someone sign up while the count is unavailable", async () => {
    getEarlyAccessSeats.mockReset().mockRejectedValue(new Error("503"));
    submitEarlyAccessSignup.mockResolvedValue({ ok: true, ...seats });
    renderPage();

    fireEvent.click((await screen.findAllByText("Claim your seat"))[0]);
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "asha@example.com" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Tech" } });
    fireEvent.click(screen.getByText("Confirm my seat"));

    await waitFor(() => expect(submitEarlyAccessSignup).toHaveBeenCalledTimes(1));
    expect(await screen.findAllByText("You're on the list.")).not.toHaveLength(0);
    // The sign-up response carries real figures, so the meter appears now.
    expect(screen.getAllByText("40 seats left").length).toBeGreaterThan(0);
  });

  it("caps the WhatsApp number at 10 digits and sends it behind +91", async () => {
    submitEarlyAccessSignup.mockResolvedValue({ ok: true, ...seats });
    renderPage();
    fireEvent.click((await screen.findAllByText(/Claim 1 of the last/))[0]);

    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "asha@example.com" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Tech" } });

    // Someone pastes the full international form with spaces. The field keeps
    // the first ten digits and nothing else — it cannot hold more.
    const tel = screen.getByPlaceholderText("WhatsApp number (optional)");
    fireEvent.change(tel, { target: { value: "+91 84688 82142 99" } });
    expect((tel as HTMLInputElement).value).toBe("9184688821");

    fireEvent.change(tel, { target: { value: "8468882142" } });
    expect((tel as HTMLInputElement).value).toBe("8468882142");

    fireEvent.click(screen.getByText("Confirm my seat"));
    await waitFor(() => expect(submitEarlyAccessSignup).toHaveBeenCalledTimes(1));
    expect(submitEarlyAccessSignup).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp: "+918468882142" }),
    );
  });

  it("rejects a short WhatsApp number but allows a blank one", async () => {
    submitEarlyAccessSignup.mockResolvedValue({ ok: true, ...seats });
    renderPage();
    fireEvent.click((await screen.findAllByText(/Claim 1 of the last/))[0]);
    fireEvent.change(screen.getByPlaceholderText("Name"), { target: { value: "Asha" } });
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "asha@example.com" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Tech" } });

    const tel = screen.getByPlaceholderText("WhatsApp number (optional)");
    fireEvent.change(tel, { target: { value: "84688" } });
    fireEvent.click(screen.getByText("Confirm my seat"));
    expect(screen.getByText(/10-digit WhatsApp number/)).toBeInTheDocument();
    expect(submitEarlyAccessSignup).not.toHaveBeenCalled();

    // Blank is fine — the field is optional.
    fireEvent.change(tel, { target: { value: "" } });
    fireEvent.click(screen.getByText("Confirm my seat"));
    await waitFor(() => expect(submitEarlyAccessSignup).toHaveBeenCalledTimes(1));
    expect(submitEarlyAccessSignup).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp: null }),
    );
  });

  it("has no honeypot field a browser would autofill", () => {
    // The trap was name="company" with a "Company" label. Chrome recognised
    // it as the organization field, filled it from the visitor's saved
    // profile, and the backend discarded every such applicant behind a
    // success screen. Nothing in the form may carry that hint again.
    renderPage();
    const inputs = Array.from(document.querySelectorAll("input"));
    const names = inputs.map((i) => i.getAttribute("name") ?? "");
    expect(names).not.toContain("company");
    expect(names).not.toContain("organization");
    expect(document.body.textContent).not.toContain("Company");
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
