import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
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

// 40 of 100 left, i.e. past the halfway mark but well clear of the last 20:
// the stage the page describes without naming a figure.
const seats = { seats_total: 100, seats_claimed: 60, seats_left: 40 };

beforeEach(() => {
  localStorage.clear();
  submitEarlyAccessSignup.mockReset();
  getEarlyAccessSeats.mockReset().mockResolvedValue(seats);
});

describe("/earlyaccess", () => {
  it("describes the stage the backend reports", async () => {
    renderPage();
    expect(await screen.findAllByText("Over half claimed")).not.toHaveLength(0);
    expect(document.title).toContain("founding tester");
  });

  it("carries no version label anywhere a visitor can read", async () => {
    // "MVP" is our word for the build, and an edition number tells a
    // prospective customer they have been handed a numbered pre-release.
    renderPage();
    await screen.findAllByText("Over half claimed");
    const copy = document.body.textContent ?? "";
    expect(copy).not.toContain("MVP");
    expect(copy).not.toContain("2.0");
    expect(document.title).not.toContain("MVP");
  });

  describe("how much of the count it publishes", () => {
    const stage = async (seats_left: number) => {
      getEarlyAccessSeats.mockReset().mockResolvedValue({
        seats_total: 100,
        seats_claimed: 100 - seats_left,
        seats_left,
      });
      renderPage();
      return screen.findAllByText(/Filling fast|Over half claimed|seats? available|Standby/);
    };

    it("withholds the figure while seats are plentiful", async () => {
      // A true "3 of 100 claimed" on the first morning is an empty room
      // rendered as a statistic. The page states the stage instead.
      await stage(78);
      expect(screen.getAllByText("Filling fast").length).toBeGreaterThan(0);
      expect(await screen.findByText("Seats are filling fast")).toBeInTheDocument();
      expect(screen.queryByText(/\d+ seats? available/)).not.toBeInTheDocument();
      expect(screen.queryByText(/seats claimed/)).not.toBeInTheDocument();
    });

    it("says less than half remain only once that is true", async () => {
      // Exactly half left is NOT less than half, so it stays on the earlier
      // stage; one seat past it, the claim holds and the page makes it.
      await stage(50);
      expect(await screen.findByText("Seats are filling fast")).toBeInTheDocument();
      cleanup();

      await stage(49);
      expect(await screen.findByText("Less than half the seats remain")).toBeInTheDocument();
      expect(screen.queryByText(/\d+ seats? available/)).not.toBeInTheDocument();
    });

    it("names the number over the last 20 seats", async () => {
      await stage(19);
      expect(await screen.findByText("19 seats available of 100")).toBeInTheDocument();
      expect(screen.getAllByText("19 seats available").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Claim one of the last 19").length).toBeGreaterThan(0);
    });

    it("opens the standby list rather than closing the door", async () => {
      await stage(0);
      expect(await screen.findByText("Every seat in this round is taken")).toBeInTheDocument();
      expect(screen.getAllByText("Join the standby list").length).toBeGreaterThan(0);
    });
  });

  it("validates before submitting and sends the sign-up to the backend", async () => {
    submitEarlyAccessSignup.mockResolvedValue({ ok: true, ...seats, seats_claimed: 61, seats_left: 39 });
    renderPage();
    fireEvent.click((await screen.findAllByText("Claim your seat now"))[0]);

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
    // The card follows the count the backend returned with the sign-up.
    expect(screen.getAllByText("Over half claimed").length).toBeGreaterThan(0);
  });

  it("never invents a stage when the live figure is unreadable", async () => {
    // A fabricated fallback would make a claim about how many people signed
    // up that nothing backs. The page must say less instead.
    getEarlyAccessSeats.mockReset().mockRejectedValue(new Error("503"));
    renderPage();

    expect(await screen.findAllByText("Claim your seat")).not.toHaveLength(0);
    expect(screen.queryByText("Filling fast")).not.toBeInTheDocument();
    expect(screen.queryByText("Over half claimed")).not.toBeInTheDocument();
    expect(screen.queryByText(/seats? available/)).not.toBeInTheDocument();
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
    // The sign-up response carries real figures, so the card appears now.
    expect(screen.getAllByText("Over half claimed").length).toBeGreaterThan(0);
  });

  it("caps the WhatsApp number at 10 digits and sends the bare digits", async () => {
    submitEarlyAccessSignup.mockResolvedValue({ ok: true, ...seats });
    renderPage();
    fireEvent.click((await screen.findAllByText("Claim your seat now"))[0]);

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
    // No "+" in the payload: Google Sheets would read a leading + as a
    // formula and store the number as #ERROR!.
    expect(submitEarlyAccessSignup).toHaveBeenCalledWith(
      expect.objectContaining({ whatsapp: "8468882142" }),
    );
  });

  it("rejects a short WhatsApp number but allows a blank one", async () => {
    submitEarlyAccessSignup.mockResolvedValue({ ok: true, ...seats });
    renderPage();
    fireEvent.click((await screen.findAllByText("Claim your seat now"))[0]);
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
    fireEvent.click((await screen.findAllByText("Claim your seat now"))[0]);
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
