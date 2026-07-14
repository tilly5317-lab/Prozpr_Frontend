import { Fragment, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Target, Loader2, MessageCircle, Sparkles, Home, GraduationCap, Plane, BriefcaseBusiness, Heart, Car, Landmark, Trophy, Info, CalendarClock, RotateCcw, Pencil } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import confetti from "canvas-confetti";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";
import { formatMoneyInput } from "@/lib/utils";
import { queueChatBootstrapMessage } from "@/components/chat/AIChatPanel";
import {
  listGoals,
  createGoal,
  updateGoal,
  removeGoal,
  updatePersonalFinance,
  getPersonalFinance,
  computeCashflow,
  type GoalResponse,
  type CashflowPlanRunDetail,
  type AnnualCashflowRow,
} from "@/lib/api";
import { exportCashflowXls } from "@/lib/export-xls";
import { trackDetailedOnboardingSectionCompleted } from "@/lib/detailedOnboardingAnalytics";
import AnnualCashflowChart from "@/components/goals/AnnualCashflowChart";
import CashflowGate from "@/components/goals/CashflowGate";

/* ── Types ── */
interface Holding {
  fund: string;
  category: string;
  invested: number;
  current: number;
  gainPct: number;
}
interface ContributionSource {
  source: string;
  amount: number;
  pct: number;
}
interface Goal {
  id: string;
  icon: React.ReactNode;
  label: string;
  slug: string;
  targetAmount: number;
  targetDate: string;
  investedAmount: number;
  currentValue: number;
  progressPct: number;
  status: "on-track" | "behind";
  contributions: ContributionSource[];
  holdings: Holding[];
  suggestedContribution: number;
  suggestedLabel: string;
  monthlyContribution: number;
  priority: "Low" | "Medium" | "High";
  downPaymentPct?: number;
}

/* ── Helpers ── */
const formatINR = (v: number): string => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v.toLocaleString("en-IN")}`;
};

const formatCompact = (v: number): string => {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(0)}L`;
  return `₹${v.toLocaleString("en-IN")}`;
};

/** ISO date (yyyy-mm-dd) → "Mon YYYY" for projection horizon labels. */
const fmtFyDate = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatMonthOffset = (months: number): string => {
  if (months === 0) return "0 mo";
  if (months % 12 === 0) {
    const yrs = months / 12;
    return `${yrs} yr${yrs === 1 ? "" : "s"}`;
  }
  if (months < 12) return `${months} mo`;
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  return `${yrs}y ${rem}m`;
};

function isMortgageGoalName(name: string): boolean {
  const s = name.toLowerCase();
  return /home|house|property|apartment|flat|mortgage|down\s*payment/.test(s);
}

function goalIconFromName(name: string): React.ReactNode {
  const s = name.toLowerCase();
  if (s.includes("home") || s.includes("house")) return <Home className="h-4 w-4" strokeWidth={2} />;
  if (s.includes("educat") || s.includes("school") || s.includes("college")) return <GraduationCap className="h-4 w-4" strokeWidth={2} />;
  if (s.includes("travel") || s.includes("trip") || s.includes("vacation")) return <Plane className="h-4 w-4" strokeWidth={2} />;
  if (s.includes("retire")) return <BriefcaseBusiness className="h-4 w-4" strokeWidth={2} />;
  if (s.includes("car") || s.includes("vehicle")) return <Car className="h-4 w-4" strokeWidth={2} />;
  if (s.includes("wedding") || s.includes("marriage")) return <Heart className="h-4 w-4" strokeWidth={2} />;
  if (s.includes("emergency")) return <Landmark className="h-4 w-4" strokeWidth={2} />;
  return <Trophy className="h-4 w-4" strokeWidth={2} />;
}

const isGoalAchieved = (g: Goal): boolean =>
  Number.isFinite(g.targetAmount) && g.targetAmount > 0 && g.currentValue >= g.targetAmount;

/** Show withdrawal CTA only in the exact goal deadline month/year. */
const isGoalDeadlineInCurrentMonth = (g: Goal): boolean => {
  if (!g.targetDate?.trim()) return false;
  const { month, year } = parseTargetDateParts(g.targetDate);
  const monthIndex = months.indexOf(month);
  const yearNum = Number(year);
  if (monthIndex < 0 || !Number.isFinite(yearNum)) return false;
  const now = new Date();
  return monthIndex === now.getMonth() && yearNum === now.getFullYear();
};

const buildAchieveGoalChatMessage = (g: Goal): string => {
  const amount = formatINR(g.targetAmount);
  return `I would like to achieve the goal "${g.label}", for which I would like to withdraw ${amount}.`;
};

const parseTargetYear = (targetDate: string): number | null => {
  const parts = String(targetDate).trim().split(/\s+/);
  const y = parts.length >= 2 ? Number(parts[parts.length - 1]) : Number.NaN;
  if (!Number.isFinite(y) || y < 1900 || y > 2200) return null;
  return y;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const years = Array.from({ length: 30 }, (_, i) => 2025 + i);

function priorityBadgeClass(p: Goal["priority"]): string {
  if (p === "High")
    return "border border-red-500/20 bg-red-500/10 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  if (p === "Medium")
    return "border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "border border-border bg-muted text-muted-foreground";
}

function parseTargetDateParts(targetDate: string): { month: string; year: string } {
  const s = targetDate.trim();
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { month: parts[0], year: parts[parts.length - 1] };
  return { month: "Dec", year: String(new Date().getFullYear() + 5) };
}

function buildLocalGoal(input: {
  id?: string;
  name: string;
  targetAmount: number;
  targetDate: string;
  priority: "Low" | "Medium" | "High";
  investedAmount?: number;
  currentValue?: number;
  monthlyContribution?: number;
  downPaymentPct?: number;
}): Goal {
  const investedAmount = input.investedAmount ?? 0;
  const currentValue = input.currentValue ?? 0;
  const targetAmount = input.targetAmount;
  const progressPct =
    targetAmount > 0 ? Math.min(100, Math.round((currentValue / targetAmount) * 100)) : 0;
  const monthly =
    input.monthlyContribution != null && input.monthlyContribution > 0
      ? input.monthlyContribution
      : Math.max(1000, Math.round(targetAmount / 120));
  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "goal";
  return {
    id: input.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    icon: goalIconFromName(input.name),
    label: input.name,
    slug,
    targetAmount,
    targetDate: input.targetDate,
    investedAmount,
    currentValue,
    progressPct,
    status: progressPct >= 50 ? "on-track" : "behind",
    contributions: [],
    holdings: [],
    suggestedContribution: monthly,
    suggestedLabel: `${formatINR(monthly)}/mo`,
    monthlyContribution: input.monthlyContribution ?? 0,
    priority: input.priority,
    downPaymentPct: input.downPaymentPct,
  };
}


export interface GoalGamificationMetrics {
  displayCurrent: number;
  totalTargetActive: number;
  progressPctOverall: number;
  estimatedYearsAll: number | null;
  achievedCount: number;
  activeCount: number;
}

export function computeGoalGamification(
  goals: Goal[],
  userPortfolioTotal: number,
): GoalGamificationMetrics {
  const safePortfolio = Number.isFinite(userPortfolioTotal) && userPortfolioTotal >= 0 ? userPortfolioTotal : 0;
  const achieved = goals.filter(isGoalAchieved);
  const active = goals.filter((g) => !isGoalAchieved(g));
  const achievedTargetSum = achieved.reduce((s, g) => s + (Number.isFinite(g.targetAmount) ? g.targetAmount : 0), 0);
  const displayCurrent = Math.max(0, safePortfolio - achievedTargetSum);
  const totalTargetActive = active.reduce((s, g) => s + (Number.isFinite(g.targetAmount) ? g.targetAmount : 0), 0);
  const progressPctOverall =
    totalTargetActive > 0
      ? Math.min(100, (displayCurrent / totalTargetActive) * 100)
      : goals.length > 0 && active.length === 0
        ? 100
        : 0;

  const totalRemaining = active.reduce(
    (s, g) =>
      s +
      Math.max(
        0,
        (Number.isFinite(g.targetAmount) ? g.targetAmount : 0) - (Number.isFinite(g.currentValue) ? g.currentValue : 0),
      ),
    0,
  );
  const totalMonthly = active.reduce(
    (s, g) => s + Math.max(0, Number.isFinite(g.monthlyContribution) ? g.monthlyContribution : 0),
    0,
  );

  let estimatedYearsAll: number | null = null;
  if (active.length === 0) {
    estimatedYearsAll = 0;
  } else if (totalRemaining <= 0) {
    estimatedYearsAll = 0;
  } else if (totalMonthly > 0) {
    estimatedYearsAll = totalRemaining / (totalMonthly * 12);
  } else {
    const cy = new Date().getFullYear();
    let maxGapYears = 0;
    for (const g of active) {
      const ty = parseTargetYear(g.targetDate);
      if (ty != null) maxGapYears = Math.max(maxGapYears, Math.max(0, ty - cy));
    }
    estimatedYearsAll = maxGapYears > 0 ? maxGapYears : null;
  }

  return {
    displayCurrent,
    totalTargetActive,
    progressPctOverall,
    estimatedYearsAll,
    achievedCount: achieved.length,
    activeCount: active.length,
  };
}

/** Suggest an inflation rate based on the goal name. Returns null if no specific match. */
function suggestInflationForGoal(name: string): { rate: number; reason: string } | null {
  const s = name.toLowerCase();
  if (/educat|school|college|tuition|degree|university/.test(s))
    return { rate: 10, reason: "Education costs typically inflate ~10%/yr in India." };
  if (/health|medical|hospital/.test(s))
    return { rate: 12, reason: "Healthcare costs typically inflate ~12%/yr." };
  if (/wedding|marriage/.test(s))
    return { rate: 7, reason: "Wedding costs typically inflate ~7%/yr." };
  if (/home|house|property|apartment|flat/.test(s))
    return { rate: 6, reason: "Property prices have averaged ~6%/yr." };
  if (/retire/.test(s))
    return { rate: 6, reason: "Use ~6% to model long-horizon retirement corpus." };
  if (/travel|trip|vacation|holiday/.test(s))
    return { rate: 7, reason: "Travel costs typically inflate ~7%/yr." };
  if (/car|vehicle|bike/.test(s))
    return { rate: 5, reason: "Vehicle prices typically inflate ~5%/yr." };
  if (/emergency/.test(s))
    return { rate: 6, reason: "Use general CPI ~6%/yr." };
  return null;
}

function parseMoneyInput(raw: string): { ok: true; value: number } | { ok: false; message: string } {
  const t = raw.replace(/,/g, "").trim();
  if (t === "") return { ok: false, message: "Amount is required." };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, message: "Enter a valid number." };
  if (n < 0) return { ok: false, message: "Amount cannot be negative." };
  if (n > 1e15) return { ok: false, message: "Amount is too large." };
  return { ok: true, value: n };
}

const priorityRank = { High: 0, Medium: 1, Low: 2 } as const;

function etaLabel(g: GoalGamificationMetrics): string {
  if (g.estimatedYearsAll == null) return "Add monthly SIPs to estimate";
  if (g.estimatedYearsAll <= 0) return "Fully funded or on track";
  if (g.estimatedYearsAll < 1) return `≈ ${Math.max(1, Math.round(g.estimatedYearsAll * 12))} months`;
  return `≈ ${g.estimatedYearsAll.toFixed(1)} years`;
}

type TrackStatus = "on-track" | "behind" | "no-pace";

/**
 * Project whether the goal will hit its target at the current contribution rate.
 * "on-track" — projected corpus >= target by deadline.
 * "behind"   — projected corpus < target by deadline.
 * "no-pace"  — no monthly contribution set, can't project.
 */
function goalTrackStatus(g: Goal): TrackStatus {
  if (g.targetAmount <= 0) return "no-pace";
  if (g.currentValue >= g.targetAmount) return "on-track";
  const ty = parseTargetYear(g.targetDate);
  if (ty == null) return "no-pace";
  const yearsLeft = Math.max(0, ty - new Date().getFullYear());
  if (g.monthlyContribution <= 0) {
    // Without contributions, on-track only if already at target.
    return "no-pace";
  }
  const projected = g.currentValue + g.monthlyContribution * 12 * yearsLeft;
  return projected >= g.targetAmount ? "on-track" : "behind";
}

const TIMELINE_STATUS_BADGE = {
  ahead: {
    label: "Ahead",
    cls: "border border-emerald-500/30 bg-emerald-100/70 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
    dot: "#10B981",
  },
  "on-schedule": {
    label: "On schedule",
    cls: "border border-amber-500/30 bg-amber-100/70 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "#D4A868",
  },
  behind: {
    label: "Behind",
    cls: "border border-rose-500/30 bg-rose-100/70 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "#E04E5C",
  },
} as const;

const TRACK_BADGE: Record<TrackStatus, { label: string; cls: string; dot: string }> = {
  "on-track": {
    label: "On track",
    cls: "border border-amber-500/30 bg-amber-100/70 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    dot: "#D4A868",
  },
  behind: {
    label: "Behind",
    cls: "border border-rose-500/30 bg-rose-100/70 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    dot: "#E04E5C",
  },
  "no-pace": {
    label: "Set monthly",
    cls: "border border-border bg-muted text-muted-foreground",
    dot: "hsl(var(--muted-foreground))",
  },
};

/** Big donut showing % of target funded — gold arc on muted track. */
const ContributionDonut = ({ pct }: { pct: number }) => {
  const safe = Math.max(0, Math.min(100, pct));
  const SIZE = 144;
  const STROKE = 11;
  const radius = SIZE / 2 - STROKE / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safe / 100);
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={STROKE}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={radius}
          fill="none"
          stroke="#D4A868"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="text-[28px] font-bold tabular-nums tracking-tight text-foreground">
          {Math.round(safe)}%
        </span>
        <span className="mt-1 text-[11px] text-muted-foreground">complete</span>
      </div>
    </div>
  );
};

const MILESTONES = [25, 50, 75, 100] as const;

interface GoalCardProps {
  goal: Goal;
  onAchieve: () => void;
  achieved: boolean;
  showAchieve: boolean;
}

const GoalCard = ({ goal, onAchieve, achieved, showAchieve }: GoalCardProps) => {
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  // Negative = pull forward, positive = push back. Drives the what-if simulation.
  const [monthOffset, setMonthOffset] = useState(0);

  const baseMonthsLeft = useMemo(() => {
    const { month, year } = parseTargetDateParts(goal.targetDate);
    const monthIndex = months.indexOf(month);
    const yearNum = Number(year);
    if (monthIndex < 0 || !Number.isFinite(yearNum)) return 0;
    const now = new Date();
    const diff = (yearNum - now.getFullYear()) * 12 + (monthIndex - now.getMonth());
    return Math.max(0, diff);
  }, [goal.targetDate]);

  const minOffset = -Math.min(baseMonthsLeft, 60);
  const maxOffset = 120;
  const adjustedMonthsLeft = Math.max(0, baseMonthsLeft + monthOffset);

  const adjustedTargetLabel = useMemo(() => {
    const { month, year } = parseTargetDateParts(goal.targetDate);
    const monthIndex = months.indexOf(month);
    const yearNum = Number(year);
    if (monthIndex < 0 || !Number.isFinite(yearNum)) return goal.targetDate;
    const d = new Date(yearNum, monthIndex, 1);
    d.setMonth(d.getMonth() + monthOffset);
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }, [goal.targetDate, monthOffset]);

  // Inflation lift applied to the target when the user shifts the timeline.
  // 6% is the default Prozpr assumption — keeps the headline "(present value)"
  // honest by surfacing how much further inflation runs when the goal slips.
  const INFLATION_RATE = 0.06;
  const adjustedTargetAmount = useMemo(() => {
    if (goal.targetAmount <= 0) return 0;
    return goal.targetAmount * Math.pow(1 + INFLATION_RATE, monthOffset / 12);
  }, [goal.targetAmount, monthOffset]);

  const displayedTarget = whatIfOpen ? adjustedTargetAmount : goal.targetAmount;
  // Donut reflects current funded ratio against the (possibly inflation-shifted)
  // target. Pushing the date back inflates the target → % drops; pulling it
  // forward deflates the target → % climbs.
  const pctTarget = displayedTarget > 0 ? displayedTarget : goal.targetAmount;
  const displayedPct =
    pctTarget > 0
      ? Math.min(100, Math.max(0, (goal.currentValue / pctTarget) * 100))
      : 0;

  // Pace-based status: would the projected corpus hit the (inflation-lifted) target
  // by the (shifted) date? Slack tolerates a small over/undershoot so the badge
  // doesn't flicker for trivial slider nudges.
  const timelineStatus: "ahead" | "on-schedule" | "behind" = useMemo(() => {
    if (adjustedTargetAmount <= 0) return "on-schedule";
    if (goal.currentValue >= adjustedTargetAmount) return "ahead";
    if (goal.monthlyContribution <= 0 || adjustedMonthsLeft <= 0) return "behind";
    const monthsNeeded =
      (adjustedTargetAmount - goal.currentValue) / goal.monthlyContribution;
    const slack = Math.max(2, adjustedMonthsLeft * 0.05);
    if (monthsNeeded <= adjustedMonthsLeft - slack) return "ahead";
    if (monthsNeeded <= adjustedMonthsLeft + slack) return "on-schedule";
    return "behind";
  }, [
    adjustedTargetAmount,
    goal.currentValue,
    goal.monthlyContribution,
    adjustedMonthsLeft,
  ]);


  // Milestone crossing → small confetti pop.
  const prevPctRef = useRef(displayedPct);
  useEffect(() => {
    const prev = prevPctRef.current;
    const curr = displayedPct;
    if (curr > prev) {
      for (const m of MILESTONES) {
        if (prev < m && curr >= m) {
          confetti({
            particleCount: m === 100 ? 60 : 28,
            spread: m === 100 ? 80 : 50,
            startVelocity: 24,
            scalar: 0.7,
            origin: { y: 0.55 },
            colors: ["#D4A868", "#E5C079", "#F5EEDC", "#FFFFFF"],
          });
          break;
        }
      }
    }
    prevPctRef.current = curr;
  }, [displayedPct]);

  return (
    <li
      className={`overflow-hidden rounded-2xl border bg-card transition-colors ${
        achieved ? "border-emerald-500/30" : "border-border"
      }`}
    >
      <div className="relative p-4 pb-4">
        {/* Header: icon + name + target line */}
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground">
            {goal.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
              {goal.label}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatCompact(goal.targetAmount)}
              {goal.targetDate ? (
                <>
                  {" "}
                  by <span className="text-foreground/80">{goal.targetDate}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {/* Status pills */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {achieved ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Funded
            </span>
          ) : (() => {
            // Surface the timeline-shifted status so the badge updates live as
            // the user drags the goal-date slider.
            const cfg = TIMELINE_STATUS_BADGE[timelineStatus];
            return (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.cls}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                {cfg.label}
              </span>
            );
          })()}
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityBadgeClass(goal.priority)}`}
          >
            {goal.priority}
          </span>
          {whatIfOpen && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-100/70 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              <Sparkles className="h-3 w-3" />
              Timeline shift
            </span>
          )}
        </div>

        {/* Donut — tap to open timeline adjustment */}
        <button
          type="button"
          onClick={() => setWhatIfOpen((o) => !o)}
          className="mt-4 flex w-full justify-center rounded-2xl py-1 transition-colors hover:bg-muted/30"
          aria-label={`Adjust timeline for ${goal.label}`}
          aria-expanded={whatIfOpen}
        >
          <ContributionDonut pct={displayedPct} />
        </button>

        {/* Current / Target split */}
        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Current
            </p>
            <p
              className="mt-1 text-base font-bold text-foreground tabular-nums"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {formatCompact(goal.currentValue)}
            </p>
          </div>
          <span className="h-8 w-px bg-border/70" aria-hidden />
          <div className="text-center">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Target
              <span className="ml-1 text-[10px] normal-case tracking-normal text-muted-foreground/70">
                {whatIfOpen && monthOffset !== 0 ? "(inflation-adjusted)" : "(present value)"}
              </span>
            </p>
            <p
              className="mt-1 text-base font-bold text-foreground tabular-nums"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {formatCompact(displayedTarget)}
            </p>
          </div>
        </div>

        {/* Timeline-adjustment panel — slider shifts the goal date and inflates
            the target, drives the ahead/on-schedule/behind status. */}
        <AnimatePresence initial={false}>
          {whatIfOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="mt-4 rounded-xl border border-border/60 bg-muted/25 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Goal date
                  </span>
                  <span
                    className="text-xs font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {adjustedTargetLabel}
                    {monthOffset !== 0 && (
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                        ({monthOffset > 0 ? "+" : "−"}
                        {formatMonthOffset(Math.abs(monthOffset))})
                      </span>
                    )}
                  </span>
                </div>
                <Slider
                  value={[monthOffset]}
                  onValueChange={(v) => setMonthOffset(v[0])}
                  min={minOffset}
                  max={maxOffset}
                  step={1}
                  className="mt-2.5"
                  aria-label={`Shift ${goal.label} target date`}
                />
                <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground/70">
                  <span>Pull up</span>
                  <span>On schedule</span>
                  <span>Push back</span>
                </div>

                {monthOffset !== 0 && (
                  <div className="mt-2.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setMonthOffset(0)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      style={{ border: "1px solid hsl(var(--border))" }}
                      aria-label="Reset goal date to original"
                      title="Reset to original date"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {showAchieve && !achieved && (
          <div className="mt-3.5 rounded-2xl border border-border/60 bg-muted/35 px-3 py-3">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/90">Goal deadline is this month.</span>{" "}
              Open chat with Prozpr to plan your withdrawal and close the goal.
            </p>
            <button
              type="button"
              onClick={onAchieve}
              className="mt-2.5 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-primary/35 bg-background px-4 text-xs font-semibold text-primary shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/[0.06] active:scale-[0.99]"
              aria-label={`Plan withdrawal with Prozpr to complete goal: ${goal.label}`}
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Plan withdrawal with Prozpr
            </button>
          </div>
        )}
      </div>
    </li>
  );
};

/**
 * Inline editor for the monthly SIP shown on the projection. Writes to the single
 * canonical cashflow input (`starting_monthly_investment`) and recomputes the
 * projection, so editing it here is reflected everywhere (single source of truth).
 */
function SipEditor({ currentMonthly, onSaved }: { currentMonthly: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const begin = () => {
    setDraft(currentMonthly > 0 ? formatMoneyInput(String(Math.round(currentMonthly))) : "");
    setOpen(true);
  };

  const save = async () => {
    const parsed = parseMoneyInput(draft.trim() === "" ? "0" : draft);
    if (parsed.ok === false) {
      toast({ title: "Monthly SIP", description: parsed.message, variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updatePersonalFinance({ starting_monthly_investment: parsed.value });
      await computeCashflow();
      toast({ title: "SIP updated", description: `Monthly investment set to ${formatINR(parsed.value)}.` });
      setOpen(false);
      onSaved();
    } catch {
      toast({ title: "Couldn't update SIP", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={begin}
        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/60"
        aria-label="Edit monthly SIP"
      >
        <span className="tabular-nums">{currentMonthly > 0 ? `SIP ${formatINR(currentMonthly)}/mo` : "Set SIP"}</span>
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    );
  }
  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">₹</span>
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(formatMoneyInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="0"
        className="w-24 rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="inline-flex items-center rounded-lg bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={() => setOpen(false)}
        className="text-[11px] text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}

/* ── Main ── */
function mapGoalResponse(g: GoalResponse): Goal {
  const targetDate = g.target_date
    ? (() => { const d = new Date(g.target_date); return `${months[d.getMonth()]} ${d.getFullYear()}`; })()
    : "Dec 2030";
  return buildLocalGoal({
    id: g.id,
    name: g.name,
    targetAmount: g.target_amount ?? 0,
    targetDate,
    priority: (g.priority === "HIGH" ? "High" : g.priority === "LOW" ? "Low" : "Medium") as "Low" | "Medium" | "High",
    investedAmount: g.invested_amount ?? 0,
    currentValue: g.current_value ?? 0,
    monthlyContribution: g.monthly_contribution ?? g.suggested_contribution ?? 0,
  });
}

const GoalPlanner = () => {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [addGoalSaving, setAddGoalSaving] = useState(false);
  const [fundFlowInfoOpen, setFundFlowInfoOpen] = useState(false);

  const [cashflowData, setCashflowData] = useState<CashflowPlanRunDetail | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  // The single canonical monthly SIP (`starting_monthly_investment`) — the SAME
  // value the cashflow inputs form edits, so the goal-page SIP stays in sync.
  const [sipMonthly, setSipMonthly] = useState<number | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const res = await listGoals();
      setGoals(res.map(mapGoalResponse));
    } catch {
      // Leave the list empty on failure — never show fabricated demo goals.
    } finally {
      setGoalsLoading(false);
    }
  }, []);

  const fetchCashflow = useCallback(async () => {
    setCashflowLoading(true);
    try {
      // Force a fresh recompute so the projection always reflects the CURRENT
      // engine + the user's current goals/retirement age. `/cashflow/latest`
      // only auto-recomputes on an engine-version bump or an explicit stale flag
      // — NOT when goals/retirement change — so it can serve an outdated run that
      // stops at the last goal instead of running to max(last_goal, retirement).
      const res = await computeCashflow();
      setCashflowData(res);
    } catch {
      // Cashflow may not be available yet
    } finally {
      setCashflowLoading(false);
    }
  }, []);

  const fetchSip = useCallback(async () => {
    try {
      const pf = await getPersonalFinance();
      setSipMonthly(pf.starting_monthly_investment ?? null);
    } catch {
      // SIP not set yet — the editor shows "Set SIP".
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    fetchCashflow();
    fetchSip();
  }, [fetchGoals, fetchCashflow, fetchSip]);
  const [holdingsGoal, setHoldingsGoal] = useState<Goal | null>(null);

  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTarget, setAddTarget] = useState("");
  const [addMonth, setAddMonth] = useState("Dec");
  const [addYear, setAddYear] = useState(String(new Date().getFullYear() + 5));
  const [addMonthly, setAddMonthly] = useState("");
  const [addPriority, setAddPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [addAmountKind, setAddAmountKind] = useState<"present" | "future">("future");
  const [addInflation, setAddInflation] = useState("");
  const [addDownPaymentPct, setAddDownPaymentPct] = useState("");
  const inflationSuggestion = useMemo(() => suggestInflationForGoal(addName), [addName]);
  const addIsMortgageGoal = useMemo(() => isMortgageGoalName(addName), [addName]);

  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editMonth, setEditMonth] = useState("Dec");
  const [editYear, setEditYear] = useState("2030");
  const [editSavings, setEditSavings] = useState("");
  const [editCurrent, setEditCurrent] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [editPriority, setEditPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [editAmountKind, setEditAmountKind] = useState<"present" | "future">("future");
  const [editInflation, setEditInflation] = useState("");
  const [editDownPaymentPct, setEditDownPaymentPct] = useState("");
  const editInflationSuggestion = useMemo(
    () => suggestInflationForGoal(editName),
    [editName],
  );
  const editIsMortgageGoal = useMemo(() => isMortgageGoalName(editName), [editName]);

  const sortedGoals = useMemo(
    () => [...goals].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]),
    [goals],
  );

  // Current progress is measured against the engine's real net financial assets
  // (corpus_today from the fund-flow summary), not a hardcoded portfolio total.
  const userPortfolioTotal = cashflowData?.fund_flow_summary?.corpus_today ?? 0;
  const gamification = useMemo(
    () => computeGoalGamification(goals, userPortfolioTotal),
    [goals, userPortfolioTotal],
  );
  const totalInvested = goals.reduce((s, g) => s + g.investedAmount, 0);
  const totalCurrent = goals.reduce((s, g) => s + g.currentValue, 0);
  const overallGainPct = totalInvested > 0 ? ((totalCurrent - totalInvested) / totalInvested) * 100 : 0;

  const openEdit = useCallback((goal: Goal) => {
    setEditGoal(goal);
    setEditName(goal.label);
    setEditTarget(formatMoneyInput(String(goal.targetAmount)));
    const { month, year } = parseTargetDateParts(goal.targetDate);
    setEditMonth(month);
    setEditYear(year);
    setEditSavings(formatMoneyInput(String(goal.investedAmount)));
    setEditCurrent(formatMoneyInput(String(goal.currentValue)));
    setEditMonthly(formatMoneyInput(String(goal.monthlyContribution)));
    setEditPriority(goal.priority);
    setEditAmountKind("future");
    setEditInflation("");
    setEditDownPaymentPct(
      goal.downPaymentPct != null && Number.isFinite(goal.downPaymentPct)
        ? String(goal.downPaymentPct)
        : "",
    );
  }, []);

  const openAchieveGoalInChat = useCallback(
    (goal: Goal) => {
      if (!isGoalDeadlineInCurrentMonth(goal)) return;
      queueChatBootstrapMessage(buildAchieveGoalChatMessage(goal));
      navigate("/chat");
    },
    [navigate],
  );

  const saveEdit = useCallback(() => {
    if (!editGoal) return;
    const name = editName.trim();
    if (!name) {
      toast({ title: "Invalid goal name", description: "Please enter a goal name.", variant: "destructive" });
      return;
    }
    const targetParsed = parseMoneyInput(editTarget);
    if (targetParsed.ok === false) {
      toast({ title: "Target amount", description: targetParsed.message, variant: "destructive" });
      return;
    }
    if (targetParsed.value <= 0) {
      toast({ title: "Target amount", description: "Target must be greater than zero.", variant: "destructive" });
      return;
    }
    const savingsParsed = parseMoneyInput(editSavings);
    if (savingsParsed.ok === false) {
      toast({ title: "Allocated savings", description: savingsParsed.message, variant: "destructive" });
      return;
    }
    const currentParsed = parseMoneyInput(editCurrent);
    if (currentParsed.ok === false) {
      toast({ title: "Current corpus", description: currentParsed.message, variant: "destructive" });
      return;
    }
    const monthlyParsed = parseMoneyInput(editMonthly);
    if (monthlyParsed.ok === false) {
      toast({ title: "Monthly contribution", description: monthlyParsed.message, variant: "destructive" });
      return;
    }

    let finalTarget = targetParsed.value;
    if (editAmountKind === "present") {
      const inflationRaw = editInflation.trim() === "" ? "0" : editInflation;
      const inflationNum = Number(inflationRaw);
      if (!Number.isFinite(inflationNum) || inflationNum < 0 || inflationNum > 50) {
        toast({
          title: "Inflation rate",
          description: "Enter an inflation rate between 0 and 50%.",
          variant: "destructive",
        });
        return;
      }
      const yearsToTarget = Math.max(
        0,
        Number(editYear) - new Date().getFullYear(),
      );
      finalTarget = targetParsed.value * Math.pow(1 + inflationNum / 100, yearsToTarget);
    }

    if (currentParsed.value > finalTarget) {
      toast({
        title: "Amounts don't match",
        description: "Current corpus cannot exceed the target amount.",
        variant: "destructive",
      });
      return;
    }

    let downPaymentPct: number | undefined;
    if (editIsMortgageGoal && editDownPaymentPct.trim() !== "") {
      const pct = Number(editDownPaymentPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast({
          title: "Down payment %",
          description: "Enter a percentage between 0 and 100.",
          variant: "destructive",
        });
        return;
      }
      downPaymentPct = pct;
    }

    const updated = buildLocalGoal({
      id: editGoal.id,
      name,
      targetAmount: Math.round(finalTarget),
      targetDate: `${editMonth} ${editYear}`,
      priority: editPriority,
      investedAmount: savingsParsed.value,
      currentValue: currentParsed.value,
      monthlyContribution: monthlyParsed.value,
      downPaymentPct,
    });
    setGoals((prev) => prev.map((g) => (g.id === editGoal.id ? updated : g)));
    setEditGoal(null);
    toast({ title: "Goal updated", description: `${name} has been saved.` });
    const targetDateStr = `${editYear}-${String(months.indexOf(editMonth) + 1).padStart(2, "0")}-01`;
    updateGoal(editGoal.id, {
      name,
      target_amount: Math.round(finalTarget),
      target_date: targetDateStr,
      priority: editPriority.toUpperCase(),
      monthly_contribution: monthlyParsed.value,
    }).then(() => fetchCashflow()).catch(() => {});
  }, [editGoal, editName, editTarget, editMonth, editYear, editSavings, editCurrent, editMonthly, editPriority, editAmountKind, editInflation, editIsMortgageGoal, editDownPaymentPct, fetchCashflow]);

  const deleteGoalHandler = useCallback(() => {
    if (!editGoal) return;
    const id = editGoal.id;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setEditGoal(null);
    toast({ title: "Goal removed", description: "Your overview has been updated." });
    removeGoal(id).then(() => fetchCashflow()).catch(() => {});
  }, [editGoal, fetchCashflow]);

  const resetAddGoalForm = useCallback(() => {
    setAddName("");
    setAddTarget("");
    setAddMonth("Dec");
    setAddYear(String(new Date().getFullYear() + 5));
    setAddMonthly("");
    setAddPriority("Medium");
    setAddAmountKind("future");
    setAddInflation("");
    setAddDownPaymentPct("");
  }, []);

  const submitAddGoal = useCallback(async () => {
    const name = addName.trim();
    if (!name) {
      toast({ title: "Goal name", description: "Please enter what you're saving for.", variant: "destructive" });
      return;
    }
    if (name.length > 120) {
      toast({ title: "Goal name", description: "Please use a shorter name (120 characters max).", variant: "destructive" });
      return;
    }
    const targetParsed = parseMoneyInput(addTarget);
    if (targetParsed.ok === false) {
      toast({ title: "Target corpus", description: targetParsed.message, variant: "destructive" });
      return;
    }
    if (targetParsed.value <= 0) {
      toast({ title: "Target corpus", description: "Enter a target greater than zero.", variant: "destructive" });
      return;
    }
    const monthlyRaw = addMonthly.trim() === "" ? "0" : addMonthly;
    const monthlyParsed = parseMoneyInput(monthlyRaw);
    if (monthlyParsed.ok === false) {
      toast({ title: "Monthly contribution", description: monthlyParsed.message, variant: "destructive" });
      return;
    }

    let finalTarget = targetParsed.value;
    if (addAmountKind === "present") {
      const inflationRaw = addInflation.trim() === "" ? "0" : addInflation;
      const inflationNum = Number(inflationRaw);
      if (!Number.isFinite(inflationNum) || inflationNum < 0 || inflationNum > 50) {
        toast({ title: "Inflation rate", description: "Enter an inflation rate between 0 and 50%.", variant: "destructive" });
        return;
      }
      const yearsToTarget = Math.max(0, Number(addYear) - new Date().getFullYear());
      finalTarget = targetParsed.value * Math.pow(1 + inflationNum / 100, yearsToTarget);
    }

    let downPaymentPct: number | undefined;
    if (addIsMortgageGoal && addDownPaymentPct.trim() !== "") {
      const pct = Number(addDownPaymentPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        toast({
          title: "Down payment %",
          description: "Enter a percentage between 0 and 100.",
          variant: "destructive",
        });
        return;
      }
      downPaymentPct = pct;
    }

    setAddGoalSaving(true);
    try {
      const targetDateStr = `${addYear}-${String(months.indexOf(addMonth) + 1).padStart(2, "0")}-01`;
      const res = await createGoal({
        name,
        target_amount: Math.round(finalTarget),
        target_date: targetDateStr,
        priority: addPriority.toUpperCase(),
        monthly_contribution: monthlyParsed.value,
      });
      // Having ≥1 goal is what marks the "What are you trying to achieve?"
      // profile section confirmed, so a saved goal = section completed.
      trackDetailedOnboardingSectionCompleted("goal_planning");
      setGoals((prev) => [...prev, mapGoalResponse(res)]);
      resetAddGoalForm();
      setAddGoalOpen(false);
      toast({ title: "Goal added", description: `${name} is now in your plan.` });
      fetchCashflow();
    } catch {
      const created = buildLocalGoal({
        name,
        targetAmount: Math.round(finalTarget),
        targetDate: `${addMonth} ${addYear}`,
        priority: addPriority,
        monthlyContribution: monthlyParsed.value,
        downPaymentPct,
      });
      setGoals((prev) => [...prev, created]);
      resetAddGoalForm();
      setAddGoalOpen(false);
      toast({ title: "Goal added (offline)", description: `${name} saved locally.` });
    } finally {
      setAddGoalSaving(false);
    }
  }, [addName, addTarget, addMonth, addYear, addMonthly, addPriority, addAmountKind, addInflation, addIsMortgageGoal, addDownPaymentPct, resetAddGoalForm]);

  const sheetInputClass =
    "w-full min-h-[48px] rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="mobile-container min-h-screen bg-background pb-28">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="flex items-center gap-3 px-5 pt-10 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">Goals</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate("/goal-planner/timeline")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[11.5px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/60"
            aria-label="Open goals timeline"
          >
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} />
            Timeline
          </button>
          <button
            type="button"
            onClick={() => navigate("/goal-planner/timeline-2")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[11.5px] font-semibold text-foreground shadow-sm transition-colors hover:bg-muted/60"
            aria-label="Open goals timeline 2"
          >
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2} />
            Timeline 2
          </button>
          <button
            type="button"
            onClick={() => setAddGoalOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            aria-label="Add goal"
          >
            <Plus className="h-5 w-5" strokeWidth={2.25} />
          </button>
        </div>
      </header>

      <motion.main
        className="px-5 pt-4 space-y-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        {/* Overview */}
        <motion.section
          className="overflow-hidden rounded-2xl border border-border bg-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.05, ease: "easeOut" }}
        >
          <div
            className="border-b border-border px-4 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Portfolio vs active target</p>
                <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {formatINR(gamification.displayCurrent)}
                  <span className="text-base font-medium text-muted-foreground"> / </span>
                  <span className="text-lg font-semibold text-muted-foreground">
                    {gamification.totalTargetActive > 0
                      ? formatINR(gamification.totalTargetActive)
                      : goals.length === 0
                        ? "—"
                        : formatINR(0)}
                  </span>
                </p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border">
            <div className="bg-card/90 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Open</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{gamification.activeCount}</p>
            </div>
            <div className="bg-card/90 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">Done</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{gamification.achievedCount}</p>
            </div>
          </div>
        </motion.section>

        {/* Fund flow projection */}
        <motion.section
          className="overflow-hidden rounded-2xl border border-border bg-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.08, ease: "easeOut" }}
        >
          {(() => {
            const ff = cashflowData?.fund_flow_summary ?? null;
            const h = cashflowData?.headline ?? null;
            // Until the engine has produced a real projection, show a placeholder
            // instead of fabricated numbers. (Page is gated until inputs exist.)
            if (!ff) {
              return (
                <div className="px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Goals projection
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {cashflowLoading
                      ? "Loading your projection…"
                      : "Complete your cashflow inputs to see your projection."}
                  </p>
                </div>
              );
            }
            const horizonBits = [
              h?.last_fy_end_date ? `Through ${fmtFyDate(h.last_fy_end_date)}` : null,
              h?.years_to_last_goal ? `${h.years_to_last_goal} yrs` : null,
            ].filter(Boolean);
            const rows = [
              { label: "Beginning financial assets", value: ff.corpus_opening, kind: "neutral" as const, oneOff: false },
              { label: "+ Investments", value: ff.total_investments, kind: "positive" as const, oneOff: false },
              { label: "+ Return on investments", value: ff.total_roi, kind: "positive" as const, oneOff: false },
              ...(ff.total_one_off_in
                ? [{ label: "+ One-off income", value: ff.total_one_off_in, kind: "positive" as const, oneOff: true }]
                : []),
              ...(ff.total_one_off_out
                ? [{ label: "− One-off expense", value: -Math.abs(ff.total_one_off_out), kind: "negative" as const, oneOff: true }]
                : []),
              { label: "− Goals", value: -Math.abs(ff.total_goals_paid), kind: "negative" as const, oneOff: false },
            ];
            const closing = ff.corpus_closing;
            return (
              <>
                <div className="border-b border-border px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Goals projection
                    </p>
                    <SipEditor
                      currentMonthly={sipMonthly ?? 0}
                      onSaved={() => {
                        fetchCashflow();
                        fetchSip();
                      }}
                    />
                  </div>
                  {horizonBits.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{horizonBits.join(" · ")}</p>
                  )}
                  {h && (
                    <p
                      className={`mt-1 text-[11px] font-semibold ${
                        (h.total_shortfall_fv ?? 0) > 0
                          ? "text-destructive"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {(h.total_shortfall_fv ?? 0) > 0
                        ? `Shortfall of ${formatINR(h.total_shortfall_fv)} across your goals`
                        : "On track — your plan funds every goal"}
                    </p>
                  )}
                </div>

                <ul className="divide-y divide-border/60">
                  {rows.map((row, idx, arr) => {
                    const nextIsOneOff = arr[idx + 1]?.oneOff === true;
                    return (
                      <Fragment key={row.label}>
                        <li className="flex items-center justify-between px-4 py-2">
                          <span className="inline-flex items-center gap-1 text-xs text-foreground/85">
                            {row.label}
                            {row.oneOff && (
                              <button
                                type="button"
                                onClick={() => setFundFlowInfoOpen((o) => !o)}
                                aria-label="About one-off income and expense"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Info className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                          <span
                            className={`text-xs font-semibold tabular-nums ${
                              row.kind === "positive"
                                ? "text-emerald-700 dark:text-emerald-400"
                                : row.kind === "negative"
                                  ? "text-destructive"
                                  : "text-foreground"
                            }`}
                          >
                            {row.value < 0 ? "−" : ""}
                            {formatINR(Math.abs(row.value))}
                          </span>
                        </li>
                        {row.oneOff && !nextIsOneOff && fundFlowInfoOpen && (
                          <li className="bg-muted/40 px-4 py-2.5">
                            <p className="text-[11px] leading-relaxed text-foreground">
                              <strong>One-off income</strong> and <strong>one-off expense</strong> are amounts
                              expected within the next year — bonuses, inheritance, a major purchase or trip —
                              not part of your regular monthly cash flow.
                            </p>
                          </li>
                        )}
                      </Fragment>
                    );
                  })}
                  <li
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ backgroundColor: "hsl(var(--muted) / 0.4)" }}
                  >
                    <span className="text-xs font-semibold text-foreground">
                      Closing financial assets{h?.last_fy_end_date ? ` · ${fmtFyDate(h.last_fy_end_date)}` : ""}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        closing >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
                      }`}
                    >
                      {closing < 0 ? "−" : ""}
                      {formatINR(Math.abs(closing))}
                    </span>
                  </li>
                </ul>

                <div className="border-t border-border px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Goal funding status
                  </p>
                  <div className="mt-2 grid grid-cols-[1fr_auto] gap-y-1.5 text-xs">
                    <span className="text-muted-foreground">Net financial assets</span>
                    <span className="text-right font-semibold tabular-nums text-foreground">
                      {formatINR(ff.corpus_today)}
                    </span>
                    <span className="text-muted-foreground">Goals today (PV)</span>
                    <span className="text-right font-semibold tabular-nums text-foreground">
                      {formatINR(ff.total_corpus_required_today)}
                    </span>
                    <span className="text-muted-foreground">
                      {ff.surplus_or_shortfall_today >= 0 ? "Present surplus" : "Present gap"}
                    </span>
                    <span
                      className={`text-right font-semibold tabular-nums ${
                        ff.surplus_or_shortfall_today >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-destructive"
                      }`}
                    >
                      {ff.surplus_or_shortfall_today < 0 ? "−" : ""}
                      {formatINR(Math.abs(ff.surplus_or_shortfall_today))}
                    </span>
                    {h && (
                      <>
                        <span className="text-muted-foreground">Future gap</span>
                        <span
                          className={`text-right font-semibold tabular-nums ${
                            (h.total_shortfall_fv ?? 0) > 0
                              ? "text-destructive"
                              : "text-emerald-700 dark:text-emerald-400"
                          }`}
                        >
                          {(h.total_shortfall_fv ?? 0) > 0 ? "−" : ""}
                          {formatINR(Math.abs(h.total_shortfall_fv ?? 0))}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </motion.section>

        {/* Annual Cashflow Chart */}
        {cashflowData && cashflowData.annual_cashflow.length > 0 && (
          <motion.section
            className="overflow-hidden rounded-2xl border border-border bg-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, delay: 0.09, ease: "easeOut" }}
          >
            <div className="border-b border-border px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Annual cashflow
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {cashflowData.annual_cashflow.length} years projected
                </p>
              </div>
              <button
                type="button"
                onClick={() => exportCashflowXls(cashflowData.annual_cashflow, cashflowData.monthly_cashflow)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[11px] font-medium text-foreground shadow-sm hover:bg-muted/60 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                </svg>
                Download
              </button>
            </div>
            <div className="px-2 py-3">
              <AnnualCashflowChart data={cashflowData.annual_cashflow} />
            </div>
          </motion.section>
        )}
        {cashflowLoading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Loading cashflow projection...</span>
          </div>
        )}

        {/* Goal list */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, delay: 0.1, ease: "easeOut" }}
        >
          <div className="mb-3 flex items-end justify-between gap-2 px-0.5">
            <h2 className="text-sm font-semibold text-foreground">Your goals</h2>
            <span className="rounded-full border border-border/60 bg-card/80 px-2.5 py-0.5 text-[11px] text-muted-foreground">{sortedGoals.length} total</span>
          </div>

          {sortedGoals.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Target className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="mt-4 text-lg font-semibold text-foreground">Start with one goal</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Name it, set a target corpus, and optionally add what you already save each month.
              </p>
              <button
                type="button"
                onClick={() => setAddGoalOpen(true)}
                className="mt-6 min-h-[48px] rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              >
                Create goal
              </button>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {sortedGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    achieved={isGoalAchieved(goal)}
                    showAchieve={isGoalDeadlineInCurrentMonth(goal)}
                    onAchieve={() => openAchieveGoalInChat(goal)}
                  />
                ))}
              </ul>
              <p className="mt-3 text-[11px] italic leading-relaxed text-muted-foreground/80">
                * Targets are shown at their value on the goal date (inflation included). When adding a goal you can enter its amount in today&apos;s money and we&apos;ll inflate it to the target date for you.
              </p>
            </>
          )}
        </motion.section>
      </motion.main>

      {/* Edit modal — centered */}
      <AnimatePresence>
        {editGoal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-[2px] px-4"
            onClick={() => setEditGoal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-2xl"
            >
              <div className="px-5 pt-5 pb-6">
                <h3 className="text-lg font-semibold text-foreground">Edit goal</h3>
                <p className="mt-1 text-xs text-muted-foreground">Changes apply immediately to your overview.</p>

                <label className="mt-6 block text-xs font-medium text-muted-foreground">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${sheetInputClass} mt-1.5`} />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Target amount (₹)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editTarget}
                  onChange={(e) => setEditTarget(formatMoneyInput(e.target.value))}
                  className={`${sheetInputClass} mt-1.5`}
                />

                <p className="mt-3 text-[11px] font-medium text-muted-foreground">
                  Is this in today&apos;s money or at the target date?
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {([
                    { id: "present", label: "Today's value", hint: "Will inflate to target date" },
                    { id: "future", label: "Future value", hint: "Already inflation-adjusted" },
                  ] as const).map((opt) => {
                    const active = editAmountKind === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setEditAmountKind(opt.id)}
                        className={`min-h-[56px] rounded-xl border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-primary bg-primary/[0.06] text-foreground"
                            : "border-input bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="mt-0.5 text-[11px] leading-tight">{opt.hint}</p>
                      </button>
                    );
                  })}
                </div>

                {editAmountKind === "present" && (
                  <>
                    <label className="mt-4 block text-xs font-medium text-muted-foreground">
                      Expected inflation (%/yr)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={editInflation}
                      onChange={(e) => setEditInflation(e.target.value)}
                      placeholder={
                        editInflationSuggestion
                          ? String(editInflationSuggestion.rate)
                          : "6"
                      }
                      className={`${sheetInputClass} mt-1.5`}
                    />
                    {editInflationSuggestion && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditInflation(String(editInflationSuggestion.rate))
                        }
                        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        <Sparkles className="h-3 w-3" />
                        Prozpr suggests {editInflationSuggestion.rate}% — {editInflationSuggestion.reason}
                      </button>
                    )}
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
                      You can override this assumption — it&apos;s based on Prozpr&apos;s
                      research for this goal category.
                    </p>
                  </>
                )}

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Target date</label>
                <div className="mt-1.5 flex gap-2">
                  <select
                    value={editMonth}
                    onChange={(e) => setEditMonth(e.target.value)}
                    className={`${sheetInputClass} flex-1 appearance-none`}
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editYear}
                    onChange={(e) => setEditYear(e.target.value)}
                    className={`${sheetInputClass} flex-1 appearance-none`}
                  >
                    {years.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Invested / allocated (₹)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editSavings}
                  onChange={(e) => setEditSavings(formatMoneyInput(e.target.value))}
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Current corpus toward target (₹)</label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  When this reaches the target, the goal is marked complete and its target is excluded from your active total.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editCurrent}
                  onChange={(e) => setEditCurrent(formatMoneyInput(e.target.value))}
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Monthly contribution (₹)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editMonthly}
                  onChange={(e) => setEditMonthly(formatMoneyInput(e.target.value))}
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Priority</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["Low", "Medium", "High"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditPriority(p)}
                      className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                        editPriority === p
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {editIsMortgageGoal && (
                  <>
                    <label className="mt-4 block text-xs font-medium text-muted-foreground">
                      Down payment % of property value
                    </label>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      The share of total property value you plan to put down (e.g. 20%).
                    </p>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="1"
                      value={editDownPaymentPct}
                      onChange={(e) => setEditDownPaymentPct(e.target.value)}
                      placeholder="20"
                      className={`${sheetInputClass} mt-1.5`}
                    />
                  </>
                )}

                <div className="mt-8 space-y-3 border-t border-border/60 pt-6">
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    className="w-full min-h-[52px] rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteGoalHandler()}
                    className="w-full min-h-[48px] rounded-xl border border-destructive/25 bg-destructive/5 text-sm font-semibold text-destructive hover:bg-destructive/10"
                  >
                    Delete goal
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add goal modal — centered */}
      <AnimatePresence>
        {addGoalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 backdrop-blur-[2px] px-4"
            onClick={() => {
              setAddGoalOpen(false);
              resetAddGoalForm();
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border/80 bg-card shadow-2xl"
            >
              <div className="px-5 pt-5 pb-6">
                <h3 className="text-lg font-semibold text-foreground">New goal</h3>
                <p className="mt-1 text-xs text-muted-foreground">Set a target corpus and timeline. You can refine later.</p>

                <label className="mt-6 block text-xs font-medium text-muted-foreground">Goal name</label>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Emergency fund"
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Target corpus (₹)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={addTarget}
                  onChange={(e) => setAddTarget(formatMoneyInput(e.target.value))}
                  placeholder="5,00,000"
                  className={`${sheetInputClass} mt-1.5`}
                />

                <p className="mt-3 text-[11px] font-medium text-muted-foreground">Is this in today's money or at the target date?</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {([
                    { id: "present", label: "Today's value", hint: "Will inflate to target date" },
                    { id: "future", label: "Future value", hint: "Already inflation-adjusted" },
                  ] as const).map((opt) => {
                    const active = addAmountKind === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAddAmountKind(opt.id)}
                        className={`min-h-[56px] rounded-xl border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-primary bg-primary/[0.06] text-foreground"
                            : "border-input bg-background text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="mt-0.5 text-[11px] leading-tight">{opt.hint}</p>
                      </button>
                    );
                  })}
                </div>

                {addAmountKind === "present" && (
                  <>
                    <label className="mt-4 block text-xs font-medium text-muted-foreground">
                      Expected inflation (%/yr)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={addInflation}
                      onChange={(e) => setAddInflation(e.target.value)}
                      placeholder={inflationSuggestion ? String(inflationSuggestion.rate) : "6"}
                      className={`${sheetInputClass} mt-1.5`}
                    />
                    {inflationSuggestion && (
                      <button
                        type="button"
                        onClick={() => setAddInflation(String(inflationSuggestion.rate))}
                        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        <Sparkles className="h-3 w-3" />
                        Prozpr suggests {inflationSuggestion.rate}% — {inflationSuggestion.reason}
                      </button>
                    )}
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
                      You can override this assumption — it&apos;s based on Prozpr&apos;s
                      research for this goal category.
                    </p>
                  </>
                )}

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Target date</label>
                <div className="mt-1.5 flex gap-2">
                  <select
                    value={addMonth}
                    onChange={(e) => setAddMonth(e.target.value)}
                    className={`${sheetInputClass} flex-1 appearance-none`}
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={addYear}
                    onChange={(e) => setAddYear(e.target.value)}
                    className={`${sheetInputClass} flex-1 appearance-none`}
                  >
                    {years.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Monthly contribution (₹)</label>
                <p className="mt-1 text-[11px] text-muted-foreground">Used to estimate how long it will take to fund remaining gaps.</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={addMonthly}
                  onChange={(e) => setAddMonthly(formatMoneyInput(e.target.value))}
                  placeholder="0"
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Priority</label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(["Low", "Medium", "High"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAddPriority(p)}
                      className={`min-h-[44px] rounded-xl border text-xs font-semibold transition-colors ${
                        addPriority === p
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {addIsMortgageGoal && (
                  <>
                    <label className="mt-4 block text-xs font-medium text-muted-foreground">
                      Down payment % of property value
                    </label>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      The share of total property value you plan to put down (e.g. 20%).
                    </p>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step="1"
                      value={addDownPaymentPct}
                      onChange={(e) => setAddDownPaymentPct(e.target.value)}
                      placeholder="20"
                      className={`${sheetInputClass} mt-1.5`}
                    />
                  </>
                )}

                <button
                  type="button"
                  disabled={addGoalSaving}
                  onClick={() => void submitAddGoal()}
                  className="mt-8 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {addGoalSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  {addGoalSaving ? "Saving…" : "Create goal"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddGoalOpen(false);
                    resetAddGoalForm();
                  }}
                  className="mt-3 w-full min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Holdings sheet */}
      <AnimatePresence>
        {holdingsGoal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={() => setHoldingsGoal(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border/80 bg-card shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex justify-center border-b border-border/60 bg-card py-3">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
              </div>
              <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
                <h3 className="text-lg font-semibold text-foreground">{holdingsGoal.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">Holdings mapped to this goal</p>
                <ul className="mt-5 space-y-3">
                  {holdingsGoal.holdings.map((h, i) => (
                    <motion.li
                      key={h.fund}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="rounded-xl border border-border/60 bg-muted/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-snug text-foreground">{h.fund}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{h.category}</p>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-bold tabular-nums ${h.gainPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                        >
                          {h.gainPct >= 0 ? "+" : ""}
                          {h.gainPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="mt-3 flex justify-between border-t border-border/50 pt-3 text-xs">
                        <div>
                          <p className="text-muted-foreground">Invested</p>
                          <p className="mt-0.5 font-semibold tabular-nums text-foreground">{formatINR(h.invested)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground">Current</p>
                          <p className="mt-0.5 font-semibold tabular-nums text-foreground">{formatINR(h.current)}</p>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />

      {/* Locks the page (blur + unlock card) until every cashflow input is
          present, then loads the real projection. */}
      <CashflowGate onReady={fetchCashflow} />
    </div>
  );
};

export default GoalPlanner;
