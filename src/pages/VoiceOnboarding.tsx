import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mic, Check, ChevronDown, ChevronUp } from "lucide-react";
import { ONBOARDING_SECTIONS } from "@/lib/onboardingSections";

const SECTIONS = ONBOARDING_SECTIONS;

const STORAGE_KEY = "voice-onboarding-state";

interface SectionNotes {
  [key: number]: string[];
}

interface SavedState {
  currentSection: number;
  completedSections: number[];
  notes: SectionNotes;
  elapsed: { [key: number]: number };
}

const loadState = (): SavedState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore invalid/missing stored state.
  }
  return { currentSection: 0, completedSections: [], notes: {}, elapsed: {} };
};

const saveState = (state: SavedState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const DUMMY_NOTES: { [key: number]: string[] } = {
  0: ["Wants to build long-term wealth", "Interested in retirement planning", "Children's education is a priority", "Looking at 15-year horizon for goals"],
  1: ["Comfortable with moderate fluctuations", "Prefers not to check portfolio daily", "Can tolerate 15-20% drawdowns", "Wants steady growth over quick gains"],
  2: ["Monthly income ₹1.8L", "Expenses around ₹90K/month", "Existing FD of ₹12L", "No major liabilities"],
  3: ["Planning for 10-15 years", "May need partial liquidity in 5 years", "Retirement target age: 55"],
  4: ["Mid-career, age 38", "Two dependents", "Spouse is also earning", "Has employer PF and gratuity"],
};

const VoiceOnboarding = () => {
  const navigate = useNavigate();
  const saved = useRef(loadState());

  const [currentSection, setCurrentSection] = useState(saved.current.currentSection);
  const [completedSections, setCompletedSections] = useState<number[]>(saved.current.completedSections);
  const [notes, setNotes] = useState<SectionNotes>(saved.current.notes);
  const [elapsed, setElapsed] = useState<{ [key: number]: number }>(saved.current.elapsed);

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState("");
  const [expandedReview, setExpandedReview] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist state
  useEffect(() => {
    saveState({ currentSection, completedSections, notes, elapsed });
  }, [currentSection, completedSections, notes, elapsed]);

  // Timer
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

    if (currentSection < SECTIONS.length - 1) {
      setTransitionTarget(SECTIONS[currentSection + 1].name);
      setShowTransition(true);
      setTimeout(() => {
        setShowTransition(false);
        setCurrentSection((p) => p + 1);
      }, 1200);
    }
  }, [currentSection]);

  const handlePauseAndSave = () => {
    if (isRecording) {
      setIsPaused(true);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    setIsPaused(true);
    saveState({ currentSection, completedSections, notes, elapsed });
  };

  const handleResume = () => {
    setIsPaused(false);
  };

  const section = SECTIONS[currentSection];
  const sectionElapsed = elapsed[currentSection] || 0;

  return (
    <div className="mobile-container bg-background flex flex-col min-h-screen relative">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <button
          onClick={() => navigate("/portfolio-popup")}
          className="flex items-center gap-1 text-muted-foreground active:scale-95 transition-transform"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {isPaused ? (
          <button
            onClick={handleResume}
            className="rounded-full bg-primary/10 px-4 py-1.5 text-[12px] font-medium text-primary active:scale-95 transition-transform"
          >
            Resume
          </button>
        ) : (
          <button
            onClick={handlePauseAndSave}
            className="rounded-full bg-muted px-4 py-1.5 text-[12px] font-medium text-muted-foreground active:scale-95 transition-transform"
          >
            Pause &amp; save
          </button>
        )}
      </div>

      {/* Saved status */}
      <AnimatePresence>
        {isPaused && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center text-[11px] text-primary/70 font-medium -mt-1 mb-1"
          >
            Progress saved
          </motion.p>
        )}
      </AnimatePresence>

      {/* Progress bar */}
      <div className="px-5 pb-1">
        <div className="flex gap-1.5">
          {SECTIONS.map((_, i) => (
            <div
              key={i}
              className="h-1.5 flex-1 rounded-full transition-colors duration-300"
              style={{
                backgroundColor:
                  completedSections.includes(i)
                    ? "hsl(var(--primary))"
                    : i === currentSection
                    ? "hsl(var(--primary) / 0.35)"
                    : "hsl(var(--muted))",
              }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[11px] text-muted-foreground">Section {currentSection + 1} of 5</span>
          <span className="text-[11px] font-medium text-primary">{section.name}</span>
        </div>
      </div>

      {/* Hero area */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSection}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center"
          >
            {/* Now speaking chip */}
            {isRecording && !isPaused && (
              <span className="mb-3 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary uppercase tracking-wider">
                Now speaking
              </span>
            )}

            <h1 className="text-[22px] font-bold text-foreground leading-tight">{section.name}</h1>

            <p className="mt-2 text-[13px] italic text-muted-foreground leading-relaxed max-w-[280px]">
              "{section.prompt}"
            </p>

            {/* Mic button */}
            <button
              onClick={isRecording && !isPaused && sectionElapsed > 2 ? completeSection : toggleRecording}
              className="relative mt-8 mb-4 active:scale-95 transition-transform"
            >
              {/* Outer ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  width: 96,
                  height: 96,
                  top: -8,
                  left: -8,
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

              {/* Inner circle */}
              <div
                className="relative flex h-20 w-20 items-center justify-center rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: isRecording && !isPaused
                    ? "hsl(var(--primary))"
                    : "hsl(var(--muted))",
                }}
              >
                <Mic
                  className="h-7 w-7 transition-colors duration-300"
                  style={{
                    color: isRecording && !isPaused
                      ? "hsl(var(--primary-foreground))"
                      : "hsl(var(--muted-foreground))",
                  }}
                />
              </div>
            </button>

            {/* Timer */}
            <p className="text-[13px] tabular-nums text-muted-foreground">{formatTime(sectionElapsed)}</p>

            {/* Status */}
            <div className="mt-1 flex items-center gap-1.5">
              {isRecording && !isPaused ? (
                <>
                  <motion.span
                    className="h-1.5 w-1.5 rounded-full bg-destructive"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                  <span className="text-[11px] text-muted-foreground">Recording · tap mic to finish</span>
                </>
              ) : isPaused ? (
                <span className="text-[11px] text-muted-foreground">Paused · progress saved</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Tap mic to start</span>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Completed sections strip */}
      {completedSections.length > 0 && (
        <div className="px-5 pb-8">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
            Completed
          </p>
          <div className="space-y-1">
            {completedSections.map((idx) => (
              <div key={idx}>
                <button
                  onClick={() => setExpandedReview(expandedReview === idx ? null : idx)}
                  className="flex w-full items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-2">
                    <Check className="h-3.5 w-3.5 text-primary" />
                    <span className="text-[12px] font-medium text-foreground">{SECTIONS[idx].name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Review</span>
                    {expandedReview === idx ? (
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
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
                      <div className="px-3 pt-1.5 pb-2">
                        <ul className="space-y-1">
                          {notes[idx].map((note, ni) => (
                            <li key={ni} className="text-[11px] text-muted-foreground leading-relaxed">
                              • {note}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-[9px] text-muted-foreground/50">
                          Auto-saved · tap any note to edit
                        </p>
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <p className="text-[15px] font-medium text-foreground">
                ✓ Got it — moving to <span className="text-primary">{transitionTarget}</span>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VoiceOnboarding;
