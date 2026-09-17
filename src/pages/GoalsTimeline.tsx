import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Download,
  GraduationCap,
  Heart,
  Home,
  HelpCircle,
  Landmark,
  Loader2,
  Minus,
  PanelRightOpen,
  PiggyBank,
  Plane,
  Plus,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";
import { trackDetailedOnboardingSectionCompleted } from "@/lib/detailedOnboardingAnalytics";
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
import {
  bandForRate,
  clampEquityReturn,
  DEBT_RETURN,
  EQUITY_RETURN,
  EQUITY_RETURN_MAX,
  EQUITY_RETURN_MIN,
  EQUITY_RETURN_STEP,
  EQUITY_STEP,
  equityPctForRate,
  formatMix,
  formatRate,
  PROJECTION_BASE_RATE,
  rateForEquityPct,
  readSavedEquityReturn,
  readSavedMix,
  scaleAnnualRowsToRate,
  writeSavedEquityReturn,
  writeSavedMix,
} from "@/lib/projectionScenario";
import CashflowGate from "@/components/goals/CashflowGate";
import CashflowInputsForm from "@/components/goals/CashflowInputsForm";
import AssetMixDial from "@/components/goals/AssetMixDial";
import GuidedTour, { type TourStep } from "@/components/GuidedTour";

/** Marks the first-run goal-planning walkthrough as seen, per browser. */
const GOAL_TOUR_SEEN_KEY = "goalPlanningTourSeen";

// The strategy card closes to its tab row. A per-browser preference, so the
// layout someone chose survives a reload.
const STRATEGY_COLLAPSED_KEY = "goals-strategy-collapsed";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode / quota — the choice just won't survive the reload */
  }
}

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
// Most important first — the order the filter chips and the goal-sheet picker
// both read in, so "High" is where the eye lands rather than buried last.
const PRIORITIES: Priority[] = ["High", "Medium", "Low"];

// Timeline-extent assumptions. The visible timeline ends at the later of the
// last goal year and the retirement year (age 60 by default); dragging a goal
// past the bottom can reveal future rows up to MAX_HORIZON_YEARS from today.
const DEFAULT_RETIREMENT_AGE = 60;
/** Step for the monthly-SIP stepper — a SIP moves in round thousands. */
const SIP_STEP = 1000;
// Hard ceiling for the draggable timeline: currentYear + this many years
// (e.g. 2026 → 2126, 2027 → 2127). Mirrors the backend cashflow engine's
// horizon cap (compute_horizon_years cap=100 FY-years from today) so every
// draggable year still produces corpus-closing bars.
const MAX_HORIZON_YEARS = 100;
// Used only when we have no DOB to anchor the user's age.
const FALLBACK_CURRENT_AGE = 30;
// Always show at least this many years even if retirement is in the past.
const MIN_HORIZON_YEARS = 5;
// Row density. The near term is where the plan is actionable, so the first
// DENSE_ROW_YEARS get a bar each; after that the timeline thins to one bar
// every YEAR_ROW_STEP years, landing on round marks (age 25 / 30 / 35 ...).
// Goal years and the final year are always kept, so nothing the user placed
// can be thinned away.
const DENSE_ROW_YEARS = 5;
const YEAR_ROW_STEP = 5;

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
const TORNADO_CENTER_X = 50; // viewBox x for ₹0 when the plan dips negative
// No negative year in the plan? The left half would sit empty, so the ₹0 axis
// moves left (clear of the age column) and positive bars get the extra width.
const TORNADO_CENTER_X_POSITIVE = 20;

// Earned milestones — light up the first year the projected NAV crosses each.
interface Milestone {
  value: number;
  label: string;
}

/* A deliberately sparse ladder: 1Cr, then 5 / 10 / 20 / 50 / 100Cr. Each rung is
   a real step up rather than an incremental one, so a gold badge stays rare
   enough to feel earned — the previous ladder (3 / 5 / 7.5 / 10 / 15 / 20 / 25)
   could light several rows on a single screen, which made the flash routine. */
const MILESTONES: Milestone[] = [
  { value: 1_00_00_000, label: "First ₹1Cr 🎯" },
  { value: 5_00_00_000, label: "₹5Cr 🌟" },
  { value: 10_00_00_000, label: "₹10Cr club 🏆" },
  { value: 20_00_00_000, label: "₹20Cr legend 👑" },
  { value: 50_00_00_000, label: "₹50Cr ✨" },
  { value: 100_00_00_000, label: "₹100Cr 👑" },
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
  centerX: number,
): number {
  if (scaleMax <= 0 || corpus === 0) return centerX;
  const sign = corpus > 0 ? 1 : -1;
  // Each side runs from the axis to its own edge padding — equal at a centred
  // axis, and all of the extra room on the right once the axis shifts left.
  const span =
    sign > 0 ? 100 - NAV_PAD_PCT - centerX : centerX - NAV_PAD_PCT;
  let norm = Math.abs(corpus) / scaleMax;
  if (norm > 0 && norm < 0.04) norm = 0.04;
  norm = Math.min(1, norm);
  return centerX + sign * norm * span;
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
              data-tour="goal-form"
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

                <div data-tour="goal-value-kind">
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

// Goals-projection waterfall — rendered inside the right-side plan panel.
// Every figure comes from the cashflow engine's fund-flow summary (the single
// source of truth) — nothing here is hardcoded. The return-scenario toggle only
// scales the engine's ROI; all other flows are held at their engine values.
interface ProjectionContentProps {
  /** Engine fund-flow summary (SSOT for the waterfall). Null until a plan exists. */
  fundFlow: FundFlowSummary | null;
  /** Headline status — supplies the projection horizon (last FY end). */
  headline: HeadlineStatus | null;
  /** The plan's monthly SIP, for the header label. */
  sipMonthly: number | null;
  /** Jump to the Inputs tab when no plan exists yet. */
  onGoToInputs?: () => void;
  /** The return rate currently driving the goal-planning page's cashflow. */
  appliedRate: number;
  /** Applied equity share, or null while the plan runs on the engine's return. */
  appliedEquityPct: number | null;
  /** Jump to the Strategy tab, where the mix and the return are actually set. */
  onGoToStrategy: () => void;
}

type WaterfallItem = { axis: string; label: string; value: number; kind: WaterfallKind };

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

function ProjectionContent({
  fundFlow,
  headline,
  sipMonthly,
  onGoToInputs,
  appliedRate,
  appliedEquityPct,
  onGoToStrategy,
}: ProjectionContentProps) {
  // Everything here reads the mix and return the plan is actually running on.
  // Setting them lives one tab over, in Strategy — a projection that quietly
  // previewed an unapplied draft would be a different plan than the timeline's.
  const band = bandForRate(appliedRate);

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
      Math.pow(1 + appliedRate / 100, horizonYears) /
      Math.pow(1 + PROJECTION_BASE_RATE / 100, horizonYears);
    return Math.round(ROI_BASE * factor);
  }, [appliedRate, horizonYears, ROI_BASE]);

  // No plan yet → don't fabricate a waterfall; prompt to complete inputs.
  if (!fundFlow) {
    return (
      <div className="py-10 text-center">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Goals projection
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete your cashflow inputs to see your projection.
        </p>
        {onGoToInputs && (
          <button
            type="button"
            onClick={onGoToInputs}
            className="mt-4 rounded-full border border-[#D4A868]/50 px-4 py-2 text-sm font-semibold text-[#D4A868] hover:bg-[#D4A868]/10"
          >
            Add inputs
          </button>
        )}
      </div>
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
    <div className="space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Through {horizonLabel} · {monthlyLabel} ·{" "}
        {appliedEquityPct != null ? `${formatMix(appliedEquityPct)} equity-debt · ` : ""}
        {formatRate(appliedRate)} post-tax
      </p>
      <div className="space-y-4">
                {/* What this projection is built on. The controls themselves are
                    in Strategy, so there is exactly one place a plan is changed
                    and this tab only ever shows the applied one. */}
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Built on
                      </p>
                      <p className="mt-0.5 text-[12px] font-semibold text-foreground">
                        {appliedEquityPct != null
                          ? `${formatMix(appliedEquityPct)} equity-debt · ${formatRate(appliedRate)} p.a.`
                          : `The engine's own plan · ${formatRate(appliedRate)} p.a.`}
                      </p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{
                        backgroundColor: "rgba(212,168,104,0.16)",
                        color: "#D4A868",
                        border: "1px solid rgba(212,168,104,0.45)",
                      }}
                    >
                      {band.label}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={onGoToStrategy}
                    className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#D4A868] underline underline-offset-2"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    Change in Strategy
                  </button>
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
                  Only returns vary. Assumptions, not a guarantee.
                </p>
      </div>
    </div>
  );
}

type StrategyTab = "summary" | "sip" | "allocation" | "priority";

interface StrategyContentProps {
  /** Every goal on the plan, unfiltered — the priority list is where priority is set. */
  goals: TimelineGoal[];
  /** Commit a goal's priority. Optimistic upstream; this only reports the intent. */
  onSetPriority: (id: string, priority: Priority) => void;
  /** Goal whose priority is mid-save, so its row can show a spinner. */
  savingPriorityId: string | null;
  /** Priorities currently feeding the timeline, and the chip that toggles them. */
  enabledPriorities: Set<Priority>;
  onToggleFilter: (priority: Priority) => void;
  /** The return the goal-planning page's cashflow is currently running on. */
  appliedRate: number;
  /** Applied equity share, or null while the plan runs on the engine's return. */
  appliedEquityPct: number | null;
  /** The equity-sleeve assumption in force (user-set or the standing default). */
  equityReturn: number;
  /**
   * Commit the tab's edits — the mix, the equity assumption, or both. Each
   * argument is null when that half is unchanged, so one Save can send
   * whichever of the two the user actually touched.
   */
  onSave: (equityPct: number | null, equityReturn: number | null) => void;
  /** The monthly-SIP control, built by the page that owns its state. */
  sipPanel: React.ReactNode;
  /** The SIP saved to the plan — null until a plan exists. */
  sipApplied: number | null;
  /** Which section is showing, owned by the page so other CTAs can aim at one. */
  tab: StrategyTab;
  onTabChange: (tab: StrategyTab) => void;
  /** Whole card closed to just its tab row. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/**
 * The three things the user can change about a plan — which goals matter most,
 * how the money is split, and what equity is assumed to earn — as three tabs
 * side by side rather than a stack behind a disclosure.
 *
 * Priority saves as you press it: it ranks intent, not money. The mix and the
 * return each stay a draft until their own Apply, because both rewrite the
 * projection the whole page is reading.
 */
function StrategyContent({
  goals,
  onSetPriority,
  savingPriorityId,
  enabledPriorities,
  onToggleFilter,
  appliedRate,
  appliedEquityPct,
  equityReturn,
  onSave,
  sipPanel,
  sipApplied,
  tab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
}: StrategyContentProps) {
  // With no mix applied yet the wheel opens on the split nearest the plan's own
  // return, so the first drag starts from where the plan already is.
  const openingMix = appliedEquityPct ?? equityPctForRate(appliedRate, equityReturn);
  const [draftEquity, setDraftEquity] = useState(openingMix);
  useEffect(() => {
    setDraftEquity(openingMix);
  }, [openingMix]);
  const draftRate = rateForEquityPct(draftEquity, equityReturn);
  const mixDirty = draftEquity !== openingMix;

  const [equityInfoOpen, setEquityInfoOpen] = useState(false);
  const [draftEquityReturn, setDraftEquityReturn] = useState(String(equityReturn));
  useEffect(() => {
    setDraftEquityReturn(String(equityReturn));
  }, [equityReturn]);
  const parsedEquityReturn = Number(draftEquityReturn);
  const equityReturnValid =
    draftEquityReturn.trim() !== "" &&
    Number.isFinite(parsedEquityReturn) &&
    parsedEquityReturn >= EQUITY_RETURN_MIN &&
    parsedEquityReturn <= EQUITY_RETURN_MAX;
  const returnDirty = equityReturnValid && parsedEquityReturn !== equityReturn;
  // Stepping works off the last good number, so the buttons still do something
  // sensible while the field holds a half-typed value.
  const equityReturnBase = equityReturnValid ? parsedEquityReturn : equityReturn;
  const stepEquityReturn = (delta: number) => {
    setDraftEquityReturn(String(clampEquityReturn(equityReturnBase + delta)));
  };

  // One Save for the tab, lit as soon as either half is off what is applied.
  const tabDirty = mixDirty || returnDirty;
  // What the mix on screen would earn under the edited assumption.
  const previewRate = equityReturnValid
    ? rateForEquityPct(draftEquity, parsedEquityReturn)
    : draftRate;

  // Most important first, then soonest — the order someone would rank them in.
  const rankedGoals = useMemo(
    () =>
      [...goals].sort((a, b) => {
        const byPriority = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
        return byPriority !== 0 ? byPriority : a.year - b.year;
      }),
    [goals],
  );

  const hasGoals = rankedGoals.length > 0;
  // Summary first — what the plan is running on — then the two levers that
  // change it, then the ranking. Fixed: an absent tab reads as a bug, so Goal
  // priority stays put and simply has nothing listed under it until there are
  // goals.
  const TABS: { id: StrategyTab; label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "sip", label: "SIP" },
    { id: "allocation", label: "Asset & Returns" },
    { id: "priority", label: "Priority" },
  ];
  const active = tab;
  const isBaseRate = appliedEquityPct == null;

  // One headline figure per section, with a quiet line of context under it.
  // Anything that needs two numbers to be read at a glance gets the second one
  // in the note, never a second figure competing with the first.
  const SUMMARY_ROWS: {
    id: StrategyTab;
    label: string;
    value: string;
    chip?: string;
    note: string;
  }[] = [
    {
      id: "allocation",
      label: "Blended return",
      value: formatRate(appliedRate),
      chip: bandForRate(appliedRate).label,
      // The split and the equity assumption are one sentence: neither means much
      // without the other, and together they are how the figure above was got.
      note: isBaseRate
        ? "the engine's own plan"
        : `${Math.round(appliedEquityPct ?? 0)} equity / ${
            100 - Math.round(appliedEquityPct ?? 0)
          } debt mix, with ${formatRate(equityReturn)} equity return`,
    },
    {
      id: "sip",
      label: "Monthly SIP",
      value: sipApplied != null ? `${formatINRCompact(sipApplied)}/mo` : "Not set",
      note: sipApplied != null ? `${formatINRCompact(sipApplied * 12)} a year` : "",
    },
  ];

  // Stacked, not a table. Each section is a label, a figure and a line of
  // context — hairlines instead of boxes, so the numbers are the only thing
  // with weight. Defined once: pinned and in-tab are the same summary.
  const summaryBlocks = (
    <div className="divide-y divide-border">
      {SUMMARY_ROWS.map((row) => (
        <button
          key={row.label}
          type="button"
          onClick={() => onTabChange(row.id)}
          className="group block w-full py-3 text-left first:pt-0 last:pb-0"
        >
          <span className="block text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
            {row.label}
          </span>
          <span className="mt-1 flex items-center gap-2">
            <span className="text-[20px] font-semibold leading-none tracking-tight text-foreground transition-colors group-hover:text-[#D4A868]">
              {row.value}
            </span>
            {row.chip && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: "rgba(212,168,104,0.16)",
                  color: "#D4A868",
                  border: "1px solid rgba(212,168,104,0.45)",
                }}
              >
                {row.chip}
              </span>
            )}
          </span>
          {row.note && (
            <span className="mt-1.5 block text-[11px] text-muted-foreground">{row.note}</span>
          )}
        </button>
      ))}
    </div>
  );

  const blurb =
    active === "summary"
      ? ""
      : active === "sip"
        ? "What you invest each month."
        : active === "priority"
          ? "Filter for:"
        : `At a ${formatMix(draftEquity)} mix, blended return is ${formatRate(
            equityReturnValid ? previewRate : draftRate,
          )} p.a.`;

  return (
    <div>
      <div role="tablist" aria-label="Plan strategy" className="flex items-center gap-5 border-b border-border">
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <Fragment key={t.id}>
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  onTabChange(t.id);
                  if (collapsed) onToggleCollapsed();
                }}
                className={`relative -mb-px whitespace-nowrap pb-2 text-[13px] transition-colors ${
                  isActive
                    ? "font-bold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {isActive && (
                  <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-foreground" />
                )}
              </button>
            </Fragment>
          );
        })}
        {/* Closes the whole card to its tab row — the timeline is what the page
            is for, and this is a lot of controls to sit above it. */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ml-auto pb-2 text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Open" : "Minimise"}
          title={collapsed ? "Open" : "Minimise"}
        >
          {collapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>
      </div>

      {!collapsed && (
      <>
      {blurb && (
        <p
          className={
            active === "allocation"
              ? "mt-2 text-[18px] font-semibold leading-snug tracking-tight text-muted-foreground"
              : "mt-2 text-[11px] leading-snug text-muted-foreground/80"
          }
        >
          {blurb}
        </p>
      )}

      <div className="mt-2.5">
        {active === "sip" && sipPanel}

        {active === "summary" && (
          <div>
            {summaryBlocks}
          </div>
        )}

        {active === "priority" && (
          <div data-tour="goal-priority">
            {/* Which priorities feed the projection — the filter, above the
                list it acts on. */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {PRIORITIES.map((p) => {
                const on = enabledPriorities.has(p);
                const chip = priorityChipStyle(p);
                const count = goals.filter((g) => g.priority === p).length;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onToggleFilter(p)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      on ? "" : "bg-muted/50 text-muted-foreground/70 hover:text-foreground"
                    }`}
                    style={
                      on
                        ? {
                            backgroundColor: chip.bg,
                            color: chip.fg,
                            border: `1px solid ${chip.border}`,
                          }
                        : { border: "1px solid hsl(var(--border))" }
                    }
                    aria-pressed={on}
                    title={`${on ? "Hide" : "Show"} ${p.toLowerCase()}-priority goals`}
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
            {hasGoals && (
            <ul className="overflow-hidden rounded-xl border border-border">
              {rankedGoals.map((g, idx) => {
                const Icon = goalIconFor(g.name);
                const saving = savingPriorityId === g.id;
                return (
                  <li
                    key={g.id}
                    className="px-3 py-2.5"
                    style={{
                      borderBottom:
                        idx === rankedGoals.length - 1 ? undefined : "1px solid hsl(var(--border))",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: priorityNodeColor(g.priority) }}
                      />
                      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
                        {g.name}
                      </span>
                      {saving && (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                      )}
                      <span
                        className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      >
                        {formatINRCompact(g.presentValue)} · {g.year}
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1.5 pl-[22px]">
                      {PRIORITIES.map((pr) => {
                        const on = g.priority === pr;
                        const chip = priorityChipStyle(pr);
                        return (
                          <button
                            key={pr}
                            type="button"
                            disabled={saving}
                            onClick={() => onSetPriority(g.id, pr)}
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                              on ? "" : "text-muted-foreground/70 hover:text-foreground"
                            }`}
                            style={
                              on
                                ? {
                                    backgroundColor: chip.bg,
                                    color: chip.fg,
                                    border: `1px solid ${chip.border}`,
                                  }
                                : { border: "1px solid hsl(var(--border))" }
                            }
                            aria-pressed={on}
                            aria-label={`Set ${g.name} to ${pr.toLowerCase()} priority`}
                          >
                            {pr}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            )}
            {hasGoals && (
              <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">
                Saves as you press it. Ranking doesn&apos;t move money between goals.
              </p>
            )}
          </div>
        )}

        {active === "allocation" && (
          <div data-tour="asset-mix">
            {/* The split the wheel is showing, stated in figures — it tracks the
                drag, and the caption above carries the return it blends to. */}

            {/* The wheel IS the control — press or drag the ring to re-split. */}
            <AssetMixDial
              equityPct={draftEquity}
              step={EQUITY_STEP}
              onChange={setDraftEquity}
              equityNote={`assumes ${formatRate(equityReturn)} p.a.`}
              debtNote={`assumes ${formatRate(DEBT_RETURN)} p.a.`}
            />

            {/* How to work the wheel, and what moving it does. Full width under
                the dial rather than squeezed into the legend column beside it. */}
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              Drag the ring to re-split. More equity, higher assumed return.
            </p>

            {(mixDirty || appliedEquityPct == null) && (
              <p className="mt-2.5 text-[10.5px] text-muted-foreground/70">
                {mixDirty
                  ? "Nothing moves until you press Save."
                  : `The engine's own plan, at ${formatRate(appliedRate)}. Drag to test another split.`}
              </p>
            )}

            {/* The mix is blended from this number, so it belongs with the wheel
                rather than a tab away — change the assumption, and the split
                above re-rates against it. */}
            <div className="mt-4 border-t border-border pt-3" data-tour="equity-return">
              <div className="flex items-center gap-1">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70">
                  Equity return
                </p>
                {/* Where the standing number comes from — on demand, so the
                    field itself stays uncluttered. */}
                <button
                  type="button"
                  onClick={() => setEquityInfoOpen((o) => !o)}
                  className="text-muted-foreground/60 hover:text-foreground"
                  aria-expanded={equityInfoOpen}
                  aria-label="Where this assumption comes from"
                >
                  <HelpCircle className="h-3 w-3" />
                </button>
              </div>
              {equityInfoOpen && (
                <p className="mb-1.5 mt-1 text-[11px] italic leading-snug text-muted-foreground">
                  What all-equity is assumed to earn, post-tax. An assumption, not a forecast. Pi
                  assumes return to be {formatRate(EQUITY_RETURN)} based on historical data.
                </p>
              )}
              {/* The heading above names this field, so the label is for
                  screen readers rather than the same words twice. */}
              <label htmlFor="strategy-equity-return" className="sr-only">
                Assumed equity return, percent a year
              </label>
              <div
                className={`flex items-center gap-1 rounded-xl border bg-background p-1 ${
                  equityReturnValid ? "border-border" : "border-destructive"
                }`}
              >
                <button
                  type="button"
                  onClick={() => stepEquityReturn(-EQUITY_RETURN_STEP)}
                  disabled={equityReturnBase <= EQUITY_RETURN_MIN}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label={`Lower by ${formatRate(EQUITY_RETURN_STEP)}`}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <div className="flex flex-1 items-baseline justify-center gap-1">
                  <input
                    id="strategy-equity-return"
                    type="text"
                    inputMode="decimal"
                    value={draftEquityReturn}
                    onChange={(e) => setDraftEquityReturn(e.target.value.replace(/[^\d.]/g, ""))}
                    className="w-[4.5ch] bg-transparent text-right text-[15.3px] font-semibold tabular-nums text-foreground outline-none"
                    aria-describedby="strategy-equity-return-hint"
                  />
                  <span className="text-[15.3px] font-semibold text-muted-foreground">% p.a.</span>
                </div>
                <button
                  type="button"
                  onClick={() => stepEquityReturn(EQUITY_RETURN_STEP)}
                  disabled={equityReturnBase >= EQUITY_RETURN_MAX}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label={`Raise by ${formatRate(EQUITY_RETURN_STEP)}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {!equityReturnValid && (
                <p
                  id="strategy-equity-return-hint"
                  className="mt-2 text-[10.5px] leading-snug text-destructive"
                >
                  Enter a return between {formatRate(EQUITY_RETURN_MIN)} and{" "}
                  {formatRate(EQUITY_RETURN_MAX)}.
                </p>
              )}

            </div>

            {/* One commit for the tab: the split and the assumption it blends
                from are one decision, and both stay a draft until this. */}
            <button
              type="button"
              disabled={!tabDirty}
              onClick={() =>
                onSave(
                  mixDirty ? draftEquity : null,
                  returnDirty ? clampEquityReturn(parsedEquityReturn) : null,
                )
              }
              className="mt-4 w-full rounded-xl py-2.5 text-[12px] font-bold transition-all active:scale-[0.99] disabled:cursor-not-allowed"
              style={
                tabDirty
                  ? {
                      backgroundColor: "#D4A868",
                      color: "#2D1F05",
                      boxShadow: "0 2px 8px rgba(212,168,104,0.45)",
                    }
                  : {
                      backgroundColor: "hsl(var(--muted) / 0.6)",
                      color: "hsl(var(--muted-foreground))",
                    }
              }
            >
              Save
            </button>
          </div>
        )}

      </div>
      </>
      )}
    </div>
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
  // Goal whose priority is mid-save, so the Strategy row can show a spinner.
  const [prioritySavingId, setPrioritySavingId] = useState<string | null>(null);
  // Ranking, mix and return live on the page itself, as three tabs.
  const [strategyTab, setStrategyTab] = useState<StrategyTab>("summary");
  // The whole card closes to its tab row; the choice survives a reload.
  const [strategyCollapsed, setStrategyCollapsed] = useState(() =>
    readFlag(STRATEGY_COLLAPSED_KEY),
  );

  const toggleStrategyCollapsed = useCallback(() => {
    setStrategyCollapsed((on) => {
      const next = !on;
      writeFlag(STRATEGY_COLLAPSED_KEY, next);
      return next;
    });
  }, []);
  const strategyRef = useRef<HTMLDivElement | null>(null);
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
  // When arriving from the "What are you trying to achieve?" card (?inputs=1),
  // open the cashflow inputs form straight away.
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const autoOpenInputs = searchParams.get("inputs") === "1";
  // Arrived mid-profile-setup (?from=profile): show a "Back to profile setup" bar
  // and return there once the cashflow inputs are saved, so the user can finish
  // the remaining profile sections instead of being stranded here.
  const fromProfile = searchParams.get("from") === "profile";
  // ?from=resume tells /profile/complete to keep its remembered entry origin
  // (e.g. chat) across this round trip instead of resetting it to /profile.
  const returnToProfile = useCallback(
    () => navigate("/profile/complete?from=resume"),
    [navigate],
  );
  // The profile's "What are you trying to achieve?" section is confirmed by
  // having ≥1 saved goal — not by cashflow inputs — so the from-profile flow
  // must not bounce back before one exists.
  const hasPersistedGoals = useMemo(
    () => goals.some((g) => isPersistedGoalId(g.id)),
    [goals],
  );
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [draggingGoalId, setDraggingGoalId] = useState<string | null>(null);
  const [dropTargetYear, setDropTargetYear] = useState<number | null>(null);
  // Right-side plan panel (inputs + projection) — opened from the header trigger.
  // Inputs is the primary tab: first in the toggle and the default on open.
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"projection" | "inputs">("inputs");
  // Bumped after a save from the panel's inputs form so CashflowGate refetches
  // readiness (its prompt would otherwise keep claiming inputs are missing).
  const [gateRefresh, setGateRefresh] = useState(0);

  /* First-run walkthrough of the four things that actually drive a plan. Shown
     once per browser; the header's "?" replays it on demand. */
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(GOAL_TOUR_SEEN_KEY) !== "1") setTourOpen(true);
    } catch {
      /* private mode — just skip the tour rather than breaking the page */
    }
  }, []);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    // Steps 1-2 open the goal form to explain it; leaving the tour at any point
    // should put the page back the way it was found.
    setAddYear(null);
    setEditGoal(null);
    setPanelOpen(false);
    try {
      localStorage.setItem(GOAL_TOUR_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }, []);

  /* Steps 3 and 4 live inside the plan panel, so each opens the panel on the
     right tab before the tour measures its target. */
  /* Step-by-step walkthrough of everything that drives a plan, in the order a
     first-timer meets it: add a goal, tell us the inputs, set the mix, then the
     two levers (SIP, priority) that change what the projection says. */
  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        anchor: "goal-form",
        title: "Add a goal",
        body: "The + button opens this form. Pick a category, name the goal, set its target year and enter what it costs \u2014 you can drag it up or down the timeline later to move the year.",
        // Opens the goal form so steps 1 and 2 explain it in place.
        before: () => {
          setPanelOpen(false);
          setEditGoal(null);
          setAddYear(new Date().getFullYear() + 5);
        },
      },
      {
        anchor: "goal-value-kind",
        title: "Today's value vs future value",
        body: "Today's value = what it costs at today's prices, and Prozpr inflates it to the target year for you. Future value = the amount you'll actually need by then, used exactly as entered.",
        // Opens the goal form so the choice is spotlighted where it's made.
        before: () => {
          setPanelOpen(false);
          setEditGoal(null);
          setAddYear(new Date().getFullYear() + 5);
        },
      },
      {
        anchor: "chart-legend",
        title: "Reading the chart",
        body: "Each bar is your portfolio at the end of that year: green to the right is positive, red to the left means goals have outpaced your savings. The first few years show one bar each; after that it's every third year, plus any year holding a goal.",
        before: () => {
          setAddYear(null);
          setEditGoal(null);
          setPanelOpen(false);
        },
      },
      {
        anchor: "plan-button",
        title: "Open your plan",
        body: "Plan holds the two tabs behind every figure on this page: Inputs and Projection.",
        before: () => {
          setAddYear(null);
          setEditGoal(null);
          setPanelOpen(false);
        },
      },
      {
        anchor: "plan-inputs",
        title: "Inputs",
        body: "What you earn, spend and save each month. Nothing projects until these are filled in.",
        before: () => {
          setPanelTab("inputs");
          setPanelOpen(true);
        },
      },
      {
        anchor: "monthly-sip",
        title: "SIP",
        body: "Type a different monthly amount to see it on the timeline straight away. Apply to plan makes it real; the reset arrow restores your plan's SIP.",
        before: () => {
          setPanelOpen(false);
          setStrategyTab("sip");
        },
      },
      {
        anchor: "priority-filter",
        title: "Priority and strategy",
        body: "Three tabs: rank your goals and filter which ones count, set the equity-debt mix, and set what equity is assumed to earn.",
        before: () => {
          setPanelOpen(false);
          setStrategyTab("priority");
        },
      },
      {
        anchor: "asset-mix",
        title: "Asset allocation",
        body: `Drag the wheel to split equity and debt — the return follows from it. Debt is ${formatRate(DEBT_RETURN)} a year, equity ${formatRate(EQUITY_RETURN)} unless you change it below. Nothing moves until you press Save.`,
        before: () => {
          setPanelOpen(false);
          setStrategyTab("allocation");
        },
      },
    ],
    [],
  );

  // Birth year (from DOB) + retirement age drive where the timeline ends.
  const [birthYear, setBirthYear] = useState<number | null>(null);
  const [retirementAge, setRetirementAge] = useState<number>(DEFAULT_RETIREMENT_AGE);
  // Transient extra extent revealed while dragging a goal past the bottom row.
  const [revealEndYear, setRevealEndYear] = useState<number | null>(null);

  const [cashflowData, setCashflowData] = useState<CashflowPlanRunDetail | null>(null);
  const [cashflowLoading, setCashflowLoading] = useState(false);
  const [cashflowError, setCashflowError] = useState<string | null>(null);

  // The return rate currently APPLIED to the plan. Owned here rather than in the
  // panel because it drives this page's cashflow; the panel only previews a draft
  // until the user presses Apply. Saved so the choice survives a reload — someone
  // who applied 4% should not silently be back on the engine's 9%.
  // The scenario is an equity/debt split, not a bare return: the user sets the
  // mix and the assumed post-tax return is read off it. Null = no mix applied,
  // so the plan is still exactly what the engine computed.
  const [appliedEquityPct, setAppliedEquityPct] = useState<number | null>(readSavedMix);
  // What an all-equity sleeve is assumed to earn. The mix blends against it, so
  // this sits beside the mix rather than inside it — and is saved the same way,
  // because someone who set 12% should not silently be back on 20% next visit.
  const [equityReturn, setEquityReturn] = useState<number>(readSavedEquityReturn);
  const appliedRate =
    appliedEquityPct == null
      ? PROJECTION_BASE_RATE
      : rateForEquityPct(appliedEquityPct, equityReturn);

  /**
   * Commit the Asset allocation tab: the equity/debt split, the equity-sleeve
   * assumption, or both. Each is null when untouched, so one Save sends only
   * what the user actually changed — and one toast reports the result rather
   * than two firing at each other.
   */
  const saveStrategy = useCallback(
    (nextEquityPct: number | null, nextEquityReturn: number | null) => {
      const equity =
        nextEquityReturn != null ? clampEquityReturn(nextEquityReturn) : equityReturn;
      if (nextEquityReturn != null) {
        setEquityReturn(equity);
        writeSavedEquityReturn(equity);
      }

      const mix =
        nextEquityPct != null
          ? Math.min(100, Math.max(0, Math.round(nextEquityPct / EQUITY_STEP) * EQUITY_STEP))
          : appliedEquityPct;
      if (nextEquityPct != null) {
        setAppliedEquityPct(mix);
        writeSavedMix(mix as number);
      }

      const rate = mix == null ? PROJECTION_BASE_RATE : rateForEquityPct(mix, equity);
      const changed: string[] = [];
      if (nextEquityPct != null) changed.push(`${formatMix(mix as number)} equity-debt`);
      if (nextEquityReturn != null) changed.push(`${formatRate(equity)} equity return`);
      toast.success(changed.join(" · "), {
        description:
          mix == null
            ? `Your plan is still the engine's own at ${formatRate(PROJECTION_BASE_RATE)} — set a mix to project on your own.`
            : `Your goal plan now runs on ${formatRate(rate)} post-tax returns (${bandForRate(rate).label.toLowerCase()}).`,
      });
    },
    [appliedEquityPct, equityReturn],
  );

  /** Close the panel and bring the on-page strategy card to a given tab. */
  const openStrategy = useCallback((tab: StrategyTab) => {
    setStrategyTab(tab);
    setPanelOpen(false);
    // After the panel's slide-out, so the card is measured where it lands.
    window.setTimeout(
      () => strategyRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      300,
    );
  }, []);


  /** Engine rows replayed at the applied return — identical to the engine at 9%. */
  const scenarioAnnualRows = useMemo(
    () => scaleAnnualRowsToRate(cashflowData?.annual_cashflow ?? [], appliedRate),
    [cashflowData, appliedRate],
  );

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
  const sipDisplay = Number.isFinite(monthlyContrib)
    ? monthlyContrib.toLocaleString("en-IN")
    : "";

  const stepSip = useCallback((delta: number) => {
    setMonthlyContrib((current) => {
      const base = Number.isFinite(current) ? current : 0;
      return Math.max(0, Math.round((base + delta) / SIP_STEP) * SIP_STEP);
    });
  }, []);

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
          // Having ≥1 goal is what marks the "What are you trying to achieve?"
          // profile section confirmed, so a saved goal = section completed.
          trackDetailedOnboardingSectionCompleted("goal_planning");
          const wasFirstGoal = !hasPersistedGoals;
          setGoals((prev) => [...prev, mapGoalFromApi(res, currentYear)]);
          if (fromProfile && wasFirstGoal) {
            // Mid-profile-setup, first goal saved: the section is now complete,
            // so take the user straight back to finish the remaining cards.
            closeGoalSheet();
            toast.success("Goal added — taking you back to profile setup");
            returnToProfile();
            return;
          }
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
    [currentYear, closeGoalSheet, fetchCashflow, fromProfile, hasPersistedGoals, returnToProfile],
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

  /**
   * Set a goal's priority from the Strategy panel.
   *
   * Optimistic: priority is a ranking, not money, so nothing about the cashflow
   * moves and there is no plan to recompute — only the filter chips read it. A
   * failed save rolls the row back rather than leaving the UI ahead of the API.
   */
  const handleSetGoalPriority = useCallback(
    async (id: string, priority: Priority) => {
      const goal = goals.find((g) => g.id === id);
      if (!goal || goal.priority === priority) return;
      const previous = goal.priority;
      setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, priority } : g)));
      // Re-ranking into a priority the filter is hiding would make the goal
      // vanish from the timeline mid-edit — switch that chip on instead.
      setEnabledPriorities((prev) =>
        prev.has(priority) ? prev : new Set(prev).add(priority),
      );
      if (!isPersistedGoalId(id)) return;
      setPrioritySavingId(id);
      try {
        await updateGoal(id, { priority: priority.toUpperCase() });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not update priority';
        toast.error(msg);
        setGoals((prev) =>
          prev.map((g) => (g.id === id ? { ...g, priority: previous } : g)),
        );
      } finally {
        setPrioritySavingId(null);
      }
    },
    [goals],
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
  // The timeline always runs to max(retirement year (profile age, default 60,
  // extended by a Retirement goal), last goal year, engine projection end) — so
  // the full cashflow is always visible, even before a plan loads or when the
  // stored run is stale/short. Dragging a goal down can temporarily reveal rows
  // up to the lifespan cap (age 100). All goals count toward the last-goal year
  // (not just visible ones) so toggling a priority filter never shrinks it.
  const effectiveBirthYear = birthYear ?? currentYear - FALLBACK_CURRENT_AGE;
  // The Retirement GOAL's target year IS the planned retirement year (SSOT):
  // the backend mirrors it onto the profile retirement_age on every goal
  // create/move (and moves the goal when the age is edited), so when a
  // retirement goal exists its year wins; otherwise the profile age (default
  // 60) applies. The engine derives its horizon from the same rule.
  const retirementGoalYear = useMemo(() => {
    const years = goals
      .filter((g) => /retire/i.test(g.name))
      .map((g) => g.year)
      .sort((a, b) => a - b);
    return years.length > 0 ? years[0] : null;
  }, [goals]);
  const retirementYear = retirementGoalYear ?? effectiveBirthYear + retirementAge;
  // Engine's actual projection end (FY) — authoritative when a plan is loaded.
  // Derived from BOTH the headline and the furthest annual row: stored runs
  // from engine <0.3.1 carry a goal-derived headline that collapses to the
  // current FY when there are no goals, while their annual rows still span the
  // full projection — trust whichever reaches further so the timeline never
  // truncates a full-length cashflow.
  const engineEndYear = useMemo<number | null>(() => {
    const headlineYear = cashflowData?.headline?.last_fy_end_date
      ? new Date(cashflowData.headline.last_fy_end_date).getFullYear()
      : null;
    let lastRowYear: number | null = null;
    for (const row of cashflowData?.annual_cashflow ?? []) {
      const y = timelineYearFromAnnualRow(row);
      if (y != null && (lastRowYear == null || y > lastRowYear)) lastRowYear = y;
    }
    if (headlineYear == null && lastRowYear == null) return null;
    return Math.max(headlineYear ?? 0, lastRowYear ?? 0);
  }, [cashflowData]);
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
      // The engine's horizon AND the profile-derived retirement year both count:
      // the timeline always reaches max(retirement age (default 60), last goal)
      // even if the loaded plan run is stale or shorter.
      engineEndYear ?? 0,
      retirementYear,
      currentYear + MIN_HORIZON_YEARS,
    ),
    currentYear + MIN_HORIZON_YEARS,
    capYear,
  );
  const displayEndYear = Math.min(
    capYear,
    Math.max(baseEndYear, revealEndYear ?? baseEndYear),
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
    if (!scenarioAnnualRows.length) return null;
    const rows = [...scenarioAnnualRows].sort(
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
  }, [scenarioAnnualRows]);

  const years = useMemo(() => {
    // Engine rows are keyed by FY END (FY26-27 closes 31 Mar 2027 → 2027), so
    // the current calendar year has no corpus row of its own and would draw as
    // an empty top line — an axis tick with no bar. Start the timeline at the
    // first year the engine actually closes a FY; an earlier year is kept only
    // if the user put a goal there.
    const firstEngineYear = tornadoCorpusByYear
      ? Math.min(...tornadoCorpusByYear.keys())
      : currentYear;
    const startYear = clamp(firstEngineYear, currentYear, displayEndYear);
    const out: number[] = [];
    for (let y = currentYear; y <= displayEndYear; y += 1) {
      if (y < startYear) {
        if (goalsByYear.has(y)) out.push(y);
        continue;
      }
      // Past the dense near term, thin against the label the user actually
      // reads — their age when we know the birth year, else the calendar year —
      // so the axis steps on round fives (25, 30, 35 ...) rather than on an
      // offset from the first row.
      const label = birthYear != null ? y - birthYear : y;
      const keep =
        y - startYear < DENSE_ROW_YEARS ||
        label % YEAR_ROW_STEP === 0 ||
        y === displayEndYear ||
        goalsByYear.has(y);
      if (keep) out.push(y);
    }
    return out;
  }, [currentYear, displayEndYear, goalsByYear, birthYear, tornadoCorpusByYear]);

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

  /** Any year underwater? Only then does the axis need a left half. */
  const tornadoHasNegative = useMemo(
    () =>
      tornadoCorpusByYear
        ? [...tornadoCorpusByYear.values()].some((r) => r.corpusClosing < 0)
        : false,
    [tornadoCorpusByYear],
  );

  const tornadoCenterX = tornadoHasNegative
    ? TORNADO_CENTER_X
    : TORNADO_CENTER_X_POSITIVE;

  const corpusToTornadoXCb = useCallback(
    (corpus: number) => corpusToTornadoX(corpus, tornadoBarScale, tornadoCenterX),
    [tornadoBarScale, tornadoCenterX],
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

  /**
   * The SIP control, handed to the strategy card as its own tab.
   *
   * It is built here rather than inside StrategyContent because it reads a
   * dozen pieces of this page's state — the typed amount, the plan's own SIP,
   * the in-flight apply, the cashflow headroom. Passing the node keeps that
   * state where it lives instead of threading it all through props.
   */
  const sipPanel = (
    <div data-tour="monthly-sip">
          <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-border bg-background p-1 focus-within:ring-1 focus-within:ring-[#D4A868]">
            <button
              type="button"
              onClick={() => stepSip(-SIP_STEP)}
              disabled={monthlyContrib <= 0}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
              aria-label={`Lower by ${formatINRCompact(SIP_STEP)}`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="flex min-w-0 flex-1 items-baseline justify-center gap-0.5">
              {/* Sized to its own digits so the amount and "/mo" centre together
                  — a full-width input would shove the unit to the far edge. */}
              <input
                type="text"
                inputMode="numeric"
                value={sipDisplay}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d]/g, "");
                  const v = digits === "" ? 0 : Number(digits);
                  if (Number.isFinite(v)) setMonthlyContrib(Math.max(0, v));
                }}
                style={{ width: `${Math.max(2, sipDisplay.length)}ch` }}
                className="min-w-0 shrink bg-transparent text-right text-[15.3px] font-semibold tabular-nums text-foreground outline-none"
                placeholder="0"
                aria-label="Monthly investment amount"
              />
              <span className="shrink-0 text-[13px] text-muted-foreground">/mo</span>
            </div>
            <button
              type="button"
              onClick={() => stepSip(SIP_STEP)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={`Raise by ${formatINRCompact(SIP_STEP)}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {/* Apply the typed SIP to the actual plan — saves the input and re-runs
              the engine so the whole cashflow reflects it. Shown only when the
              amount differs from the plan's current SIP. */}
          {planSip != null && monthlyContrib !== planSip && (
            <button
              type="button"
              onClick={() => void applySipToPlan()}
              disabled={applyingSip}
              className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 h-7 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-muted/50 h-7 w-7 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ border: "1px solid hsl(var(--border))" }}
            aria-label="Reset monthly investment to your plan's SIP"
            title="Reset to plan SIP"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          </div>
          {/* Helper line — yearly equivalent plus the cashflow headroom hint
              (absorbs the old marquee banner). */}
          <div className="mt-1 flex items-center gap-1.5 px-0.5">
            <p className="min-w-0 truncate text-[11px] text-[#D4A868]">
              <span className="font-semibold">{formatINRCompact(monthlyContrib * 12)}/yr</span>
              {!sipCapped &&
                displayAffordableMonthly != null &&
                displayAffordableMonthly > 0 && (
                  <>
                    {" "}· you can invest up to{" "}
                    <span className="font-semibold">
                      {formatINRCompact(displayAffordableMonthly)}/mo
                    </span>{" "}
                    from your cashflow
                  </>
                )}
            </p>
          </div>
          {sipCapped && affordableMonthly != null && (
            <p className="mt-1 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
              You can invest about {formatINRCompact(affordableMonthly)}/mo from your income
              (after tax, expenses &amp; EMIs). A higher SIP is capped to that — it won't grow
              your corpus further, since the plan never invests more than you can save.
            </p>
          )}
    </div>
  );

  return (
    <div className="mobile-container min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 bg-background">
        <div className="flex items-center gap-2 px-5 pt-10 pb-2">
          {fromProfile && (
            <button
              type="button"
              onClick={returnToProfile}
              className="-ml-1.5 shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-foreground hover:bg-muted/60"
              aria-label="Back to profile setup"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="min-w-0 truncate text-lg font-semibold text-foreground">
            Goal planning
          </h1>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {(goalsLoading || cashflowLoading) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            {!cashflowData && !cashflowLoading && (
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
                className="shrink-0 inline-flex h-8 items-center gap-1 rounded-full border border-[#D4A868]/50 bg-card px-3 text-[12px] font-semibold text-[#D4A868] hover:bg-muted/40"
              >
                Run cashflow
              </button>
            )}
            {/* Download the plan (Excel) — sits just left of the plan-panel trigger. */}
            <button
              type="button"
              disabled={!cashflowData}
              onClick={() =>
                cashflowData &&
                exportCashflowXls(
                  cashflowData.annual_cashflow,
                  cashflowData.monthly_cashflow ?? [],
                )
              }
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Download plan"
              title="Download plan"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            {/* Open the right-side panel holding the cashflow inputs + projection. */}
            {/* Replays the first-run walkthrough — it's shown once, and this is
                the only way back to it. */}
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Show the goal planning guide"
              title="How this page works"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-tour="plan-button"
              onClick={() => {
                setPanelTab("inputs");
                setPanelOpen(true);
              }}
              className="shrink-0 inline-flex h-8 items-center gap-1 rounded-full border border-[#D4A868]/50 bg-card px-3 text-[12px] font-semibold text-[#D4A868] hover:bg-[#D4A868]/10"
              aria-label="Open projection and inputs"
            >
              <PanelRightOpen className="h-3.5 w-3.5" />
              Plan
            </button>
          </div>
        </div>
      </header>

      <motion.main
        className="px-5 pt-2 space-y-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {cashflowError && !cashflowLoading && (
          <p className="px-1 text-[11px] text-amber-600">{cashflowError}</p>
        )}
        {goalsLoading && (
          <p className="px-1 text-[11px] text-muted-foreground">Loading goals from your plan…</p>
        )}
        {/* Mid-profile-setup with no goal yet: spell out exactly what completes
            the "What are you trying to achieve?" section and what happens next. */}
        {!goalsLoading && fromProfile && !hasPersistedGoals && (
          <div className="flex items-start gap-2 rounded-xl border border-[#D4A868]/50 bg-[#D4A868]/10 px-3 py-2.5">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#D4A868]" />
            <p className="text-[12px] leading-snug text-foreground">
              Add your first goal with the <span className="font-semibold">+</span> button to
              complete this section — we'll take you back to profile setup once it's saved.
            </p>
          </div>
        )}
        {/* Goal priority, the mix and the return — three tabs side by side, all
            on the page. Each changes what the projection says, so they sit where
            the timeline can be watched reacting to them. */}
        <div
          ref={strategyRef}
          className="mx-1 rounded-xl border border-border bg-card px-3 py-3"
          data-tour="priority-filter"
        >
          <StrategyContent
            goals={goals}
            onSetPriority={handleSetGoalPriority}
            savingPriorityId={prioritySavingId}
            enabledPriorities={enabledPriorities}
            onToggleFilter={togglePriority}
            appliedRate={appliedRate}
            appliedEquityPct={appliedEquityPct}
            equityReturn={equityReturn}
            onSave={saveStrategy}
            sipPanel={sipPanel}
            sipApplied={planSip}
            tab={strategyTab}
            onTabChange={setStrategyTab}
            collapsed={strategyCollapsed}
            onToggleCollapsed={toggleStrategyCollapsed}
          />
        </div>


        {isTornado && !tornadoCorpusByYear && !cashflowLoading && (
          <p className="px-1 text-[11px] text-amber-600">
            Run cashflow to load corpus closing bars from your plan.
          </p>
        )}

        {/* Column header + chart axis legend. The left slot mirrors the row's
            age column (px-2 + w-[48px] + gap-3) so "Age" sits directly above the
            ages and the Negative swatch starts clear of that column. */}
        <div
          data-tour="chart-legend"
          className="flex items-center gap-3 px-2 pt-2 pb-1 text-[11px] text-muted-foreground"
        >
          <span className="w-[48px] shrink-0 font-semibold tracking-wide text-foreground/80">
            {birthYear != null ? "Age" : "Year"}
          </span>
          {isTornado && (
            <div className="flex min-w-0 flex-1 items-center justify-between">
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
        </div>

        {/* Integrated vertical NAV chart + goal timeline */}
        <ul className="space-y-0">
          <AnimatePresence initial={false}>
          {years.map((y, i) => {
            const yearGoals = goalsByYear.get(y) ?? [];
            const hasGoals = yearGoals.length > 0;
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
            const tornadoX1 = Math.min(tornadoCenterX, tipX);
            const tornadoX2 = Math.max(tornadoCenterX, tipX);
            const tornadoBaseHue = tornadoIsPositive ? "16, 185, 129" : "239, 68, 68";
            const tornadoDeepHue = tornadoIsPositive ? "5, 95, 70" : "136, 19, 55";
            // Positive bars stay solid — a near-transparent green reads as washed out
    // against the page rather than as a small number. Negatives keep the wider
    // fade, where the lighter end is doing the work.
    const tornadoFillOpacity = tornadoIsPositive
      ? 0.85 + tornadoNorm * 0.15
      : 0.35 + tornadoNorm * 0.65;

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
                  // Tapping/clicking a year reveals its projected-corpus readout
                  // (year + value). It must NOT open the add-goal sheet — new goals
                  // are added only from the dedicated "Add goal" button.
                  onClick={() => setHoveredYear(y)}
                  // Pointer events cover mouse hover AND touch press, so the
                  // year/value readout works on mobile (mouseenter never fires
                  // reliably on touch).
                  onPointerEnter={() => setHoveredYear(y)}
                  onPointerLeave={() =>
                    setHoveredYear((h) => (h === y ? null : h))
                  }
                  onFocus={() => setHoveredYear(y)}
                  onBlur={() =>
                    setHoveredYear((h) => (h === y ? null : h))
                  }
                  className="group relative w-full text-left flex items-stretch gap-3 px-2 transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/40 rounded-lg"
                  style={{ minHeight: hasGoals ? (isTornado ? 36 : 48) : isTornado ? 12 : 18 }}
                  aria-label={`Show ${y} projected corpus`}
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
                              stopOpacity={tornadoIsPositive ? 0.8 : 1}
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
                          x1={tornadoCenterX}
                          y1={isFirst ? 50 : 0}
                          x2={tornadoCenterX}
                          y2={isLast ? 50 : 100}
                          stroke="hsl(var(--foreground))"
                          strokeOpacity={0.35}
                          strokeWidth={1}
                          vectorEffect="non-scaling-stroke"
                        />

                        {hasTornadoBar && tornadoX2 > tornadoX1 && (
                          <rect
                            x={tornadoX1}
                            y={isHovered ? 0 : 17.5}
                            width={Math.max(0, tornadoX2 - tornadoX1)}
                            /* 84 was the hovered height; another 20% of it is
                               100.8, and the row's own box is 100 — so a hover
                               now fills the row edge to edge. */
                            height={isHovered ? 100 : 65}
                            fill={`url(#tornadoBar-${y})`}
                            fillOpacity={tornadoFillOpacity}
                            style={{ transition: "y 120ms ease-out, height 120ms ease-out" }}
                          />
                        )}

                        {/* Years with no bar still need a mark on the axis; a year
                            that has one is read by its tip, so nothing sits there. */}
                        {!hasTornadoBar && (
                          <circle
                            cx={tornadoCenterX}
                            cy={50}
                            r={isHovered ? 4 : hasGoals ? 3 : 2}
                            fill={nodeColor}
                          />
                        )}
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
                      className={`text-[12px] tabular-nums transition-colors ${
                        isHovered ? "font-bold text-foreground" : "text-muted-foreground/50"
                      }`}
                    >
                      {ageAtYear != null && ageAtYear >= 0 ? ageAtYear : y}
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

      {/* Right-side plan panel — the projection waterfall and the cashflow
          inputs live here, opened from the header's "Plan" trigger. */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/50"
              onClick={() => setPanelOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              role="dialog"
              aria-modal="true"
              aria-label="Your plan"
              className="fixed inset-y-0 right-0 z-[60] flex w-[min(420px,92vw)] flex-col border-l border-border bg-background shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-border px-4 pb-3 pt-4">
                <h2 className="text-base font-semibold text-foreground">Your plan</h2>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="ml-auto p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Close panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-4 pt-3">
                {/* Gold active state (not card-on-muted) so the selected tab is
                    unmistakable in both light and dark themes. */}
                <div className="flex gap-1 rounded-full border border-border bg-muted/40 p-1">
                  {(
                    [
                      { id: "inputs", label: "Inputs", icon: Settings2 },
                      { id: "projection", label: "Projection", icon: TrendingUp },
                    ] as const
                  ).map((tab) => {
                    const active = panelTab === tab.id;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPanelTab(tab.id)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[12px] font-bold transition-colors ${
                          active ? "text-white" : "text-muted-foreground hover:text-foreground"
                        }`}
                        style={
                          active
                            ? {
                                backgroundColor: "#D4A868",
                                boxShadow: "0 2px 8px rgba(212,168,104,0.45)",
                              }
                            : undefined
                        }
                        aria-pressed={active}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {panelTab === "projection" ? (
                  <ProjectionContent
                    fundFlow={cashflowData?.fund_flow_summary ?? null}
                    headline={cashflowData?.headline ?? null}
                    sipMonthly={planSip}
                    onGoToInputs={() => setPanelTab("inputs")}
                    appliedRate={appliedRate}
                    appliedEquityPct={appliedEquityPct}
                    onGoToStrategy={() => openStrategy("allocation")}
                  />
                ) : (
                  <div data-tour="plan-inputs">
                  <CashflowInputsForm
                    retirementGoalYear={retirementGoalYear}
                    onSaved={(ready) => {
                      void fetchCashflow();
                      void fetchSip();
                      // Saving a retirement age moves the Retirement goal
                      // (SSOT) — refresh the timeline's goals too.
                      void reloadGoals();
                      setGateRefresh((n) => n + 1);
                      if (fromProfile) {
                        // Saving inputs never redirects — the user stays on the
                        // goal planner and returns to profile setup via the back
                        // bar (or automatically after their first goal is saved).
                        setPanelOpen(false);
                        if (!hasPersistedGoals) {
                          toast.info("Inputs saved — now add your first goal with the + button");
                        }
                        return;
                      }
                      if (ready) setPanelOpen(false);
                    }}
                  />
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating + FAB — pinned to the right edge of the page column */}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 mx-auto max-w-md"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)" }}
      >
        <div className="flex justify-end px-5">
          <button
            type="button"
            data-tour="add-goal"
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
          present it loads the real projection. Every "open the inputs" request
          (prompt CTA, ?inputs=1 auto-open) lands on the side panel's Inputs tab.
          Remounts via gateRefresh after a save so its readiness stays fresh. */}
      {/* First-run walkthrough — spotlights the timeline, +, Plan and the
          asset-mix slider, opening the panel where a step needs it. */}
      <GuidedTour steps={tourSteps} open={tourOpen} onClose={closeTour} />

      <CashflowGate
        key={gateRefresh}
        onReady={fetchCashflow}
        autoOpenInputs={autoOpenInputs && gateRefresh === 0}
        onOpenInputs={() => {
          setPanelTab("inputs");
          setPanelOpen(true);
        }}
      />
    </div>
  );
};

export default GoalsTimeline;
