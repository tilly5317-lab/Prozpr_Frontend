import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Ban, CheckCheck, Layers, Scale, Sparkles, TrendingUp } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const GOLD = "#D4A868";

/**
 * Steps, in reading order. `n` is a string because the middle of the run
 * branches into 2a / 2b — a lump sum and a SIP do genuinely different things
 * with the money, and flattening them to "step 2" would hide that.
 */
const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "It picks the right approach for your money",
    body: "A lump sum and a SIP do different jobs, so they're treated differently. A lump sum fills the gaps: it goes wherever your portfolio has drifted furthest below its ideal. A SIP builds steadily: it follows the ideal mix for your nearest goal that isn't fully funded yet, with the same split every month.",
  },
  {
    n: "2a",
    title: "A lump sum repairs the gaps",
    body: "Adding money changes what your ideal portfolio looks like, so the plan is first recalculated to include your new deposit. Then each part of your portfolio is measured against that new ideal, and your money is split in proportion to how far behind each part is. Areas already at or above their ideal receive nothing — and, importantly, are never sold. If nothing is behind, the money simply follows your ideal proportions.",
  },
  {
    n: "2b",
    title: "A SIP follows your plan",
    body: "Your monthly amount is aimed at the nearest goal still being built — short-term first, then medium, then long — and split across investment categories in the same proportions as your ideal plan for that goal. The same split repeats every month, steadily moving you toward plan.",
  },
  {
    n: "3",
    title: "Funds are chosen from our recommended list",
    body: "Within each category, money goes to our top-ranked fund first. A sensible limit stops any single fund from swallowing too much of your deposit; anything above that limit flows to the next-best fund. This is why one category can sometimes be spread across two funds. For SIPs, there's one thoughtful extra: if you recently completed a rebalance, your SIP tops up the same funds that plan bought, so your monthly investment reinforces it rather than drifting elsewhere.",
  },
  {
    n: "4",
    title: "Everything is tidied and accounted for",
    body: "Each purchase is rounded to a clean amount. For a lump sum, any small remainder from rounding is added back to the largest purchase so your full deposit is put to work. And if any amount genuinely can't be placed, it's reported to you clearly — never silently dropped.",
  },
];

/** Numbered disc — takes a string so "2a" and "2b" render like any other step. */
const StepDot = ({ n }: { n: string }) => (
  <span
    className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums"
    style={{ backgroundColor: `${GOLD}26`, color: "#9A7B2E", border: `1px solid ${GOLD}66` }}
  >
    {n}
  </span>
);

/** Vertical run of rail between two blocks in the diagram. */
const Rail = ({ h = 14 }: { h?: number }) => (
  <span
    aria-hidden="true"
    className="mx-auto block w-px"
    style={{ height: h, backgroundColor: `${GOLD}cc` }}
  />
);

/** One step on the diagram's spine: gold disc, label, one-line summary. */
const RailStep = ({
  icon: Icon,
  label,
  summary,
  delay,
}: {
  icon: typeof Scale;
  label: string;
  summary: string;
  delay: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.28, delay }}
    className="flex gap-3"
  >
    <span
      className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: GOLD, color: "#2D1F05" }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
    </span>
    <div className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2">
      <p
        className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
        style={{ color: "#9A7B2E" }}
      >
        {label}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{summary}</p>
    </div>
  </motion.div>
);

/**
 * Bracket that splits the spine into two columns (and, flipped, merges them
 * back). Drawn as three rules rather than an SVG so it inherits the same colour
 * token as the rail and needs no viewBox maths.
 */
const Branch = ({ merge = false }: { merge?: boolean }) => (
  <div className="relative h-3.5" aria-hidden="true">
    <span
      className="absolute left-1/4 right-1/4 h-px"
      style={{ backgroundColor: `${GOLD}cc`, [merge ? "bottom" : "top"]: 0 }}
    />
    <span className="absolute left-1/4 top-0 h-3.5 w-px" style={{ backgroundColor: `${GOLD}cc` }} />
    <span className="absolute right-1/4 top-0 h-3.5 w-px" style={{ backgroundColor: `${GOLD}cc` }} />
  </div>
);

/**
 * The flow. Straight down the spine until the money's type matters, then a real
 * two-column split for 2a / 2b before rejoining — the branch is the whole point
 * of this process, so the diagram shows it rather than listing both paths.
 */
const FlowDiagram = () => (
  <section
    className="relative overflow-hidden rounded-2xl px-4 py-5"
    style={{
      background: `linear-gradient(160deg, ${GOLD}1f 0%, hsl(var(--card)) 55%, hsl(var(--card)) 100%)`,
      border: `1px solid ${GOLD}59`,
    }}
  >
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-center">
      <p className="text-[12px] font-semibold text-foreground">New money in</p>
      <p className="mt-0.5 text-[10.5px] text-muted-foreground">a monthly SIP or a one-off lump sum</p>
    </div>

    <Rail />
    <RailStep
      icon={Scale}
      label="Choose the approach"
      summary="A lump sum and a SIP do different jobs, so the money is aimed differently."
      delay={0}
    />
    <Branch />

    {/* 2a / 2b — the two things a deposit can be doing. */}
    <div className="grid grid-cols-2 gap-2">
      {[
        {
          key: "lump",
          icon: Layers,
          tag: "2a · Lump sum",
          title: "Repairs the gaps",
          body: "Goes where you've drifted furthest below ideal.",
        },
        {
          key: "sip",
          icon: TrendingUp,
          tag: "2b · SIP",
          title: "Follows your plan",
          body: "Same split each month, aimed at your nearest goal.",
        },
      ].map((b, i) => {
        const Icon = b.icon;
        return (
          <motion.div
            key={b.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.08 + i * 0.06 }}
            className="rounded-xl px-2.5 py-2"
            style={{ backgroundColor: `${GOLD}14`, border: `1px solid ${GOLD}59` }}
          >
            <div className="flex items-center gap-1">
              <Icon className="h-3 w-3 shrink-0" style={{ color: "#9A7B2E" }} strokeWidth={2.2} />
              <p
                className="truncate text-[9.5px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "#9A7B2E" }}
              >
                {b.tag}
              </p>
            </div>
            <p className="mt-1 text-[11.5px] font-semibold leading-tight text-foreground">
              {b.title}
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{b.body}</p>
          </motion.div>
        );
      })}
    </div>

    <Branch merge />
    <RailStep
      icon={Sparkles}
      label="Pick the funds"
      summary="Top-ranked fund in each category first, spilling to the next once a cap is hit."
      delay={0.2}
    />
    <Rail />
    <RailStep
      icon={CheckCheck}
      label="Tidy & account"
      summary="Amounts rounded, the remainder put to work, and anything unplaceable reported."
      delay={0.26}
    />
    <Rail />

    <div
      className="rounded-xl px-3 py-2.5 text-center"
      style={{ backgroundColor: `${GOLD}1f`, border: `1px solid ${GOLD}73` }}
    >
      <p className="text-[12px] font-semibold text-foreground">
        Buys only · no sales · no tax bill
      </p>
    </div>
  </section>
);

/**
 * Standalone explainer for the buy-side engine, shared by the SIP and Lump sum
 * tabs. Routed OUTSIDE `InvestLayout` for the same reason as the rebalancing
 * explainer: no InvestTabs entry matches it, so it carries its own back header.
 * `from` decides which tab the back arrow returns to.
 */
const InvestingHowItWorks = () => {
  const navigate = useNavigate();
  const from = new URLSearchParams(window.location.search).get("from");
  const backTo = from === "lumpsum" ? "/invest/lumpsum" : "/invest/sip";

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      <header className="flex items-center gap-2 px-5 pt-10 pb-2">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="text-lg font-semibold text-foreground">How it works</p>
      </header>

      <div className="space-y-4 px-5 pt-1">
        <div>
          <h1 className="text-[21px] font-semibold leading-tight tracking-tight text-foreground">
            How your new money gets invested
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            When you add money — a monthly SIP or a one-time lump sum — this process decides which
            funds to buy and how much into each. It only ever buys. It never sells, switches, or
            touches what you already hold; keeping your portfolio tidy is the separate rebalancing
            process.
          </p>
        </div>

        <FlowDiagram />

        <div className="space-y-2.5">
          {STEPS.map((step) => (
            <section key={step.n} className="rounded-2xl border border-border bg-card px-4 py-3.5">
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

        {/* Exclusions — a carve-out rather than a step, so it's styled apart. */}
        <section className="rounded-2xl border border-border bg-muted/30 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <h2 className="text-[13.5px] font-semibold leading-tight text-foreground">
              What never receives fresh money
            </h2>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Two things never receive fresh money: tax-saver (ELSS) funds, because of their lock-in,
            and direct stocks or PMS, because there's no fund to buy. Their share is redistributed
            across the rest.
          </p>
        </section>

        <p
          className="rounded-2xl px-4 py-3.5 text-[12.5px] font-medium leading-relaxed text-foreground"
          style={{ backgroundColor: `${GOLD}1a`, border: `1px solid ${GOLD}59` }}
        >
          The result: the same deposit always produces the same purchases, a lump sum repairs your
          portfolio's gaps, and a SIP quietly builds toward your next goal — all without ever
          triggering a sale or a tax bill.
        </p>
      </div>

      <BottomNav />
    </div>
  );
};

export default InvestingHowItWorks;
