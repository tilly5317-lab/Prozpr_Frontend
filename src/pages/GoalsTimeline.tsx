import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BriefcaseBusiness,
  Car,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Plane,
  Plus,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import BottomNav from "@/components/BottomNav";

type Priority = "Low" | "Medium" | "High";

interface TimelineGoal {
  id: string;
  name: string;
  year: number;
  presentValue: number;
  inflationRate: number;
  priority: Priority;
}

const HORIZON_YEARS = 24;
const INFLATION_DEFAULT = 6;
const PRIORITIES: Priority[] = ["Low", "Medium", "High"];

// Portfolio projection assumptions — sourced from the planner's headline figures.
const START_NAV = 2_85_50_000;
const MONTHLY_CONTRIBUTION = 2_27_500;
const ANNUAL_RETURN_PCT = 9;

// NAV chart spans the full row width and renders behind the row content.
const NAV_PAD_PCT = 4; // horizontal padding (%) so the line never touches the edges
const MONTHLY_MAX = 500000; // upper bound of the monthly investment slider

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

const SEED_GOALS: TimelineGoal[] = [
  {
    id: "seed-home",
    name: "Home down payment",
    year: 2030,
    presentValue: 1_50_00_000,
    inflationRate: 6,
    priority: "High",
  },
  {
    id: "seed-education",
    name: "Aarav's education fund",
    year: 2034,
    presentValue: 90_00_000,
    inflationRate: 10,
    priority: "Medium",
  },
  {
    id: "seed-retirement",
    name: "Early retirement",
    year: 2045,
    presentValue: 8_00_00_000,
    inflationRate: 6,
    priority: "Medium",
  },
];

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

/**
 * Earliest fractional year (eg. 2031.5) at which a single goal becomes affordable
 * assuming today's NAV grows alone (no other withdrawals), with the given monthly
 * contribution. Returns null if not achievable within the horizon.
 */
function earliestAffordableYear(
  goal: TimelineGoal,
  startYear: number,
  yearsAhead: number,
  monthlyContribution: number,
): number | null {
  const r = ANNUAL_RETURN_PCT / 100;
  const annualContribution = monthlyContribution * 12;
  const contribGrowth = annualContribution * (1 + r / 2);

  let nav = START_NAV;
  let prevNav = nav;
  for (let i = 0; i <= yearsAhead; i++) {
    const year = startYear + i;
    const fv = futureValue(
      goal.presentValue,
      goal.inflationRate,
      Math.max(0, year - startYear),
    );
    if (nav >= fv) {
      if (i === 0) return year;
      // Linearly interpolate within the year for finer "months earlier" resolution.
      const prevFv = futureValue(
        goal.presentValue,
        goal.inflationRate,
        Math.max(0, year - 1 - startYear),
      );
      const navGain = nav - prevNav;
      const target = fv - prevNav;
      const frac = navGain > 0 ? Math.min(1, Math.max(0, target / navGain)) : 1;
      // Use prevFv to avoid lint warning (it's part of a fuller model we could expand).
      void prevFv;
      return year - 1 + frac;
    }
    prevNav = nav;
    nav = nav * (1 + r) + contribGrowth;
  }
  return null;
}

function buildProjection(
  goals: TimelineGoal[],
  startYear: number,
  yearsAhead: number,
  monthlyContribution: number,
): ProjectionPoint[] {
  const r = ANNUAL_RETURN_PCT / 100;
  const annualContribution = monthlyContribution * 12;
  const contributionGrowth = annualContribution * (1 + r / 2);

  const withdrawalByYear = new Map<number, number>();
  for (const g of goals) {
    const yearsAway = Math.max(0, g.year - startYear);
    const fv = futureValue(g.presentValue, g.inflationRate, yearsAway);
    withdrawalByYear.set(g.year, (withdrawalByYear.get(g.year) ?? 0) + fv);
  }

  const out: ProjectionPoint[] = [];
  let nav = START_NAV;
  for (let i = 0; i <= yearsAhead; i++) {
    const year = startYear + i;
    if (i === 0) {
      out.push({ year, endNav: nav, withdrawal: 0 });
      continue;
    }
    nav = nav * (1 + r) + contributionGrowth;
    const withdrawal = withdrawalByYear.get(year) ?? 0;
    nav -= withdrawal;
    // Allow negative NAV so the chart can show shortfall years in red.
    out.push({ year, endNav: nav, withdrawal });
  }
  return out;
}

interface AddGoalSheetProps {
  open: boolean;
  initialYear: number | null;
  onClose: () => void;
  onSave: (goal: Omit<TimelineGoal, "id">) => void;
}

const GOAL_CATEGORIES: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "house", label: "Buy property", icon: Home },
  { id: "education", label: "Education", icon: GraduationCap },
  { id: "marriage", label: "Marriage", icon: Heart },
  { id: "retirement", label: "Retirement", icon: Trophy },
  { id: "travel", label: "Travel", icon: Plane },
  { id: "car", label: "Car", icon: Car },
  { id: "custom", label: "Other", icon: Plus },
];

function AddGoalSheet({ open, initialYear, onClose, onSave }: AddGoalSheetProps) {
  const currentYear = new Date().getFullYear();
  const [category, setCategory] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [amount, setAmount] = useState("");
  const [upfront, setUpfront] = useState("");
  const [mortgage, setMortgage] = useState("");
  const [year, setYear] = useState<number>(initialYear ?? currentYear + 5);
  const [inflation, setInflation] = useState<string>(String(INFLATION_DEFAULT));
  const [priority, setPriority] = useState<Priority>("Medium");
  const [amountKind, setAmountKind] = useState<"present" | "future">("present");

  useEffect(() => {
    if (open) {
      setCategory("");
      setCustomName("");
      setAmount("");
      setUpfront("");
      setMortgage("");
      setYear(initialYear ?? currentYear + 5);
      setInflation(String(INFLATION_DEFAULT));
      setPriority("Medium");
      setAmountKind("present");
    }
  }, [open, initialYear, currentYear]);

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

  const yearsAway = Math.max(0, year - currentYear);
  const houseUpfront = Number(upfront.replace(/[^\d.]/g, "")) || 0;
  const houseMortgage = Number(mortgage.replace(/[^\d.]/g, "")) || 0;
  const houseTotal = houseUpfront + houseMortgage;
  const baseAmount = Number(amount.replace(/[^\d.]/g, "")) || 0;
  const pv = isHouse ? houseUpfront : baseAmount;
  const infl = amountKind === "present" ? Number(inflation) || 0 : 0;
  const fv =
    amountKind === "future" ? pv : futureValue(pv, infl, yearsAway);

  const canSave =
    resolvedName.length > 0 &&
    pv > 0 &&
    year >= currentYear &&
    year <= currentYear + HORIZON_YEARS;

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
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    New goal
                  </p>
                  <h2 className="text-base font-semibold text-foreground truncate">
                    Plan for {year}
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
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
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
                          onClick={() => setCategory(c.id)}
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

                {isHouse && (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      House details
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="timeline-goal-upfront"
                          className="text-[10px] uppercase tracking-wide text-muted-foreground"
                        >
                          Deposit (₹)
                        </label>
                        <input
                          id="timeline-goal-upfront"
                          value={upfront}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^\d]/g, "");
                            setUpfront(digits ? Number(digits).toLocaleString("en-IN") : "");
                          }}
                          inputMode="numeric"
                          placeholder="30,00,000"
                          className="mt-1 w-full rounded-lg bg-card px-3 py-2 text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                          style={{ border: "1px solid hsl(var(--border))" }}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="timeline-goal-mortgage"
                          className="text-[10px] uppercase tracking-wide text-muted-foreground"
                        >
                          Mortgage (₹)
                        </label>
                        <input
                          id="timeline-goal-mortgage"
                          value={mortgage}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^\d]/g, "");
                            setMortgage(digits ? Number(digits).toLocaleString("en-IN") : "");
                          }}
                          inputMode="numeric"
                          placeholder="1,20,00,000"
                          className="mt-1 w-full rounded-lg bg-card px-3 py-2 text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/30"
                          style={{ border: "1px solid hsl(var(--border))" }}
                        />
                      </div>
                    </div>
                    {houseTotal > 0 && (
                      <p className="text-[10.5px] text-muted-foreground">
                        Total property cost ≈{" "}
                        <span className="font-semibold text-foreground tabular-nums">
                          {formatINR(houseTotal)}
                        </span>{" "}
                        — we'll save toward the deposit and plan the rest as mortgage.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {!isHouse && (
                    <div>
                      <label
                        htmlFor="timeline-goal-amount"
                        className="text-[10px] uppercase tracking-wide text-muted-foreground"
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
                  <div className={isHouse ? "col-span-2" : undefined}>
                    <label
                      htmlFor="timeline-goal-year"
                      className="text-[10px] uppercase tracking-wide text-muted-foreground"
                    >
                      Target year
                    </label>
                    <input
                      id="timeline-goal-year"
                      type="number"
                      inputMode="numeric"
                      min={currentYear}
                      max={currentYear + HORIZON_YEARS}
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
                <p className="-mt-2 text-[10.5px] text-muted-foreground">
                  {yearsAway === 0
                    ? "Within this year"
                    : `${yearsAway} year${yearsAway === 1 ? "" : "s"} away`}
                </p>

                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
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
                          <p className="mt-0.5 text-[10px] leading-tight">
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
                      className="text-[10px] uppercase tracking-wide text-muted-foreground"
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
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-medium"
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
                    <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground/80">
                      Override this if you have a better number — it&apos;s based
                      on Prozpr&apos;s research for this goal category.
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
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
                        Cost at {year}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                        {amountKind === "future"
                          ? "Entered as the future-dated amount"
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
                  disabled={!canSave}
                  onClick={() => {
                    onSave({
                      name: resolvedName,
                      year,
                      // When the user entered the future-dated amount, store it
                      // as a present value with 0% inflation so projections leave
                      // it alone (FV at year N = PV * 1 = entered amount).
                      presentValue: pv,
                      inflationRate: amountKind === "future" ? 0 : infl,
                      priority,
                    });
                  }}
                  className={`flex-1 rounded-full py-2 text-[12px] font-bold transition-opacity ${
                    canSave
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                  }`}
                >
                  Add to timeline
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Static goals-projection summary surfaced as a popup from the tornado view.
// Numbers mirror what the GoalPlanner cards used to render, so the page-level
// flow stays consistent without dragging the whole sandbox slider over.
interface ProjectionSheetProps {
  open: boolean;
  onClose: () => void;
}

function ProjectionSheet({ open, onClose }: ProjectionSheetProps) {
  const horizonLabel = "Mar 2051";
  const monthlyLabel = "₹2.27L/mo";
  const BEGIN = 1_50_00_000;
  const INVESTMENTS = 10_74_74_878;
  const ROI = 24_44_98_818;
  const ONE_OFF_IN = 1_20_00_000;
  const ONE_OFF_OUT = -1_00_00_000;
  const GOALS_OUT = -57_78_00_000;
  const CLOSING = BEGIN + INVESTMENTS + ROI + ONE_OFF_IN + ONE_OFF_OUT + GOALS_OUT;
  const rows: { label: string; value: number; kind: "neutral" | "positive" | "negative" }[] = [
    { label: "Beginning financial assets", value: BEGIN, kind: "neutral" },
    { label: "+ Investments", value: INVESTMENTS, kind: "positive" },
    { label: "+ Return on investments", value: ROI, kind: "positive" },
    { label: "+ One-off income", value: ONE_OFF_IN, kind: "positive" },
    { label: "− One-off expense", value: ONE_OFF_OUT, kind: "negative" },
    { label: "− Goals", value: GOALS_OUT, kind: "negative" },
  ];
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
              className="w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl"
              style={{ maxHeight: "min(88dvh, 720px)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Goals projection
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Through {horizonLabel} · {monthlyLabel} · 9% post-tax assumption
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

              <ul className="divide-y divide-border/60 overflow-y-auto">
                {rows.map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <span className="text-xs text-foreground/85">{row.label}</span>
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
                ))}
                <li
                  className="flex items-center justify-between px-4 py-3"
                  style={{ backgroundColor: "hsl(var(--muted) / 0.4)" }}
                >
                  <span className="text-xs font-semibold text-foreground">
                    Closing financial assets · {horizonLabel}
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      CLOSING >= 0
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-destructive"
                    }`}
                  >
                    {CLOSING < 0 ? "−" : ""}
                    {formatINR(Math.abs(CLOSING))}
                  </span>
                </li>
              </ul>

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
  const years = useMemo(
    () => Array.from({ length: HORIZON_YEARS + 1 }, (_, i) => currentYear + i),
    [currentYear],
  );

  const [goals, setGoals] = useState<TimelineGoal[]>(SEED_GOALS);
  const [addYear, setAddYear] = useState<number | null>(null);
  const [enabledPriorities, setEnabledPriorities] = useState<Set<Priority>>(
    new Set<Priority>(["Low", "Medium", "High"]),
  );
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);
  const [monthlyContrib, setMonthlyContrib] = useState<number>(MONTHLY_CONTRIBUTION);
  const [expandedGoals, setExpandedGoals] = useState<Set<string>>(new Set());
  const [draggingGoalId, setDraggingGoalId] = useState<string | null>(null);
  const [dropTargetYear, setDropTargetYear] = useState<number | null>(null);
  const [projectionOpen, setProjectionOpen] = useState(false);

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
  const moveGoalToYear = (id: string, year: number) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, year } : g)),
    );
  };

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

  const projection = useMemo(
    () => buildProjection(visibleGoals, currentYear, HORIZON_YEARS, monthlyContrib),
    [visibleGoals, currentYear, monthlyContrib],
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
        map.set(p.year, crossed);
        for (const m of crossed) unlocked.add(m.value);
      }
    }
    return map;
  }, [projection]);

  // Anchor the chart's x-axis to the projection at the slider's maximum so the bars
  // grow rightward when the user increases monthly investment (instead of shrinking
  // left because the dynamic peak grows faster than the early-year values).
  const peakAnchor = useMemo(() => {
    const maxProj = buildProjection(
      visibleGoals,
      currentYear,
      HORIZON_YEARS,
      MONTHLY_MAX,
    );
    return maxProj.reduce((m, p) => (p.endNav > m ? p.endNav : m), 0);
  }, [visibleGoals, currentYear]);

  // Map a NAV value to a 0–100 viewBox x coordinate. We use a square-root scale
  // so compounding growth at low contributions is visible (linear scaling
  // collapses early-year values into a thin sliver against the max anchor).
  const navToX = (nav: number): number => {
    if (peakAnchor <= 0) return NAV_PAD_PCT;
    const ratio = Math.max(0, Math.min(1, nav / peakAnchor));
    const t = Math.sqrt(ratio);
    return NAV_PAD_PCT + t * (100 - 2 * NAV_PAD_PCT);
  };

  // For the tornado variant: the centre axis is ZERO (not today's NAV). A
  // bar to the right (green) = positive total NAV at year end. A bar to the
  // left (red) = negative total NAV (goals have depleted the portfolio).
  // peakNav anchors width to the largest absolute NAV across the projection
  // at the slider's maximum so bars grow as contributions rise.
  const peakNav = useMemo(() => {
    if (!isTornado) return 0;
    const maxProj = buildProjection(visibleGoals, currentYear, HORIZON_YEARS, MONTHLY_MAX);
    return maxProj.reduce((m, p) => Math.max(m, Math.abs(p.endNav)), 0);
  }, [isTornado, visibleGoals, currentYear]);

  const handleSave = (incoming: Omit<TimelineGoal, "id">) => {
    setGoals((prev) => [
      ...prev,
      { ...incoming, id: `g-${Date.now().toString(36)}` },
    ]);
    setAddYear(null);
  };

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
        </div>
      </header>

      <motion.main
        className="px-5 pt-2 space-y-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        {/* Priority filter — toggle which goals feed the projection */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
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
                  {p}
                  <span className="opacity-70">· {count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Monthly investment — sticky so the slider stays in reach while scrolling */}
        <div
          className="sticky z-30 -mx-5 bg-background px-5 pb-1 pt-1"
          style={{ top: "60px" }}
        >
          <div className="rounded-xl border border-border bg-card px-3 py-1.5 flex items-center gap-3">
          <div className="shrink-0 leading-tight">
            <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
              Invest /mo
            </p>
            <p
              className="text-[12px] font-semibold tabular-nums text-foreground"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {formatINRCompact(monthlyContrib)}
              <span className="ml-1 text-[9.5px] font-medium text-muted-foreground">
                · {formatINRCompact(monthlyContrib * 12)}/yr
              </span>
            </p>
          </div>
          <input
            type="range"
            min={0}
            max={MONTHLY_MAX}
            step={5000}
            value={monthlyContrib}
            onChange={(e) => setMonthlyContrib(Number(e.target.value))}
            className="flex-1 min-w-0"
            style={{ accentColor: "#D4A868", transform: "scaleY(0.9)" }}
            aria-label="Monthly investment amount"
          />
          <button
            type="button"
            onClick={() => setMonthlyContrib(MONTHLY_CONTRIBUTION)}
            disabled={monthlyContrib === MONTHLY_CONTRIBUTION}
            className="shrink-0 inline-flex items-center justify-center rounded-full bg-muted/50 h-6 w-6 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            style={{ border: "1px solid hsl(var(--border))" }}
            aria-label="Reset monthly investment to default"
            title="Reset to default"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          </div>
        </div>

        {/* Chart axis legend — explains what the bars mean */}
        {isTornado && (
          <div className="flex items-center justify-between px-1 pt-2 pb-1 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: "rgb(239,68,68)" }} />
              <span>Negative NAV</span>
            </div>
            <span className="font-semibold tracking-wide text-foreground/80">Portfolio Value</span>
            <div className="flex items-center gap-1.5">
              <span>Positive NAV</span>
              <span className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: "rgb(16,185,129)" }} />
            </div>
          </div>
        )}

        {/* Integrated vertical NAV chart + goal timeline */}
        <ul className="space-y-0">
          {years.map((y, i) => {
            const yearGoals = goalsByYear.get(y) ?? [];
            const hasGoals = yearGoals.length > 0;
            const isMilestone = y % 5 === 0;
            const proj = projectionByYear.get(y);
            const prevProj = i > 0 ? projection[i - 1] : proj;
            const endNav = proj?.endNav ?? 0;
            const withdrawal = proj?.withdrawal ?? 0;

            const xTop = navToX(prevProj?.endNav ?? endNav);
            const xBottomLine = navToX(endNav);
            const isFirst = i === 0;
            const isLast = i === years.length - 1;

            // Tornado bar geometry: the axis is ZERO. Bars extend right when
            // total NAV is positive (green) and left when it's negative (red).
            // Width = sqrt(|NAV| / peakNav), sqrt-scaled so early-year values
            // stay visible alongside late-year peaks.
            const tornadoIsSurplus = endNav >= 0;
            const navRatio = peakNav > 0 ? Math.min(1, Math.abs(endNav) / peakNav) : 0;
            const tornadoNorm = Math.sqrt(navRatio);
            const tornadoHalfMax = 50 - NAV_PAD_PCT;
            const tornadoHalfWidth = tornadoHalfMax * tornadoNorm;
            const tornadoX1 = tornadoIsSurplus ? 50 : 50 - tornadoHalfWidth;
            const tornadoX2 = tornadoIsSurplus ? 50 + tornadoHalfWidth : 50;
            // Two-tone gradient: light at the axis, deep at the outer tip.
            const tornadoBaseHue = tornadoIsSurplus ? "16, 185, 129" : "239, 68, 68"; // emerald-500 / red-500
            const tornadoDeepHue = tornadoIsSurplus ? "5, 95, 70" : "136, 19, 55"; // emerald-800 / rose-900
            const tornadoFillOpacity = 0.35 + tornadoNorm * 0.65;
            const tornadoStrokeOpacity = 0.35 + tornadoNorm * 0.55;

            // In tornado mode the year node lives on the centre axis instead of
            // tracking the gold line. Position markers off this anchor.
            const xBottom = isTornado ? 50 : xBottomLine;

            const nodeColor = isTornado
              ? tornadoNorm > 0
                ? `rgb(${tornadoBaseHue})`
                : "hsl(var(--muted-foreground))"
              : "#D4A868";

            const isHovered = hoveredYear === y;
            const rowMilestones = milestonesByYear.get(y) ?? [];
            const hasMilestone = rowMilestones.length > 0;

            const isDropTarget = dropTargetYear === y && draggingGoalId !== null;
            return (
              <li
                key={y}
                ref={(el) => {
                  if (el) rowRefs.current.set(y, el);
                  else rowRefs.current.delete(y);
                }}
                className={`relative ${isFirst ? "sticky z-[15] bg-background" : ""} ${isDropTarget ? "rounded-lg ring-2 ring-[#D4A868]/70" : ""}`}
                style={isFirst ? { top: "108px" } : undefined}
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
                        {/* Directional two-tone gradient — light at the axis end, deep at
                            the outer tip. Each bar reads like a beam radiating away from
                            today's NAV baseline. */}
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
                              stopColor={`rgb(${tornadoIsSurplus ? tornadoBaseHue : tornadoDeepHue})`}
                              stopOpacity={tornadoIsSurplus ? 0.25 : 1}
                            />
                            <stop
                              offset="100%"
                              stopColor={`rgb(${tornadoIsSurplus ? tornadoDeepHue : tornadoBaseHue})`}
                              stopOpacity={tornadoIsSurplus ? 1 : 0.25}
                            />
                          </linearGradient>
                        </defs>

                        {/* Centre axis — quiet vertical guide bars pivot around */}
                        <line
                          x1={50}
                          y1={isFirst ? 50 : 0}
                          x2={50}
                          y2={isLast ? 50 : 100}
                          stroke="hsl(var(--border))"
                          strokeOpacity={0.7}
                          strokeWidth={1}
                          vectorEffect="non-scaling-stroke"
                        />

                        {tornadoNorm > 0 && (
                          <rect
                            x={tornadoX1}
                            y={17.5}
                            width={Math.max(0, tornadoX2 - tornadoX1)}
                            height={65}
                            fill={`url(#tornadoBar-${y})`}
                            fillOpacity={tornadoFillOpacity}
                          />
                        )}

                        {hasGoals && (
                          <circle
                            cx={50}
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
                          cx={50}
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


                  {isHovered && (!isTornado || tornadoNorm > 0) && (
                    <div
                      className="pointer-events-none absolute z-20"
                      style={{
                        left: `${Math.min(95, Math.max(5, xBottom))}%`,
                        top: "50%",
                        transform:
                          xBottom > 80
                            ? "translate(-100%, -120%)"
                            : xBottom < 20
                              ? "translate(0, -120%)"
                              : "translate(-50%, -120%)",
                      }}
                    >
                      <div
                        className="rounded-md border border-border bg-card px-2 py-0.5 text-[10.5px] shadow-md whitespace-nowrap"
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                        }}
                      >
                        {isTornado ? (
                          <>
                            <span className="text-muted-foreground">{y}</span>
                            <span className="mx-1 text-muted-foreground/50">·</span>
                            <span
                              className="font-semibold"
                              style={{ color: `rgb(${tornadoBaseHue})` }}
                            >
                              {tornadoIsSurplus ? "" : "−"}
                              {formatINRCompact(Math.abs(endNav))}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">{y}</span>
                            <span className="mx-1 text-muted-foreground/50">·</span>
                            <span className="font-semibold text-foreground">
                              {formatINRCompact(endNav)}
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

                  {/* Year label */}
                  <div
                    className={`relative z-10 w-[40px] shrink-0 flex items-start ${hasGoals ? "pt-2" : "pt-0"}`}
                  >
                    <span
                      className={`text-[11px] tabular-nums ${
                        isMilestone || hasGoals
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground/60"
                      }`}
                    >
                      {y}
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
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold animate-pulse"
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

                    {hasGoals && (
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[10.5px] tabular-nums text-muted-foreground"
                          style={{
                            fontFamily:
                              "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {formatINRCompact(endNav)}
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
                            fv > 0 ? Math.min(100, Math.round(((endNav + withdrawal) / fv) * 100)) : 0;
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
                              onDragStart={() => {
                                setDraggingGoalId(g.id);
                                setDropTargetYear(g.year);
                              }}
                              onDrag={(_, info) => {
                                const yr = findYearAtClientY(info.point.y);
                                setDropTargetYear(yr);
                              }}
                              onDragEnd={(_, info) => {
                                const yr = findYearAtClientY(info.point.y);
                                if (yr != null && yr !== g.year) moveGoalToYear(g.id, yr);
                                setDraggingGoalId(null);
                                setDropTargetYear(null);
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
              </li>
            );
          })}
        </ul>

        <p className="px-1 text-[9.5px] leading-snug text-muted-foreground/70">
          {isTornado
            ? "Each bar = total portfolio NAV at the end of that year. Green = positive NAV (you still have money). Red = negative NAV (goals have outpaced what you've saved). Wider = larger amount."
            : "Gold spine = projected NAV (today's portfolio, ₹2L/mo, 9% p.a.). Red ticks = goal-draw years."}
          <span className="ml-1 text-muted-foreground/60">
            Directional guide, not a forecast.
          </span>
        </p>

        {/* Assumptions — plain-text return rates */}
        {isTornado && (
          <p className="px-1 pt-2 text-[10.5px] leading-snug text-muted-foreground/80">
            Assumes Equity return of 12% p.a. and Debt return of 7% p.a.
          </p>
        )}
      </motion.main>

      <AddGoalSheet
        open={addYear !== null}
        initialYear={addYear}
        onClose={() => setAddYear(null)}
        onSave={handleSave}
      />

      <ProjectionSheet open={projectionOpen} onClose={() => setProjectionOpen(false)} />

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
    </div>
  );
};

export default GoalsTimeline;
