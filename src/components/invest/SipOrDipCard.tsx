import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Scale } from "lucide-react";

const GOLD = "#D4A868";

/**
 * "Should I SIP, or hold the cash to buy a dip?" — the question that comes up
 * whenever spare cash is limited, since the same rupee can't do both.
 *
 * Rendered on the SIP and Lump sum tabs. Collapsed it shows only the verdict;
 * expanded it gives the reasoning and a rule for running both at once. The
 * `variant` changes the framing to match the tab it sits on — the advice is the
 * same either way, but a user on the Lump sum tab already has cash in hand.
 */
type Variant = "sip" | "lumpsum";

const HEADLINE: Record<Variant, { verdict: string; lede: string }> = {
  sip: {
    verdict: "Start the SIP. Buy dips only with money you set aside for it.",
    lede: "Waiting for a better price usually costs more than it saves.",
  },
  lumpsum: {
    verdict: "Deploy it now. Waiting for a dip is a second bet, not a safer one.",
    lede: "For money you won't need for years, time in beats a better entry.",
  },
};

/** One side of the comparison. */
const OPTIONS: {
  key: string;
  title: string;
  tag: string;
  recommended: boolean;
  points: string[];
}[] = [
  {
    key: "sip",
    title: "SIP every month",
    tag: "Our default",
    recommended: true,
    points: [
      "Compounds from the month it goes in.",
      "A falling market buys more units automatically.",
      "No call to make, ever.",
    ],
  },
  {
    key: "dip",
    title: "Hold cash for dips",
    tag: "Needs two right calls",
    recommended: false,
    points: [
      "You must be right on when to wait and when to buy.",
      "Idle cash earns close to nothing meanwhile.",
      "The dip often lands above today's price anyway.",
    ],
  },
];

/** The rule for running both when the spare cash is limited. One line each —
    this is guidance to act on, not an essay. */
const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "1",
    title: "Fund the SIP first",
    body: "Commit what you can sustain in a bad month, not a good one.",
  },
  {
    n: "2",
    title: "Park the rest in liquid funds",
    body: "Only what's spare after your emergency fund — liquid funds earn while it waits, and stay ready.",
  },
  {
    n: "3",
    title: "Deploy on a rule, not a feeling",
    body: "Buy where your rebalancing plan shows you underweight, in two or three tranches.",
  },
];

const SipOrDipCard = ({ variant }: { variant: Variant }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const copy = HEADLINE[variant];

  return (
    <section
      className="mb-3 overflow-hidden rounded-2xl"
      style={{
        background: `linear-gradient(150deg, ${GOLD}1a 0%, hsl(var(--card)) 60%, hsl(var(--card)) 100%)`,
        border: `1px solid ${GOLD}59`,
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-4 py-3.5 text-left"
      >
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${GOLD}2e`, color: "#9A7B2E" }}
        >
          <Scale className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "#9A7B2E" }}
          >
            SIP, or wait for a dip?
          </p>
          <p className="mt-1 text-[13px] font-semibold leading-snug text-foreground">
            {copy.verdict}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{copy.lede}</p>
          <span className="mt-1.5 inline-block text-[11px] font-semibold" style={{ color: "#9A7B2E" }}>
            {open ? "Show less" : "Why — and how to do both"}
          </span>
        </div>
        <ChevronDown
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="space-y-3.5 px-4 pb-4">
              {/* The two choices, side by side — one is marked, and why. */}
              <div className="grid grid-cols-2 gap-2">
                {OPTIONS.map((o) => (
                  <div
                    key={o.key}
                    className="rounded-xl px-2.5 py-2.5"
                    style={
                      o.recommended
                        ? { backgroundColor: `${GOLD}14`, border: `1px solid ${GOLD}59` }
                        : {
                            backgroundColor: "hsl(var(--muted) / 0.4)",
                            border: "1px solid hsl(var(--border))",
                          }
                    }
                  >
                    <p className="text-[12px] font-semibold leading-tight text-foreground">
                      {o.title}
                    </p>
                    <p
                      className="mt-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em]"
                      style={{ color: o.recommended ? "#9A7B2E" : "hsl(var(--muted-foreground))" }}
                    >
                      {o.tag}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {o.points.map((p) => (
                        <li key={p} className="flex gap-1.5 text-[11px] leading-snug text-muted-foreground">
                          <span
                            aria-hidden="true"
                            className="mt-[6px] h-1 w-1 shrink-0 rounded-full"
                            style={{
                              backgroundColor: o.recommended ? GOLD : "hsl(var(--muted-foreground) / 0.5)",
                            }}
                          />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="text-[11.5px] leading-relaxed text-foreground/90">
                Both can be right. A dip you buy by pausing your SIP isn't spare money — it's the plan.
              </p>

              {/* The rule, for the case the ask is actually about: limited cash. */}
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  If your spare cash is limited
                </p>
                <div className="mt-2 space-y-2.5">
                  {STEPS.map((s) => (
                    <div key={s.n} className="flex gap-2.5">
                      <span
                        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums"
                        style={{
                          backgroundColor: `${GOLD}26`,
                          color: "#9A7B2E",
                          border: `1px solid ${GOLD}66`,
                        }}
                      >
                        {s.n}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold leading-tight text-foreground">
                          {s.title}
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                          {s.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Where each step happens in the app. */}
              <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                <button
                  type="button"
                  onClick={() => navigate("/liquid-funds")}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  Park in liquid funds
                </button>
                <button
                  type="button"
                  onClick={() => navigate(variant === "sip" ? "/invest/lumpsum" : "/invest/sip")}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted/50"
                >
                  {variant === "sip" ? "Deploy a lump sum" : "Set up the SIP"}
                </button>
              </div>

              <p className="text-[10.5px] leading-snug text-muted-foreground/80">
                General guidance, not a market view. Prozpr doesn't forecast dips — an underweight
                is a fact about your portfolio, not a prediction.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default SipOrDipCard;
