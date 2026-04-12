import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Copy, Plus, Check, Target, Clock, Flag, Pencil, Loader2, MessageCircle, Sparkles, Home, GraduationCap, Plane, BriefcaseBusiness, Heart, Car, Landmark, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import BottomNav from "@/components/BottomNav";
import { queueChatBootstrapMessage } from "@/components/chat/AIChatPanel";
import {
  listGoals,
  createGoal,
  updateGoal,
  removeGoal,
  addGoalContribution,
  getMyPortfolio,
  type GoalResponse,
  BackendOfflineError,
} from "@/lib/api";

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

/** API: PRIMARY → High, MEDIUM → Medium, SECONDARY → Low. */
function apiPriorityToUi(p: string): Goal["priority"] {
  const u = (p || "").toUpperCase();
  if (u === "SECONDARY") return "Low";
  if (u === "MEDIUM") return "Medium";
  return "High";
}

function formatApiTargetDate(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
  }
  return s;
}

function parseTargetDateParts(targetDate: string): { month: string; year: string } {
  const s = targetDate.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return { month: months[d.getUTCMonth()], year: String(d.getUTCFullYear()) };
    }
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { month: parts[0], year: parts[parts.length - 1] };
  return { month: "Dec", year: String(new Date().getFullYear() + 5) };
}

function buildIsoTargetDate(monthLabel: string, yearStr: string): string {
  const mi = months.indexOf(monthLabel);
  const m = mi >= 0 ? mi + 1 : 1;
  const y = Number(yearStr) || new Date().getFullYear();
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function goalFromApi(r: GoalResponse): Goal {
  const targetAmount = Number(r.target_amount ?? 0);
  const currentValue = Number(r.current_value ?? 0);
  const investedAmount = Number(r.invested_amount ?? 0);
  const progressPct = targetAmount > 0 ? Math.min(100, Math.round((currentValue / targetAmount) * 100)) : 0;
  const moFromApi = Number(r.monthly_contribution);
  const mo = Number.isFinite(moFromApi) && moFromApi > 0 ? moFromApi : Math.max(1000, Math.round(targetAmount / 120));
  const sug = Number(r.suggested_contribution);
  const suggestedContribution = Number.isFinite(sug) && sug > 0 ? sug : mo;
  const slug =
    r.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "goal";
  return {
    id: String(r.id),
    icon: goalIconFromName(r.name),
    label: r.name,
    slug,
    targetAmount,
    targetDate: formatApiTargetDate(r.target_date as unknown as string),
    investedAmount,
    currentValue,
    progressPct,
    status: progressPct >= 50 ? "on-track" : "behind",
    contributions: [],
    holdings: [],
    suggestedContribution,
    suggestedLabel: `${formatINR(suggestedContribution)}/mo`,
    monthlyContribution: Number.isFinite(moFromApi) ? moFromApi : 0,
    priority: apiPriorityToUi(r.priority),
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

/* ── Main ── */
const GoalPlanner = () => {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [addGoalSaving, setAddGoalSaving] = useState(false);
  const [userPortfolioTotal, setUserPortfolioTotal] = useState(0);
  const [holdingsGoal, setHoldingsGoal] = useState<Goal | null>(null);
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addTarget, setAddTarget] = useState("");
  const [addMonth, setAddMonth] = useState("Dec");
  const [addYear, setAddYear] = useState(String(new Date().getFullYear() + 5));
  const [addMonthly, setAddMonthly] = useState("");
  const [addCurrent, setAddCurrent] = useState("");
  const [addPriority, setAddPriority] = useState<"Low" | "Medium" | "High">("Medium");

  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");
  const [editMonth, setEditMonth] = useState("Dec");
  const [editYear, setEditYear] = useState("2030");
  const [editSavings, setEditSavings] = useState("");
  const [editCurrent, setEditCurrent] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [editPriority, setEditPriority] = useState<"Low" | "Medium" | "High">("Medium");

  const refreshGoals = useCallback(async () => {
    try {
      const list = await listGoals();
      setGoals(list.map(goalFromApi));
    } catch (e) {
      const msg =
        e instanceof BackendOfflineError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not load goals.";
      toast({ title: "Goals", description: msg, variant: "destructive" });
      setGoals([]);
    } finally {
      setGoalsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGoals();
  }, [refreshGoals]);

  useEffect(() => {
    getMyPortfolio()
      .then((p) => {
        if (p.total_value > 0) setUserPortfolioTotal(Math.round(p.total_value));
      })
      .catch(() => {});
  }, []);

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

  const saveEdit = useCallback(async () => {
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

    try {
      await updateGoal(editGoal.id, {
        name,
        target_amount: targetParsed.value,
        target_date: buildIsoTargetDate(editMonth, editYear),
        priority: editPriority,
      });
      await refreshGoals();
      setEditGoal(null);
      toast({ title: "Goal updated", description: `${name} has been saved.` });
    } catch (e) {
      const msg =
        e instanceof BackendOfflineError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not save changes.";
      toast({ title: "Update failed", description: msg, variant: "destructive" });
    }
  }, [editGoal, editName, editTarget, editMonth, editYear, editSavings, editCurrent, editMonthly, editPriority, refreshGoals]);

  const deleteGoal = useCallback(async () => {
    if (!editGoal) return;
    try {
      await removeGoal(editGoal.id);
      await refreshGoals();
      setEditGoal(null);
      toast({ title: "Goal removed", description: "Your overview has been updated." });
    } catch (e) {
      const msg =
        e instanceof BackendOfflineError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not delete goal.";
      toast({ title: "Delete failed", description: msg, variant: "destructive" });
    }
  }, [editGoal, refreshGoals]);

  const resetAddGoalForm = useCallback(() => {
    setAddName("");
    setAddTarget("");
    setAddMonth("Dec");
    setAddYear(String(new Date().getFullYear() + 5));
    setAddMonthly("");
    setAddCurrent("");
    setAddPriority("Medium");
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
    const currentRaw = addCurrent.trim() === "" ? "0" : addCurrent;
    const currentParsed = parseMoneyInput(currentRaw);
    if (currentParsed.ok === false) {
      toast({ title: "Current saved", description: currentParsed.message, variant: "destructive" });
      return;
    }
    if (currentParsed.value > targetParsed.value) {
      toast({
        title: "Amounts don't match",
        description: "Current saved cannot exceed the target.",
        variant: "destructive",
      });
      return;
    }

    setAddGoalSaving(true);
    try {
      const created = await createGoal({
        name,
        target_amount: targetParsed.value,
        target_date: buildIsoTargetDate(addMonth, addYear),
        priority: addPriority,
        goal_type: "OTHER",
      });
      if (currentParsed.value > 0) {
        await addGoalContribution(created.id, { amount: currentParsed.value });
      }
      await refreshGoals();
      resetAddGoalForm();
      setAddGoalOpen(false);
      toast({ title: "Goal added", description: `${name} is now in your plan.` });
    } catch (e) {
      const msg =
        e instanceof BackendOfflineError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not create goal.";
      toast({ title: "Could not save goal", description: msg, variant: "destructive" });
    } finally {
      setAddGoalSaving(false);
    }
  }, [addName, addTarget, addMonth, addYear, addMonthly, addCurrent, addPriority, resetAddGoalForm, refreshGoals]);

  const openContribute = useCallback((goal: Goal) => {
    setContributeGoal(goal);
    setContributeAmount(String(goal.suggestedContribution));
    setCopied(false);
  }, []);

  const shareLink = contributeGoal
    ? `tilly.in/contribute/${contributeGoal.slug}?amt=${contributeAmount || contributeGoal.suggestedContribution}`
    : "";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      toast({ title: "Copied", description: "Link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy", description: "Try selecting the link manually.", variant: "destructive" });
    }
  }, [shareLink]);

  const sheetInputClass =
    "w-full min-h-[48px] rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="mobile-container min-h-screen bg-background pb-28">
      {/* Sticky header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="flex items-center gap-3 px-4 pt-[max(2.25rem,env(safe-area-inset-top))] pb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-card text-foreground transition-colors hover:bg-muted"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl tracking-tight text-foreground">Goals</h1>
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
        className="px-4 pt-4 space-y-5"
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
                <p className="mt-1 font-display text-3xl tabular-nums tracking-tight text-foreground">
                  {formatINR(gamification.displayCurrent)}
                  <span className="text-lg font-sans font-medium text-muted-foreground"> / </span>
                  <span className="text-xl font-sans font-semibold text-muted-foreground">
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
          <div className="grid grid-cols-4 gap-px bg-border">
            <div className="bg-card/90 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">Progress</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                {gamification.totalTargetActive > 0
                  ? `${gamification.progressPctOverall.toFixed(1)}%`
                  : gamification.activeCount === 0 && goals.length > 0
                    ? "100%"
                    : "—"}
              </p>
            </div>
            <div className="bg-card/90 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">Status</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug text-foreground">Active</p>
            </div>
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

          {goalsLoading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">Loading your goals…</p>
            </div>
          ) : sortedGoals.length === 0 ? (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Target className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="mt-4 font-display text-xl text-foreground">Start with one goal</p>
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
                    <div className="relative p-4 pb-3.5">
                      <button
                        type="button"
                        onClick={() => openEdit(goal)}
                        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                        aria-label={`Edit ${goal.label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <div className="pr-11">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                            {goal.icon}
                          </span>
                          <h3 className="font-semibold leading-snug tracking-tight text-foreground">{goal.label}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priorityBadgeClass(goal.priority)}`}
                          >
                            {goal.priority}
                          </span>
                          {achieved ? (
                            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-400">
                              Funded
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-sm tabular-nums leading-snug text-muted-foreground">
                          Target {formatCompact(goal.targetAmount)}
                          {goal.targetDate ? (
                            <>
                              {" "}
                              · <span className="text-foreground/80">{goal.targetDate}</span>
                            </>
                          ) : null}
                        </p>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/20 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-medium text-muted-foreground">Contribution progress</span>
                              <span className="text-[10px] font-semibold tabular-nums text-foreground">
                                {goal.targetAmount > 0 ? Math.round((Math.max(0, goal.investedAmount) / goal.targetAmount) * 100) : 0}%
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-muted">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: "hsl(220, 52%, 28%)" }}
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${goal.targetAmount > 0 ? Math.min(100, Math.max(0, (goal.investedAmount / goal.targetAmount) * 100)) : 0}%`,
                                }}
                                transition={{ duration: 0.45, ease: "easeOut" }}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => openContribute(goal)}
                            className="inline-flex min-h-[36px] items-center justify-center rounded-full border border-border bg-muted px-3.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/80"
                            aria-label={`Contribute to goal: ${goal.label}`}
                          >
                            Contribute to this goal
                          </button>
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
                <h3 className="font-display text-xl text-foreground">Edit goal</h3>
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

      {/* Add goal sheet */}
      <AnimatePresence>
        {addGoalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={() => {
              setAddGoalOpen(false);
              resetAddGoalForm();
            }}
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
                <h3 className="font-display text-xl text-foreground">New goal</h3>
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

                <label className="mt-4 block text-xs font-medium text-muted-foreground">Already saved (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={addCurrent}
                  onChange={(e) => setAddCurrent(e.target.value)}
                  placeholder="0"
                  className={`${sheetInputClass} mt-1.5`}
                />

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
                <h3 className="font-display text-xl text-foreground">{holdingsGoal.label}</h3>
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

      {/* Contribute sheet */}
      <AnimatePresence>
        {contributeGoal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={() => setContributeGoal(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl border border-border/80 bg-card shadow-2xl"
            >
              <div className="flex justify-center border-b border-border/60 py-3">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
              </div>
              <div className="px-5 pt-4 pb-[calc(7rem+env(safe-area-inset-bottom,0px))]">
                <h3 className="font-display text-xl text-foreground">Contribute</h3>
                <p className="mt-1 text-sm text-muted-foreground">{contributeGoal.label}</p>

                <label className="mt-6 block text-xs font-medium text-muted-foreground">Amount (₹)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  className={`${sheetInputClass} mt-1.5`}
                />

                <label className="mt-6 block text-xs font-medium text-muted-foreground">Share link</label>
                <div className="mt-1.5 flex gap-2">
                  <div className="flex min-h-[48px] flex-1 items-center rounded-xl border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                    <span className="truncate">{shareLink}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-input bg-background shadow-sm transition-colors hover:bg-muted"
                    aria-label="Copy link"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">Anyone with the link can contribute toward this goal.</p>

                <button
                  type="button"
                  onClick={() => {
                    toast({ title: "Contribution queued", description: `₹${contributeAmount || contributeGoal.suggestedContribution} toward ${contributeGoal.label}.` });
                    setContributeGoal(null);
                  }}
                  className="mt-8 w-full min-h-[52px] rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
                >
                  Confirm amount
                </button>
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
