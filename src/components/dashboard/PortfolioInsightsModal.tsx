import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  getCashflowLatest,
  getPortfolioInsights,
  getPortfolioTwr,
  getRebalancingRunDetail,
  listRebalancingRuns,
  type PortfolioDetail,
  type PortfolioInsightsResponse,
  type RebalancingAssetClassBreakdown,
  type TwrSeriesResponse,
} from "@/lib/api";
import {
  buildPortfolioGuide,
  type Finding,
  type FindingTone,
  type GuideAction,
} from "@/lib/portfolioGuide";
import { rebaseTwr, windowStartIndex } from "@/lib/twr";

const HAIRLINE = "hsl(var(--hairline))";
// The app's premium gold — same hex the Discover cards and the profile-unlock
// rings use, so "gold" means one thing across the product. Chrome only: step
// badges, rules, the header wash. Never encodes a data value.
const GOLD = "#D4A868";
const GOLD_ON = "#2D1F05";
const GOLD_BORDER = "rgba(212, 168, 104, 0.45)";
const GOLD_TINT = "rgba(212, 168, 104, 0.06)";
const GOLD_TINT_STRONG = "rgba(212, 168, 104, 0.16)";

const POSITIVE = "hsl(var(--wealth-green))";
const NEGATIVE = "hsl(var(--destructive))";

// ── Section shell ───────────────────────────────────────────────────────────

function Section({
  id,
  step,
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  id: string;
  /** Shown in the gold step badge and read out by screen readers. */
  step: number;
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[14px] overflow-hidden transition-colors"
      style={{
        // Gold only asserts itself on the open section, so the accent marks where
        // you are instead of shouting from both at once.
        border: `1px solid ${open ? GOLD_BORDER : HAIRLINE}`,
        backgroundColor: open ? GOLD_TINT : undefined,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-left"
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors"
          style={
            open
              ? { backgroundColor: GOLD, color: GOLD_ON }
              : { backgroundColor: GOLD_TINT_STRONG, color: GOLD }
          }
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-foreground">
            <span className="sr-only">{`Section ${step}: `}</span>
            {title}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="inline-flex shrink-0"
        >
          <ChevronDown className="h-4 w-4" style={{ color: open ? GOLD : undefined }} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-panel`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="bg-card px-3 pb-3"
              style={{ borderTop: `1px solid ${open ? GOLD_BORDER : HAIRLINE}` }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── 1. Where you stand ──────────────────────────────────────────────────────

const TONE_STYLE: Record<
  FindingTone,
  { label: string; color: string; tint: string; Icon: typeof CircleCheck }
> = {
  good: {
    label: "Working well",
    color: POSITIVE,
    tint: "hsl(var(--wealth-green) / 0.10)",
    Icon: CircleCheck,
  },
  watch: {
    label: "Worth watching",
    color: GOLD,
    tint: GOLD_TINT_STRONG,
    Icon: CircleAlert,
  },
  concern: {
    label: "Concerns",
    color: NEGATIVE,
    tint: "hsl(var(--destructive) / 0.10)",
    Icon: AlertTriangle,
  },
};

const TONE_ORDER: FindingTone[] = ["good", "watch", "concern"];

function StandingSection({ findings, loading }: { findings: Finding[]; loading: boolean }) {
  if (loading) {
    return <p className="py-8 text-center text-[12px] text-muted-foreground">Reading your portfolio…</p>;
  }
  if (findings.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        Not enough history yet to judge how you're doing — import a statement and run your plan.
      </p>
    );
  }

  return (
    <div className="space-y-3 pt-3">
      {TONE_ORDER.map((tone) => {
        const group = findings.filter((f) => f.tone === tone);
        if (group.length === 0) return null;
        const style = TONE_STYLE[tone];
        return (
          <div key={tone}>
            <div className="mb-1.5 flex items-center gap-1.5">
              <style.Icon className="h-3.5 w-3.5 shrink-0" style={{ color: style.color }} />
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: style.color }}>
                {style.label}
              </p>
              <span className="text-[11px] font-semibold text-muted-foreground/60 tabular-nums">
                {group.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: style.tint, border: `1px solid ${HAIRLINE}` }}
                >
                  <p className="text-[12.5px] font-semibold leading-snug text-foreground">{f.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{f.detail}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 2. What to do next ──────────────────────────────────────────────────────

function ActionsSection({
  actions,
  loading,
  onNavigate,
}: {
  actions: GuideAction[];
  loading: boolean;
  onNavigate: (to: string) => void;
}) {
  if (loading) {
    return <p className="py-8 text-center text-[12px] text-muted-foreground">Working out your next steps…</p>;
  }
  if (actions.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] leading-relaxed text-muted-foreground">
        Nothing needs doing right now. We'll flag it here when something does.
      </p>
    );
  }

  return (
    <div className="pt-3">
      <p className="mb-2.5 text-[11px] leading-snug text-muted-foreground">
        Most impactful first — working down this list in order does the most good for the least tax.
      </p>
      <ol className="space-y-2">
        {actions.map((a, i) => (
          <li
            key={a.title}
            className="relative rounded-xl px-3 py-3"
            style={{ border: `1px solid ${HAIRLINE}` }}
          >
            <div className="flex items-start gap-2.5">
              {/* The number is the running order, which is the point of the list. */}
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{ backgroundColor: GOLD, color: GOLD_ON }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold leading-snug text-foreground">{a.title}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{a.why}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: GOLD_TINT_STRONG, color: GOLD }}
                  >
                    {a.when}
                  </span>
                  {a.cta && (
                    <button
                      type="button"
                      onClick={() => onNavigate(a.cta!.to)}
                      className="inline-flex items-center gap-0.5 text-[11.5px] font-semibold text-primary hover:underline"
                    >
                      {a.cta.label}
                      <ArrowRight className="h-3 w-3" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

type SectionId = "standing" | "actions";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Already loaded by the dashboard — feeds the gain figures in the findings. */
  portfolio: PortfolioDetail | null;
}

const PortfolioInsightsModal = ({ open, onClose, portfolio }: Props) => {
  const navigate = useNavigate();
  const [openSection, setOpenSection] = useState<SectionId | null>("standing");
  const [twr, setTwr] = useState<TwrSeriesResponse | null>(null);
  const [twrLoading, setTwrLoading] = useState(false);
  const [insights, setInsights] = useState<PortfolioInsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  /** Current-vs-target split and goal gap — what turns findings into actions. */
  const [breakdown, setBreakdown] = useState<RebalancingAssetClassBreakdown | null>(null);
  const [goalShortfall, setGoalShortfall] = useState<number | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTwrLoading(true);
    setInsightsLoading(true);
    setPlanLoading(true);
    getPortfolioTwr()
      .then((d) => { if (!cancelled) setTwr(d); })
      .catch(() => { if (!cancelled) setTwr(null); })
      .finally(() => { if (!cancelled) setTwrLoading(false); });
    getPortfolioInsights()
      .then((d) => { if (!cancelled) setInsights(d); })
      .catch(() => { if (!cancelled) setInsights(null); })
      .finally(() => { if (!cancelled) setInsightsLoading(false); });

    // Both are optional inputs to the guide: a user with no rebalancing run or no
    // cashflow plan simply gets fewer actions, never a fabricated one.
    Promise.all([
      listRebalancingRuns()
        .then((runs) => (runs.length ? getRebalancingRunDetail(runs[0].id) : null))
        .then((run) => run?.asset_class_breakdown ?? null)
        .catch(() => null),
      getCashflowLatest()
        .then((plan) => plan?.headline?.surplus_or_shortfall_today ?? null)
        .catch(() => null),
    ])
      .then(([acb, surplus]) => {
        if (cancelled) return;
        setBreakdown(acb);
        // The engine reports a surplus as positive; the guide wants the gap.
        setGoalShortfall(surplus == null ? null : -surplus);
      })
      .finally(() => { if (!cancelled) setPlanLoading(false); });

    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggle = (id: SectionId) => setOpenSection((cur) => (cur === id ? null : id));

  const today = useMemo(() => new Date(), []);
  /** Portfolio vs index over 1Y — the headline the guide judges performance on. */
  const benchmarkGapPct = useMemo(() => {
    if (!twr?.has_data) return null;
    const startIdx = windowStartIndex(twr.points.map((p) => p.date), "1Y", today);
    const r = rebaseTwr(twr.points, startIdx);
    return r.niftyTwr == null ? null : Math.round((r.twr - r.niftyTwr) * 10) / 10;
  }, [twr, today]);

  const guide = useMemo(
    () =>
      buildPortfolioGuide({
        insights,
        portfolio,
        benchmarkGapPct,
        assetClassBreakdown: breakdown,
        goalShortfallToday: goalShortfall,
      }),
    [insights, portfolio, benchmarkGapPct, breakdown, goalShortfall],
  );

  const guideLoading = insightsLoading || twrLoading || planLoading;

  const go = (to: string) => {
    onClose();
    navigate(to);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/45"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Portfolio insights"
            className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          >
            <div
              className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
              style={{
                maxHeight: "min(92dvh, 720px)",
                borderTop: "1px solid rgba(255,255,255,0.04)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-center gap-2.5 px-4 py-3"
                style={{
                  borderBottom: `1px solid ${GOLD_BORDER}`,
                  background: `linear-gradient(135deg, ${GOLD_TINT_STRONG} 0%, transparent 70%)`,
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: GOLD_TINT_STRONG }}
                >
                  <Sparkles className="h-4 w-4" strokeWidth={2} style={{ color: GOLD }} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-foreground">
                    Portfolio insights
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Where you stand, and what to do about it
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="-m-1.5 p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
                <Section
                  id="standing"
                  step={1}
                  title="Where you stand"
                  subtitle="What's working, what isn't, and what to worry about"
                  open={openSection === "standing"}
                  onToggle={() => toggle("standing")}
                >
                  <StandingSection findings={guide.findings} loading={guideLoading} />
                </Section>

                <Section
                  id="actions"
                  step={2}
                  title="What to do next"
                  subtitle={
                    guide.actions.length > 0
                      ? `${guide.actions.length} step${guide.actions.length === 1 ? "" : "s"}, most important first`
                      : "Your next steps, most important first"
                  }
                  open={openSection === "actions"}
                  onToggle={() => toggle("actions")}
                >
                  <ActionsSection actions={guide.actions} loading={guideLoading} onNavigate={go} />
                </Section>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default PortfolioInsightsModal;
