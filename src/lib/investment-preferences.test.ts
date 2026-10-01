import { describe, it, expect } from "vitest";

import {
  classRows, followProzprWhereMatching, fromCurrentHoldings,
  fromSavedPins, isEngaged, limitingClass, lookThroughMix, matchesProzpr, maxMultiAsset,
  multiAssetParts, prozprSplit, recommendedMix, recommendedValues, resolve, roundMix,
  sameMix, samePins, shortLabel, toSavePins,
} from "@/lib/investment-preferences";
import { CATALOG as CAT, COMP, MINE, PLAN, cat } from "@/test/preferences-fixtures";

const pick = (rows: Record<string, number | null>, ids: string[]) => ids.map((id) => rows[id]);
const EQ = ["low_beta_equities", "medium_beta_equities", "us_equities"];
const DEBT = ["arbitrage", "arbitrage_plus_income", "short_debt"];

describe("roundMix", () => {
  it("rounds to a whole percent and lets others absorb the residual", () => {
    expect(roundMix({ equity: 72.02, debt: 21.36, others: 6.61 }))
      .toEqual({ equity: 72, debt: 21, others: 7 });
  });
});

describe("multiAssetParts", () => {
  // Debt and commodity round; equity takes the rest, so the parts add back.
  it.each([
    [30, { equity: 19, debt: 8, others: 3 }], // 7.5 → 8, 3.0 → 3
    [64, { equity: 42, debt: 16, others: 6 }], // the plan's fund
    [5, { equity: 3, debt: 1, others: 1 }], // 1.25 → 1, 0.5 → 1
  ])("splits %s%% by the fund's make-up", (amount, want) => {
    expect(multiAssetParts(amount, COMP)).toEqual(want);
  });

  it("uses the make-up it is given, not a built-in one", () => {
    expect(multiAssetParts(30, { equity: 50, debt: 50, others: 0 })).toEqual({ equity: 15, debt: 15, others: 0 });
  });
});

describe("maxMultiAsset and limitingClass", () => {
  it.each([
    // 41 → debt 10.25 → 10 fits; 42 → 10.5 → 11 does not.
    ["the screenshots' mix", MINE, 41, "debt"],
    // Rounding lets it past the plain ratio (50): 54 → commodity 5.4 → 5; 55 → 5.5 → 6.
    ["a commodity-bound mix", { equity: 70, debt: 25, others: 5 }, 54, "others"],
    ["the fund's own make-up", COMP, 100, null],
    // Zero means zero. 1% of the fund is 0.25% debt and 0.1% gold, which whole
    // percents would round to 0 and let through — but the engine builds no
    // fund at all without debt (`_sleeve_size`), so the screen must not offer one.
    ["a mix with no debt or commodity", { equity: 100, debt: 0, others: 0 }, 0, "debt"],
    ["a mix with no commodity", { equity: 90, debt: 10, others: 0 }, 0, "others"],
    ["a mix with no equity", { equity: 0, debt: 50, others: 50 }, 0, "equity"],
  ] as const)("%s", (_, mix, max, cls) => {
    expect(maxMultiAsset(mix, COMP)).toBe(max);
    expect(limitingClass(mix, COMP)).toBe(cls);
  });

  // Only a class the fund actually holds is barred by a zero.
  it("lets a zero class through when the fund holds none of it", () => {
    const noGold = { equity: 50, debt: 50, others: 0 };
    expect(maxMultiAsset(noGold, noGold)).toBe(100);
    expect(limitingClass(noGold, noGold)).toBeNull();
  });

  // Prozpr's own pick is capped by the same rule, so a 100%-equity customer is
  // not told Prozpr recommends a fund the plan would never hold.
  it("caps Prozpr's pick to nothing for a mix with no debt", () => {
    const res = resolve({ equity: 100, debt: 0, others: 0 }, {}, CAT);
    expect(res.prozprMultiAsset).toBe(0);
    expect(res.multiAsset).toBe(0);
  });
});

describe("resolve", () => {
  it("starts an untouched customer on Prozpr's plan", () => {
    const mix = recommendedMix(CAT);
    expect(mix).toEqual({ equity: 78, debt: 16, others: 6 });
    const res = resolve(mix, {}, CAT);
    expect(res.multiAsset).toBe(64);
    expect(pick(res.rows, EQ)).toEqual([0, 20, 16]);
    expect(pick(res.rows, DEBT)).toEqual([0, 0, 0]);
    expect(res.rows.gold_commodities).toBe(0);
  });

  // The screenshots: 85 / 10 / 5 with 30% in the fund (19 / 8 / 3), leaving
  // 66 / 2 / 2. Prozpr's equity weights 20:16 on 66 → 36.7 / 29.3 → 37 / 29.
  it("fits Prozpr's split to what the customer has left in each class", () => {
    const res = resolve(MINE, { multi_asset: 30 }, CAT);
    expect(res.parts).toEqual({ equity: 19, debt: 8, others: 3 });
    expect(res.remainder).toEqual({ equity: 66, debt: 2, others: 2 });
    expect(pick(res.rows, EQ)).toEqual([0, 37, 29]);
    expect(pick(res.rows, DEBT)).toEqual([0, 2, 0]);
    expect(res.rows.gold_commodities).toBe(2);
  });

  it("caps Prozpr's pick at what the mix can hold", () => {
    expect(resolve(MINE, {}, CAT).prozprMultiAsset).toBe(41);
  });

  it("holds multi-asset at the limit while it does not fit, and gives it back when it does", () => {
    expect(resolve(MINE, { multi_asset: 60 }, CAT).multiAsset).toBe(41);
    expect(resolve({ equity: 70, debt: 20, others: 10 }, { multi_asset: 60 }, CAT).multiAsset).toBe(60);
  });

  // No auto-scaling: 11 / 27 / 28 was set against 66. With equity's share at
  // 61 it stays 11 / 27 / 28 — 66 of 61 — and the class is flagged, not
  // quietly refitted to 10 / 25 / 26.
  it("keeps the customer's own split as set when its share moves, and flags it", () => {
    const set = { multi_asset: 30, low_beta_equities: 11, medium_beta_equities: 27, us_equities: 28 };
    const moved = resolve({ equity: 80, debt: 15, others: 5 }, set, CAT);
    expect(pick(moved.rows, EQ)).toEqual([11, 27, 28]);
    expect(moved.unbalanced).toEqual(["equity"]);
    const back = resolve(MINE, set, CAT);
    expect(pick(back.rows, EQ)).toEqual([11, 27, 28]);
    expect(back.unbalanced).toEqual([]);
  });

  // Zeros the customer stepped down to are theirs — the group does not jump
  // back to Prozpr's split the moment every row reaches 0.
  it("keeps a class the customer set to all zeros, flagged as short of its share", () => {
    const res = resolve(MINE, { multi_asset: 30, arbitrage: 0, arbitrage_plus_income: 0, short_debt: 0 }, CAT);
    expect(pick(res.rows, DEBT)).toEqual([0, 0, 0]);
    expect(res.unbalanced).toEqual(["debt"]);
  });

  it("flags nothing while every class follows Prozpr", () => {
    expect(resolve(MINE, { multi_asset: 30 }, CAT).unbalanced).toEqual([]);
  });
});

describe("prozprSplit", () => {
  const rows = classRows(PLAN, "debt");

  it("shares evenly when there are no weights to go by", () => {
    const flat = rows.map((r) => ({ ...r, weight_in_class: 0 }));
    expect(pick(prozprSplit(flat, 2), DEBT)).toEqual([1, 1, 0]);
  });
});

describe("matchesProzpr and followProzprWhereMatching", () => {
  const set = {
    multi_asset: 30,
    low_beta_equities: 0, medium_beta_equities: 37, us_equities: 29, // Prozpr's, typed out
    arbitrage: 1, arbitrage_plus_income: 1, short_debt: 0, // the customer's own
  };

  it("tells a class on Prozpr's numbers from one that is not", () => {
    const res = resolve(MINE, set, CAT);
    expect(matchesProzpr(res.rows, res.prozprRows, classRows(PLAN, "equity"))).toBe(true);
    expect(matchesProzpr(res.rows, res.prozprRows, classRows(PLAN, "debt"))).toBe(false);
  });

  it("hands a class back to Prozpr only when it matches, leaving the customer's own fund pick alone", () => {
    const out = followProzprWhereMatching(MINE, set, CAT);
    expect(pick(out, EQ)).toEqual([null, null, null]);
    expect(pick(out, DEBT)).toEqual([1, 1, 0]);
    expect(out.multi_asset).toBe(30);
  });

  // Following Prozpr caps the pick exactly as a stored 64 would, so the two
  // are the same — and only the blank one leaves "engine decides" untouched.
  it("treats a fund pick equal to Prozpr's own recommendation as following Prozpr", () => {
    expect(followProzprWhereMatching(MINE, { multi_asset: 64 }, CAT).multi_asset).toBeNull();
  });

  // Leaving one split page must not reach into another class — one with
  // nothing left to divide always "matches", and would lose its split.
  it("only looks at the classes it is given", () => {
    const out = followProzprWhereMatching(MINE, set, CAT, ["debt"]);
    expect(pick(out, EQ)).toEqual([0, 37, 29]);
  });
});

describe("lookThroughMix", () => {
  it("counts the fund by its make-up alongside each class's own rows", () => {
    // 20 in the fund → 13 / 5 / 2.
    expect(lookThroughMix({ multi_asset: 20, low_beta_equities: 30, arbitrage: 20, gold_commodities: 30 }, CAT))
      .toEqual({ equity: 43, debt: 25, others: 32 });
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

describe("recommendedValues", () => {
  it("rounds the recommendation to whole numbers that still sum to 100", () => {
    const cats = [cat("a", "equity", "A", 33.3, 1), cat("b", "debt", "B", 33.3, 1), cat("c", "others", "C", 33.4, 1)];
    const rec = recommendedValues(cats);
    for (const id of ["a", "b", "c"]) expect(Number.isInteger(rec[id])).toBe(true);
    expect((rec.a ?? 0) + (rec.b ?? 0) + (rec.c ?? 0)).toBe(100);
  });
});

describe("dirty helpers", () => {
  it("sameMix / samePins detect equality irrespective of pin order", () => {
    expect(sameMix({ equity: 72, debt: 18, others: 10 }, { equity: 72, debt: 18, others: 10 })).toBe(true);
    expect(
      samePins(
        [{ subgroup: "a", pct_of_total: 5 }, { subgroup: "b", pct_of_total: 3 }],
        [{ subgroup: "b", pct_of_total: 3 }, { subgroup: "a", pct_of_total: 5 }],
      ),
    ).toBe(true);
  });
});

describe("toSavePins", () => {
  const shown = resolve(MINE, { multi_asset: 30 }, CAT).rows;

  it("sends every category, as shown, once the customer has set anything", () => {
    const out = toSavePins({ multi_asset: 30 }, shown, PLAN);
    expect(out).toHaveLength(PLAN.length);
    expect(out.find((p) => p.subgroup === "gold_commodities")).toEqual({ subgroup: "gold_commodities", pct_of_total: 2 });
  });

  it("sends nothing at all when nothing is set", () => {
    expect(toSavePins({}, shown, PLAN)).toEqual([]);
    expect(toSavePins({ multi_asset: null }, shown, PLAN)).toEqual([]);
  });

  it("round-trips through fromSavedPins", () => {
    const back = fromSavedPins(toSavePins({ multi_asset: 30 }, shown, PLAN), PLAN);
    expect(back.multi_asset).toBe(30);
    expect(back.short_debt).toBe(0); // a saved zero stays a zero, not a blank
  });

  // A save from the old tenths grid must land on the whole-percent grid, or a
  // class can never add up and Done never lights.
  it("reads a saved value back as a whole percent", () => {
    expect(fromSavedPins([{ subgroup: "multi_asset", pct_of_total: 63.5 }], PLAN).multi_asset).toBe(64);
  });

  it("reads an empty saved payload back as all blanks", () => {
    expect(Object.values(fromSavedPins([], PLAN)).every((v) => v === null)).toBe(true);
  });
});

describe("shortLabel", () => {
  it("drops the class word the group header already carries", () => {
    expect(shortLabel(cat("x", "equity", "large-cap equity", 0, 0))).toBe("Large-cap");
    expect(shortLabel(cat("x", "debt", "short-duration debt", 0, 0))).toBe("Short-duration");
  });

  it("capitalises without touching the rest of the words", () => {
    expect(shortLabel(cat("x", "debt", "corporate & credit debt", 0, 0))).toBe("Corporate & credit");
    expect(shortLabel(cat("x", "equity", "US equity", 0, 0))).toBe("US");
  });

  it("leaves a label that does not end in its class word alone", () => {
    expect(shortLabel(cat("x", "others", "gold", 0, 0))).toBe("Gold");
    expect(shortLabel(cat("x", "equity", "multi-asset funds", 0, null))).toBe("Multi-asset funds");
  });
});

describe("fromCurrentHoldings", () => {
  // Today is a complete fact: a category the customer holds nothing of is a
  // real zero, and a subgroup the screen cannot set has no row at all.
  it("covers every catalog row and nothing else", () => {
    const v = fromCurrentHoldings(
      [
        { subgroup: "short_debt", pct_of_total: 40 },
        { subgroup: "low_beta_equities", pct_of_total: 60 },
        { subgroup: "tax_efficient_equities", pct_of_total: 15 },
      ],
      PLAN,
    )!;
    expect(Object.keys(v).sort()).toEqual(PLAN.map((c) => c.id).sort());
    expect(v.short_debt).toBe(40);
    expect(v.gold_commodities).toBe(0);
  });

  it("puts every figure on the whole-percent grid", () => {
    const v = fromCurrentHoldings(
      [{ subgroup: "short_debt", pct_of_total: 21.63 }, { subgroup: "low_beta_equities", pct_of_total: 78.37 }],
      PLAN,
    )!;
    expect(v.short_debt).toBe(22);
  });

  // Any drift would be drawn on the today bar as a class the customer does
  // not hold, or a bar that does not fill.
  it("sums to exactly 100 whichever way the payload drifted, leaving an untouched row at 0", () => {
    for (const holdings of [
      [{ subgroup: "low_beta_equities", pct_of_total: 33.33 }, { subgroup: "short_debt", pct_of_total: 33.33 },
        { subgroup: "arbitrage", pct_of_total: 33.34 }],
      [{ subgroup: "low_beta_equities", pct_of_total: 50 }, { subgroup: "short_debt", pct_of_total: 31.6 }],
    ]) {
      const v = fromCurrentHoldings(holdings, PLAN)!;
      expect(Object.values(v).reduce((s, x) => s + (x ?? 0), 0)).toBe(100);
      expect(v.gold_commodities).toBe(0);
    }
  });

  // A set of zeros cannot be drawn as a distribution: it means "holds nothing".
  it("reads an all-zero or empty payload as nothing held", () => {
    expect(fromCurrentHoldings([{ subgroup: "short_debt", pct_of_total: 0 }], PLAN)).toBeNull();
    expect(fromCurrentHoldings([], PLAN)).toBeNull();
  });
});
