import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, RotateCcw, AlertTriangle, Mic } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  getMyPortfolio,
  getRecommendedPlan,
  type AggregatedSubgroupRow,
  type GoalAllocationOutput,
  type PortfolioDetail,
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
  returns1Y: string;
  returns2Y: string;
  returns3Y: string;
  expenseRatio: string;
  exitLoad: string;
  minInvestment: string;
}

const TOTAL = 8300000;

/* Category colors — private bank palette */
const CAT_COLORS: Record<string, string> = {
  "India Equity": "#1B3A6B",
  "US Equity": "#4A7FA5",
  "Bonds": "#8BA7BC",
  "Sectoral": "#C4B99A",
  "Gold": "#D4AF70",
};

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
const TILLY_RATIONALE: Record<string, string> = {
  "Nifty 50 ETF (Nippon)": "A core holding for any long-term Indian investor. Low cost, highly liquid, and tracks the 50 largest companies in India. Ideal as the foundation of your portfolio given your long-term horizon.",
  "Nifty Next 50 ETF (ICICI)": "Bridges large and mid-cap exposure. Historically outperforms Nifty 50 over 7+ year periods with moderate additional volatility. Suits your growth objective.",
  "Nifty Midcap 150 ETF (Motilal)": "Higher growth potential with increased short-term volatility. Recommended at 10% to add upside without overconcentrating in mid-cap risk.",
  "S&P 500 ETF (Mirae)": "Added at 5% based on your preference for US exposure. Provides geographic diversification and access to global technology leaders outside India.",
  "Bharat Bond ETF (2032)": "AAA-rated PSU bonds providing stability and predictable returns. Anchors the portfolio against equity volatility. The 2032 maturity aligns with a medium-to-long investment window.",
  "Nifty PSU Bank ETF (SBI)": "Tactical exposure to Indian public sector banks, which trade at a discount to private peers. Included for value upside as the rate cycle turns.",
  "Gold ETF (HDFC)": "Gold acts as a hedge against inflation and currency depreciation. A 7% allocation is within the classical 5–10% range advised for balanced portfolios.",
  "Nifty IT ETF (Kotak)": "India's IT sector offers export-linked dollar revenues. Included for diversification against domestic macro risk and long-term structural growth.",
};

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

/* ── Blue ramp helpers (for allocation section) ── */
const PALE_BLUE = "#E8F0FE";
const MID_BLUE = "#A8C4E8";
const NAVY = "#1A3A6B";
const LIGHT_BADGE = "#C5D8F5";

function lerpColor(a: string, b: string, t: number): string {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const ca = parse(a);
  const cb = parse(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function sliderFillColor(pct: number): string {
  const t = Math.min(pct / 30, 1);
  return lerpColor(MID_BLUE, NAVY, t);
}

/* ── Portfolio Summary Generator ── */
function generateSummary(allocations: number[]): string {
  const equity = allocations[0] + allocations[1] + allocations[2];
  const intl = allocations[3];
  const debt = allocations[4];
  const sectoral = allocations[5] + allocations[7];
  const gold = allocations[6];

  let profile = "balanced";
  if (equity + intl > 65) profile = "aggressive";
  else if (equity + intl < 40) profile = "conservative";

  const parts: string[] = [];
  parts.push(`Your portfolio leans **${profile}** with **${equity + intl}% in equities** (including ${intl}% international via S&P 500).`);
  if (equity > 40) {
    parts.push(`Domestic equity is concentrated at **${equity}%**, led by large-cap Nifty 50 at **${allocations[0]}%**.`);
  } else {
    parts.push(`Domestic equity sits at **${equity}%**, providing measured market exposure.`);
  }
  parts.push(`Debt anchors stability at **${debt}%** via Bharat Bond.`);
  if (gold > 0 || sectoral > 0) {
    const extras: string[] = [];
    if (gold > 0) extras.push(`gold (${gold}%)`);
    if (sectoral > 0) extras.push(`sectoral bets (${sectoral}%)`);
    parts.push(`Diversifiers include ${extras.join(" and ")}.`);
  }
  return parts.join(" ");
}

type AssetBucket = "equity" | "debt" | "others";

function goalOutputToETFsAndBuckets(out: GoalAllocationOutput): {
  etfs: ETF[];
  buckets: AssetBucket[];
  houseRecs: number[];
} | null {
  const rows = (out.aggregated_subgroups ?? []).filter(
    (r): r is AggregatedSubgroupRow & {
      fund_mapping: NonNullable<AggregatedSubgroupRow["fund_mapping"]>;
    } => r.fund_mapping != null,
  );
  if (rows.length === 0) return null;
  const grandTotal = out.grand_total || rows.reduce((s, r) => s + r.total, 0);
  if (grandTotal <= 0) return null;

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

  const etfs: ETF[] = rows.map((row, i) => {
    const fund = row.fund_mapping.recommended_fund;
    return {
      name: fund,
      shortName: fund.length > 22 ? `${fund.slice(0, 20)}…` : fund,
      description: row.fund_mapping.sub_category || row.fund_mapping.asset_class,
      allocation: Math.round((row.total / grandTotal) * 100),
      amount: 0,
      category: row.fund_mapping.sub_category || row.fund_mapping.asset_class,
      color: ROW_COLORS[i % ROW_COLORS.length],
      exchange: "—",
      houseRec: true,
      returns1Y: "—",
      returns2Y: "—",
      returns3Y: "—",
      expenseRatio: "—",
      exitLoad: "—",
      minInvestment: "—",
    };
  });

  return {
    etfs,
    buckets: rows.map((r) => r.fund_mapping.asset_class as AssetBucket),
    houseRecs: etfs.map((e) => e.allocation),
  };
}

function generateAiSummary(
  out: GoalAllocationOutput,
  allocations: number[],
  buckets: AssetBucket[],
): string {
  let eq = 0;
  let debt = 0;
  let oth = 0;
  allocations.forEach((a, i) => {
    const b = buckets[i];
    if (b === "equity") eq += a;
    else if (b === "debt") debt += a;
    else oth += a;
  });
  const cs = out.client_summary;
  const parts: string[] = [];
  if (cs) {
    const goalCount = cs.goals?.length ?? 0;
    const goalNames = (cs.goals ?? []).slice(0, 3).map((g) => g.goal_name);
    const goalList = goalNames.length > 0 ? `: ${goalNames.join(", ")}` : "";
    parts.push(
      `Plan from your latest AI session — risk score **${cs.effective_risk_score.toFixed(
        1,
      )}**, corpus **₹${cs.total_corpus.toLocaleString()}** across **${goalCount} goal${
        goalCount === 1 ? "" : "s"
      }**${goalList}.`,
    );
  }
  parts.push(`Your sliders show **equity ${eq}%**, **debt ${debt}%**, **others ${oth}%**.`);
  return parts.join(" ");
}

function donutFromAiBuckets(
  allocations: number[],
  buckets: AssetBucket[]
): { label: string; value: number; color: string }[] {
  let eq = 0;
  let debt = 0;
  let oth = 0;
  allocations.forEach((a, i) => {
    const b = buckets[i];
    if (b === "equity") eq += a;
    else if (b === "debt") debt += a;
    else oth += a;
  });
  return [
    { label: "Equity", value: eq, color: CAT_COLORS["India Equity"] },
    { label: "Debt", value: debt, color: CAT_COLORS["Bonds"] },
    { label: "Others", value: oth, color: CAT_COLORS["Gold"] },
  ].filter((d) => d.value > 0);
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

/* ── Delta Badge ── */
function DeltaBadge({ current, rec }: { current: number; rec: number }) {
  const delta = current - rec;
  const absDelta = Math.abs(delta);
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const label = `${sign}${absDelta}%`;

  let bg: string;
  let color: string;

  if (absDelta <= 1) {
    bg = PALE_BLUE; color = NAVY;
  } else if (delta > 0) {
    bg = NAVY; color = "#FFFFFF";
  } else {
    bg = LIGHT_BADGE; color = NAVY;
  }

  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-2 py-0.5"
      style={{
        backgroundColor: bg, color,
        fontSize: "11px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontWeight: 600, minWidth: "40px",
      }}
    >
      {label}
    </span>
  );
}

/* ── Asset definitions for allocation section ── */
interface AllocAsset {
  name: string;
  shortName: string;
  houseRec: number;
}

const ALLOC_ASSETS: AllocAsset[] = [
  { name: "Nifty 50", shortName: "Nifty 50", houseRec: 30 },
  { name: "Next 50", shortName: "Next 50", houseRec: 15 },
  { name: "Midcap 150", shortName: "Midcap 150", houseRec: 10 },
  { name: "S&P 500", shortName: "S&P 500", houseRec: 5 },
  { name: "Bharat Bond", shortName: "Bharat Bond", houseRec: 20 },
  { name: "PSU Bank", shortName: "PSU Bank", houseRec: 8 },
  { name: "Gold", shortName: "Gold", houseRec: 7 },
  { name: "IT ETF", shortName: "IT ETF", houseRec: 5 },
];

const houseDefaults = ALLOC_ASSETS.map((a) => a.houseRec);

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
  const [goalPlanOutput, setGoalPlanOutput] = useState<GoalAllocationOutput | null>(null);
  const [aiBuckets, setAiBuckets] = useState<AssetBucket[]>([]);
  const [aiHouseRec, setAiHouseRec] = useState<number[]>([]);
  const [recommendedPlanMeta, setRecommendedPlanMeta] = useState<{
    effectiveAt: string;
    rebalancingId: string | null;
  } | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  const [allocations, setAllocations] = useState<number[]>([...houseDefaults]);
  const [totalInvestment, setTotalInvestment] = useState<number>(TOTAL);
  const [portfolioDb, setPortfolioDb] = useState<PortfolioDetail | null>(null);
  const [selectedETF, setSelectedETF] = useState<number | null>(null);
  const [showTillyPill, setShowTillyPill] = useState(true);

  const etfList = useMemo(() => {
    if (useAiPlan && goalPlanOutput) {
      const built = goalOutputToETFsAndBuckets(goalPlanOutput);
      if (built?.etfs.length) return built.etfs;
    }
    return defaultETFs;
  }, [useAiPlan, goalPlanOutput]);

  const allocAssetsForSliders = useMemo(() => {
    if (useAiPlan && etfList.length > 0) {
      return etfList.map((e, i) => ({
        name: e.name,
        shortName: e.shortName,
        houseRec: aiHouseRec[i] ?? e.allocation ?? 0,
      }));
    }
    return ALLOC_ASSETS;
  }, [useAiPlan, etfList, aiHouseRec]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getMyPortfolio();
        if (!cancelled) {
          setPortfolioDb(p);
          if (p.total_value > 0) setTotalInvestment(Math.round(p.total_value));
        }
      } catch {
        if (!cancelled) setPortfolioDb(null);
      }
      try {
        const rec = await getRecommendedPlan();
        if (cancelled) return;
        const out = rec.snapshot?.allocation?.goal_allocation_output;
        const built = out ? goalOutputToETFsAndBuckets(out) : null;
        if (out && built?.houseRecs.length) {
          setGoalPlanOutput(out);
          setUseAiPlan(true);
          setAiBuckets(built.buckets);
          setAiHouseRec(built.houseRecs);
          setAllocations([...built.houseRecs]);
          setRecommendedPlanMeta({
            effectiveAt: rec.snapshot!.effective_at,
            rebalancingId: rec.latest_rebalancing_id,
          });
          if (typeof out.grand_total === "number" && out.grand_total > 0) {
            setTotalInvestment(Math.round(out.grand_total));
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
  const maxSliderPct = useAiPlan ? 100 : 50;

  const summary = useMemo(() => {
    if (useAiPlan && goalPlanOutput && aiBuckets.length > 0 && aiBuckets.length === allocations.length) {
      return generateAiSummary(goalPlanOutput, allocations, aiBuckets);
    }
    return generateSummary(allocations);
  }, [useAiPlan, goalPlanOutput, aiBuckets, allocations]);

  const updateAllocation = useCallback(
    (idx: number, val: number) => {
      setAllocations((prev) => {
        const next = [...prev];
        next[idx] = Math.max(0, Math.min(maxSliderPct, val));
        return next;
      });
    },
    [maxSliderPct]
  );

  const updateFromRupee = useCallback(
    (idx: number, rupeeVal: number) => {
      if (totalInvestment <= 0) return;
      const pct = Math.round((rupeeVal / totalInvestment) * 100);
      updateAllocation(idx, pct);
    },
    [totalInvestment, updateAllocation]
  );

  const resetToHouse = useCallback(() => {
    if (useAiPlan && aiHouseRec.length > 0) setAllocations([...aiHouseRec]);
    else setAllocations([...houseDefaults]);
  }, [useAiPlan, aiHouseRec]);

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
    if (
      useAiPlan &&
      allocations.length > 0 &&
      aiBuckets.length === allocations.length &&
      aiBuckets.length > 0
    ) {
      return donutFromAiBuckets(allocations, aiBuckets);
    }
    if (portfolioDb && portfolioDb.allocations.length > 0 && !useAiPlan) {
      return portfolioToDonutData(portfolioDb);
    }
    return donutFromSliders;
  }, [useAiPlan, allocations, aiBuckets, portfolioDb, donutFromSliders]);

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

  const activeETF = selectedETF !== null ? etfList[selectedETF] : null;

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
        <div className="px-5 py-6">
          <div className="flex items-start gap-5">
            <DonutChart data={donutData} centerLabel={donutCenterLabel} />
            <div className="flex-1 pt-2">
              <div className="grid grid-cols-1 gap-2">
                {donutData.map((d) => (
                  <div key={d.label} className="flex items-center gap-2.5">
                    <div className="h-[10px] w-[10px] rounded-[2px] shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-foreground flex-1 truncate">{d.label}</span>
                    <span className="text-xs font-bold text-foreground">{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ETF Cards */}
        <div className="px-5 mb-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            {useAiPlan ? "Your AI-recommended funds" : "Recommended ETF Allocation"}
          </p>
          <div className="space-y-2.5">
            {etfList.map((etf, i) => (
              <motion.button
                key={`${etf.name}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedETF(i)}
                className="w-full rounded-2xl bg-card border border-border p-4 text-left transition-all hover:shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-9 w-1.5 rounded-full shrink-0" style={{ backgroundColor: etf.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-foreground leading-tight">{etf.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{etf.description}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-sm font-bold text-foreground">{allocations[i]}%</p>
                        <p className="text-[11px] text-muted-foreground">{formatINR(totalInvestment * allocations[i] / 100)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{etf.category}</span>
                      <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{etf.exchange}</span>
                      {etf.houseRec && (
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" /> House rec.
                        </span>
                      )}
                      {etf.customerPref && (
                        <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Customer preference
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Allocation Section */}
        <div className="px-5 mb-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Adjust your allocation</p>
          <p className="text-[11px] text-muted-foreground mb-4">Drag sliders or edit values · House recommendation shown as tick</p>
        </div>

        {/* Portfolio Summary Card — sticky */}
        <div className="sticky top-0 z-20 px-5 pt-1 pb-3" style={{ backgroundColor: "hsl(var(--background))" }}>
          <div className="p-4 rounded-xl" style={{ backgroundColor: "#F5F5F5" }}>
            <p className="text-xs leading-relaxed text-foreground/80" style={{ fontSize: "12px", lineHeight: "1.6" }}>
              {renderBoldText(summary)}
            </p>
          </div>
        </div>

        {/* Total Investment Input */}
        <div className="px-5 mb-4">
          <div className="flex items-center justify-between">
            <label className="text-muted-foreground" style={{ fontSize: "11px" }}>Total investment (₹)</label>
            <input
              type="text"
              inputMode="numeric"
              value={totalInvestment.toLocaleString("en-IN")}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setTotalInvestment(Number(raw) || 0);
              }}
              className="border border-border rounded-lg bg-card px-3 py-2 text-right text-foreground"
              style={{ width: "160px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "14px" }}
            />
          </div>
        </div>

        {/* Asset Allocation Cards */}
        <div className="px-5 space-y-2.5">
          {allocAssetsForSliders.map((asset, i) => {
            const pct = allocations[i] ?? 0;
            const rupee = Math.round((totalInvestment * pct) / 100);
            const fillColor = sliderFillColor(pct);
            const fillPct = (pct / maxSliderPct) * 100;

            return (
              <div
                key={`${asset.shortName}-${i}`}
                className="bg-card rounded-xl"
                style={{ border: "0.5px solid hsl(var(--border))", padding: "14px 16px" }}
              >
                {/* Top row */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="text-foreground font-medium flex-shrink-0" style={{ fontSize: "14px" }}>{asset.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1">
                      <input
                        type="text" inputMode="numeric" value={pct}
                        onChange={(e) => { const v = parseInt(e.target.value.replace(/[^0-9]/g, ""), 10); updateAllocation(i, isNaN(v) ? 0 : v); }}
                        className="border border-border rounded-md bg-card text-right text-foreground px-1.5 py-1"
                        style={{ width: "48px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px" }}
                      />
                      <span className="text-muted-foreground" style={{ fontSize: "11px" }}>%</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="text" inputMode="numeric" value={formatINRNoSymbol(rupee)}
                        onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ""); updateFromRupee(i, Number(raw) || 0); }}
                        className="border border-border rounded-md bg-card text-right text-foreground px-1.5 py-1"
                        style={{ width: "80px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "13px" }}
                      />
                      <span className="text-muted-foreground" style={{ fontSize: "11px" }}>₹</span>
                    </div>
                    <DeltaBadge current={pct} rec={asset.houseRec} />
                  </div>
                </div>

                {/* Slider row */}
                <div className="relative h-6 flex items-center">
                  <div className="absolute inset-x-0 h-2 rounded-full" style={{ backgroundColor: PALE_BLUE }} />
                  <div className="absolute left-0 h-2 rounded-full transition-all" style={{ width: `${fillPct}%`, backgroundColor: fillColor }} />
                  <div
                    className="absolute h-4 w-0.5 rounded-full z-10"
                    style={{
                      left: `${(asset.houseRec / maxSliderPct) * 100}%`,
                      transform: "translateX(-50%)",
                      backgroundColor: "#9CA3AF",
                    }}
                    title={`Rec: ${asset.houseRec}%`}
                  />
                  <input
                    type="range"
                    min={0}
                    max={maxSliderPct}
                    value={pct}
                    onChange={(e) => updateAllocation(i, Number(e.target.value))}
                    className="alloc-slider absolute inset-x-0 h-6 w-full appearance-none bg-transparent cursor-pointer z-20
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:shadow-sm
                      [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:bg-card"
                    style={{ "--slider-fill": fillColor } as React.CSSProperties}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer bar — sticky bottom */}
      <div
        className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,8px))] left-0 right-0 z-30 border-t border-border"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-foreground">
              Allocated:{" "}
              <span className="font-bold" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: isValid ? NAVY : undefined }}>
                {totalAlloc}%
              </span>
            </span>
            <span className="ml-1.5" style={{ fontSize: "11px" }}>
              {isValid ? (
                <span style={{ color: NAVY }} className="font-medium">✓ fully allocated</span>
              ) : totalAlloc > 100 ? (
                <span className="text-muted-foreground">{totalAlloc - 100}pt% over</span>
              ) : (
                <span className="text-muted-foreground">{100 - totalAlloc}% remaining</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={resetToHouse} className="text-xs font-medium hover:underline flex items-center gap-1" style={{ color: NAVY, fontSize: "11px" }}>
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
            <button
              disabled={!isValid}
              onClick={() => { if (!isValid) return; }}
              className="rounded-full text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: NAVY, color: "#FFFFFF", height: "36px", padding: "0 16px" }}
            >
              Confirm & invest <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!isValid && (
          <div className="max-w-md mx-auto px-4 pb-2">
            <span className="flex items-center gap-1 text-destructive" style={{ fontSize: "11px" }}>
              <AlertTriangle className="h-3 w-3" /> Total must equal 100% to proceed
            </span>
          </div>
        )}
      </div>

      {/* Bottom Sheet */}
      <AnimatePresence>
        {activeETF && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 backdrop-blur-sm"
            onClick={() => setSelectedETF(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-2xl bg-card shadow-xl p-5 pb-8"
            >
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => setSelectedETF(null)}
                  className="h-1.5 w-10 rounded-full bg-border cursor-pointer hover:bg-muted-foreground/30 transition-colors"
                />
              </div>
              <div className="mb-4">
                <h3 className="text-base font-bold text-foreground mb-1">{activeETF.name}</h3>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: activeETF.color }}
                >
                  {activeETF.category}
                </span>
              </div>
              <div className="rounded-xl bg-[#1B3A6B]/5 border border-[#1B3A6B]/10 p-3.5 mb-5">
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Tilly's view</p>
                <p className="text-xs text-foreground/80 leading-relaxed">
                  {TILLY_RATIONALE[activeETF.name] ||
                    (useAiPlan
                      ? "Recommended in your personalised allocation plan from Ask Tilly."
                      : "Recommended based on your risk profile and investment goals.")}
                </p>
              </div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Performance</p>
              <div className="space-y-0">
                {[
                  { label: "1 Year return", value: activeETF.returns1Y },
                  { label: "2 Year return (CAGR)", value: activeETF.returns2Y },
                  { label: "3 Year return (CAGR)", value: activeETF.returns3Y },
                ].map((r, idx) => (
                  <div key={r.label} className={`flex items-center justify-between py-2.5 ${idx < 2 ? "border-b border-border/30" : ""}`}>
                    <span className="text-xs text-muted-foreground">{r.label}</span>
                    <span className="text-sm font-bold text-[hsl(var(--wealth-green))]">{r.value}</span>
                  </div>
                ))}
              </div>
              <div className="h-px bg-border/60 my-4" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Fees & Charges</p>
              <div className="space-y-0">
                {[
                  { label: "Expense ratio", value: activeETF.expenseRatio },
                  { label: "Exit load", value: activeETF.exitLoad },
                  { label: "Minimum investment", value: activeETF.minInvestment },
                ].map((r, idx) => (
                  <div key={r.label} className={`flex items-center justify-between py-2.5 ${idx < 2 ? "border-b border-border/30" : ""}`}>
                    <span className="text-xs text-muted-foreground">{r.label}</span>
                    <span className="text-xs font-semibold text-foreground">{r.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[9px] text-muted-foreground/60 mt-3 text-center">Past performance is not indicative of future returns</p>
            </motion.div>
          </motion.div>
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
