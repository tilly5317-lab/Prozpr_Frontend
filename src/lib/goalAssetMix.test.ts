import { describe, it, expect, beforeEach } from "vitest";
import {
  blendedRate,
  clampClassReturn,
  clampEquityPct,
  DEBT_RETURN,
  DEFAULT_ASSET_MIX,
  mixForRate,
  readSavedMix,
  writeSavedMix,
  type AssetMix,
} from "./goalAssetMix";
import { PROJECTION_BASE_RATE, RETURN_MAX } from "./projectionScenario";

const mix = (over: Partial<AssetMix> = {}): AssetMix => ({ ...DEFAULT_ASSET_MIX, ...over });

describe("clamps", () => {
  it("holds the equity share inside 0-100 and on whole points", () => {
    expect(clampEquityPct(-10)).toBe(0);
    expect(clampEquityPct(140)).toBe(100);
    expect(clampEquityPct(24.6)).toBe(25);
  });

  it("falls back to the default split on junk", () => {
    expect(clampEquityPct(Number.NaN)).toBe(DEFAULT_ASSET_MIX.equityPct);
  });

  it("holds a class return inside 0-30", () => {
    expect(clampClassReturn(-3)).toBe(0);
    expect(clampClassReturn(45)).toBe(30);
    expect(clampClassReturn(12)).toBe(12);
  });
});

describe("blendedRate", () => {
  it("weights each class by its share", () => {
    // 25% at 20% + 75% at 5% = 8.75, shown and applied as 8.8.
    expect(blendedRate(mix())).toBe(8.8);
  });

  it("is the class return itself at the extremes", () => {
    expect(blendedRate(mix({ equityPct: 100, equityReturn: 12 }))).toBe(12);
    // All debt earns the fixed debt assumption, whatever equity was set to.
    expect(blendedRate(mix({ equityPct: 0, equityReturn: 25 }))).toBe(DEBT_RETURN);
  });

  it("holds an all-equity mix to the projection's own ceiling", () => {
    // 30% equity is a legal assumption; the projection only runs to 20%.
    expect(blendedRate(mix({ equityPct: 100, equityReturn: 30 }))).toBe(RETURN_MAX);
  });

  it("keeps the blend finer than the slider's half-point steps", () => {
    // 35% at 20% + 65% at 5% = 10.25 — one decimal, not a half point.
    expect(blendedRate(mix({ equityPct: 35, equityReturn: 20 }))).toBe(10.3);
  });

  it("sheds the float noise a weighted average leaves behind", () => {
    expect(blendedRate(mix({ equityPct: 70, equityReturn: 11 }))).toBe(9.2);
  });
});

describe("mixForRate", () => {
  it("reseats equity so the blend reproduces the rate", () => {
    // 9% at a 25/75 split with debt at 5% needs 21% equity.
    const next = mixForRate(mix(), PROJECTION_BASE_RATE);
    expect(next.equityReturn).toBe(21);
    expect(blendedRate(next)).toBe(PROJECTION_BASE_RATE);
  });

  it("leaves the split alone", () => {
    const next = mixForRate(mix({ equityPct: 60 }), 12);
    expect(next.equityPct).toBe(60);
  });

  it("hands the mix back untouched when there is no equity to absorb it", () => {
    // An all-debt portfolio earns the debt assumption; there is no lever here.
    const all_debt = mix({ equityPct: 0 });
    expect(mixForRate(all_debt, 7)).toBe(all_debt);
  });

  it("returns the same object when nothing moved, so callers can compare by identity", () => {
    const seated = mix({ equityPct: 25, equityReturn: 21 });
    expect(mixForRate(seated, 9)).toBe(seated);
  });
});

describe("persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns the default split when nothing is stored", () => {
    expect(readSavedMix()).toEqual(DEFAULT_ASSET_MIX);
  });

  it("round-trips a mix", () => {
    const saved = mix({ equityPct: 60, equityReturn: 14 });
    writeSavedMix(saved);
    expect(readSavedMix()).toEqual(saved);
  });

  it("ignores a debtReturn left over from before debt was fixed", () => {
    window.localStorage.setItem(
      "goals-asset-mix",
      JSON.stringify({ equityPct: 40, equityReturn: 15, debtReturn: 9 }),
    );
    expect(readSavedMix()).toEqual({ equityPct: 40, equityReturn: 15 });
  });

  it("clamps stored values rather than trusting them", () => {
    window.localStorage.setItem(
      "goals-asset-mix",
      JSON.stringify({ equityPct: 400, equityReturn: 99 }),
    );
    expect(readSavedMix()).toEqual({ equityPct: 100, equityReturn: 30 });
  });

  it("falls back to the default on junk", () => {
    window.localStorage.setItem("goals-asset-mix", "not json");
    expect(readSavedMix()).toEqual(DEFAULT_ASSET_MIX);
  });
});
