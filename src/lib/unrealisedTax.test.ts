import { describe, expect, it } from "vitest";

import {
  computeHoldingSummary,
  computeUnrealisedTax,
  openLots,
  xirr,
} from "./unrealisedTax";
import type { MfHoldingTransactionItem } from "./api";

const txn = (
  date: string,
  type: string,
  units: number,
  nav: number,
  amount?: number,
): MfHoldingTransactionItem => ({
  id: `${date}-${type}`,
  transaction_date: date,
  transaction_type: type,
  folio_number: "F1",
  units,
  nav,
  amount: amount ?? units * nav,
  stamp_duty: null,
  source_system: "test",
  is_inflow: type === "BUY",
  signed_amount: amount ?? units * nav,
});

/** A fixed "today" so holding periods don't drift with the calendar. */
const ASOF = new Date("2026-08-25T00:00:00Z");

describe("openLots — FIFO", () => {
  it("keeps only what has not been redeemed", () => {
    const lots = openLots(
      [
        txn("2022-01-10", "BUY", 100, 10),
        txn("2023-01-10", "BUY", 100, 20),
        txn("2024-01-10", "SELL", 150, 25),
      ],
      "EQUITY",
      ASOF,
    );
    // 150 of 200 units sold, oldest first → 50 left, all from the 2023 lot.
    const total = lots.reduce((s, l) => s + l.units, 0);
    expect(total).toBeCloseTo(50, 6);
    expect(lots).toHaveLength(1);
    expect(lots[0].purchaseDate).toBe("2023-01-10");
  });

  it("takes cost from the booked amount, so loads land in cost", () => {
    // 100 units at NAV 10, but ₹1,050 actually paid.
    const lots = openLots([txn("2024-01-10", "BUY", 100, 10, 1050)], "EQUITY", ASOF);
    expect(lots[0].costPerUnit).toBeCloseTo(10.5, 6);
  });

  it("splits equity lots at the one-year mark", () => {
    const lots = openLots(
      [txn("2020-01-01", "BUY", 10, 10), txn("2026-08-01", "BUY", 10, 10)],
      "EQUITY",
      ASOF,
    );
    expect(lots.find((l) => l.purchaseDate === "2020-01-01")!.term).toBe("LONG");
    expect(lots.find((l) => l.purchaseDate === "2026-08-01")!.term).toBe("SHORT");
  });

  it("returns nothing when the whole position has been sold", () => {
    const lots = openLots(
      [txn("2022-01-10", "BUY", 100, 10), txn("2024-01-10", "SELL", 100, 25)],
      "EQUITY",
      ASOF,
    );
    expect(lots).toHaveLength(0);
  });
});

describe("computeUnrealisedTax", () => {
  const base = {
    navDate: "2026-08-25",
    assetType: "EQUITY" as const,
    exitLoadPct: null,
    exitLoadMonths: null,
    asOf: ASOF,
  };

  it("applies the ₹1.25L exemption then 12.5% to long-term gains", () => {
    // 10,000 units at ₹10 cost = ₹1,00,000; now ₹40 = ₹4,00,000. Gain ₹3,00,000.
    const r = computeUnrealisedTax([txn("2020-01-01", "BUY", 10_000, 10)], {
      ...base,
      nav: 40,
    });
    expect(r.long).not.toBeNull();
    expect(r.long!.gains).toBeCloseTo(300_000, 4);
    expect(r.long!.exemption).toBeCloseTo(125_000, 4);
    expect(r.long!.taxable).toBeCloseTo(175_000, 4);
    expect(r.long!.tax).toBeCloseTo(21_875, 4); // 175,000 × 12.5%
    expect(r.short).toBeNull();
  });

  it("taxes short-term gains at 20% with no exemption", () => {
    const r = computeUnrealisedTax([txn("2026-06-01", "BUY", 1_000, 40)], {
      ...base,
      nav: 44,
    });
    expect(r.short).not.toBeNull();
    expect(r.short!.gains).toBeCloseTo(4_000, 4);
    expect(r.short!.exemption).toBe(0);
    expect(r.short!.tax).toBeCloseTo(800, 4); // 4,000 × 20%
  });

  it("charges exit load only on lots still inside the window", () => {
    const r = computeUnrealisedTax(
      [
        txn("2020-01-01", "BUY", 100, 10), // long past the window
        txn("2026-08-01", "BUY", 100, 10), // 24 days old
      ],
      { ...base, nav: 20, exitLoadPct: 1, exitLoadMonths: 12 },
    );
    // Old lot pays nothing; new lot pays 1% of 100 × 20 = ₹20.
    expect(r.long!.exitLoad).toBeCloseTo(0, 6);
    expect(r.short!.exitLoad).toBeCloseTo(20, 6);
    // The load reduces what you realise, and so the gain.
    expect(r.short!.amountRealised).toBeCloseTo(1_980, 6);
  });

  it("never reports negative tax on a loss-making holding", () => {
    const r = computeUnrealisedTax([txn("2020-01-01", "BUY", 100, 50)], {
      ...base,
      nav: 20,
    });
    expect(r.long!.gains).toBeLessThan(0);
    expect(r.long!.taxable).toBe(0);
    expect(r.long!.tax).toBe(0);
  });

  it("caps the exemption at the gain, so a small gain isn't over-relieved", () => {
    const r = computeUnrealisedTax([txn("2020-01-01", "BUY", 100, 10)], {
      ...base,
      nav: 20,
    });
    expect(r.long!.gains).toBeCloseTo(1_000, 4);
    expect(r.long!.exemption).toBeCloseTo(1_000, 4);
    expect(r.long!.tax).toBe(0);
  });

  it("splits a mixed holding into both blocks and totals the tax", () => {
    const r = computeUnrealisedTax(
      [txn("2020-01-01", "BUY", 10_000, 10), txn("2026-06-01", "BUY", 1_000, 40)],
      { ...base, nav: 44 },
    );
    expect(r.long).not.toBeNull();
    expect(r.short).not.toBeNull();
    expect(r.totalTax).toBeCloseTo(r.long!.tax + r.short!.tax, 6);
    expect(r.totalCurrentValue).toBeCloseTo(11_000 * 44, 4);
  });

  it("reports empty rather than zeroes when there is no ledger or no NAV", () => {
    expect(computeUnrealisedTax([], { ...base, nav: 40 }).empty).toBe(true);
    expect(
      computeUnrealisedTax([txn("2020-01-01", "BUY", 10, 10)], { ...base, nav: null }).empty,
    ).toBe(true);
  });
});

describe("xirr", () => {
  it("recovers a known annual rate on a single round trip", () => {
    // ₹100 out, ₹110 back one year later → 10%.
    const r = xirr([
      { date: "2024-01-01", amount: -100 },
      { date: "2025-01-01", amount: 110 },
    ]);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(0.1, 3);
  });

  it("handles a loss as a negative rate", () => {
    const r = xirr([
      { date: "2024-01-01", amount: -100 },
      { date: "2025-01-01", amount: 90 },
    ]);
    expect(r as number).toBeCloseTo(-0.1, 3);
  });

  it("annualises a half-year double to well above 100%", () => {
    const r = xirr([
      { date: "2025-01-01", amount: -100 },
      { date: "2025-07-02", amount: 200 },
    ]);
    expect(r as number).toBeGreaterThan(2.9);
  });

  it("returns null when the flows never change sign", () => {
    expect(
      xirr([
        { date: "2024-01-01", amount: -100 },
        { date: "2025-01-01", amount: -50 },
      ]),
    ).toBeNull();
    expect(xirr([{ date: "2024-01-01", amount: -100 }])).toBeNull();
  });

  it("solves a monthly SIP without diverging", () => {
    const flows = Array.from({ length: 24 }, (_, i) => ({
      date: `20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
      amount: -5000,
    }));
    flows.push({ date: "2026-01-01", amount: 140_000 });
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(r as number).toBeGreaterThan(0);
    expect(r as number).toBeLessThan(1);
  });
});

describe("computeHoldingSummary", () => {
  const base = { assetType: "EQUITY" as const, asOf: ASOF };

  it("values open lots and derives cost, gain and average NAV", () => {
    const r = computeHoldingSummary(
      [txn("2021-04-12", "BUY", 1_000, 100), txn("2026-07-05", "BUY", 1_000, 120)],
      { ...base, nav: 130 },
    );
    expect(r.units).toBeCloseTo(2_000, 6);
    expect(r.investedValue).toBeCloseTo(220_000, 4);
    expect(r.currentValue).toBeCloseTo(260_000, 4);
    expect(r.gains).toBeCloseTo(40_000, 4);
    expect(r.averageNav).toBeCloseTo(110, 6);
    expect(r.firstInvestmentDate).toBe("2021-04-12");
    expect(r.lastInvestmentDate).toBe("2026-07-05");
  });

  it("excludes units already sold from what counts as invested", () => {
    const r = computeHoldingSummary(
      [txn("2021-01-01", "BUY", 1_000, 100), txn("2024-01-01", "SELL", 600, 150)],
      { ...base, nav: 200 },
    );
    expect(r.units).toBeCloseTo(400, 6);
    expect(r.investedValue).toBeCloseTo(40_000, 4);
  });

  it("reports a positive XIRR on a holding that grew", () => {
    const r = computeHoldingSummary([txn("2021-04-12", "BUY", 1_000, 100)], {
      ...base,
      nav: 200,
    });
    expect(r.xirr).not.toBeNull();
    expect(r.xirr as number).toBeGreaterThan(0);
  });

  it("reports empty when nothing is held or no NAV is known", () => {
    expect(computeHoldingSummary([], { ...base, nav: 100 }).empty).toBe(true);
    expect(
      computeHoldingSummary([txn("2021-01-01", "BUY", 10, 10)], { ...base, nav: null }).empty,
    ).toBe(true);
  });
});
