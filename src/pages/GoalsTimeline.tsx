import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMoneyInput } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BriefcaseBusiness,
  Car,
  Download,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Loader2,
  PiggyBank,
  Plane,
  Plus,
  RotateCcw,
  Settings2,
  Trophy,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import {
  listGoals,
  createGoal,
  updateGoal,
  removeGoal,
  getCashflowLatest,
  computeCashflow,
  saveCashflowInputs,
  getOnboardingProfile,
  getInvestmentProfile,
  getPersonalFinance,
  type CashflowPlanRunDetail,
  type FundFlowSummary,
  type HeadlineStatus,
  type GoalResponse,
} from "@/lib/api";
import { exportCashflowXls } from "@/lib/export-xls";
import CashflowGate from "@/components/goals/CashflowGate";

type Priority = "Low" | "Medium" | "High";

interface TimelineGoal {
  id: string;
  name: string;
  year: number;
  presentValue: number;
  inflationRate: number;
  priority: Priority;
}

const INFLATION_DEFAULT = 6;
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

// Timeline-extent assumptions. The visible timeline ends at the later of the
// last goal year and the retirement year (age 60 by default); dragging a goal
// past the bottom can reveal future rows up to MAX_HORIZON_YEARS from today.
const DEFAULT_RETIREMENT_AGE = 60;
// Hard ceiling for the draggable timeline: currentYear + this many years
// (e.g. 2026 → 2126, 2027 → 2127). Mirrors the backend cashflow engine's
// horizon cap (compute_horizon_years cap=100 FY-years from today) so every
// draggable year still produces corpus-closing bars.
const MAX_HORIZON_YEARS = 100;
// Used only when we have no DOB to anchor the user's age.
const FALLBACK_CURRENT_AGE = 30;
// Always show at least this many years even if retirement is in the past.
const MIN_HORIZON_YEARS = 5;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Viewport-relative Y for a framer-motion drag event.
 *
 * framer-motion's `PanInfo.point` is page-relative (event.pageY — it includes
 * scroll offset), but our drop hit-test reads `getBoundingClientRect()` and the
 * auto-scroll loop compares against `window.innerHeight` — both viewport-
 * relative. Mixing the two breaks the moment the page scrolls (i.e. exactly
 * when dragging a goal far past retirement). Always read the native event's
 * `clientY` so every coordinate stays in viewport space.
 */
function dragClientY(e: MouseEvent | TouchEvent | PointerEvent): number {
  if ("clientY" in e) return e.clientY;
  const t = e.changedTouches?.[0] ?? e.touches?.[0];
  return t ? t.clientY : 0;
}

/** Birth year parsed from an ISO date string (YYYY-MM-DD); null if unparseable. */
function birthYearFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const parsed = Date.parse(dob);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).getFullYear();
}

// NAV chart spans the full row width and renders behind the row content.
const NAV_PAD_PCT = 4; // horizontal padding (%) so the line never touches the edges
const TORNADO_CENTER_X = 50; // viewBox x for ₹0 (symmetric tornado axis)

// Earned milestones — light up the first year the projected NAV crosses each.
interface Milestone {
  value: number;
  label: string;
}

const MILESTONES: Milestone[] = [
  { value: 3_00_00_000, label: "First ₹3Cr 🎯" },
  { value: 4_00_00_000, label: "First ₹4Cr 🎯" },
  { value: 5_00_00_000, label: "First ₹5Cr 🎯" },
  { value: 7_50_00_000, label: "₹7.5Cr 🌟" },
  { value: 10_00_00_000, label: "₹10Cr club 🏆" },
  { value: 15_00_00_000, label: "₹15Cr breakthrough 🌟" },
  { value: 20_00_00_000, label: "₹20Cr legend 👑" },
  { value: 25_00_00_000, label: "₹25Cr royalty 👑" },
  { value: 50_00_00_000, label: "₹50Cr ✨" },
];

function mapApiPriority(p: string): Priority {
  const u = p.toUpperCase();
  if (u === "HIGH" || u === "PRIMARY") return "High";
  if (u === "LOW" || u === "SECONDARY") return "Low";
  return "Medium";
}

function mapGoalFromApi(g: GoalResponse, currentYear: number): TimelineGoal {
  const targetYear = g.target_date ? new Date(g.target_date).getFullYear() : currentYear + 5;
  return {
    id: g.id,
    name: g.name,
    year: targetYear,
    presentValue: g.target_amount ?? 0,
    inflationRate: g.inflation_rate ?? 6,
    priority: mapApiPriority(g.priority),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPersistedGoalId(id: string): boolean {
  return UUID_RE.test(id);
}

function yearToTargetDate(year: number): string {
  return `${year}-07-01`;
}

/** Calendar year for an annual cashflow row (matches Excel FY-end column). */
function timelineYearFromAnnualRow(row: {
  fy_end_date: string;
  fy_label?: string;
}): number | null {
  const parsed = Date.parse(row.fy_end_date);
  if (!Number.isNaN(parsed)) return new Date(parsed).getFullYear();
  const m = row.fy_label?.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function formatINR(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)} L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function formatINRCompact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v < 0) return `−${formatINRCompact(-v)}`;
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(0)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
}

function futureValue(presentValue: number, ratePct: number, years: number): number {
  const r = ratePct / 100;
  const t = Math.max(0, years);
  return presentValue * Math.pow(1 + r, t);
}

/** Bar-width scale max — ignores a lone spike so earlier years stay visible. */
function tornadoBarScaleMax(absValues: number[]): number {
  const sorted = absValues.filter((v) => v > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const second = sorted[sorted.length - 2]!;
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!;
  if (max > second * 3) return Math.max(second * 1.2, p90);
  return max;
}

function corpusToTornadoX(
  corpus: number,
  scaleMax: number,
  halfSpan: number,
): number {
  if (scaleMax <= 0 || corpus === 0) return TORNADO_CENTER_X;
  const sign = corpus > 0 ? 1 : -1;
  let norm = Math.abs(corpus) / scaleMax;
  if (norm > 0 && norm < 0.04) norm = 0.04;
  norm = Math.min(1, norm);
  return TORNADO_CENTER_X + sign * norm * halfSpan;
}

function priorityChipStyle(p: Priority): { bg: string; fg: string; border: string } {
  if (p === "High")
    return {
      bg: "rgba(239,68,68,0.12)",
      fg: "rgb(239,68,68)",
      border: "rgba(239,68,68,0.30)",
    };
  if (p === "Medium")
    return {
      bg: "rgba(217,119,6,0.12)",
      fg: "rgb(217,119,6)",
      border: "rgba(217,119,6,0.30)",
    };
  return {
    bg: "hsl(var(--muted) / 0.7)",
    fg: "hsl(var(--muted-foreground))",
    border: "hsl(var(--border))",
  };
}

function priorityNodeColor(p: Priority): string {
  if (p === "High") return "rgb(239,68,68)";
  if (p === "Medium") return "rgb(217,119,6)";
  return "hsl(var(--muted-foreground))";
}

interface InflationSuggestion {
  rate: number;
  reason: string;
}

function suggestInflationForGoal(name: string): InflationSuggestion | null {
  const s = name.toLowerCase();
  if (s.includes("educat") || s.includes("school") || s.includes("college") || s.includes("mba"))
    return { rate: 10, reason: "Education costs typically inflate ~10%/yr in India." };
  if (s.includes("health") || s.includes("medical"))
    return { rate: 12, reason: "Healthcare costs typically inflate ~12%/yr." };
  if (s.includes("wedding") || s.includes("marriage"))
    return { rate: 7, reason: "Wedding costs typically inflate ~7%/yr." };
  if (s.includes("home") || s.includes("house") || s.includes("property"))
    return { rate: 6, reason: "Property prices have averaged ~6%/yr." };
  if (s.includes("retire"))
    return { rate: 6, reason: "Use ~6% to model long-horizon retirement corpus." };
  if (s.includes("travel") || s.includes("trip") || s.includes("vacation") || s.includes("sabbatical"))
    return { rate: 7, reason: "Travel costs typically inflate ~7%/yr." };
  if (s.includes("car") || s.includes("vehicle"))
    return { rate: 5, reason: "Vehicle prices typically inflate ~5%/yr." };
  if (s.trim()) return { rate: 6, reason: "Use general CPI ~6%/yr." };
  return null;
}

function isPropertyGoalName(name: string): boolean {
  return /home|house|property|apartment|flat/.test(name.toLowerCase());
}

function goalIconFor(name: string): LucideIcon {
  const s = name.toLowerCase();
  if (s.includes("home") || s.includes("house")) return Home;
  if (s.includes("educat") || s.includes("school") || s.includes("college") || s.includes("mba"))
    return GraduationCap;
  if (s.includes("travel") || s.includes("trip") || s.includes("vacation") || s.includes("sabbatical"))
    return Plane;
  if (s.includes("retire")) return BriefcaseBusiness;
  if (s.includes("car") || s.includes("vehicle")) return Car;
  if (s.includes("wedding") || s.includes("marriage")) return Heart;
  if (s.includes("emergency")) return Landmark;
  return Trophy;
}

interface ProjectionPoint {
  year: number;
  endNav: number;
  withdrawal: number;
}

/** Per-year cashflow engine corpus (tornado bars use this only). */
interface TornadoCorpusRow {
  corpusClosing: number;
  goalPayout: number;
}

interface AddGoalSheetProps {
  open: boolean;
  initialYear: number | null;
  maxYear: number;
  editingGoal: TimelineGoal | null;
  saving: boolean;
  /** Year the user is projected to retire — used to prefill the Retirement goal. */
  retirementYear: number;
  onClose: () => void;
  onSubmit: (goal: Omit<TimelineGoal, "id">, editingId?: string) => void | Promise<void>;
}

// Quick-pick goal categories shown as the first step of the add-goal sheet.
// "Retirement" prefills its target year from the user's profile retirement age.
const GOAL_CATEGORIES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "retirement", label: "Retirement", icon: PiggyBank },
  { id: "house", label: "Buy property", icon: Home },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "marriage", label: "Marriage", icon: Heart },
  { id: "travel", label: "Travel", icon: Plane },
  { id: "car", label: "Car", icon: Car },
  { id: "custom", label: "Other", icon: Plus },
];

function AddGoalSheet({
  open,
  initialYear,
  maxYear,
  editingGoal,
  saving,
  retirementYear,
  onClose,
  onSubmit,
}: AddGoalSheetProps) {
  const currentYear = new Date().getFullYear();
  const isEdit = editingGoal !== null;
  const [category, setCategory] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const [propertyValue, setPropertyValue] = useState("");
  const [fundedByLoan, setFundedByLoan] = useState(false);
  const [loanPct, setLoanPct] = useState("");
  const [loanTermYears, setLoanTermYears] = useState("");
  const [year, setYear] = useState<number>(initialYear ?? currentYear + 5);
  const [inflation, setInflation] = useState<string>(String(INFLATION_DEFAULT));
  const [priority, setPriority] = useState<Priority>("Medium");
  const [amountKind, setAmountKind] = useState<"present" | "future">("present");

  /** Parse "1.2 Cr" / "85 L" / "1,20,00,000" style entries into rupees. */
  const parsePropertyAmount = (s: string): number => {
    const t = s.trim().toLowerCase().replace(/[,\s₹]/g, "");
    const cr = t.match(/^([\d.]+)cr$/);
    if (cr) return Math.round(parseFloat(cr[1]) * 1e7);
    const l = t.match(/^([\d.]+)l$/);
    if (l) return Math.round(parseFloat(l[1]) * 1e5);
    const n = parseFloat(t.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  /** Compact property display: 1.20 Cr / 85.00 L; small values keep commas. */
  const formatPropertyAmount = (n: number): string => {
    if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
    return n > 0 ? Math.round(n).toLocaleString("en-IN") : "";
  };

  useEffect(() => {
    if (!open) return;
    if (editingGoal) {
      // Persisted goals carry only a free-text name → edit through the "Other" path.
      // Property goals are detected by name so the loan / down-payment options
      // resurface on update. The saved presentValue is the down payment, so we
      // seed property value with it (no loan) as a starting point.
      setCategory("custom");
      setCustomName(editingGoal.name);
      setAmount(Math.round(editingGoal.presentValue).toLocaleString("en-IN"));
      setPropertyValue(
        isPropertyGoalName(editingGoal.name)
          ? formatPropertyAmount(editingGoal.presentValue)
          : "",
      );
      setFundedByLoan(false);
      setLoanPct("");
      setLoanTermYears("");
      setYear(editingGoal.year);
      setInflation(String(editingGoal.inflationRate));
      setPriority(editingGoal.priority);
      setAmountKind(editingGoal.inflationRate === 0 ? "future" : "present");
      return;
    }
    setCategory("");
    setCustomName("");
    setAmount("");
    setPropertyValue("");
    setFundedByLoan(false);
    setLoanPct("");
    setLoanTermYears("");
    setYear(initialYear ?? currentYear + 5);
    setInflation(String(INFLATION_DEFAULT));
    setPriority("Medium");
    setAmountKind("present");
  }, [open, initialYear, currentYear, editingGoal]);

  const isHouse = category === "house";
  const isCustom = category === "custom";

  const resolvedName = (() => {
    if (isCustom) return customName.trim();
    const match = GOAL_CATEGORIES.find((c) => c.id === category);
    return match ? match.label : "";
  })();

  const inflationSuggestion = useMemo(
    () => suggestInflationForGoal(resolvedName),
    [resolvedName],
  );

  // Property goals show the loan / down-payment block. Detected by the chosen
  // category on create, and by the goal name on edit (custom path).
  const showHouseDetails = isHouse || (isCustom && isPropertyGoalName(customName));

  const yearsAway = Math.max(0, year - currentYear);
  const propertyVal = parsePropertyAmount(propertyValue);
  const baseAmount = Number(amount.replace(/[^\d.]/g, "")) || 0;
  // Total value the goal targets — property value for property goals, else cost.
  const totalValue = showHouseDetails ? propertyVal : baseAmount;
  const loanPctNum = Math.min(100, Math.max(0, Number(loanPct.replace(/[^\d.]/g, "")) || 0));
  const loanAmount = fundedByLoan ? (totalValue * loanPctNum) / 100 : 0;
  // The portion the user actually saves toward (down payment / self-funded share).
  const selfFunded = Math.max(0, totalValue - loanAmount);
  const pv = selfFunded;
  const infl = amountKind === "present" ? Number(inflation) || 0 : 0;
  const fv =
    amountKind === "future" ? pv : futureValue(pv, infl, yearsAway);

  const canSave =
    resolvedName.length > 0 &&
    pv > 0 &&
    year >= currentYear &&
    year <= maxYear;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Add goal at year"
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          >
            <div
              className="w-full max-w-md rounded-2xl bg-card shadow-2xl flex flex-col overflow-hidden"
              style={{ maxHeight: "min(88dvh, 720px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {isEdit ? "Edit goal" : "New goal"}
                  </p>
                  <h2 className="text-base font-semibold text-foreground truncate">
                    {isEdit ? editingGoal!.name : `Plan for ${year}`}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Goal category
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {GOAL_CATEGORIES.map((c) => {
                      const Icon = c.icon;
                      const active = category === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCategory(c.id);
                            // Prefill the retirement goal's target year from the profile.
                            if (c.id === "retirement") {
                              setYear(Math.min(maxYear, Math.max(currentYear, retirementYear)));
                            }
                          }}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors ${
                            active
                              ? "border-foreground/30 bg-muted/60 text-foreground"
                              : "bg-card text-muted-foreground hover:bg-muted/40"
                          }`}
                          style={{
                            border: `1px solid ${active ? "hsl(var(--foreground) / 0.30)" : "hsl(var(--border))"}`,
                          }}
                          aria-pressed={active}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="text-[11.5px] font-semibold">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {isCustom && (
                    <input
                      id="timeline-goal-name"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Name this goal (e.g. sabbatical, gadget)"
                      className="mt-2 w-full rounded-lg bg-muted/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                      style={{ border: "1px solid hsl(var(--border))" }}
                    />
                  )}
                </div>

                {showHouseDetails && (
                  <div>
                    <label
                      htmlFor="timeline-goal-property-value"
                      className="text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      Property value (₹)
                    </label>
                    <input
                      id="timeline-goal-property-value"
                      value={propertyValue}
                      onChange={(e) => setPropertyValue(formatMoneyInput(e.target.value))}
                      onBlur={() => {
                        const n = parsePropertyAmount(propertyValue);
                        setPropertyValue(formatPropertyAmount(n));
                      }}
                      placeholder="e.g. 1.20 Cr"
                      className="mt-1 w-full rounded-lg bg-muted/40 px-3 py-2 text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                      style={{ border: "1px solid hsl(var(--border))" }}
                    />
                    {propertyVal > 0 && (
                      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                        = ₹{Math.round(propertyVal).toLocaleString("en-IN")}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {!showHouseDetails && (
                    <div>
                      <label
                        htmlFor="timeline-goal-amount"
                        className="text-[11px] uppercase tracking-wide text-muted-foreground"
                      >
                        Cost (₹)
                      </label>
                      <input
                        id="timeline-goal-amount"
                        value={amount}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^\d]/g, "");
                          setAmount(digits ? Number(digits).toLocaleString("en-IN") : "");
                        }}
                        inputMode="numeric"
                        placeholder="50,00,000"
                        className="mt-1 w-full rounded-lg bg-muted/40 px-3 py-2 text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                        style={{ border: "1px solid hsl(var(--border))" }}
                      />
                    </div>
                  )}
                  <div className={showHouseDetails ? "col-span-2" : undefined}>
                    <label
                      htmlFor="timeline-goal-year"
                      className="text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      Target year
                    </label>
                    <input
                      id="timeline-goal-year"
                      type="number"
                      inputMode="numeric"
                      min={currentYear}
                      max={maxYear}
                      value={year}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) setYear(v);
                      }}
                      className="mt-1 w-full rounded-lg bg-muted/40 px-3 py-2 text-[13px] tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/30"
                      style={{ border: "1px solid hsl(var(--border))" }}
                    />
                  </div>
                </div>
                <p className="-mt-2 text-[11px] text-muted-foreground">
                  {yearsAway === 0
                    ? "Within this year"
                    : `${yearsAway} year${yearsAway === 1 ? "" : "s"} away`}
                </p>

                {category !== "" && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                        Funded partially by a loan?
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { val: true, label: "Yes" },
                          { val: false, label: "No" },
                        ] as const).map((opt) => {
                          const active = fundedByLoan === opt.val;
                          return (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => setFundedByLoan(opt.val)}
                              className={`rounded-xl px-3 py-2 text-[11.5px] font-semibold transition-colors ${
                                active
                                  ? "border-foreground/30 bg-muted/60 text-foreground"
                                  : "bg-card text-muted-foreground hover:bg-muted/40"
                              }`}
                              style={{
                                border: `1px solid ${active ? "hsl(var(--foreground) / 0.30)" : "hsl(var(--border))"}`,
                              }}
                              aria-pressed={active}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {fundedByLoan && (
                      <>
                        <div>
                          <label
                            htmlFor="timeline-goal-loan-pct"
                            className="text-[11px] uppercase tracking-wide text-muted-foreground"
                          >
                            Loan (% of {showHouseDetails ? "property value" : "goal cost"})
                          </label>
                          <input
                            id="timeline-goal-loan-pct"
                            value={loanPct}
                            onChange={(e) => setLoanPct(e.target.value.replace(/[^\d.]/g, ""))}
                            inputMode="decimal"
                            placeholder="80"
                            className="mt-1 w-full rounded-lg bg-card px-3 py-2 text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                            style={{ border: "1px solid hsl(var(--border))" }}
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="timeline-goal-loan-term"
                            className="text-[11px] uppercase tracking-wide text-muted-foreground"
                          >
                            Expected loan term (years)
                          </label>
                          <input
                            id="timeline-goal-loan-term"
                            value={loanTermYears}
                            onChange={(e) => setLoanTermYears(e.target.value.replace(/[^\d]/g, ""))}
                            inputMode="numeric"
                            placeholder="20"
                            className="mt-1 w-full rounded-lg bg-card px-3 py-2 text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                            style={{ border: "1px solid hsl(var(--border))" }}
                          />
                        </div>
                        {totalValue > 0 && loanPctNum > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            Loan ≈{" "}
                            <span className="font-semibold text-foreground tabular-nums">
                              {formatINR(loanAmount)}
                            </span>{" "}
                            · You&apos;ll save toward{" "}
                            <span className="font-semibold text-foreground tabular-nums">
                              {formatINR(selfFunded)}
                            </span>{" "}
                            ({showHouseDetails ? "down payment" : "self-funded"}).
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Is this in today&apos;s money or at the target date?
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: "present", label: "Today's value", hint: "Will inflate to target year" },
                      { id: "future", label: "Future value", hint: "Already inflation-adjusted" },
                    ] as const).map((opt) => {
                      const active = amountKind === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setAmountKind(opt.id)}
                          className={`min-h-[50px] rounded-xl px-3 py-2 text-left transition-colors ${
                            active
                              ? "border-foreground/30 bg-muted/60 text-foreground"
                              : "bg-card text-muted-foreground hover:bg-muted/40"
                          }`}
                          style={{
                            border: `1px solid ${active ? "hsl(var(--foreground) / 0.30)" : "hsl(var(--border))"}`,
                          }}
                          aria-pressed={active}
                        >
                          <p className="text-[11.5px] font-semibold">{opt.label}</p>
                          <p className="mt-0.5 text-[11px] leading-tight">
                            {opt.hint}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {amountKind === "present" && (
                  <div>
                    <label
                      htmlFor="timeline-goal-inflation"
                      className="text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      Expected inflation (%/yr)
                    </label>
                    <input
                      id="timeline-goal-inflation"
                      value={inflation}
                      onChange={(e) => setInflation(e.target.value)}
                      inputMode="decimal"
                      placeholder={
                        inflationSuggestion
                          ? String(inflationSuggestion.rate)
                          : "6"
                      }
                      className="mt-1 w-full rounded-lg bg-muted/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                      style={{ border: "1px solid hsl(var(--border))" }}
                    />
                    {inflationSuggestion && (
                      <button
                        type="button"
                        onClick={() =>
                          setInflation(String(inflationSuggestion.rate))
                        }
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: "rgba(212, 168, 104, 0.10)",
                          color: "#D4A868",
                          border: "1px solid rgba(212, 168, 104, 0.30)",
                        }}
                      >
                        ✨ Prozpr suggests {inflationSuggestion.rate}% —{" "}
                        {inflationSuggestion.reason}
                      </button>
                    )}
                    <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
                      Override this if you have a better number — it&apos;s based
                      on Prozpr&apos;s research for this goal category.
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Priority
                  </p>
                  <div className="flex rounded-full bg-muted/50 p-0.5">
                    {PRIORITIES.map((p) => {
                      const active = priority === p;
                      const chip = priorityChipStyle(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`flex-1 rounded-full py-1.5 text-[11.5px] font-semibold transition-colors ${
                            active ? "" : "text-muted-foreground hover:text-foreground"
                          }`}
                          style={
                            active
                              ? {
                                  backgroundColor: chip.bg,
                                  color: chip.fg,
                                  border: `1px solid ${chip.border}`,
                                }
                              : undefined
                          }
                          aria-pressed={active}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {fundedByLoan && loanAmount > 0 ? "Down payment at" : "Cost at"} {year}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                        {amountKind === "future"
                          ? fundedByLoan && loanAmount > 0
                            ? `Future-dated down payment only — the remaining ${formatINR(loanAmount)} is covered by your mortgage`
                            : "Entered as the future-dated amount"
                          : fundedByLoan && loanAmount > 0
                            ? `Today's down payment compounded at ${infl || 0}% for ${yearsAway} yr — the remaining ${formatINR(loanAmount)} is covered by your mortgage`
                            : `Today's cost compounded at ${infl || 0}% for ${yearsAway} yr`}
                      </p>
                    </div>
                    <span
                      className="text-base font-semibold tabular-nums text-foreground"
                      style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      }}
                    >
                      {pv > 0 ? formatINR(fv) : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-border px-4 py-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
                  style={{ border: "1px solid hsl(var(--border))" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canSave || saving}
                  onClick={() => {
                    void onSubmit(
                      {
                        name: resolvedName,
                        year,
                        // When the user entered the future-dated amount, store it
                        // as a present value with 0% inflation so projections leave
                        // it alone (FV at year N = PV * 1 = entered amount).
                        presentValue: pv,
                        inflationRate: amountKind === "future" ? 0 : infl,
                        priority,
                      },
                      editingGoal?.id,
                    );
                  }}
                  className={`flex-1 rounded-full py-2 text-[12px] font-bold transition-opacity ${
                    canSave && !saving
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                  }`}
                >
                  {saving ? "Saving…" : isEdit ? "Save changes" : "Add to timeline"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Goals-projection waterfall surfaced as a popup from the tornado view.
// Every figure comes from the cashflow engine's fund-flow summary (the single
// source of truth) — nothing here is hardcoded. The return-scenario toggle only
// scales the engine's ROI; all other flows are held at their engine values.
interface ProjectionSheetProps {
  open: boolean;
  onClose: () => void;
  /** Engine fund-flow summary (SSOT for the waterfall). Null until a plan exists. */
  fundFlow: FundFlowSummary | null;
  /** Headline status — supplies the projection horizon (last FY end). */
  headline: HeadlineStatus | null;
  /** The plan's monthly SIP, for the header label. */
  sipMonthly: number | null;
}

type WaterfallItem = { axis: string; label: string; value: number; kind: WaterfallKind };

// Sensitivity scenarios for the projection — only return-on-investment reacts
// to the assumed post-tax rate; everything else (contributions, one-offs, goals)
// is held constant so the user sees the pure effect of returns.
const PROJECTION_BASE_RATE = 9;
const PROJECTION_SCENARIOS: { id: string; label: string; rate: number }[] = [
  { id: "cons", label: "Conservative", rate: 7 },
  { id: "base", label: "Base", rate: 9 },
  { id: "opt", label: "Optimistic", rate: 11 },
];

type WaterfallKind = "base" | "positive" | "negative" | "total";

const waterfallBarColor = (kind: WaterfallKind): string =>
  kind === "base"
    ? "hsl(var(--accent))"
    : kind === "total"
      ? "hsl(var(--primary))"
      : kind === "negative"
        ? "hsl(var(--destructive))"
        : "hsl(var(--wealth-green))";

// Two-line XAxis tick so labels like "One-off in" don't overlap.
const ProjectionAxisTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
  const { x = 0, y = 0, payload } = props;
  const text = String(payload?.value ?? "");
  const tokens = text.split(" ");
  const line1 = tokens.length >= 2 ? tokens[0] : text;
  const line2 = tokens.length >= 2 ? tokens.slice(1).join(" ") : "";
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={8.5} fill="hsl(var(--muted-foreground))">
        <tspan x={0} dy="0.95em">{line1}</tspan>
        {line2 && <tspan x={0} dy="1.05em">{line2}</tspan>}
      </text>
    </g>
  );
};

function ProjectionSheet({ open, onClose, fundFlow, headline, sipMonthly }: ProjectionSheetProps) {
  const [scenarioId, setScenarioId] = useState("base");
  const scenario = PROJECTION_SCENARIOS.find((s) => s.id === scenarioId) ?? PROJECTION_SCENARIOS[1];

  const currentYear = new Date().getFullYear();
  // Horizon comes from the engine: last FY-end = max(retirement, last goal).
  const horizonYear = headline?.last_fy_end_date
    ? new Date(headline.last_fy_end_date).getFullYear()
    : currentYear;
  const horizonLabel = headline?.last_fy_end_date
    ? new Date(headline.last_fy_end_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : "—";
  const monthlyLabel = sipMonthly != null ? `${formatINRCompact(sipMonthly)}/mo` : "SIP not set";

  // Every base figure comes straight from the engine's fund-flow summary (SSOT);
  // 0 when no plan has been computed yet (the early return below shows a prompt).
  const BEGIN = fundFlow?.corpus_opening ?? 0;
  const INVESTMENTS = fundFlow?.total_investments ?? 0;
  const ROI_BASE = fundFlow?.total_roi ?? 0;
  const ONE_OFF_IN = fundFlow?.total_one_off_in ?? 0;
  const ONE_OFF_OUT = -Math.abs(fundFlow?.total_one_off_out ?? 0);
  const GOALS_OUT = -Math.abs(fundFlow?.total_goals_paid ?? 0);

  // Scale the engine ROI by the ratio of compounding factors so the Base scenario
  // lands exactly on the engine's number while the others fan out realistically.
  const horizonYears = Math.max(1, horizonYear - currentYear);
  const ROI = useMemo(() => {
    const factor =
      Math.pow(1 + scenario.rate / 100, horizonYears) /
      Math.pow(1 + PROJECTION_BASE_RATE / 100, horizonYears);
    return Math.round(ROI_BASE * factor);
  }, [scenario.rate, horizonYears, ROI_BASE]);

  // No plan yet → don't fabricate a waterfall; prompt to complete inputs.
  if (!fundFlow) {
    return (
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50"
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              role="dialog"
              aria-modal="true"
              aria-label="Goals projection"
              className="fixed inset-0 z-[60] flex items-center justify-center px-4"
            >
              <div
                className="w-full max-w-md rounded-2xl bg-card p-6 text-center shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Goals projection
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Complete your cashflow inputs to see your projection.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    );
  }

  const CLOSING = BEGIN + INVESTMENTS + ROI + ONE_OFF_IN + ONE_OFF_OUT + GOALS_OUT;

  const items: WaterfallItem[] = [
    { axis: "Beginning", label: "Beginning financial assets", value: BEGIN, kind: "base" },
    { axis: "Investments", label: "+ Investments", value: INVESTMENTS, kind: "positive" },
    { axis: "Returns", label: "+ Return on investments", value: ROI, kind: "positive" },
    ...(ONE_OFF_IN
      ? [{ axis: "One-off in", label: "+ One-off income", value: ONE_OFF_IN, kind: "positive" } as WaterfallItem]
      : []),
    ...(ONE_OFF_OUT
      ? [{ axis: "One-off out", label: "− One-off expense", value: ONE_OFF_OUT, kind: "negative" } as WaterfallItem]
      : []),
    { axis: "Goals", label: "− Goals", value: GOALS_OUT, kind: "negative" },
    { axis: "Closing", label: "= Closing financial assets", value: CLOSING, kind: "total" },
  ];

  // Floating-bar waterfall: each bar spans [low, high]. A 2-tuple dataKey lets
  // recharts draw the floating bars — and the − Goals bar crossing zero — cleanly.
  let running = 0;
  const data = items.map((it) => {
    let start: number;
    let end: number;
    if (it.kind === "base" || it.kind === "total") {
      start = 0;
      end = it.value;
      running = it.value;
    } else {
      start = running;
      end = running + it.value;
      running = end;
    }
    return {
      axis: it.axis,
      range: [Math.min(start, end), Math.max(start, end)] as [number, number],
      kind: it.kind,
      display: it.value,
    };
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Goals projection"
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          >
            <div
              className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
              style={{ maxHeight: "min(88dvh, 720px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Goals projection
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Through {horizonLabel} · {monthlyLabel} · {scenario.rate}% post-tax
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {/* Sensitivity — return scenario */}
                <div>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Return scenario · sensitivity
                  </p>
                  <div className="flex rounded-full bg-muted/60 p-0.5">
                    {PROJECTION_SCENARIOS.map((s) => {
                      const active = s.id === scenarioId;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setScenarioId(s.id)}
                          className={`flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-colors ${
                            active
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          aria-pressed={active}
                        >
                          {s.label}
                          <span className="ml-1 text-[10px] font-normal tabular-nums opacity-70">
                            {s.rate}%
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Closing headline (live) */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Closing financial assets
                    </p>
                    <p className="text-[11px] text-muted-foreground/80">{horizonLabel}</p>
                  </div>
                  <span
                    className="text-lg font-bold tabular-nums"
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                      color:
                        CLOSING >= 0 ? "hsl(164 54% 40%)" : "hsl(var(--destructive))",
                    }}
                  >
                    {CLOSING < 0 ? "−" : ""}
                    {formatINRCompact(Math.abs(CLOSING))}
                  </span>
                </div>

                {/* Waterfall chart */}
                <div className="h-[230px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data}
                      margin={{ top: 8, right: 8, left: 0, bottom: 30 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="axis"
                        tick={<ProjectionAxisTick />}
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        height={34}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v) => formatINRCompact(Number(v))}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const point = payload[0]!.payload as (typeof data)[number];
                          const full = items.find((it) => it.axis === point.axis);
                          return (
                            <div
                              style={{
                                fontSize: 11,
                                borderRadius: 8,
                                border: "1px solid hsl(var(--border))",
                                backgroundColor: "hsl(var(--card))",
                                color: "hsl(var(--foreground))",
                                padding: "6px 10px",
                              }}
                            >
                              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                                {full?.label ?? point.axis}
                              </div>
                              <div className="tabular-nums">
                                {point.display < 0 ? "−" : ""}
                                {formatINR(Math.abs(point.display))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="range" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                        {data.map((entry, i) => (
                          <Cell key={`wf-${i}`} fill={waterfallBarColor(entry.kind)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Compact breakdown */}
                <div className="overflow-hidden rounded-xl border border-border">
                  {items.map((it, idx) => {
                    const isLast = idx === items.length - 1;
                    const color =
                      it.kind === "negative"
                        ? "hsl(var(--destructive))"
                        : it.kind === "positive"
                          ? "hsl(164 54% 40%)"
                          : "hsl(var(--foreground))";
                    return (
                      <div
                        key={it.label}
                        className="flex items-center justify-between px-3 py-2"
                        style={{
                          borderBottom: isLast ? undefined : "1px solid hsl(var(--border))",
                          backgroundColor:
                            it.kind === "total" ? "hsl(var(--muted) / 0.45)" : undefined,
                        }}
                      >
                        <span
                          className="text-[11.5px]"
                          style={{
                            color:
                              it.kind === "total"
                                ? "hsl(var(--foreground))"
                                : "hsl(var(--muted-foreground))",
                            fontWeight: it.kind === "total" ? 600 : 400,
                          }}
                        >
                          {it.label}
                        </span>
                        <span
                          className="text-[12px] font-semibold tabular-nums"
                          style={{
                            color,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {it.value < 0 ? "−" : ""}
                          {formatINRCompact(Math.abs(it.value))}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] leading-snug text-muted-foreground/80">
                  Sensitivity varies only investment returns; contributions, one-off flows and goal
                  outflows are held constant. Assumptions, not a guarantee.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface GoalsTimelineProps {
  variant?: "line" | "tornado";
}

const GoalsTimeline = ({ variant = "line" }: GoalsTimelineProps) => {
  const currentYear = new Date().getFullYear();
  const isTornado = variant === "tornado";

  const [goals, setGoals] = useState<TimelineGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalSaving, setGoalSaving] = useState(false);
  const [addYear, setAddYear] = useState<number | null>(null);
  const [editGoal, setEditGoal] = useState<TimelineGoal | null>(null);
  const [enabledPriorities, setEnabledPriorities] = useState<Set<Priority>>(
    new Set<Priority>(["Low", "Medium", "High"]),
  );
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  // Starts at 0 and is populated from the plan's actual SIP once it loads (the
  // effect below) — never a fabricated default.
  const [monthlyContrib, setMonthlyContrib] = useState<number>(0);
  // SIP the engine's current plan actually uses (null until a plan run loads).
  // When the typed amount differs, an "Apply to plan" action re-runs the engine.
  const [planSip, setPlanSip] = useState<number | null>(null);
  // Affordable monthly SIP derived straight from the profile finance fields
  // (annual income − annual expense − tax, ÷ 12). This is a REAL number that
  // shows even before any cashflow plan has been run, so the top banner always
  // surfaces what the user can invest. The engine's per-year figure
  // (`affordableMonthly` below) is preferred once a plan exists (it also nets out
  // EMIs); this is the fallback.
  const [profileAffordableMonthly, setProfileAffordableMonthly] = useState<number | null>(null);
  const [applyingSip, setApplyingSip] = useState(false);
  const [insightClosed, setInsightClosed] = useState(false);
  // When arriving from the "What are you trying to achieve?" card (?inputs=1),
  // open the cashflow inputs form straight away.
  const [searchParams] = useSearchParams();
  const autoOpenInputs = searchParams.get("inputs") === "1";
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [draggingGoalId, setDraggingGoalId] = useState<string | null>(null);
  const [dropTargetYear, setDropTargetYear] = useState<number | null>(null);
  const [projectionOpen, setProjectionOpen] = useState(false);

  // Birth year (from DOB) + retirement age drive where the timeline ends.
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [retirementAge, setRetirementAge] = useState<number>(DEFAULT_RETIREMENT_AGE);
  // Transient extra extent revealed while dragging a goal past the bottom row.
  const [revealEndYear, setRevealEndYear] = useState<number | null>(null);

  // Bumped by the Settings button to open the cashflow-inputs editor in CashflowGate.
  const [editSignal, setEditSignal] = useState(0);
  const [cashflowData, setCashflowData] = useState<CashflowPlanRunDetail | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [cashflowError, setCashflowError] = useState<string | null>(null);

  const reloadGoals = useCallback(async () => {
    setGoalsLoading(true);
    try {
      const res = await listGoals();
      setGoals(res.map((g) => mapGoalFromApi(g, currentYear)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load goals";
      toast.error(msg);
    } finally {
      setGoalsLoading(false);
    }
  }, [currentYear]);

  useEffect(() => {
    void reloadGoals();
  }, [reloadGoals]);

  // Pull DOB (for the user's age) and retirement age so the timeline can end at
  // max(last goal, retirement). Both are best-effort — failures fall back to
  // sensible defaults rather than blocking the page.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [onboardingRes, investmentRes] = await Promise.allSettled([
        getOnboardingProfile(),
        getInvestmentProfile(),
      ]);
      if (cancelled) return;
      if (onboardingRes.status === "fulfilled") {
        const by = birthYearFromDob(onboardingRes.value.date_of_birth);
        if (by != null) setBirthYear(by);
      }
      if (
        investmentRes.status === "fulfilled" &&
        typeof investmentRes.value.retirement_age === "number" &&
        investmentRes.value.retirement_age > 0
      ) {
        setRetirementAge(investmentRes.value.retirement_age);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchCashflow = useCallback(async () => {
    setCashflowLoading(true);
    setCashflowError(null);
    try {
      const res = await getCashflowLatest();
      setCashflowData(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cashflow unavailable";
      setCashflowError(msg);
      setCashflowData(null);
      toast.error(msg);
    } finally {
      setCashflowLoading(false);
    }
  }, []);

  useEffect(() => { fetchCashflow(); }, [fetchCashflow]);

  // The "Invest /mo" control reflects the user's CANONICAL monthly SIP
  // (`starting_monthly_investment` on the personal-finance profile — the exact
  // value the inputs form edits), so the goal page and the inputs form always
  // show the same number. It is deliberately NOT derived from the engine's
  // projected `monthly_investment` rows: those apply the annual step-up
  // (annual_invested_amount_growth), which turned e.g. ₹55,000 into ₹59,400.
  const fetchSip = useCallback(async () => {
    try {
      const pf = await getPersonalFinance();
      const raw = pf.starting_monthly_investment;
      if (raw != null && Number.isFinite(raw)) {
        const sip = Math.max(0, Math.round(raw));
        setMonthlyContrib(sip);
        setPlanSip(sip);
      } else {
        setPlanSip(0);
      }
      // Real "you could invest up to ₹X/mo" figure, computed directly from the
      // profile so the banner shows even before a cashflow plan exists:
      //   (annual income − annual expense − tax) ÷ 12.
      // Tax falls back to the engine's 0.25 default when no rate is stored, so
      // this stays consistent with the engine's own savings figure.
      const income = pf.annual_income;
      if (income != null && Number.isFinite(income) && income > 0) {
        const annualExpense = (pf.monthly_household_expense ?? 0) * 12;
        const taxRate = pf.effective_tax_rate ?? 0.25;
        const remainingMonthly = (income - annualExpense - income * taxRate) / 12;
        setProfileAffordableMonthly(Math.max(0, Math.round(remainingMonthly)));
      } else {
        setProfileAffordableMonthly(null);
      }
    } catch {
      // SIP not set yet — leave the slider at its default (0).
    }
  }, []);

  useEffect(() => { void fetchSip(); }, [fetchSip]);

  // Persist the typed SIP and re-run the engine so the whole cashflow
  // (corpus bars, annual rows, goal funding) reflects the new amount. The
  // canonical SIP is the value we just saved, so reflect it immediately.
  const applySipToPlan = useCallback(async () => {
    if (!Number.isFinite(monthlyContrib)) return;
    setApplyingSip(true);
    setCashflowError(null);
    try {
      await saveCashflowInputs({ starting_monthly_investment: monthlyContrib });
      await computeCashflow();
      await fetchCashflow();
      setPlanSip(monthlyContrib);
      toast.success("Plan updated with the new SIP");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't update the plan";
      toast.error(msg);
    } finally {
      setApplyingSip(false);
    }
  }, [monthlyContrib, fetchCashflow]);

  // The engine caps the monthly SIP to the household's affordable savings
  // (income − tax − expense − EMIs) — it never invests more than you can save.
  // `savings_post_emi` is independent of the SIP, so this ceiling stays stable as
  // the user types; surface it so an over-large SIP is explained, not silently
  // clamped. Skip the partial current FY (fewer months → understated monthly).
  const affordableMonthly = useMemo<number | null>(() => {
    const rows = cashflowData?.annual_cashflow ?? [];
    const investingYears = rows.filter((r) => r.savings_post_emi > 0);
    if (investingYears.length === 0) return null;
    const ref = investingYears.length > 1 ? investingYears[1] : investingYears[0];
    return ref.savings_post_emi / 12;
  }, [cashflowData]);

  const sipCapped = affordableMonthly != null && monthlyContrib > affordableMonthly + 1;

  // What the top banner shows: the engine's affordable figure once a plan exists
  // (it also nets out EMIs), otherwise the real profile-derived figure. This means
  // the "you could invest up to ₹X/month" banner always shows a real number, even
  // on a blank page with no cashflow plan yet.
  const displayAffordableMonthly = affordableMonthly ?? profileAffordableMonthly;

  const toggleGoalExpanded = (id: string) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // DOM refs per year row — used to hit-test where a goal is dropped.
  const rowRefs = useRef<Map<number, HTMLLIElement | null>>(new Map());
  const findYearAtClientY = (clientY: number): number | null => {
    for (const [year, el] of rowRefs.current) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) return year;
    }
    return null;
  };

  // rAF loop: while a goal is dragged into the top/bottom edge band, scroll the
  // window in that direction. When dragging against the page bottom, reveal the
  // next future year so the timeline keeps growing smoothly up to the lifespan
  // cap — runs continuously even when the pointer is held still, which a
  // pointer-move handler cannot do.
  const EDGE_BAND = 110; // px from a viewport edge that triggers auto-scroll
  const SCROLL_STEP = 18; // px scrolled per frame
  const autoScrollTick = useCallback(() => {
    const y = dragPointerYRef.current;
    if (y == null) {
      autoScrollRafRef.current = null;
      return;
    }
    const vh = window.innerHeight;
    const doc = document.documentElement;
    const atBottom = window.scrollY + vh >= doc.scrollHeight - 2;

    if (y > vh - EDGE_BAND) {
      if (atBottom) {
        // Page already scrolled to the end — grow the timeline by a year so
        // there's somewhere further to drop (scrollHeight then expands).
        const last = displayEndYearRef.current;
        if (last < capYearRef.current) {
          setRevealEndYear((prev) =>
            Math.min(capYearRef.current, Math.max(prev ?? last, last) + 1),
          );
        }
      } else {
        window.scrollBy(0, SCROLL_STEP);
      }
    } else if (y < EDGE_BAND) {
      window.scrollBy(0, -SCROLL_STEP);
    }
    autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
  }, []);

  const startAutoScroll = useCallback(
    (clientY: number) => {
      dragPointerYRef.current = clientY;
      if (autoScrollRafRef.current == null) {
        autoScrollRafRef.current = requestAnimationFrame(autoScrollTick);
      }
    },
    [autoScrollTick],
  );

  const stopAutoScroll = useCallback(() => {
    dragPointerYRef.current = null;
    if (autoScrollRafRef.current != null) {
      cancelAnimationFrame(autoScrollRafRef.current);
      autoScrollRafRef.current = null;
    }
  }, []);

  // Safety net: never leave the rAF loop running if the component unmounts mid-drag.
  useEffect(() => stopAutoScroll, [stopAutoScroll]);
  const moveGoalToYear = useCallback(
    (id: string, year: number) => {
      setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, year } : g)));
      if (!isPersistedGoalId(id)) return;
      // Force a fresh cashflow projection (not getCashflowLatest, which only
      // recomputes when the stored run is stale) so the corpus-closing bars
      // extend out to the goal's new year.
      setCashflowLoading(true);
      setCashflowError(null);
      updateGoal(id, { target_date: yearToTargetDate(year) })
        .then(() => computeCashflow())
        .then((res) => setCashflowData(res))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "Could not update goal year";
          setCashflowError(msg);
          toast.error(msg);
          void reloadGoals();
        })
        .finally(() => setCashflowLoading(false));
    },
    [reloadGoals],
  );

  const closeGoalSheet = useCallback(() => {
    setAddYear(null);
    setEditGoal(null);
  }, []);

  const handleGoalSubmit = useCallback(
    async (incoming: Omit<TimelineGoal, "id">, editingId?: string) => {
      const payload = {
        name: incoming.name.trim(),
        target_amount: Math.round(incoming.presentValue),
        target_date: yearToTargetDate(incoming.year),
        priority: incoming.priority.toUpperCase(),
        inflation_rate: incoming.inflationRate,
      };

      setGoalSaving(true);
      try {
        if (editingId && isPersistedGoalId(editingId)) {
          const res = await updateGoal(editingId, payload);
          setGoals((prev) =>
            prev.map((g) =>
              g.id === editingId ? mapGoalFromApi(res, currentYear) : g,
            ),
          );
          toast.success("Goal updated");
        } else {
          const res = await createGoal(payload);
          setGoals((prev) => [...prev, mapGoalFromApi(res, currentYear)]);
          toast.success("Goal added");
        }
        closeGoalSheet();
        await fetchCashflow();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not save goal";
        toast.error(msg);
      } finally {
        setGoalSaving(false);
      }
    },
    [currentYear, closeGoalSheet, fetchCashflow],
  );

  const handleDeleteGoal = useCallback(
    async (id: string) => {
      const goal = goals.find((g) => g.id === id);
      setGoals((prev) => prev.filter((g) => g.id !== id));
      setExpandedGoals((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (!isPersistedGoalId(id)) {
        toast.success("Goal removed");
        return;
      }
      try {
        await removeGoal(id);
        toast.success(goal ? `${goal.name} removed` : "Goal removed");
        await fetchCashflow();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not delete goal";
        toast.error(msg);
        await reloadGoals();
      }
    },
    [goals, fetchCashflow, reloadGoals],
  );

  const togglePriority = (p: Priority) => {
    setEnabledPriorities((prev) => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size > 1) next.delete(p); // keep at least one selected
      } else {
        next.add(p);
      }
      return next;
    });
  };

  const visibleGoals = useMemo(
    () => goals.filter((g) => enabledPriorities.has(g.priority)),
    [goals, enabledPriorities],
  );

  const goalsByYear = useMemo(() => {
    const map = new Map<number, TimelineGoal[]>();
    for (const g of visibleGoals) {
      const list = map.get(g.year) ?? [];
      list.push(g);
      map.set(g.year, list);
    }
    return map;
  }, [visibleGoals]);

  // ── Timeline extent ──────────────────────────────────────────────────────
  // End the timeline at the engine's projection horizon — last_fy_end_date =
  // max(retirement, last goal) — which is the single source of truth. Before a
  // plan loads we fall back to the user's profile retirement age + last goal so
  // the timeline still renders; we never assume a retirement age once the
  // engine's horizon is known. Dragging a goal down can temporarily reveal rows
  // up to the lifespan cap (age 100). All goals count toward the last-goal year
  // (not just visible ones) so toggling a priority filter never shrinks it.
  const effectiveBirthYear = birthYear ?? currentYear - FALLBACK_CURRENT_AGE;
  const retirementYear = effectiveBirthYear + retirementAge;
  // Engine's actual projection end (FY) — authoritative when a plan is loaded.
  const engineEndYear = cashflowData?.headline?.last_fy_end_date
    ? new Date(cashflowData.headline.last_fy_end_date).getFullYear()
    : null;
  // Draggable ceiling: 100 calendar years from today (2026 → 2126, 2027 → 2127).
  // The backend cashflow engine's horizon cap matches (100 FY-years), so every
  // draggable year still produces corpus-closing bars.
  const capYear = currentYear + MAX_HORIZON_YEARS;
  // Lowest year a goal may occupy: never in the past. yearToTargetDate() anchors
  // goals at July 1, so once we're past July the current year is no longer valid.
  const minGoalYear = new Date().getMonth() > 5 ? currentYear + 1 : currentYear;
  const lastGoalYear = useMemo(
    () => goals.reduce((m, g) => Math.max(m, g.year), currentYear),
    [goals, currentYear],
  );
  const baseEndYear = clamp(
    Math.max(
      lastGoalYear,
      // Prefer the engine's horizon; fall back to the profile-derived retirement
      // year only until a plan run is available.
      engineEndYear ?? retirementYear,
      currentYear + MIN_HORIZON_YEARS,
    ),
    currentYear + MIN_HORIZON_YEARS,
    capYear,
  );
  const displayEndYear = Math.min(
    capYear,
    Math.max(baseEndYear, revealEndYear ?? baseEndYear),
  );
  const years = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, displayEndYear - currentYear + 1) },
        (_, i) => currentYear + i,
      ),
    [currentYear, displayEndYear],
  );

  // Kept fresh for the drag handlers so they never read stale values.
  const capYearRef = useRef(capYear);
  capYearRef.current = capYear;
  const displayEndYearRef = useRef(displayEndYear);
  displayEndYearRef.current = displayEndYear;
  // Latest drag pointer Y (viewport coords) + the requestAnimationFrame handle
  // driving the auto-scroll/reveal loop while a goal is being dragged.
  const dragPointerYRef = useRef<number | null>(null);
  const autoScrollRafRef = useRef<number | null>(null);

  /** FY-end corpus_closing keyed by FY end calendar year (from fy_end_date). */
  const tornadoCorpusByYear = useMemo((): Map<number, TornadoCorpusRow> | null => {
    if (!cashflowData?.annual_cashflow?.length) return null;
    const rows = [...cashflowData.annual_cashflow].sort(
      (a, b) => Date.parse(a.fy_end_date) - Date.parse(b.fy_end_date),
    );
    const map = new Map<number, TornadoCorpusRow>();
    for (const row of rows) {
      const year = timelineYearFromAnnualRow(row);
      if (year == null) continue;
      map.set(year, {
        corpusClosing: row.corpus_closing,
        goalPayout: row.goal_payout,
      });
    }
    return map.size > 0 ? map : null;
  }, [cashflowData]);

  const cashflowProjection: ProjectionPoint[] | null = useMemo(() => {
    if (!tornadoCorpusByYear) return null;
    // Cover every projected FY the engine returned (no fixed-horizon cap), so
    // milestones/tooltips stay correct even for goals dragged far out.
    const points: ProjectionPoint[] = [];
    for (const [year, row] of [...tornadoCorpusByYear.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      if (year < currentYear) continue;
      points.push({
        year,
        endNav: row.corpusClosing,
        withdrawal: row.goalPayout,
      });
    }
    return points.length > 0 ? points : null;
  }, [tornadoCorpusByYear, currentYear]);

  // The projection is the engine's per-FY corpus path ONLY — never a client-side
  // fabrication. Empty until the plan loads — the page then renders as an example
  // (ages + blank tornado axis) and CashflowGate shows a dismissible prompt for
  // the missing inputs rather than blocking.
  const projection = useMemo<ProjectionPoint[]>(
    () => cashflowProjection ?? [],
    [cashflowProjection],
  );

  const projectionByYear = useMemo(() => {
    const map = new Map<number, ProjectionPoint>();
    for (const p of projection) map.set(p.year, p);
    return map;
  }, [projection]);

  // First year each milestone is crossed — recomputes as user scrubs invest slider.
  const milestonesByYear = useMemo(() => {
    const map = new Map<number, Milestone[]>();
    const unlocked = new Set<number>();
    for (const p of projection) {
      const crossed = MILESTONES.filter(
        (m) => p.endNav >= m.value && !unlocked.has(m.value),
      );
      if (crossed.length > 0) {
        // Only one tag per year: keep the highest-value milestone crossed this
        // year. Lower ones crossed the same year are still marked unlocked so
        // they don't reappear in a later year.
        const maxMilestone = crossed.reduce((max, m) =>
          m.value > max.value ? m : max,
        );
        map.set(p.year, [maxMilestone]);
        for (const m of crossed) unlocked.add(m.value);
      }
    }
    return map;
  }, [projection]);

  const tornadoAbsValues = useMemo(() => {
    if (!tornadoCorpusByYear?.size) return [] as number[];
    return [...tornadoCorpusByYear.values()].map((r) => Math.abs(r.corpusClosing));
  }, [tornadoCorpusByYear]);

  /** True max |closing| in the plan (e.g. retirement shortfall spike). */
  const tornadoTrueMaxAbs = useMemo(
    () => (tornadoAbsValues.length ? Math.max(...tornadoAbsValues) : 0),
    [tornadoAbsValues],
  );

  /** Half-width scale — excludes lone outliers so ₹8L–₹9Cr years stay visible. */
  const tornadoBarScale = useMemo(
    () => tornadoBarScaleMax(tornadoAbsValues),
    [tornadoAbsValues],
  );

  const tornadoHalfSpan = TORNADO_CENTER_X - NAV_PAD_PCT;

  const corpusToTornadoXCb = useCallback(
    (corpus: number) => corpusToTornadoX(corpus, tornadoBarScale, tornadoHalfSpan),
    [tornadoBarScale, tornadoHalfSpan],
  );

  const peakAnchor = useMemo(
    () => projection.reduce((m, p) => (p.endNav > m ? p.endNav : m), 0),
    [projection],
  );

  // Line mode: sqrt scale from left edge (0) to max NAV.
  const navToX = (nav: number): number => {
    if (peakAnchor <= 0) return NAV_PAD_PCT;
    const ratio = Math.max(0, Math.min(1, nav / peakAnchor));
    const t = Math.sqrt(ratio);
    return NAV_PAD_PCT + t * (100 - 2 * NAV_PAD_PCT);
  };

  const goalSheetOpen = addYear !== null || editGoal !== null;
  const goalSheetYear = addYear ?? editGoal?.year ?? currentYear + 5;

  return (
    <div className="mobile-container min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="flex items-center gap-2 px-5 pt-10 pb-2">
          <h1 className="text-lg font-semibold text-foreground">Goal planning</h1>
          {isTornado && (
            <button
              type="button"
              onClick={() => setProjectionOpen(true)}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-foreground hover:bg-muted/40"
              aria-label="Open goals projection"
            >
              Projection
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* Open the cashflow-inputs editor (view + edit the figures the
                projection runs on). */}
            <button
              type="button"
              onClick={() => setEditSignal((n) => n + 1)}
              className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#D4A868]/50 bg-card px-2.5 py-0.5 text-[11px] font-semibold text-[#D4A868] hover:bg-[#D4A868]/10"
              aria-label="Edit cashflow inputs"
            >
              <Settings2 className="h-3 w-3" />
              Inputs
            </button>
            {goalsLoading && (
              <span className="text-[11px] text-muted-foreground">Goals…</span>
            )}
            {cashflowLoading && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            {cashflowData ? (
              <button
                type="button"
                onClick={() =>
                  exportCashflowXls(
                    cashflowData.annual_cashflow,
                    cashflowData.monthly_cashflow ?? [],
                  )
                }
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-[11px] font-semibold text-foreground hover:bg-muted/40"
                aria-label="Download cashflow"
              >
                <Download className="h-3 w-3" />
                Download
              </button>
            ) : (
              !cashflowLoading && (
                <button
                  type="button"
                  onClick={() => {
                    setCashflowLoading(true);
                    setCashflowError(null);
                    computeCashflow()
                      .then((res) => {
                        if (!res) {
                          setCashflowError("Complete the required inputs to run goal planning.");
                          return;
                        }
                        setCashflowData(res);
                        toast.success("Cashflow projection ready");
                      })
                      .catch((err) => {
                        const msg = err instanceof Error ? err.message : "Cashflow failed";
                        setCashflowError(msg);
                        toast.error(msg);
                      })
                      .finally(() => setCashflowLoading(false));
                  }}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#D4A868]/50 bg-card px-2.5 py-0.5 text-[11px] font-semibold text-[#D4A868] hover:bg-muted/40"
                >
                  Run cashflow
                </button>
              )
            )}
          </div>
        </div>
      </header>

      <motion.main
        className="px-5 pt-2 space-y-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Insight banner — closeable, with the headline rolling right→left.
            Suggests the monthly amount the user can comfortably invest. */}
        {!insightClosed && displayAffordableMonthly != null && displayAffordableMonthly > 0 && (
          <motion.div
            className="relative -mx-5 flex items-center overflow-hidden"
            style={{
              backgroundImage: "linear-gradient(100deg, #D4A868, #C2487A, #7A52C8, #D4A868)",
              backgroundSize: "300% 100%",
              boxShadow: "0 0 12px rgba(212,168,104,0.45)",
            }}
            animate={{ backgroundPosition: ["0% 50%", "100% 50%"] }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          >
            <div className="flex-1 overflow-hidden py-2">
              <motion.div
                className="whitespace-nowrap text-[12px] font-semibold text-white"
                animate={{ x: ["100%", "-100%"] }}
                transition={{ duration: 23.4, repeat: Infinity, ease: "linear" }}
              >
                💡 Based on your cashflow, you could invest up to{" "}
                <span className="font-bold">{formatINR(Math.round(displayAffordableMonthly))}/month</span>{" "}
                towards your goals — adjust your SIP below to put it to work.
              </motion.div>
            </div>
            <button
              type="button"
              onClick={() => setInsightClosed(true)}
              aria-label="Dismiss insight"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/30 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}
        {cashflowError && !cashflowLoading && (
          <p className="px-1 text-[11px] text-amber-600">{cashflowError}</p>
        )}
        {goalsLoading && (
          <p className="px-1 text-[11px] text-muted-foreground">Loading goals from your plan…</p>
        )}
        {!goalsLoading && goals.length === 0 && (
          <p className="px-1 text-[11px] text-muted-foreground">
            No goals in your account yet. Use + to add one.
          </p>
        )}
        {/* Monthly investment (SIP what-if). Line mode previews instantly on the
            gold spine; in both modes "Apply to plan" re-runs the engine so the
            corpus bars / cashflow reflect the new SIP. */}
        <div
          className="sticky z-30 -mx-5 bg-background px-5 pb-1 pt-1"
          style={{ top: "60px" }}
        >
          <div className="rounded-xl border border-border bg-card px-3 py-1.5 flex items-center gap-3">
          <div className="shrink-0 leading-tight">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Invest /mo
            </p>
            <p
              className="text-[12px] font-semibold tabular-nums text-foreground"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {formatINRCompact(monthlyContrib)}
              <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                · {formatINRCompact(monthlyContrib * 12)}/yr
              </span>
            </p>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-[#D4A868]">
            <span className="text-[12px] text-muted-foreground shrink-0">₹</span>
            <input
              type="text"
              inputMode="numeric"
              value={Number.isFinite(monthlyContrib) ? monthlyContrib.toLocaleString("en-IN") : ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                const v = digits === "" ? 0 : Number(digits);
                if (Number.isFinite(v)) setMonthlyContrib(Math.max(0, v));
              }}
              className="w-full min-w-0 bg-transparent text-[12px] font-semibold tabular-nums text-foreground outline-none"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              placeholder="0"
              aria-label="Monthly investment amount"
            />
            <span className="text-[10px] text-muted-foreground shrink-0">/mo</span>
          </div>
          {/* Apply the typed SIP to the actual plan — saves the input and re-runs
              the engine so the whole cashflow reflects it. Shown only when the
              amount differs from the plan's current SIP. */}
          {planSip != null && monthlyContrib !== planSip && (
            <button
              type="button"
              onClick={() => void applySipToPlan()}
              disabled={applyingSip}
              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "#D4A868" }}
              title="Save this SIP and recompute your cashflow plan"
            >
              {applyingSip ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {applyingSip ? "Updating…" : "Apply to plan"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMonthlyContrib(planSip ?? 0)}
            disabled={monthlyContrib === (planSip ?? 0)}
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-muted/50 h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ border: "1px solid hsl(var(--border))" }}
            aria-label="Reset monthly investment to your plan's SIP"
            title="Reset to plan SIP"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          </div>
          {sipCapped && affordableMonthly != null && (
            <p className="mt-1 px-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
              You can invest about {formatINRCompact(affordableMonthly)}/mo from your income
              (after tax, expenses &amp; EMIs). A higher SIP is capped to that — it won't grow
              your corpus further, since the plan never invests more than you can save.
            </p>
          )}
        </div>

        {/* Priority filter — toggle which goals feed the projection */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
            Show
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => {
              const active = enabledPriorities.has(p);
              const chip = priorityChipStyle(p);
              const count = goals.filter((g) => g.priority === p).length;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePriority(p)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    active ? "" : "bg-muted/50 text-muted-foreground/70 hover:text-foreground"
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: chip.bg,
                          color: chip.fg,
                          border: `1px solid ${chip.border}`,
                        }
                      : { border: "1px solid hsl(var(--border))" }
                  }
                  aria-pressed={active}
                  title={`${active ? "Hide" : "Show"} ${p.toLowerCase()}-priority goals`}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: priorityNodeColor(p) }}
                  />
                  {p}
                  <span className="opacity-70">· {count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {isTornado && !tornadoCorpusByYear && !cashflowLoading && (
          <p className="px-1 text-[11px] text-amber-600">
            Run cashflow to load corpus closing bars from your plan.
          </p>
        )}

        {/* Chart axis legend — explains what the bars mean */}
        {isTornado && (
          <div className="flex items-center justify-between px-1 pt-2 pb-1 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: "rgb(239,68,68)" }} />
              <span>Negative</span>
            </div>
            <span className="font-semibold tracking-wide text-foreground/80">Portfolio Value</span>
            <div className="flex items-center gap-1.5">
              <span>Positive</span>
              <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: "rgb(16,185,129)" }} />
            </div>
          </div>
        )}

        {/* Integrated vertical NAV chart + goal timeline */}
        <ul className="space-y-0">
          <AnimatePresence initial={false}>
          {years.map((y, i) => {
            const yearGoals = goalsByYear.get(y) ?? [];
            const hasGoals = yearGoals.length > 0;
            const isMilestone = y % 5 === 0;
            // The user's age in this calendar year — shown beside the year so the
            // timeline reads in life-stage terms, not just dates. Only when DOB is known.
            const ageAtYear = birthYear != null ? y - birthYear : null;
            const proj = projectionByYear.get(y);
            const prevProj = projectionByYear.get(y - 1) ?? proj;
            const tornadoRow = isTornado ? tornadoCorpusByYear?.get(y) : undefined;
            const corpusClosing = isTornado
              ? (tornadoRow?.corpusClosing ?? 0)
              : (proj?.endNav ?? 0);
            const withdrawal = tornadoRow?.goalPayout ?? proj?.withdrawal ?? 0;
            const hasTornadoBar = isTornado && tornadoRow != null;

            const xTop = navToX(prevProj?.endNav ?? corpusClosing);
            const xBottomLine = navToX(corpusClosing);
            const isFirst = i === 0;
            const isLast = i === years.length - 1;

            // Tornado: centre = ₹0; bar tip at corpus_closing (width vs tornadoBarScale).
            const tipX = corpusToTornadoXCb(corpusClosing);
            const tornadoIsPositive = corpusClosing >= 0;
            const tornadoOffScale =
              tornadoBarScale > 0 && Math.abs(corpusClosing) > tornadoBarScale;
            const tornadoNorm =
              tornadoBarScale > 0
                ? Math.min(1, Math.abs(corpusClosing) / tornadoBarScale)
                : 0;
            const tornadoX1 = Math.min(TORNADO_CENTER_X, tipX);
            const tornadoX2 = Math.max(TORNADO_CENTER_X, tipX);
            const tornadoBaseHue = tornadoIsPositive ? "16, 185, 129" : "239, 68, 68";
            const tornadoDeepHue = tornadoIsPositive ? "5, 95, 70" : "136, 19, 55";
            const tornadoFillOpacity = 0.35 + tornadoNorm * 0.65;

            const xBottom = isTornado ? tipX : xBottomLine;

            const nodeColor = isTornado
              ? hasTornadoBar
                ? `rgb(${tornadoBaseHue})`
                : "hsl(var(--muted-foreground))"
              : "#D4A868";

            const isHovered = hoveredYear === y;
            const rowMilestones = milestonesByYear.get(y) ?? [];
            const hasMilestone = rowMilestones.length > 0;

            const isDropTarget = dropTargetYear === y && draggingGoalId !== null;
            // Rows past the settled timeline end are the transient tail that
            // appears/collapses as the user drags a goal — animate those.
            const isRevealTail = y > baseEndYear;
            return (
              <motion.li
                key={y}
                ref={(el: HTMLLIElement | null) => {
                  if (el) rowRefs.current.set(y, el);
                  else rowRefs.current.delete(y);
                }}
                initial={isRevealTail ? { height: 0, opacity: 0 } : false}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className={`relative ${isFirst ? "sticky z-[15] bg-background" : ""} ${isDropTarget ? "rounded-lg ring-2 ring-[#D4A868]/70" : ""}`}
                style={{
                  ...(isFirst ? { top: "108px" } : {}),
                  ...(isRevealTail ? { overflow: "hidden" } : {}),
                }}
              >
                <button
                  type="button"
                  onClick={() => setAddYear(y)}
                  onMouseEnter={() => setHoveredYear(y)}
                  onMouseLeave={() =>
                    setHoveredYear((h) => (h === y ? null : h))
                  }
                  onFocus={() => setHoveredYear(y)}
                  onBlur={() =>
                    setHoveredYear((h) => (h === y ? null : h))
                  }
                  className="group relative w-full text-left flex items-stretch gap-3 px-2 transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40 rounded-lg"
                  style={{ minHeight: hasGoals ? (isTornado ? 36 : 48) : isTornado ? 12 : 18 }}
                  aria-label={
                    hasGoals ? `Add another goal in ${y}` : `Add a goal in ${y}`
                  }
                >
                  {/* Full-width background chart — gold curve in line mode, tornado bar in tornado mode */}
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 pointer-events-none"
                    aria-hidden="true"
                  >
                    {!isTornado && (
                      <>
                        <defs>
                          <linearGradient
                            id={`navFill-${y}`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop offset="0%" stopColor="#D4A868" stopOpacity={0.16} />
                            <stop offset="100%" stopColor="#D4A868" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>

                        <path
                          d={`M 0 0 L ${xTop} 0 L ${xBottomLine} 100 L 0 100 Z`}
                          fill={`url(#navFill-${y})`}
                        />

                        <line
                          x1={xTop}
                          y1={isFirst ? 50 : 0}
                          x2={xBottomLine}
                          y2={isLast ? 50 : 100}
                          stroke="#D4A868"
                          strokeOpacity={isHovered ? 0.95 : 0.55}
                          strokeWidth={isHovered ? 2 : 1.5}
                          vectorEffect="non-scaling-stroke"
                        />

                        {hasGoals && (
                          <circle
                            cx={xBottomLine}
                            cy={50}
                            r={5}
                            fill="none"
                            stroke="#D4A868"
                            strokeOpacity={0.35}
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                        )}

                        <circle
                          cx={xBottomLine}
                          cy={50}
                          r={isHovered ? 4 : hasGoals ? 3 : 2}
                          fill={nodeColor}
                          stroke="hsl(var(--background))"
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    )}

                    {isTornado && (
                      <>
                        <defs>
                          <linearGradient
                            id={`tornadoBar-${y}`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop
                              offset="0%"
                              stopColor={`rgb(${tornadoIsPositive ? tornadoBaseHue : tornadoDeepHue})`}
                              stopOpacity={tornadoIsPositive ? 0.3 : 1}
                            />
                            <stop
                              offset="100%"
                              stopColor={`rgb(${tornadoIsPositive ? tornadoDeepHue : tornadoBaseHue})`}
                              stopOpacity={tornadoIsPositive ? 1 : 0.3}
                            />
                          </linearGradient>
                        </defs>

                        {/* Zero axis — corpus_closing bars extend left (negative) or right (positive). */}
                        <line
                          x1={TORNADO_CENTER_X}
                          y1={isFirst ? 50 : 0}
                          x2={TORNADO_CENTER_X}
                          y2={isLast ? 50 : 100}
                          stroke="hsl(var(--foreground))"
                          strokeOpacity={0.35}
                          strokeWidth={1}
                          vectorEffect="non-scaling-stroke"
                        />

                        {hasTornadoBar && tornadoX2 > tornadoX1 && (
                          <rect
                            x={tornadoX1}
                            y={17.5}
                            width={Math.max(0, tornadoX2 - tornadoX1)}
                            height={65}
                            fill={`url(#tornadoBar-${y})`}
                            fillOpacity={tornadoFillOpacity}
                          />
                        )}

                        {hasGoals && hasTornadoBar && (
                          <circle
                            cx={tipX}
                            cy={50}
                            r={5}
                            fill="none"
                            stroke="hsl(var(--muted-foreground))"
                            strokeOpacity={0.35}
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          />
                        )}

                        <circle
                          cx={hasTornadoBar ? tipX : TORNADO_CENTER_X}
                          cy={50}
                          r={isHovered ? 4 : hasGoals ? 3 : 2}
                          fill={nodeColor}
                          stroke="hsl(var(--background))"
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    )}
                  </svg>


                  {isHovered && (!isTornado || hasTornadoBar) && (
                    <div
                      className="pointer-events-none absolute z-20"
                      style={{
                        left: `${Math.min(95, Math.max(5, xBottom))}%`,
                        top: "50%",
                        transform:
                          xBottom > 75
                            ? "translate(-100%, -120%)"
                            : xBottom < 25
                              ? "translate(0, -120%)"
                              : "translate(-50%, -120%)",
                      }}
                    >
                      <div
                        className="rounded-md border border-border bg-card px-2 py-0.5 text-[11px] shadow-md whitespace-nowrap"
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {isTornado ? (
                          <>
                            <span className="text-muted-foreground">{y}</span>
                            <span className="mx-1 text-muted-foreground/50">·</span>
                            <span className="font-semibold text-foreground">
                              Close {formatINRCompact(corpusClosing)}
                            </span>
                            {tornadoOffScale && (
                              <span className="ml-1 text-[11px] text-amber-600">
                                (off-scale)
                              </span>
                            )}
                            {withdrawal > 0 && (
                              <span
                                className="ml-1 font-semibold"
                                style={{ color: "rgb(239,68,68)" }}
                              >
                                (−{formatINRCompact(withdrawal)} goals)
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">{y}</span>
                            <span className="mx-1 text-muted-foreground/50">·</span>
                            <span className="font-semibold text-foreground">
                              {formatINRCompact(corpusClosing)}
                            </span>
                            {withdrawal > 0 && (
                              <span
                                className="ml-1 font-semibold"
                                style={{ color: "rgb(239,68,68)" }}
                              >
                                (−{formatINRCompact(withdrawal)})
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* The user's age that year. Hover shows the calendar year.
                      Falls back to the year when we have no date of birth. */}
                  <div
                    className={`relative z-10 w-[48px] shrink-0 flex flex-col items-start leading-tight ${hasGoals ? "pt-2" : "pt-0"}`}
                  >
                    <span
                      title={ageAtYear != null && ageAtYear >= 0 ? `Year ${y}` : undefined}
                      className={`text-[12px] tabular-nums ${
                        isMilestone || hasGoals
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground/50"
                      }`}
                    >
                      {ageAtYear != null && ageAtYear >= 0 ? `${ageAtYear} yrs` : y}
                    </span>
                  </div>

                  {/* Right side: NAV figure + goal cards (empty years stay as a thin tick) */}
                  <div
                    className={`relative z-10 min-w-0 flex-1 ${hasGoals ? "py-1.5" : "py-0"}`}
                  >
                    {/* Milestone badge — floats above the row, doesn't push layout */}
                    <AnimatePresence>
                      {hasMilestone && (
                        <motion.div
                          key="ms-badges"
                          initial={{ opacity: 0, y: -2, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -2, scale: 0.92 }}
                          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                          className="pointer-events-none absolute right-0 top-0 z-20 flex flex-wrap justify-end gap-1"
                        >
                          {rowMilestones.map((m) => (
                            <span
                              key={m.value}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold animate-pulse"
                              style={{
                                backgroundColor: "rgba(229,192,121,0.95)",
                                color: "#3a2a08",
                                border: "1px solid rgba(229,192,121,0.85)",
                                boxShadow: "0 2px 8px rgba(229,192,121,0.45)",
                              }}
                            >
                              {m.label}
                            </span>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {hasGoals && (!isTornado || hasTornadoBar) && (
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[11px] tabular-nums text-muted-foreground"
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {isTornado ? "Close " : ""}
                          {formatINRCompact(corpusClosing)}
                        </span>
                      </div>
                    )}

                    {hasGoals && (
                      <div className="mt-1.5 flex flex-col gap-1.5">
                        {yearGoals.map((g) => {
                          const chip = priorityChipStyle(g.priority);
                          const yearsAway = Math.max(0, g.year - currentYear);
                          const fv = futureValue(
                            g.presentValue,
                            g.inflationRate,
                            yearsAway,
                          );
                          // Dummy per-goal funding progress. Hardcoded so the demo
                          // shows distinct numbers per goal rather than all maxing
                          // out at 100%.
                          const HARDCODED_ACHIEVED: Record<string, number> = {
                            "seed-home": 72,
                            "seed-education": 48,
                            "seed-retirement": 25,
                          };
                          const computedPct =
                            fv > 0
                              ? Math.min(100, Math.round(((corpusClosing + withdrawal) / fv) * 100))
                              : 0;
                          const pctAchieved = HARDCODED_ACHIEVED[g.id] ?? computedPct;
                          const GoalIcon = goalIconFor(g.name);
                          const isExpanded = expandedGoals.has(g.id);
                          const isDragging = draggingGoalId === g.id;
                          return (
                            <motion.div
                              key={g.id}
                              drag="y"
                              dragMomentum={false}
                              dragElastic={0.25}
                              dragSnapToOrigin
                              onDragStart={(e) => {
                                setDraggingGoalId(g.id);
                                setDropTargetYear(g.year);
                                startAutoScroll(dragClientY(e));
                              }}
                              onDrag={(e) => {
                                const y = dragClientY(e);
                                dragPointerYRef.current = y;
                                const yr = findYearAtClientY(y);
                                if (yr != null) setDropTargetYear(yr);
                              }}
                              onDragEnd={(e) => {
                                stopAutoScroll();
                                const yr = findYearAtClientY(dragClientY(e));
                                if (yr != null) {
                                  // Clamp to the valid window: never into the past
                                  // (minGoalYear), never past the currentYear + 100
                                  // ceiling (capYear).
                                  const target = clamp(yr, minGoalYear, capYear);
                                  if (target !== g.year) moveGoalToYear(g.id, target);
                                }
                                setDraggingGoalId(null);
                                setDropTargetYear(null);
                                setRevealEndYear(null);
                              }}
                              whileDrag={{
                                scale: 1.04,
                                boxShadow:
                                  "0 14px 28px rgba(0,0,0,0.18), 0 4px 10px rgba(0,0,0,0.10)",
                                zIndex: 50,
                                cursor: "grabbing",
                              }}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isDragging) return;
                                toggleGoalExpanded(g.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleGoalExpanded(g.id);
                                }
                              }}
                              aria-expanded={isExpanded}
                              aria-label={`${g.name} — tap to expand, drag to change year`}
                              className="relative touch-none cursor-grab rounded-xl border border-border bg-card/95 backdrop-blur-[1px] px-3 py-1.5 transition-colors hover:bg-card focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40 active:cursor-grabbing"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                                    style={{
                                      backgroundColor: chip.bg,
                                      color: chip.fg,
                                      border: `1px solid ${chip.border}`,
                                    }}
                                    aria-hidden="true"
                                  >
                                    <GoalIcon className="h-3.5 w-3.5" strokeWidth={2} />
                                  </span>
                                  <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">
                                    {g.name}
                                  </p>
                                </div>
                                <span
                                  className="shrink-0 text-[11px] font-semibold tabular-nums"
                                  style={{ color: "rgb(239,68,68)" }}
                                  title="Drawn from portfolio at target year"
                                >
                                  {formatINRCompact(fv)} drawn in {g.year}
                                </span>
                              </div>
                              <AnimatePresence initial={false}>
                                {isExpanded && (
                                  <motion.div
                                    key="goal-details"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-1.5 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground space-y-0.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span>Worth today</span>
                                        <span
                                          className="font-semibold tabular-nums text-foreground"
                                          style={{
                                            fontFamily:
                                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                                          }}
                                        >
                                          {formatINR(g.presentValue)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <span>% achieved</span>
                                        <span
                                          className="font-semibold tabular-nums"
                                          style={{
                                            color:
                                              pctAchieved >= 100
                                                ? "rgb(16, 185, 129)"
                                                : "hsl(var(--foreground))",
                                          }}
                                        >
                                          {pctAchieved}%
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 pt-2">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditGoal(g);
                                            setAddYear(null);
                                          }}
                                          className="flex-1 rounded-lg border border-border py-1.5 text-[11px] font-semibold text-foreground hover:bg-muted/50"
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDeleteGoal(g.id);
                                          }}
                                          className="flex-1 rounded-lg border border-destructive/40 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
              </motion.li>
            );
          })}
          </AnimatePresence>
        </ul>

        <p className="px-1 text-[10px] leading-snug text-muted-foreground/70">
          {isTornado
            ? "Each bar = total net worth at the end of that year. Green = positive net worth (you still have money). Red = negative net worth (goals have outpaced what you've saved). Wider = larger amount."
            : "Gold spine = projected NAV (today's portfolio, ₹2L/mo, 9% p.a.). Red ticks = goal-draw years."}
          <span className="ml-1 text-muted-foreground/60">
            Directional guide, not a forecast.
          </span>
        </p>

      </motion.main>

      <AddGoalSheet
        open={goalSheetOpen}
        initialYear={goalSheetYear}
        maxYear={capYear}
        editingGoal={editGoal}
        saving={goalSaving}
        retirementYear={retirementYear}
        onClose={closeGoalSheet}
        onSubmit={handleGoalSubmit}
      />

      <ProjectionSheet
        open={projectionOpen}
        onClose={() => setProjectionOpen(false)}
        fundFlow={cashflowData?.fund_flow_summary ?? null}
        headline={cashflowData?.headline ?? null}
        sipMonthly={planSip}
      />

      {/* Floating + FAB — pinned to the right edge of the page column */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 mx-auto max-w-md"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
      >
        <div className="flex justify-end px-5">
          <button
            type="button"
            onClick={() => setAddYear(currentYear + 5)}
            className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
            style={{
              backgroundColor: "#D4A868",
              color: "hsl(var(--background))",
              boxShadow: "0 6px 20px rgba(212, 168, 104, 0.45)",
            }}
            aria-label="Add a new goal"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <BottomNav />

      {/* Never blocks the goal-planning page. When inputs are missing it shows a
          dismissible prompt (the page stays usable as an example); when they're
          present it loads the real projection. The Settings/"Inputs" button bumps
          editSignal to open the form for viewing/editing. */}
      <CashflowGate onReady={fetchCashflow} editSignal={editSignal} autoOpenInputs={autoOpenInputs} />
    </div>
  );
};

export default GoalsTimeline;
