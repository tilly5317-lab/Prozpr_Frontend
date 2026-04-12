import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ArrowRight,
  ArrowLeft,
  X,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  listDiscoveryFunds,
  listDiscoveryHouseView,
  listDiscoverySectors,
  listDiscoveryTrending,
  type DiscoveryFund,
  type DiscoverySector,
} from "@/lib/api";

const PLAN_READY_POPUP_SESSION_KEY = "tilly_discover_plan_ready_popup";

export interface DiscoverScreenProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
  /** Inline glowing card above House View (asktilly_ref Discovery). */
  showRecommendedPlanCard?: boolean;
  onRecommendedPlanClick?: () => void;
  /** Inline “Start Investing” at end of scroll (e.g. /execute) */
  onStartInvesting?: () => void;
  onInvestNow?: () => void;
  primaryCtaLabel?: string;
  /** One-time-per-session modal: “plan is ready → Invest now” (Discover tab). */
  showPlanReadyPopup?: boolean;
}

/* ── Sparkline SVGs — unique per sector ── */
const sparklines: Record<string, string> = {
  Technology: "0,18 8,14 16,16 24,8 32,10 40,2",
  Healthcare: "0,16 8,18 16,12 24,14 32,8 40,6",
  "Banking & Finance": "0,20 8,16 16,18 24,10 32,6 40,4",
  Energy: "0,14 8,18 16,10 24,12 32,6 40,2",
  "Consumer Goods": "0,18 8,20 16,16 24,14 32,10 40,8",
  Infrastructure: "0,20 8,16 16,14 24,12 32,8 40,6",
  FMCG: "0,18 8,16 16,20 24,14 32,10 40,8",
  Auto: "0,20 8,14 16,16 24,10 32,8 40,4",
};

/* ── Sector icon SVG paths ── */
const SectorIcon = ({ sector }: { sector: string }) => {
  const icons: Record<string, React.ReactNode> = {
    Technology: (
      <path
        d="M4 6h16v10H4zM8 20h8M12 16v4"
        strokeWidth="1.5"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    Healthcare: (
      <>
        <path d="M12 4v16M4 12h16" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" />
        <rect x="8" y="8" width="8" height="8" rx="1" strokeWidth="1.5" stroke="currentColor" fill="none" />
      </>
    ),
    "Banking & Finance": (
      <>
        <path
          d="M3 21h18M5 21V10l7-6 7 6v11"
          strokeWidth="1.5"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="9" y="14" width="6" height="7" strokeWidth="1.5" stroke="currentColor" fill="none" />
      </>
    ),
    Energy: (
      <path
        d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"
        strokeWidth="1.5"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
    "Consumer Goods": (
      <>
        <circle cx="9" cy="20" r="1.5" strokeWidth="1.5" stroke="currentColor" fill="none" />
        <circle cx="17" cy="20" r="1.5" strokeWidth="1.5" stroke="currentColor" fill="none" />
        <path
          d="M3 3h2l2.5 12h10l2-7H7"
          strokeWidth="1.5"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
    Infrastructure: (
      <path
        d="M4 21V8l4-4 4 4v13M16 21V12l4-4v13M8 11v2M8 16v2M12 11v2M12 16v2"
        strokeWidth="1.5"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
      />
    ),
    FMCG: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="1.5" stroke="currentColor" fill="none" />
        <path d="M8 10h8M8 14h5" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" />
      </>
    ),
    Auto: (
      <>
        <path
          d="M5 17h14M7 17l1-5h8l1 5"
          strokeWidth="1.5"
          stroke="currentColor"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="17" r="1.5" strokeWidth="1.5" stroke="currentColor" fill="none" />
        <circle cx="16" cy="17" r="1.5" strokeWidth="1.5" stroke="currentColor" fill="none" />
        <path d="M9 12l1-3h4l1 3" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" />
      </>
    ),
    default: <circle cx="12" cy="12" r="8" strokeWidth="1.5" stroke="currentColor" fill="none" />,
  };
  return <svg viewBox="0 0 24 24" className="h-5 w-5">{icons[sector] ?? icons.default}</svg>;
};

/* ── Sectors ── */
const FALLBACK_SECTORS = [
  { label: "Technology", badgeBg: "bg-blue-100 dark:bg-blue-900/40", badgeText: "text-blue-700 dark:text-blue-300", return1Y: "+22.1%" },
  { label: "Healthcare", badgeBg: "bg-teal-100 dark:bg-teal-900/40", badgeText: "text-teal-700 dark:text-teal-300", return1Y: "+9.8%" },
  { label: "Banking & Finance", badgeBg: "bg-amber-100 dark:bg-amber-900/40", badgeText: "text-amber-700 dark:text-amber-300", return1Y: "+14.2%" },
  { label: "Energy", badgeBg: "bg-red-100 dark:bg-red-900/40", badgeText: "text-red-600 dark:text-red-300", return1Y: "+10.5%" },
  { label: "Consumer Goods", badgeBg: "bg-emerald-100 dark:bg-emerald-900/40", badgeText: "text-emerald-700 dark:text-emerald-300", return1Y: "+7.9%" },
  { label: "Infrastructure", badgeBg: "bg-slate-200 dark:bg-slate-800/50", badgeText: "text-slate-600 dark:text-slate-300", return1Y: "+11.3%" },
  { label: "FMCG", badgeBg: "bg-violet-100 dark:bg-violet-900/40", badgeText: "text-violet-700 dark:text-violet-300", return1Y: "+8.4%" },
  { label: "Auto", badgeBg: "bg-pink-100 dark:bg-pink-900/40", badgeText: "text-pink-600 dark:text-pink-300", return1Y: "+12.4%" },
];

/* ── Sector fund details ── */
const sectorFunds: Record<string, { name: string; category: string; returns1Y: string; returns3Y: string; risk: string }[]> = {
  Technology: [
    { name: "ICICI Pru Technology Fund", category: "Sectoral", returns1Y: "+28.4%", returns3Y: "+18.2%", risk: "High" },
    { name: "Tata Digital India Fund", category: "Sectoral", returns1Y: "+24.1%", returns3Y: "+16.8%", risk: "High" },
    { name: "SBI Technology Opp. Fund", category: "Sectoral", returns1Y: "+19.6%", returns3Y: "+14.3%", risk: "Moderate" },
  ],
  Healthcare: [
    { name: "Nippon India Pharma Fund", category: "Sectoral", returns1Y: "+12.8%", returns3Y: "+14.1%", risk: "Moderate" },
    { name: "SBI Healthcare Opp. Fund", category: "Sectoral", returns1Y: "+10.4%", returns3Y: "+11.7%", risk: "Moderate" },
  ],
  "Banking & Finance": [
    { name: "ICICI Pru Banking & Fin.", category: "Sectoral", returns1Y: "+16.2%", returns3Y: "+13.5%", risk: "Moderate" },
    { name: "Kotak Banking ETF", category: "ETF", returns1Y: "+14.8%", returns3Y: "+12.1%", risk: "Moderate" },
  ],
  "Consumer Goods": [
    { name: "Mirae Asset Great Consumer", category: "Thematic", returns1Y: "+9.2%", returns3Y: "+11.4%", risk: "Moderate" },
    { name: "ICICI Pru FMCG Fund", category: "Sectoral", returns1Y: "+7.6%", returns3Y: "+9.8%", risk: "Low" },
  ],
  Energy: [
    { name: "DSP Natural Resources Fund", category: "Thematic", returns1Y: "+18.1%", returns3Y: "+15.7%", risk: "High" },
    { name: "Tata Resources & Energy", category: "Sectoral", returns1Y: "+14.9%", returns3Y: "+12.3%", risk: "High" },
  ],
  Infrastructure: [
    { name: "HDFC Infrastructure Fund", category: "Sectoral", returns1Y: "+13.7%", returns3Y: "+11.8%", risk: "High" },
    { name: "Kotak Infra & Eco Reform", category: "Thematic", returns1Y: "+10.9%", returns3Y: "+9.4%", risk: "Moderate" },
  ],
  FMCG: [
    { name: "ICICI Pru FMCG Fund", category: "Sectoral", returns1Y: "+8.4%", returns3Y: "+10.2%", risk: "Low" },
    { name: "Nippon India Consumption", category: "Thematic", returns1Y: "+7.8%", returns3Y: "+9.1%", risk: "Low" },
  ],
  Auto: [
    { name: "Mahindra Manulife Auto", category: "Sectoral", returns1Y: "+14.2%", returns3Y: "+12.8%", risk: "Moderate" },
    { name: "UTI Auto Sector Fund", category: "Thematic", returns1Y: "+11.6%", returns3Y: "+10.3%", risk: "Moderate" },
  ],
};

/* ── Trending funds ── */
const FALLBACK_TRENDING = [
  { name: "HDFC Mid-Cap Opportunities", category: "Mid Cap", returns: "+18.2%", returns3Y: "+14.6%", returns5Y: "+12.1%", positive: true, risk: "Moderate", minInvestment: "₹5,000", description: "Invests in high-growth mid-cap companies with strong fundamentals." },
  { name: "SBI Small Cap Fund", category: "Small Cap", returns: "+22.4%", returns3Y: "+18.1%", returns5Y: "+15.3%", positive: true, risk: "High", minInvestment: "₹5,000", description: "Focuses on emerging small-cap stocks with high return potential." },
  { name: "Axis Bluechip Fund", category: "Large Cap", returns: "+14.1%", returns3Y: "+12.4%", returns5Y: "+11.2%", positive: true, risk: "Low", minInvestment: "₹1,000", description: "Stable large-cap fund investing in top blue-chip companies." },
  { name: "Motilal Oswal Nasdaq 100", category: "International", returns: "+28.6%", returns3Y: "+20.3%", returns5Y: "+18.7%", positive: true, risk: "High", minInvestment: "₹500", description: "Tracks the Nasdaq 100 index for US tech exposure." },
  { name: "ICICI Pru Balanced Adv.", category: "Hybrid", returns: "-2.3%", returns3Y: "+8.4%", returns5Y: "+9.1%", positive: false, risk: "Moderate", minInvestment: "₹1,000", description: "Balanced fund dynamically shifting between equity and debt." },
];

/* ── For you funds ── */
const FALLBACK_FOR_YOU = [
  { name: "HDFC Mid-Cap Opportunities", subtitle: "Matches your long-term goal", category: "Mid Cap", returns: "+18.2%", returns3Y: "+14.6%", returns5Y: "+12.1%", positive: true, risk: "Moderate", minInvestment: "₹5,000", description: "Invests in high-growth mid-cap companies with strong fundamentals.", badgeBg: "bg-emerald-100 dark:bg-emerald-900/40", badgeText: "text-emerald-700 dark:text-emerald-300" },
  { name: "Parag Parikh Flexi Cap", subtitle: "Good for your retirement horizon", category: "Flexi Cap", returns: "+22.1%", returns3Y: "+16.8%", returns5Y: "+14.2%", positive: true, risk: "Moderate", minInvestment: "₹1,000", description: "Diversified flexi-cap fund with international equity allocation.", badgeBg: "bg-violet-100 dark:bg-violet-900/40", badgeText: "text-violet-700 dark:text-violet-300" },
];

const riskColor = (r: string) => {
  if (r === "Low") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (r === "High") return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
};

const SECTOR_STYLES = FALLBACK_SECTORS.map((s) => ({ badgeBg: s.badgeBg, badgeText: s.badgeText }));

function fmtRetPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function mapApiTrending(f: DiscoveryFund): (typeof FALLBACK_TRENDING)[number] {
  const r1 = f.return_1y;
  const positive = r1 == null || r1 >= 0;
  return {
    name: f.name,
    category: f.category ?? "—",
    returns: fmtRetPct(r1),
    returns3Y: fmtRetPct(f.return_3y),
    returns5Y: fmtRetPct(f.return_5y),
    positive,
    risk: f.risk_level ?? "Moderate",
    minInvestment: f.min_investment != null ? `₹${f.min_investment.toLocaleString("en-IN")}` : "—",
    description: f.description ?? "",
  };
}

function mapApiSector(s: DiscoverySector, i: number): (typeof FALLBACK_SECTORS)[number] {
  const st = SECTOR_STYLES[i % SECTOR_STYLES.length];
  const staticMatch = FALLBACK_SECTORS.find((x) => x.label.toLowerCase() === s.sector.toLowerCase());
  return {
    label: s.sector,
    badgeBg: st.badgeBg,
    badgeText: st.badgeText,
    return1Y: staticMatch?.return1Y ?? `${s.fund_count} funds`,
  };
}

function mapForYouFromFunds(funds: DiscoveryFund[]): typeof FALLBACK_FOR_YOU {
  const subtitles = ["Matches your long-term goal", "Aligned with your profile"];
  return funds.map((f, i) => ({
    name: f.name,
    subtitle: subtitles[i % subtitles.length],
    category: f.category ?? "—",
    returns: fmtRetPct(f.return_1y),
    returns3Y: fmtRetPct(f.return_3y),
    returns5Y: fmtRetPct(f.return_5y),
    positive: f.return_1y == null || f.return_1y >= 0,
    risk: f.risk_level ?? "Moderate",
    minInvestment: f.min_investment != null ? `₹${f.min_investment.toLocaleString("en-IN")}` : "—",
    description: f.description ?? "",
    badgeBg: SECTOR_STYLES[i % SECTOR_STYLES.length].badgeBg,
    badgeText: SECTOR_STYLES[i % SECTOR_STYLES.length].badgeText,
  }));
}

function mapFundToSectorRows(funds: DiscoveryFund[]): { name: string; category: string; returns1Y: string; returns3Y: string; risk: string }[] {
  return funds.map((f) => ({
    name: f.name,
    category: f.category ?? "—",
    returns1Y: fmtRetPct(f.return_1y),
    returns3Y: fmtRetPct(f.return_3y),
    risk: f.risk_level ?? "Moderate",
  }));
}

interface FundDetail {
  name: string;
  category: string;
  returns: string;
  returns3Y: string;
  returns5Y: string;
  risk: string;
  minInvestment: string;
  description: string;
}

export function DiscoverScreen({
  title,
  subtitle = "Top-rated funds, curated for you",
  onBack,
  showRecommendedPlanCard = false,
  onRecommendedPlanClick,
  onStartInvesting,
  onInvestNow,
  primaryCtaLabel = "Start Investing",
  showPlanReadyPopup = false,
}: DiscoverScreenProps) {
  const [viewFund, setViewFund] = useState<FundDetail | null>(null);
  const [viewSector, setViewSector] = useState<string | null>(null);
  const [planReadyPopupOpen, setPlanReadyPopupOpen] = useState(false);
  const [trendingRows, setTrendingRows] = useState<(typeof FALLBACK_TRENDING)[number][] | null>(null);
  const [sectorRows, setSectorRows] = useState<(typeof FALLBACK_SECTORS)[number][] | null>(null);
  const [forYouFunds, setForYouFunds] = useState<typeof FALLBACK_FOR_YOU>(FALLBACK_FOR_YOU);
  const [sectorFundsFromApi, setSectorFundsFromApi] = useState<
    Record<string, ReturnType<typeof mapFundToSectorRows>>
  >({});
  const sectorFetchStarted = useRef<Set<string>>(new Set());

  useEffect(() => {
    listDiscoveryTrending()
      .then((funds) => {
        if (funds.length) setTrendingRows(funds.map(mapApiTrending));
      })
      .catch(() => {});
    listDiscoverySectors()
      .then((secs) => {
        if (secs.length) setSectorRows(secs.map(mapApiSector));
      })
      .catch(() => {});
    Promise.all([listDiscoveryHouseView(), listDiscoveryFunds({ limit: 4 })])
      .then(([hv, fl]) => {
        const src = hv.length ? hv : fl.funds;
        if (src.length) setForYouFunds(mapForYouFromFunds(src.slice(0, 2)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showPlanReadyPopup) return;
    if (typeof sessionStorage === "undefined") return;
    if (sessionStorage.getItem(PLAN_READY_POPUP_SESSION_KEY)) return;
    const t = window.setTimeout(() => setPlanReadyPopupOpen(true), 600);
    return () => window.clearTimeout(t);
  }, [showPlanReadyPopup]);

  useEffect(() => {
    if (!viewSector) return;
    if (sectorFetchStarted.current.has(viewSector)) return;
    sectorFetchStarted.current.add(viewSector);
    listDiscoveryFunds({ sector: viewSector, limit: 20 })
      .then((res) => {
        setSectorFundsFromApi((prev) => ({ ...prev, [viewSector]: mapFundToSectorRows(res.funds) }));
      })
      .catch(() => {
        setSectorFundsFromApi((prev) => ({ ...prev, [viewSector]: [] }));
      });
  }, [viewSector]);

  const trending = trendingRows ?? FALLBACK_TRENDING;
  const sectors = sectorRows ?? FALLBACK_SECTORS;

  const handleInvestNow = () => {
    onInvestNow?.();
    setViewFund(null);
  };

  const goExecuteFromPlanPrompt = () => {
    try {
      sessionStorage.setItem(PLAN_READY_POPUP_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setPlanReadyPopupOpen(false);
    const go = onRecommendedPlanClick ?? onStartInvesting;
    go?.();
  };

  const dismissPlanReadyPopup = () => {
    try {
      sessionStorage.setItem(PLAN_READY_POPUP_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    setPlanReadyPopupOpen(false);
  };

  return (
    <div className="mobile-container min-h-screen bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom,8px)+12px)]">
      <div className="flex items-center gap-3 px-5 pb-3 pt-12">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-muted"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div>
          <h1 className="mb-0.5 text-xl font-bold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>

      <div className="mb-5 px-5">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground/50" />
          <input
            placeholder="Search funds, stocks, ETFs..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      </div>

      <div className="pb-24">
        {showRecommendedPlanCard && (
          <div className="mb-5 px-5">
            <motion.button
              type="button"
              onClick={() => onRecommendedPlanClick?.()}
              className="w-full rounded-2xl px-5 py-4 text-left transition-opacity hover:opacity-90"
              style={{ backgroundColor: "hsl(220, 40%, 20%)" }}
              initial={{ boxShadow: "0 0 0 0 hsla(40, 55%, 65%, 0)" }}
              animate={{
                boxShadow: [
                  "0 0 0 0 hsla(40, 55%, 65%, 0)",
                  "0 0 18px 4px hsla(40, 55%, 65%, 0.45)",
                  "0 0 0 0 hsla(40, 55%, 65%, 0)",
                  "0 0 18px 4px hsla(40, 55%, 65%, 0.45)",
                  "0 0 0 0 hsla(40, 55%, 65%, 0)",
                  "0 0 14px 3px hsla(40, 55%, 65%, 0.3)",
                  "0 0 0 0 hsla(40, 55%, 65%, 0)",
                ],
              }}
              transition={{ duration: 2.4, ease: "easeInOut" }}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(40, 50%, 70%)" }}>
                Your plan
              </p>
              <h3 className="text-base font-bold" style={{ color: "hsl(40, 55%, 80%)" }}>
                Recommended investment plan
              </h3>
              <p className="mt-1 text-xs" style={{ color: "hsla(40, 40%, 85%, 0.7)" }}>
                View your personalised portfolio →
              </p>
            </motion.button>
          </div>
        )}

        <div className="mb-5 px-5">
          <div className="overflow-hidden rounded-2xl border border-border/40">
            <div className="bg-[#1B3A6B] px-4 pb-5 pt-4">
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-white/50">House view · March 2026</p>
              <h3 className="mb-1.5 text-base font-bold leading-snug text-white">Stay invested, ignore the noise</h3>
              <p className="text-[11px] leading-relaxed text-white/60">
                Near-term volatility is sentiment-driven. Fundamentals remain strong — we favour large-cap and flexi-cap allocations for 2026.
              </p>
            </div>
            <div className="flex items-center justify-between bg-card px-4 py-3.5">
              <div>
                <p className="text-[11px] font-semibold text-foreground">Our top pick: Flexi Cap</p>
                <p className="text-[10px] text-muted-foreground">+19.4% avg. 1Y</p>
              </div>
              <button type="button" className="rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-semibold text-primary-foreground">
                Read more
              </button>
            </div>
          </div>
        </div>

        <div className="mb-5 px-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">For you · Based on your goals</p>
          <div className="space-y-2">
            {forYouFunds.map((fund) => (
              <motion.button
                key={fund.name}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setViewFund(fund)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-all hover:shadow-sm active:scale-[0.99]"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${fund.badgeBg} ${fund.badgeText}`}>
                  <TrendingUp className="h-[1.125rem] w-[1.125rem]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">{fund.name}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{fund.subtitle}</p>
                </div>
                <div className="ml-2 shrink-0 text-right">
                  <p className="text-sm font-bold text-[hsl(var(--wealth-green))]">{fund.returns}</p>
                  <p className="text-[9px] text-muted-foreground">1Y return</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="mb-5 px-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Explore by Sector</p>
          <div className="grid grid-cols-2 gap-2.5">
            {sectors.map((s, i) => (
              <motion.button
                key={s.label}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setViewSector(s.label)}
                className="flex flex-col items-start rounded-2xl border border-border/60 bg-card p-3.5 text-left transition-all hover:shadow-sm active:scale-[0.98]"
              >
                <div className={`mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl ${s.badgeBg} ${s.badgeText}`}>
                  <SectorIcon sector={s.label} />
                </div>
                <p className="text-xs font-bold leading-tight text-foreground">{s.label}</p>
                <p className="mt-0.5 text-[11px] font-bold text-[hsl(var(--wealth-green))]">
                  {s.return1Y} <span className="text-[10px] font-normal text-muted-foreground">1Y</span>
                </p>
                <svg viewBox="0 0 40 22" className="mt-2 h-4 w-full" preserveAspectRatio="none">
                  <polyline
                    points={sparklines[s.label] ?? sparklines.Technology}
                    fill="none"
                    stroke="hsl(var(--wealth-green))"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.5"
                  />
                </svg>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="mb-5 px-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Trending Now</p>
          <div className="space-y-2">
            {trending.map((item, i) => (
              <motion.button
                key={item.name}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.04 }}
                onClick={() => setViewFund(item)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-3 text-left transition-all hover:shadow-sm active:scale-[0.99]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <TrendingUp className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground">{item.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{item.category}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${riskColor(item.risk)}`}>{item.risk}</span>
                    </div>
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1">
                  {item.positive ? (
                    <ArrowUpRight className="h-3 w-3 text-[hsl(var(--wealth-green))]" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-destructive" />
                  )}
                  <span
                    className={`text-xs font-semibold ${item.positive ? "text-[hsl(var(--wealth-green))]" : "text-destructive"}`}
                  >
                    {item.returns}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="mt-4 px-5 pb-6">
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            onClick={() => onStartInvesting?.()}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
          >
            {primaryCtaLabel} <ArrowRight className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {planReadyPopupOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 px-5 backdrop-blur-sm"
            onClick={dismissPlanReadyPopup}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-ready-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-border/80 bg-card p-5 shadow-2xl"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Your plan</p>
                  <h2 id="plan-ready-title" className="mt-1 text-lg font-bold leading-snug text-foreground">
                    Your recommended investment plan is ready
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={dismissPlanReadyPopup}
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Review your personalised allocation on the next screen and invest when you&apos;re ready.
              </p>
              <button
                type="button"
                onClick={goExecuteFromPlanPrompt}
                className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-md transition-opacity hover:opacity-90"
              >
                Invest now
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={dismissPlanReadyPopup}
                className="mt-2 w-full py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Maybe later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewFund && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 pb-[calc(3.5rem+env(safe-area-inset-bottom,8px))] backdrop-blur-sm"
            onClick={() => setViewFund(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl bg-card shadow-xl"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-0">
                <div className="mb-4 flex justify-center">
                  <div className="h-1.5 w-10 rounded-full bg-border" />
                </div>
                <div className="mb-3 flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-0.5 text-base font-bold text-foreground">{viewFund.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{viewFund.category}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${riskColor(viewFund.risk)}`}>
                        {viewFund.risk} Risk
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewFund(null)}
                    className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-muted"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>

                <p className="mb-4 text-sm text-muted-foreground">{viewFund.description}</p>

                <div className="mb-4 grid grid-cols-3 gap-2">
                  {[
                    { label: "1Y Return", value: viewFund.returns },
                    { label: "3Y Return", value: viewFund.returns3Y },
                    { label: "5Y Return", value: viewFund.returns5Y },
                  ].map((r) => (
                    <div key={r.label} className="rounded-xl bg-secondary/60 p-3 text-center">
                      <p className="mb-0.5 text-[10px] text-muted-foreground">{r.label}</p>
                      <p className="text-sm font-bold text-[hsl(var(--wealth-green))]">{r.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mb-4 flex items-center justify-between px-1">
                  <span className="text-xs text-muted-foreground">Min. Investment</span>
                  <span className="text-sm font-semibold text-foreground">{viewFund.minInvestment}</span>
                </div>
              </div>

              <div className="p-5 pt-3">
                <button
                  type="button"
                  onClick={handleInvestNow}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Invest Now <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewSector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 pb-[calc(3.5rem+env(safe-area-inset-bottom,8px))] backdrop-blur-sm"
            onClick={() => setViewSector(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-5 pb-10 shadow-xl"
            >
              <div className="mb-4 flex justify-center">
                <div className="h-1.5 w-10 rounded-full bg-border" />
              </div>
              <div className="mb-4 flex items-start justify-between">
                <h3 className="text-base font-bold text-foreground">{viewSector}</h3>
                <button
                  type="button"
                  onClick={() => setViewSector(null)}
                  className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-2.5 pb-4">
                {(sectorFundsFromApi[viewSector] ?? sectorFunds[viewSector] ?? []).map((fund) => (
                  <div key={fund.name} className="rounded-xl border border-border/40 bg-secondary/40 p-3.5">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground">{fund.name}</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${riskColor(fund.risk)}`}>{fund.risk}</span>
                    </div>
                    <p className="mb-1.5 text-[10px] text-muted-foreground">{fund.category}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-[hsl(var(--wealth-green))]">
                        {fund.returns1Y} <span className="text-[9px] font-normal text-muted-foreground">1Y</span>
                      </span>
                      <span className="text-xs font-semibold text-[hsl(var(--wealth-green))]">
                        {fund.returns3Y} <span className="text-[9px] font-normal text-muted-foreground">3Y</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
}
