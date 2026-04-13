import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Check, ChevronDown, ChevronUp } from "lucide-react";
import { ONBOARDING_SECTIONS } from "@/lib/onboardingSections";

interface SectionNotes {
  [key: number]: string[];
}

const DUMMY_NOTES: { [key: number]: string[] } = {
  0: ["Monthly income ₹1.8L", "Expenses around ₹90K/month", "Existing FD of ₹12L", "Property valued at ₹85L, no major liabilities"],
  1: ["Retirement by 55 — primary goal", "Children's education fund in 8 years", "Target corpus: ₹2Cr", "Secondary: vacation fund"],
  2: ["Moderate experience with mutual funds", "Comfortable with 15-20% drawdowns", "Prefers steady growth over quick gains", "10-15 year horizon"],
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

interface VoiceOnboardInlineProps {
  onComplete: () => void;
}

const VoiceOnboardInline = ({ onComplete }: VoiceOnboardInlineProps) => {
  const [currentSection, setCurrentSection] = useState(0);
  const [completedSections, setCompletedSections] = useState<number[]>([]);
  const [notes, setNotes] = useState<SectionNotes>({});
  const [elapsed, setElapsed] = useState<{ [key: number]: number }>({});
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState("");
  const [expandedReview, setExpandedReview] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => ({ ...prev, [currentSection]: (prev[currentSection] || 0) + 1 }));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording, isPaused, currentSection]);

  const toggleRecording = useCallback(() => {
    if (!isRecording) {
      setIsRecording(true);
      setIsPaused(false);
    } else {
      setIsPaused((p) => !p);
    }
  }, [isRecording]);

  const completeSection = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
    setIsPaused(false);

    const sectionNotes = DUMMY_NOTES[currentSection] || ["Response captured"];
    setNotes((prev) => ({ ...prev, [currentSection]: sectionNotes }));
    setCompletedSections((prev) => [...new Set([...prev, currentSection])]);

    if (currentSection < ONBOARDING_SECTIONS.length - 1) {
      setTransitionTarget(ONBOARDING_SECTIONS[currentSection + 1].name);
      setShowTransition(true);
      setTimeout(() => {
        setShowTransition(false);
        setCurrentSection((p) => p + 1);
      }, 1200);
    } else {
      // All sections complete
      setTimeout(() => onComplete(), 800);
    }
  }, [currentSection, onComplete]);

  const section = ONBOARDING_SECTIONS[currentSection];
  const sectionElapsed = elapsed[currentSection] || 0;

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Progress bar */}
      <div className="px-4 pt-3 pb-2 shrink-0">
        <div className="flex gap-1.5">
          {ONBOARDING_SECTIONS.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="h-1.5 w-full rounded-full transition-colors duration-300"
                style={{
                  backgroundColor:
                    completedSections.includes(i)
                      ? "hsl(var(--primary))"
                      : i === currentSection
                      ? "hsl(var(--primary) / 0.35)"
                      : "hsl(var(--muted))",
                }}
              />
              <span className="text-[8px] text-muted-foreground/70 leading-tight text-center truncate w-full">
                {s.name}
              </span>
              <span className="text-[7px] text-muted-foreground/50">~5 min</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-muted-foreground">Section {currentSection + 1} of {ONBOARDING_SECTIONS.length}</span>
          <span className="text-[10px] font-medium text-primary">{section.name}</span>
        </div>
      </div>

      {/* Hero area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center"
          >
            {isRecording && !isPaused && (
              <span className="mb-2 rounded-full bg-primary/10 px-3 py-1 text-[9px] font-semibold text-primary uppercase tracking-wider">
                Now speaking
              </span>
            )}

            <h2 className="text-[18px] font-bold text-foreground leading-tight">{section.name}</h2>
            <p className="mt-1.5 text-[12px] italic text-muted-foreground leading-relaxed max-w-[260px]">
              "{section.prompt}"
            </p>

            {/* Mic button */}
            <button
              onClick={isRecording && !isPaused && sectionElapsed > 2 ? completeSection : toggleRecording}
              className="relative mt-6 mb-3 active:scale-95 transition-transform"
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  width: 80,
                  height: 80,
                  top: -6,
                  left: -6,
                  backgroundColor: isRecording && !isPaused
                    ? "hsl(var(--primary) / 0.12)"
                    : "hsl(var(--muted) / 0.5)",
                }}
                animate={
                  isRecording && !isPaused
                    ? { scale: [1, 1.15, 1], opacity: [0.4, 0.15, 0.4] }
                    : { scale: 1, opacity: 0.3 }
                }
                transition={
                  isRecording && !isPaused
                    ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
                    : {}
                }
              />
              <div
                className="relative flex h-[68px] w-[68px] items-center justify-center rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: isRecording && !isPaused
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted))",
                }}
              >
                <Mic
                  className="h-6 w-6 transition-colors duration-300"
                  style={{
                    color: isRecording && !isPaused
                      ? "hsl(var(--primary-foreground))"
                      : "hsl(var(--muted-foreground))",
                  }}
                />
              </div>
            </button>

            <p className="text-[12px] tabular-nums text-muted-foreground">{formatTime(sectionElapsed)}</p>

            <div className="mt-1 flex items-center gap-1.5">
              {isRecording && !isPaused ? (
                <>
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full bg-destructive"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-[10px] text-muted-foreground">Recording · tap mic to finish</span>
                </>
              ) : isPaused ? (
                <span className="text-[10px] text-muted-foreground">Paused</span>
              ) : (
                <span className="text-[10px] text-muted-foreground">Tap mic to start</span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Completed sections */}
      {completedSections.length > 0 && (
        <div className="px-4 pb-4 pt-2 shrink-0 max-h-[35%] overflow-y-auto border-t border-border/40">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Completed
          </p>
          <div className="space-y-1.5">
            {completedSections.map((idx) => (
              <div key={idx} className="rounded-lg bg-muted/30">
                <button
                  onClick={() => setExpandedReview(expandedReview === idx ? null : idx)}
                  className="flex w-full items-center justify-between px-3 py-2.5 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
                      <Check className="h-3 w-3 text-emerald-500" />
                    </div>
                    <span className="text-[12px] font-medium text-foreground">{ONBOARDING_SECTIONS[idx].name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">Review</span>
                    {expandedReview === idx ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>
                <AnimatePresence>
                  {expandedReview === idx && notes[idx] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-2.5 pl-10">
                        <ul className="space-y-1">
                          {notes[idx].map((note, ni) => (
                            <li key={ni} className="text-[11px] text-muted-foreground leading-relaxed">• {note}</li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transition overlay */}
      <AnimatePresence>
        {showTransition && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm rounded-xl"
          >
            <motion.p
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-[14px] font-medium text-foreground"
            >
              ✓ Got it — moving to <span className="text-primary">{transitionTarget}</span>
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VoiceOnboardInline;
