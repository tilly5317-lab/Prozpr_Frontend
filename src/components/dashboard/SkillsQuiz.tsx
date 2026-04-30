import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  X,
  Trophy,
  Rocket,
  RotateCcw,
  TrendingUp,
  BarChart3,
  Landmark,
  Gem,
  CheckCircle2,
  XCircle,
} from "lucide-react";

/* ── Data ── */
interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const LEVEL_1: Question[] = [
  {
    question: "What is an ETF?",
    options: [
      "A savings account with fixed interest",
      "A basket of assets you can buy/sell on a stock exchange like a single share",
      "A government-issued bond",
      "A type of real estate investment",
    ],
    correctIndex: 1,
    explanation:
      "An ETF (Exchange-Traded Fund) bundles many assets — like stocks or bonds — into one product. You buy and sell it on a stock exchange just like a single share, making it simple and accessible.",
  },
  {
    question: "If you invest in an S&P 500 ETF, you are...",
    options: [
      "Betting on one company to outperform the market",
      "Lending money to 500 companies",
      "Owning a tiny slice of 500 of America's largest companies",
      "Buying a fixed-return product",
    ],
    correctIndex: 2,
    explanation:
      "The S&P 500 tracks the 500 biggest US companies. An ETF following it means you automatically own a small piece of all of them — instant diversification in one click.",
  },
  {
    question: "What is a key advantage of ETFs over picking individual stocks?",
    options: [
      "They always go up in value",
      "They are guaranteed by the government",
      "They spread your risk across many assets",
      "They have no fees whatsoever",
    ],
    correctIndex: 2,
    explanation:
      "If one company in an ETF performs badly, the others can cushion the blow. Picking individual stocks means one bad call can hurt your whole portfolio.",
  },
  {
    question: 'ETF fees are typically described as an...',
    options: [
      "Annual Premium Ratio",
      "Expense Ratio",
      "Management Surcharge",
      "Trading Commission",
    ],
    correctIndex: 1,
    explanation:
      "The Expense Ratio is the annual fee deducted from the ETF's value — typically very low (0.03%–0.75%). It's one reason ETFs are popular: they're cheap to hold compared to actively managed funds.",
  },
];

const LEVEL_2: Question[] = [
  {
    question: "What is the key structural difference between an ETF and a traditional mutual fund?",
    options: [
      "ETFs are only available to institutional investors",
      "ETFs are traded on an exchange throughout the day, mutual funds price once daily",
      "Mutual funds hold more assets than ETFs",
      "ETFs are always actively managed",
    ],
    correctIndex: 1,
    explanation:
      "Mutual funds calculate their price once at end of day. ETFs trade live on an exchange like stocks — giving you more flexibility and transparency over the price you pay.",
  },
  {
    question: 'A "thematic ETF" (e.g. clean energy, AI) carries more risk than a broad market ETF because...',
    options: [
      "They charge higher taxes",
      "They are concentrated in one sector, so less diversified",
      "They are not regulated",
      "They can only be held for 12 months",
    ],
    correctIndex: 1,
    explanation:
      "Broad ETFs spread risk across hundreds of industries. Thematic ETFs concentrate on one trend — if that sector falls out of favour, there's nowhere to hide.",
  },
  {
    question: 'What does it mean when an ETF is "synthetic"?',
    options: [
      "It only holds fake assets",
      "It uses derivatives to replicate index performance rather than holding the actual assets",
      "It was created by AI",
      "It cannot be sold once purchased",
    ],
    correctIndex: 1,
    explanation:
      "Instead of buying the actual stocks in an index, a synthetic ETF uses financial contracts (derivatives) to mimic the returns. It introduces a small extra layer of counterparty risk.",
  },
  {
    question: "If an ETF has an expense ratio of 0.75% vs 0.10%, over 20 years this difference...",
    options: [
      "Is negligible — fees don't compound",
      "Can significantly erode returns due to compounding costs",
      "Only matters if you invest over £1 million",
      "Is offset by higher dividends",
    ],
    correctIndex: 1,
    explanation:
      "Fees compound just like returns do — but in reverse. A seemingly small 0.65% difference can cost tens of thousands of pounds over a 20-year investment horizon.",
  },
  {
    question: '"Tracking error" in an ETF refers to...',
    options: [
      "A mistake made by the fund manager",
      "The gap between the ETF's performance and the index it follows",
      "The delay in processing your trade",
      "An error in the ETF's price display",
    ],
    correctIndex: 1,
    explanation:
      "A well-run ETF should closely mirror its index. Tracking error measures how much it drifts — caused by fees, timing, or the way the fund is constructed.",
  },
];

const categories = [
  { label: "ETFs", active: true, icon: TrendingUp, color: "bg-[#C9A84C]", ringColor: "ring-[#C9A84C]/30" },
  { label: "Stocks", active: false, icon: BarChart3, color: "bg-[#4A7BF7]", ringColor: "ring-[#4A7BF7]/20" },
  { label: "Bonds", active: false, icon: Landmark, color: "bg-[#2EAA6F]", ringColor: "ring-[#2EAA6F]/20" },
  { label: "Commodities", active: false, icon: Gem, color: "bg-[#E8734A]", ringColor: "ring-[#E8734A]/20" },
];

const QUIZ_GOLD = "#C9A84C";

/* ── Quiz overlay component — theme-aware popup ── */
function QuizOverlay({ onClose }: { onClose: () => void }) {
  const [level, setLevel] = useState<1 | 2>(1);
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);

  const questions = level === 1 ? LEVEL_1 : LEVEL_2;
  const current = questions[qIdx];
  const isCorrect = selected === current?.correctIndex;
  const total = questions.length;

  // Esc closes the popup
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSelect = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);
    if (idx === current.correctIndex) setCorrectCount((c) => c + 1);
  };

  const handleNext = () => {
    if (qIdx < total - 1) {
      setQIdx((i) => i + 1);
      setSelected(null);
    } else {
      if (level === 1) setShowSummary(true);
      else setShowCongrats(true);
    }
  };

  const retakeLevel1 = () => {
    setLevel(1);
    setQIdx(0);
    setSelected(null);
    setCorrectCount(0);
    setShowSummary(false);
    setShowCongrats(false);
  };

  const goToLevel2 = () => {
    setLevel(2);
    setQIdx(0);
    setSelected(null);
    setCorrectCount(0);
    setShowSummary(false);
  };

  const progressPct = ((qIdx + (selected !== null ? 1 : 0)) / total) * 100;

  const ctaBtnClass =
    "rounded-[12px] py-3 text-sm font-semibold bg-primary text-primary-foreground active:scale-[0.97] transition-transform";

  /* ── Inner content selector ── */
  let body: React.ReactNode;
  let chipText: string;

  if (showCongrats) {
    chipText = "ETF Quiz";
    body = (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-5">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.2 }}
        >
          <Trophy className="h-16 w-16" style={{ color: QUIZ_GOLD }} />
        </motion.div>
        <h2 className="text-xl font-bold text-foreground">You're an ETF expert! 🏆</h2>
        <p className="text-sm text-muted-foreground">More categories coming soon.</p>
        <button
          onClick={retakeLevel1}
          className="mt-2 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-4 w-4" /> Retake Level 1
        </button>
        <button onClick={onClose} className={`mt-2 px-8 ${ctaBtnClass}`}>
          Done
        </button>
      </div>
    );
  } else if (showSummary) {
    const perfect = correctCount === total;
    chipText = "Level 1 · ETFs";
    body = (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-5">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.2 }}
        >
          {perfect ? (
            <Rocket className="h-16 w-16" style={{ color: QUIZ_GOLD }} />
          ) : (
            <span className="text-6xl">💪</span>
          )}
        </motion.div>
        <h2 className="text-xl font-bold text-foreground">
          {perfect ? "Nailed it! Ready for the next level 🚀" : "Great effort! Knowledge takes time."}
        </h2>
        <p className="text-sm text-muted-foreground">
          You got {correctCount} out of {total} correct.
        </p>

        <div className="flex w-full gap-2 mt-2 max-w-[280px]">
          {perfect && (
            <button onClick={goToLevel2} className={`flex-1 ${ctaBtnClass}`}>
              Unlock Level 2
            </button>
          )}
          <button
            onClick={retakeLevel1}
            className="flex-1 flex items-center justify-center gap-2 rounded-[12px] py-3 text-sm font-medium border border-border text-foreground hover:bg-muted/60 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Retake
          </button>
        </div>
      </div>
    );
  } else {
    chipText = `Level ${level} · ETFs`;
    body = (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Progress bar */}
        <div className="mx-5 h-1.5 rounded-full overflow-hidden bg-muted">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: QUIZ_GOLD }}
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>

        {/* Question + options */}
        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4">
          <motion.h3
            key={`q-${level}-${qIdx}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[17px] font-semibold leading-snug mb-5 text-foreground"
          >
            {current.question}
          </motion.h3>

          <div className="space-y-2.5">
            {current.options.map((opt, i) => {
              const showState = selected !== null;
              const isThisCorrect = i === current.correctIndex;
              const isThisSelectedWrong = i === selected && !isCorrect;

              const stateClass = showState
                ? isThisCorrect
                  ? "bg-wealth-green/15 border-wealth-green/40 text-wealth-green"
                  : isThisSelectedWrong
                    ? "bg-destructive/15 border-destructive/40 text-destructive"
                    : "bg-card border-border text-foreground opacity-70"
                : "bg-card border-border text-foreground hover:border-foreground/30";

              const icon = !showState
                ? null
                : isThisCorrect
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-wealth-green" />
                  : isThisSelectedWrong
                    ? <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    : null;

              return (
                <motion.button
                  key={i}
                  onClick={() => handleSelect(i)}
                  disabled={selected !== null}
                  className={`w-full text-left rounded-[12px] p-3.5 text-[14px] leading-snug flex items-start gap-3 border transition-all ${stateClass}`}
                  whileTap={selected === null ? { scale: 0.98 } : undefined}
                >
                  <span className="font-bold shrink-0 w-5">{String.fromCharCode(65 + i)})</span>
                  <span className="flex-1">{opt}</span>
                  {icon}
                </motion.button>
              );
            })}
          </div>

          {/* Feedback + explanation */}
          <AnimatePresence>
            {selected !== null && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 rounded-[10px] p-3 bg-muted/60"
              >
                <p
                  className={`text-sm font-semibold mb-1.5 ${
                    isCorrect ? "text-wealth-green" : "text-destructive"
                  }`}
                >
                  {isCorrect ? "Correct! Keep going 🔥" : "Not quite — here's why…"}
                </p>
                <p className="text-xs leading-relaxed text-foreground">
                  {current.explanation}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer with Next button */}
        <AnimatePresence>
          {selected !== null && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-5 pt-2 pb-4"
              style={{ borderTop: "1px solid hsl(var(--hairline))" }}
            >
              <button onClick={handleNext} className={`w-full ${ctaBtnClass}`}>
                {qIdx < total - 1 ? "Next question →" : level === 1 ? "See results" : "Finish quiz"}
              </button>
              {level === 2 && (
                <button
                  onClick={retakeLevel1}
                  className="mt-2 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="inline h-3 w-3 mr-1" />
                  Retake Level 1
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/45"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Centered popup (bottom-sheet feel on mobile) */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Skills quiz"
        className="fixed inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center z-[60] px-0 sm:px-4"
      >
        <div
          className="mx-auto w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-card shadow-2xl flex flex-col overflow-hidden"
          style={{
            maxHeight: "min(92dvh, 720px)",
            borderTop: "1px solid rgba(255,255,255,0.04)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: "1px solid hsl(var(--hairline))" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-block text-[11px] font-medium rounded-full px-2.5 py-0.5 bg-muted text-foreground">
                {chipText}
              </span>
              {!showCongrats && !showSummary && (
                <span className="text-[10px] text-muted-foreground">
                  Question {qIdx + 1} of {total}
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {body}
        </div>
      </motion.div>
    </>
  );
}

/* ── Main exported section ── */
export default function SkillsQuiz() {
  const [quizOpen, setQuizOpen] = useState(false);

  return (
    <>
      <div>
        <div className="flex items-center gap-4 justify-center">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.label}
                disabled={!cat.active}
                onClick={() => cat.active && setQuizOpen(true)}
                className="flex flex-col items-center gap-1.5 group"
              >
                <div
                  className={`relative flex h-14 w-14 items-center justify-center rounded-full ring-2 transition-all ${
                    cat.active
                      ? `${cat.color} ${cat.ringColor} shadow-lg cursor-pointer group-active:scale-95`
                      : "bg-muted/40 ring-border/20 cursor-default"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${cat.active ? "text-white" : "text-muted-foreground/30"}`}
                  />
                  {!cat.active && (
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-muted border border-border/40">
                      <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <span
                  className={`text-[10px] font-medium ${
                    cat.active ? "text-foreground" : "text-muted-foreground/40"
                  }`}
                >
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {quizOpen && <QuizOverlay onClose={() => setQuizOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
