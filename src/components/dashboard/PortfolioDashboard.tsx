import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Compass, ArrowRight, Wallet, Target, Activity, Landmark, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import NetWorthSparkline from "./NetWorthSparkline";
import PortfolioNavChart from "./PortfolioNavChart";
import CurrentAllocationCard from "./CurrentAllocationCard";
import AdvisorMeetingsSlot from "./AdvisorMeetingsSlot";
import PortfolioAnalysisModal from "./PortfolioAnalysisModal";
import ProfileSwitcher from "./ProfileSwitcher";
import CamsUploadModal from "@/components/onboarding/CamsUploadModal";
import { useCamsMissing } from "@/hooks/useCamsMissing";
import { useFamily } from "@/context/FamilyContext";
import {
  getAboutYouStatus,
  getCumulativePortfolio,
  getFamilyMemberPortfolio,
  getFullProfile,
  getMyPortfolio,
  getPortfolioHistory,
  type CumulativePortfolioResponse,
  type FullProfileResponse,
  type PortfolioDetail,
} from "@/lib/api";
import { formatInrCompact, formatInrPaisa } from "@/lib/utils";

// Unified card style — uses tokens so it flips correctly in dark mode.
const CARD = "bg-card rounded-[14px] p-[14px]" as const;
const CARD_BORDER = { border: "1px solid hsl(var(--border))" } as const;
const SECTION_LABEL = { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1.2px", color: "hsl(var(--foreground) / 0.78)" };

/** ₹ with Indian grouping, no decimals — used by the Total Portfolio headline. */
const fmtInr0 = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

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
  useNavChart = false,
  camsMissing = false,
  onUploadCams,
}: {
  portfolio: PortfolioDetail;
  timePeriod: "1M" | "6M" | "1Y" | "All";
  setTimePeriod: (p: "1M" | "6M" | "1Y" | "All") => void;
  sparkline?: number[];
  riskCategory: string | null;
  horizonLabel: string | null;
  middleSlot?: ReactNode;
  /** When true, show the dated per-user NAV chart with its own horizon picker. */
  useNavChart?: boolean;
  /** True when no CAMS holdings exist → the chart offers an inline upload. */
  camsMissing?: boolean;
  /** Open the CAMS upload popup from the chart. */
  onUploadCams?: () => void;
}) {
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // Headline pill shows the simple total return; TWR breakdown lives in the Portfolio Analysis modal.
  const activeGain = portfolio.total_gain_percentage;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="space-y-2">
      {/* Total Portfolio card — the headline number is not tappable; use the "Portfolio analysis →" link below. */}
      <div className={CARD} style={CARD_BORDER}>
        <p className="mb-3" style={SECTION_LABEL}>Total Portfolio</p>

        <div className="flex items-center gap-3">
          <p className="text-2xl font-bold text-foreground tracking-tight">{fmtInr0(portfolio.total_value)}</p>
          {activeGain != null && (
            <div className="flex flex-col items-start gap-0.5">
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
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
                {activeGain.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground/80 mt-1 mb-3">Invested {fmtInr0(portfolio.total_invested)}</p>

        {useNavChart ? (
          <PortfolioNavChart
            camsMissing={camsMissing}
            onUploadCams={onUploadCams}
          />
        ) : (
          <>
            <div className="flex gap-1.5 mb-3" onClick={stop}>
              {(["1M", "6M", "1Y", "All"] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTimePeriod(period);
                  }}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
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
          </>
        )}

        <button
          type="button"
          onClick={() => setAnalysisOpen(true)}
          className="mt-2 pt-2 block w-full cursor-pointer"
          style={{ borderTop: "1px solid hsl(var(--hairline))" }}
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
      />
    </div>
  );
}

function DiscoverEntryCard() {
  const navigate = useNavigate();
  return (
    <motion.button
      type="button"
      onClick={() => navigate("/discovery")}
      className="relative w-full flex items-center gap-3 rounded-[14px] p-[14px] text-left transition-all hover:shadow-sm active:scale-[0.99]"
      style={{
        background: "linear-gradient(135deg, #4A380F 0%, #2D1F05 100%)",
        border: "1px solid rgba(212, 168, 104, 0.45)",
        color: "#F5EEDC",
      }}
      whileTap={{ scale: 0.99 }}
      animate={{
        boxShadow: [
          "0 0 0 0 rgba(212, 168, 104, 0), 0 0 0 0 rgba(212, 168, 104, 0)",
          "0 0 28px 2px rgba(212, 168, 104, 0.55), 0 0 64px 6px rgba(212, 168, 104, 0.28)",
          "0 0 0 0 rgba(212, 168, 104, 0), 0 0 0 0 rgba(212, 168, 104, 0)",
          "0 0 28px 2px rgba(212, 168, 104, 0.55), 0 0 64px 6px rgba(212, 168, 104, 0.28)",
          "0 0 0 0 rgba(212, 168, 104, 0), 0 0 0 0 rgba(212, 168, 104, 0)",
          "0 0 28px 2px rgba(212, 168, 104, 0.55), 0 0 64px 6px rgba(212, 168, 104, 0.28)",
          "0 0 0 0 rgba(212, 168, 104, 0), 0 0 0 0 rgba(212, 168, 104, 0)",
          "0 0 28px 2px rgba(212, 168, 104, 0.55), 0 0 64px 6px rgba(212, 168, 104, 0.28)",
          "0 0 0 0 rgba(212, 168, 104, 0), 0 0 0 0 rgba(212, 168, 104, 0)",
        ],
      }}
      transition={{
        duration: 5.2,
        ease: "easeInOut",
        times: [0, 0.08, 0.18, 0.32, 0.42, 0.56, 0.66, 0.8, 1],
      }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: "rgba(245, 238, 220, 0.14)",
          color: "#F5EEDC",
        }}
      >
        <Compass className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p
          style={{
            fontSize: 10,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "rgba(245, 238, 220, 0.75)",
          }}
        >
          Discover
        </p>
        <p
          className="mt-0.5 text-[13px] font-semibold leading-tight"
          style={{ color: "#F5EEDC" }}
        >
          Discover Prozpr rated funds
        </p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "rgba(245, 238, 220, 0.7)" }} />
    </motion.button>
  );
}

/**
 * Quick-unlock circles — a lightweight alternative to the full onboarding.
 * Each shares one profile category and unlocks a specific Prozpr capability.
 * Deep-links into the matching Complete-Profile section (?section=N).
 */
function ProfileUnlockCircles() {
  const navigate = useNavigate();

  // Per-section completion — the SAME rule the Profile page uses (getAboutYouStatus),
  // so these icons and the profile page never disagree. Indexed 0 financial ·
  // 1 goals · 2 risk · 3 tax. null = still resolving: render nothing until we
  // know, so a fully-onboarded user never sees the card flash in and vanish.
  const [sectionStatus, setSectionStatus] = useState<boolean[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    getAboutYouStatus()
      .then((s) => { if (!cancelled) setSectionStatus(s.sections); })
      .catch(() => {
        // Status unresolvable — show the card with everything still to unlock.
        if (!cancelled) setSectionStatus([false, false, false, false]);
      });
    return () => { cancelled = true; };
  }, []);

  // Fully onboarded (all 4 sections complete) → the card disappears entirely.
  if (sectionStatus === null || sectionStatus.every(Boolean)) return null;

  const sectionDone = sectionStatus;

  const items = [
    {
      section: 0,
      Icon: Wallet,
      title: "Your money map",
      unlocks: "Supercharge rebalancing",
      flash: true,
      ring: "#D4A868",
      done: sectionDone[0],
    },
    {
      section: 3,
      Icon: Landmark,
      title: "Tax details",
      unlocks: "Unlock smarter funds",
      flash: true,
      ring: "#D4A868",
      done: sectionDone[3],
    },
    {
      section: 2,
      Icon: Activity,
      title: "Risk behaviour",
      unlocks: "Tune your portfolio",
      flash: true,
      ring: "#D4A868",
      done: sectionDone[2],
    },
    {
      section: 1,
      Icon: Target,
      title: "Goal planning",
      unlocks: "Chart your future",
      flash: true,
      ring: "#D4A868",
      done: sectionDone[1],
    },
  ];

  // Completed sections slide to the far right; sections still to do stay on the
  // left. Sort is stable, so the curated order is preserved within each group.
  const orderedItems = [...items].sort((a, b) => Number(a.done) - Number(b.done));

  const remaining = items.filter((i) => !i.done).length;

  return (
    <div className="rounded-[14px] border border-border bg-card p-4" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[1.5px] text-muted-foreground" style={{ fontWeight: 500 }}>
            Unlock more
          </p>
          <p className="mt-0.5 text-[13px] font-semibold text-foreground">
            Share a little, unlock a lot
          </p>
        </div>
        {/* The card only renders while something is still locked (fully
            onboarded users never see it), so `remaining` is always ≥ 1 here. */}
        <motion.span
          className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
          style={{
            // Same glowing purple/pink sweep as the Goals-page insight banner.
            backgroundImage: "linear-gradient(100deg, #D4A868, #C2487A, #7A52C8, #D4A868)",
            backgroundSize: "300% 100%",
            boxShadow: "0 0 14px rgba(160,70,170,0.5)",
          }}
          animate={{ backgroundPosition: ["0% 50%", "100% 50%"], scale: [1, 1.06, 1] }}
          transition={{
            backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" },
            scale: { duration: 1.4, repeat: Infinity, ease: "easeInOut" },
          }}
        >
          ✨ {remaining === 1 ? "1 step to full plan" : `${remaining} unlocks left`}
        </motion.span>
      </div>

      <div className="flex justify-between gap-1">
        {orderedItems.map(({ section, Icon, title, unlocks, ring, done, flash }) => (
          <motion.button
            key={section}
            type="button"
            onClick={() => navigate(section === 1 ? "/goal-planner" : `/profile/complete?section=${section}`)}
            whileTap={{ scale: 0.95 }}
            className="flex w-[23%] flex-col items-center gap-1.5 text-center"
          >
            <span className="relative flex h-[58px] w-[58px] items-center justify-center rounded-full">
              {/* Gradient/animated ring */}
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: done
                    ? `conic-gradient(${ring} 0deg 360deg)`
                    : `conic-gradient(${ring} 0deg 250deg, ${ring}22 250deg 360deg)`,
                  padding: 2,
                  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))",
                }}
              />
              <span
                className="flex h-[50px] w-[50px] items-center justify-center rounded-full"
                style={{ backgroundColor: done ? ring : `${ring}14`, color: done ? "#fff" : ring }}
              >
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </span>
              {done && (
                <span
                  className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-card"
                  style={{ backgroundColor: "hsl(var(--wealth-green))" }}
                >
                  <Check className="h-2.5 w-2.5 text-white" />
                </span>
              )}
            </span>
            <span className="text-[11px] font-semibold leading-tight text-foreground">{title}</span>
            {!done && (
              flash ? (
                <motion.span
                  className="text-[9px] italic font-semibold leading-tight"
                  style={{ color: ring }}
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                >
                  {unlocks}
                </motion.span>
              ) : (
                <span className="text-[9px] leading-tight text-muted-foreground">{unlocks}</span>
              )
            )}
          </motion.button>
        ))}
      </div>
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
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                  {(m.nickname[0] ?? "?").toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{m.nickname}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{m.relationship_type}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-xs font-semibold text-foreground">{formatInrPaisa(m.portfolio_value)}</p>
                {m.gain_percentage != null && (
                  <p
                    className={`text-[10px] font-medium ${
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
  const [hasShownInitialLoad, setHasShownInitialLoad] = useState(false);

  const [cumulativeData, setCumulativeData] = useState<CumulativePortfolioResponse | null>(null);
  const [memberPortfolio, setMemberPortfolio] = useState<PortfolioDetail | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);

  const [selfPortfolio, setSelfPortfolio] = useState<PortfolioDetail | null>(null);
  const [selfProfile, setSelfProfile] = useState<FullProfileResponse | null>(null);
  const [selfSparkline, setSelfSparkline] = useState<number[] | undefined>(undefined);
  const [selfLoading, setSelfLoading] = useState(true);
  // Bumped after a CAMS upload to re-pull the (now-changed) self portfolio.
  const [selfReloadKey, setSelfReloadKey] = useState(0);

  // CAMS presence. When it's missing we surface an upload prompt INSIDE the NAV
  // history chart space (see PortfolioNavChart) — no auto-popup, no top banner.
  // The popup only opens when the user clicks that in-chart upload button.
  const cams = useCamsMissing();
  const [camsOpen, setCamsOpen] = useState(false);

  const handleCamsUploaded = () => {
    setCamsOpen(false);
    cams.refresh();
    setSelfReloadKey((k) => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    if (activeView.type === "cumulative") {
      setFamilyLoading(!hasShownInitialLoad && !cumulativeData);
      getCumulativePortfolio()
        .then((d) => { if (!cancelled) setCumulativeData(d); })
        .catch(() => {
          if (!cancelled) setCumulativeData(null);
        })
        .finally(() => {
          if (!cancelled) {
            setFamilyLoading(false);
            setHasShownInitialLoad(true);
          }
        });
    } else if (activeView.type === "member") {
      setFamilyLoading(!hasShownInitialLoad && !memberPortfolio);
      getFamilyMemberPortfolio(activeView.member.id)
        .then((d) => { if (!cancelled) setMemberPortfolio(d); })
        .catch(() => {
          if (!cancelled) setMemberPortfolio(null);
        })
        .finally(() => {
          if (!cancelled) {
            setFamilyLoading(false);
            setHasShownInitialLoad(true);
          }
        });
    }
    return () => { cancelled = true; };
  }, [activeView, hasShownInitialLoad]);

  useEffect(() => {
    if (activeView.type !== "self") return;
    let cancelled = false;
    setSelfLoading(!hasShownInitialLoad && !selfPortfolio);
    Promise.all([
      getMyPortfolio().catch(() => null),
      getFullProfile().catch(() => null),
      getPortfolioHistory(60).catch(() => []),
    ])
      .then(([port, prof, hist]) => {
        if (cancelled) return;
        setSelfPortfolio(port);
        setSelfProfile(prof);
        const sorted = [...hist].sort(
          (a, b) => new Date(a.recorded_date).getTime() - new Date(b.recorded_date).getTime()
        );
        if (sorted.length > 1) {
          const scale = sorted.map((h) => h.total_value / 100000);
          setSelfSparkline(scale);
        } else if (sorted.length === 1) {
          setSelfSparkline([sorted[0].total_value / 100000]);
        } else {
          setSelfSparkline(undefined);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelfPortfolio(null);
          setSelfProfile(null);
          setSelfSparkline(undefined);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSelfLoading(false);
          setHasShownInitialLoad(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeView.type, hasShownInitialLoad, selfReloadKey]);

  const viewLabel =
    activeView.type === "self"
      ? "Total Portfolio"
      : activeView.type === "cumulative"
      ? "Family Portfolio"
      : `${activeView.member.nickname}'s Portfolio`;

  return (
    <div className="mobile-container bg-background flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-10 pb-2">
        <div>
          {activeView.type !== "self" && (
            <p style={SECTION_LABEL}>{viewLabel}</p>
          )}
          {activeView.type === "cumulative" && cumulativeData && (
            <p className="text-[10px] text-muted-foreground/60">
              {cumulativeData.member_count} members combined
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://wa.me/919007016819"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat on WhatsApp"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 hover:bg-muted transition-colors"
            style={{ color: "#25D366" }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.582 0 11.943-5.359 11.945-11.893a11.821 11.821 0 00-3.418-8.453" />
            </svg>
          </a>
          <ProfileSwitcher />
        </div>
      </div>

      {familyLoading && activeView.type !== "self" && !hasShownInitialLoad && (
        <div className="px-5 py-8 flex justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
        </div>
      )}

      {/* Cumulative family view */}
      {activeView.type === "cumulative" && (
        <>
          {cumulativeData && cumulativeData.total_value > 0 && (
            <div className="px-5 space-y-2 pb-24">
              <PortfolioMainPanel
                portfolio={cumulativeToPortfolioDetail(cumulativeData)}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={[cumulativeData.total_value / 100000]}
                riskCategory={null}
                horizonLabel="Combined family"
                middleSlot={<CumulativeMemberBreakdownCard data={cumulativeData} />}
              />
              <DiscoverEntryCard />
              <AdvisorMeetingsSlot />
            </div>
          )}
          {cumulativeData && cumulativeData.total_value === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-muted-foreground">No combined portfolio data yet.</p>
            </div>
          )}
          {!familyLoading && !cumulativeData && hasShownInitialLoad && (
            <div className="px-5 py-6 text-center text-xs text-muted-foreground">
              Could not load family portfolio. Check your connection and try again.
            </div>
          )}
        </>
      )}

      {/* Member view */}
      {activeView.type === "member" && (
        <>
          {memberPortfolio && memberPortfolio.total_value > 0 && (
            <div className="px-5 space-y-2 pb-24">
              <PortfolioMainPanel
                portfolio={memberPortfolio}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={[memberPortfolio.total_value / 100000]}
                riskCategory={null}
                horizonLabel={null}
              />
              <DiscoverEntryCard />
              <AdvisorMeetingsSlot />
            </div>
          )}
          {memberPortfolio && memberPortfolio.total_value === 0 && (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-muted-foreground">No portfolio data available for this member yet.</p>
            </div>
          )}
          {!familyLoading && !memberPortfolio && hasShownInitialLoad && (
            <div className="px-5 py-6 text-center text-xs text-muted-foreground">
              Could not load this member&apos;s portfolio. Check your connection and try again.
            </div>
          )}
        </>
      )}

      {/* Self view */}
      {activeView.type === "self" && (
        <>
          {selfLoading && !hasShownInitialLoad && (
            <div className="px-5 pt-4 space-y-3" aria-busy="true" aria-label="Loading your portfolio">
              {/* Value + chart placeholder */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
              {/* Allocation placeholder */}
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <Skeleton className="h-3 w-28" />
                <div className="flex items-center gap-4">
                  <Skeleton className="h-24 w-24 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {selfPortfolio && (
            <div className="px-5 space-y-2 pb-24">
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
                useNavChart
                camsMissing={cams.missing}
                onUploadCams={() => setCamsOpen(true)}
              />
              <DiscoverEntryCard />
              <ProfileUnlockCircles />
              <AdvisorMeetingsSlot />
            </div>
          )}

          {!selfLoading && !selfPortfolio && hasShownInitialLoad && (
            <div className="px-5 py-6 text-center text-xs text-muted-foreground">
              Could not load your portfolio from the server. Check your connection and try again.
            </div>
          )}
        </>
      )}


      {/* Inline CAMS upload — same flow as /cams-upload (instructions + file +
          password). Opened from the chart option or the once-per-session popup;
          on success we re-pull the portfolio so the user stays right here.
          replaceExisting: a statement uploaded here is treated as the new source of
          truth — the backend wipes prior CAMS data (transactions, holdings,
          allocations, net-worth history) and recomputes the full series from it. */}
      <CamsUploadModal
        open={camsOpen}
        onClose={() => setCamsOpen(false)}
        onUploaded={handleCamsUploaded}
        replaceExisting
      />

      <BottomNav />
    </div>
  );
};

export default PortfolioDashboard;
