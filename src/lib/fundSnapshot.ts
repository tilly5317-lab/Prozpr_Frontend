/**
 * The Snapshot rows on the fund analysis screen: the handful of figures that
 * decide most of the verdict, each against its category.
 *
 * Sources are mixed and marked per row below. Returns, the expense ratio, the
 * SEBI risk label and the exit load are REAL. AUM, every category range, and
 * the SIP / lumpsum minimums are GENERATED — see `lib/fundCategory.ts`.
 */

import type { FundNavPoint } from "@/components/fund/FundScreenUi";
import {
  type CategoryProfile,
  type FundProfile,
  type ReturnRange,
  cumulativeSeries,
} from "@/lib/fundCategory";

/** SEBI's six-step riskometer, lowest first. */
export const RISK_LEVELS = [
  "Low",
  "Low to Moderate",
  "Moderate",
  "Moderately High",
  "High",
  "Very High",
] as const;

/** Green through to red, dark-mode safe. */
export const RISK_COLORS = [
  "hsl(151 48% 42%)",
  "hsl(120 42% 46%)",
  "hsl(52 78% 46%)",
  "hsl(33 84% 52%)",
  "hsl(18 78% 52%)",
  "hsl(4 70% 50%)",
] as const;

/** Map the metadata's free-text risk label onto a riskometer step. */
export function riskLevelIndex(label: string | null): number | null {
  if (!label) return null;
  const v = label.trim().toLowerCase().replace(/\s+/g, " ");
  // Longest-first, so "moderately high" isn't caught by "moderate".
  if (v.includes("very high")) return 5;
  if (v.includes("moderately high")) return 3;
  if (v.includes("low to moderate")) return 1;
  if (v.includes("high")) return 4;
  if (v.includes("moderate")) return 2;
  if (v.includes("low")) return 0;
  return null;
}

/** A metric plotted against its category on a track. */
export interface TrackRow {
  kind: "track";
  label: string;
  /** Glossary key for the (i) beside the label. */
  term?: string;
  value: number;
  display: string;
  lo: number;
  hi: number;
  catValue: number;
  catDisplay: string;
  loDisplay: string;
  hiDisplay: string;
  higherBetter: boolean;
}

/** The SEBI riskometer strip. */
export interface RiskRow {
  kind: "risk";
  label: string;
  term?: string;
  level: number;
  levelLabel: string;
}

/** A plain fact — value right-aligned, or on its own line when long. */
export interface FactRow {
  kind: "fact";
  label: string;
  value: string;
  term?: string;
  /** Renders a small dot: green for an affirmative, muted otherwise. */
  tone?: "yes" | "no";
  /** True when the value is a sentence and needs its own line. */
  block?: boolean;
}

export type SnapshotRow = TrackRow | RiskRow | FactRow;

/** Industry-standard minimums. NOT from the API — no field carries them. */
const MIN_SIP = 500;
const MIN_LUMPSUM = 5_000;

export interface SnapshotInput {
  fund: FundProfile;
  cat: CategoryProfile;
  history: FundNavPoint[];
  seed: string;
  /** REAL — from scheme metadata. */
  expenseRatio: number | null;
  riskLabel: string | null;
  exitLoadPct: number | null;
  exitLoadMonths: number | null;
  /** Used to derive the statutory lock-in. */
  categoryName: string;
}

export function snapshotRows({
  fund,
  cat,
  history,
  seed,
  expenseRatio,
  riskLabel,
  exitLoadPct,
  exitLoadMonths,
  categoryName,
}: SnapshotInput): SnapshotRow[] {
  const out: SnapshotRow[] = [];
  const crore = (n: number) => `₹${(n / 1000).toFixed(1)}k Cr`;

  // AUM — GENERATED, both the fund's and the category's.
  const aumNum = Number(fund.aum.replace(/[^\d]/g, ""));
  const catAum = Number(cat.aum.replace(/[^\d]/g, ""));
  if (aumNum > 0) {
    out.push({
      kind: "track",
      label: "AUM",
      term: "aum",
      value: aumNum,
      display: `₹${aumNum.toLocaleString("en-IN")} Cr`,
      lo: 400,
      hi: Math.max(aumNum, catAum) * 2.4,
      catValue: catAum,
      catDisplay: crore(catAum),
      loDisplay: "₹0.4k Cr",
      hiDisplay: crore(Math.max(aumNum, catAum) * 2.4),
      higherBetter: true,
    });
  }

  // Trailing returns — REAL, from the NAV series.
  const trailing: [string, ReturnRange][] = [
    ["1Y returns", "1Y"],
    ["3Y returns", "3Y"],
  ];
  for (const [label, range] of trailing) {
    const s = cumulativeSeries(history, range, seed);
    if (s.length < 2) continue;
    const v = s[s.length - 1].fund;
    const c = s[s.length - 1].category;
    const lo = Math.min(v, c) - Math.abs(v - c) * 2 - 4;
    const hi = Math.max(v, c) + Math.abs(v - c) * 2 + 4;
    out.push({
      kind: "track",
      label,
      term: "cagr",
      value: v,
      display: `${v.toFixed(1)}%`,
      lo,
      hi,
      catValue: c,
      catDisplay: `${c.toFixed(1)}%`,
      loDisplay: `${lo.toFixed(0)}%`,
      hiDisplay: `${hi.toFixed(0)}%`,
      higherBetter: true,
    });
  }

  // Riskometer — REAL, the SEBI label off the scheme record.
  const level = riskLevelIndex(riskLabel);
  if (level != null) {
    out.push({
      kind: "risk",
      label: "Indian risk level (Riskometer)",
      term: "riskometer",
      level,
      levelLabel: RISK_LEVELS[level],
    });
  }

  // Net expense ratio — REAL.
  if (expenseRatio != null) {
    out.push({
      kind: "track",
      label: "Net expense ratio",
      term: "expense",
      value: expenseRatio,
      display: `${expenseRatio.toFixed(2)}%`,
      lo: 0.35,
      hi: 1.25,
      catValue: cat.expense,
      catDisplay: `${cat.expense.toFixed(2)}%`,
      loDisplay: "0.35%",
      hiDisplay: "1.25%",
      higherBetter: false,
    });
  }

  // Lock-in — derived from the category. ELSS carries a statutory three years;
  // nothing else in the mutual-fund universe locks money up by law.
  const isElss = /elss|tax\s*saver/i.test(`${categoryName} ${cat.name}`);
  out.push({
    kind: "fact",
    label: "Fund lock-in period",
    term: "lockin",
    value: isElss ? "3 years (statutory)" : "None",
  });

  // Exit load — REAL. The sentence gets its own line; the window is repeated as
  // a number, because "365 days" is what a reader actually needs to act on.
  if (exitLoadPct != null && exitLoadPct > 0) {
    const days = exitLoadMonths != null ? Math.round(exitLoadMonths * 30.44) : null;
    out.push({
      kind: "fact",
      label: "Exit load",
      term: "exitload",
      value: `${exitLoadPct}% if redeemed within ${
        days != null ? `${days} days` : `${exitLoadMonths ?? "?"} months`
      } of allotment`,
      block: true,
    });
    if (days != null) {
      out.push({
        kind: "fact",
        label: "Exit load — minimum holding period",
        term: "exitload",
        value: `${days} days`,
      });
    }
  } else if (exitLoadPct != null) {
    out.push({ kind: "fact", label: "Exit load", value: "Nil" });
  }

  // SIP / lumpsum — GENERATED. No API field carries availability or minimums,
  // so these are the industry-standard entry points, not this scheme's.
  out.push({
    kind: "fact",
    label: "SIP available?",
    term: "sip",
    value: `Yes · from ₹${MIN_SIP.toLocaleString("en-IN")} a month`,
    tone: "yes",
  });
  out.push({
    kind: "fact",
    label: "Lumpsum available?",
    term: "lumpsum",
    value: `Yes · from ₹${MIN_LUMPSUM.toLocaleString("en-IN")}`,
    tone: "yes",
  });

  return out;
}
