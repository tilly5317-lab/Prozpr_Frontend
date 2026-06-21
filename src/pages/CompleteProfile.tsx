import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, X, Info, AlertTriangle, Lock, Wallet, Target, TrendingUp, Landmark } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import {
  getFullProfile,
  getOnboardingProfile,
  updatePersonalInfo,
  updatePersonalFinance,
  updateInvestmentProfile,
  updateCurrentProperties,
  getCurrentProperties,
  saveOtherAssets,
  getOtherAssets,
  listGoals,
  updateRiskProfile,
  updateConstraints,
  updateTaxProfile,
  updateReviewPreference,
  RISK_CATEGORIES,
  BackendOfflineError,
  type CurrentPropertyPayload,
  type FullProfileResponse,
} from "@/lib/api";

type SectionStatus = "not_started" | "auto_filled" | "in_progress" | "confirmed";

interface OtherAsset {
  name: string;
  value: string;
}

interface Property {
  value: string;
  mortgage: string;
  monthlyRepayment: string;
  yearPurchased: string;
  mortgageEndDate: string;
  lastPaymentDate: string;
}

interface GoalDetail {
  amount: string;
  currency: string;
  year: string;
  purposes: string[];
  minReturn: string;
  notes: string;
  incomeAmount: string;
  // Home-purchase specific. Empty string when unused.
  downPaymentPct: string;
  loanTenureYears: string;
  // Inflation override. Empty string falls back to Prozpr's suggested rate.
  inflationRate: string;
  // Child's-education specific — flips the default suggestion to 8%.
  educationAbroad: boolean;
}

// Prozpr's house assumption for goal-cost inflation. Most lifestyle goals
// default to 6%; education abroad runs hotter because of FX and tuition.
const INFLATION_OPTIONS = ["4", "5", "6", "7", "8", "9", "10", "12", "15"];
const INFLATION_OBJECTIVES = new Set([
  "Home purchase",
  "Child's education",
  "Wedding",
  "Retirement",
]);
function suggestedInflationFor(objective: string, abroad: boolean): string {
  if (objective === "Child's education" && abroad) return "8";
  return "6";
}

interface AllocationRange {
  min: number;
  max: number;
}

interface PlannedExpense {
  description: string;
  year: string;
  amount: string;
  addAsGoal: boolean;
}

interface LargeIncome {
  description: string;
  year: string;
  amount: string;
  currency: string;
}

const STATUS_LABELS: Record<SectionStatus, string> = {
  not_started: "Not started",
  auto_filled: "Auto filled already",
  in_progress: "In progress",
  confirmed: "Confirmed",
};

const STATUS_COLORS: Record<SectionStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  auto_filled:
    "bg-[hsl(222_47%_14%/0.08)] text-[hsl(222_47%_24%)] dark:bg-[hsl(220_30%_70%/0.18)] dark:text-[hsl(220_30%_80%)]",
  in_progress:
    "bg-[hsl(38_80%_93%)] text-[hsl(38_80%_38%)] dark:bg-[hsl(38_70%_50%/0.18)] dark:text-[hsl(38_80%_70%)]",
  confirmed:
    "bg-[hsl(160_30%_93%)] text-[hsl(164_54%_40%)] dark:bg-[hsl(160_45%_45%/0.18)] dark:text-[hsl(160_45%_65%)]",
};

const SECTION_TITLES = [
  "Your financial picture",
  "What are you trying to achieve?",
  "Your investment preference and focus",
  "Tax details",
];

/** Card meta for the section list — icon, one-line description, time estimate. */
const SECTION_META: { Icon: typeof Wallet; description: string; estimate: string }[] = [
  { Icon: Wallet, description: "Income, expenses, assets, property and what's coming up", estimate: "~4 min" },
  { Icon: Target, description: "Set your goals and complete your cashflow inputs in Goal planning", estimate: "~3 min" },
  { Icon: TrendingUp, description: "Your horizon and how you behave when markets move", estimate: "~2 min" },
  { Icon: Landmark, description: "Your tax slab and regime, for tax-efficient advice", estimate: "~1 min" },
];

const MARGINAL_TAX_RATE_OPTIONS: { value: string; label: string; slab: string }[] = [
  { value: "0", label: "0%", slab: "Income up to ₹3,00,000" },
  { value: "5", label: "5%", slab: "₹3,00,001 – ₹7,00,000" },
  { value: "10", label: "10%", slab: "₹7,00,001 – ₹10,00,000" },
  { value: "15", label: "15%", slab: "₹10,00,001 – ₹12,00,000" },
  { value: "20", label: "20%", slab: "₹12,00,001 – ₹15,00,000" },
  { value: "25", label: "25%", slab: "₹20,00,001 – ₹24,00,000 (new regime)" },
  { value: "30", label: "30%", slab: "Above ₹15,00,000" },
];

const OBJECTIVES = [
  "Wealth growth",
  "Retirement",
  "Child's education",
  "Wedding",
  "Home purchase",
  "Estate planning",
];

const GOAL_PURPOSES = [
  { value: "Growth", label: "Growth", desc: "Grow wealth over time" },
  { value: "Income", label: "Income", desc: "Generate regular cash flow" },
  { value: "Retirement", label: "Retirement", desc: "Retirement planning" },
  { value: "Expense", label: "Expense", desc: "Saving for a specific cost" },
];

const CURRENCIES = ["INR", "USD", "GBP"];

const INCOME_SOURCE_OPTIONS = ["Salary", "Business", "Family supported", "Investments", "Pension", "Others"];

const RISK_LEVELS = [...RISK_CATEGORIES];

const HORIZON_OPTIONS = ["< 2 years", "2–5 years", "5+ years"];

const BEHAV_Q1_OPTIONS = [
  "I am a novice. I am new to investing and financial markets.",
  "I have a basic understanding of investing. I understand basic investment concepts like diversification and risks.",
  "I am enthusiastic about investing. I understand how markets fluctuate and the pros and cons of different investment classes.",
  "I am an experienced investor. I have invested in different markets and understand different investment strategies. I have developed my own investment philosophy.",
];

const BEHAV_Q2_OPTIONS = [
  "Keep it safe — I'll accept low returns to protect my money",
  "Mostly steady — small dips are fine for modest growth",
  "Balanced — I'll ride moderate ups and downs for moderate growth",
  "Growth-first — I can handle big swings for higher long-term returns",
  "Maximise growth — I'm comfortable with large losses while chasing the highest returns",
];

const BEHAV_Q3_OPTIONS = [
  "Capital preservation is paramount. Cut losses immediately and liquidate all investments.",
  "Transfer investments to safer asset classes to prevent further loss.",
  "Would feel worried but would wait to give your investments a little more time.",
  "Accept volatility and dips in portfolio value as part of investing. Will keep investments as they are.",
  "Buy the dip to bring the average buying price lower. Comfortable sitting with lower portfolio values and waiting for the market to recover in the long term.",
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
  <label className="block text-[15px] font-medium text-foreground mb-1.5 leading-snug">{children}</label>
);

/** Live Indian comma-grouping for plain numeric entry (12,34,567). Leaves
    free-form entries like "1.2 Cr" untouched so shorthand still works. */
const formatMoneyInput = (raw: string): string => {
  const noCommas = raw.replace(/,/g, "");
  if (!/^\d+(\.\d*)?$/.test(noCommas)) return raw;
  const [int, dec] = noCommas.split(".");
  const grouped = int === "" ? "" : Number(int).toLocaleString("en-IN");
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
};

const TextInput = ({ value, onChange, placeholder, prefix, onFocus, onBlur }: { value: string; onChange: (v: string) => void; placeholder?: string; prefix?: string; onFocus?: () => void; onBlur?: () => void }) => (
  <div className="relative">
    {prefix && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">{prefix}</span>}
    <input
      inputMode={prefix === "₹" ? "numeric" : undefined}
      value={value}
      onChange={(e) => onChange(prefix === "₹" ? formatMoneyInput(e.target.value) : e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors placeholder:text-[14px] placeholder:text-muted-foreground/50 ${prefix ? "pl-8" : ""}`}
    />
  </div>
);

/** Standardised asset types suggested while typing in "Other assets" — keeps
    entries consistent (e.g. everyone investing in unlisted picks the same label). */
const OTHER_ASSET_SUGGESTIONS = [
  "Unlisted Shares",
  "Physical Gold",
  "Digital Gold",
  "Jewellery",
  "ULIPs",
  "PMS",
  "AIF",
  "ESOPs (unvested)",
  "Private Equity",
  "REITs / Real Estate Funds",
  "Fixed Deposits",
  "Crypto",
  "Art & Collectibles",
];

const Chip = ({ label, active, onClick, disabled }: { label: string; active: boolean; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`rounded-full px-4 py-2 text-[13.5px] font-medium border transition-all ${
      disabled
        ? "bg-muted/50 text-muted-foreground/40 border-border/50 cursor-not-allowed"
        : active
        ? "bg-accent text-accent-foreground border-accent"
        : "bg-card text-foreground/80 border-border hover:border-accent/40"
    }`}
  >
    {label}
  </button>
);

const Toggle = ({ value, onChange, labelA, labelB }: { value: boolean; onChange: (v: boolean) => void; labelA: string; labelB: string }) => (
  <div className="flex gap-2">
    <button onClick={() => onChange(false)} className={`rounded-full px-5 py-2 text-[13.5px] font-medium border transition-all ${!value ? "bg-accent text-accent-foreground border-accent" : "bg-card text-foreground/80 border-border"}`}>{labelA}</button>
    <button onClick={() => onChange(true)} className={`rounded-full px-5 py-2 text-[13.5px] font-medium border transition-all ${value ? "bg-accent text-accent-foreground border-accent" : "bg-card text-foreground/80 border-border"}`}>{labelB}</button>
  </div>
);

const PrefilledBanner = () => (
  <div className="flex items-start gap-2 rounded-lg bg-[hsl(215_40%_94%)] px-3 py-2.5 mb-4">
    <Info className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" />
    <p className="text-xs text-accent leading-relaxed">We already have some details from your initial setup — please confirm or update below.</p>
  </div>
);

const SelectInput = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder?: string }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors appearance-none">
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
          <label className="text-[12px] text-muted-foreground mb-0.5 block">Min %</label>
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
          <label className="text-[12px] text-muted-foreground mb-0.5 block">Max %</label>
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

const EXPERIENCE_TAGLINES: Record<string, string> = {
  Beginner: "New to investing, still learning the basics",
  Intermediate: "Comfortable with common instruments and market cycles",
  Advanced: "Confident with complex strategies and portfolio construction",
  Expert: "Deep expertise across asset classes and risk frameworks",
};

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
/* ── Parse a loose date string (e.g. "Mar 2042", "2042-03-01") → ISO yyyy-mm-dd ── */
const toIsoDate = (s: string): string | null => {
  const t = s.trim();
  if (!t) return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
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

/* ── Behavioural Risk Modal (step-by-step) ── */

const CompleteProfile = () => {
  const navigate = useNavigate();
  // -1 = section-card carousel; otherwise the open section, stepping through
  // its question groups one at a time via groupIndex.
  const [openSection, setOpenSection] = useState(-1);
  const [groupIndex, setGroupIndex] = useState(0);
  const [statuses, setStatuses] = useState<SectionStatus[]>(() => {
    const s: SectionStatus[] = Array(4).fill("not_started");
    s[0] = "auto_filled";
    return s;
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  // True while a step/section save is in flight — drives the button spinner and
  // blocks double-submits.
  const [saving, setSaving] = useState(false);
  // Snapshot of each step's field signature (keyed `${section}-${group}`), taken
  // when a section is opened and refreshed after each successful save. Used to
  // skip the save API for steps the user didn't actually edit (avoids lag).
  const savedSig = useRef<Record<string, string>>({});

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
  const [equityShares, setEquityShares] = useState("");
  const [monthlyInvestment, setMonthlyInvestment] = useState("");
  const [liabilities, setLiabilities] = useState("");
  const [otherAssets, setOtherAssets] = useState<OtherAsset[]>([{ name: "", value: "" }]);
  // Which "Other assets" row's name input is focused — drives the suggestion dropdown.
  const [assetSuggestFor, setAssetSuggestFor] = useState<number | null>(null);
  const [ownsHome, setOwnsHome] = useState(false);
  const [properties, setProperties] = useState<Property[]>([{ value: "", mortgage: "", monthlyRepayment: "", yearPurchased: "", mortgageEndDate: "", lastPaymentDate: "" }]);
  const [plannedExpenses, setPlannedExpenses] = useState<PlannedExpense[]>([{ description: "", year: "", amount: "", addAsGoal: false }]);
  const [expectingLargeIncome, setExpectingLargeIncome] = useState(false);
  const [largeIncomes, setLargeIncomes] = useState<LargeIncome[]>([
    { description: "", year: "", amount: "", currency: "INR" },
  ]);
  const [emergencyFund, setEmergencyFund] = useState("");
  const [emergencyTimeframe, setEmergencyTimeframe] = useState("6 months");

  // Section 2 — What are you trying to achieve?
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [goalDetails, setGoalDetails] = useState<Record<string, GoalDetail>>({});
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [customGoalInput, setCustomGoalInput] = useState("");
  const [showGoalOtherInput, setShowGoalOtherInput] = useState(false);
  const [goalOtherText, setGoalOtherText] = useState("");

  // Section 3 — How much risk?
  const [riskLevelIdx, setRiskLevelIdx] = useState(2);
  const [riskCapacity, setRiskCapacity] = useState("");
  const [investmentExperience, setInvestmentExperience] = useState("");
  const [investmentHorizon, setInvestmentHorizon] = useState("");
  const [investmentPref, setInvestmentPref] = useState("");
  const [behavQ1, setBehavQ1] = useState("");
  const [behavQ2, setBehavQ2] = useState("");
  const [behavQ3, setBehavQ3] = useState("");
  const [annualIncome, setAnnualIncome] = useState<string>("");
  const [annualExpense, setAnnualExpense] = useState<string>("");
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
  const [taxRegime, setTaxRegime] = useState<"old" | "new" | "">("");
  const [showMarginalInfo, setShowMarginalInfo] = useState(false);
  const [showRegimeInfo, setShowRegimeInfo] = useState(false);

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
      const newStatuses: SectionStatus[] = Array(SECTION_TITLES.length).fill("not_started");
      newStatuses[0] = "auto_filled";

      // "N earning, M dependents" (the format confirmSection writes) → the two
      // separate number inputs in the "Family situation" step.
      const applyFamilyStatus = (fs: string | null | undefined) => {
        if (!fs) return;
        const m = fs.match(/(\d+)\s*earning[^\d]*(\d+)\s*dependent/i);
        if (m) {
          setEarningMembers(m[1]);
          setDependents(m[2]);
        }
      };

      // 1) Full profile — risk / tax / constraints / investment-profile extras.
      //    Best-effort: an onboarding-only user may have none of these yet, so a
      //    failure here must NOT block the onboarding prefill below.
      try {
        const p = await getFullProfile();
        if (cancelled) return;

        // Personal info (occupation, family, wealth sources, values).
        if (p.personal_info) {
          const pi = p.personal_info;
          if (pi.occupation) setOccupation(pi.occupation);
          applyFamilyStatus(pi.family_status);
          if (pi.wealth_sources?.length) setPrimaryWealthSource(pi.wealth_sources);
          if (pi.personal_values?.length) setValues(pi.personal_values.join(", "));
        }

        // Investment profile — assets, liabilities, property, emergency, goals.
        if (p.investment_profile) {
          const ip = p.investment_profile;
          if (ip.investable_assets != null) setInvestableAssets(parseNum(ip.investable_assets?.toString()));
          if (ip.total_liabilities != null) setLiabilities(parseNum(ip.total_liabilities?.toString()));
          // Owned home is loaded from user_current_properties below (the table the
          // save writes to) — not from the legacy investment_profile aggregate.
          setEmergencyFund(parseNum(ip.emergency_fund?.toString()));
          if (ip.emergency_fund_months) setEmergencyTimeframe(ip.emergency_fund_months);
          if (ip.investable_assets != null) newStatuses[0] = "confirmed";
          if (ip.objectives?.length) {
            setSelectedObjectives(ip.objectives);
            newStatuses[1] = "confirmed";
          }
        }

        // Section 2 — risk
        if (p.risk_profile) {
          const rp = p.risk_profile;
          if (rp.risk_level != null) setRiskLevelIdx(rp.risk_level);
          if (rp.risk_capacity) setRiskCapacity(rp.risk_capacity);
          if (rp.investment_experience) setInvestmentExperience(rp.investment_experience);
          if (rp.investment_horizon) setInvestmentHorizon(rp.investment_horizon);
          if (rp.max_drawdown != null) setMaxDrawdown(String(rp.max_drawdown));
          if (rp.comfort_assets) setComfortAssets(rp.comfort_assets);
          if (rp.risk_level != null) newStatuses[2] = "confirmed";
        }

        // Section 3 — tax details
        if (p.tax_profile) {
          const tp = p.tax_profile;
          if (tp.income_tax_rate != null) setIncomeTaxRate(String(tp.income_tax_rate));
          if (tp.capital_gains_tax_rate != null) setCgtRate(String(tp.capital_gains_tax_rate));
          // Prefer the dedicated tax_regime column; fall back to parsing the
          // legacy "Regime: old/new" note for users saved before the column existed.
          if (tp.tax_regime === "old" || tp.tax_regime === "new") {
            setTaxRegime(tp.tax_regime);
          } else if (tp.notes) {
            const regimeMatch = tp.notes.match(/regime:\s*(old|new)/i);
            if (regimeMatch) setTaxRegime(regimeMatch[1].toLowerCase() as "old" | "new");
          }
          // Keep any genuine free-form note (not the legacy regime marker).
          if (tp.notes && !/regime:/i.test(tp.notes)) setTaxNotes(tp.notes);
          if (tp.income_tax_rate != null) newStatuses[3] = "confirmed";
        }

        // Load review preference data
        if (p.review_preference) {
          const rp = p.review_preference;
          if (rp.frequency) setReviewFreq(rp.frequency);
          if (rp.triggers) setReviewTriggers(rp.triggers);
          if (rp.update_process) setUpdateProcess(rp.update_process);
        }

        // Load constraints data
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
        }
      } catch {
        // No full profile yet — fall through to the onboarding prefill.
      }

      // 2) Onboarding profile — the canonical source for the household-finance
      //    answers (income, expense, assets, liabilities, DOB) plus identity
      //    fields. Its own request so a missing full profile never blocks it.
      try {
        const op = await getOnboardingProfile();
        if (!cancelled) {
          if (op.occupation) setOccupation((cur) => cur || op.occupation || "");
          applyFamilyStatus(op.family_status);
          if (op.wealth_sources?.length) {
            setPrimaryWealthSource((cur) => (cur.length ? cur : op.wealth_sources!));
          }
          if (op.personal_values?.length) {
            setValues((cur) => cur || op.personal_values!.join(", "));
          }
          if (op.annual_income != null) {
            setAnnualIncome(parseNum(String(Math.round(op.annual_income))));
          }
          if (op.monthly_household_expense != null) {
            setAnnualExpense(parseNum(String(Math.round(op.monthly_household_expense * 12))));
          }
          if (op.starting_monthly_investment != null) {
            setMonthlyInvestment((cur) => cur || parseNum(String(op.starting_monthly_investment)));
          }
          if (op.financial_assets != null) {
            setInvestableAssets((cur) => cur || parseNum(String(op.financial_assets)));
          }
          if (op.equity_shares != null) {
            setEquityShares((cur) => cur || parseNum(String(op.equity_shares)));
          }
          if (op.financial_liabilities_excl_mortgage != null) {
            setLiabilities((cur) => cur || parseNum(String(op.financial_liabilities_excl_mortgage)));
          }
          if (op.investment_horizon) {
            setInvestmentHorizon((cur) => cur || op.investment_horizon || "");
          }
          if (op.date_of_birth) {
            const [y, m, d] = op.date_of_birth.split("-");
            if (y) setDobYear(y);
            if (m) setDobMonth(String(Number(m)));
            if (d) setDobDay(String(Number(d)));
          }
          // The user answered the core financial picture during onboarding —
          // reflect that on the section card.
          if (
            op.annual_income != null ||
            op.financial_assets != null ||
            op.monthly_household_expense != null
          ) {
            newStatuses[0] = "confirmed";
          }
        }
      } catch {
        // No onboarding profile yet — nothing to prefill.
      }

      // 3) Prefill previously-saved "other assets" so a returning user sees and
      //    can edit them (the save is a full-replace, so they must be loaded).
      try {
        const savedAssets = await getOtherAssets();
        if (!cancelled && savedAssets.length > 0) {
          setOtherAssets(
            savedAssets.map((a) => ({
              name: a.asset_name,
              value: a.current_value != null ? parseNum(String(a.current_value)) : "",
            })),
          );
        }
      } catch {
        // None saved yet — keep the empty default row.
      }

      // 4) Owned home — load from user_current_properties (the table the save
      //    writes to), so "Do you own a home?" and its details persist on return.
      try {
        const props = await getCurrentProperties();
        if (!cancelled && props.length > 0) {
          setOwnsHome(true);
          setProperties(
            props.map((p) => ({
              value: p.property_value != null ? parseNum(String(p.property_value)) : "",
              mortgage: p.mortgage_balance != null ? parseNum(String(p.mortgage_balance)) : "",
              monthlyRepayment: p.mortgage_emi != null ? parseNum(String(p.mortgage_emi)) : "",
              yearPurchased: "",
              mortgageEndDate: p.mortgage_end_date ? p.mortgage_end_date.slice(0, 4) : "",
              lastPaymentDate: "",
            })),
          );
        }
      } catch {
        // No properties saved yet — keep the default (ownsHome = No).
      }

      // 5) "What are you trying to achieve?" is complete once the user has at
      //    least one goal (goals live in the goals service / goal planner).
      try {
        const goals = await listGoals();
        if (!cancelled && goals.length > 0) newStatuses[1] = "confirmed";
      } catch {
        // No goals yet — leave the section not-started.
      }

      if (!cancelled) {
        setStatuses(newStatuses);
        setProfileLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const confirmedCount = statuses.filter((s) => s === "confirmed").length;
  const progressPercent = Math.round((confirmedCount / SECTION_TITLES.length) * 100);
  const allConfirmed = confirmedCount === SECTION_TITLES.length;

  const totalMaxAllocation = useMemo(() => {
    return permittedAssets.reduce((sum, a) => sum + (allocations[a]?.max || 0), 0);
  }, [permittedAssets, allocations]);

  const getOrCreateGoalDetail = (objective: string): GoalDetail => {
    return (
      goalDetails[objective] || {
        amount: "",
        currency: "INR",
        year: "",
        purposes: [],
        minReturn: "",
        notes: "",
        incomeAmount: "",
        downPaymentPct: "",
        loanTenureYears: "",
        inflationRate: "",
        educationAbroad: false,
      }
    );
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

  // A compact signature of the fields each step persists. Compared against the
  // snapshot taken when the section was opened so we only call the save API on a
  // real edit. Must list exactly the state each persistGroup branch reads.
  const signatureFor = (sectionIdx: number, groupIdx: number): string => {
    if (sectionIdx === 0) {
      switch (groupIdx) {
        case 0: return JSON.stringify([earningMembers, dependents]);
        case 1: return JSON.stringify([annualIncome, annualExpense]);
        case 2: return JSON.stringify([primaryWealthSource, wealthSourceOtherText]);
        case 3: return JSON.stringify([investableAssets, equityShares, liabilities, monthlyInvestment, otherAssets]);
        case 4: return JSON.stringify([ownsHome, properties]);
        case 5: return JSON.stringify([plannedExpenses]);
        case 6: return JSON.stringify([largeIncomes, emergencyFund, emergencyTimeframe]);
      }
    } else if (sectionIdx === 2) {
      switch (groupIdx) {
        case 0: return JSON.stringify([investmentHorizon]);
        case 1: return JSON.stringify([riskLevelIdx, riskCapacity, investmentExperience, behavQ1, maxDrawdown, comfortAssets]);
      }
    } else if (sectionIdx === 3) {
      switch (groupIdx) {
        case 0: return JSON.stringify([incomeTaxRate]);
        case 1: return JSON.stringify([cgtRate, taxRegime, taxNotes]);
      }
    }
    return "";
  };

  const isGroupDirty = (sectionIdx: number, groupIdx: number): boolean =>
    savedSig.current[`${sectionIdx}-${groupIdx}`] !== signatureFor(sectionIdx, groupIdx);

  // Capture the baseline signatures for a section's steps as it's opened, so an
  // untouched step never hits the API. Group counts mirror sectionGroups /
  // signatureFor: section 0 has 7 steps; sections 2 and 3 have 2 each.
  const snapshotSectionSignatures = (sectionIdx: number) => {
    const count = sectionIdx === 0 ? 7 : 2;
    for (let g = 0; g < count; g++) {
      savedSig.current[`${sectionIdx}-${g}`] = signatureFor(sectionIdx, g);
    }
  };

  // Confirm the section: the per-step saves already ran on each "Next"; here we
  // persist only the final step (if edited) and mark the section confirmed.
  const confirmSection = async (idx: number, lastGroupIdx: number) => {
    if (saving) return;
    let ok = true;
    if (isGroupDirty(idx, lastGroupIdx)) {
      setSaving(true);
      ok = await persistGroup(idx, lastGroupIdx);
      setSaving(false);
    }
    if (!ok) return;

    const nextStatuses = [...statuses];
    nextStatuses[idx] = "confirmed";
    setStatuses(nextStatuses);
    // Back to the section cards — the next card to tackle is visible there.
    setOpenSection(-1);
    setGroupIndex(0);
    toast.success(`Section ${idx + 1} confirmed ✓`);
  };

  // Persist just the fields belonging to one question group, so answers are
  // saved step-by-step as the user taps "Next" (not only on final confirm).
  // The backend PUT endpoints use exclude_unset, so sending a partial payload
  // never nulls fields owned by other steps. Returns false if the save failed.
  const persistGroup = async (sectionIdx: number, groupIdx: number): Promise<boolean> => {
    const key = `${sectionIdx}-${groupIdx}`;
    const sig = signatureFor(sectionIdx, groupIdx);
    // Unchanged since the section opened / last save → skip the API call entirely.
    if (savedSig.current[key] === sig) return true;
    try {
      if (sectionIdx === 0) {
        switch (groupIdx) {
          case 0: // Family situation
            await updatePersonalInfo({
              family_status: `${earningMembers || "0"} earning, ${dependents || "0"} dependents`,
            });
            break;
          case 1: { // Income & expenses
            const annualExpenseNum = toNum(annualExpense);
            await updatePersonalFinance({
              annual_income: toNum(annualIncome),
              monthly_household_expense:
                annualExpenseNum != null ? Math.round(annualExpenseNum / 12) : null,
            });
            break;
          }
          case 2: { // Income sources
            const sources = [...primaryWealthSource];
            if (sources.includes("Others") && wealthSourceOtherText.trim()) {
              sources[sources.indexOf("Others")] = wealthSourceOtherText.trim();
            }
            await updatePersonalInfo({ wealth_sources: sources.length ? sources : null });
            break;
          }
          case 3: { // Assets & liabilities (+ other assets)
            await updatePersonalFinance({
              financial_assets: toNum(investableAssets),
              equity_shares: toNum(equityShares),
              financial_liabilities_excl_mortgage: toNum(liabilities),
              starting_monthly_investment: toNum(monthlyInvestment),
            });
            const filledAssets = otherAssets.filter((a) => a.name.trim());
            if (filledAssets.length > 0) {
              await saveOtherAssets(
                filledAssets.map((a) => ({
                  asset_name: a.name.trim(),
                  asset_type: null,
                  current_value: toNum(a.value),
                })),
              );
            }
            break;
          }
          case 4: { // Property
            const propertyRows: CurrentPropertyPayload[] = ownsHome
              ? properties
                  .map((p, i): CurrentPropertyPayload | null => {
                    const value = toNum(p.value);
                    const emi = toNum(p.monthlyRepayment);
                    const endDate = toIsoDate(p.mortgageEndDate);
                    const balance = toNum(p.mortgage);
                    // A mortgage is present when EMI + end date are set (the
                    // backend requires both when has_mortgage is true). The
                    // outstanding balance is stored separately and is optional.
                    const hasMortgage = emi != null && endDate != null;
                    if (value == null && balance == null && !hasMortgage) return null;
                    return {
                      name: properties.length > 1 ? `Property ${i + 1}` : "Primary residence",
                      property_value: value,
                      has_mortgage: hasMortgage,
                      mortgage_emi: hasMortgage ? emi : null,
                      mortgage_end_date: hasMortgage ? endDate : null,
                      mortgage_balance: balance,
                    };
                  })
                  .filter((p): p is CurrentPropertyPayload => p !== null)
              : [];
            await updateCurrentProperties(propertyRows);
            break;
          }
          case 5: // Planned large expenses
            await updateInvestmentProfile({
              planned_major_expenses:
                plannedExpenses.reduce((sum, e) => sum + (toNum(e.amount) ?? 0), 0) || null,
            });
            break;
          case 6: // Expected large income (+ emergency fund)
            await updateInvestmentProfile({
              expected_inflows:
                largeIncomes.reduce((sum, i) => sum + (toNum(i.amount) ?? 0), 0) || null,
              emergency_fund: toNum(emergencyFund),
              emergency_fund_months: emergencyTimeframe || null,
            });
            break;
        }
      } else if (sectionIdx === 2) {
        switch (groupIdx) {
          case 0: // Investment horizon
            await updateRiskProfile({ investment_horizon: investmentHorizon || null });
            break;
          case 1: // Behavioural risk
            await updateRiskProfile({
              risk_level: riskLevelIdx,
              risk_capacity: riskCapacity || null,
              investment_experience: investmentExperience || null,
              drop_reaction: behavQ1 || null,
              max_drawdown: maxDrawdown ? Number(maxDrawdown) : null,
              comfort_assets: comfortAssets.length ? comfortAssets : null,
            });
            break;
        }
      } else if (sectionIdx === 3) {
        switch (groupIdx) {
          case 0: // Marginal tax rate
            await updateTaxProfile({
              income_tax_rate: incomeTaxRate ? Number(incomeTaxRate) : null,
            });
            break;
          case 1: // Tax regime
            await updateTaxProfile({
              capital_gains_tax_rate: cgtRate ? Number(cgtRate) : null,
              tax_regime: taxRegime || null,
              notes: taxNotes || null,
            });
            break;
        }
      }
      // Saved successfully → this step is now clean.
      savedSig.current[key] = sig;
      return true;
    } catch (err) {
      if (err instanceof BackendOfflineError) return false;
      toast.error(`Failed to save: ${err instanceof Error ? err.message : "unknown error"}`);
      return false;
    }
  };

  const markInProgress = useCallback((idx: number) => {
    setStatuses((prev) => {
      if (prev[idx] === "confirmed") return prev;
      const next = [...prev];
      next[idx] = "in_progress";
      return next;
    });
  }, []);

  const openSectionCard = (idx: number) => {
    // "What are you trying to achieve?" lives in Goal planning — send the user
    // there to set goals and complete the cashflow inputs in one place.
    if (idx === 1) {
      navigate("/goal-planner?inputs=1");
      return;
    }
    // Baseline the steps' signatures as they are now, so a step the user never
    // touches won't trigger a save when they click through.
    snapshotSectionSignatures(idx);
    setOpenSection(idx);
    setGroupIndex(0);
    markInProgress(idx);
  };

  // Deep-link from the portfolio "Unlock" circles: ?section=N opens that section
  // directly once the profile has loaded (runs once).
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !profileLoaded) return;
    const raw = searchParams.get("section");
    if (raw == null) return;
    deepLinkedRef.current = true;
    const idx = Number(raw);
    if (Number.isInteger(idx) && idx >= 0 && idx < SECTION_TITLES.length) {
      openSectionCard(idx);
    }
    // Clear the param so a refresh/back doesn't re-trigger it.
    const next = new URLSearchParams(searchParams);
    next.delete("section");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoaded]);

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

  // Each section's questions are split into small groups, shown one at a time.
  const sectionGroups = (idx: number): { label: string; body: ReactNode }[] => {
    switch (idx) {
      /* ── Section 0: Your financial picture ── */
      case 0:
        return [
          { label: "Family situation", body: (
           <div className="space-y-3">
            <div>
              <div className="space-y-3">
                <div>
                  <FieldLabel>Earning members</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    value={earningMembers}
                    onChange={(e) => setEarningMembers(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors placeholder:text-[12px]"
                  />
                </div>
                <div>
                  <FieldLabel>Dependents</FieldLabel>
                  <input
                    type="number"
                    min={0}
                    value={dependents}
                    onChange={(e) => setDependents(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors placeholder:text-[12px]"
                  />
                </div>
              </div>
            </div>
           </div>
          ) },
          { label: "Income & expenses", body: (
           <div className="space-y-3">
            <div>
              <FieldLabel>Annual income</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">Includes salary and regular income (e.g. rental income)</p>
              <TextInput value={annualIncome} onChange={setAnnualIncome} prefix="₹" placeholder="e.g. 50,00,000" />
            </div>
            <div>
              <FieldLabel>Annual expense</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">Excludes all debt obligations (e.g. loans)</p>
              <TextInput value={annualExpense} onChange={setAnnualExpense} prefix="₹" placeholder="e.g. 30,00,000" />
            </div>
           </div>
          ) },
          { label: "Income sources", body: (
           <div className="space-y-3">
            <div>
              <FieldLabel>What makes up your primary income?</FieldLabel>
              <div className="flex flex-wrap gap-x-2 gap-y-2.5 mt-1">
                {INCOME_SOURCE_OPTIONS.map((s) => (
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
              {primaryWealthSource.includes("Others") && (
                <div className="mt-2">
                  <TextInput value={wealthSourceOtherText} onChange={setWealthSourceOtherText} placeholder="Specify other income source" />
                </div>
              )}
            </div>
           </div>
          ) },
          { label: "Assets & liabilities", body: (
           <div className="space-y-3">
            <div>
              <FieldLabel>Cash &amp; debt</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">Bank balance, fixed deposits and bonds.</p>
              <TextInput value={investableAssets} onChange={setInvestableAssets} prefix="₹" placeholder="e.g. 42,00,000" />
            </div>
            <div>
              <FieldLabel>Equities / shares</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">Listed shares and equity funds you hold outside your mutual-fund portfolio.</p>
              <TextInput value={equityShares} onChange={setEquityShares} prefix="₹" placeholder="e.g. 8,00,000" />
            </div>
            <div>
              <FieldLabel>Regular monthly investment</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">Optional — SIPs or other recurring contributions you already have in flight.</p>
              <TextInput value={monthlyInvestment} onChange={setMonthlyInvestment} prefix="₹" placeholder="e.g. 25,000" />
            </div>
            <div>
              <FieldLabel>Other assets</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">Includes unlisted shares, gold and other assets. Excludes home / properties.</p>
              {otherAssets.map((asset, idx) => {
                const query = asset.name.trim().toLowerCase();
                const matches = OTHER_ASSET_SUGGESTIONS.filter(
                  (s) => s.toLowerCase() !== query && (query === "" || s.toLowerCase().includes(query)),
                );
                const showSuggestions = assetSuggestFor === idx && matches.length > 0;
                return (
                  <div key={idx} className="mb-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <label className="text-[12px] text-muted-foreground mb-0.5 block">Asset (description)</label>
                        <TextInput
                          value={asset.name}
                          onChange={(v) => updateOtherAsset(idx, "name", v)}
                          onFocus={() => setAssetSuggestFor(idx)}
                          onBlur={() => setAssetSuggestFor((cur) => (cur === idx ? null : cur))}
                          placeholder="e.g. Unlisted Shares"
                        />
                        {showSuggestions && (
                          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-card shadow-md">
                            {matches.map((s) => (
                              <button
                                key={s}
                                type="button"
                                // mousedown (not click) so the input's blur doesn't close the list first
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  updateOtherAsset(idx, "name", s);
                                  setAssetSuggestFor(null);
                                }}
                                className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted/60 transition-colors"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div><label className="text-[12px] text-muted-foreground mb-0.5 block">Amount</label><TextInput value={asset.value} onChange={(v) => updateOtherAsset(idx, "value", v)} prefix="₹" placeholder="e.g. 10,00,000" /></div>
                    </div>
                    {otherAssets.length > 1 && (
                      <button onClick={() => removeOtherAsset(idx)} className="mt-1 text-[10px] text-destructive hover:underline">Remove</button>
                    )}
                  </div>
                );
              })}
              <button onClick={addOtherAsset} className="flex items-center gap-1 text-xs text-accent hover:underline mt-1">
                <Plus className="h-3 w-3" /> Add another asset
              </button>
            </div>
            <div>
              <FieldLabel>Liabilities / debts</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">Excludes mortgage repayment</p>
              <TextInput value={liabilities} onChange={setLiabilities} prefix="₹" placeholder="e.g. 5,00,000" />
            </div>
           </div>
          ) },
          { label: "Property", body: (
           <div className="space-y-4">
            <div>
              <FieldLabel>Do you own a home?</FieldLabel>
              <p className="text-[10px] text-muted-foreground -mt-0.5 mb-2">
                Any residential property you own. Used for your net worth and to plan around your mortgage.
              </p>
              <Toggle value={ownsHome} onChange={setOwnsHome} labelA="No" labelB="Yes" />
            </div>

            {ownsHome && (
              <div className="space-y-3">
                {properties.map((prop, idx) => {
                  const updateProp = (field: keyof Property, val: string) => {
                    setProperties(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
                  };
                  return (
                    <div key={idx} className="relative rounded-xl border border-border bg-card p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs font-semibold text-foreground">
                          {properties.length > 1 ? `Property ${idx + 1}` : "Your home"}
                        </p>
                        {properties.length > 1 && (
                          <button
                            onClick={() => setProperties(prev => prev.filter((_, i) => i !== idx))}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove property"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Current market value</label>
                          <TextInput value={prop.value} onChange={(v) => updateProp("value", v)} prefix="₹" placeholder="e.g. 1.20 Cr" />
                        </div>

                        {/* Mortgage sub-group */}
                        <div className="rounded-lg bg-muted/30 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Home loan</p>
                          <p className="mb-2 text-[10px] text-muted-foreground">Leave blank if it's fully paid off.</p>
                          <div className="space-y-3">
                            <div>
                              <label className="text-[12px] text-muted-foreground mb-0.5 block">Outstanding balance</label>
                              <TextInput value={prop.mortgage} onChange={(v) => updateProp("mortgage", v)} prefix="₹" placeholder="e.g. 45,00,000" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[12px] text-muted-foreground mb-0.5 block">Monthly EMI</label>
                                <TextInput value={prop.monthlyRepayment} onChange={(v) => updateProp("monthlyRepayment", v)} prefix="₹" placeholder="e.g. 35,000" />
                              </div>
                              <div>
                                <label className="text-[12px] text-muted-foreground mb-0.5 block">Ends in (year)</label>
                                <TextInput
                                  value={prop.mortgageEndDate}
                                  onChange={(v) => updateProp("mortgageEndDate", v.replace(/[^\d]/g, "").slice(0, 4))}
                                  placeholder="e.g. 2042"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={() => setProperties(prev => [...prev, { value: "", mortgage: "", monthlyRepayment: "", yearPurchased: "", mortgageEndDate: "", lastPaymentDate: "" }])}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent/5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add another property
                </button>
              </div>
            )}
           </div>
          ) },
          { label: "Planned large expenses", body: (
           <div className="space-y-3">
            <div>
              <FieldLabel>Planned large expenses</FieldLabel>
              {plannedExpenses.map((expense, idx) => (
                <div key={idx} className="mb-3">
                  <div className="space-y-2.5">
                    <div><label className="text-[12px] text-muted-foreground mb-0.5 block">Description</label><TextInput value={expense.description} onChange={(v) => { const next = [...plannedExpenses]; next[idx] = { ...next[idx], description: v }; setPlannedExpenses(next); }} placeholder="e.g. Wedding" /></div>
                    <div><label className="text-[12px] text-muted-foreground mb-0.5 block">Year</label><TextInput value={expense.year} onChange={(v) => { const next = [...plannedExpenses]; next[idx] = { ...next[idx], year: v }; setPlannedExpenses(next); }} placeholder="e.g. 2026" /></div>
                    <div>
                      <label className="text-[12px] text-muted-foreground mb-0.5 block">Amount</label>
                      <TextInput value={expense.amount} onChange={(v) => { const next = [...plannedExpenses]; next[idx] = { ...next[idx], amount: v }; setPlannedExpenses(next); }} prefix="₹" placeholder="e.g. 25L" />
                      {(() => { const n = toNum(expense.amount); return n != null && n >= 100000 ? <p className="mt-1 text-[11px] font-medium text-muted-foreground">= {formatINR(n)}</p> : null; })()}
                    </div>
                  </div>
                  {expense.description.trim() && (
                    <div className="mt-2 rounded-lg border border-border bg-card/50 px-3 py-2">
                      <p className="text-[10px] text-muted-foreground mb-1">Would you like to add this as a goal so we can plan for it?</p>
                      <Toggle value={expense.addAsGoal} onChange={(v) => {
                        const next = [...plannedExpenses];
                        next[idx] = { ...next[idx], addAsGoal: v };
                        setPlannedExpenses(next);
                        if (v && expense.description.trim()) {
                          const goalName = expense.description.trim();
                          if (!selectedObjectives.includes(goalName)) {
                            setSelectedObjectives((prev) => [...prev, goalName]);
                            setCustomGoals((prev) => prev.includes(goalName) ? prev : [...prev, goalName]);
                            updateGoalDetail(goalName, {
                              amount: expense.amount,
                              year: expense.year,
                            });
                          }
                        }
                      }} labelA="No" labelB="Yes" />
                    </div>
                  )}
                  {plannedExpenses.length > 1 && (
                    <button onClick={() => setPlannedExpenses(plannedExpenses.filter((_, i) => i !== idx))} className="mt-1.5 text-[10px] text-destructive hover:underline">Remove</button>
                  )}
                </div>
              ))}
              <button onClick={() => setPlannedExpenses([...plannedExpenses, { description: "", year: "", amount: "", addAsGoal: false }])} className="flex items-center gap-1 text-xs text-accent hover:underline mt-1">
                <Plus className="h-3 w-3" /> Add another expense
              </button>
            </div>
           </div>
          ) },
          { label: "Expected large income", body: (
           <div className="space-y-3">
            <div>
              <FieldLabel>Expected large income</FieldLabel>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug">e.g. bonus, inheritance, property sale</p>
              {largeIncomes.map((inc, idx) => {
                const updateInc = (field: keyof LargeIncome, val: string) => {
                  setLargeIncomes((prev) =>
                    prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)),
                  );
                };
                return (
                  <div key={idx} className="mb-3">
                    <div className="space-y-2.5">
                      <div>
                        <label className="text-[12px] text-muted-foreground mb-0.5 block">Description</label>
                        <TextInput
                          value={inc.description}
                          onChange={(v) => updateInc("description", v)}
                          placeholder="e.g. Bonus"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] text-muted-foreground mb-0.5 block">Year</label>
                        <TextInput
                          value={inc.year}
                          onChange={(v) => updateInc("year", v)}
                          placeholder="e.g. 2026"
                        />
                      </div>
                      <div>
                        <label className="text-[12px] text-muted-foreground mb-0.5 block">Amount</label>
                        <TextInput
                          value={inc.amount}
                          onChange={(v) => updateInc("amount", v)}
                          prefix="₹"
                          placeholder="e.g. 25,00,000"
                        />
                        {(() => { const n = toNum(inc.amount); return n != null && n >= 100000 ? <p className="mt-1 text-[11px] font-medium text-muted-foreground">= {formatINR(n)}</p> : null; })()}
                      </div>
                    </div>
                    {largeIncomes.length > 1 && (
                      <button
                        onClick={() =>
                          setLargeIncomes((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="mt-1.5 text-[10px] text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                onClick={() =>
                  setLargeIncomes((prev) => [
                    ...prev,
                    { description: "", year: "", amount: "", currency: "INR" },
                  ])
                }
                className="flex items-center gap-1 text-xs text-accent hover:underline mt-1"
              >
                <Plus className="h-3 w-3" /> Add another income
              </button>
            </div>
           </div>
          ) },
        ];

      /* ── Section 1: What are you trying to achieve? ── */
      case 1:
        return [
          { label: "Select your goals", body: (
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
                  className="flex-1 rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors placeholder:text-muted-foreground/50"
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
          </div>
          ) },
          { label: "Goal details", body: (
          <div className="space-y-4">
            {selectedObjectives.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No goals selected yet — go back a step to pick some.</p>
            )}
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
                  <div><label className="text-[12px] text-muted-foreground mb-0.5 block">Amount</label><TextInput value={detail.amount} onChange={(v) => updateGoalDetail(obj, { amount: v })} prefix="₹" placeholder="e.g. 50,00,000" /></div>
                  <div><label className="text-[12px] text-muted-foreground mb-0.5 block">Expected year</label><TextInput value={detail.year} onChange={(v) => updateGoalDetail(obj, { year: v })} placeholder="e.g. 2035" /></div>
                  <div>
                    <label className="text-[12px] text-muted-foreground mb-0.5 block">Value type</label>
                    <div className="flex gap-2 mt-1">
                      <Chip label="Present Value" active={detail.notes === "Present Value"} onClick={() => updateGoalDetail(obj, { notes: "Present Value" })} />
                      <Chip label="Future Value" active={detail.notes === "Future Value"} onClick={() => updateGoalDetail(obj, { notes: "Future Value" })} />
                    </div>
                  </div>
                  {obj === "Home purchase" && (
                    <>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[12px] text-muted-foreground mb-0.5 block">Down payment</label>
                          <TextInput
                            value={detail.downPaymentPct}
                            onChange={(v) => updateGoalDetail(obj, { downPaymentPct: v })}
                            placeholder="e.g. 20"
                            prefix="%"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] text-muted-foreground mb-0.5 block">Loan tenure (years)</label>
                          <TextInput
                            value={detail.loanTenureYears}
                            onChange={(v) => updateGoalDetail(obj, { loanTenureYears: v })}
                            placeholder="e.g. 20"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {obj === "Child's education" && (
                    <div>
                      <label className="text-[12px] text-muted-foreground mb-0.5 block">Studying abroad?</label>
                      <div className="mt-1 flex gap-2">
                        <Chip
                          label="No"
                          active={!detail.educationAbroad}
                          onClick={() => updateGoalDetail(obj, { educationAbroad: false })}
                        />
                        <Chip
                          label="Yes"
                          active={detail.educationAbroad}
                          onClick={() => updateGoalDetail(obj, { educationAbroad: true })}
                        />
                      </div>
                    </div>
                  )}
                  {INFLATION_OBJECTIVES.has(obj) && (() => {
                    const suggested = suggestedInflationFor(obj, detail.educationAbroad);
                    const current = detail.inflationRate || suggested;
                    return (
                      <div>
                        <label className="text-[12px] text-muted-foreground mb-0.5 block">Inflation rate</label>
                        <select
                          value={current}
                          onChange={(e) => updateGoalDetail(obj, { inflationRate: e.target.value })}
                          className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors appearance-none"
                        >
                          {INFLATION_OPTIONS.map((rate) => (
                            <option key={rate} value={rate}>
                              {rate}%{rate === suggested ? " — Prozpr's suggestion" : ""}
                            </option>
                          ))}
                        </select>
                        <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                          Prozpr suggests {suggested}% for this goal — adjust if you have a better
                          number.
                        </p>
                      </div>
                    );
                  })()}
                </motion.div>
              );
            })}
          </div>
          ) },
        ];

      /* ── Section 2: Your investment preference and focus ── */
      case 2:
        return [
          { label: "Investment horizon", body: (
          <div className="space-y-4">
            <div>
              <FieldLabel>Investment horizon</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {HORIZON_OPTIONS.map((h) => (
                  <Chip key={h} label={h} active={investmentHorizon === h} onClick={() => setInvestmentHorizon(h)} />
                ))}
              </div>
            </div>
          </div>
          ) },
          { label: "Behavioural risk", body: (
          <div className="space-y-4">
            {([
              { label: "How would you describe your investment experience?", options: BEHAV_Q1_OPTIONS, value: behavQ1, setter: setBehavQ1 },
              { label: "How would you describe your investment focus?", options: BEHAV_Q2_OPTIONS, value: behavQ2, setter: setBehavQ2 },
              { label: "If in the current year the value of your investments declines by ~20%, what would you do?", options: BEHAV_Q3_OPTIONS, value: behavQ3, setter: setBehavQ3 },
            ] as const).map((q, qi) => (
              <div key={q.label} className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="mb-3 flex items-start gap-2 text-[14px] font-semibold text-foreground leading-snug">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-wealth-navy text-[11px] font-bold text-primary-foreground">
                    {qi + 1}
                  </span>
                  <span>{q.label}</span>
                </p>
                <div className="space-y-2">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => q.setter(o)}
                      className={`w-full text-left rounded-xl px-4 py-3 text-xs font-medium border transition-all ${
                        q.value === o
                          ? "bg-accent text-accent-foreground border-accent"
                          : "bg-card text-foreground border-border hover:border-accent/40"
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          ) },
        ];

      /* ── Section 3: Tax details (India) ── */
      case 3:
        return [
          { label: "Marginal tax rate", body: (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-1 mb-1">
                <label className="block text-[15px] font-medium text-foreground leading-snug">
                  What is your marginal tax rate?
                </label>
                <button
                  type="button"
                  onClick={() => setShowMarginalInfo((v) => !v)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="About marginal tax rate"
                >
                  <Info className="h-3 w-3" />
                </button>
              </div>
              <p className="text-[12.5px] text-muted-foreground -mt-0.5 mb-2 leading-snug.5">
                Your marginal tax rate is the tax rate applied to your highest slab of income. This helps us recommend tax-efficient investments.
              </p>
              {showMarginalInfo && (
                <div className="mb-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
                  <p className="text-[11px] text-foreground leading-relaxed">
                    Example: if your taxable income is ₹13L and falls in the 20% slab, your marginal tax rate is 20% — the rate paid on your last rupee earned. Not the same as your average tax rate.
                  </p>
                </div>
              )}
              <select
                value={incomeTaxRate}
                onChange={(e) => setIncomeTaxRate(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors appearance-none"
              >
                <option value="">Select your slab</option>
                {MARGINAL_TAX_RATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          ) },
          { label: "Tax regime", body: (
          <div className="space-y-4">
            <div>
              <FieldLabel>Which tax regime do you follow?</FieldLabel>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: "old" as const,
                      label: "Old Regime",
                      helper:
                        "Allows deductions under 80C, 80D, HRA, LTA, home loan interest, etc.",
                    },
                    {
                      id: "new" as const,
                      label: "New Regime",
                      helper:
                        "Lower tax rates but most deductions and exemptions are not available. Default regime from FY 2023-24.",
                    },
                  ]
                ).map((r) => {
                  const selected = taxRegime === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setTaxRegime(r.id)}
                      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
                        selected
                          ? "border-accent bg-accent/5"
                          : "border-border bg-card hover:border-accent/40"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            selected ? "border-accent" : "border-muted-foreground/40"
                          }`}
                        >
                          {selected && (
                            <span className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{r.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {r.helper}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowRegimeInfo((v) => !v)}
                className="mt-2 text-[11px] font-medium text-accent hover:underline"
              >
                Not sure which regime you're on? Learn more
              </button>
              {showRegimeInfo && (
                <div className="mt-2 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
                  <p className="text-[11px] text-foreground leading-relaxed">
                    <span className="font-semibold">Old Regime</span> lets you claim deductions (80C investments, HRA, home loan interest, medical insurance) but uses higher tax rates. <span className="font-semibold">New Regime</span> has lower rates and a higher basic exemption (₹3L) but strips out most deductions. Salaried taxpayers can switch between the two each year; business/professional income must stick with their chosen regime for at least five years.
                  </p>
                </div>
              )}
            </div>
          </div>
          ) },
        ];

      default:
        return [];
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
          <h1 className="text-lg font-semibold text-foreground">Complete Your Investment Profile</h1>
          {openSection === -1 && (
            <p className="text-[11px] text-muted-foreground">Takes 10–15 minutes · We've pre-filled what we already know</p>
          )}
        </div>
      </div>

      {openSection === -1 ? (
        <>
          {/* Overall progress */}
          <div className="px-5 pt-3 pb-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground font-medium">Your profile</span>
              <span className="text-[11px] text-muted-foreground">{confirmedCount}/{SECTION_TITLES.length} confirmed</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: "hsl(var(--wealth-navy))" }} initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.5 }} />
            </div>
          </div>

          {/* Section cards — stacked vertically, tap one to open it */}
          <div className="px-5 pt-2 pb-3 flex flex-col gap-3.5">
            {SECTION_TITLES.map((title, idx) => {
              const status = statuses[idx];
              const groups = sectionGroups(idx);
              const meta = SECTION_META[idx];
              const isConfirmed = status === "confirmed";
              return (
                <motion.button
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.06, duration: 0.25 }}
                  onClick={() => openSectionCard(idx)}
                  className="relative w-full overflow-hidden rounded-2xl border bg-card p-5 text-left shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
                  style={{ borderColor: isConfirmed ? "hsl(var(--wealth-navy) / 0.35)" : "hsl(var(--border))" }}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon tile */}
                    <span
                      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: isConfirmed ? "hsl(var(--wealth-navy))" : "hsl(var(--wealth-navy) / 0.08)",
                        color: isConfirmed ? "hsl(var(--primary-foreground))" : "hsl(var(--wealth-navy))",
                      }}
                    >
                      <meta.Icon className="h-5 w-5" strokeWidth={1.8} />
                      {isConfirmed && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-wealth-green text-white">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[15px] font-semibold text-foreground leading-snug">{title}</p>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      </div>
                      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{meta.description}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                        <span className="text-[12px] text-muted-foreground mb-0.5 block">
                          {idx === 1
                            ? `Opens Goal planning · ${meta.estimate}`
                            : `${groups.length} ${groups.length === 1 ? "step" : "steps"} · ${meta.estimate}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Completion strip along the bottom */}
                  <div className="absolute inset-x-0 bottom-0 h-[3px] bg-muted/60">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: isConfirmed ? "100%" : status === "in_progress" ? "35%" : "0%",
                        backgroundColor: "hsl(var(--wealth-navy))",
                      }}
                    />
                  </div>
                </motion.button>
              );
            })}
          </div>
        </>
      ) : (
        (() => {
          const groups = sectionGroups(openSection);
          const total = groups.length;
          const gi = Math.min(groupIndex, total - 1);
          const group = groups[gi];
          const isLastGroup = gi >= total - 1;
          const SIcon = SECTION_META[openSection].Icon;
          return (
            <div className="px-5 pb-32">
              {/* Section identity */}
              <div className="pt-3 pb-3 flex items-center gap-3">
                <button
                  onClick={() => { setOpenSection(-1); setGroupIndex(0); }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
                  aria-label="Back to sections"
                >
                  <ChevronLeft className="h-4 w-4 text-foreground" />
                </button>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "hsl(var(--wealth-navy) / 0.08)", color: "hsl(var(--wealth-navy))" }}
                >
                  <SIcon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-foreground leading-tight truncate">
                    {SECTION_TITLES[openSection]}
                  </p>
                  <p className="text-[12px] text-muted-foreground mb-0.5 block">
                    Step {gi + 1} of {total} · {SECTION_META[openSection].estimate}
                  </p>
                </div>
              </div>

              {/* Segmented step progress — one pill per question group */}
              <div className="flex gap-1.5 pb-4">
                {groups.map((_, i) => (
                  <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
                      initial={false}
                      animate={{ width: i <= gi ? "100%" : "0%" }}
                      transition={{ duration: 0.25 }}
                    />
                  </div>
                ))}
              </div>

              {/* Current question group */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${openSection}-${gi}`}
                  initial={{ opacity: 0, x: 32 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -32 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  <h2 className="mb-4 text-lg font-semibold text-foreground leading-snug">{group.label}</h2>
                  <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
                    {group.body}
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Fixed step nav */}
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border px-5 py-4">
                <div className="max-w-md mx-auto flex items-center gap-3">
                  {gi > 0 && (
                    <button
                      onClick={() => setGroupIndex((i) => Math.max(0, i - 1))}
                      disabled={saving}
                      className="flex items-center justify-center gap-1 rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </button>
                  )}
                  <button
                    disabled={saving}
                    onClick={async () => {
                      if (saving) return;
                      if (isLastGroup) {
                        await confirmSection(openSection, gi);
                        return;
                      }
                      // Untouched step → just advance, no API call (no lag / spinner).
                      if (!isGroupDirty(openSection, gi)) {
                        setGroupIndex((i) => i + 1);
                        return;
                      }
                      // Persist this step before advancing; only move on if it saved.
                      setSaving(true);
                      const ok = await persistGroup(openSection, gi);
                      setSaving(false);
                      if (ok) setGroupIndex((i) => i + 1);
                    }}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold text-primary-foreground transition-all active:scale-[0.98] ${saving ? "cursor-wait opacity-80" : "hover:opacity-90"}`}
                    style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
                  >
                    {saving ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                        Saving…
                      </>
                    ) : (
                      <>
                        Save and continue
                        <Check className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
                  Your answers are saved as you go — pick up where you left off anytime
                </p>
              </div>
            </div>
          );
        })()
      )}

      {/* Bottom CTA — only on the section-card list (the step view has its own nav) */}
      {openSection === -1 && (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-sm border-t border-border px-5 py-4">
        <div className="max-w-md mx-auto">
          <button
            disabled={!allConfirmed}
            onClick={() => {
              toast.success("Generating your Investment Policy Statement…");
              navigate("/profile/ips");
            }}
            style={allConfirmed ? { backgroundColor: "hsl(var(--wealth-navy))" } : undefined}
            className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${allConfirmed ? "text-primary-foreground hover:opacity-90" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
          >
            Generate My Investment Policy Statement →
          </button>
          <p className="text-[10px] text-center text-muted-foreground mt-1.5">Your answers are saved automatically</p>
        </div>
      </div>
      )}
    </div>
  );
};

export default CompleteProfile;
