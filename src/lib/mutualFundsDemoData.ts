// Mock catalogue of mutual fund schemes, used by the Discover entry on the
// portfolio page. The data is synthetic but shaped to match the API the real
// /discovery/ref endpoints would return — name, AMC, scheme classification,
// codes, NAV history, and trailing returns.

export interface FundReturns {
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
  y2: number | null;
  y3: number | null;
  y5: number | null;
}

export interface FundNavPoint {
  date: string; // ISO yyyy-mm-dd
  nav: number;
}

export interface MutualFund {
  code: string;
  name: string;
  amc: string;
  category: string; // eg. "Balanced Hybrid Fund"
  schemeType: string; // eg. "Hybrid Scheme"
  planType: "Direct" | "Regular";
  dividendType: "Growth" | "IDCW" | "IDCW-Reinvestment" | "Half-Yearly IDCW";
  isin: string;
  returns: FundReturns;
}

const AMCS: { name: string; codePrefix: string; isinPrefix: string }[] = [
  { name: "360 ONE Mutual Fund", codePrefix: "1520", isinPrefix: "INF7B7K" },
  { name: "HDFC Mutual Fund", codePrefix: "1180", isinPrefix: "INF179K" },
  { name: "ICICI Prudential Mutual Fund", codePrefix: "1200", isinPrefix: "INF109K" },
  { name: "SBI Mutual Fund", codePrefix: "1250", isinPrefix: "INF200K" },
  { name: "Axis Mutual Fund", codePrefix: "1330", isinPrefix: "INF846K" },
  { name: "Nippon India Mutual Fund", codePrefix: "1450", isinPrefix: "INF204K" },
  { name: "Kotak Mahindra Mutual Fund", codePrefix: "1540", isinPrefix: "INF174K" },
  { name: "Mirae Asset Mutual Fund", codePrefix: "1610", isinPrefix: "INF769K" },
  { name: "UTI Mutual Fund", codePrefix: "1700", isinPrefix: "INF789F" },
  { name: "Aditya Birla Sun Life Mutual Fund", codePrefix: "1780", isinPrefix: "INF209K" },
  { name: "DSP Mutual Fund", codePrefix: "1820", isinPrefix: "INF740K" },
  { name: "Tata Mutual Fund", codePrefix: "1870", isinPrefix: "INF277K" },
  { name: "Parag Parikh Mutual Fund", codePrefix: "1910", isinPrefix: "INF879O" },
  { name: "Quant Mutual Fund", codePrefix: "1960", isinPrefix: "INF966L" },
  { name: "Bandhan Mutual Fund", codePrefix: "2000", isinPrefix: "INF194K" },
];

const SCHEME_FAMILIES: {
  family: string;
  category: string;
  schemeType: string;
  // baseAnnualReturn drives synthesized NAV history.
  baseReturn: number;
  // volatility (annualized) for the synthesized walk.
  vol: number;
}[] = [
  { family: "Balanced Hybrid Fund", category: "Balanced Hybrid Fund", schemeType: "Hybrid Scheme", baseReturn: 0.11, vol: 0.08 },
  { family: "Dynamic Bond Fund", category: "Dynamic Bond", schemeType: "Debt Scheme", baseReturn: 0.07, vol: 0.03 },
  { family: "Liquid Fund", category: "Liquid Fund", schemeType: "Debt Scheme", baseReturn: 0.066, vol: 0.005 },
  { family: "Flexi Cap Fund", category: "Flexi Cap Fund", schemeType: "Equity Scheme", baseReturn: 0.16, vol: 0.16 },
  { family: "Large Cap Fund", category: "Large Cap Fund", schemeType: "Equity Scheme", baseReturn: 0.13, vol: 0.13 },
  { family: "Mid Cap Fund", category: "Mid Cap Fund", schemeType: "Equity Scheme", baseReturn: 0.18, vol: 0.20 },
  { family: "Small Cap Fund", category: "Small Cap Fund", schemeType: "Equity Scheme", baseReturn: 0.22, vol: 0.25 },
  { family: "Multi Cap Fund", category: "Multi Cap Fund", schemeType: "Equity Scheme", baseReturn: 0.15, vol: 0.15 },
  { family: "ELSS Tax Saver Fund", category: "ELSS", schemeType: "Equity Scheme", baseReturn: 0.155, vol: 0.16 },
  { family: "Aggressive Hybrid Fund", category: "Aggressive Hybrid Fund", schemeType: "Hybrid Scheme", baseReturn: 0.13, vol: 0.10 },
  { family: "Nifty 50 Index Fund", category: "Index Fund", schemeType: "Equity Scheme", baseReturn: 0.13, vol: 0.13 },
  { family: "Corporate Bond Fund", category: "Corporate Bond", schemeType: "Debt Scheme", baseReturn: 0.078, vol: 0.035 },
];

const PLAN_TYPES = ["Direct", "Regular"] as const;
const DIVIDEND_TYPES = ["Growth", "IDCW", "IDCW-Reinvestment"] as const;

// Mulberry32 — small seeded PRNG so the mock data is stable across renders.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Approximate Box-Muller using the seeded uniform PRNG.
function gaussian(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-9);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

const DAYS_PER_YEAR = 252;

export function generateNavHistory(
  code: string,
  baseReturn: number,
  vol: number,
  startNav = 10,
  totalDays = 5 * 365,
): FundNavPoint[] {
  // Hash the scheme code into a seed so each fund's path is stable.
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
  const rand = mulberry32(seed || 1);

  const drift = baseReturn / DAYS_PER_YEAR;
  const sigma = vol / Math.sqrt(DAYS_PER_YEAR);

  const out: FundNavPoint[] = [];
  let nav = startNav;
  const end = new Date("2026-05-19");
  // Walk forward from the start date so the last point is "today".
  for (let i = totalDays - 1; i >= 0; i--) {
    // We'll build the history backwards then reverse — but it's simpler to
    // generate forward and shift the dates back instead.
    void i;
  }
  for (let i = 0; i < totalDays; i++) {
    const z = gaussian(rand);
    const change = drift + sigma * z;
    nav = Math.max(0.05, nav * (1 + change));
    const d = new Date(end);
    d.setDate(d.getDate() - (totalDays - 1 - i));
    out.push({ date: d.toISOString().slice(0, 10), nav: Number(nav.toFixed(4)) });
  }
  return out;
}

function pctBetween(history: FundNavPoint[], daysAgo: number): number | null {
  if (history.length < daysAgo + 1) return null;
  const latest = history[history.length - 1].nav;
  const past = history[history.length - 1 - daysAgo].nav;
  if (past <= 0) return null;
  return ((latest - past) / past) * 100;
}

function computeReturns(history: FundNavPoint[]): FundReturns {
  return {
    m1: pctBetween(history, 30),
    m3: pctBetween(history, 90),
    m6: pctBetween(history, 180),
    y1: pctBetween(history, 365),
    y2: pctBetween(history, 365 * 2),
    y3: pctBetween(history, Math.min(history.length - 1, 365 * 3)),
    y5: pctBetween(history, Math.min(history.length - 1, 365 * 5)),
  };
}

// Build the catalogue at module load. Stable thanks to the seeded PRNG.
function buildCatalogue(): MutualFund[] {
  const funds: MutualFund[] = [];
  let codeCounter = 0;
  for (const amc of AMCS) {
    for (const family of SCHEME_FAMILIES) {
      for (const plan of PLAN_TYPES) {
        for (const div of DIVIDEND_TYPES) {
          // Skip combinations that don't exist in the real world. Liquid funds
          // typically don't ship as IDCW-Reinvestment for the Regular plan.
          if (family.category === "Liquid Fund" && div === "IDCW-Reinvestment") continue;
          if (family.category === "ELSS" && div !== "Growth" && plan === "Regular") continue;

          const code = `${amc.codePrefix}${(codeCounter++).toString().padStart(2, "0")}`;
          const name = `${amc.name.replace(/ Mutual Fund$/, "")} ${family.family} - ${plan} Plan - ${div}`;
          const isin = `${amc.isinPrefix}${codeCounter.toString(36).toUpperCase().padStart(3, "0")}`;
          const history = generateNavHistory(code, family.baseReturn, family.vol);
          funds.push({
            code,
            name,
            amc: amc.name,
            category: family.category,
            schemeType: family.schemeType,
            planType: plan,
            dividendType: div,
            isin,
            returns: computeReturns(history),
          });
        }
      }
    }
  }
  return funds;
}

let cachedCatalogue: MutualFund[] | null = null;
const navCache = new Map<string, FundNavPoint[]>();

export function getAllFunds(): MutualFund[] {
  if (!cachedCatalogue) cachedCatalogue = buildCatalogue();
  return cachedCatalogue;
}

export function getFundByCode(code: string): MutualFund | undefined {
  return getAllFunds().find((f) => f.code === code);
}

export function getNavHistory(code: string): FundNavPoint[] {
  const cached = navCache.get(code);
  if (cached) return cached;
  const fund = getFundByCode(code);
  if (!fund) return [];
  const family = SCHEME_FAMILIES.find((s) => s.category === fund.category);
  const baseReturn = family?.baseReturn ?? 0.10;
  const vol = family?.vol ?? 0.10;
  const history = generateNavHistory(code, baseReturn, vol);
  navCache.set(code, history);
  return history;
}

export function searchFunds(query: string): MutualFund[] {
  const q = query.trim().toLowerCase();
  const all = getAllFunds();
  if (!q) return all;
  return all.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.amc.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      f.code.includes(q) ||
      f.isin.toLowerCase().includes(q),
  );
}
