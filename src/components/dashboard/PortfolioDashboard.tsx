import { useState, useEffect, type ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import NetWorthSparkline from "./NetWorthSparkline";
import CurrentAllocationCard from "./CurrentAllocationCard";
import LiveEventBanner from "./LiveEventBanner";
import PeerComparisonCard from "./PeerComparisonCard";
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
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Headline pill shows the simple total return; TWR / MWR breakdowns live in the Portfolio Analysis modal.
  const activeGain = portfolio.total_gain_percentage;
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

        <p className="text-[10px] text-muted-foreground/80 mt-1 mb-3">Invested {formatInrPaisa(portfolio.total_invested)}</p>

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

        <NetWorthSparkline values={sparkline} />

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
              <LiveEventBanner />
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Test your skills in 2 minutes!</p>
                <SkillsQuiz />
              </div>
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Head to head · 1Y</p>
                <PeerComparisonCard portfolio={cumulativeToPortfolioDetail(cumulativeData)} />
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
              <LiveEventBanner />
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Test your skills in 2 minutes!</p>
                <SkillsQuiz />
              </div>
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Head to head · 1Y</p>
                <PeerComparisonCard portfolio={memberPortfolio} />
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
              <LiveEventBanner />
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Test your skills in 2 minutes!</p>
                <SkillsQuiz />
              </div>
              <div className={CARD} style={CARD_BORDER}>
                <p className="mb-3" style={SECTION_LABEL}>Head to head · 1Y</p>
                <PeerComparisonCard portfolio={selfPortfolio} />
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
