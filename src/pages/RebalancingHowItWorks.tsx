import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Coins,
  Filter,
  ListChecks,
  Shield,
  type LucideIcon,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";

const GOLD = "#D4A868";

/**
 * The four things the engine is actually doing, in order. This is the diagram's
 * spine — a summary of the run, deliberately without step numbers on it, so it
 * reads as a shape rather than a numbered index. The prose below carries the
 * eight steps in full for anyone chasing a specific rule.
 */
const PHASES: {
  key: string;
  icon: LucideIcon;
  label: string;
  summary: string;
}[] = [
  {
    key: "protect",
    icon: Shield,
    label: "Protect",
    summary: "Good holdings stay put, and no single fund is allowed to dominate.",
  },
  {
    key: "filter",
    icon: Filter,
    label: "Filter",
    summary: "Trivial drifts and like-for-like swaps are dropped before they cost you.",
  },
  {
    key: "tax",
    icon: Coins,
    label: "Tax",
    summary: "Every sale is priced for tax, ordered cheapest-first, and offset with losses.",
  },
  {
    key: "output",
    icon: ListChecks,
    label: "Instruct",
    summary: "Every fund is backed by Pi reasoning designed by experts.",
  },
];

const STEPS: { n: number; title: string; body: string }[] = [
  {
    n: 1,
    title: "Your good funds are protected",
    body: "If you already hold a fund we recommend and it's of high quality, we don't sell it just because a marginally better option exists. Your existing money stays where it is; only new money is directed to our current top picks. This avoids pointless switching that would cost you tax without changing what you really own.",
  },
  {
    n: 2,
    title: "No single fund gets too big",
    body: "We limit how much of your portfolio flows into any one fund, so you're never overly dependent on a single fund manager. If you're already above that limit in a good fund, we don't force a sale — future investments simply go elsewhere until the balance corrects itself naturally.",
  },
  {
    n: 3,
    title: "Small drifts are left alone",
    body: "If a fund is only slightly off its target, we do nothing. Tiny corrections cost money and paperwork but deliver no real benefit. Only meaningful gaps trigger a trade. The exception: a fund that no longer meets our quality standards is exited fully, regardless of size.",
  },
  {
    n: 4,
    title: "We never swap like for like",
    body: "If the plan would sell one debt-style fund only to buy a very similar one, we cancel both sides. Swapping between near-identical funds changes nothing about your actual exposure but would trigger a real tax bill.",
  },
  {
    n: 5,
    title: "We calculate the tax picture first",
    body: "Before any sale is confirmed, we work out the gain or loss on every unit involved — separating recently bought units from those held long enough to qualify for lower tax rates.",
  },
  {
    n: 6,
    title: "Sales happen in the cheapest-tax order",
    body: "Funds that must go (quality failures) are sold first. Beyond that, we sell only as much as needed to fund your purchases, starting with whatever costs you the least in tax — and routine trims only ever touch units that qualify for the lower long-term rate. Short-term tax is never triggered just to tidy up your portfolio. And we never spend money you don't have: if the cash raised falls short, purchases are scaled down to match.",
  },
  {
    n: 7,
    title: "Losses are put to work",
    body: "Any losses — from this rebalance or carried forward — are used to offset gains, reducing your overall tax bill.",
  },
  {
    n: 8,
    title: "You get a clear instruction list",
    body: "Every fund ends with a plain action — buy, sell, exit, or leave alone — and an honest reason for it. Tax-locked holdings like ELSS are shown but never touched.",
  },
];

/** Small numbered disc marking each step in the prose list below the diagram. */
const StepDot = ({ n }: { n: number }) => (
  <span
    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold tabular-nums"
    style={{ backgroundColor: `${GOLD}26`, color: "#9A7B2E", border: `1px solid ${GOLD}66` }}
  >
    {n}
  </span>
);

/**
 * The flow diagram: a single vertical rail from what you hold today down to the
 * instruction list, with the four phases hung off it. Deliberately one column —
 * on a phone a branching flowchart either scrolls sideways or shrinks past
 * legibility, and this process genuinely is sequential.
 */
const FlowDiagram = () => (
  <section
    className="relative overflow-hidden rounded-2xl px-4 py-5"
    style={{
      background: `linear-gradient(160deg, ${GOLD}1f 0%, hsl(var(--card)) 55%, hsl(var(--card)) 100%)`,
      border: `1px solid ${GOLD}59`,
    }}
  >
    {/* Input */}
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-center">
      <p className="text-[12px] font-semibold text-foreground">What you hold today</p>
      <p className="mt-0.5 text-[10.5px] text-muted-foreground">vs. your ideal plan</p>
    </div>

    <div className="relative mt-1 pl-1">
      {/* The rail every phase hangs off. */}
      <span
        aria-hidden="true"
        className="absolute left-[15px] top-0 bottom-0 w-px"
        style={{ background: `linear-gradient(180deg, ${GOLD}00, ${GOLD}cc 12%, ${GOLD}cc 88%, ${GOLD}00)` }}
      />
      {PHASES.map((phase, i) => {
        const Icon = phase.icon;
        return (
          <motion.div
            key={phase.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: i * 0.06 }}
            className="relative flex gap-3 py-2.5"
          >
            <span
              className="relative z-10 mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: GOLD, color: "#2D1F05" }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2">
              <p
                className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "#9A7B2E" }}
              >
                {phase.label}
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                {phase.summary}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>

    {/* Output */}
    <div
      className="rounded-xl px-3 py-2.5 text-center"
      style={{ backgroundColor: `${GOLD}1f`, border: `1px solid ${GOLD}73` }}
    >
      <p className="text-[12px] font-semibold text-foreground">
        Fewer trades · lower tax · closer to plan
      </p>
    </div>
  </section>
);

/**
 * Standalone explainer for the rebalancing engine, reached from the Rebalancing
 * page. Deliberately routed OUTSIDE `InvestLayout`: the Rebalancing / SIP /
 * Lump sum toggle would render with no tab matching this page, so it gets its
 * own back header instead.
 */
const RebalancingHowItWorks = () => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      <header className="flex items-center gap-2 px-5 pt-10 pb-2">
        <button
          type="button"
          onClick={() => navigate("/invest/rebalance-explanation")}
          className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="Back to rebalancing"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="text-lg font-semibold text-foreground">How it works</p>
      </header>

      <div className="space-y-4 px-5 pt-1">
        <div>
          <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-foreground">
            How your portfolio gets rebalanced
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            Rebalancing compares what you currently hold against your ideal plan, then works out
            the smallest, most tax-efficient set of trades to close the gap. It runs in eight
            steps.
          </p>
        </div>

        <FlowDiagram />

        <div className="space-y-2.5">
          {STEPS.map((step) => (
            <section
              key={step.n}
              className="rounded-2xl border border-border bg-card px-4 py-3.5"
            >
              <div className="flex items-center gap-2">
                <StepDot n={step.n} />
                <h2 className="text-[13.5px] font-semibold leading-tight text-foreground">
                  {step.title}
                </h2>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </section>
          ))}
        </div>

        <p
          className="rounded-2xl px-4 py-3.5 text-[12.5px] font-medium leading-relaxed text-foreground"
          style={{ backgroundColor: `${GOLD}1a`, border: `1px solid ${GOLD}59` }}
        >
          The result: fewer trades, lower tax, and a portfolio steadily moved toward its ideal
          shape.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default RebalancingHowItWorks;
