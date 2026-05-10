import { Fragment, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Target, Pencil, Loader2, MessageCircle, Sparkles, Home, GraduationCap, Plane, BriefcaseBusiness, Heart, Car, Landmark, Trophy, Info, ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";
import { queueChatBootstrapMessage } from "@/components/chat/AIChatPanel";
// Local-only Goals page — no backend calls. Edit, add, delete operate on in-memory state.

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
  };
}

const DEMO_GOALS: Goal[] = [
  buildLocalGoal({
    id: "demo-home",
    name: "Home down payment",
    targetAmount: 1_50_00_000,
    targetDate: "Dec 2030",
    priority: "High",
    currentValue: 42_00_000,
    investedAmount: 38_50_000,
    monthlyContribution: 75_000,
  }),
  buildLocalGoal({
    id: "demo-education",
    name: "Aarav's education fund",
    targetAmount: 90_00_000,
    targetDate: "Jun 2034",
    priority: "Medium",
    currentValue: 12_00_000,
    investedAmount: 11_50_000,
    monthlyContribution: 35_000,
  }),
  buildLocalGoal({
    id: "demo-retirement",
    name: "Early retirement",
    targetAmount: 8_00_00_000,
    targetDate: "Mar 2045",
    priority: "Medium",
    currentValue: 1_20_00_000,
    investedAmount: 1_05_00_000,
    monthlyContribution: 1_25_000,
  }),
];

const DEMO_PORTFOLIO_TOTAL = 2_85_50_000;

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
  const t = raw.trim();
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

/* ── Main ── */
const GoalPlanner = () => {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Goal[]>(DEMO_GOALS);
  const [addGoalSaving, setAddGoalSaving] = useState(false);
  const [fundFlowInfoOpen, setFundFlowInfoOpen] = useState(false);
  const [investmentsExpanded, setInvestmentsExpanded] = useState(false);
  const [investMultiplier, setInvestMultiplier] = useState(1.0); // 0.5x – 2.0x
  const [returnRate, setReturnRate] = useState(9.0); // 5% – 12%
  const userPortfolioTotal = DEMO_PORTFOLIO_TOTAL;
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
  const inflationSuggestion = useMemo(() => suggestInflationForGoal(addName), [addName]);

  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editMonth, setEditMonth] = useState("Dec");
  const [editYear, setEditYear] = useState("2030");
  const [editSavings, setEditSavings] = useState("");
  const [editCurrent, setEditCurrent] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [editPriority, setEditPriority] = useState<"Low" | "Medium" | "High">("Medium");

  const sortedGoals = useMemo(
    () => [...goals].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]),
    [goals],
  );

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
    setEditTarget(String(goal.targetAmount));
    const { month, year } = parseTargetDateParts(goal.targetDate);
    setEditMonth(month);
    setEditYear(year);
    setEditSavings(String(goal.investedAmount));
    setEditCurrent(String(goal.currentValue));
    setEditMonthly(String(goal.monthlyContribution));
    setEditPriority(goal.priority);
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
    if (currentParsed.value > targetParsed.value) {
      toast({
        title: "Amounts don't match",
        description: "Current corpus cannot exceed the target amount.",
        variant: "destructive",
      });
      return;
    }

    const updated = buildLocalGoal({
      id: editGoal.id,
      name,
      targetAmount: targetParsed.value,
      targetDate: `${editMonth} ${editYear}`,
      priority: editPriority,
      investedAmount: savingsParsed.value,
      currentValue: currentParsed.value,
      monthlyContribution: monthlyParsed.value,
    });
    setGoals((prev) => prev.map((g) => (g.id === editGoal.id ? updated : g)));
    setEditGoal(null);
    toast({ title: "Goal updated", description: `${name} has been saved.` });
  }, [editGoal, editName, editTarget, editMonth, editYear, editSavings, editCurrent, editMonthly, editPriority]);

  const deleteGoal = useCallback(() => {
    if (!editGoal) return;
    const id = editGoal.id;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setEditGoal(null);
    toast({ title: "Goal removed", description: "Your overview has been updated." });
  }, [editGoal]);

  const resetAddGoalForm = useCallback(() => {
    setAddName("");
    setAddTarget("");
    setAddMonth("Dec");
    setAddYear(String(new Date().getFullYear() + 5));
    setAddMonthly("");
    setAddPriority("Medium");
    setAddAmountKind("future");
    setAddInflation("");
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

    setAddGoalSaving(true);
    const created = buildLocalGoal({
      name,
      targetAmount: Math.round(finalTarget),
      targetDate: `${addMonth} ${addYear}`,
      priority: addPriority,
      monthlyContribution: monthlyParsed.value,
    });
    setGoals((prev) => [...prev, created]);
    resetAddGoalForm();
    setAddGoalOpen(false);
    setAddGoalSaving(false);
    toast({ title: "Goal added", description: `${name} is now in your plan.` });
  }, [addName, addTarget, addMonth, addYear, addMonthly, addPriority, addAmountKind, addInflation, resetAddGoalForm]);

  const sheetInputClass =
    "w-full min-h-[48px] rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="mobile-container min-h-screen bg-background pb-28">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="flex items-center gap-3 px-5 pt-10 pb-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">Goals</h1>
            <p className="text-xs text-muted-foreground">Track targets and corpus in one place</p>
          </div>
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
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Portfolio vs active target</p>
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
              <p className="text-[10px] text-muted-foreground">Open</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{gamification.activeCount}</p>
            </div>
            <div className="bg-card/90 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">Done</p>
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
          <div className="border-b border-border px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Goals projection
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Through Mar 2051 · {formatINR(2_27_500)}/mo · 9% post-tax assumption
            </p>
          </div>

          {(() => {
            const BEGIN = 1_50_00_000;
            const BASE_INVESTMENTS = 10_74_74_878;
            const BASE_ROI = 24_44_98_818;
            const BASE_RATE = 9;
            const ONE_OFF_IN = 1_20_00_000;
            const ONE_OFF_OUT = -1_00_00_000;
            const GOALS_OUT = -57_78_00_000;
            const projInvestments = Math.round(BASE_INVESTMENTS * investMultiplier);
            const projROI = Math.round(BASE_ROI * (returnRate / BASE_RATE) * investMultiplier);
            const projClosing = BEGIN + projInvestments + projROI + ONE_OFF_IN + ONE_OFF_OUT + GOALS_OUT;
            const investmentsBoosted = investMultiplier !== 1.0 || returnRate !== BASE_RATE;
            const rows = [
              { label: "Beginning financial assets", value: BEGIN, kind: "neutral" as const, oneOff: false, expandable: false },
              { label: "+ Investments", value: projInvestments, kind: "positive" as const, oneOff: false, expandable: true },
              { label: "+ Return on investments", value: projROI, kind: "positive" as const, oneOff: false, expandable: false },
              { label: "+ One-off income", value: ONE_OFF_IN, kind: "positive" as const, oneOff: true, expandable: false },
              { label: "− One-off expense", value: ONE_OFF_OUT, kind: "negative" as const, oneOff: true, expandable: false },
              { label: "− Goals", value: GOALS_OUT, kind: "negative" as const, oneOff: false, expandable: false },
            ];
            return (
              <ul className="divide-y divide-border/60">
                {rows.map((row, idx, arr) => {
                  const nextIsOneOff = arr[idx + 1]?.oneOff === true;
                  return (
                    <Fragment key={row.label}>
                      <li
                        className={`flex items-center justify-between px-4 py-2 ${
                          row.expandable ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""
                        }`}
                        onClick={row.expandable ? () => setInvestmentsExpanded((o) => !o) : undefined}
                      >
                        <span className="inline-flex items-center gap-1 text-xs text-foreground/85">
                          {row.label}
                          {row.oneOff && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setFundFlowInfoOpen((o) => !o);
                              }}
                              aria-label="About one-off income and expense"
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Info className="h-3 w-3" />
                            </button>
                          )}
                          {row.expandable && (
                            <motion.span
                              animate={{ rotate: investmentsExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="inline-flex text-muted-foreground"
                            >
                              <ChevronDown className="h-3 w-3" />
                            </motion.span>
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          {row.expandable && investmentsBoosted && (
                            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                              Sim
                            </span>
                          )}
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
                        </span>
                      </li>
                      {/* Investments slider panel */}
                      {row.expandable && investmentsExpanded && (
                        <li className="bg-muted/30 px-4 py-3 space-y-3">
                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Investment level
                              </span>
                              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                                {investMultiplier.toFixed(1)}x
                              </span>
                            </div>
                            <Slider
                              value={[investMultiplier]}
                              onValueChange={(v) => setInvestMultiplier(v[0])}
                              min={0.5}
                              max={2}
                              step={0.1}
                            />
                          </div>
                          <div>
                            <div className="mb-1.5 flex items-center justify-between">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Return rate (post-tax)
                              </span>
                              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                                {returnRate.toFixed(1)}%
                              </span>
                            </div>
                            <Slider
                              value={[returnRate]}
                              onValueChange={(v) => setReturnRate(v[0])}
                              min={5}
                              max={12}
                              step={0.5}
                            />
                          </div>
                          {investmentsBoosted && (
                            <button
                              type="button"
                              onClick={() => {
                                setInvestMultiplier(1.0);
                                setReturnRate(BASE_RATE);
                              }}
                              className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                            >
                              Reset to baseline
                            </button>
                          )}
                        </li>
                      )}
                      {/* One-off definition */}
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
                  style={{
                    backgroundColor: investmentsBoosted
                      ? "hsl(var(--muted) / 0.4)"
                      : "hsl(var(--muted) / 0.4)",
                  }}
                >
                  <span className="text-xs font-semibold text-foreground">Closing NFA · Mar 2051</span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      projClosing >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
                    }`}
                  >
                    {projClosing < 0 ? "−" : ""}
                    {formatINR(Math.abs(projClosing))}
                  </span>
                </li>
              </ul>
            );
          })()}

          <div className="border-t border-border px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Goal funding status
            </p>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-y-1.5 text-xs">
              <span className="text-muted-foreground">Net financial assets</span>
              <span className="text-right font-semibold tabular-nums text-foreground">
                {formatINR(1_50_00_000)}
              </span>
              <span className="text-muted-foreground">Goals today (PV)</span>
              <span className="text-right font-semibold tabular-nums text-foreground">
                {formatINR(3_30_67_257)}
              </span>
              <span className="text-muted-foreground">Present gap</span>
              <span className="text-right font-semibold tabular-nums text-destructive">
                −{formatINR(1_80_67_257)}
              </span>
              <span className="text-muted-foreground">Future gap</span>
              <span className="text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatINR(0)}
              </span>
            </div>
          </div>
        </motion.section>

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
            <ul className="space-y-3">
              {sortedGoals.map((goal) => {
                const achieved = isGoalAchieved(goal);
                const showAchieve = isGoalDeadlineInCurrentMonth(goal);

                return (
                  <li
                    key={goal.id}
                    className={`overflow-hidden rounded-2xl border bg-card transition-colors ${
                      achieved
                        ? "border-emerald-500/30"
                        : "border-border"
                    }`}
                  >
                    <div className="relative p-4 pb-4">
                      <button
                        type="button"
                        onClick={() => openEdit(goal)}
                        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                        aria-label={`Edit ${goal.label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>

                      {/* Header: icon + name + target line */}
                      <div className="flex items-start gap-3 pr-11">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground">
                          {goal.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
                            {goal.label}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {formatCompact(goal.targetAmount)}
                            {goal.targetDate ? <> by <span className="text-foreground/80">{goal.targetDate}</span></> : null}
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
                          const status = goalTrackStatus(goal);
                          const cfg = TRACK_BADGE[status];
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
                      </div>

                      {/* Donut */}
                      <div className="mt-4 flex justify-center">
                        <ContributionDonut
                          pct={
                            goal.targetAmount > 0
                              ? Math.min(100, Math.max(0, (goal.investedAmount / goal.targetAmount) * 100))
                              : 0
                          }
                        />
                      </div>

                      {/* Current / Target split */}
                      <div className="mt-4 flex items-center justify-center gap-6">
                        <div className="text-center">
                          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
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
                          <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                            Target
                          </p>
                          <p
                            className="mt-1 text-base font-bold text-foreground tabular-nums"
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                          >
                            {formatCompact(goal.targetAmount)}
                          </p>
                        </div>
                      </div>

                      {showAchieve && !achieved && (
                        <div className="mt-3.5 rounded-2xl border border-border/60 bg-muted/35 px-3 py-3">
                          <p className="text-[11px] leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground/90">Goal deadline is this month.</span>{" "}
                            Open chat with Tilly to plan your withdrawal and close the goal.
                          </p>
                          <button
                            type="button"
                            onClick={() => openAchieveGoalInChat(goal)}
                            className="mt-2.5 inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border border-primary/35 bg-background px-4 text-xs font-semibold text-primary shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/[0.06] active:scale-[0.99]"
                            aria-label={`Plan withdrawal with Tilly to complete goal: ${goal.label}`}
                          >
                            <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                            Plan withdrawal with Tilly
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>
      </motion.main>

      {/* Edit sheet */}
      <AnimatePresence>
        {editGoal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={() => setEditGoal(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border/80 bg-card shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex justify-center border-b border-border/60 bg-card py-3">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
              </div>
              <div className="px-5 pt-2 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
                <h3 className="text-lg font-semibold text-foreground">Edit goal</h3>
                <p className="mt-1 text-xs text-muted-foreground">Changes apply immediately to your overview.</p>

                <label className="mt-6 block text-xs font-medium text-muted-foreground">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className={`${sheetInputClass} mt-1.5`} />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Target amount (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                  className={`${sheetInputClass} mt-1.5`}
                />

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
                  type="number"
                  inputMode="decimal"
                  value={editSavings}
                  onChange={(e) => setEditSavings(e.target.value)}
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Current corpus toward target (₹)</label>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  When this reaches the target, the goal is marked complete and its target is excluded from your active total.
                </p>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editCurrent}
                  onChange={(e) => setEditCurrent(e.target.value)}
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Monthly contribution (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editMonthly}
                  onChange={(e) => setEditMonthly(e.target.value)}
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
                    onClick={() => void deleteGoal()}
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
                  type="number"
                  inputMode="decimal"
                  value={addTarget}
                  onChange={(e) => setAddTarget(e.target.value)}
                  placeholder="500000"
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
                        <p className="mt-0.5 text-[10px] leading-tight">{opt.hint}</p>
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
                        className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 py-1 text-[10.5px] font-medium text-primary transition-colors hover:bg-primary/10"
                      >
                        <Sparkles className="h-3 w-3" />
                        Suggest {inflationSuggestion.rate}% — {inflationSuggestion.reason}
                      </button>
                    )}
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
                  type="number"
                  inputMode="decimal"
                  value={addMonthly}
                  onChange={(e) => setAddMonthly(e.target.value)}
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

      <button
        type="button"
        onClick={() => navigate("/chat?mode=goal-planning")}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-30 flex max-w-[min(100vw-2rem,18rem)] items-center gap-2.5 rounded-full border border-border bg-[#1E2D50] py-3 pl-4 pr-5 text-left transition-opacity hover:opacity-95 active:scale-[0.99]"
        aria-label="Open goal alignment with Tilly"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-white" aria-hidden />
        <span className="min-w-0">
          <span className="block text-xs font-semibold leading-tight text-white">Plan goals with Tilly</span>
          <span className="mt-0.5 block text-[10px] font-normal leading-snug text-white/85">
            Goal alignment walkthrough
          </span>
        </span>
      </button>

      <BottomNav />
    </div>
  );
};

export default GoalPlanner;
