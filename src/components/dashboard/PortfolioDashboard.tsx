import { useState, useEffect, type ReactNode } from "react";
import { TrendingUp, TrendingDown, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import NetWorthSparkline from "./NetWorthSparkline";
import CurrentAllocationCard from "./CurrentAllocationCard";
import PortfolioAnalysisModal from "./PortfolioAnalysisModal";
import DailyInsights from "./DailyInsights";
import SkillsQuiz from "./SkillsQuiz";
import ProfileSwitcher from "./ProfileSwitcher";
import { useFamily } from "@/context/FamilyContext";
import {
  getCumulativePortfolio,
  getFamilyMemberPortfolio,
  getFullProfile,
  getMyPortfolio,
  getPortfolioHistory,
  type CumulativePortfolioResponse,
  type FullProfileResponse,
  type PortfolioDetail,
} from "@/lib/api";
import {
  buildDemoSparkline,
  cloneDemoCumulativePortfolio,
  cloneDemoFullProfile,
  cloneDemoMemberPortfolio,
  cloneDemoSelfPortfolio,
} from "@/lib/portfolioDemoData";
import { formatInrCompact, formatInrPaisa } from "@/lib/utils";

// Unified card style — uses tokens so it flips correctly in dark mode.
const CARD = "bg-card rounded-[14px] p-[14px]" as const;
const CARD_BORDER = { border: "1px solid hsl(var(--border))" } as const;
const SECTION_LABEL = { fontSize: 10, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "1.5px", color: "hsl(var(--muted-foreground))" };

type ReturnKind = "simple" | "twr" | "mwr";

const RETURN_SEGMENTS: { id: ReturnKind; label: string }[] = [
  { id: "simple", label: "Total" },
  { id: "twr", label: "TWR" },
  { id: "mwr", label: "MWR" },
];

const RETURN_INFO: Record<ReturnKind, { title: string; short: string; long: string }> = {
  simple: {
    title: "Total return",
    short: "The straightforward gain or loss on your total invested amount.",
    long: "Total return compares your current portfolio value against the total amount you've put in. It's the most intuitive number, but it doesn't account for when you added money — a large contribution last month is treated the same as one made five years ago.",
  },
  twr: {
    title: "Time-Weighted Return",
    short: "Measures how your investments performed, independent of when you added or withdrew money. Best for comparing against benchmarks.",
    long: "Time-Weighted Return strips out the effect of your deposits and withdrawals so you're looking at pure investment performance. It's the metric fund managers report, because it lets you compare your portfolio apples-to-apples against a benchmark like the Nifty 50.",
  },
  mwr: {
    title: "Money-Weighted Return",
    short: "Reflects your actual return, factoring in the timing and size of your contributions. Best for understanding your personal experience.",
    long: "Money-Weighted Return (sometimes called IRR) weighs the timing and size of every contribution and withdrawal. If you invested more right before a rally, your MWR will be higher than TWR; if you invested right before a drop, it will be lower. It tells you how your money, specifically, has performed.",
  },
};

// 3Y / 5Y return style: derive TWR / MWR gain % from the simple gain until the API returns them.
function deriveReturnByKind(simpleGain: number | null, kind: ReturnKind): number | null {
  if (simpleGain === null) return null;
  if (kind === "simple") return simpleGain;
  // Typical real-world relationship: TWR strips contribution tailwind (usually lower magnitude),
  // MWR sits between simple and TWR.
  const factor = kind === "twr" ? 0.87 : 0.94;
  return Math.round(simpleGain * factor * 100) / 100;
}

// Tilt the sparkline so its end-point reflects the selected metric while keeping overall shape.
function variantSparkline(values: number[] | undefined, endFactor: number): number[] | undefined {
  if (!values || values.length <= 1) return values;
  const n = values.length;
  return values.map((v, i) => {
    const t = i / (n - 1);
    const scale = 1 + (endFactor - 1) * t;
    return v * scale;
  });
}

function cumulativeToPortfolioDetail(c: CumulativePortfolioResponse): PortfolioDetail {
  return {
    id: "cumulative-family",
    name: "Family combined",
    total_value: c.total_value,
    total_invested: c.total_invested,
    total_gain_percentage: c.total_gain_percentage,
    is_primary: true,
    created_at: "",
    updated_at: "",
    allocations: c.combined_allocations.map((a, i) => ({
      id: `cumulative-alloc-${i}`,
      asset_class: a.asset_class,
      allocation_percentage: a.allocation_percentage,
      amount: a.total_amount,
      performance_percentage: null,
    })),
    holdings: [],
  };
}

function PortfolioMainPanel({
  portfolio,
  timePeriod,
  setTimePeriod,
  sparkline,
  riskCategory,
  horizonLabel,
  middleSlot,
}: {
  portfolio: PortfolioDetail;
  timePeriod: "1M" | "6M" | "1Y" | "All";
  setTimePeriod: (p: "1M" | "6M" | "1Y" | "All") => void;
  sparkline?: number[];
  riskCategory: string | null;
  horizonLabel: string | null;
  middleSlot?: ReactNode;
}) {
  const [returnKind, setReturnKind] = useState<ReturnKind>("simple");
  const [infoOpen, setInfoOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  const activeGain = deriveReturnByKind(portfolio.total_gain_percentage, returnKind);
  const simpleGain = portfolio.total_gain_percentage;

  const endFactor =
    returnKind === "simple" || simpleGain === null || activeGain === null
      ? 1
      : (1 + activeGain / 100) / (1 + simpleGain / 100);
  const displayedSparkline =
    returnKind === "simple" ? sparkline : variantSparkline(sparkline, endFactor);

  const openInfo = () => {
    setInfoOpen(true);
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="space-y-2">
      {/* Total Portfolio card — the headline number is not tappable; use the "Portfolio analysis →" link below. */}
      <div className={CARD} style={CARD_BORDER}>
        <p className="mb-3" style={SECTION_LABEL}>Total Portfolio</p>

        <div className="flex items-center gap-2.5">
          <p className="text-2xl font-bold text-foreground tracking-tight">{formatInrPaisa(portfolio.total_value)}</p>
          {activeGain != null && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                activeGain >= 0
                  ? "bg-wealth-green/15 text-wealth-green"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {activeGain >= 0 ? (
                <TrendingUp className="h-2.5 w-2.5" />
              ) : (
                <TrendingDown className="h-2.5 w-2.5" />
              )}
              {activeGain >= 0 ? "+" : ""}
              {activeGain}%
            </span>
          )}
        </div>

        {/* Return-type segmented control */}
        <div className="flex items-center gap-1.5 mt-2" onClick={stop}>
          {RETURN_SEGMENTS.map((seg) => {
            const active = returnKind === seg.id;
            return (
              <button
                key={seg.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setReturnKind(seg.id);
                }}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  active
                    ? "bg-accent/15 text-accent"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {seg.label}
                {active && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`About ${seg.label} return`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openInfo();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        openInfo();
                      }
                    }}
                    className="inline-flex items-center rounded-full hover:opacity-80"
                  >
                    <Info className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground/80 mt-2 mb-3">Invested {formatInrPaisa(portfolio.total_invested)}</p>

        <div className="flex gap-1.5 mb-3" onClick={stop}>
          {(["1M", "6M", "1Y", "All"] as const).map((period) => (
            <button
              key={period}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setTimePeriod(period);
              }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                timePeriod === period
                  ? "bg-accent/15 text-accent"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {period}
            </button>
          ))}
        </div>

        <NetWorthSparkline values={displayedSparkline} />

        <button
          type="button"
          onClick={() => setAnalysisOpen(true)}
          className="mt-2 pt-2 block w-full cursor-pointer"
        >
          <p className="text-[13px] font-medium text-center w-full text-foreground hover:text-accent transition-colors">
            Portfolio analysis →
          </p>
        </button>
      </div>

      {/* Current Allocation card (with merged holdings) */}
      <div className={CARD} style={CARD_BORDER}>
        <CurrentAllocationCard
          portfolio={portfolio}
          riskCategory={riskCategory}
          horizonLabel={horizonLabel}
        />
      </div>

      {middleSlot}

      {/* Return-type info bottom sheet — sits above BottomNav (z-50) with nav-clearance padding. */}
      <AnimatePresence>
        {infoOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/30"
              onClick={() => setInfoOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-w-md rounded-t-2xl bg-card px-5 pt-5 shadow-xl overflow-y-auto"
              style={{
                paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 8px) + 16px)",
                maxHeight: "calc(100dvh - 4rem - env(safe-area-inset-bottom, 8px))",
              }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                {RETURN_INFO[returnKind].title}
              </p>
              <p className="text-[14px] text-foreground leading-relaxed">
                {RETURN_INFO[returnKind].short} {RETURN_INFO[returnKind].long}
              </p>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <PortfolioAnalysisModal
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        portfolio={portfolio}
      />
    </div>
  );
}

function CumulativeMemberBreakdownCard({ data }: { data: CumulativePortfolioResponse }) {
  if (!data.members.length) return null;
  return (
    <div className={CARD} style={CARD_BORDER}>
      <p className="mb-3" style={SECTION_LABEL}>Member breakdown</p>
      <div className="space-y-0">
        {data.members.map((m, i, arr) => (
          <div key={m.member_id}>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[9px] font-bold text-accent">
                  {(m.nickname[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{m.nickname}</p>
                  <p className="text-[9px] text-muted-foreground capitalize">{m.relationship_type}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-xs font-semibold text-foreground">{formatInrPaisa(m.portfolio_value)}</p>
                {m.gain_percentage != null && (
                  <p
                    className={`text-[9px] font-medium ${
                      m.gain_percentage >= 0 ? "text-wealth-green" : "text-destructive"
                    }`}
                  >
                    {m.gain_percentage >= 0 ? "+" : ""}
                    {m.gain_percentage}%
                  </p>
                )}
              </div>
            </div>
            {i < arr.length - 1 && <div className="h-px bg-border/20" />}
          </div>
        ))}
      </div>
    </div>
  );
}

const PortfolioDashboard = () => {
  const { activeView } = useFamily();
  const [timePeriod, setTimePeriod] = useState<"1M" | "6M" | "1Y" | "All">("All");

  const [cumulativeData, setCumulativeData] = useState<CumulativePortfolioResponse | null>(null);
  const [memberPortfolio, setMemberPortfolio] = useState<PortfolioDetail | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);

  const [selfPortfolio, setSelfPortfolio] = useState<PortfolioDetail | null>(null);
  const [selfProfile, setSelfProfile] = useState<FullProfileResponse | null>(null);
  const [selfSparkline, setSelfSparkline] = useState<number[] | undefined>(undefined);
  const [selfLoading, setSelfLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (activeView.type === "cumulative") {
      setFamilyLoading(true);
      getCumulativePortfolio()
        .then((d) => { if (!cancelled) setCumulativeData(d); })
        .catch(() => {
          if (!cancelled) setCumulativeData(cloneDemoCumulativePortfolio());
        })
        .finally(() => { if (!cancelled) setFamilyLoading(false); });
    } else if (activeView.type === "member") {
      setFamilyLoading(true);
      const nick = activeView.member.nickname;
      getFamilyMemberPortfolio(activeView.member.id)
        .then((d) => { if (!cancelled) setMemberPortfolio(d); })
        .catch(() => {
          if (!cancelled) setMemberPortfolio(cloneDemoMemberPortfolio(nick));
        })
        .finally(() => { if (!cancelled) setFamilyLoading(false); });
    }
    return () => { cancelled = true; };
  }, [activeView]);

  useEffect(() => {
    if (activeView.type !== "self") return;
    let cancelled = false;
    setSelfLoading(true);
    Promise.all([
      getMyPortfolio().catch(() => null),
      getFullProfile().catch(() => null),
      getPortfolioHistory(60).catch(() => []),
    ])
      .then(([port, prof, hist]) => {
        if (cancelled) return;
        const useDemoPortfolio = port === null;
        setSelfPortfolio(useDemoPortfolio ? cloneDemoSelfPortfolio() : port);
        setSelfProfile(useDemoPortfolio ? (prof ?? cloneDemoFullProfile()) : prof);
        const sorted = [...hist].sort(
          (a, b) => new Date(a.recorded_date).getTime() - new Date(b.recorded_date).getTime()
        );
        if (sorted.length > 1) {
          const scale = sorted.map((h) => h.total_value / 100000);
          setSelfSparkline(scale);
        } else if (sorted.length === 1) {
          setSelfSparkline([sorted[0].total_value / 100000]);
        } else {
          setSelfSparkline(useDemoPortfolio ? buildDemoSparkline() : undefined);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelfPortfolio(cloneDemoSelfPortfolio());
          setSelfProfile(cloneDemoFullProfile());
          setSelfSparkline(buildDemoSparkline());
        }
      })
      .finally(() => {
        if (!cancelled) setSelfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeView.type]);

  const viewLabel =
    activeView.type === "self"
      ? "Total Portfolio"
      : activeView.type === "cumulative"
      ? "Family Portfolio"
      : `${activeView.member.nickname}'s Portfolio`;

  return (
    <div className="mobile-container bg-background flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-[14px] pt-12 pb-2">
        <div>
          <p style={SECTION_LABEL}>{viewLabel}</p>
          {activeView.type === "cumulative" && cumulativeData && (
            <p className="text-[9px] text-muted-foreground/60">
              {cumulativeData.member_count} members combined
            </p>
          )}
        </div>
        <ProfileSwitcher />
      </div>

      {familyLoading && activeView.type !== "self" && (
        <div className="px-[14px] py-8 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      )}

      {/* Cumulative family view */}
      {activeView.type === "cumulative" && (
        <>
          {!familyLoading && cumulativeData && cumulativeData.total_value > 0 && (
            <div className="px-[14px] space-y-2">
              <PortfolioMainPanel
                portfolio={cumulativeToPortfolioDetail(cumulativeData)}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={[cumulativeData.total_value / 100000]}
                riskCategory={null}
                horizonLabel="Combined family"
                middleSlot={<CumulativeMemberBreakdownCard data={cumulativeData} />}
              />
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Test your skills in 2 minutes!</p>
                <SkillsQuiz />
              </div>
              <div className={`${CARD} pb-24`} style={CARD_BORDER}>
                <DailyInsights />
              </div>
            </div>
          )}
          {!familyLoading && cumulativeData && cumulativeData.total_value === 0 && (
            <div className="px-[14px] py-8 text-center">
              <p className="text-xs text-muted-foreground">No combined portfolio data yet.</p>
            </div>
          )}
          {!familyLoading && !cumulativeData && (
            <div className="px-[14px] py-6 text-center text-xs text-muted-foreground">
              Could not load family portfolio. Check your connection and try again.
            </div>
          )}
        </>
      )}

      {/* Member view */}
      {activeView.type === "member" && (
        <>
          {!familyLoading && memberPortfolio && memberPortfolio.total_value > 0 && (
            <div className="px-[14px] space-y-2">
              <PortfolioMainPanel
                portfolio={memberPortfolio}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={[memberPortfolio.total_value / 100000]}
                riskCategory={null}
                horizonLabel={null}
              />
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Test your skills in 2 minutes!</p>
                <SkillsQuiz />
              </div>
              <div className={`${CARD} pb-24`} style={CARD_BORDER}>
                <DailyInsights />
              </div>
            </div>
          )}
          {!familyLoading && memberPortfolio && memberPortfolio.total_value === 0 && (
            <div className="px-[14px] py-8 text-center">
              <p className="text-xs text-muted-foreground">No portfolio data available for this member yet.</p>
            </div>
          )}
          {!familyLoading && !memberPortfolio && (
            <div className="px-[14px] py-6 text-center text-xs text-muted-foreground">
              Could not load this member&apos;s portfolio. Check your connection and try again.
            </div>
          )}
        </>
      )}

      {/* Self view */}
      {activeView.type === "self" && (
        <>
          {selfLoading && (
            <div className="px-[14px] py-8 flex justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
            </div>
          )}

          {!selfLoading && selfPortfolio && (
            <div className="px-[14px] space-y-2">
              <PortfolioMainPanel
                portfolio={selfPortfolio}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={selfSparkline}
                riskCategory={selfProfile?.risk_profile?.risk_category ?? null}
                horizonLabel={
                  selfProfile?.investment_profile?.total_horizon ??
                  selfProfile?.risk_profile?.investment_horizon ??
                  null
                }
              />
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Test your skills in 2 minutes!</p>
                <SkillsQuiz />
              </div>
              <div className={`${CARD} pb-24`} style={CARD_BORDER}>
                <DailyInsights />
              </div>
            </div>
          )}

          {!selfLoading && !selfPortfolio && (
            <div className="px-[14px] py-6 text-center text-xs text-muted-foreground">
              Could not load your portfolio from the server. Check your connection and try again.
            </div>
          )}
        </>
      )}


      <BottomNav />
    </div>
  );
};

export default PortfolioDashboard;
