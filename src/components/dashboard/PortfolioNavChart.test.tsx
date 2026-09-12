/**
 * Regression tests for the net-worth history chart.
 *
 * The chart was once deleted wholesale and then restored; these lock the parts
 * that had already broken once: dates rendering a day early west of UTC, the
 * horizon auto-fallback, the empty-state ladder (never spin forever), and the
 * backend's series metadata reaching the user as a caption.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { NetworthJobStatus, PortfolioNavHistoryResponse } from "@/lib/api";

const api = vi.hoisted(() => ({
  getPortfolioNavHistory: vi.fn(),
  getNetworthHistoryStatus: vi.fn(),
  buildNetworthHistory: vi.fn(),
}));

vi.mock("@/lib/api", () => api);

// jsdom gives an SVG no layout, so recharts' ResponsiveContainer renders nothing.
// Stub it down to a marker so "the chart rendered" is observable.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="chart">{children}</div>
    ),
    AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

import PortfolioNavChart from "./PortfolioNavChart";
import {
  formatXLabel,
  parseSeriesDate,
  pickHorizonForSpan,
  seriesCaption,
} from "@/lib/networthSeries";

function series(
  points: PortfolioNavHistoryResponse["points"],
  extra: Partial<PortfolioNavHistoryResponse> = {}
): PortfolioNavHistoryResponse {
  const last = points[points.length - 1];
  return {
    horizon: "3Y",
    points,
    total_invested: last?.total_invested ?? 0,
    current_value: last?.total_value ?? 0,
    gain_percentage: last?.gain_percentage ?? 0,
    as_of: last?.recorded_date ?? null,
    is_stale: false,
    degraded_schemes: 0,
    ledger_complete: true,
    downsampled: false,
    ...extra,
  };
}

function job(extra: Partial<NetworthJobStatus>): NetworthJobStatus {
  return {
    status: "none",
    phase: null,
    progress_pct: 0,
    message: null,
    history_from: null,
    days_total: null,
    has_history: false,
    started_at: null,
    finished_at: null,
    trigger: null,
    warnings: null,
    ...extra,
  };
}

const TWO_POINTS = [
  { recorded_date: "2026-06-01", total_value: 100000, total_invested: 90000, gain_percentage: 11.1 },
  { recorded_date: "2026-09-09", total_value: 120000, total_invested: 95000, gain_percentage: 26.3 },
];

beforeEach(() => {
  api.getPortfolioNavHistory.mockReset();
  api.getNetworthHistoryStatus.mockReset();
  api.buildNetworthHistory.mockReset();
  // The chart probes the job status once per mount now (to catch a statement
  // rebuild that started elsewhere), so every test needs this to resolve.
  api.getNetworthHistoryStatus.mockResolvedValue(job({ status: "none" }));
});

describe("date helpers", () => {
  it("renders a recorded_date as the same calendar day in any timezone", () => {
    // `new Date("2026-09-09")` would be UTC midnight, i.e. 8 Sep in the Americas.
    const d = parseSeriesDate("2026-09-09");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 9]);
  });

  it("labels short horizons dd-mmm and long horizons mmm-yy", () => {
    expect(formatXLabel("2026-06-05", "1M")).toBe("05-Jun");
    expect(formatXLabel("2026-06-05", "3M")).toBe("05-Jun");
    expect(formatXLabel("2026-06-05", "1Y")).toBe("Jun-26");
    expect(formatXLabel("2026-06-05", "MAX")).toBe("Jun-26");
  });

  it("drops the default horizon to the closest period the data actually spans", () => {
    expect(pickHorizonForSpan(1200)).toBe("3Y");
    expect(pickHorizonForSpan(400)).toBe("1Y");
    expect(pickHorizonForSpan(100)).toBe("3M");
    expect(pickHorizonForSpan(20)).toBe("1M");
  });
});

describe("series caption", () => {
  it("says nothing on the healthy path", () => {
    expect(
      seriesCaption({ as_of: "2026-09-09", is_stale: false, degraded_schemes: 0, ledger_complete: true })
    ).toBeNull();
  });

  it("qualifies stale, provisional and estimated series", () => {
    expect(
      seriesCaption({ as_of: "2026-09-01", is_stale: true, degraded_schemes: 2, ledger_complete: false })
    ).toBe(
      "Values as of 01 Sept 2026 · 2 funds priced provisionally · Holdings from before your statement are estimated"
    );
  });
});

describe("<PortfolioNavChart />", () => {
  it("offers the CAMS import in the chart slot and hides the horizon picker while holdings are missing", () => {
    const onUploadCams = vi.fn();
    render(<PortfolioNavChart camsMissing onUploadCams={onUploadCams} />);
    expect(screen.getByText("See your portfolio history")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "MAX" })).toBeNull();
    // No holdings means no series can exist — nothing is fetched and, above all,
    // no build of an empty ledger is kicked off.
    expect(api.getPortfolioNavHistory).not.toHaveBeenCalled();
    expect(api.getNetworthHistoryStatus).not.toHaveBeenCalled();
    expect(api.buildNetworthHistory).not.toHaveBeenCalled();
  });

  it("draws the series and surfaces the backend's staleness caption", async () => {
    api.getPortfolioNavHistory.mockResolvedValue(series(TWO_POINTS, { is_stale: true }));
    render(<PortfolioNavChart />);
    await waitFor(() => expect(screen.getByTestId("chart")).toBeTruthy());
    expect(screen.getByTestId("networth-caption").textContent).toBe("Values as of 09 Sept 2026");
    // A 100-day span is a 3M account, not the 3Y default.
    await waitFor(() => expect(api.getPortfolioNavHistory).toHaveBeenLastCalledWith("3M"));
    // Status is probed exactly once — enough to notice a statement rebuild
    // started elsewhere, never the repeated polling of the no-series path.
    expect(api.getNetworthHistoryStatus).toHaveBeenCalledTimes(1);
  });

  // ── post-import invalidation ──────────────────────────────────────────────
  // A CAS import supersedes the statement the stored series was built from, so
  // every point on screen is about to change. Leaving the old chart up while the
  // backend rebuild runs presents last week's net worth as this week's.

  it("drops the superseded series the moment a statement is imported", async () => {
    api.getPortfolioNavHistory.mockResolvedValue(series(TWO_POINTS));
    const { rerender } = render(<PortfolioNavChart refreshToken={0} />);
    await waitFor(() => expect(screen.getByTestId("chart")).toBeTruthy());

    // The import lands: the backend has queued the rebuild but cannot have
    // finished it, so asking for the series again would return the old points.
    api.getNetworthHistoryStatus.mockResolvedValue(
      job({ status: "running", progress_pct: 40, trigger: "cas_upload", has_history: true })
    );
    const callsBefore = api.getPortfolioNavHistory.mock.calls.length;
    rerender(<PortfolioNavChart refreshToken={1} />);

    await waitFor(() => expect(screen.queryByTestId("chart")).toBeNull());
    await waitFor(() =>
      expect(screen.getByText(/Updating for your new statement… 40%/)).toBeTruthy()
    );
    // And critically, no refetch while the rebuild runs: that would put the
    // superseded points straight back on screen.
    expect(api.getPortfolioNavHistory.mock.calls.length).toBe(callsBefore);
  });

  it("draws the new series once the post-import rebuild succeeds", async () => {
    api.getPortfolioNavHistory.mockResolvedValue(series(TWO_POINTS));
    const { rerender } = render(<PortfolioNavChart refreshToken={0} />);
    await waitFor(() => expect(screen.getByTestId("chart")).toBeTruthy());

    api.getNetworthHistoryStatus.mockResolvedValue(
      job({ status: "running", progress_pct: 40, trigger: "cas_upload", has_history: true })
    );
    rerender(<PortfolioNavChart refreshToken={1} />);
    await waitFor(() => expect(screen.queryByTestId("chart")).toBeNull());

    const NEW_POINTS = [
      { recorded_date: "2026-06-01", total_value: 500000, total_invested: 400000, gain_percentage: 25 },
      { recorded_date: "2026-09-11", total_value: 640000, total_invested: 480000, gain_percentage: 33.3 },
    ];
    api.getPortfolioNavHistory.mockResolvedValue(series(NEW_POINTS));
    api.getNetworthHistoryStatus.mockResolvedValue(
      job({ status: "success", progress_pct: 100, trigger: "cas_upload", has_history: true })
    );

    await waitFor(() => expect(screen.getByTestId("chart")).toBeTruthy(), { timeout: 4000 });
  });

  it("keeps the chart up while a DAILY rebuild runs", async () => {
    // The nightly refresh recomputes the same statement — the numbers on screen
    // are still the right ones, so blanking the chart three times a day would be
    // pure churn. Only a statement import invalidates.
    api.getPortfolioNavHistory.mockResolvedValue(series(TWO_POINTS));
    api.getNetworthHistoryStatus.mockResolvedValue(
      job({ status: "running", progress_pct: 40, trigger: "daily", has_history: true })
    );
    render(<PortfolioNavChart />);
    await waitFor(() => expect(screen.getByTestId("chart")).toBeTruthy());
    expect(screen.queryByText(/Updating for your new statement/)).toBeNull();
    expect(screen.getByTestId("chart")).toBeTruthy();
  });

  it("hides a series superseded by a rebuild that started before this mount", async () => {
    // Uploaded from the invest gate, then navigated here: this component never
    // saw the import, so only the job's trigger can tell it the chart is stale.
    api.getPortfolioNavHistory.mockResolvedValue(series(TWO_POINTS));
    api.getNetworthHistoryStatus.mockResolvedValue(
      job({ status: "running", progress_pct: 15, trigger: "cas_upload", has_history: true })
    );
    render(<PortfolioNavChart />);
    await waitFor(() =>
      expect(screen.getByText(/Updating for your new statement… 15%/)).toBeTruthy()
    );
    expect(screen.queryByTestId("chart")).toBeNull();
  });

  it("starts the build itself, once, when no series and no job exist", async () => {
    api.getPortfolioNavHistory.mockResolvedValue(series([]));
    api.getNetworthHistoryStatus.mockResolvedValue(job({ status: "none" }));
    api.buildNetworthHistory.mockResolvedValue(job({ status: "running", progress_pct: 12 }));
    render(<PortfolioNavChart />);
    await waitFor(() => expect(api.buildNetworthHistory).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/Calculating your net worth history… 12%/)).toBeTruthy()
    );
  });

  it("does not spin forever when the status poll itself fails", async () => {
    api.getPortfolioNavHistory.mockResolvedValue(series([]));
    api.getNetworthHistoryStatus.mockRejectedValue(new Error("502"));
    render(<PortfolioNavChart />);
    await waitFor(() => expect(screen.getByText("Could not load chart.")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(api.buildNetworthHistory).not.toHaveBeenCalled();
  });

  it("shows an honest empty state for a horizon window with no points", async () => {
    api.getPortfolioNavHistory.mockResolvedValue(series([]));
    api.getNetworthHistoryStatus.mockResolvedValue(job({ status: "success", has_history: true }));
    render(<PortfolioNavChart />);
    await waitFor(() => expect(screen.getByText("No data for this period yet.")).toBeTruthy());
    expect(api.buildNetworthHistory).not.toHaveBeenCalled();
  });

  it("leaves a failed build on an explicit Try again rather than auto-retrying", async () => {
    api.getPortfolioNavHistory.mockResolvedValue(series([]));
    api.getNetworthHistoryStatus.mockResolvedValue(
      job({ status: "failed", message: "NAV fetch failed" })
    );
    render(<PortfolioNavChart />);
    await waitFor(() => expect(screen.getByText("NAV fetch failed")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(api.buildNetworthHistory).not.toHaveBeenCalled();
  });
});
