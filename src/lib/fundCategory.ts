/**
 * Category-relative view of a single fund, for the analysis sections on the
 * fund detail screen.
 *
 * ⚠️ MUCH OF WHAT THIS MODULE RETURNS IS NOT REAL. ⚠️
 *
 * Prozpr's API has no peer aggregates, no holdings breakdown and no per-fund
 * benchmark, so percentiles, quartiles, ranks, category ranges, sector weights,
 * credit quality, P/E, P/B, P/S, dividend yield, alpha, information ratio,
 * tracking error, AUM, fund age and manager tenure are all GENERATED from a
 * hash of the scheme code. Real values are used wherever they exist — see
 * `REAL` markers on each field below.
 *
 * The generated figures are deliberately coherent: one `quality` seed per fund
 * drives percentile, rank, quartiles and ratios together, so a fund that reads
 * well in one section reads well in the others. That makes them look plausible;
 * it does not make them true. Wire the real sources in before this ships.
 */

import type { FundNavPoint } from "@/components/fund/FundScreenUi";
import {
  calendarYearReturns,
  computeFundRiskMetrics,
  rollingReturnsByYear,
} from "@/lib/fundMetrics";

/* ── Traffic light ─────────────────────────────────────────────────────────
   One four-step scale, used identically everywhere on the screen. Colours are
   HSL so they hold up in dark mode; tinted chips (colour at low alpha, colour
   as ink) rather than solid fills, matching the rest of the app. */

export const TONE_LABEL = ["Top 25%", "Above average", "Below average", "Bottom 25%"] as const;

/* Hex, not hsl(), because callers build tinted chips by appending a hex alpha
   (`${c}26`) — that concatenation silently produces invalid CSS against an
   hsl() string, and the tint just vanishes.

   The two favourable steps are separated by HUE, not lightness: a deep green
   and a teal. Two greens a shade apart were indistinguishable at chip size, and
   in the most common colour-blindness the warm/cool split still reads even when
   green and amber do not. */
export const TONE_COLOR = [
  "#12805A", // top quarter — deep green
  "#2AA79B", // above average — teal
  "#E0930F", // below average — amber
  "#D8412F", // bottom quarter — red
] as const;

/** Percentile → 0..3 band. Lower percentile is better throughout. */
export const band = (p: number): 0 | 1 | 2 | 3 =>
  p <= 25 ? 0 : p <= 50 ? 1 : p <= 75 ? 2 : 3;

export const toneColor = (p: number): string => TONE_COLOR[band(p)];
export const toneLabel = (p: number): string => TONE_LABEL[band(p)];

/**
 * Percentile of a value against its category, hinged on the category average so
 * the average always lands on the 50th. Lower result = better.
 */
export function pctInRange(
  v: number,
  lo: number,
  hi: number,
  higherBetter: boolean,
  avg?: number,
): number {
  const a = avg == null ? (lo + hi) / 2 : avg;
  const p =
    v >= a
      ? 50 - 50 * Math.min(1, (v - a) / Math.max(1e-6, hi - a))
      : 50 + 50 * Math.min(1, (a - v) / Math.max(1e-6, a - lo));
  return Math.round(higherBetter ? p : 100 - p);
}

/** 1 → "1st", 12 → "12th". */
export function ord(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/* ── Deterministic generation ─────────────────────────────────────────────── */

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Stable value in [lo, hi] for this seed and key. */
function pick(seed: string, key: string, lo: number, hi: number): number {
  return lo + ((hash(`${seed}::${key}`) % 1000) / 999) * (hi - lo);
}

/**
 * One "how good is this fund" number in [0, 1], higher being better.
 *
 * Everything generated keys off this, so the sections agree with each other. A
 * fund shown in the top quartile by percentile also ranks near the top, holds
 * green quarters and posts a positive alpha — incoherent figures across
 * sections read as a broken screen, not a nuanced one.
 */
function qualityOf(seed: string): number {
  return (hash(`${seed}::quality`) % 1000) / 999;
}

/* ── Category profile ─────────────────────────────────────────────────────── */

const SECTORS = [
  "Financial Services",
  "Technology",
  "Consumer Cyclical",
  "Industrials",
  "Healthcare",
  "Basic Materials",
  "Consumer Defensive",
  "Energy",
  "Utilities",
  "Communication Services",
  "Real Estate",
] as const;

export const CREDIT_TIERS = ["AAA", "AA", "A", "Below A / unrated"] as const;

/** [average, min, max] across the category. */
export type Range3 = readonly [number, number, number];

export interface CategoryProfile {
  name: string;
  /** GENERATED — number of competing funds. */
  size: number;
  /** GENERATED — category average expense ratio, %. */
  expense: number;
  /** GENERATED — typical fund size. */
  aum: string;
  /** GENERATED — average manager tenure in the category, years. */
  managerTenureYears: number;
  /** GENERATED — per-metric [avg, min, max]. */
  ratios: Record<string, Range3>;
  /** GENERATED — average company-size mix. */
  mcap: { large: number; mid: number; small: number };
  /** GENERATED — average sector weights. */
  sectors: Record<string, number>;
  /** GENERATED — average credit quality of debt held. */
  debt: Record<string, number>;
}

/** Base ranges by broad asset class, so a debt fund isn't given equity P/Es. */
function ratioBase(isEquity: boolean): Record<string, Range3> {
  return isEquity
    ? {
        pe: [29.2, 19.8, 41.5],
        pb: [4.4, 2.6, 7.1],
        ps: [3.4, 1.8, 5.6],
        dy: [1.05, 0.4, 2.1],
        alpha: [0.9, -4.6, 6.8],
        mdd: [-22.3, -34.2, -14.1],
        mean3: [16.1, 9.4, 23.8],
        sharpe: [0.81, 0.34, 1.32],
        sortino: [1.16, 0.51, 1.94],
        ir: [0.19, -0.86, 1.02],
        te: [5.1, 2.4, 9.3],
      }
    : {
        pe: [18.4, 12.1, 26.2],
        pb: [2.6, 1.4, 4.1],
        ps: [2.1, 1.1, 3.4],
        dy: [1.9, 0.9, 3.2],
        alpha: [0.4, -2.2, 3.1],
        mdd: [-6.4, -12.8, -2.1],
        mean3: [7.4, 4.6, 10.8],
        sharpe: [0.62, 0.18, 1.14],
        sortino: [0.94, 0.31, 1.62],
        ir: [0.12, -0.71, 0.86],
        te: [2.2, 0.8, 4.6],
      };
}

export function categoryProfile(
  categoryName: string,
  assetClass: string | null,
): CategoryProfile {
  const seed = `cat::${categoryName}`;
  const isEquity = (assetClass ?? "Equity").toLowerCase() !== "debt";

  // Sector weights that sum to 100, shaped so the big sectors stay big.
  const raw = SECTORS.map((s, i) => pick(seed, `sec${i}`, 2, 28) * (i < 3 ? 1.5 : 1));
  const total = raw.reduce((a, b) => a + b, 0);
  const sectors: Record<string, number> = {};
  SECTORS.forEach((s, i) => {
    sectors[s] = (raw[i] / total) * 100;
  });

  const large = pick(seed, "mcapL", 35, 72);
  const mid = pick(seed, "mcapM", 14, 30);

  return {
    name: categoryName,
    size: Math.round(pick(seed, "size", 18, 46)),
    expense: pick(seed, "expense", 0.62, 1.05),
    aum: `₹${Math.round(pick(seed, "aum", 4_000, 14_000)).toLocaleString("en-IN")} Cr`,
    managerTenureYears: pick(seed, "pmavg", 3.2, 5.4),
    ratios: ratioBase(isEquity),
    mcap: { large, mid, small: Math.max(2, 100 - large - mid - pick(seed, "cash", 1.4, 4)) },
    sectors,
    debt: {
      AAA: pick(seed, "aaa", 62, 78),
      AA: pick(seed, "aa", 14, 24),
      A: pick(seed, "a", 4, 9),
      "Below A / unrated": pick(seed, "sub", 2, 6),
    },
  };
}

/* ── Cumulative return series ─────────────────────────────────────────────── */

export const RETURN_RANGES = ["1M", "3M", "YTD", "1Y", "3Y", "5Y", "Max"] as const;
export type ReturnRange = (typeof RETURN_RANGES)[number];

const DAY_MS = 86_400_000;

/** Start date for a range, measured back from the series' last observation. */
function rangeStart(range: ReturnRange, end: Date): Date | null {
  const d = new Date(end);
  switch (range) {
    case "1M":
      d.setMonth(d.getMonth() - 1);
      return d;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      return d;
    case "YTD":
      return new Date(end.getFullYear(), 0, 1);
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      return d;
    case "3Y":
      d.setFullYear(d.getFullYear() - 3);
      return d;
    case "5Y":
      d.setFullYear(d.getFullYear() - 5);
      return d;
    default:
      return null;
  }
}

export interface CumulativePoint {
  date: string;
  /** REAL — the fund, cumulative % from the range's first observation. */
  fund: number;
  /** GENERATED — stands in for a broad index fund. */
  index: number;
  /** GENERATED — stands in for the category average. */
  category: number;
}

/**
 * Cumulative percentage growth over `range`, starting at 0%.
 *
 * The fund line is REAL. The index and category lines are GENERATED: Prozpr has
 * no per-fund benchmark series and no peer aggregate, so both are the fund's own
 * path with a deterministic drift and wobble applied. They look like independent
 * series; they are not.
 */
export function cumulativeSeries(
  points: FundNavPoint[],
  range: ReturnRange,
  seed: string,
): CumulativePoint[] {
  const pts = points
    .filter((p) => Number.isFinite(p.nav) && p.nav > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (pts.length < 2) return [];

  const end = new Date(pts[pts.length - 1].date);
  const from = rangeStart(range, end);
  const win = from ? pts.filter((p) => new Date(p.date) >= from) : pts;
  if (win.length < 2) return [];

  // Cap the drawn points so a 20-year daily series doesn't emit 5,000 nodes.
  const step = Math.max(1, Math.floor(win.length / 220));
  const sampled = win.filter((_, i) => i % step === 0 || i === win.length - 1);

  const base = sampled[0].nav;
  const q = qualityOf(seed);
  // A better fund out-runs its peers, so the gap widens with quality.
  const idxDrag = 0.55 + (1 - q) * 0.35;
  const catDrag = 0.42 + (1 - q) * 0.4;
  const span = sampled.length - 1 || 1;

  return sampled.map((p, i) => {
    const fund = (p.nav / base - 1) * 100;
    const t = i / span;
    const wobbleI = Math.sin(t * 9 + hash(`${seed}::idx`) % 7) * 1.1 * t;
    const wobbleC = Math.sin(t * 6.5 + hash(`${seed}::cat`) % 5) * 0.8 * t;
    return {
      date: p.date,
      fund,
      index: fund * idxDrag + wobbleI,
      category: fund * catDrag + wobbleC,
    };
  });
}

/** Trailing return over a range, as a percentage. REAL. */
export function trailingReturnPct(
  points: FundNavPoint[],
  range: ReturnRange,
): number | null {
  const s = cumulativeSeries(points, range, "x");
  return s.length ? s[s.length - 1].fund : null;
}

/* ── Fund profile ─────────────────────────────────────────────────────── */



export const PERIODS = ["YTD", "1Y", "3Y", "5Y", "7Y", "10Y"] as const;
export type Period = (typeof PERIODS)[number];

export interface FundProfile {
  /** REAL — calendar-year returns from the NAV series. */
  yearly: { year: number; pct: number }[];
  /** REAL — rolling 3-year annualised return by year-end. */
  rolling: { year: number; pct: number }[];
  /** GENERATED — category band (worst/best fund) per year of `yearly`. */
  yearBand: Record<number, { lo: number; hi: number; avg: number }>;
  /** GENERATED — percentile per trailing period; null = fund too young. */
  pct: Record<Period, number | null>;
  /** GENERATED — quartile (1..4) per quarter, oldest first. */
  quart: number[];
  /** GENERATED — absolute rank in category per window. */
  rank: Record<"1Y" | "3Y" | "5Y", number>;
  /** Mixed — see `RATIO_SPECS.real` for which are derived from NAV. */
  ratios: Record<string, number>;
  /** REAL where the metadata carries it, else GENERATED. */
  mcap: { large: number; mid: number; small: number };
  /** GENERATED. */
  sectors: Record<string, number>;
  /** GENERATED. */
  debt: Record<string, number>;
  /** Partly REAL — cash from metadata `others_pct`. */
  others: Record<string, number>;
  /** GENERATED. */
  aum: string;
  age: string;
  managerTenure: string;
  strategy: string;
  /** Numeric forms of age and tenure, for plotting against the category. */
  ageYears: number;
  managerTenureYears: number;
}

const STRATEGIES = [
  "Growth at a fair price",
  "Quality-biased growth",
  "Value tilt, buy-and-hold",
  "Multi-cap blend",
  "High-conviction concentrated",
  "Benchmark-aware core",
];

/** Quarter labels, newest last, ending at the most recent complete quarter. */
export function quarterLabels(count: number, asOf = new Date()): string[] {
  const out: string[] = [];
  let y = asOf.getFullYear();
  let q = Math.floor(asOf.getMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    out.unshift(`Q${q} ${y}`);
    q -= 1;
    if (q === 0) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}

export function fundProfile(
  schemeCode: string,
  history: FundNavPoint[],
  cat: CategoryProfile,
  opts: {
    /** From metadata, when present. */
    mcap?: { large: number | null; mid: number | null; small: number | null };
    othersPct?: number | null;
    assetClass?: string | null;
  } = {},
): FundProfile {
  const seed = schemeCode || "fund";
  const q = qualityOf(seed);

  // REAL — straight off the NAV series.
  const yearly = calendarYearReturns(history);
  const rolling = rollingReturnsByYear(history, 3);
  const m3 = computeFundRiskMetrics(history, 3);

  // GENERATED — a category spread around each year's actual fund return, wide
  // enough that the fund sits inside it at a position matching its quality.
  const yearBand: FundProfile["yearBand"] = {};
  for (const { year, pct } of yearly) {
    const spread = Math.max(8, Math.abs(pct) * 0.55 + pick(seed, `sp${year}`, 4, 11));
    // A better fund sits nearer the top of its band.
    const avg = pct - spread * (q - 0.5) * 0.9;
    yearBand[year] = { lo: avg - spread, hi: avg + spread, avg };
  }

  // GENERATED — percentile per period, all keyed off the same quality.
  const basePct = (1 - q) * 100;
  const pctByPeriod = {} as Record<Period, number | null>;
  const spanYears =
    yearly.length > 0 ? yearly[yearly.length - 1].year - yearly[0].year + 1 : 0;
  const needYears: Record<Period, number> = {
    YTD: 0,
    "1Y": 1,
    "3Y": 3,
    "5Y": 5,
    "7Y": 7,
    "10Y": 10,
  };
  for (const p of PERIODS) {
    // A dash where the fund genuinely isn't old enough — that part is real.
    pctByPeriod[p] =
      spanYears < needYears[p]
        ? null
        : Math.max(1, Math.min(99, Math.round(basePct + pick(seed, `pct${p}`, -14, 14))));
  }

  // GENERATED — 20 quarters, biased toward the fund's quality band.
  const quart: number[] = [];
  for (let i = 0; i < 20; i++) {
    const jitter = pick(seed, `q${i}`, -0.22, 0.22);
    const v = Math.max(0, Math.min(0.999, 1 - q + jitter));
    quart.push(Math.floor(v * 4) + 1);
  }

  const rankFor = (p: Period) =>
    Math.max(1, Math.round(((pctByPeriod[p] ?? 50) / 100) * cat.size));

  // Ratios: NAV-derived where possible, generated otherwise.
  const inRange = (r: Range3, better: "high" | "low") => {
    const [avg, lo, hi] = r;
    // Map quality onto the category range, respecting direction.
    const t = better === "high" ? q : 1 - q;
    return t >= 0.5 ? avg + (hi - avg) * (t - 0.5) * 2 : lo + (avg - lo) * t * 2;
  };

  const ratios: Record<string, number> = {
    // GENERATED — need holdings.
    pe: inRange(cat.ratios.pe, "low"),
    pb: inRange(cat.ratios.pb, "low"),
    ps: inRange(cat.ratios.ps, "low"),
    dy: inRange(cat.ratios.dy, "high"),
    // GENERATED — need a benchmark series.
    alpha: inRange(cat.ratios.alpha, "high"),
    ir: inRange(cat.ratios.ir, "high"),
    te: inRange(cat.ratios.te, "low"),
    // REAL — from the NAV series, falling back only if it's too short.
    mdd: m3.maxDrawdown?.pct ?? inRange(cat.ratios.mdd, "high"),
    mean3: m3.annualisedReturnPct ?? inRange(cat.ratios.mean3, "high"),
    sharpe: m3.sharpe ?? inRange(cat.ratios.sharpe, "high"),
    sortino: m3.sortino ?? inRange(cat.ratios.sortino, "high"),
    vol: m3.volatilityPct ?? pick(seed, "vol", 9, 22),
  };

  // REAL when metadata carries the split; generated otherwise.
  const hasMcap =
    opts.mcap != null &&
    [opts.mcap.large, opts.mcap.mid, opts.mcap.small].some((v) => v != null && v > 0);
  const mcap = hasMcap
    ? {
        large: opts.mcap!.large ?? 0,
        mid: opts.mcap!.mid ?? 0,
        small: opts.mcap!.small ?? 0,
      }
    : {
        large: pick(seed, "mL", 30, 76),
        mid: pick(seed, "mM", 12, 32),
        small: pick(seed, "mS", 4, 24),
      };

  // GENERATED — sector weights near the category's, tilted per fund.
  const rawSec = SECTORS.map((s, i) => cat.sectors[s] * pick(seed, `st${i}`, 0.55, 1.5));
  const secTotal = rawSec.reduce((a, b) => a + b, 0);
  const sectors: Record<string, number> = {};
  SECTORS.forEach((s, i) => {
    sectors[s] = (rawSec[i] / secTotal) * 100;
  });

  const rawDebt = CREDIT_TIERS.map((t, i) => cat.debt[t] * pick(seed, `dt${i}`, 0.7, 1.35));
  const debtTotal = rawDebt.reduce((a, b) => a + b, 0);
  const debt: Record<string, number> = {};
  CREDIT_TIERS.forEach((t, i) => {
    debt[t] = (rawDebt[i] / debtTotal) * 100;
  });

  const ageYears = Math.max(1, Math.round(spanYears || pick(seed, "age", 4, 15)));

  return {
    yearly,
    rolling,
    yearBand,
    pct: pctByPeriod,
    quart,
    rank: { "1Y": rankFor("1Y"), "3Y": rankFor("3Y"), "5Y": rankFor("5Y") },
    ratios,
    mcap,
    sectors,
    debt,
    others: {
      Cash: opts.othersPct ?? pick(seed, "cash", 0.6, 4.2),
      Derivatives: pick(seed, "deriv", 0, 1.4),
      REITs: pick(seed, "reit", 0, 1.1),
    },
    aum: `₹${Math.round(pick(seed, "faum", 800, 26_000)).toLocaleString("en-IN")} Cr`,
    // Fund age IS real when the NAV series reaches back far enough.
    age: `${ageYears} yr ${Math.round(pick(seed, "agem", 0, 11))} mo`,
    managerTenure: `${Math.round(pick(seed, "pmy", 1, 9))} yr ${Math.round(pick(seed, "pmm", 0, 11))} mo`,
    ageYears,
    managerTenureYears: pick(seed, "pmyears", 0.8, 11.5),
    strategy: STRATEGIES[hash(`${seed}::strat`) % STRATEGIES.length],
  };
}

/* ── Top holdings ─────────────────────────────────────────────────────────── */

/**
 * A pool of large Indian listed companies to draw a plausible portfolio from.
 *
 * GENERATED: Prozpr has no holdings feed, so which names appear and at what
 * weight is decided by a hash of the scheme code. The companies are real; this
 * fund holding them is not a claim.
 */
const COMPANY_POOL: { name: string; sector: string }[] = [
  { name: "HDFC Bank", sector: "Financial Services" },
  { name: "ICICI Bank", sector: "Financial Services" },
  { name: "Reliance Industries", sector: "Energy" },
  { name: "Infosys", sector: "Technology" },
  { name: "Larsen & Toubro", sector: "Industrials" },
  { name: "Bharti Airtel", sector: "Communication Services" },
  { name: "Tata Consultancy Services", sector: "Technology" },
  { name: "Axis Bank", sector: "Financial Services" },
  { name: "State Bank of India", sector: "Financial Services" },
  { name: "ITC", sector: "Consumer Defensive" },
  { name: "Kotak Mahindra Bank", sector: "Financial Services" },
  { name: "Hindustan Unilever", sector: "Consumer Defensive" },
  { name: "Bajaj Finance", sector: "Financial Services" },
  { name: "Maruti Suzuki", sector: "Consumer Cyclical" },
  { name: "Sun Pharmaceutical", sector: "Healthcare" },
  { name: "Titan Company", sector: "Consumer Cyclical" },
  { name: "UltraTech Cement", sector: "Basic Materials" },
  { name: "Asian Paints", sector: "Basic Materials" },
  { name: "Mahindra & Mahindra", sector: "Consumer Cyclical" },
  { name: "NTPC", sector: "Utilities" },
  { name: "Power Grid Corporation", sector: "Utilities" },
  { name: "Tata Steel", sector: "Basic Materials" },
  { name: "HCL Technologies", sector: "Technology" },
  { name: "Cipla", sector: "Healthcare" },
  { name: "Dr Reddy's Laboratories", sector: "Healthcare" },
  { name: "Nestlé India", sector: "Consumer Defensive" },
  { name: "Grasim Industries", sector: "Basic Materials" },
  { name: "Adani Ports", sector: "Industrials" },
];

export interface Holding {
  rank: number;
  name: string;
  sector: string;
  /** % of the portfolio. */
  weight: number;
}

/** 25 holdings, descending by weight. GENERATED. */
export function topHoldings(seed: string, count = 25): Holding[] {
  // Deterministic shuffle: score each company, take the highest.
  const ranked = COMPANY_POOL.map((c, i) => ({ c, score: pick(seed, `hold${i}`, 0, 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((x) => x.c);

  // Weights decay from the top holding, so the shape looks like a real book.
  const first = pick(seed, "w0", 6.5, 9.5);
  const raw = ranked.map((_, i) => first * Math.pow(0.93, i) * pick(seed, `wj${i}`, 0.86, 1.14));

  return ranked
    .map((c, i) => ({ rank: 0, name: c.name, sector: c.sector, weight: raw[i] }))
    .sort((a, b) => b.weight - a.weight)
    .map((h, i) => ({ ...h, rank: i + 1 }));
}

/* ── People and house view ────────────────────────────────────────────────── */

const FIRST_NAMES = ["Ananya", "Rohit", "Meera", "Karthik", "Priya", "Arjun", "Divya", "Nikhil"];
const LAST_NAMES = ["Krishnan", "Verma", "Iyer", "Sharma", "Nair", "Desai", "Rao", "Menon"];
const SCHOOLS = [
  "IIM Bangalore",
  "IIM Ahmedabad",
  "IIT Madras",
  "IIT Bombay",
  "ISB Hyderabad",
  "FMS Delhi",
];
const DEGREES = ["MBA (Finance)", "B.Tech", "CA", "M.Com", "PGDM"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Manager {
  name: string;
  initials: string;
  /** The lead manager is listed first and badged. */
  lead: boolean;
  credentials: string;
  since: string;
}

/** One or two managers for the fund. GENERATED — no API carries people. */
export function fundManagers(seed: string, leadTenureYears: number): Manager[] {
  const make = (i: number, lead: boolean, tenure: number): Manager => {
    const first = FIRST_NAMES[hash(`${seed}::fn${i}`) % FIRST_NAMES.length];
    const last = LAST_NAMES[hash(`${seed}::ln${i}`) % LAST_NAMES.length];
    const degree = DEGREES[hash(`${seed}::dg${i}`) % DEGREES.length];
    const school = SCHOOLS[hash(`${seed}::sc${i}`) % SCHOOLS.length];
    // Work the start date back from tenure, so the two figures agree.
    const start = new Date();
    start.setMonth(start.getMonth() - Math.round(tenure * 12));
    return {
      name: `${first} ${last}`,
      initials: `${first[0]}${last[0]}`,
      lead,
      credentials: `CFA · ${degree}, ${school}`,
      since: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
    };
  };

  const out = [make(0, true, leadTenureYears)];
  // Most Indian equity funds name a co-manager; some don't.
  if (hash(`${seed}::comgr`) % 3 !== 0) {
    out.push(make(1, false, Math.max(0.5, leadTenureYears * pick(seed, "co", 0.2, 0.6))));
  }
  return out;
}

const PHILOSOPHIES = [
  "Returns come from owning good businesses for long enough, not from trading around them. The team avoids leverage, steers clear of businesses it cannot explain simply, and would rather miss a rally than take a permanent loss of capital.",
  "The house treats volatility and risk as different things: a price that moves is tolerable, a business that erodes is not. Positions are sized so that being wrong on any one name cannot undo a year.",
  "Valuation discipline comes first. The team will hold cash rather than pay up, accepting that this lags in a runaway market and protects when the market turns.",
];

const STRATEGY_TEXT = [
  "Buys growing businesses only when the price is reasonable, and holds them for years. Position sizes stay between 1% and 9%, and the fund moves freely across large, mid and small caps rather than sticking to a fixed split.",
  "Runs a concentrated book of high-conviction names, with turnover kept deliberately low. New positions are added slowly and scaled up only once the thesis has been tested by a full cycle.",
  "Anchors to the benchmark's sector weights and takes its risk at the stock level, so returns come from picking companies rather than timing sectors.",
];

export interface HouseView {
  strategy: string;
  philosophy: string;
  amcBlurb: string;
}

/** Strategy, philosophy and an AMC paragraph. GENERATED. */
export function houseView(seed: string, amcName: string): HouseView {
  const founded = 1994 + (hash(`${seed}::founded`) % 20);
  const crore = pick(seed, "amcaum", 0.4, 3.6);
  const schemes = Math.round(pick(seed, "schemes", 18, 62));
  const investors = Math.round(pick(seed, "investors", 8, 90));
  return {
    strategy: STRATEGY_TEXT[hash(`${seed}::st`) % STRATEGY_TEXT.length],
    philosophy: PHILOSOPHIES[hash(`${seed}::ph`) % PHILOSOPHIES.length],
    amcBlurb: `Set up in ${founded}, ${amcName} manages ₹${crore.toFixed(2)} lakh crore across ${schemes} schemes for about ${investors} lakh investors. Equity is roughly two-thirds of its book, and it runs no credit-risk debt schemes.`,
  };
}
