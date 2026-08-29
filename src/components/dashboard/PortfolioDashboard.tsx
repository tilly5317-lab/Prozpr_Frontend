import { useCallback, useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Wallet, Target, Activity, Landmark, Check, HelpCircle, Sparkles, Banknote, Droplet, Coins, GitCompare, Layers, Lightbulb, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import { Skeleton } from "@/components/ui/skeleton";
import NetWorthSparkline from "./NetWorthSparkline";
import PortfolioNavChart from "./PortfolioNavChart";
import CurrentAllocationCard from "./CurrentAllocationCard";
// Zoom team-call feature disabled for now — keep the code, don't delete.
// import AdvisorMeetingsSlot from "./AdvisorMeetingsSlot";
import PortfolioAnalysisModal from "./PortfolioAnalysisModal";
import PortfolioInsightsModal from "./PortfolioInsightsModal";
import ProfileSwitcher from "./ProfileSwitcher";
import CamsUploadModal from "@/components/onboarding/CamsUploadModal";
import GuidedTour, { type TourStep } from "@/components/GuidedTour";
import DiscoverFundSearch from "@/components/discover/DiscoverFundSearch";
import AIChatSheet from "./AIChatSheet";
import NextActionCard from "./NextActionCard";
import PortfolioSinceLast from "./PortfolioSinceLast";
import RiskProfileSheet from "./RiskProfileEditor";
import { indexVerdicts, nextAction } from "@/lib/portfolioVerdicts";
import { demoHistory, demoInsights } from "@/lib/portfolioDemoData";
import type { ChartNotes } from "@/lib/portfolioChartNotes";
import { ThemeCircle } from "@/components/discover/FundCategories";
import { groupHref, useFundGroups } from "@/lib/fundGroups";
import { useCamsMissing } from "@/hooks/useCamsMissing";
import { useFamily } from "@/context/FamilyContext";
import {
  getAboutYouStatus,
  getCumulativePortfolio,
  getFamilyMemberPortfolio,
  getFullProfile,
  getMyPortfolio,
  getPortfolioHistory,
  getPortfolioInsights,
  type CumulativePortfolioResponse,
  type FullProfileResponse,
  type PortfolioDetail,
  type PortfolioHistoryPoint,
  type PortfolioInsightsResponse,
} from "@/lib/api";
import { formatInrCompact, formatInrPaisa } from "@/lib/utils";

// Unified card style — uses tokens so it flips correctly in dark mode.
const CARD = "bg-card rounded-[14px] p-[14px]" as const;
const CARD_BORDER = { border: "1px solid hsl(var(--border))" } as const;
const SECTION_LABEL = { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1.2px", color: "hsl(var(--foreground) / 0.78)" };

/** ₹ with Indian grouping, no decimals — used by the Total Portfolio headline. */
const fmtInr0 = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/** Marks the first-run portfolio walkthrough as seen, per browser. */
const PORTFOLIO_TOUR_SEEN_KEY = "portfolioTourSeen";

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
  verdicts,
  history,
  action,
  onAskPi,
  onEditProfile,
  riskCategory,
  horizonLabel,
  middleSlot,
  useNavChart = false,
  camsMissing = false,
  onUploadCams,
  onOpenInsights,
}: {
  portfolio: PortfolioDetail;
  timePeriod: "1M" | "6M" | "1Y" | "All";
  setTimePeriod: (p: "1M" | "6M" | "1Y" | "All") => void;
  sparkline?: number[];
  /** Prozpr's per-fund read, for the verdict lines under each holding. */
  verdicts?: Map<string, import("@/lib/api").InsightFundRow>;
  /** Value snapshots, for the "since you last looked" strip. */
  history?: PortfolioHistoryPoint[];
  /** The one action worth surfacing; null when nothing is computed yet. */
  action?: ReturnType<typeof nextAction>;
  onAskPi?: (prompt: string) => void;
  /** Opens the risk / horizon sheet from the allocation card's stats row. */
  onEditProfile?: () => void;
  riskCategory: string | null;
  horizonLabel: string | null;
  middleSlot?: ReactNode;
  /** When true, show the dated per-user NAV chart with its own horizon picker. */
  useNavChart?: boolean;
  /** True when no CAMS holdings exist → the chart offers an inline upload. */
  camsMissing?: boolean;
  /** Open the CAMS upload popup from the chart. */
  onUploadCams?: () => void;
  /** Re-open the insights popup after its once-per-session auto-open. */
  onOpenInsights?: () => void;
}) {
  const [analysisOpen, setAnalysisOpen] = useState(false);
  // Overall gain/loss vs what the user has put in (today's value − invested),
  // independent of the chart horizon.
  const investedGain =
    portfolio.total_invested != null && portfolio.total_invested > 0
      ? {
          amount: portfolio.total_value - portfolio.total_invested,
          pct:
            portfolio.total_gain_percentage ??
            ((portfolio.total_value - portfolio.total_invested) / portfolio.total_invested) * 100,
        }
      : null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  /* Commentary for the range the chart is showing. Held here rather than in the
     chart because it renders ABOVE the chart, under the gain chip — and it is
     replaced wholesale on every range switch, never merged, so a sentence from
     the 3Y view can't linger on a 1M chart. */
  const [chartCommentary, setChartCommentary] = useState<ChartNotes>({
    headline: null,
    notes: [],
    moments: [],
  });

  return (
    <div className="space-y-[10.12px]">
      {/* Total Portfolio — borderless, transparent so it blends into the page background. */}
      <div className="rounded-[14px] p-[14px]">
        <p className="mb-1 text-lg font-semibold text-foreground">Portfolio</p>

        <p className="text-2xl font-bold text-foreground tracking-tight">{fmtInr0(portfolio.total_value)}</p>

        {/* Overall gain/loss vs invested — ₹ amount, % return and an up/down
            arrow, coloured green (up) or red (down). */}
        {useNavChart && investedGain != null && (
          <div
            className={`mt-1 mb-3 flex items-center gap-1.5 text-[13px] font-semibold ${
              investedGain.amount >= 0 ? "text-wealth-green" : "text-destructive"
            }`}
          >
            {investedGain.amount >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span>
              {investedGain.amount >= 0 ? "Up" : "Down"} {fmtInr0(Math.abs(investedGain.amount))}
            </span>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 ${
                investedGain.pct >= 0
                  ? "border-wealth-green/30 bg-wealth-green/10"
                  : "border-destructive/30 bg-destructive/10"
              }`}
            >
              {investedGain.pct >= 0 ? "+" : "−"}
              {Math.abs(investedGain.pct).toLocaleString("en-IN", { maximumFractionDigits: 1 })}%
            </span>
          </div>
        )}

        {/* One sentence on the selected range — measured from the series, so it
            says what a value line cannot: how much of the move was money added
            versus market. The supporting detail lives in the Moments rail under
            the chart rather than being repeated here. */}
        {useNavChart && chartCommentary.headline && (
          <div className="mb-3">
            <p className="text-[12.5px] leading-snug text-foreground">
              {chartCommentary.headline}
            </p>
          </div>
        )}

        {/* What changed since the last snapshot — a reason to open the app
            that isn't "check the number". */}
        {history && history.length > 1 && portfolio && (
          <PortfolioSinceLast history={history} currentValue={portfolio.total_value} />
        )}

        <div data-tour="portfolio-chart">
        {useNavChart ? (
          <PortfolioNavChart
            camsMissing={camsMissing}
            onUploadCams={onUploadCams}
            onPeriodChange={(info) => setChartCommentary(info.notes)}
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

            <div className="-mx-[14px]">
              <NetWorthSparkline values={sparkline} />
            </div>
          </>
        )}
        </div>

        {/* Portfolio analysis — subtly lifted surface (bg-card + soft shadow, no border). */}
        <div className="mt-3 flex gap-2 pt-3" style={{ borderTop: "1px solid hsl(var(--hairline))" }}>
          <button
            type="button"
            data-tour="portfolio-analysis"
            onClick={() => setAnalysisOpen(true)}
            className="block flex-1 cursor-pointer rounded-xl bg-card px-3 py-2.5 text-center text-[13px] font-semibold text-foreground shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
          >
            Portfolio analysis →
          </button>
          {onOpenInsights && (
            <button
              type="button"
              onClick={onOpenInsights}
              className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-card px-3 py-2.5 text-center text-[13px] font-semibold text-foreground shadow-sm transition-all hover:shadow-md active:scale-[0.99]"
              style={{ border: "1px solid rgba(212, 168, 104, 0.45)" }}
            >
              Pi insights →
            </button>
          )}
        </div>
      </div>

      {/* Current allocation — borderless, blends into the page like the total. */}
      <div className="rounded-[14px] p-[14px]" data-tour="allocation">
        <CurrentAllocationCard
          portfolio={portfolio}
          riskCategory={riskCategory}
          horizonLabel={horizonLabel}
          verdicts={verdicts}
          onAskPi={onAskPi}
          onEditProfile={onEditProfile}
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

/** One of the two half-width tiles in Explore funds (All funds / Compare & rank). */
function DiscoverTile({
  icon: Icon,
  title,
  subtitle,
  iconClass,
  delay,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Tailwind classes for the icon chip — each tile gets its own hue. */
  iconClass: string;
  delay: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.3, delay, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={`${CARD} flex flex-col items-start text-left transition-all hover:shadow-sm active:scale-[0.98]`}
      style={CARD_BORDER}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </div>
      <p className="mt-2 text-[12.5px] font-semibold leading-tight text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
    </motion.button>
  );
}

/** Shared section heading — icon, title, one line of what the section is for. */
function SectionHeading({
  icon: Icon,
  iconColor,
  title,
  subtitle,
}: {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5">
        <Icon className="h-4 w-4" strokeWidth={2} style={{ color: iconColor }} />
        <p className="text-[16.2px] font-semibold text-foreground">{title}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

/**
 * Explore funds — the research toolkit: search any scheme, browse the universe,
 * or compare funds head to head. Everything here answers "tell me about a fund".
 *
 * This section IS the entry point: search resolves in place and the two tiles go
 * straight to their destinations, so there is no `/discovery` landing step in
 * between (that page only re-offered these same three things).
 */
function ExploreFundsSection() {
  const navigate = useNavigate();
  // Sector / thematic funds, each probed for a real fund count — a theme no AMC
  // offers here simply doesn't appear.
  const { groups: themeGroups } = useFundGroups("theme");
  return (
    <div className="pt-1">
      <SectionHeading
        icon={Sparkles}
        iconColor="#D4A868"
        title="Explore funds"
        subtitle="Search, browse and compare any mutual fund"
      />

      {/* Search resolves in place — matches render right under the field, so
          finding a fund from the dashboard costs no navigation. */}
      <DiscoverFundSearch cardBorder={CARD_BORDER} />

      {/* The two ways into the wider universe — half-width so they read as a
          pair of tools rather than two more things to scroll past. */}
      <div className="grid grid-cols-2 gap-2">
        <DiscoverTile
          icon={Layers}
          title="All funds"
          subtitle="The full universe, with search and filters"
          iconClass="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
          delay={0}
          onClick={() => navigate("/discovery/mf")}
        />
        <DiscoverTile
          icon={GitCompare}
          title="Compare & rank"
          subtitle="Overlay performance against Prozpr picks"
          iconClass="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
          delay={0.06}
          onClick={() => navigate("/discovery/compare")}
        />
      </div>

      {/* Browse by theme — the entry point for "I don't know what I want", as
          worlds rather than filters. Eight fit two clean rows of four; the rest
          are one tap away on the funds list. */}
      {themeGroups.length > 0 && (
        <div className="mt-4">
          {/* Heading and the escape hatch share a row — a full-width button below
              the circles read as a ninth theme rather than a way out. */}
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Browse by theme
            </p>
            {themeGroups.length > 8 && (
              <button
                type="button"
                onClick={() => navigate("/discovery/mf")}
                className="shrink-0 text-[11px] font-semibold text-foreground transition-colors hover:text-muted-foreground"
              >
                All themes →
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-3">
            {themeGroups.slice(0, 8).map((g, i) => (
              <ThemeCircle key={g.key} group={g} index={i} onOpen={() => navigate(groupHref(g))} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Ideas for you — strategies Prozpr suggests, as opposed to funds you look up.
 * Kept apart from Explore funds because they answer a different question: not
 * "tell me about a fund" but "here's a move worth considering". The green
 * treatment matches the Income + Arbitrage page itself, so the two sections
 * don't read as one undifferentiated list of cards.
 */
function IdeasSection() {
  const navigate = useNavigate();
  const GREEN = "#2E9C7E";
  return (
    <div className="pt-4">
      <SectionHeading
        icon={Lightbulb}
        iconColor={GREEN}
        title="Ideas for you"
        subtitle="Strategies worth a look, beyond your current plan"
      />

      <button
        type="button"
        onClick={() => navigate("/income-arbitrage")}
        className="w-full rounded-[14px] p-[14px] text-left transition-all hover:shadow-sm active:scale-[0.99]"
        style={{ backgroundColor: `${GREEN}0f`, border: `1px solid ${GREEN}59` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${GREEN}24`, color: GREEN }}
          >
            <Coins className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">
              Income + Arbitrage
            </p>
            {/* The actual proposition, not "steady, tax-efficient returns" —
                which said nothing a user could act on. */}
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              Debt-style returns, taxed like equity
            </p>
          </div>
          <span className="shrink-0 text-[13px] font-bold" style={{ color: GREEN }}>
            Explore →
          </span>
        </div>
        <div
          className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5"
          style={{ borderColor: `${GREEN}33` }}
        >
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{ backgroundColor: `${GREEN}24`, color: GREEN }}
          >
            12.5%
          </span>
          <span className="text-[11px] leading-snug text-muted-foreground">
            long-term tax rate, instead of your slab rate of up to ~30%
          </span>
        </div>
      </button>
    </div>
  );
}

/** Both Discover sections — fund research first, then the curated ideas. */
function DiscoverSection() {
  return (
    <div data-tour="discover">
      <ExploreFundsSection />
      <IdeasSection />
    </div>
  );
}

/** Everyday spending — idle cash (~3%) vs a liquid-funds nudge (~6%). */
function EverydaySpendingSection() {
  const navigate = useNavigate();
  const GREEN = "#2E9C7E";
  return (
    <div className="pt-1">
      <p className="mb-2 text-[16.2px] font-semibold text-foreground">Everyday spending</p>
      <div className={CARD} style={CARD_BORDER}>
        {/* Cash holding — idle cash at a savings-style rate */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">
            <Banknote className="h-[1.125rem] w-[1.125rem] text-muted-foreground" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">Cash holding</p>
            <p className="text-[11px] text-muted-foreground">Earning ~3% a year</p>
          </div>
          <p className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">₹1,50,000</p>
        </div>

        <div className="my-3 h-px bg-border" />

        {/* Liquid funds — currently empty */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${GREEN}1f` }}
          >
            <Droplet className="h-[1.125rem] w-[1.125rem]" strokeWidth={1.8} style={{ color: GREEN }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">Liquid funds</p>
            <p className="text-[11px] font-medium" style={{ color: GREEN }}>Earn ~6% a year</p>
          </div>
          <p className="shrink-0 text-[14px] font-semibold tabular-nums text-muted-foreground">₹0</p>
        </div>

        {/* Glowing CTA to move idle cash into liquid funds */}
        <motion.button
          type="button"
          onClick={() => navigate("/liquid-funds")}
          className="mt-3.5 flex w-full items-center justify-center gap-1 rounded-xl py-2.5 text-[13px] font-bold text-white transition-transform active:scale-[0.99]"
          style={{ backgroundColor: GREEN }}
          animate={{ boxShadow: [`0 0 0 0 ${GREEN}00`, `0 0 16px 3px ${GREEN}80`, `0 0 0 0 ${GREEN}00`] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          Move cash to earn ~6% →
        </motion.button>
      </div>
    </div>
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
    <div className="pt-1">
      {/* Title sits outside the card, like Discover / Everyday spending. */}
      <p className="mb-2 text-[16.2px] font-semibold text-foreground">Unlock more</p>
      <div className="rounded-[14px] border border-border bg-card p-4" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
            Share a little, unlock a lot
          </p>
        </div>
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

  const [insightsOpen, setInsightsOpen] = useState(false);

  /* ── v2 · Pi insights on the page ──────────────────────────────────────
     The verdicts, the value history and the chat prefill. All three feed the
     sections below; see docs/portfolio-page-v2.md. */
  const [insights, setInsights] = useState<PortfolioInsightsResponse | null>(null);
  const [history, setHistory] = useState<PortfolioHistoryPoint[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // A successful response always wins, even an empty one. The demo fallback
    // is ONLY for a failed call, so the v2 sections stay reviewable with the
    // backend down — see lib/portfolioDemoData.ts. Drop both `.catch` bodies
    // to restore the honest hide-on-failure behaviour.
    getPortfolioInsights()
      .then((r) => !cancelled && setInsights(r))
      .catch(() => !cancelled && setInsights(demoInsights(selfPortfolio)));
    getPortfolioHistory(30)
      .then((r) => !cancelled && setHistory(r))
      .catch(() => !cancelled && setHistory(demoHistory(selfPortfolio?.total_value ?? 0)));
    return () => { cancelled = true; };
    // Re-runs once the portfolio lands, so the demo verdicts can attach to the
    // funds actually on screen rather than to placeholder names.
  }, [selfPortfolio]);

  const verdicts = useMemo(() => indexVerdicts(insights), [insights]);
  const action = useMemo(() => nextAction(insights), [insights]);

  /** Open the chat sheet with a question already written into the composer. */
  const askPi = useCallback((prompt: string) => {
    setChatPrefill(prompt);
    setChatOpen(true);
  }, []);

  /* First-run walkthrough of the six things this page shows. Held until the
     portfolio has actually rendered — the tour spotlights real elements, and
     none of them exist while the skeletons are up. The header's "?" replays it. */
  const [tourOpen, setTourOpen] = useState(false);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem(PORTFOLIO_TOUR_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }, []);

  /* Only fire once, and only on the self view — it's the landing view, so a
     first-run tour belongs there rather than ambushing someone who has
     deliberately switched to a family member's portfolio. */
  const tourChecked = useRef(false);
  useEffect(() => {
    if (tourChecked.current) return;
    if (activeView.type !== "self") return;
    if (!selfPortfolio || selfPortfolio.total_value <= 0) return;
    tourChecked.current = true;
    try {
      if (localStorage.getItem(PORTFOLIO_TOUR_SEEN_KEY) !== "1") setTourOpen(true);
    } catch {
      /* private mode — just skip the tour rather than breaking the page */
    }
  }, [activeView.type, selfPortfolio]);

  const tourSteps = useMemo<TourStep[]>(() => {
    /* Several steps sit inside things the user has to open — the analysis modal
       and the holdings drawer. Rather than lifting their state up through three
       components, the tour clicks the real trigger, which is the same path a
       user takes. Each is guarded on whether the content is already mounted, so
       stepping backwards doesn't toggle it shut again.

       NOTE: `portfolio-analysis` and `view-holdings` are no longer any step's
       anchor, but they are still the buttons clicked below — don't remove those
       data-tour attributes as "unused". */
    const has = (name: string) => !!document.querySelector(`[data-tour="${name}"]`);
    const click = (name: string) =>
      document.querySelector<HTMLElement>(`[data-tour="${name}"]`)?.click();

    const closeAnalysis = () => {
      if (has("analysis-close")) click("analysis-close");
    };
    const openAnalysis = () => {
      if (!has("analysis-tabs")) click("portfolio-analysis");
    };
    const openHoldings = () => {
      closeAnalysis();
      if (!has("holdings-list")) click("view-holdings");
    };

    return [
      {
        anchor: "portfolio-chart",
        title: "How it got there",
        body: "Your value over time, rebuilt from your CAMS statement. If it looks short, upload a newer statement from the chart itself.",
        before: closeAnalysis,
      },
      {
        // Opens the modal rather than pointing at the button that opens it —
        // the panel itself is what the step is describing.
        anchor: "analysis-panel",
        title: "Portfolio analysis",
        body: "This is what opens: the breakdown behind your total, charted over a range you choose. Where the money sits, what's working, and what's quietly dragging.",
        before: openAnalysis,
      },
      {
        anchor: "analysis-tabs",
        title: "Two ways to read it",
        body: "Performance shows what your money earned over the range you pick. Value Build-Up splits the same period into what you paid in versus what the market added — so a rising total is never mistaken for a gain.",
        before: openAnalysis,
      },
      {
        anchor: "allocation",
        title: "Your current mix",
        body: "Equity, debt and the rest as they stand now, next to what your risk profile and horizon call for. Gaps here are what rebalancing closes.",
        before: closeAnalysis,
      },
      {
        anchor: "holdings-list",
        title: "Every fund you own",
        body: "Grouped into Equity, Debt and Others, and rankable by Value, Invested or Total return — the quickest way to spot what's carrying the portfolio and what's lagging. Tap any fund for its full detail.",
        before: openHoldings,
      },
      {
        anchor: "discover",
        title: "Where to go next",
        body: "Two different things: Explore funds is research — search any scheme right here, browse the universe, or compare funds head to head. Ideas for you is what we suggest, like holding income + arbitrage funds for their lower tax rate.",
        before: closeAnalysis,
      },
    ];
  }, []);

  // The insights popup is scoped to ONE person's funds — the backend answers for
  // whoever `X-Family-Member-Id` points at. The combined family view has no such
  // person, so it gets no popup rather than one member's numbers mislabelled as
  // the family's.
  const insightsPortfolio =
    activeView.type === "self"
      ? selfPortfolio
      : activeView.type === "member"
        ? memberPortfolio
        : null;

  // Auto-open every time the portfolio page is landed on, once the data behind
  // it actually exists — an empty popup on a brand-new account helps nobody.
  //
  // The guard is per MOUNT, not per session: navigating to the page opens the
  // popup again, but a mid-visit refetch (a CAMS upload, switching family
  // member) must not reopen it over a user who has already dismissed it.
  const insightsAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (insightsAutoOpenedRef.current) return;
    if (!insightsPortfolio || insightsPortfolio.total_value <= 0) return;
    insightsAutoOpenedRef.current = true;
    setInsightsOpen(true);
  }, [insightsPortfolio]);

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
      ? "Total portfolio"
      : activeView.type === "cumulative"
      ? "Family portfolio"
      : `${activeView.member.nickname}'s portfolio`;

  return (
    <div className="mobile-container bg-background flex flex-col min-h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-10 pb-2">
        <div>
          {activeView.type !== "self" && (
            <p className="text-lg font-semibold text-foreground">{viewLabel}</p>
          )}
          {activeView.type === "cumulative" && cumulativeData && (
            <p className="text-[10px] text-muted-foreground/60">
              {cumulativeData.member_count} members combined
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Replays the first-run walkthrough — it's shown once, and this is
              the only way back to it. */}
          <button
            type="button"
            onClick={() => setTourOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Show the portfolio guide"
            title="How this page works"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
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
            <div className="px-5 space-y-[10.12px] pb-24">
              <PortfolioMainPanel
                portfolio={cumulativeToPortfolioDetail(cumulativeData)}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={[cumulativeData.total_value / 100000]}
                verdicts={verdicts}
                history={history}
                action={action}
                onAskPi={askPi}
                onEditProfile={() => setProfileSheetOpen(true)}
                riskCategory={null}
                horizonLabel="Combined family"
                middleSlot={<CumulativeMemberBreakdownCard data={cumulativeData} />}
              />
              {action && <NextActionCard action={action} onAskPi={askPi} />}
              <DiscoverSection />
              <EverydaySpendingSection />
              {/* Zoom team-call feature disabled for now */}
              {/* <AdvisorMeetingsSlot /> */}
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
            <div className="px-5 space-y-[10.12px] pb-24">
              <PortfolioMainPanel
                portfolio={memberPortfolio}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={[memberPortfolio.total_value / 100000]}
                verdicts={verdicts}
                history={history}
                action={action}
                onAskPi={askPi}
                onEditProfile={() => setProfileSheetOpen(true)}
                riskCategory={null}
                horizonLabel={null}
                onOpenInsights={() => setInsightsOpen(true)}
              />
              {action && <NextActionCard action={action} onAskPi={askPi} />}
              <DiscoverSection />
              <EverydaySpendingSection />
              {/* Zoom team-call feature disabled for now */}
              {/* <AdvisorMeetingsSlot /> */}
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
            <div className="px-5 space-y-[10.12px] pb-24">
              <PortfolioMainPanel
                portfolio={selfPortfolio}
                timePeriod={timePeriod}
                setTimePeriod={setTimePeriod}
                sparkline={selfSparkline}
                verdicts={verdicts}
                history={history}
                action={action}
                onAskPi={askPi}
                onEditProfile={() => setProfileSheetOpen(true)}
                riskCategory={selfProfile?.risk_profile?.risk_category ?? null}
                horizonLabel={
                  selfProfile?.investment_profile?.total_horizon ??
                  selfProfile?.risk_profile?.investment_horizon ??
                  null
                }
                useNavChart
                camsMissing={cams.missing}
                onUploadCams={() => setCamsOpen(true)}
                onOpenInsights={() => setInsightsOpen(true)}
              />
              {action && <NextActionCard action={action} onAskPi={askPi} />}
              <DiscoverSection />
              <EverydaySpendingSection />
              <ProfileUnlockCircles />
              {/* Zoom team-call feature disabled for now */}
              {/* <AdvisorMeetingsSlot /> */}
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

      {/* Section 2 reads the allocation the page already fetched; sections 1 and 3
          fetch their own data, but only once the popup is actually opened. */}
      <PortfolioInsightsModal
        open={insightsOpen}
        onClose={() => setInsightsOpen(false)}
        portfolio={insightsPortfolio}
      />

      {/* First-run walkthrough — value, chart, analysis, insights, mix, discover. */}
      {/* Chat, opened from an "Ask Pi" with the question pre-written. Mounted
          here rather than navigating to /chat so the user keeps their place on
          the page they were asking about. */}
      {/* Risk and horizon — opened from the allocation card's stats row, so the
          values stay where they have always been. */}
      <RiskProfileSheet
        open={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
        riskCategory={selfProfile?.risk_profile?.risk_category ?? null}
        horizonLabel={selfProfile?.risk_profile?.investment_horizon ?? null}
        onSaved={() => setSelfReloadKey((k) => k + 1)}
      />

      <AIChatSheet
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        prefill={chatPrefill}
      />

      <GuidedTour steps={tourSteps} open={tourOpen} onClose={closeTour} />

      <BottomNav />
    </div>
  );
};

export default PortfolioDashboard;
