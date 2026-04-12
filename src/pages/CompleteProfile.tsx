import { useState, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, PenLine, ChevronDown, Plus, X, Info, AlertTriangle, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  getFullProfile,
  updatePersonalInfo,
  updateInvestmentProfile,
  updateRiskProfile,
  updateConstraints,
  updateTaxProfile,
  updateReviewPreference,
  RISK_CATEGORIES,
  BackendOfflineError,
  type FullProfileResponse,
} from "@/lib/api";

type SectionStatus = "not_started" | "in_progress" | "confirmed";

interface OtherAsset {
  name: string;
  value: string;
}

interface Property {
  value: string;
  mortgage: string;
  monthlyRepayment: string;
  yearPurchased: string;
}

interface GoalDetail {
  amount: string;
  currency: string;
  year: string;
  purposes: string[];
  minReturn: string;
  notes: string;
  incomeAmount: string;
}

interface AllocationRange {
  min: number;
  max: number;
}

const STATUS_LABELS: Record<SectionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  confirmed: "Confirmed",
};

const STATUS_COLORS: Record<SectionStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-[hsl(38_80%_93%)] text-[hsl(38_80%_38%)]",
  confirmed: "bg-[hsl(160_30%_93%)] text-[hsl(160_50%_38%)]",
};

const SECTION_TITLES = [
  "Who are you?",
  "Your financial picture",
  "What are you trying to achieve?",
  "How much risk can you handle?",
  "Rules & limits",
  "Tax situation",
];

const OBJECTIVES = [
  "Wealth Growth",
  "Retirement Planning",
  "Child's Education",
  "Home Purchase",
  "Income Generation",
  "Estate Planning",
];

const GOAL_PURPOSES = [
  { value: "Growth", label: "Growth", desc: "Grow wealth over time" },
  { value: "Income", label: "Income", desc: "Generate regular cash flow" },
  { value: "Retirement", label: "Retirement", desc: "Retirement planning" },
  { value: "Expense", label: "Expense", desc: "Saving for a specific cost" },
];

const CURRENCIES = ["INR", "USD", "GBP"];

const PRIMARY_WEALTH_SOURCES = ["Salary", "Business", "Inheritance", "Investments", "Other"];
const OCCUPATION_OPTIONS = ["Salaried", "Business", "Freelance", "Homemaker", "Retired", "Other"];

const RISK_LEVELS = [...RISK_CATEGORIES];

const HORIZON_OPTIONS = ["< 2 years", "2 – 7 years", "7+ years"];

const BEHAV_Q1_OPTIONS = [
  "Cut losses immediately and liquidate all investments. Capital preservation is paramount.",
  "Cut your losses and transfer investments to safer asset classes.",
  "You would be worried, but would give your investments a little more time.",
  "You accept volatility and decline in portfolio value as a part of investing. You would keep your investments as is.",
  "You would add to your investments to bring the average buying price lower. You are confident about your investments and are not perturbed by notional losses.",
];

const BEHAV_Q2_OPTIONS = [
  "Knowing you missed a 20%+ market gain",
  "Knowing you lost 15%+ of your capital",
];

const BEHAV_Q3_OPTIONS = [
  "A — Worst -2% / Best 11%",
  "B — Worst -6% / Best 18%",
  "C — Worst -13% / Best 24%",
  "D — Worst -20% / Best 30%",
  "E — Worst -27% / Best 37%",
];

const ASSET_COMFORT = ["Equities", "Bonds", "Real Estate", "Gold", "Crypto", "International Markets"];
const ASSET_TYPES = ["Equities", "Bonds", "Real Estate", "Gold", "Crypto", "International Markets"];

const DEFAULT_ALLOCATIONS: Record<string, AllocationRange> = {
  Equities: { min: 40, max: 100 },
  Bonds: { min: 10, max: 30 },
  "Real Estate": { min: 5, max: 20 },
  Gold: { min: 5, max: 15 },
  Crypto: { min: 0, max: 10 },
  "International Markets": { min: 10, max: 25 },
};

const EMERGENCY_TIMEFRAMES = ["3 months", "6 months", "12 months", "Custom"];
const REVIEW_FREQ = ["Monthly", "Quarterly", "Semi-annual"];
const REVIEW_TRIGGERS = ["Job change", "Marriage or divorce", "New dependant", "Major windfall", "Market drop >20%", "Other"];

const INVEST_PREF_OPTIONS = [
  { letter: "A", worst: -2, best: 11 },
  { letter: "B", worst: -6, best: 18 },
  { letter: "C", worst: -13, best: 24 },
  { letter: "D", worst: -20, best: 30 },
  { letter: "E", worst: -27, best: 37 },
];

/* ── Reusable micro-components ── */
const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{children}</label>
);

const TextInput = ({ value, onChange, placeholder, prefix }: { value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string }) => (
  <div className="relative">
    {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>}
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition-colors placeholder:text-[12px] ${prefix ? "pl-7" : ""}`}
    />
  </div>
);

const Chip = ({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all ${
      disabled
        ? "bg-muted/50 text-muted-foreground/40 border-border/50 cursor-not-allowed"
        : active
        ? "bg-accent text-accent-foreground border-accent"
        : "bg-card text-muted-foreground border-border hover:border-accent/40"
    }`}
  >
    {label}
  </button>
);

const Toggle = ({ value, onChange, labelA, labelB }: { value: boolean; onChange: (v: boolean) => void; labelA: string; labelB: string }) => (
  <div className="flex gap-2">
    <button onClick={() => onChange(false)} className={`rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all ${!value ? "bg-accent text-accent-foreground border-accent" : "bg-card text-muted-foreground border-border"}`}>{labelA}</button>
    <button onClick={() => onChange(true)} className={`rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all ${value ? "bg-accent text-accent-foreground border-accent" : "bg-card text-muted-foreground border-border"}`}>{labelB}</button>
  </div>
);

const PrefilledBanner = () => (
  <div className="flex items-start gap-2 rounded-lg bg-[hsl(215_40%_94%)] px-3 py-2.5 mb-4">
    <Info className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" />
    <p className="text-xs text-accent leading-relaxed">We already have some details from your initial setup — please confirm or update below.</p>
  </div>
);

const SelectInput = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition-colors appearance-none placeholder:text-[12px]">
    {placeholder && <option value="">{placeholder}</option>}
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

/* ── Allocation Bar Component ── */
const AllocationBar = ({
  asset,
  range,
  onChange,
}: {
  asset: string;
  range: AllocationRange;
  onChange: (r: AllocationRange) => void;
}) => (
  <motion.div
    initial={{ height: 0, opacity: 0 }}
    animate={{ height: "auto", opacity: 1 }}
    exit={{ height: 0, opacity: 0 }}
    transition={{ duration: 0.25 }}
    className="overflow-hidden"
  >
    <div className="rounded-lg border border-border bg-card p-3 mt-2 space-y-2">
      <p className="text-xs font-semibold text-foreground">{asset}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">Min %</label>
          <input
            type="number"
            min={0}
            max={range.max}
            value={range.min}
            onChange={(e) => {
              const v = Math.min(Number(e.target.value), range.max);
              onChange({ ...range, min: Math.max(0, v) });
            }}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
          />
        </div>
        <div className="flex-1 pt-4">
          <Slider
            value={[range.min, range.max]}
            onValueChange={([min, max]) => onChange({ min, max })}
            min={0}
            max={100}
            step={1}
            className="[&_[role=slider]]:bg-accent [&_[role=slider]]:border-accent [&_[role=slider]]:h-3 [&_[role=slider]]:w-3 [&_.relative>div]:bg-accent [&_[data-orientation=horizontal]]:h-[6px]"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-muted-foreground">Max %</label>
          <input
            type="number"
            min={range.min}
            max={100}
            value={range.max}
            onChange={(e) => {
              const v = Math.max(Number(e.target.value), range.min);
              onChange({ ...range, max: Math.min(100, v) });
            }}
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
          />
        </div>
      </div>
    </div>
  </motion.div>
);

const RISK_TAGLINES = [
  "Capital preservation is your priority",
  "Steady growth with limited downside",
  "Balanced risk and reward over time",
  "Growth-focused with short-term volatility",
  "Maximum growth, maximum swings",
];

/* ── Circular Donut Risk Dial (30% smaller) ── */
const RiskDial = ({ level, onChangeLevel }: { level: number; onChangeLevel: (l: number) => void }) => {
  const size = 154;
  const strokeWidth = 15;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const startAngleDeg = 135;
  const sweepDeg = 270;
  const segments = 5;

  const degToRad = (d: number) => (d * Math.PI) / 180;

  const polarToXY = (angleDeg: number) => ({
    x: cx + radius * Math.cos(degToRad(angleDeg)),
    y: cy + radius * Math.sin(degToRad(angleDeg)),
  });

  const levelAngle = (idx: number) => startAngleDeg + (idx / (segments - 1)) * sweepDeg;

  const thumbAngle = levelAngle(level);
  const thumbPos = polarToXY(thumbAngle);

  const arcPath = (from: number, to: number) => {
    const s = polarToXY(from);
    const e = polarToXY(to);
    const largeArc = to - from > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const handlePointerEvent = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * size;
    const py = ((e.clientY - rect.top) / rect.height) * size;

    let angle = Math.atan2(py - cy, px - cx) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    let relAngle = angle - startAngleDeg;
    if (relAngle < -45) relAngle += 360;
    if (relAngle < 0) relAngle = 0;
    if (relAngle > sweepDeg) relAngle = sweepDeg;

    const closest = Math.round((relAngle / sweepDeg) * (segments - 1));
    onChangeLevel(Math.max(0, Math.min(segments - 1, closest)));
  };

  const [dragging, setDragging] = useState(false);

  const gradientColors = [
    "hsla(210, 45%, 55%, 0.7)",
    "hsla(160, 38%, 45%, 0.7)",
    "hsla(45, 60%, 50%, 0.7)",
    "hsla(20, 60%, 50%, 0.7)",
    "hsla(0, 50%, 50%, 0.7)",
  ];

  const displayLabel = RISK_LEVELS[level];
  const displayTagline = RISK_TAGLINES[level];

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="touch-none cursor-pointer"
        onPointerDown={(e) => { setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); handlePointerEvent(e); }}
        onPointerMove={(e) => { if (dragging) handlePointerEvent(e); }}
        onPointerUp={() => setDragging(false)}
      >
        <path
          d={arcPath(startAngleDeg, startAngleDeg + sweepDeg)}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {gradientColors.map((color, i) => {
          const segStart = startAngleDeg + (i / segments) * sweepDeg;
          const segEnd = startAngleDeg + ((i + 1) / segments) * sweepDeg;
          const isActive = i <= level;
          return (
            <path
              key={i}
              d={arcPath(segStart, segEnd)}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              opacity={isActive ? 1 : 0.15}
              className="transition-opacity duration-300"
            />
          );
        })}
        <circle
          cx={thumbPos.x}
          cy={thumbPos.y}
          r={10}
          fill="white"
          stroke="hsl(var(--accent))"
          strokeWidth={2.5}
          className="drop-shadow-md"
        />
      </svg>
      <div className="relative -mt-[98px] mb-[21px] flex flex-col items-center text-center pointer-events-none" style={{ width: size }}>
        <p className="text-xs font-bold text-foreground">{displayLabel}</p>
        <p className="text-[10px] italic text-muted-foreground mt-0.5 px-4">{displayTagline}</p>
      </div>
    </div>
  );
};

/* ── Helpers ── */
const parseNum = (s: string | undefined | null): string => {
  if (s == null) return "";
  const n = Number(s);
  if (Number.isNaN(n) || n === 0) return "";
  return n.toLocaleString("en-IN");
};

const toNum = (s: string): number | null => {
  const cleaned = s.replace(/[₹,\s]/g, "");
  if (!cleaned) return null;
  const crMatch = cleaned.match(/^([\d.]+)\s*[Cc]r$/);
  if (crMatch) return parseFloat(crMatch[1]) * 10_000_000;
  const lMatch = cleaned.match(/^([\d.]+)\s*[Ll]$/);
  if (lMatch) return parseFloat(lMatch[1]) * 100_000;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
};
/* ── Format INR ── */
const formatINR = (v: number) => {
  if (v >= 100000000) return "₹10 Cr+";
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}K`;
  return `₹${v}`;
};

const IE_SLIDER_TICKS = [
  { value: 0, label: "₹0" }, { value: 2500000, label: "₹25L" }, { value: 5000000, label: "₹50L" },
  { value: 10000000, label: "₹1Cr" }, { value: 50000000, label: "₹5Cr" }, { value: 100000000, label: "₹10Cr+" },
];

const IncomeExpenseSlider = ({ label, range, onChange }: {
  label: string; range: [number, number]; onChange: (r: [number, number]) => void;
}) => {
  const max = 100000000;
  const minPct = (range[0] / max) * 100;
  const maxPct = (range[1] / max) * 100;
  const isSingleValue = range[0] === range[1];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold text-foreground">
          {isSingleValue ? formatINR(range[0]) : `${formatINR(range[0])} – ${formatINR(range[1])}`}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-secondary">
        <div className="absolute h-full rounded-full bg-accent" style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }} />
        <input type="range" min={0} max={max} step={100000} value={range[0]}
          onChange={(e) => { const v = Math.max(0, Math.min(Number(e.target.value), range[1])); onChange([v, range[1]]); }}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-md pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto" />
        <input type="range" min={0} max={max} step={100000} value={range[1]}
          onChange={(e) => { const v = Math.max(Number(e.target.value), range[0]); onChange([range[0], v]); }}
          className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:shadow-md pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto" />
      </div>
      <div className="flex justify-between">
        {IE_SLIDER_TICKS.map((t) => (<span key={t.value} className="text-[9px] text-muted-foreground/50">{t.label}</span>))}
      </div>
    </div>
  );
};

/* ── Behavioural Risk Modal ── */
const BehaviouralRiskModal = ({
  open, onClose, q1, setQ1, q2, setQ2, q3, setQ3,
}: {
  open: boolean; onClose: () => void;
  q1: string; setQ1: (v: string) => void;
  q2: string; setQ2: (v: string) => void;
  q3: string; setQ3: (v: string) => void;
}) => {
  if (!open) return null;
  const canSave = q1 !== "" && q2 !== "" && q3 !== "";

  const OptionCard = ({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl px-4 py-3 text-xs font-medium border transition-all ${
        selected ? "bg-accent text-accent-foreground border-accent" : "bg-card text-foreground border-border hover:border-accent/40"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] bg-background rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Behavioural Risk Assessment</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Understanding your behaviour</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted hover:bg-muted/80">
            <X className="h-3.5 w-3.5 text-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Q1 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">1. If your portfolio dropped 20%+ in one month, what would you do?</p>
            <div className="space-y-1.5">
              {BEHAV_Q1_OPTIONS.map((o) => <OptionCard key={o} label={o} selected={q1 === o} onClick={() => setQ1(o)} />)}
            </div>
          </div>
          {/* Q2 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">2. Which would keep you up more at night?</p>
            <div className="space-y-1.5">
              {BEHAV_Q2_OPTIONS.map((o) => <OptionCard key={o} label={o} selected={q2 === o} onClick={() => setQ2(o)} />)}
            </div>
          </div>
          {/* Q3 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">3. Which scenario best describes your "Risk Range"?</p>
            <div className="space-y-1.5">
              {BEHAV_Q3_OPTIONS.map((o) => <OptionCard key={o} label={o} selected={q3 === o} onClick={() => setQ3(o)} />)}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={!canSave}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${canSave ? "bg-foreground text-background hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
          >
            Save responses
          </button>
        </div>
      </div>
    </div>
  );
};


const CompleteProfile = () => {
  const navigate = useNavigate();
  const [openSection, setOpenSection] = useState(0);
  const [statuses, setStatuses] = useState<SectionStatus[]>(Array(7).fill("not_started"));
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Section 0 — Who are you?
  const [occupation, setOccupation] = useState("");
  const [primaryResidence, setPrimaryResidence] = useState("");
  const [earningMembers, setEarningMembers] = useState("");
  const [dependents, setDependents] = useState("");
  const [values, setValues] = useState("");
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");

  // Section 1 — Your financial picture
  const [occupationType, setOccupationType] = useState("");
  const [occupationOtherText, setOccupationOtherText] = useState("");
  const [primaryWealthSource, setPrimaryWealthSource] = useState<string[]>([]);
  const [wealthSourceOtherText, setWealthSourceOtherText] = useState("");
  const [investableAssets, setInvestableAssets] = useState("");
  const [liabilities, setLiabilities] = useState("");
  const [otherAssets, setOtherAssets] = useState<OtherAsset[]>([]);
  const [ownsHome, setOwnsHome] = useState(false);
  const [properties, setProperties] = useState<Property[]>([{ value: "", mortgage: "", monthlyRepayment: "", yearPurchased: "" }]);
  const [plannedExpenses, setPlannedExpenses] = useState("");
  const [expectingLargeIncome, setExpectingLargeIncome] = useState(false);
  const [largeIncomeAmount, setLargeIncomeAmount] = useState("");
  const [largeIncomeCurrency, setLargeIncomeCurrency] = useState("INR");
  const [largeIncomeYear, setLargeIncomeYear] = useState("");
  const [emergencyFund, setEmergencyFund] = useState("");
  const [emergencyTimeframe, setEmergencyTimeframe] = useState("6 months");

  // Section 2 — What are you trying to achieve?
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [goalDetails, setGoalDetails] = useState<Record<string, GoalDetail>>({});
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [customGoalInput, setCustomGoalInput] = useState("");

  // Section 3 — How much risk?
  const [riskLevelIdx, setRiskLevelIdx] = useState(2);
  const [riskCapacity, setRiskCapacity] = useState("");
  const [investmentExperience, setInvestmentExperience] = useState("");
  const [investmentHorizon, setInvestmentHorizon] = useState("");
  const [showBehavModal, setShowBehavModal] = useState(false);
  const [investmentPref, setInvestmentPref] = useState("");
  const [behavQ1, setBehavQ1] = useState("");
  const [behavQ2, setBehavQ2] = useState("");
  const [behavQ3, setBehavQ3] = useState("");
  const [incomeRange, setIncomeRange] = useState<[number, number]>([30000000, 70000000]);
  const [expenseRange, setExpenseRange] = useState<[number, number]>([20000000, 50000000]);
  const [maxDrawdown, setMaxDrawdown] = useState("");
  const [comfortAssets, setComfortAssets] = useState<string[]>([]);

  // Section 4 — Rules & limits
  const [permittedAssets, setPermittedAssets] = useState<string[]>(["Equities", "Bonds", "Gold"]);
  const [allocations, setAllocations] = useState<Record<string, AllocationRange>>(() => {
    const init: Record<string, AllocationRange> = {};
    ["Equities", "Bonds", "Gold"].forEach((a) => {
      init[a] = { ...DEFAULT_ALLOCATIONS[a] };
    });
    return init;
  });
  const [prohibited, setProhibited] = useState("");
  const [leverage, setLeverage] = useState(false);
  const [leverageNotes, setLeverageNotes] = useState("");
  const [derivatives, setDerivatives] = useState(false);
  const [derivativesNotes, setDerivativesNotes] = useState("");
  const [diversificationNotes, setDiversificationNotes] = useState("");

  // Section 5 — Tax
  const [incomeTaxRate, setIncomeTaxRate] = useState("");
  const [cgtRate, setCgtRate] = useState("");
  const [taxNotes, setTaxNotes] = useState("");

  // Investment horizon notes (in risk section)
  const [horizonNotes, setHorizonNotes] = useState("");

  // Section 6 — Review
  const [reviewFreq, setReviewFreq] = useState("Quarterly");
  const [reviewTriggers, setReviewTriggers] = useState<string[]>([]);
  const [updateProcess, setUpdateProcess] = useState("");

  // ── Load existing profile ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getFullProfile();
        if (cancelled) return;
        const newStatuses: SectionStatus[] = Array(7).fill("not_started");

        // Section 0 — personal info
        if (p.personal_info) {
          const pi = p.personal_info;
          if (pi.occupation) setOccupation(pi.occupation);
          if (pi.family_status) {
            // Try to parse structured family data
            setEarningMembers("");
            setDependents("");
          }
          if (pi.personal_values) setValues(pi.personal_values.join(", "));
          if (pi.occupation || pi.family_status) newStatuses[0] = "confirmed";
        }

        // Section 1 — financial picture (from investment profile)
        if (p.investment_profile) {
          const ip = p.investment_profile;
          if (p.personal_info?.wealth_sources?.length) {
            setPrimaryWealthSource(p.personal_info.wealth_sources);
          }
          setInvestableAssets(parseNum(ip.investable_assets?.toString()));
          setLiabilities(parseNum(ip.total_liabilities?.toString()));
          if (ip.property_value) {
            setOwnsHome(true);
            setProperties([{ value: parseNum(ip.property_value?.toString()), mortgage: parseNum(ip.mortgage_amount?.toString()), monthlyRepayment: "", yearPurchased: "" }]);
          }
          setPlannedExpenses(parseNum(ip.planned_major_expenses?.toString()));
          setEmergencyFund(parseNum(ip.emergency_fund?.toString()));
          if (ip.emergency_fund_months) setEmergencyTimeframe(ip.emergency_fund_months);
          if (ip.investable_assets != null) newStatuses[1] = "confirmed";

          // Section 2 — goals
          if (ip.objectives?.length) setSelectedObjectives(ip.objectives);
          if (ip.objectives?.length) newStatuses[2] = "confirmed";

        }

        // Section 3 — risk
        if (p.risk_profile) {
          const rp = p.risk_profile;
          if (rp.risk_level != null) setRiskLevelIdx(rp.risk_level);
          if (rp.risk_capacity) setRiskCapacity(rp.risk_capacity);
          if (rp.investment_experience) setInvestmentExperience(rp.investment_experience);
          if (rp.investment_horizon) setInvestmentHorizon(rp.investment_horizon);
          if (rp.max_drawdown != null) setMaxDrawdown(String(rp.max_drawdown));
          if (rp.comfort_assets) setComfortAssets(rp.comfort_assets);
          if (rp.risk_level != null) newStatuses[3] = "confirmed";
        }

        // Section 4 — constraints
        if (p.investment_constraint) {
          const ic = p.investment_constraint;
          if (ic.permitted_assets?.length) setPermittedAssets(ic.permitted_assets);
          if (ic.prohibited_instruments?.length) setProhibited(ic.prohibited_instruments.join(", "));
          if (ic.is_leverage_allowed != null) setLeverage(ic.is_leverage_allowed);
          if (ic.is_derivatives_allowed != null) setDerivatives(ic.is_derivatives_allowed);
          if (ic.diversification_notes) setDiversificationNotes(ic.diversification_notes);
          if (ic.allocation_constraints?.length) {
            const loaded: Record<string, AllocationRange> = {};
            ic.allocation_constraints.forEach((ac) => {
              loaded[ac.asset_class] = {
                min: ac.min_allocation ?? 0,
                max: ac.max_allocation ?? 100,
              };
            });
            setAllocations((prev) => ({ ...prev, ...loaded }));
          }
          if (ic.permitted_assets?.length) newStatuses[4] = "confirmed";
        }

        // Section 5 — tax
        if (p.tax_profile) {
          const tp = p.tax_profile;
          if (tp.income_tax_rate != null) setIncomeTaxRate(String(tp.income_tax_rate));
          if (tp.capital_gains_tax_rate != null) setCgtRate(String(tp.capital_gains_tax_rate));
          if (tp.notes) setTaxNotes(tp.notes);
          if (tp.income_tax_rate != null) newStatuses[5] = "confirmed";
        }

        // Section 6 — review
        if (p.review_preference) {
          const rp = p.review_preference;
          if (rp.frequency) setReviewFreq(rp.frequency);
          if (rp.triggers) setReviewTriggers(rp.triggers);
          if (rp.update_process) setUpdateProcess(rp.update_process);
          if (rp.frequency) newStatuses[6] = "confirmed";
        }

        setStatuses(newStatuses);
        const firstIncomplete = newStatuses.findIndex((s) => s !== "confirmed");
        if (firstIncomplete >= 0) setOpenSection(firstIncomplete);
      } catch {
        // first-time user
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const confirmedCount = statuses.filter((s) => s === "confirmed").length;
  const progressPercent = Math.round((confirmedCount / 7) * 100);
  const allConfirmed = confirmedCount === 7;

  const totalMaxAllocation = useMemo(() => {
    return permittedAssets.reduce((sum, a) => sum + (allocations[a]?.max || 0), 0);
  }, [permittedAssets, allocations]);

  const getOrCreateGoalDetail = (objective: string): GoalDetail => {
    return goalDetails[objective] || { amount: "", currency: "INR", year: "", purposes: [], minReturn: "", notes: "", incomeAmount: "" };
  };

  const updateGoalDetail = (objective: string, updates: Partial<GoalDetail>) => {
    setGoalDetails((prev) => ({
      ...prev,
      [objective]: { ...getOrCreateGoalDetail(objective), ...updates },
    }));
  };

  const toggleGoalPurpose = (objective: string, purpose: string) => {
    const detail = getOrCreateGoalDetail(objective);
    const purposes = detail.purposes.includes(purpose)
      ? detail.purposes.filter((p) => p !== purpose)
      : detail.purposes.length < 4
      ? [...detail.purposes, purpose]
      : detail.purposes;
    updateGoalDetail(objective, { purposes });
  };

  const confirmSection = useCallback(async (idx: number) => {
    try {
      switch (idx) {
        case 0:
          await updatePersonalInfo({
            occupation: occupation || null,
            family_status: `${earningMembers || "0"} earning, ${dependents || "0"} dependents`,
            personal_values: values ? values.split(",").map((v) => v.trim()).filter(Boolean) : null,
          });
          break;
        case 1:
          await updateInvestmentProfile({
            investable_assets: toNum(investableAssets),
            total_liabilities: toNum(liabilities),
            property_value: ownsHome ? toNum(properties[0]?.value) : null,
            mortgage_amount: ownsHome ? toNum(properties[0]?.mortgage) : null,
            planned_major_expenses: toNum(plannedExpenses),
            emergency_fund: toNum(emergencyFund),
            emergency_fund_months: emergencyTimeframe || null,
          });
          {
            const sources = [...primaryWealthSource];
            if (sources.includes("Other") && wealthSourceOtherText.trim()) {
              sources[sources.indexOf("Other")] = wealthSourceOtherText.trim();
            }
            const occVal = occupationType === "Other" ? occupationOtherText.trim() || "Other" : occupationType;
            await updatePersonalInfo({
              wealth_sources: sources.length ? sources : null,
              ...(occVal ? { occupation: occVal } : {}),
            });
          }
          break;
        case 2:
          await updateInvestmentProfile({
            objectives: selectedObjectives.length ? selectedObjectives : null,
            detailed_goals: selectedObjectives.map((obj) => {
              const d = getOrCreateGoalDetail(obj);
              return {
                description: obj,
                year: d.year,
                amount: d.amount,
                currency: d.currency,
                purposes: d.purposes,
                min_return: d.minReturn,
                notes: d.notes,
              };
            }),
          });
          break;
        case 3:
          await updateRiskProfile({
            risk_level: riskLevelIdx,
            risk_capacity: riskCapacity || null,
            investment_experience: investmentExperience || null,
            investment_horizon: investmentHorizon || null,
            drop_reaction: behavQ1 || null,
            max_drawdown: maxDrawdown ? Number(maxDrawdown) : null,
            comfort_assets: comfortAssets.length ? comfortAssets : null,
          });
          break;
        case 4:
          await updateConstraints({
            permitted_assets: permittedAssets.length ? permittedAssets : null,
            prohibited_instruments: prohibited ? prohibited.split(",").map((s) => s.trim()).filter(Boolean) : null,
            is_leverage_allowed: leverage,
            is_derivatives_allowed: derivatives,
            diversification_notes: diversificationNotes || null,
            allocation_constraints: permittedAssets.map((asset) => ({
              asset_class: asset,
              min_allocation: allocations[asset]?.min ?? null,
              max_allocation: allocations[asset]?.max ?? null,
            })),
          });
          await updateReviewPreference({
            frequency: reviewFreq || null,
            triggers: null,
            update_process: null,
          });
          break;
        case 5:
          await updateTaxProfile({
            income_tax_rate: incomeTaxRate ? Number(incomeTaxRate) : null,
            capital_gains_tax_rate: cgtRate ? Number(cgtRate) : null,
            notes: taxNotes || null,
          });
          break;
      }
    } catch (err) {
      if (err instanceof BackendOfflineError) return;
      toast.error(`Failed to save: ${err instanceof Error ? err.message : "unknown error"}`);
      return;
    }

    setStatuses((prev) => {
      const next = [...prev];
      next[idx] = "confirmed";
      return next;
    });
    if (idx < 6) setOpenSection(idx + 1);
    toast.success(`Section ${idx + 1} confirmed ✓`);
  }, [
    occupation, primaryResidence, earningMembers, dependents, values,
    primaryWealthSource, investableAssets, liabilities, properties, plannedExpenses, emergencyFund, emergencyTimeframe, otherAssets, ownsHome, expectingLargeIncome, largeIncomeAmount, largeIncomeCurrency, largeIncomeYear,
    selectedObjectives, goalDetails,
    riskLevelIdx, riskCapacity, investmentExperience, investmentHorizon, horizonNotes, behavQ1, behavQ2, behavQ3, maxDrawdown, comfortAssets,
    permittedAssets, allocations, prohibited, leverage, derivatives, diversificationNotes,
    incomeTaxRate, cgtRate, taxNotes,
    reviewFreq, reviewTriggers, updateProcess,
  ]);

  const markInProgress = useCallback((idx: number) => {
    setStatuses((prev) => {
      if (prev[idx] === "confirmed") return prev;
      const next = [...prev];
      next[idx] = "in_progress";
      return next;
    });
  }, []);

  const toggleSection = (idx: number) => {
    setOpenSection(openSection === idx ? -1 : idx);
    markInProgress(idx);
  };

  const toggleChipArray = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const toggleAsset = (asset: string) => {
    if (permittedAssets.includes(asset)) {
      setPermittedAssets((prev) => prev.filter((a) => a !== asset));
      setAllocations((prev) => {
        const next = { ...prev };
        delete next[asset];
        return next;
      });
    } else {
      setPermittedAssets((prev) => [...prev, asset]);
      setAllocations((prev) => ({
        ...prev,
        [asset]: { ...DEFAULT_ALLOCATIONS[asset] },
      }));
    }
  };

  const updateAllocation = (asset: string, range: AllocationRange) => {
    setAllocations((prev) => ({ ...prev, [asset]: range }));
  };

  const addOtherAsset = () => setOtherAssets((prev) => [...prev, { name: "", value: "" }]);
  const removeOtherAsset = (i: number) => setOtherAssets((prev) => prev.filter((_, idx) => idx !== i));
  const updateOtherAsset = (i: number, field: keyof OtherAsset, value: string) => {
    setOtherAssets((prev) => prev.map((a, idx) => (idx === i ? { ...a, [field]: value } : a)));
  };

  const handleTillyMode = () => {
    navigate("/voice-onboarding");
  };

  const renderSection = (idx: number) => {
    switch (idx) {
      /* ── Section 0: Who are you? ── */
      case 0:
        return (
          <div className="space-y-3">
            <div><FieldLabel>Primary residence</FieldLabel><TextInput value={primaryResidence} onChange={setPrimaryResidence} placeholder="e.g. London, United Kingdom" /></div>
            <div>
              <FieldLabel>Family situation: earning members and dependents</FieldLabel>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground">Earning members</label>
                  <input
                    type="number"
                    min={0}
                    value={earningMembers}
                    onChange={(e) => setEarningMembers(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition-colors placeholder:text-[12px]"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Dependents</label>
                  <input
                    type="number"
                    min={0}
                    value={dependents}
                    onChange={(e) => setDependents(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition-colors placeholder:text-[12px]"
                  />
                </div>
              </div>
            </div>
          </div>
        );

      /* ── Section 1: Your financial picture ── */
      case 1:
        return (
          <div className="space-y-3">
            {/* Occupation */}
            <div>
              <FieldLabel>Occupation</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {OCCUPATION_OPTIONS.map((o) => (
                  <Chip key={o} label={o} active={occupationType === o} onClick={() => setOccupationType(occupationType === o ? "" : o)} />
                ))}
              </div>
              {occupationType === "Other" && (
                <div className="mt-2">
                  <TextInput value={occupationOtherText} onChange={setOccupationOtherText} placeholder="Enter your occupation" />
                </div>
              )}
            </div>

            {/* Income & Expenses — moved up below occupation */}
            <div>
              <FieldLabel>Annual income range</FieldLabel>
              <IncomeExpenseSlider label="Income" range={incomeRange} onChange={setIncomeRange} />
            </div>
            <div>
              <FieldLabel>Annual expense range</FieldLabel>
              <IncomeExpenseSlider label="Expenses" range={expenseRange} onChange={setExpenseRange} />
            </div>

            {/* Primary Wealth Source — multi-select */}
            <div>
              <FieldLabel>Primary wealth source</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {PRIMARY_WEALTH_SOURCES.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    active={primaryWealthSource.includes(s)}
                    onClick={() =>
                      setPrimaryWealthSource((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                      )
                    }
                  />
                ))}
              </div>
              {primaryWealthSource.includes("Other") && (
                <div className="mt-2">
                  <TextInput value={wealthSourceOtherText} onChange={setWealthSourceOtherText} placeholder="Specify other wealth source" />
                </div>
              )}
            </div>
            <div><FieldLabel>Financial and liquid assets</FieldLabel><TextInput value={investableAssets} onChange={setInvestableAssets} prefix="₹" placeholder="e.g. 42,00,000" /></div>
            <div><FieldLabel>Total liabilities / debts</FieldLabel><TextInput value={liabilities} onChange={setLiabilities} prefix="₹" placeholder="e.g. 5,00,000" /></div>


            {/* Property */}
            <div>
              <FieldLabel>Do you own a home?</FieldLabel>
              <Toggle value={ownsHome} onChange={setOwnsHome} labelA="No" labelB="Yes" />
              {ownsHome && (
                <div className="mt-3 space-y-3">
                  {properties.map((prop, idx) => {
                    const updateProp = (field: keyof Property, val: string) => {
                      setProperties(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
                    };
                    return (
                      <div key={idx} className="relative space-y-2 pl-1 border-l-2 border-accent/20 ml-1 rounded-lg bg-card p-3">
                        {properties.length > 1 && (
                          <button onClick={() => setProperties(prev => prev.filter((_, i) => i !== idx))} className="absolute top-2 right-2 h-5 w-5 flex items-center justify-center rounded-full bg-muted hover:bg-destructive/20 transition-colors">
                            <X className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                        {properties.length > 1 && <p className="text-[10px] font-semibold text-muted-foreground mb-1">Property {idx + 1}</p>}
                        <div><label className="text-[10px] text-muted-foreground">Property value</label><TextInput value={prop.value} onChange={(v) => updateProp("value", v)} prefix="₹" placeholder="e.g. 1.20 Cr" /></div>
                        <div><label className="text-[10px] text-muted-foreground">Total outstanding mortgage</label><TextInput value={prop.mortgage} onChange={(v) => updateProp("mortgage", v)} prefix="₹" placeholder="e.g. 45,00,000" /></div>
                        <div><label className="text-[10px] text-muted-foreground">Current monthly repayment</label><TextInput value={prop.monthlyRepayment} onChange={(v) => updateProp("monthlyRepayment", v)} prefix="₹" placeholder="e.g. 35,000" /></div>
                        
                      </div>
                    );
                  })}
                  <button onClick={() => setProperties(prev => [...prev, { value: "", mortgage: "", monthlyRepayment: "", yearPurchased: "" }])} className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors mt-1">
                    <Plus className="h-3 w-3" /> Add another property
                  </button>
                </div>
              )}
            </div>

            <div><FieldLabel>Planned large expenses</FieldLabel><TextInput value={plannedExpenses} onChange={setPlannedExpenses} placeholder="e.g. school fees from 2026, property purchase" /></div>

            {/* Expected large income */}
            <div>
              <FieldLabel>Are you expecting any large income in the future?</FieldLabel>
              <p className="text-[10px] text-muted-foreground mb-1.5">e.g. bonus, inheritance, property sale</p>
              <Toggle value={expectingLargeIncome} onChange={setExpectingLargeIncome} labelA="No" labelB="Yes" />
              {expectingLargeIncome && (
                <div className="mt-3 space-y-2 pl-1 border-l-2 border-accent/20 ml-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-muted-foreground">Amount</label><TextInput value={largeIncomeAmount} onChange={setLargeIncomeAmount} placeholder="e.g. 25,00,000" /></div>
                    <div><label className="text-[10px] text-muted-foreground">Currency</label><SelectInput value={largeIncomeCurrency} onChange={setLargeIncomeCurrency} options={CURRENCIES} /></div>
                  </div>
                  <div><label className="text-[10px] text-muted-foreground">Expected year</label><TextInput value={largeIncomeYear} onChange={setLargeIncomeYear} placeholder="e.g. 2026" /></div>
                </div>
              )}
            </div>


            <div className="flex gap-3">
              <div className="flex-1"><FieldLabel>Emergency fund target</FieldLabel><TextInput value={emergencyFund} onChange={setEmergencyFund} prefix="₹" placeholder="e.g. 3,00,000" /></div>
              <div className="w-32"><FieldLabel>Timeframe</FieldLabel><SelectInput value={emergencyTimeframe} onChange={setEmergencyTimeframe} options={EMERGENCY_TIMEFRAMES} /></div>
            </div>
          </div>
        );

      /* ── Section 2: What are you trying to achieve? ── */
      case 2:
        return (
          <div className="space-y-4">
            <PrefilledBanner />
            <div>
              <FieldLabel>Select your goals</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {OBJECTIVES.map((o) => (
                  <Chip
                    key={o}
                    label={o}
                    active={selectedObjectives.includes(o)}
                    onClick={() => toggleChipArray(selectedObjectives, o, setSelectedObjectives)}
                  />
                ))}
              </div>
            </div>

            {/* Custom goals */}
            <div>
              <FieldLabel>Add your own goal</FieldLabel>
              <div className="flex gap-2">
                <input
                  value={customGoalInput}
                  onChange={(e) => setCustomGoalInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customGoalInput.trim()) {
                      const g = customGoalInput.trim();
                      if (!customGoals.includes(g) && !selectedObjectives.includes(g)) {
                        setCustomGoals((prev) => [...prev, g]);
                        setSelectedObjectives((prev) => [...prev, g]);
                      }
                      setCustomGoalInput("");
                    }
                  }}
                  placeholder="e.g. Start a business, Travel the world..."
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition-colors placeholder:text-muted-foreground/50"
                />
                <button
                  type="button"
                  onClick={() => {
                    const g = customGoalInput.trim();
                    if (g && !customGoals.includes(g) && !selectedObjectives.includes(g)) {
                      setCustomGoals((prev) => [...prev, g]);
                      setSelectedObjectives((prev) => [...prev, g]);
                    }
                    setCustomGoalInput("");
                  }}
                  disabled={!customGoalInput.trim()}
                  className="rounded-lg px-3 py-2 text-sm font-medium wealth-gradient text-primary-foreground disabled:opacity-40 transition-all"
                >
                  Add
                </button>
              </div>
              {customGoals.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {customGoals.map((g) => (
                    <span key={g} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-accent/10 text-accent border border-accent/20">
                      {g}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomGoals((prev) => prev.filter((x) => x !== g));
                          setSelectedObjectives((prev) => prev.filter((x) => x !== g));
                          setGoalDetails((prev) => { const n = { ...prev }; delete n[g]; return n; });
                        }}
                        className="ml-0.5 text-accent/60 hover:text-accent"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Per-goal detail cards */}
            {selectedObjectives.map((obj) => {
              const detail = getOrCreateGoalDetail(obj);
              return (
                <motion.div
                  key={obj}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="rounded-lg border border-border bg-card/50 p-3 space-y-2.5"
                >
                  <p className="text-xs font-semibold text-foreground">{obj}</p>
                  <div><label className="text-[10px] text-muted-foreground">Amount</label><TextInput value={detail.amount} onChange={(v) => updateGoalDetail(obj, { amount: v })} prefix="₹" placeholder="e.g. 50,00,000" /></div>
                  <div><label className="text-[10px] text-muted-foreground">Expected year</label><TextInput value={detail.year} onChange={(v) => updateGoalDetail(obj, { year: v })} placeholder="e.g. 2035" /></div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Value type</label>
                    <div className="flex gap-2 mt-1">
                      <Chip label="Present Value" active={detail.notes === "Present Value"} onClick={() => updateGoalDetail(obj, { notes: "Present Value" })} />
                      <Chip label="Future Value" active={detail.notes === "Future Value"} onClick={() => updateGoalDetail(obj, { notes: "Future Value" })} />
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Values / Exclusions */}
            <div><FieldLabel>Values / exclusions</FieldLabel><TextInput value={values} onChange={setValues} placeholder="e.g. ESG preferred, no defence stocks" /></div>
          </div>
        );

      /* ── Section 3: How much risk can you handle? ── */
      case 3:
        return (
          <div className="space-y-4">
            <div>
              <FieldLabel>Investment experience</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {["Beginner", "Intermediate", "Advanced", "Expert"].map((e) => (
                  <Chip key={e} label={e} active={investmentExperience === e} onClick={() => setInvestmentExperience(e)} />
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>Investment horizon</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {HORIZON_OPTIONS.map((h) => (
                  <Chip key={h} label={h} active={investmentHorizon === h} onClick={() => setInvestmentHorizon(h)} />
                ))}
              </div>
            </div>

            <div>
              <FieldLabel>Any specifics you'd like to share about your investment horizon?</FieldLabel>
              <textarea
                value={horizonNotes}
                onChange={(e) => setHorizonNotes(e.target.value)}
                placeholder="e.g. I plan to retire in 10 years but may need some funds in 3 years for a home purchase..."
                rows={3}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-accent transition-colors placeholder:text-[12px] resize-none"
              />
            </div>

            {/* Behavioural Risk Assessment — opens modal */}
            <div>
              <button
                onClick={() => setShowBehavModal(true)}
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-left hover:border-accent/40 transition-all"
              >
                <p className="text-xs font-semibold text-foreground">Behavioural Risk Assessment</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">3 quick questions to understand your behaviour</p>
                {behavQ1 && behavQ2 && behavQ3 && (
                  <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-medium text-[hsl(160_50%_38%)]">✓ Completed</span>
                )}
              </button>
            </div>


          </div>
        );

      /* ── Section 4: Rules & limits ── */
      case 4:
        return (
          <div className="space-y-4">
            <div>
              <FieldLabel>Permitted asset types</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {ASSET_TYPES.map((a) => (
                  <Chip key={a} label={a} active={permittedAssets.includes(a)} onClick={() => toggleAsset(a)} />
                ))}
              </div>
              <AnimatePresence>
                {permittedAssets.map((asset) => (
                  <AllocationBar
                    key={asset}
                    asset={asset}
                    range={allocations[asset] || DEFAULT_ALLOCATIONS[asset]}
                    onChange={(r) => updateAllocation(asset, r)}
                  />
                ))}
              </AnimatePresence>
              {permittedAssets.length > 0 && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${totalMaxAllocation > 100 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  {totalMaxAllocation > 100 && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}
                  Total max allocation: {totalMaxAllocation}%
                  {totalMaxAllocation > 100 && " — ⚠ Total max allocation exceeds 100% — please adjust"}
                </div>
              )}
            </div>
            <div><FieldLabel>Prohibited investments</FieldLabel><TextInput value={prohibited} onChange={setProhibited} placeholder="e.g. tobacco, gambling, leveraged products" /></div>
            <div>
              <FieldLabel>Leverage</FieldLabel>
              <Toggle value={leverage} onChange={setLeverage} labelA="No" labelB="Yes" />
              {leverage && <div className="mt-2"><TextInput value={leverageNotes} onChange={setLeverageNotes} placeholder="Notes on leverage use" /></div>}
            </div>
            <div>
              <FieldLabel>Derivatives</FieldLabel>
              <Toggle value={derivatives} onChange={setDerivatives} labelA="No" labelB="Yes" />
              {derivatives && <div className="mt-2"><TextInput value={derivativesNotes} onChange={setDerivativesNotes} placeholder="Notes on derivatives use" /></div>}
            </div>
            <div><FieldLabel>Diversification notes (optional)</FieldLabel><TextInput value={diversificationNotes} onChange={setDiversificationNotes} placeholder="Any specific diversification requirements" /></div>
            <div>
              <FieldLabel>Review frequency</FieldLabel>
              <div className="flex flex-wrap gap-2">{REVIEW_FREQ.map((f) => <Chip key={f} label={f} active={reviewFreq === f} onClick={() => setReviewFreq(f)} />)}</div>
            </div>
          </div>
        );

      /* ── Section 5: Tax situation ── */
      case 5:
        return (
          <div className="space-y-3">
            <div><FieldLabel>Income tax rate</FieldLabel><TextInput value={incomeTaxRate} onChange={setIncomeTaxRate} placeholder="e.g. 30" /></div>
            <div><FieldLabel>Capital gains tax rate</FieldLabel><TextInput value={cgtRate} onChange={setCgtRate} placeholder="e.g. 15 (LTCG) / 20 (STCG)" /></div>
            <div><FieldLabel>Additional notes (optional)</FieldLabel><TextInput value={taxNotes} onChange={setTaxNotes} placeholder="e.g. NRI status, HUF structure" /></div>
          </div>
        );


      default:
        return null;
    }
  };

  if (!profileLoaded) {
    return (
      <div className="mobile-container bg-background min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Loading your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-container bg-background min-h-screen pb-28">
      {/* Header */}
      <div className="px-5 pt-10 pb-1 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors">
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-foreground">Complete Your Investment Profile</h1>
          <p className="text-[11px] text-muted-foreground">Takes 10–15 minutes · We've pre-filled what we already know</p>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-muted-foreground font-medium">Section {Math.min(openSection + 1, 7)} of 7</span>
          <span className="text-[11px] text-muted-foreground">{confirmedCount}/7 confirmed</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.5 }} />
        </div>
      </div>

      {/* Mode toggle */}
      <div className="px-5 pb-4 flex gap-2">
        <button
          onClick={handleTillyMode}
          className="relative flex-[3] inline-flex flex-col items-center justify-center gap-1 rounded-xl bg-accent text-accent-foreground py-2.5 text-xs font-medium transition-all hover:opacity-90 active:scale-[0.97]"
        >
          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[9px] font-semibold leading-none whitespace-nowrap shadow-sm">Recommended</span>
          <span className="flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5 shrink-0" />Guide me (Chat with Tilly)</span>
        </button>
        <button
          className="flex-[2] flex items-center justify-center gap-2 rounded-xl border border-border bg-card text-muted-foreground py-2.5 text-xs font-medium hover:border-accent/40 transition-all active:scale-[0.97]"
        >
          <PenLine className="h-3.5 w-3.5" /> I'll fill it in myself
        </button>
      </div>

      {/* Accordion sections */}
      <div className="px-5 space-y-2">
        {SECTION_TITLES.map((title, idx) => {
          const isOpen = openSection === idx;
          const status = statuses[idx];
          return (
            <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
              <button onClick={() => toggleSection(idx)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{idx + 1}</span>
                <span className="flex-1 text-sm font-medium text-foreground">{title}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                    <div className="px-4 pb-4 pt-1">
                      {renderSection(idx)}
                      <button onClick={() => confirmSection(idx)} className="w-full mt-4 rounded-xl bg-accent text-accent-foreground py-2.5 text-xs font-semibold hover:opacity-90 transition-opacity">
                        Confirm & continue →
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Behavioural Risk Modal */}
      <BehaviouralRiskModal
        open={showBehavModal}
        onClose={() => setShowBehavModal(false)}
        q1={behavQ1} setQ1={setBehavQ1}
        q2={behavQ2} setQ2={setBehavQ2}
        q3={behavQ3} setQ3={setBehavQ3}
      />

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-t border-border px-5 py-4">
        <div className="max-w-md mx-auto">
          <button
            disabled={!allConfirmed}
            onClick={() => {
              toast.success("Generating your Investment Policy Statement…");
              navigate("/profile/ips");
            }}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${allConfirmed ? "bg-accent text-accent-foreground hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
          >
            Generate My Investment Policy Statement →
          </button>
          <p className="text-[10px] text-center text-muted-foreground mt-1.5">Your answers are saved automatically</p>
        </div>
      </div>
    </div>
  );
};

export default CompleteProfile;
