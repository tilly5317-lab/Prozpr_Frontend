import { describe, it, expect } from "vitest";

import type { ScreenSubcategory } from "@/lib/api";
import {
  applyDividerDrag,
  classRoom,
  pinsValid,
  roundMix,
  sameMix,
  samePins,
} from "@/lib/investment-preferences";

const mix = { equity: 72, debt: 18, others: 10 };

const subById: Record<string, ScreenSubcategory> = {
  low_beta_equities: {
    id: "low_beta_equities",
    class: "equity",
    label: "Large-cap",
    recommended_pct_of_total: 15,
  },
};

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

describe("roundMix", () => {
  it("rounds the engine's float recommendation to whole percents", () => {
    expect(roundMix({ equity: 72.02, debt: 21.36, others: 6.61 })).toEqual({
      equity: 72,
      debt: 21,
      others: 7,
    });
  });

  it("absorbs the rounding residual so it always sums to 100", () => {
    const m = roundMix({ equity: 72.4, debt: 21.3, others: 6.3 }); // naive rounding → 99
    expect(m.equity + m.debt + m.others).toBe(100);
    expect(m).toEqual({ equity: 72, debt: 21, others: 7 });
  });

  it("leaves an already-whole mix unchanged", () => {
    expect(roundMix(mix)).toEqual(mix);
  });
});

describe("classRoom", () => {
  it("is the class share minus what's pinned in that class", () => {
    const pins = [{ subgroup: "low_beta_equities", pct_of_total: 25 }];
    expect(classRoom(mix, pins, subById, "equity")).toBe(47);
  });
});

describe("pinsValid", () => {
  it("rejects a pin larger than its class room", () => {
    const pins = [{ subgroup: "low_beta_equities", pct_of_total: 80 }]; // > 72 equity
    expect(pinsValid(mix, pins, subById)).toBe(false);
  });

  it("accepts pins within their class", () => {
    const pins = [{ subgroup: "low_beta_equities", pct_of_total: 25 }];
    expect(pinsValid(mix, pins, subById)).toBe(true);
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
