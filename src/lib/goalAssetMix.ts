import { clampRate } from "./projectionScenario";

/**
 * The asset mix behind the goals projection's return.
 *
 * The cashflow engine has no notion of asset classes — it projects on a single
 * post-tax return (see projectionScenario). This module is the user-facing way
 * to *reach* that number: an equity/debt split and a return assumption for each
 * class blend into the one rate the projection actually runs on.
 *
 * It is a client-side lens, stored per browser exactly like the applied rate.
 * Nothing here is sent to the engine — `blendedRate` is fed into the existing
 * applied-rate path, so the chart reacts the same way it always has.
 */

export interface AssetMix {
  /** Equity share of the portfolio, 0-100. Debt is the remainder. */
  equityPct: number;
  /** Assumed annual equity return, %. */
  equityReturn: number;
}

/**
 * Debt is a fixed assumption, not a lever.
 *
 * Its whole range is narrow enough that letting someone tune it adds a decision
 * without adding much projection — the split and the equity call are what move
 * the number. Stated in the editor so it is an assumption on show, not a hidden
 * constant.
 */
export const DEBT_RETURN = 5;

export const DEFAULT_ASSET_MIX: AssetMix = {
  equityPct: 25,
  equityReturn: 20,
};

/** Coarse enough to drag on a phone, fine enough to matter over 20 years. */
export const EQUITY_STEP = 5;

export const RETURN_INPUT_MIN = 0;
export const RETURN_INPUT_MAX = 30;
export const RETURN_INPUT_STEP = 1;

export function clampEquityPct(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_ASSET_MIX.equityPct;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export function clampClassReturn(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.min(RETURN_INPUT_MAX, Math.max(RETURN_INPUT_MIN, Math.round(rate)));
}

export interface EquityBand {
  label: string;
  /** Inclusive lower bound. */
  from: number;
  /** Exclusive upper bound — except the top band, which has no ceiling. */
  to: number;
  /** Which end of the range it sits at, for the caller to colour by. */
  tone: "low" | "base" | "high";
}

/**
 * What an equity return assumption reads as.
 *
 * Same vocabulary as the projection panel's RETURN_BANDS so the page speaks one
 * language, but the thresholds are its own: those bands describe a blended
 * post-tax portfolio return on a 0-20 scale, and reading them off an equity
 * assumption would call 8% equity "Base" when it is a downbeat call.
 */
export const EQUITY_BANDS: EquityBand[] = [
  { label: "Conservative", from: 0, to: 10, tone: "low" },
  { label: "Base", from: 10, to: 14, tone: "base" },
  { label: "Optimistic", from: 14, to: Number.POSITIVE_INFINITY, tone: "high" },
];

/** The band a return falls in. A boundary belongs to the higher band. */
export function equityBand(rate: number): EquityBand {
  const r = clampClassReturn(rate);
  for (const band of EQUITY_BANDS) {
    if (r >= band.from && r < band.to) return band;
  }
  return EQUITY_BANDS[EQUITY_BANDS.length - 1];
}

/**
 * The single post-tax return the projection runs on.
 *
 * Weighted by the split, then held to the projection's own 0-20% range — a
 * 100%-equity-at-30% mix lands on the ceiling rather than off the scale.
 */
export function blendedRate(mix: AssetMix): number {
  const equity = clampEquityPct(mix.equityPct) / 100;
  const blended = equity * clampClassReturn(mix.equityReturn) + (1 - equity) * DEBT_RETURN;
  // One decimal — the number that is shown IS the number the projection runs
  // on, so a displayed 8.8% is never a rounded view of some longer 8.75%.
  return clampRate(Math.round(blended * 10) / 10);
}

/**
 * Re-seat a mix on a rate that was applied from somewhere else (the projection
 * panel's sensitivity slider), so the stat never contradicts the chart.
 *
 * The split is the user's stated position and debt is fixed, so the equity call
 * absorbs the change. An all-debt portfolio earns the debt assumption and
 * nothing else — there is no equity call to move, so the mix comes back
 * unchanged and the caller is left to settle which side wins.
 */
export function mixForRate(mix: AssetMix, rate: number): AssetMix {
  const equity = clampEquityPct(mix.equityPct) / 100;
  if (equity === 0) return mix;
  const equityReturn = clampClassReturn((rate - (1 - equity) * DEBT_RETURN) / equity);
  // Same object when nothing moved, so callers can compare by identity.
  return equityReturn === mix.equityReturn ? mix : { ...mix, equityReturn };
}

const SAVED_MIX_KEY = "goals-asset-mix";

/** The mix from a previous visit; the default split if none or if junk. */
export function readSavedMix(): AssetMix {
  if (typeof window === "undefined") return DEFAULT_ASSET_MIX;
  try {
    const stored = window.localStorage.getItem(SAVED_MIX_KEY);
    if (stored === null) return DEFAULT_ASSET_MIX;
    const parsed = JSON.parse(stored) as Partial<AssetMix> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_ASSET_MIX;
    // A `debtReturn` from before debt became a fixed assumption is ignored.
    return {
      equityPct: clampEquityPct(parsed.equityPct ?? DEFAULT_ASSET_MIX.equityPct),
      equityReturn: clampClassReturn(parsed.equityReturn ?? DEFAULT_ASSET_MIX.equityReturn),
    };
  } catch {
    return DEFAULT_ASSET_MIX;
  }
}

export function writeSavedMix(mix: AssetMix): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_MIX_KEY, JSON.stringify(mix));
  } catch {
    /* private mode / quota — the choice just won't survive the reload */
  }
}
