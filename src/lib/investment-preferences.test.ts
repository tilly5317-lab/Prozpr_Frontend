import { describe, it, expect } from "vitest";

import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import {
  applyDividerDrag,
  classAllocated, classBudget, fromSavedPins,
  isEngaged, multiAssetDraw, recommendedMix, lookThroughMix, fromCurrentHoldings,
  round1, roundMix, sameMix, samePins, toSavePins, type RowValues,
  applySegmentDrag, applyTypedEntry, maxMultiAsset, normalise, shortLabel, CLASSES, MULTI_ASSET_ID, recommendedValues,
  barPosToValue, segmentLayout,
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

  // The recommendation arrives on the one-decimal grid (62.1 / 28 / 9.9), and
  // debt is the derived residual on BOTH handles — so a raw subtraction handed
  // the bar 29.099999999999994 to print.
  it("keeps every class on the one-decimal grid from a one-decimal start", () => {
    expect(applyDividerDrag({ equity: 62.1, debt: 28, others: 9.9 }, 1, 61))
      .toEqual({ equity: 61, debt: 29.1, others: 9.9 });
    expect(applyDividerDrag({ equity: 62.1, debt: 28, others: 9.9 }, 2, 80))
      .toEqual({ equity: 62.1, debt: 17.9, others: 20 });
  });

  it("never drifts off the grid or off 100, wherever it is dragged", () => {
    for (const start of [{ equity: 62.1, debt: 28, others: 9.9 }, { equity: 33.3, debt: 33.3, others: 33.4 }]) {
      for (const pos of [-10, 0, 13, 47, 61, 88, 100, 130]) {
        for (const h of [1, 2] as const) {
          const m = applyDividerDrag(start, h, pos);
          expect(m.equity + m.debt + m.others).toBe(100);
          for (const v of [m.equity, m.debt, m.others]) expect(v).toBe(round1(v));
        }
      }
    }
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

});

describe("classAllocated excludes multi-asset", () => {
  it("counts only the class's own rows", () => {
    expect(classAllocated({ multi_asset: 20, low_beta_equities: 30 }, CATS, "equity")).toBe(30);
  });
  it("reads a blank row as zero", () => {
    expect(classAllocated({ low_beta_equities: null }, CATS, "equity")).toBe(0);
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
    const out = normalise(mix, recommendedValues(cats), cats);
    for (const c of CLASSES) {
      if (!cats.some((x) => x.id !== MULTI_ASSET_ID && x.class === c)) continue;
      expect(classAllocated(out, cats, c)).toBe(classBudget(mix, out, c));
    }
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

// ── Segmented-bar model ───────────────────────────────────
// A class's rows are segments of one bar, so "balanced" is structural: every
// path that can change a class budget runs through `normalise`, and every edit
// inside a class runs through `applySegmentDrag`. Both preserve the sum.

const EQ_ROWS: ScreenSubcategory[] = [
  { id: "a", class: "equity", label: "A", recommended_pct_of_total: 30 },
  { id: "b", class: "equity", label: "B", recommended_pct_of_total: 20 },
  { id: "c", class: "equity", label: "C", recommended_pct_of_total: 10 },
];

describe("shortLabel", () => {
  it("drops the class word the group header already carries", () => {
    expect(shortLabel({ id: "x", class: "equity", label: "large-cap equity", recommended_pct_of_total: 0 }))
      .toBe("Large-cap");
    expect(shortLabel({ id: "x", class: "debt", label: "short-duration debt", recommended_pct_of_total: 0 }))
      .toBe("Short-duration");
  });

  it("capitalises without touching the rest of the words", () => {
    expect(shortLabel({ id: "x", class: "debt", label: "corporate & credit debt", recommended_pct_of_total: 0 }))
      .toBe("Corporate & credit");
    expect(shortLabel({ id: "x", class: "equity", label: "US equity", recommended_pct_of_total: 0 })).toBe("US");
  });

  it("leaves a label that does not end in its class word alone", () => {
    expect(shortLabel({ id: "x", class: "others", label: "gold", recommended_pct_of_total: 0 })).toBe("Gold");
    expect(shortLabel({ id: "x", class: "equity", label: "multi-asset funds", recommended_pct_of_total: 0 }))
      .toBe("Multi-asset funds");
  });
});

describe("maxMultiAsset", () => {
  it("is bounded by the scarcest class the sleeve draws on", () => {
    // debt is scarcest: 25 / 0.25 = 100, others 10 / 0.1 = 100, equity 65 / 0.65 = 100
    expect(maxMultiAsset({ equity: 65, debt: 25, others: 10 })).toBe(100);
    // commodity at 5 caps the sleeve at 50
    expect(maxMultiAsset({ equity: 70, debt: 25, others: 5 })).toBe(50);
  });

  it("never publishes a cap that overdraws a class once rounded", () => {
    for (const others of [1, 3, 7, 9, 13]) {
      const m = { equity: 100 - others - 20, debt: 20, others };
      const cap = maxMultiAsset(m);
      const at = { [MULTI_ASSET_ID]: cap };
      for (const c of CLASSES) expect(classBudget(m, at, c)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("normalise", () => {
  it("rescales a class's rows to sum EXACTLY to its budget", () => {
    const out = normalise(BAR, { a: 30, b: 20, c: 10 }, EQ_ROWS);
    expect(classAllocated(out, EQ_ROWS, "equity")).toBe(classBudget(BAR, out, "equity"));
  });

  it("keeps the proportions the customer set", () => {
    // 30:20:10 of a 60 budget -> 30:20:10
    const out = normalise({ equity: 60, debt: 30, others: 10 }, { a: 15, b: 10, c: 5 }, EQ_ROWS);
    expect(out).toMatchObject({ a: 30, b: 20, c: 10 });
  });

  it("clamps multi-asset to what the bar can fund", () => {
    const cats = [...EQ_ROWS, { id: MULTI_ASSET_ID, class: "equity" as const, label: "MA", recommended_pct_of_total: 0 }];
    const out = normalise({ equity: 70, debt: 25, others: 5 }, { [MULTI_ASSET_ID]: 90, a: 10, b: 10, c: 10 }, cats);
    expect(out[MULTI_ASSET_ID]).toBe(50);
  });

  it("lands every class on its budget for any bar", () => {
    for (const eq of [0, 7, 33, 61, 88, 100]) {
      const m = roundMix({ equity: eq, debt: (100 - eq) * 0.6, others: 0 });
      const out = normalise(m, recommendedValues(CATS), CATS);
      for (const c of CLASSES) {
        const rows = CATS.filter((x) => x.id !== MULTI_ASSET_ID && x.class === c);
        if (!rows.length) continue;
        expect(classAllocated(out, CATS, c)).toBe(classBudget(m, out, c));
      }
    }
  });

  it("gives an all-zero class its budget rather than leaving it stranded", () => {
    const out = normalise({ equity: 60, debt: 30, others: 10 }, { a: 0, b: 0, c: 0 }, EQ_ROWS);
    expect(classAllocated(out, EQ_ROWS, "equity")).toBe(60);
  });
});

describe("applySegmentDrag", () => {
  const values: RowValues = { a: 30, b: 20, c: 10 };

  it("trades the two rows the divider sits between, leaving the rest alone", () => {
    // budget 60, divider 1 sits at 30; drag to 40% of the bar = 24
    const out = applySegmentDrag(EQ_ROWS, values, 60, 1, 40);
    expect(out).toMatchObject({ a: 24, b: 26, c: 10 });
  });

  it("cannot cross the divider on either side", () => {
    expect(applySegmentDrag(EQ_ROWS, values, 60, 1, 100)).toMatchObject({ a: 50, b: 0, c: 10 });
    expect(applySegmentDrag(EQ_ROWS, values, 60, 2, 0)).toMatchObject({ a: 30, b: 0, c: 30 });
  });

  it("keeps the class on its budget whatever the drag", () => {
    for (const pos of [-20, 0, 12.3, 55, 99.9, 140]) {
      for (const h of [1, 2]) {
        const out = applySegmentDrag(EQ_ROWS, values, 60, h, pos);
        expect(classAllocated(out, EQ_ROWS, "equity")).toBe(60);
      }
    }
  });

  it("lets a collapsed row grow back from either side", () => {
    const collapsed: RowValues = { a: 30, b: 0, c: 30 };
    expect(applySegmentDrag(EQ_ROWS, collapsed, 60, 1, 40).b).toBe(6); // left divider moves left
    expect(applySegmentDrag(EQ_ROWS, collapsed, 60, 2, 60).b).toBe(6); // right divider moves right
  });
});

describe("applyTypedEntry", () => {
  const values: RowValues = { a: 30, b: 20, c: 10 };

  it("shrinks the siblings in proportion, not equally", () => {
    // b:20 and c:10 share the remaining 36 in a 2:1 ratio
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", 24)).toEqual({ a: 24, b: 24, c: 12 });
  });

  it("clamps above the budget and empties the siblings", () => {
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", 95)).toEqual({ a: 60, b: 0, c: 0 });
  });

  it("clamps a negative to zero", () => {
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", -5)["a"]).toBe(0);
  });

  // The whole point of D3: the class total is untouched, so the bar above it
  // cannot move no matter what is typed. This guard uses a 3-row class; see the
  // property test below for a sweep of row counts (including 5-6 rows where
  // rounding errors are most pronounced).
  it("leaves the class total exactly on budget in every case (3-row class)", () => {
    for (const typed of [0, 7.3, 24, 59.9, 60, 120, -3]) {
      const next = applyTypedEntry(EQ_ROWS, values, 60, "a", typed);
      expect(classAllocated(next, EQ_ROWS, "equity")).toBe(60);
    }
  });

  // Property test: walk row counts 2-7, budgets [10, 25, 60, 33.3, 7.7], three
  // starting shapes (even / skewed / one-hot), and every typed value on the
  // tenth grid. This guards against rounding errors in `spread` being lost when
  // residuals are negative and larger than one row can absorb — the empirical
  // finding was 24+ violations across this sweep before the fix.
  it("sum is always exactly budget for any row count and starting shape (property sweep)", () => {
    const rowCounts = [2, 3, 5, 6, 7];
    const budgets = [10, 25, 60, 33.3, 7.7];

    for (const n of rowCounts) {
      const rows: ScreenSubcategory[] = Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        class: "equity" as const,
        label: `R${i}`,
        recommended_pct_of_total: 0,
      }));

      for (const budget of budgets) {
        // Three starting shapes: all equal, skewed, and one-hot
        const shapes: RowValues[] = [
          // Even distribution
          Object.fromEntries(rows.map((r) => [r.id, budget / n])),
          // Skewed: first row gets 60%, rest split the rest
          Object.fromEntries(
            rows.map((r, i) => [
              r.id,
              i === 0 ? (budget * 0.6) : ((budget * 0.4) / (n - 1)),
            ]),
          ),
          // One-hot: all on first row
          Object.fromEntries(
            rows.map((r, i) => [r.id, i === 0 ? budget : 0]),
          ),
        ];

        for (const shape of shapes) {
          // Every typed value on the tenth grid (0.0, 0.1, 0.2, ..., budget, ..., budget + 0.5)
          for (let tenths = 0; tenths <= (budget + 0.5) * 10; tenths += 1) {
            const typed = round1(tenths / 10);
            const next = applyTypedEntry(rows, shape, budget, "r0", typed);
            const allocated = classAllocated(next, rows, "equity");
            expect(allocated).toBe(round1(budget));
          }
        }
      }
    }
  });

  it("parks the remainder on the first sibling when every sibling is at zero", () => {
    expect(applyTypedEntry(EQ_ROWS, { a: 60, b: 0, c: 0 }, 60, "a", 10)).toEqual({
      a: 10, b: 50, c: 0,
    });
  });

  it("puts a typed figure on the one-decimal grid", () => {
    expect(applyTypedEntry(EQ_ROWS, values, 60, "a", 24.06)["a"]).toBe(24.1);
  });

  // `normalise` floors a budget at 0 and this must too, or a class whose
  // multi-asset draw exceeds its bar emits negative rows.
  it("floors the budget at zero rather than dividing by it or going negative", () => {
    for (const budget of [0, -3]) {
      const next = applyTypedEntry(EQ_ROWS, { a: 5, b: 5, c: 5 }, budget, "a", 10);
      expect(Object.values(next)).toEqual([0, 0, 0]);
    }
  });

  it("leaves rows outside the class alone", () => {
    const next = applyTypedEntry(EQ_ROWS, { ...values, gold_commodities: 40 }, 60, "a", 24);
    expect(next.gold_commodities).toBe(40);
  });
});

// ── Bar layout ────────────────────────────────────────────
// A 0% row would otherwise render zero pixels wide, stacking its two dividers
// on one another and — at either end of the class — on the bar's own edge,
// where they read as end caps rather than controls.

describe("segmentLayout", () => {
  const widths = (v: RowValues, budget: number) => segmentLayout(EQ_ROWS, v, budget);

  it("always fills the bar exactly", () => {
    for (const v of [{ a: 30, b: 20, c: 10 }, { a: 60, b: 0, c: 0 }, { a: 0, b: 0, c: 60 }]) {
      expect(round1(widths(v, 60).reduce((s, x) => s + x, 0))).toBe(100);
    }
  });

  it("gives a collapsed row a visible sliver instead of nothing", () => {
    const [a, b, c] = widths({ a: 30, b: 0, c: 30 }, 60);
    expect(b).toBeGreaterThan(1);
    expect(a).toBe(c);
  });

  it("takes the sliver from the rows that can afford it, leaving them near-true", () => {
    const [a, b] = widths({ a: 30, b: 0, c: 30 }, 60);
    // true share is 50%; it gives up only the 1.5% the collapsed row needs
    expect(a).toBeCloseTo(50 * (100 - 1.5) / 100, 4);
    expect(b).toBe(1.5);
  });

  it("shrinks the floor rather than distorting a long class list", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`, class: "equity" as const, label: `R${i}`, recommended_pct_of_total: 0,
    }));
    const out = segmentLayout(many, { r0: 60 }, 60);
    expect(round1(out.reduce((s, x) => s + x, 0))).toBe(100);
    expect(out[1]).toBe(1);            // 12 / 12 rows, not the 1.5 default
  });

  it("draws nothing at all when the bar funds the class with nothing", () => {
    // Equal slivers would read as an even split; the truth is "nothing here".
    expect(segmentLayout(EQ_ROWS, { a: 0, b: 0, c: 0 }, 0)).toEqual([0, 0, 0]);
  });
});

describe("barPosToValue", () => {
  const values: RowValues = { a: 30, b: 0, c: 30 };

  it("maps a segment boundary back to that row's exact cumulative value", () => {
    const w = segmentLayout(EQ_ROWS, values, 60);
    expect(barPosToValue(EQ_ROWS, values, 60, w[0])).toBe(30);
    expect(barPosToValue(EQ_ROWS, values, 60, w[0] + w[1])).toBe(30);
  });

  it("never runs off either end of the bar", () => {
    expect(barPosToValue(EQ_ROWS, values, 60, -50)).toBe(0);
    expect(barPosToValue(EQ_ROWS, values, 60, 150)).toBe(60);
  });

  it("rises with the pointer, so a drag never jumps backwards", () => {
    let prev = -1;
    for (let p = 0; p <= 100; p += 2.5) {
      const v = barPosToValue(EQ_ROWS, values, 60, p);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("lookThroughMix", () => {
  // The recommendation's own look-through is already covered by the existing
  // recommendedMix block; what the extraction buys is a bar from ANY rows.
  it("derives a bar from rows that are nothing like the recommendation", () => {
    expect(lookThroughMix({ low_beta_equities: 70, short_debt: 30 }, CATS)).toEqual({
      equity: 70, debt: 30, others: 0,
    });
  });
});

describe("fromCurrentHoldings", () => {
  // Today is a complete fact, not a partial one: a category the customer holds
  // nothing of is a real zero, which is what separates this from fromSavedPins.
  // The frozen subgroup is the case D6 turns on — it has no row here at all.
  //
  // The payload here sums to 100 across the settable ids — spec §3.1's actual
  // contract — so this test is free to check what it always meant to check
  // (every catalog id present, an untouched one reading 0, the frozen id
  // dropped) without also tripping the normalise-to-100 step below.
  it("covers every catalog row and nothing else", () => {
    const v = fromCurrentHoldings(
      [
        { subgroup: "short_debt", pct_of_total: 40 },
        { subgroup: "low_beta_equities", pct_of_total: 60 },
        { subgroup: "tax_efficient_equities", pct_of_total: 15 },
      ],
      CATS,
    );
    expect(Object.keys(v).sort()).toEqual(CATS.map((c) => c.id).sort());
    expect(v.short_debt).toBe(40);
    expect(v.gold_commodities).toBe(0);
    expect(Object.keys(v)).not.toContain("tax_efficient_equities");
  });

  // Same reason the payload above sums to 100: this checks rounding to a
  // tenth, not the normalise step, so the second entry takes the remainder
  // rather than leaving the set short.
  it("puts every figure on the one-decimal grid", () => {
    const v = fromCurrentHoldings(
      [
        { subgroup: "short_debt", pct_of_total: 21.63 },
        { subgroup: "low_beta_equities", pct_of_total: 78.37 },
      ],
      CATS,
    );
    expect(v.short_debt).toBe(21.6);
  });

  // The set can be short of or over 100 in two ways: eleven independent
  // roundings each nudging by a few hundredths, or a backend that (contrary
  // to spec §3.1) simply forgot to rescale before sending. Either way,
  // lookThroughMix draws the shortfall on the today bar as Commodity, since
  // that is the class it derives as `100 - equity - debt` — so the sum must
  // land on exactly 100 regardless of which way the input drifted.
  it("rounds badly but still sums to exactly 100, leaving an untouched row at 0", () => {
    const v = fromCurrentHoldings(
      [
        { subgroup: "low_beta_equities", pct_of_total: 33.33 },
        { subgroup: "short_debt", pct_of_total: 33.33 },
        { subgroup: "arbitrage", pct_of_total: 33.34 },
      ],
      CATS,
    );
    expect(round1(Object.values(v).reduce((s, x) => s + (x ?? 0), 0))).toBe(100);
    expect(v.gold_commodities).toBe(0); // holds none of it — stays 0, not scaled up
  });

  it("rescales a backend payload that forgot to sum to 100", () => {
    const v = fromCurrentHoldings(
      [
        { subgroup: "low_beta_equities", pct_of_total: 50 },
        { subgroup: "short_debt", pct_of_total: 31.6 },
      ],
      CATS,
    );
    expect(round1(Object.values(v).reduce((s, x) => s + (x ?? 0), 0))).toBe(100);
  });

  // An all-zero payload is a customer holding nothing, not a set `spread`
  // should treat as "nothing to preserve, so give it all to the first row" —
  // that reading exists for the interactive rows, where an empty class must
  // still be reachable, and is exactly wrong for a factual reading of today.
  it("leaves an all-zero payload all zero rather than parking 100 on the first row", () => {
    const v = fromCurrentHoldings(
      [
        { subgroup: "short_debt", pct_of_total: 0 },
        { subgroup: "low_beta_equities", pct_of_total: 0 },
      ],
      CATS,
    );
    for (const c of CATS) expect(v[c.id]).toBe(0);
  });
});
