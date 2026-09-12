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
    expect(api.getNetworthHistoryStatus).not.toHaveBeenCalled();
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
