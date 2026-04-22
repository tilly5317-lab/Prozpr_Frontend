import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Mic,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import BottomNav from "@/components/BottomNav";
import {
  getMyPortfolio,
  getRecommendedPlan,
  type IdealAllocationOutput,
  type PortfolioDetail,
  type SubgroupItem,
} from "@/lib/api";

/* ── ETF Data (original) ── */
interface ETF {
  name: string;
  shortName: string;
  description: string;
  allocation: number;
  amount: number;
  category: string;
  color: string;
  exchange: string;
  houseRec: boolean;
  customerPref?: boolean;
  custom?: boolean;
  returns1Y: string;
  returns2Y: string;
  returns3Y: string;
  expenseRatio: string;
  exitLoad: string;
  minInvestment: string;
}

const TOTAL = 8300000;
const TOTAL_STORAGE_KEY = "execute:totalInvestment";
const MIN_TOTAL = 1000;
const MAX_TOTAL = 100_000_000; // ₹10 Cr

/* Category colors — private bank palette */
const CAT_COLORS: Record<string, string> = {
  "India Equity": "#1B3A6B",
  "US Equity": "#4A7FA5",
  "Bonds": "#8BA7BC",
  "Sectoral": "#C4B99A",
  "Gold": "#D4AF70",
};

type Bucket = "equity" | "debt" | "hybrid";

const BUCKET_ORDER: Bucket[] = ["equity", "debt", "hybrid"];

const BUCKET_LABEL: Record<Bucket, string> = {
  equity: "Equity",
  debt: "Debt",
  hybrid: "Hybrid & Others",
};

// Deep teal · slate blue · warm amber — each bucket gets its own world.
// Colours live in CSS variables so they flip correctly between light and dark themes.
const BUCKET_ACCENT: Record<Bucket, string> = {
  equity: "hsl(var(--bucket-equity))",
  debt: "hsl(var(--bucket-debt))",
  hybrid: "hsl(var(--bucket-hybrid))",
};

// Barely-there wash of the accent color — just enough tint to distinguish sections at a glance.
const BUCKET_TINT: Record<Bucket, string> = {
  equity: "hsl(var(--bucket-equity) / 0.05)",
  debt: "hsl(var(--bucket-debt) / 0.05)",
  hybrid: "hsl(var(--bucket-hybrid) / 0.06)",
};

/* ── Searchable fund universe (used for manual "+ Add fund") ── */
interface UniverseFund {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  bucket: Bucket;
  exchange: string;
  expenseRatio: string;
  aum: string;
  nav: string;
  returns1Y: string;
  returns2Y: string;
  returns3Y: string;
  amc: string;
  benchmark: string;
  risk: "Low" | "Moderate" | "High";
  stars: number;
  rationale: string;
}

const FUND_UNIVERSE: UniverseFund[] = [
  {
    id: "paragflex",
    name: "Parag Parikh Flexi Cap Fund",
    description: "Flexi-cap active equity, global tilt",
    category: "India Equity",
    color: "#1B3A6B",
    bucket: "equity",
    exchange: "MF",
    expenseRatio: "0.64%",
    aum: "₹69,400 Cr",
    nav: "₹84.21",
    returns1Y: "+19.4%",
    returns2Y: "+16.8%",
    returns3Y: "+18.2%",
    amc: "PPFAS",
    benchmark: "Nifty 500",
    risk: "Moderate",
    stars: 5,
    rationale: "Consistent top-quartile flexi-cap fund with unusual global equity sleeve (~25% US). Low churn, stable manager. Good complement to passive domestic core.",
  },
  {
    id: "mirae-eb",
    name: "Mirae Asset Emerging Bluechip",
    description: "Large & mid-cap active equity",
    category: "India Equity",
    color: "#1B3A6B",
    bucket: "equity",
    exchange: "MF",
    expenseRatio: "0.58%",
    aum: "₹32,100 Cr",
    nav: "₹132.48",
    returns1Y: "+21.7%",
    returns2Y: "+17.2%",
    returns3Y: "+19.8%",
    amc: "Mirae Asset",
    benchmark: "NIFTY Large Midcap 250",
    risk: "High",
    stars: 5,
    rationale: "Long-term outperformer in the large & mid-cap space. Currently closed for lumpsum — SIP only. Adds active alpha over index core.",
  },
  {
    id: "axis-sc",
    name: "Axis Small Cap Fund",
    description: "Small-cap active equity",
    category: "India Equity",
    color: "#1B3A6B",
    bucket: "equity",
    exchange: "MF",
    expenseRatio: "0.56%",
    aum: "₹20,300 Cr",
    nav: "₹96.14",
    returns1Y: "+28.6%",
    returns2Y: "+19.1%",
    returns3Y: "+22.4%",
    amc: "Axis AMC",
    benchmark: "Nifty Smallcap 250",
    risk: "High",
    stars: 4,
    rationale: "Higher-conviction, more concentrated small-cap portfolio. Higher volatility but strong 5Y alpha vs. index. Size small-cap exposure deliberately.",
  },
  {
    id: "icici-cb",
    name: "ICICI Prudential Corporate Bond",
    description: "AA+/AAA corporate bonds, short–medium duration",
    category: "Bonds",
    color: "#8BA7BC",
    bucket: "debt",
    exchange: "MF",
    expenseRatio: "0.25%",
    aum: "₹29,800 Cr",
    nav: "₹28.92",
    returns1Y: "+7.8%",
    returns2Y: "+7.1%",
    returns3Y: "+7.4%",
    amc: "ICICI Prudential",
    benchmark: "CRISIL Corporate Bond Index",
    risk: "Low",
    stars: 5,
    rationale: "Low-cost credit fund staying squarely in AAA/AA+ territory. Good ballast for equity volatility, well-managed duration.",
  },
  {
    id: "sbi-gilt",
    name: "SBI Magnum Gilt Fund",
    description: "Sovereign G-sec, long duration",
    category: "Bonds",
    color: "#8BA7BC",
    bucket: "debt",
    exchange: "MF",
    expenseRatio: "0.47%",
    aum: "₹9,600 Cr",
    nav: "₹63.14",
    returns1Y: "+9.2%",
    returns2Y: "+7.9%",
    returns3Y: "+7.2%",
    amc: "SBI MF",
    benchmark: "CRISIL Dynamic Gilt Index",
    risk: "Moderate",
    stars: 4,
    rationale: "Pure-sovereign fund with active duration calls. Benefits in a rate-cut cycle; watch duration risk when rates rise.",
  },
  {
    id: "hdfc-bal",
    name: "HDFC Balanced Advantage Fund",
    description: "Dynamic asset allocation equity & debt",
    category: "Sectoral",
    color: "#C4B99A",
    bucket: "hybrid",
    exchange: "MF",
    expenseRatio: "0.76%",
    aum: "₹93,200 Cr",
    nav: "₹504.30",
    returns1Y: "+14.6%",
    returns2Y: "+13.1%",
    returns3Y: "+15.8%",
    amc: "HDFC AMC",
    benchmark: "CRISIL Hybrid 50+50",
    risk: "Moderate",
    stars: 4,
    rationale: "Flagship BAF tilting equity exposure based on valuation. Lower drawdowns than pure equity, better after-tax treatment than debt.",
  },
  {
    id: "silver-etf",
    name: "ICICI Prudential Silver ETF",
    description: "Physical silver exposure",
    category: "Gold",
    color: "#D4AF70",
    bucket: "hybrid",
    exchange: "NSE",
    expenseRatio: "0.40%",
    aum: "₹3,800 Cr",
    nav: "₹88.52",
    returns1Y: "+22.1%",
    returns2Y: "+11.6%",
    returns3Y: "+14.3%",
    amc: "ICICI Prudential",
    benchmark: "LBMA Silver AM Fix",
    risk: "High",
    stars: 3,
    rationale: "Silver has historically lagged gold but shown outsize moves during industrial metal rallies. Use as a small tactical diversifier.",
  },
  {
    id: "bankbees",
    name: "Nippon India ETF Nifty Bank BeES",
    description: "Indian banking sector index",
    category: "Sectoral",
    color: "#C4B99A",
    bucket: "hybrid",
    exchange: "NSE",
    expenseRatio: "0.19%",
    aum: "₹6,900 Cr",
    nav: "₹519.40",
    returns1Y: "+13.8%",
    returns2Y: "+14.9%",
    returns3Y: "+18.6%",
    amc: "Nippon India",
    benchmark: "Nifty Bank TRI",
    risk: "High",
    stars: 3,
    rationale: "Concentrated bet on private + PSU banks. Higher beta to policy rates. Keep allocation modest — already indirectly present in Nifty 50.",
  },
];

function deriveAMCFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("nippon")) return "Nippon India";
  if (lower.includes("icici")) return "ICICI Prudential";
  if (lower.includes("motilal")) return "Motilal Oswal";
  if (lower.includes("mirae")) return "Mirae Asset";
  if (lower.includes("sbi")) return "SBI MF";
  if (lower.includes("hdfc")) return "HDFC AMC";
  if (lower.includes("kotak")) return "Kotak Mahindra";
  if (lower.includes("axis")) return "Axis AMC";
  if (lower.includes("bharat bond")) return "Edelweiss";
  return "—";
}

function deriveBenchmark(etf: ETF): string {
  const name = etf.name.toLowerCase();
  if (name.includes("nifty 50")) return "Nifty 50 TRI";
  if (name.includes("next 50")) return "Nifty Next 50 TRI";
  if (name.includes("midcap 150")) return "Nifty Midcap 150 TRI";
  if (name.includes("s&p 500")) return "S&P 500 TRI";
  if (name.includes("bharat bond")) return "Nifty BHARAT Bond 2032";
  if (name.includes("psu bank")) return "Nifty PSU Bank TRI";
  if (name.includes("gold")) return "Domestic spot gold";
  if (name.includes("it")) return "Nifty IT TRI";
  return "—";
}

function deriveRisk(etf: ETF): "Low" | "Moderate" | "High" {
  const bucket = categoryToBucket(etf.category);
  if (bucket === "debt") return "Low";
  if (bucket === "equity") {
    if (/small|midcap|next 50/i.test(etf.name)) return "High";
    return "Moderate";
  }
  if (/psu bank|it etf/i.test(etf.name)) return "High";
  return "Moderate";
}

function deriveStars(etf: ETF): number {
  // Deterministic mock: hash the name into a 3–5 star rating.
  const hash = etf.name
    .split("")
    .reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return 3 + (hash % 3);
}

function deriveAUM(etf: ETF): string {
  const hash = etf.name.split("").reduce((a, c) => (a * 17 + c.charCodeAt(0)) >>> 0, 11);
  const v = 2000 + (hash % 18000);
  return `₹${v.toLocaleString("en-IN")} Cr`;
}

function deriveNAV(etf: ETF): string {
  const hash = etf.name.split("").reduce((a, c) => (a * 23 + c.charCodeAt(0)) >>> 0, 5);
  const v = 20 + (hash % 480);
  return `₹${v.toFixed(2)}`;
}

function parseReturnPct(s: string): number {
  const m = s.match(/[-+]?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

// Compose a 1Y / 3Y / 5Y line (fund vs benchmark) for the drawer chart.
function buildReturnSeries(etf: ETF): { label: string; fund: number; benchmark: number }[] {
  const r1 = parseReturnPct(etf.returns1Y);
  const r2 = parseReturnPct(etf.returns2Y);
  const r3 = parseReturnPct(etf.returns3Y);
  // Fund returns cumulative from 0.
  const benchmarkScale = 0.85;
  return [
    { label: "Start", fund: 0, benchmark: 0 },
    { label: "1Y", fund: r1, benchmark: Math.round(r1 * benchmarkScale * 10) / 10 },
    { label: "3Y", fund: r2, benchmark: Math.round(r2 * benchmarkScale * 10) / 10 },
    { label: "5Y", fund: r3, benchmark: Math.round(r3 * benchmarkScale * 10) / 10 },
  ];
}

function genericRationale(etf: ETF): string {
  const bucket = categoryToBucket(etf.category);
  if (bucket === "equity") {
    return `Offers ${etf.category.toLowerCase()} exposure with an expense ratio of ${etf.expenseRatio}. Part of the core-satellite mix recommended for your risk profile.`;
  }
  if (bucket === "debt") {
    return `Provides stability and predictable cashflow. Expense ratio ${etf.expenseRatio}, exit load ${etf.exitLoad}. Anchors the portfolio against equity volatility.`;
  }
  return `Diversifier chosen to reduce portfolio correlation with domestic equities. Expense ratio ${etf.expenseRatio}.`;
}

const BUILTIN_RATIONALES: Record<string, string> = {
  "Nifty 50 ETF (Nippon)": "Lowest TER among Nifty 50 trackers at 0.05%. High liquidity and tight tracking error — ideal core domestic equity.",
  "Nifty Next 50 ETF (ICICI)": "Captures the next 50 large caps — historically outperforms Nifty 50 over 7+ years with moderate added volatility.",
  "Nifty Midcap 150 ETF (Motilal)": "Broad mid-cap exposure at index cost. Sized at 10% so mid-cap volatility doesn't dominate the portfolio.",
  "S&P 500 ETF (Mirae)": "Added per your preference for US equity. Delivers global tech exposure and currency diversification.",
  "Bharat Bond ETF (2032)": "AAA-rated PSU debt with defined maturity — predictable post-tax yield and minimal credit risk.",
  "Nifty PSU Bank ETF (SBI)": "Tactical value play on PSU banks trading at a discount to private peers. Higher beta — keep allocation modest.",
  "Gold ETF (HDFC)": "Inflation hedge at index cost. 5–10% gold allocation is standard in a balanced portfolio.",
  "Nifty IT ETF (Kotak)": "Sector exposure to export-linked dollar revenues. Diversifies against domestic macro risk.",
};

function rationaleFor(etf: ETF): string {
  return BUILTIN_RATIONALES[etf.name] ?? genericRationale(etf);
}

function categoryToBucket(category: string): Bucket {
  const c = category.toLowerCase();
  if (c.includes("equity") || c.includes("stock")) return "equity";
  if (c.includes("bond") || c.includes("debt") || c.includes("fixed income") || c.includes("liquid")) return "debt";
  return "hybrid";
}

const defaultETFs: ETF[] = [
  { name: "Nifty 50 ETF (Nippon)", shortName: "Nifty 50", description: "India large-cap, tracks Nifty 50", allocation: 30, amount: 2490000, category: "India Equity", color: CAT_COLORS["India Equity"], exchange: "NSE", houseRec: true, returns1Y: "+14.8%", returns2Y: "+12.6%", returns3Y: "+13.2%", expenseRatio: "0.05%", exitLoad: "Nil", minInvestment: "1 unit (~₹240)" },
  { name: "Nifty Next 50 ETF (ICICI)", shortName: "Next 50", description: "India mid-large, next 50 companies", allocation: 15, amount: 1245000, category: "India Equity", color: CAT_COLORS["India Equity"], exchange: "NSE", houseRec: true, returns1Y: "+18.2%", returns2Y: "+14.1%", returns3Y: "+15.7%", expenseRatio: "0.08%", exitLoad: "Nil", minInvestment: "1 unit (~₹58)" },
  { name: "Nifty Midcap 150 ETF (Motilal)", shortName: "Midcap 150", description: "India mid-cap growth exposure", allocation: 10, amount: 830000, category: "India Equity", color: CAT_COLORS["India Equity"], exchange: "NSE", houseRec: true, returns1Y: "+22.4%", returns2Y: "+16.8%", returns3Y: "+18.1%", expenseRatio: "0.12%", exitLoad: "Nil", minInvestment: "1 unit (~₹16)" },
  { name: "S&P 500 ETF (Mirae)", shortName: "S&P 500", description: "US large-cap equities, customer preference", allocation: 5, amount: 415000, category: "US Equity", color: CAT_COLORS["US Equity"], exchange: "NSE", houseRec: false, customerPref: true, returns1Y: "+26.3%", returns2Y: "+18.4%", returns3Y: "+20.1%", expenseRatio: "0.18%", exitLoad: "Nil", minInvestment: "₹500" },
  { name: "Bharat Bond ETF (2032)", shortName: "Bharat Bond", description: "AAA-rated PSU bonds, low risk", allocation: 20, amount: 1660000, category: "Bonds", color: CAT_COLORS["Bonds"], exchange: "NSE", houseRec: true, returns1Y: "+7.2%", returns2Y: "+6.8%", returns3Y: "+7.5%", expenseRatio: "0.0005%", exitLoad: "Nil", minInvestment: "1 unit (~₹1,250)" },
  { name: "Nifty PSU Bank ETF (SBI)", shortName: "PSU Bank", description: "Indian public sector banks", allocation: 8, amount: 664000, category: "Sectoral", color: CAT_COLORS["Sectoral"], exchange: "BSE", houseRec: true, returns1Y: "+16.1%", returns2Y: "+28.4%", returns3Y: "+24.6%", expenseRatio: "0.20%", exitLoad: "Nil", minInvestment: "1 unit (~₹64)" },
  { name: "Gold ETF (HDFC)", shortName: "Gold", description: "Physical gold, inflation hedge", allocation: 7, amount: 581000, category: "Gold", color: CAT_COLORS["Gold"], exchange: "NSE", houseRec: true, returns1Y: "+12.8%", returns2Y: "+10.2%", returns3Y: "+11.4%", expenseRatio: "0.15%", exitLoad: "Nil", minInvestment: "1 unit (~₹58)" },
  { name: "Nifty IT ETF (Kotak)", shortName: "IT ETF", description: "Indian IT sector exposure", allocation: 5, amount: 415000, category: "Sectoral", color: CAT_COLORS["Sectoral"], exchange: "NSE", houseRec: true, returns1Y: "+19.6%", returns2Y: "+8.4%", returns3Y: "+12.3%", expenseRatio: "0.20%", exitLoad: "Nil", minInvestment: "1 unit (~₹38)" },
];

/* ── Helpers ── */
const formatINR = (n: number) => {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  return `₹${n.toLocaleString("en-IN")}`;
};

const formatINRNoSymbol = (n: number) => {
  if (n >= 10000000) return (n / 10000000).toFixed(2) + " Cr";
  if (n >= 100000) return (n / 100000).toFixed(2) + "L";
  return n.toLocaleString("en-IN");
};

/* ── Donut chart (SVG) — compact 140px ── */
const DonutChart = ({ data, centerLabel }: { data: { label: string; value: number; color: string }[]; centerLabel: string }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 140;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {total > 0 &&
          data.map((seg) => {
            const pct = seg.value / total;
            const dashLen = pct * circumference;
            const dashOff = cumulative * circumference;
            cumulative += pct;
            return (
              <circle
                key={seg.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={-dashOff}
                strokeLinecap="butt"
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-base font-bold text-foreground">{centerLabel}</p>
        <p className="text-[9px] text-muted-foreground">Total</p>
      </div>
    </div>
  );
};

/* ── Theme colors used across the page ── */
// Neutral slider track / faint chip surface — flips cleanly in dark mode.
const TRACK_BG = "hsl(var(--muted))";
// Main CTA fill and link/emphasis colour. Primary = navy in light, accent-inverted in dark.
const CTA_BG = "hsl(var(--primary))";
const CTA_FG = "hsl(var(--primary-foreground))";
const LINK_COLOR = "hsl(var(--accent))";
// Legacy alias — some helpers (renderBoldText) still reference NAVY by name.
const NAVY = LINK_COLOR;

/* ── Category-based summary ── */
function categoryTotals(etfs: ETF[], allocations: number[]): Record<string, number> {
  const totals: Record<string, number> = {};
  etfs.forEach((e, i) => {
    totals[e.category] = (totals[e.category] ?? 0) + (allocations[i] ?? 0);
  });
  return totals;
}

function generateDynamicSummary(etfs: ETF[], allocations: number[]): string {
  const totals = categoryTotals(etfs, allocations);
  const indiaEq = totals["India Equity"] ?? 0;
  const usEq = totals["US Equity"] ?? 0;
  const bonds = totals["Bonds"] ?? 0;
  const sectoral = totals["Sectoral"] ?? 0;
  const gold = totals["Gold"] ?? 0;
  const totalEq = indiaEq + usEq;

  let profile = "balanced";
  if (totalEq >= 70) profile = "aggressive";
  else if (totalEq < 40) profile = "conservative";

  const nifty50Idx = etfs.findIndex((e) => /nifty 50/i.test(e.shortName));
  const nifty50Pct = nifty50Idx >= 0 ? (allocations[nifty50Idx] ?? 0) : 0;

  const parts: string[] = [];
  parts.push(
    `Your portfolio leans **${profile}** with **${totalEq}% in equities**${
      usEq > 0 ? ` (including ${usEq}% international via S&P 500)` : ""
    }.`,
  );
  if (indiaEq > 0) {
    if (nifty50Pct > 0) {
      parts.push(
        `Domestic equity is concentrated at **${indiaEq}%**, led by large-cap Nifty 50 at **${nifty50Pct}%**.`,
      );
    } else {
      parts.push(`Domestic equity sits at **${indiaEq}%**.`);
    }
  }
  if (bonds > 0) parts.push(`Debt anchors stability at **${bonds}%** via Bharat Bond.`);
  const extras: string[] = [];
  if (gold > 0) extras.push(`gold (${gold}%)`);
  if (sectoral > 0) extras.push(`sectoral bets (${sectoral}%)`);
  if (extras.length) parts.push(`Diversifiers include ${extras.join(" and ")}.`);
  return parts.join(" ");
}

function idealOutputToETFs(out: IdealAllocationOutput): {
  etfs: ETF[];
  houseRecs: number[];
} | null {
  const sg = out.subgroup_allocation;
  if (!sg) return null;
  const items: SubgroupItem[] = [
    ...(sg.equity ?? []),
    ...(sg.debt ?? []),
    ...(sg.others ?? []),
  ];
  if (items.length === 0) return null;
  const ROW_COLORS = [
    "#1B3A6B",
    "#4A7FA5",
    "#8BA7BC",
    "#C4B99A",
    "#D4AF70",
    "#10b981",
    "#f59e0b",
    "#6366f1",
    "#ec4899",
    "#14b8a6",
  ];
  const etfs: ETF[] = items.map((item, i) => ({
    name: item.recommended_fund,
    shortName:
      item.recommended_fund.length > 22
        ? `${item.recommended_fund.slice(0, 20)}…`
        : item.recommended_fund,
    description: [item.subgroup, item.asset_class_subcategory].filter(Boolean).join(" · ") || item.asset_class,
    allocation: item.pct,
    amount: 0,
    category: item.asset_class_subcategory || item.asset_class,
    color: ROW_COLORS[i % ROW_COLORS.length],
    exchange: "—",
    houseRec: true,
    returns1Y: "—",
    returns2Y: "—",
    returns3Y: "—",
    expenseRatio: "—",
    exitLoad: "—",
    minInvestment: "—",
  }));
  return {
    etfs,
    houseRecs: items.map((item) => item.pct),
  };
}

function renderBoldText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <span key={i} className="font-bold" style={{ color: NAVY }}>{part.slice(2, -2)}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

const HOUSE_DEFAULTS_BY_SHORTNAME: Record<string, number> = {
  "Nifty 50": 30,
  "Next 50": 15,
  "Midcap 150": 10,
  "S&P 500": 5,
  "Bharat Bond": 20,
  "PSU Bank": 8,
  "Gold": 7,
  "IT ETF": 5,
};

const houseDefaults = defaultETFs.map(
  (e) => HOUSE_DEFAULTS_BY_SHORTNAME[e.shortName] ?? e.allocation,
);

const DB_ALLOC_COLORS = [
  "#1B3A6B",
  "#4A7FA5",
  "#8BA7BC",
  "#C4B99A",
  "#D4AF70",
  "#10b981",
  "#f59e0b",
  "#6366f1",
  "#ec4899",
];

function portfolioToDonutData(p: PortfolioDetail): { label: string; value: number; color: string }[] {
  const raw = p.allocations.map((a, i) => ({
    label: a.asset_class,
    value: a.allocation_percentage,
    color: DB_ALLOC_COLORS[i % DB_ALLOC_COLORS.length],
  }));
  const sum = raw.reduce((s, x) => s + x.value, 0);
  if (sum <= 0) return raw;
  if (Math.abs(sum - 100) < 0.5) return raw;
  return raw.map((x) => ({ ...x, value: (x.value / sum) * 100 }));
}

/* ── Page ── */
const Execute = () => {
  const navigate = useNavigate();
  const [useAiPlan, setUseAiPlan] = useState(false);
  const [idealPlanOutput, setIdealPlanOutput] = useState<IdealAllocationOutput | null>(null);
  const [aiHouseRec, setAiHouseRec] = useState<number[]>([]);
  const [recommendedPlanMeta, setRecommendedPlanMeta] = useState<{
    effectiveAt: string;
    rebalancingId: string | null;
  } | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  const [allocations, setAllocations] = useState<number[]>([...houseDefaults]);
  const [totalInvestment, setTotalInvestmentRaw] = useState<number>(() => {
    if (typeof window === "undefined") return TOTAL;
    const stored = localStorage.getItem(TOTAL_STORAGE_KEY);
    const n = stored ? Number(stored) : NaN;
    return Number.isFinite(n) && n > 0 ? n : TOTAL;
  });
  const [recommendedTotal, setRecommendedTotal] = useState<number>(TOTAL);
  const [totalFocused, setTotalFocused] = useState(false);
  const totalUserModifiedRef = useRef<boolean>(
    typeof window !== "undefined" && localStorage.getItem(TOTAL_STORAGE_KEY) !== null,
  );
  const [portfolioDb, setPortfolioDb] = useState<PortfolioDetail | null>(null);
  const [touchedIdxs, setTouchedIdxs] = useState<number[]>([]);
  const [showTillyPill, setShowTillyPill] = useState(true);
  const [extraETFs, setExtraETFs] = useState<ETF[]>([]);
  const [searchBucket, setSearchBucket] = useState<Bucket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailIdx, setDetailIdx] = useState<number | null>(null);

  const setTotalInvestment = useCallback((v: number) => {
    setTotalInvestmentRaw(v);
    totalUserModifiedRef.current = true;
    if (typeof window !== "undefined") {
      localStorage.setItem(TOTAL_STORAGE_KEY, String(v));
    }
  }, []);

  const resetTotalToRecommended = useCallback(() => {
    setTotalInvestmentRaw(recommendedTotal);
    totalUserModifiedRef.current = false;
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOTAL_STORAGE_KEY);
    }
  }, [recommendedTotal]);

  const baseETFs = useMemo(() => {
    if (useAiPlan && idealPlanOutput) {
      const built = idealOutputToETFs(idealPlanOutput);
      if (built?.etfs.length) return built.etfs;
    }
    return defaultETFs;
  }, [useAiPlan, idealPlanOutput]);

  const etfList = useMemo(() => [...baseETFs, ...extraETFs], [baseETFs, extraETFs]);

  const houseRecs = useMemo(() => {
    const base = useAiPlan && aiHouseRec.length > 0 ? aiHouseRec : houseDefaults;
    return [...base, ...extraETFs.map(() => 0)];
  }, [useAiPlan, aiHouseRec, extraETFs]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getMyPortfolio();
        if (!cancelled) {
          setPortfolioDb(p);
          if (p.total_value > 0) {
            const rec = Math.round(p.total_value);
            setRecommendedTotal(rec);
            if (!totalUserModifiedRef.current) setTotalInvestmentRaw(rec);
          }
        }
      } catch {
        if (!cancelled) setPortfolioDb(null);
      }
      try {
        const rec = await getRecommendedPlan();
        if (cancelled) return;
        const out = rec.snapshot?.allocation?.ideal_allocation_output;
        const built = out ? idealOutputToETFs(out) : null;
        if (out && built?.houseRecs.length) {
          setIdealPlanOutput(out);
          setUseAiPlan(true);
          setAiHouseRec(built.houseRecs);
          setAllocations([...built.houseRecs]);
          setRecommendedPlanMeta({
            effectiveAt: rec.snapshot!.effective_at,
            rebalancingId: rec.latest_rebalancing_id,
          });
          if (typeof out.grand_total === "number" && out.grand_total > 0) {
            const recAmt = Math.round(out.grand_total);
            setRecommendedTotal(recAmt);
            if (!totalUserModifiedRef.current) setTotalInvestmentRaw(recAmt);
          }
        }
      } catch {
        /* no saved plan — keep demo */
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setShowTillyPill(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  const totalAlloc = allocations.reduce((s, a) => s + a, 0);
  const isValid = totalAlloc === 100;
  const overAllocated = totalAlloc > 100;
  const underAllocated = totalAlloc < 100;
  const maxSliderPct = 100;

  const summary = useMemo(
    () => generateDynamicSummary(etfList, allocations),
    [etfList, allocations],
  );

  const groupedBuckets = useMemo(() => {
    const buckets: Record<Bucket, number[]> = { equity: [], debt: [], hybrid: [] };
    etfList.forEach((etf, i) => {
      buckets[categoryToBucket(etf.category)].push(i);
    });
    return BUCKET_ORDER.filter((b) => buckets[b].length > 0).map((b) => ({
      bucket: b,
      label: BUCKET_LABEL[b],
      indices: buckets[b],
      total: buckets[b].reduce((s, i) => s + (allocations[i] ?? 0), 0),
    }));
  }, [etfList, allocations]);

  const markTouched = useCallback((idx: number) => {
    setTouchedIdxs((prev) => {
      const without = prev.filter((i) => i !== idx);
      return [...without, idx];
    });
  }, []);

  const updateAllocation = useCallback(
    (idx: number, val: number) => {
      const next = Math.max(0, Math.min(maxSliderPct, val));
      setAllocations((prev) => {
        const out = [...prev];
        out[idx] = next;
        return out;
      });
      markTouched(idx);
    },
    [markTouched],
  );

  const updateFromRupee = useCallback(
    (idx: number, rupeeVal: number) => {
      if (totalInvestment <= 0) return;
      const pct = Math.round((rupeeVal / totalInvestment) * 100);
      updateAllocation(idx, pct);
    },
    [totalInvestment, updateAllocation],
  );

  const resetToHouse = useCallback(() => {
    setAllocations([...houseRecs]);
    setTouchedIdxs([]);
  }, [houseRecs]);

  const resetSingleToHouse = useCallback(
    (idx: number) => {
      const target = houseRecs[idx] ?? 0;
      setAllocations((prev) => {
        const out = [...prev];
        out[idx] = target;
        return out;
      });
      setTouchedIdxs((prev) => prev.filter((i) => i !== idx));
    },
    [houseRecs],
  );

  const addCustomFund = useCallback(
    (fund: UniverseFund) => {
      const etf: ETF = {
        name: fund.name,
        shortName: fund.name.length > 22 ? `${fund.name.slice(0, 20)}…` : fund.name,
        description: fund.description,
        allocation: 0,
        amount: 0,
        category: fund.category,
        color: fund.color,
        exchange: fund.exchange,
        houseRec: false,
        custom: true,
        returns1Y: fund.returns1Y,
        returns2Y: fund.returns2Y,
        returns3Y: fund.returns3Y,
        expenseRatio: fund.expenseRatio,
        exitLoad: "Nil",
        minInvestment: "—",
      };
      setExtraETFs((prev) => [...prev, etf]);
      setAllocations((prev) => [...prev, 0]);
      setSearchBucket(null);
      setSearchQuery("");
    },
    [],
  );

  const removeCustomFund = useCallback(
    (idx: number) => {
      const extrasStart = baseETFs.length;
      const extraIdx = idx - extrasStart;
      if (extraIdx < 0) return;
      setExtraETFs((prev) => prev.filter((_, j) => j !== extraIdx));
      setAllocations((prev) => prev.filter((_, j) => j !== idx));
      setTouchedIdxs((prev) =>
        prev.filter((t) => t !== idx).map((t) => (t > idx ? t - 1 : t)),
      );
      setDetailIdx((prev) => (prev === idx ? null : prev !== null && prev > idx ? prev - 1 : prev));
    },
    [baseETFs.length],
  );

  const universeByBucket = useMemo(() => {
    const used = new Set(etfList.map((e) => e.name.toLowerCase()));
    return (bucket: Bucket) =>
      FUND_UNIVERSE.filter(
        (f) =>
          f.bucket === bucket &&
          !used.has(f.name.toLowerCase()) &&
          (searchQuery.trim().length === 0 ||
            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            f.category.toLowerCase().includes(searchQuery.toLowerCase())),
      );
  }, [etfList, searchQuery]);

  // Redistribute the 100-sum shortfall (or excess) proportionally across the
  // ETFs the user hasn't most-recently touched. Falls back to all-but-last-touched
  // when every ETF has been touched.
  const rebalanceRemaining = useCallback(() => {
    const sum = allocations.reduce((s, a) => s + a, 0);
    const diff = 100 - sum;
    if (diff === 0) return;
    const touched = new Set(touchedIdxs);
    let targetIdxs = allocations
      .map((_, i) => i)
      .filter((i) => !touched.has(i));
    if (targetIdxs.length === 0) {
      const last = touchedIdxs[touchedIdxs.length - 1];
      targetIdxs = allocations.map((_, i) => i).filter((i) => i !== last);
    }
    if (targetIdxs.length === 0) return;
    const baseSum = targetIdxs.reduce((s, i) => s + allocations[i], 0);
    setAllocations((prev) => {
      const out = [...prev];
      if (baseSum <= 0) {
        const even = diff / targetIdxs.length;
        targetIdxs.forEach((i) => {
          out[i] = Math.max(0, Math.round(prev[i] + even));
        });
      } else {
        targetIdxs.forEach((i) => {
          const share = (prev[i] / baseSum) * diff;
          out[i] = Math.max(0, Math.round(prev[i] + share));
        });
      }
      // Nudge the final one so the total lands exactly on 100.
      const newSum = out.reduce((s, a) => s + a, 0);
      const delta = 100 - newSum;
      if (delta !== 0) {
        const lastTarget = targetIdxs[targetIdxs.length - 1];
        out[lastTarget] = Math.max(0, out[lastTarget] + delta);
      }
      return out;
    });
  }, [allocations, touchedIdxs]);

  const donutFromSliders = useMemo(() => {
    const categoryMap = new Map<string, { value: number; color: string }>();
    etfList.forEach((etf, i) => {
      const existing = categoryMap.get(etf.category);
      const val = allocations[i] ?? 0;
      if (existing) {
        existing.value += val;
      } else {
        categoryMap.set(etf.category, { value: val, color: etf.color });
      }
    });
    return Array.from(categoryMap.entries()).map(([label, d]) => ({
      label,
      value: d.value,
      color: d.color,
    }));
  }, [etfList, allocations]);

  const donutData = useMemo(() => {
    if (portfolioDb && portfolioDb.allocations.length > 0 && !useAiPlan) {
      return portfolioToDonutData(portfolioDb);
    }
    return donutFromSliders;
  }, [useAiPlan, portfolioDb, donutFromSliders]);

  const donutCenterLabel =
    portfolioDb && portfolioDb.total_value > 0
      ? portfolioDb.total_value >= 10000000
        ? `₹${(portfolioDb.total_value / 10000000).toFixed(1)}Cr`
        : portfolioDb.total_value >= 100000
          ? `₹${(portfolioDb.total_value / 100000).toFixed(1)}L`
          : `₹${Math.round(portfolioDb.total_value).toLocaleString("en-IN")}`
      : totalInvestment >= 10000000
        ? `₹${(totalInvestment / 10000000).toFixed(1)}Cr`
        : totalInvestment >= 100000
          ? `₹${(totalInvestment / 100000).toFixed(1)}L`
          : `₹${Math.round(totalInvestment).toLocaleString("en-IN")}`;

  const statusColor = isValid
    ? "hsl(var(--wealth-green))"
    : overAllocated
      ? "hsl(var(--destructive))"
      : "hsl(var(--warning))";

  // Tagline + cash logic — compares totalInvestment to the user's current portfolio (or recommended baseline).
  const portfolioBase =
    portfolioDb && portfolioDb.total_value > 0 ? Math.round(portfolioDb.total_value) : recommendedTotal;
  const hasRealPortfolio = !!(portfolioDb && portfolioDb.total_value > 0);
  const totalVsBase = totalInvestment - portfolioBase;
  const invPctOfBase = portfolioBase > 0 ? (totalInvestment / portfolioBase) * 100 : 100;
  const uninvestedCash = Math.max(0, portfolioBase - totalInvestment);
  const uninvestedPct = portfolioBase > 0 ? Math.max(0, 100 - invPctOfBase) : 0;

  let totalTagline: string | null = null;
  if (hasRealPortfolio && totalInvestment > 0 && portfolioBase > 0) {
    if (Math.abs(totalVsBase) <= Math.max(100, portfolioBase * 0.001)) {
      totalTagline = "Fully rebalancing your existing portfolio. No cash held, no top-up required.";
    } else if (totalVsBase < 0) {
      const invPct = Math.round(invPctOfBase);
      const cashPct = 100 - invPct;
      totalTagline = `Investing ${invPct}% of your portfolio. The remaining ${cashPct}% (${formatINR(uninvestedCash)}) stays as uninvested cash.`;
    } else {
      totalTagline = `Adding ${formatINR(totalVsBase)} on top of your current portfolio to pursue higher long-term returns.`;
    }
  } else if (totalInvestment > 0 && recommendedTotal > 0 && totalInvestment !== recommendedTotal) {
    // No linked portfolio — give a light "vs recommended" hint.
    if (totalInvestment > recommendedTotal) {
      totalTagline = `${formatINR(totalInvestment - recommendedTotal)} above the recommended starting amount.`;
    } else {
      totalTagline = `${formatINR(recommendedTotal - totalInvestment)} below the recommended starting amount.`;
    }
  }

  const totalValidationError: string | null =
    totalInvestment > 0 && totalInvestment < MIN_TOTAL
      ? `Minimum ${formatINR(MIN_TOTAL)}`
      : totalInvestment > MAX_TOTAL
        ? `Maximum ${formatINR(MAX_TOTAL)}`
        : null;

  const isTotalModified = totalInvestment !== recommendedTotal;

  return (
    <div className="mobile-container bg-background min-h-screen pb-20">
      {/* Header */}
      <div className="px-5 pt-12 pb-1">
        <h1 className="text-xl font-bold text-foreground">Recommended investment plan</h1>
        {planLoading ? (
          <p className="text-xs text-muted-foreground mt-1">Loading your saved plan…</p>
        ) : null}
        <p className="text-sm text-foreground/80 mt-0.5">
          {portfolioDb && portfolioDb.total_value > 0
            ? `Your portfolio · ${formatINR(portfolioDb.total_value)}`
            : `Recommended portfolio · ${formatINR(totalInvestment)}`}
        </p>
        {recommendedPlanMeta && useAiPlan ? (
          <p className="text-xs text-muted-foreground mt-0.5">
            AI plan from{" "}
            {new Date(recommendedPlanMeta.effectiveAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            {recommendedPlanMeta.rebalancingId
              ? ` · Ref ${recommendedPlanMeta.rebalancingId.slice(0, 8)}…`
              : ""}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-0.5">
          {portfolioDb && portfolioDb.allocations.length > 0
            ? useAiPlan
              ? "AI recommended plan — adjust below to explore scenarios"
              : "Allocation from your linked account — adjust below to explore scenarios"
            : useAiPlan
              ? "Loaded from your latest Ask Tilly allocation"
              : "Built around your goals and risk profile"}
        </p>
      </div>

      <div className="pb-36">
        {/* Donut + Legend */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-5">
            <DonutChart data={donutData} centerLabel={donutCenterLabel} />
            <div className="flex-1 pt-2">
              <div className="grid grid-cols-1 gap-2">
                {donutData.map((d) => (
                  <div key={d.label} className="flex items-center gap-2.5">
                    <div className="h-[10px] w-[10px] rounded-[2px] shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-foreground flex-1 truncate">{d.label}</span>
                    <span className="text-xs font-bold text-foreground">{Math.round(d.value)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic portfolio summary paragraph */}
        <div className="px-5 mb-3">
          <div
            className="rounded-xl bg-secondary"
            style={{ padding: "10px 12px" }}
          >
            <p
              className="text-foreground/80"
              style={{ fontSize: "12.5px", lineHeight: "1.55" }}
            >
              {renderBoldText(summary)}
            </p>
          </div>
        </div>

        {/* Total investment — inline editable number with ₹ prefix + tagline */}
        <div
          className="mx-5 py-3"
          style={{ borderTop: "1px solid hsl(var(--hairline))", borderBottom: "1px solid hsl(var(--hairline))" }}
        >
          <div className="flex items-center justify-between gap-3">
            <span
              className="text-muted-foreground uppercase tracking-wide"
              style={{ fontSize: "10px", fontWeight: 500, letterSpacing: "1.2px" }}
            >
              Total investment
            </span>
            <label
              className="flex items-center gap-1 cursor-text transition-all"
              style={{
                borderBottom: totalFocused
                  ? "1px solid hsl(var(--accent))"
                  : "1px dashed rgba(107, 107, 107, 0.45)",
                backgroundColor: totalFocused ? "hsl(var(--muted) / 0.55)" : "transparent",
                padding: "2px 6px",
                borderRadius: 4,
              }}
            >
              <span
                className="text-foreground"
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "14px",
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                ₹
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={totalInvestment.toLocaleString("en-IN")}
                onFocus={(e) => {
                  setTotalFocused(true);
                  e.target.select();
                }}
                onBlur={() => setTotalFocused(false)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setTotalInvestment(Number(raw) || 0);
                }}
                className="bg-transparent text-right text-foreground focus:outline-none"
                aria-label="Total investment amount"
                style={{
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "14px",
                  fontWeight: 600,
                  width: "130px",
                  lineHeight: 1,
                }}
              />
              {!totalFocused && (
                <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
            </label>
          </div>

          {totalTagline && !totalValidationError && (
            <p
              className="mt-1.5"
              style={{ fontSize: "12px", color: "#6b6b6b", lineHeight: 1.45 }}
            >
              {totalTagline}
            </p>
          )}

          {totalValidationError && (
            <p className="mt-1.5" style={{ fontSize: "11.5px", color: "#c24c3a" }}>
              {totalValidationError}
            </p>
          )}

          {isTotalModified && (
            <button
              type="button"
              onClick={resetTotalToRecommended}
              className="mt-1 text-[11px] font-medium hover:underline"
              style={{ color: "hsl(var(--accent))" }}
            >
              Reset to recommended
            </button>
          )}
        </div>

        {/* Section heading */}
        <div className="px-5 pt-4 pb-2">
          <p
            className="text-muted-foreground uppercase"
            style={{ fontSize: "10px", fontWeight: 500, letterSpacing: "1.5px" }}
          >
            Your allocation · {etfList.length} ETFs
          </p>
        </div>

        {/* Unified ETF list — grouped by bucket */}
        <div className="px-5">
          {groupedBuckets.map((group, groupIdx) => (
            <div
              key={group.bucket}
              className={`rounded-[14px] overflow-hidden ${groupIdx > 0 ? "mt-3" : ""}`}
              style={{
                backgroundColor: BUCKET_TINT[group.bucket],
                padding: "10px 14px 4px",
              }}
            >
              <div className="flex items-baseline justify-between pb-1.5">
                <p
                  className="uppercase"
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "1.2px",
                    color: BUCKET_ACCENT[group.bucket],
                  }}
                >
                  {group.label}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    color: BUCKET_ACCENT[group.bucket],
                  }}
                >
                  {group.total}%
                </p>
              </div>
              {group.indices.map((i, idxInGroup) => {
                const etf = etfList[i];
                const pct = allocations[i] ?? 0;
                const rupee = Math.round((totalInvestment * pct) / 100);
                // Slider fill flows from the bucket accent so it's theme-aware
                // (category hex swatches from CAT_COLORS stay too dark on dark backgrounds).
                const catColor = BUCKET_ACCENT[group.bucket];
                const house = houseRecs[i] ?? etf.allocation ?? 0;
                const matchesHouse = pct === house;
                const fillPct = Math.min((pct / maxSliderPct) * 100, 100);
                const isLastInGroup = idxInGroup === group.indices.length - 1;

                return (
                  <div key={`${etf.name}-${i}`}>
                    <div className="py-3 px-1">
                      <div className="flex items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => setDetailIdx(i)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-[13px] font-semibold text-foreground leading-tight underline decoration-transparent hover:decoration-muted-foreground/40 underline-offset-4 transition-colors">
                                {etf.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                                {etf.description}
                              </p>
                            </button>
                            <div className="text-right shrink-0">
                              <p className="text-[13px] font-semibold text-foreground">{pct}%</p>
                              <p className="text-[11px] text-muted-foreground">{formatINR(rupee)}</p>
                            </div>
                            {etf.custom && (
                              <button
                                type="button"
                                onClick={() => removeCustomFund(i)}
                                className="shrink-0 p-1 -m-1 text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${etf.name}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                              {etf.category}
                            </span>
                            <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                              {etf.exchange}
                            </span>
                            {etf.custom ? (
                              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                Custom
                              </span>
                            ) : etf.houseRec ? (
                              <span
                                className="text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5"
                                style={{
                                  backgroundColor: `hsl(var(--bucket-${group.bucket}) / 0.14)`,
                                  color: `hsl(var(--bucket-${group.bucket}))`,
                                }}
                              >
                                <Check className="h-2.5 w-2.5" /> House rec.
                              </span>
                            ) : null}
                            {etf.customerPref && (
                              <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                Customer preference
                              </span>
                            )}
                          </div>

                          {/* Always-visible slider */}
                          <div className="relative h-6 flex items-center mt-3">
                            <div
                              className="absolute inset-x-0 h-2 rounded-full"
                              style={{ backgroundColor: TRACK_BG }}
                            />
                            <div
                              className="absolute left-0 h-2 rounded-full transition-all"
                              style={{ width: `${fillPct}%`, backgroundColor: catColor }}
                            />
                            {!etf.custom && (
                              <div
                                className="absolute h-4 w-0.5 rounded-full z-10"
                                style={{
                                  left: `${(house / maxSliderPct) * 100}%`,
                                  transform: "translateX(-50%)",
                                  backgroundColor: "hsl(var(--muted-foreground))",
                                }}
                                title={`House: ${house}%`}
                              />
                            )}
                            <input
                              type="range"
                              min={0}
                              max={maxSliderPct}
                              value={pct}
                              onChange={(e) => updateAllocation(i, Number(e.target.value))}
                              className="alloc-slider absolute inset-x-0 h-6 w-full appearance-none bg-transparent cursor-pointer z-20
                                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-sm
                                [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:bg-card"
                              style={{ "--slider-fill": catColor } as React.CSSProperties}
                            />
                          </div>

                          {/* Input row: [ ✓ House chip (if not custom) ] … [ % ] [ ₹ ] */}
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            {!etf.custom && (
                              <button
                                type="button"
                                onClick={() => resetSingleToHouse(i)}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 mr-auto"
                                style={{
                                  minHeight: 28,
                                  backgroundColor: matchesHouse
                                    ? "hsl(var(--wealth-green) / 0.18)"
                                    : `hsl(var(--bucket-${group.bucket}) / 0.12)`,
                                  color: matchesHouse
                                    ? "hsl(var(--wealth-green))"
                                    : `hsl(var(--bucket-${group.bucket}))`,
                                  fontSize: "11px",
                                  fontWeight: 600,
                                }}
                              >
                                {matchesHouse && <Check className="h-3 w-3" />}
                                House: {house}%
                              </button>
                            )}
                            {etf.custom && <div className="mr-auto" />}
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={pct}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10);
                                  updateAllocation(i, isNaN(v) ? 0 : v);
                                }}
                                className="border border-border rounded-md bg-card text-right text-foreground px-1.5 py-1"
                                style={{
                                  width: "52px",
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                  fontSize: "13px",
                                }}
                              />
                              <span className="text-muted-foreground" style={{ fontSize: "11px" }}>%</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatINRNoSymbol(rupee)}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, "");
                                  updateFromRupee(i, Number(raw) || 0);
                                }}
                                className="border border-border rounded-md bg-card text-right text-foreground px-1.5 py-1"
                                style={{
                                  width: "90px",
                                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                                  fontSize: "13px",
                                }}
                              />
                              <span className="text-muted-foreground" style={{ fontSize: "11px" }}>₹</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Hairline between cards */}
                    {!isLastInGroup && (
                      <div style={{ height: 1, backgroundColor: "hsl(var(--hairline))" }} />
                    )}
                  </div>
                );
              })}

              {/* Add fund — inline search or ghost button */}
              {searchBucket === group.bucket ? (
                <div className="mt-2 pb-1">
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder={`Search ${group.label.toLowerCase()} funds…`}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 bg-transparent text-foreground focus:outline-none"
                      style={{ fontSize: "13px" }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSearchBucket(null);
                        setSearchQuery("");
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {(() => {
                    const results = universeByBucket(group.bucket);
                    if (results.length === 0) {
                      return (
                        <p className="text-[11px] text-muted-foreground text-center mt-2 py-2">
                          No matching funds. Try a different search.
                        </p>
                      );
                    }
                    return (
                      <div
                        className="mt-2 rounded-lg bg-card overflow-y-auto"
                        style={{ maxHeight: "18rem", border: "1px solid hsl(var(--border))" }}
                      >
                        {results.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => addCustomFund(f)}
                            className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/60 transition-colors"
                            style={{ borderBottom: "1px solid hsl(var(--border) / 0.4)" }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[12.5px] font-medium text-foreground truncate">
                                {f.name}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {f.description}
                              </p>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-0.5">
                              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">
                                {f.category}
                              </span>
                              <span
                                className="text-[10px] text-muted-foreground"
                                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                              >
                                ER {f.expenseRatio}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setSearchBucket(group.bucket);
                    setSearchQuery("");
                  }}
                  className="w-full mt-1 py-2 flex items-center justify-center gap-1 rounded-lg text-[12px] font-medium hover:bg-card/40 transition-colors"
                  style={{ color: BUCKET_ACCENT[group.bucket], minHeight: 36 }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add fund
                </button>
              )}
            </div>
          ))}

          {/* Uninvested cash row — shown only when user chose to invest less than their portfolio value */}
          {uninvestedCash > 0 && hasRealPortfolio && (
            <div
              className="mt-3 flex items-center justify-between py-3 px-3 rounded-[14px]"
              style={{ backgroundColor: "hsl(var(--muted) / 0.4)", opacity: 0.85 }}
            >
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-foreground">Uninvested cash</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Held as a buffer — not allocated to funds</p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className="text-[13px] font-semibold text-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {formatINR(uninvestedCash)}
                </p>
                <p className="text-[10px] text-muted-foreground">{Math.round(uninvestedPct)}%</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer bar — sticky bottom */}
      <div
        className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,8px))] left-0 right-0 z-30 border-t border-border bg-card"
      >
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-foreground">
              Allocated:{" "}
              <span
                className="font-bold"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: statusColor }}
              >
                {totalAlloc}%
              </span>
            </span>
            <span className="ml-1.5" style={{ fontSize: "11px", color: statusColor }}>
              {isValid
                ? "✓ fully allocated"
                : overAllocated
                  ? `${totalAlloc - 100}% over`
                  : `${100 - totalAlloc}% remaining`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={resetToHouse}
              className="text-xs font-medium hover:underline flex items-center gap-1"
              style={{ color: LINK_COLOR, fontSize: "11px", minHeight: 28 }}
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              disabled={!isValid}
              onClick={() => {
                if (!isValid) return;
              }}
              className="rounded-full text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: CTA_BG, color: CTA_FG, height: "36px", padding: "0 16px" }}
            >
              Confirm & invest <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!isValid && (
          <div className="max-w-md mx-auto px-4 pb-2">
            <button
              type="button"
              onClick={rebalanceRemaining}
              className="inline-flex items-center gap-1 font-medium"
              style={{ fontSize: "11px", color: LINK_COLOR }}
            >
              <RotateCcw className="h-3 w-3" /> Rebalance remaining
            </button>
          </div>
        )}
      </div>

      {/* Fund detail drawer */}
      <AnimatePresence>
        {detailIdx !== null && etfList[detailIdx] && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm"
              onClick={() => setDetailIdx(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.35 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) setDetailIdx(null);
              }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl bg-card shadow-xl"
              style={{ maxHeight: "88dvh", display: "flex", flexDirection: "column" }}
            >
              {(() => {
                const etf = etfList[detailIdx];
                const stars = deriveStars(etf);
                const risk = deriveRisk(etf);
                const riskStyles: Record<
                  "Low" | "Moderate" | "High",
                  { bg: string; fg: string }
                > = {
                  Low: { bg: "#E8F5EE", fg: "#0f8a5f" },
                  Moderate: { bg: "#FEF3E4", fg: "#b8860b" },
                  High: { bg: "#FDE9E4", fg: "#c24c3a" },
                };
                const amc = deriveAMCFromName(etf.name);
                const benchmark = deriveBenchmark(etf);
                const aum = deriveAUM(etf);
                const nav = deriveNAV(etf);
                const series = buildReturnSeries(etf);

                return (
                  <>
                    {/* Drag handle + close */}
                    <div className="flex items-center justify-between px-4 pt-3">
                      <div className="flex-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setDetailIdx(null)}
                          className="h-1.5 w-10 rounded-full bg-border hover:bg-muted-foreground/30 transition-colors"
                          aria-label="Close drawer"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailIdx(null)}
                        className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                        aria-label="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="overflow-y-auto px-5 pt-2" style={{ flex: 1 }}>
                      {/* Title block */}
                      <h3 className="text-base font-bold text-foreground leading-tight">
                        {etf.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {amc} · {etf.category} · Benchmark: {benchmark}
                      </p>

                      {/* Risk + stars */}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: riskStyles[risk].bg,
                            color: riskStyles[risk].fg,
                          }}
                        >
                          Risk · {risk}
                        </span>
                        <div className="inline-flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className="h-3 w-3"
                              style={{
                                color: n <= stars ? "#D4AF70" : "#E0E0E0",
                                fill: n <= stars ? "#D4AF70" : "transparent",
                              }}
                            />
                          ))}
                          <span className="text-[10px] text-muted-foreground ml-1">
                            {stars}.0
                          </span>
                        </div>
                      </div>

                      {/* Performance chart */}
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-5 mb-2">
                        Performance vs benchmark
                      </p>
                      <div style={{ height: 150, width: "100%" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={series} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid stroke="hsl(var(--hairline))" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 10, fill: "#9a9a9a" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 10, fill: "#9a9a9a" }}
                              tickFormatter={(v) => `${v}%`}
                              axisLine={false}
                              tickLine={false}
                              width={32}
                            />
                            <RTooltip
                              contentStyle={{
                                fontSize: 11,
                                borderRadius: 8,
                                border: "1px solid hsl(var(--hairline))",
                              }}
                              formatter={(v: number) => `${v}%`}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                            <Line
                              type="monotone"
                              dataKey="fund"
                              name={etf.shortName}
                              stroke="#0f8a5f"
                              strokeWidth={2}
                              dot={{ r: 3 }}
                              isAnimationActive={false}
                            />
                            <Line
                              type="monotone"
                              dataKey="benchmark"
                              name="Benchmark"
                              stroke="#b8b8b8"
                              strokeWidth={1.75}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Key stats row */}
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mt-4 mb-2">
                        Key stats
                      </p>
                      <div className="grid grid-cols-2 gap-y-2.5 gap-x-4">
                        {[
                          { label: "Expense ratio", value: etf.expenseRatio },
                          { label: "AUM", value: aum },
                          { label: "NAV", value: nav },
                          { label: "1Y return", value: etf.returns1Y },
                          { label: "3Y CAGR", value: etf.returns2Y },
                        ].map((s) => (
                          <div key={s.label}>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                              {s.label}
                            </p>
                            <p className="text-[13px] font-semibold text-foreground">
                              {s.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Why this fund? */}
                      <div className="rounded-xl bg-[#1B3A6B]/5 border border-[#1B3A6B]/10 p-3.5 mt-4">
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                          Why this fund?
                        </p>
                        <p className="text-[12.5px] text-foreground/80 leading-relaxed">
                          {rationaleFor(etf)}
                        </p>
                      </div>

                      <p className="text-[9px] text-muted-foreground/60 mt-3 text-center">
                        Past performance is not indicative of future returns
                      </p>
                    </div>

                    {/* Actions */}
                    <div
                      className="px-4 py-3 flex items-center gap-2"
                      style={{ borderTop: "1px solid hsl(var(--hairline))" }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setDetailIdx(null);
                          setSearchBucket(categoryToBucket(etf.category));
                          setSearchQuery("");
                        }}
                        className="flex-1 rounded-full border border-border py-2 text-[13px] font-semibold text-foreground"
                      >
                        Replace fund
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailIdx(null)}
                        className="flex-1 rounded-full text-[13px] font-semibold"
                        style={{ backgroundColor: CTA_BG, color: CTA_FG, padding: "8px 16px" }}
                      >
                        Done
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* FAB + Tilly pill */}
      {(
        <div className="fixed bottom-[156px] right-5 z-40 flex flex-col items-center">
          <AnimatePresence>
            {showTillyPill && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: [0, -4, 0] }}
                exit={{ opacity: 0, y: 4 }}
                transition={{
                  opacity: { duration: 0.4, ease: "easeOut" },
                  y: { duration: 2.5, ease: "easeInOut", repeat: Infinity },
                }}
                className="mb-1 flex flex-col items-center"
              >
                <span style={{ background: "rgba(184, 134, 11, 0.70)", color: "#ffffff", fontSize: "12px", fontWeight: 600, padding: "6px 14px", borderRadius: "99px", whiteSpace: "nowrap" }}>
                  💬 Speak to Tilly
                </span>
                <div style={{ width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid #B8860B", marginTop: "-1px" }} />
              </motion.div>
            )}
          </AnimatePresence>
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={() => navigate("/chat?from=execute")}
            className="flex h-14 w-14 items-center justify-center rounded-full wealth-gradient text-primary-foreground"
            style={{ boxShadow: "0 4px 24px -4px hsl(var(--wealth-navy) / 0.5)" }}
          >
            <Mic className="h-5 w-5" />
          </motion.button>
        </div>
      )}
      <BottomNav />
    </div>
  );
};

export default Execute;
