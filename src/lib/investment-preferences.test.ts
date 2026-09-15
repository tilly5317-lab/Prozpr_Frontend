import { describe, it, expect } from "vitest";

import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import {
  applyDividerDrag,
  classAllocated, classBudget, classStatus, distributionValid, fromSavedPins,
  isEngaged, multiAssetDraw, multiAssetOverdraw, recommendedMix, resetValues,
  round1, roundMix, sameMix, samePins, toSavePins, type RowValues,
} from "@/lib/investment-preferences";

const mix = { equity: 72, debt: 18, others: 10 };

const CATS: ScreenSubcategory[] = [
  { id: "multi_asset",           class: "equity", label: "Multi-Asset",  recommended_pct_of_total: 20 },
  { id: "low_beta_equities",     class: "equity", label: "Large-cap",    recommended_pct_of_total: 30 },
  { id: "short_debt",            class: "debt",   label: "Short Debt",   recommended_pct_of_total: 20 },
  { id: "arbitrage",             class: "debt",   label: "Arbitrage",    recommended_pct_of_total: 0 },
  { id: "gold_commodities",      class: "others", label: "Gold",         recommended_pct_of_total: 30 },
];
const BAR: ClassMix = { equity: 43, debt: 25, others: 32 };

describe("applyDividerDrag", () => {
  it("handle 1 trades equity with debt, commodity fixed", () => {
    expect(applyDividerDrag(mix, 1, 80)).toEqual({ equity: 80, debt: 10, others: 10 });
  });

  it("handle 2 trades commodity with debt, equity fixed", () => {
    expect(applyDividerDrag(mix, 2, 95)).toEqual({ equity: 72, debt: 23, others: 5 });
  });

  it("clamps handle 1 at the second divider", () => {
    expect(applyDividerDrag(mix, 1, 99)).toEqual({ equity: 90, debt: 0, others: 10 });
  });

  it("always sums to 100", () => {
    const m = applyDividerDrag(mix, 1, 33);
    expect(m.equity + m.debt + m.others).toBe(100);
  });
});

describe("roundMix now keeps one decimal", () => {
  it("rounds to a tenth and lets others absorb the residual", () => {
    expect(roundMix({ equity: 72.02, debt: 21.36, others: 6.61 }))
      .toEqual({ equity: 72, debt: 21.4, others: 6.6 });
  });
  it("always sums to 100", () => {
    const m = roundMix({ equity: 72.44, debt: 21.34, others: 6.22 });
    expect(round1(m.equity + m.debt + m.others)).toBe(100);
  });
  it("leaves an already-whole mix unchanged", () => {
    expect(roundMix({ equity: 72, debt: 18, others: 10 }))
      .toEqual({ equity: 72, debt: 18, others: 10 });
  });
});

describe("multiAssetDraw", () => {
  it("splits an entry 65/25/10 across the classes", () => {
    const v: RowValues = { multi_asset: 20 };
    expect(multiAssetDraw(v, "equity")).toBe(13);
    expect(multiAssetDraw(v, "debt")).toBe(5);
    expect(multiAssetDraw(v, "others")).toBe(2);
  });

  it("keeps the three draws adding back to what was typed", () => {
    // 5.0 splits to 3.25 / 1.25 / 0.50 — equity carries the rounding residual
    // so the three printed figures still total 5.0 and not 5.1.
    const v: RowValues = { multi_asset: 5 };
    expect(multiAssetDraw(v, "debt")).toBe(1.3);
    expect(multiAssetDraw(v, "others")).toBe(0.5);
    expect(multiAssetDraw(v, "equity")).toBe(3.2);
    expect(round1(3.2 + 1.3 + 0.5)).toBe(5);
  });

  it("is zero when multi-asset is blank", () => {
    expect(multiAssetDraw({}, "equity")).toBe(0);
  });
});

describe("classBudget", () => {
  it("nets each class down by its draw, on the one-decimal grid", () => {
    const v: RowValues = { multi_asset: 20 };
    expect(classBudget(BAR, v, "equity")).toBe(30);
    expect(classBudget(BAR, v, "debt")).toBe(20);
    expect(classBudget(BAR, v, "others")).toBe(30);
  });

  it("is always reachable by typing the number it returns", () => {
    // The bug this replaces: a raw budget of 12.75 printed as "12.8" that
    // neither 12.7 nor 12.8 could satisfy.
    const bar: ClassMix = { equity: 78, debt: 14, others: 8 };
    for (let k = 1; k <= 200; k++) {
      const v: RowValues = { multi_asset: k / 10 };
      const budget = classBudget(bar, v, "debt");
      if (budget < 0) continue;
      expect(classStatus(bar, { ...v, short_debt: budget }, CATS, "debt").state).toBe("balanced");
    }
  });

  it("flags the class a too-large multi-asset entry overdraws", () => {
    expect(multiAssetOverdraw({ equity: 88, debt: 4, others: 8 }, { multi_asset: 20 })).toBe("debt");
    expect(multiAssetOverdraw(BAR, { multi_asset: 20 })).toBeNull();
  });
});

describe("classAllocated excludes multi-asset", () => {
  it("counts only the class's own rows", () => {
    expect(classAllocated({ multi_asset: 20, low_beta_equities: 30 }, CATS, "equity")).toBe(30);
  });
  it("reads a blank row as zero", () => {
    expect(classAllocated({ low_beta_equities: null }, CATS, "equity")).toBe(0);
  });
});

describe("classStatus", () => {
  const v = (eq: number): RowValues => ({ multi_asset: 20, low_beta_equities: eq });
  it("is under when the rows do not fill the budget", () => {
    expect(classStatus(BAR, v(24), CATS, "equity")).toMatchObject({ state: "under", delta: -6 });
  });
  it("is over when they exceed it", () => {
    expect(classStatus(BAR, v(36), CATS, "equity")).toMatchObject({ state: "over", delta: 6 });
  });
  it("is balanced on an exact match — no tolerance involved", () => {
    expect(classStatus(BAR, v(30), CATS, "equity")).toMatchObject({ state: "balanced", delta: 0 });
  });
});

describe("isEngaged", () => {
  it("is false when every row is blank", () => {
    expect(isEngaged({})).toBe(false);
    expect(isEngaged({ multi_asset: null, gold_commodities: null })).toBe(false);
  });
  it("treats a zero as a real entry, not as absent", () => {
    expect(isEngaged({ gold_commodities: 0 })).toBe(true);
  });
});

describe("distributionValid", () => {
  const complete: RowValues = {
    multi_asset: 20, low_beta_equities: 30, short_debt: 20, gold_commodities: 30,
  };
  it("accepts a distribution where every class balances", () => {
    expect(distributionValid(BAR, complete, CATS)).toBe(true);
  });
  it("rejects one where a single class is short", () => {
    expect(distributionValid(BAR, { ...complete, short_debt: 19 }, CATS)).toBe(false);
  });
  it("rejects an untouched distribution", () => {
    expect(distributionValid(BAR, {}, CATS)).toBe(false);
  });
});

describe("Reset to Prozpr lands balanced by construction", () => {
  const withTotal = (nudge: number): ScreenSubcategory[] =>
    CATS.map((c) => c.id === "low_beta_equities"
      ? { ...c, recommended_pct_of_total: round1(c.recommended_pct_of_total + nudge) } : c);

  // The backend rounds each row to one decimal INDEPENDENTLY, so the catalog
  // can sum to 99.9 or 100.1. Reset has to balance in all three cases.
  it.each([-0.1, 0, 0.1])("balances when the catalog is nudged by %s", (nudge) => {
    const cats = withTotal(nudge);
    const mix = recommendedMix(cats);
    expect(round1(mix.equity + mix.debt + mix.others)).toBe(100);
    expect(distributionValid(mix, resetValues(cats, mix), cats)).toBe(true);
  });
});

describe("dirty helpers", () => {
  it("sameMix / samePins detect equality irrespective of pin order", () => {
    expect(sameMix(mix, { equity: 72, debt: 18, others: 10 })).toBe(true);
    expect(
      samePins(
        [{ subgroup: "a", pct_of_total: 5 }, { subgroup: "b", pct_of_total: 3 }],
        [{ subgroup: "b", pct_of_total: 3 }, { subgroup: "a", pct_of_total: 5 }],
      ),
    ).toBe(true);
  });
});

describe("toSavePins", () => {
  it("sends EVERY settable row once engaged, blanks as explicit zeros", () => {
    const out = toSavePins({ multi_asset: 20, low_beta_equities: 30 }, CATS);
    expect(out).toHaveLength(CATS.length);
    expect(out.find((p) => p.subgroup === "gold_commodities"))
      .toEqual({ subgroup: "gold_commodities", pct_of_total: 0 });
  });

  it("sends nothing at all when untouched", () => {
    expect(toSavePins({}, CATS)).toEqual([]);
    expect(toSavePins({ multi_asset: null }, CATS)).toEqual([]);
  });

  it("round-trips through fromSavedPins", () => {
    const back = fromSavedPins(
      toSavePins({ multi_asset: 20, low_beta_equities: 30, gold_commodities: 0 }, CATS), CATS);
    expect(back.multi_asset).toBe(20);
    expect(back.gold_commodities).toBe(0);   // a saved zero stays a zero, not a blank
  });

  it("reads an empty saved payload back as all blanks", () => {
    expect(fromSavedPins([], CATS)).toEqual({
      multi_asset: null, low_beta_equities: null, short_debt: null,
      arbitrage: null, gold_commodities: null,
    });
  });
});
