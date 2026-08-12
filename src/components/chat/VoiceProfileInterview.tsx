/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Loader2, Mic, Pencil, SkipForward, Volume2, X } from "lucide-react";
import {
  updateInvestmentProfile,
  updatePersonalFinance,
  updateRiskProfile,
  updateTaxProfile,
  type PersonalFinancePayload,
} from "@/lib/api";
import {
  formatAmountForConfirm,
  parseAmount,
  parseChoice,
  parseMultiChoice,
  parsePercent,
  parseRegime,
} from "@/lib/voiceProfileParse";
import { VOICE_PARTS, type VoiceQuestion } from "@/lib/voiceProfileScript";
import { useMicLevel } from "@/hooks/useMicLevel";
import VoiceBlob from "./VoiceBlob";

const GOLD = "#D4A868";
const GOLD_ON = "#2D1F05";
const GOLD_BORDER = "rgba(212, 168, 104, 0.45)";
const GOLD_TINT = "rgba(212, 168, 104, 0.16)";
const GOLD_TINT_SOFT = "rgba(212, 168, 104, 0.07)";

/** Answer value as it will be sent to the API, plus how to show it back. */
interface ParsedAnswer {
  value: number | string | string[];
  display: string;
}

/** Answers for one part, keyed by question id. */
type AnswerMap = Record<string, ParsedAnswer>;

type Phase = "asking" | "listening" | "confirming" | "done";
type SaveState = "idle" | "saving" | "saved" | "error";

function parseAnswer(q: VoiceQuestion, transcript: string): ParsedAnswer | null {
  switch (q.kind) {
    case "amount": {
      const n = parseAmount(transcript);
      return n == null ? null : { value: n, display: formatAmountForConfirm(n) };
    }
    case "percent": {
      const n = parsePercent(transcript);
      return n == null ? null : { value: n, display: `${n}%` };
    }
    case "regime": {
      const r = parseRegime(transcript);
      return r == null ? null : { value: r, display: `${r === "old" ? "Old" : "New"} regime` };
    }
    case "choice": {
      const i = parseChoice(transcript, q.options ?? []);
      if (i == null) return null;
      return { value: (q.options ?? [])[i], display: (q.optionLabels ?? q.options ?? [])[i] };
    }
    case "multi": {
      const idx = parseMultiChoice(transcript, q.options ?? []);
      if (idx.length === 0) return null;
      const picked = idx.map((i) => (q.options ?? [])[i]);
      return { value: picked, display: picked.join(", ") };
    }
  }
}

/**
 * Write one part's answers to its profile section.
 *
 * Every field is optional in these payloads, so a part that is only half
 * answered still saves what it has — which is what makes per-answer auto-save
 * safe. Skipped questions are simply absent, never sent as null, so skipping
 * cannot wipe a value the user set elsewhere.
 */
async function persistPart(partIndex: number, map: AnswerMap): Promise<void> {
  const has = (id: string) => map[id] !== undefined;
  const val = (id: string) => map[id]?.value;

  switch (VOICE_PARTS[partIndex].sectionIndex) {
    case 0: {
      // updatePersonalFinance is what /profile/complete uses for these scalars,
      // and it already saves group by group — same partial-write contract.
      const payload: PersonalFinancePayload = {};
      if (has("annual_income")) payload.annual_income = val("annual_income") as number;
      if (has("monthly_household_expense"))
        payload.monthly_household_expense = val("monthly_household_expense") as number;
      if (has("financial_assets")) payload.financial_assets = val("financial_assets") as number;
      if (Object.keys(payload).length === 0) return;
      await updatePersonalFinance(payload);
      return;
    }
    case 2: {
      const payload: Record<string, string> = {};
      for (const id of ["investment_horizon", "investment_experience", "investment_focus", "drop_reaction"]) {
        if (has(id)) payload[id] = val(id) as string;
      }
      if (Object.keys(payload).length === 0) return;
      await updateRiskProfile(payload);
      return;
    }
    case 3: {
      const payload: Record<string, unknown> = {};
      if (has("income_tax_rate")) payload.income_tax_rate = val("income_tax_rate") as number;
      if (has("tax_regime")) payload.tax_regime = val("tax_regime") as string;
      if (Object.keys(payload).length === 0) return;
      await updateTaxProfile(payload);
      return;
    }
    case 1: {
      if (!has("objectives")) return;
      await updateInvestmentProfile({ objectives: val("objectives") as string[] });
      return;
    }
  }
}

/**
 * Voice onboarding for Complete profile.
 *
 * Each question is read aloud and highlighted word-by-word as it is spoken, then
 * the mic opens and the answer types itself out live. Parsed values are always
 * shown back before they count — speech recognition and the parser are both
 * fallible and this writes to a financial profile.
 *
 * Navigation is free: the four parts are tabs you can move between at any time,
 * skipping steps to the next question rather than abandoning the part, and every
 * confirmed answer saves on its own. Nothing depends on finishing in order.
 */
const VoiceProfileInterview = ({
  open,
  onClose,
  onFinished,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired after each successful save, so the caller can refresh profile state. */
  onFinished?: () => void;
}) => {
  const [partIdx, setPartIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("asking");
  /** Word index reached by the speech synth, for the read-along highlight. */
  const [spokenWords, setSpokenWords] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<ParsedAnswer | null>(null);
  const [unparsed, setUnparsed] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  /** Running selection for a multi-select question, so taps accumulate. */
  const [multiPicks, setMultiPicks] = useState<string[]>([]);
  /** Showing a section's answers rather than asking its next question. */
  const [showSummary, setShowSummary] = useState(false);

  /** Every answer given this session, by part index then question id. */
  const [answers, setAnswers] = useState<Record<number, AnswerMap>>({});
  const [saveState, setSaveState] = useState<Record<number, SaveState>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  /** Latest answers, so an auto-save never reads a stale closure. */
  const answersRef = useRef(answers);
  answersRef.current = answers;

  // Mic loudness, tapped only while the sheet is open so the stream is released
  // the moment the user leaves.
  const micLevel = useMicLevel(open && phase !== "done");
  /** Bumped on each word the synth speaks; the blob decays it into a throb. */
  const speechPulse = useRef(0);

  const part = VOICE_PARTS[partIdx];
  const question = part?.questions[qIdx];
  const partAnswers = answers[partIdx] ?? {};
  const answeredHere = question ? partAnswers[question.id] : undefined;

  const promptWords = useMemo(() => (question ? question.prompt.split(" ") : []), [question]);

  const totalAnswered = useMemo(
    () => Object.values(answers).reduce((n, m) => n + Object.keys(m).length, 0),
    [answers],
  );

  const stopEverything = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /** Open the mic and stream the answer in as it is spoken. */
  const startListening = useCallback(() => {
    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setVoiceUnavailable(true);
      setPhase("confirming");
      setUnparsed(true);
      return;
    }
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-IN";
    recognition.interimResults = true;
    recognition.continuous = true;

    let finalText = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      // Live "typing out" of the answer: finalised words plus what's still being said.
      setTranscript((finalText + interim).trimStart());
    };
    recognition.onerror = () => {
      setPhase("confirming");
      setUnparsed(true);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setPhase((prev) => (prev === "listening" ? "confirming" : prev));
    };

    recognitionRef.current = recognition;
    setTranscript("");
    setParsed(null);
    setUnparsed(false);
    setPhase("listening");
    try {
      recognition.start();
    } catch {
      setPhase("confirming");
      setUnparsed(true);
    }
  }, []);

  /** Read the question aloud, highlighting each word as the synth reaches it. */
  const askQuestion = useCallback(() => {
    if (!question) return;
    setPhase("asking");
    setSpokenWords(0);
    speechPulse.current = 0;
    setTranscript("");
    setParsed(null);
    setUnparsed(false);

    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) {
      startListening();
      return;
    }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(question.prompt);
    utter.lang = "en-IN";
    utter.rate = 0.98;
    utter.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name && e.name !== "word") return;
      const upto = question.prompt.slice(0, e.charIndex).trim();
      setSpokenWords(upto ? upto.split(/\s+/).length : 0);
      // Same event drives the read-along highlight and the blob's throb, so the
      // shape moves on the syllable the voice is actually on.
      speechPulse.current = 1;
    };
    utter.onend = () => {
      setSpokenWords(promptWords.length);
      startListening();
    };
    utter.onerror = () => {
      setSpokenWords(promptWords.length);
      startListening();
    };
    synth.speak(utter);
  }, [question, promptWords.length, startListening]);

  // Ask whenever the current question changes while the sheet is open. Reviewing
  // a summary must stay silent — leaving the summary re-triggers the ask.
  useEffect(() => {
    if (!open || phase === "done" || showSummary || !question) return;
    askQuestion();
    return stopEverything;
    // Keyed on position only, so this is one ask per question rather than one
    // per render. askQuestion is rebuilt whenever the question changes anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, partIdx, qIdx, showSummary]);

  // Parse as soon as listening ends.
  useEffect(() => {
    if (phase !== "confirming" || !question || parsed || unparsed) return;
    const result = parseAnswer(question, transcript);
    if (!result) {
      setUnparsed(true);
      return;
    }
    setParsed(result);
    // Reflect a spoken multi-answer in the rows, so voice and tapping agree.
    if (question.kind === "multi") setMultiPicks(result.value as string[]);
  }, [phase, question, transcript, parsed, unparsed]);

  // Seed the multi-select from an existing answer when revisiting a question.
  useEffect(() => {
    const existing = answersRef.current[partIdx]?.[question?.id ?? ""];
    setMultiPicks(Array.isArray(existing?.value) ? (existing.value as string[]) : []);
  }, [partIdx, qIdx, question?.id]);

  /** Tap an option — the same commit path a spoken answer takes. */
  const pickOption = useCallback(
    (index: number) => {
      if (!question?.options) return;
      stopEverything();
      setUnparsed(false);
      setPhase("confirming");
      const opt = question.options[index];
      const label = question.optionLabels?.[index] ?? opt;

      if (question.kind !== "multi") {
        setParsed({ value: opt, display: label });
        return;
      }
      // Multi-select accumulates, so a second tap removes rather than replaces.
      setMultiPicks((prev) => {
        const next = prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt];
        setParsed(next.length ? { value: next, display: next.join(", ") } : null);
        if (next.length === 0) setUnparsed(false);
        return next;
      });
    },
    [question, stopEverything],
  );

  useEffect(() => {
    if (!open) stopEverything();
  }, [open, stopEverything]);

  /** Save one part's answers so far. Fire-and-forget; status shows in the header. */
  const autoSave = useCallback(
    async (index: number) => {
      const map = answersRef.current[index] ?? {};
      if (Object.keys(map).length === 0) return;
      setSaveState((s) => ({ ...s, [index]: "saving" }));
      setSaveError(null);
      try {
        await persistPart(index, map);
        setSaveState((s) => ({ ...s, [index]: "saved" }));
        onFinished?.();
      } catch (e) {
        setSaveState((s) => ({ ...s, [index]: "error" }));
        setSaveError(
          e instanceof Error && e.message ? e.message : "The server didn't accept it.",
        );
      }
    },
    [onFinished],
  );

  /** Move to a specific question. Stops any speech first. */
  const goTo = useCallback(
    (nextPart: number, nextQ: number) => {
      stopEverything();
      setPartIdx(nextPart);
      setQIdx(nextQ);
      setShowSummary(false);
      setPhase("asking");
    },
    [stopEverything],
  );

  /**
   * Open a section from the tabs. A section you've already answered something in
   * opens on its summary rather than re-asking question one — coming back is
   * almost always to check what you said, not to start over.
   */
  const openPart = useCallback(
    (index: number) => {
      if (Object.keys(answersRef.current[index] ?? {}).length > 0) {
        stopEverything();
        setPartIdx(index);
        setShowSummary(true);
        setPhase("asking");
        return;
      }
      goTo(index, 0);
    },
    [goTo, stopEverything],
  );

  /** First question in a part with no answer yet, or null when it's complete. */
  const firstUnansweredIn = useCallback((index: number): number | null => {
    const map = answersRef.current[index] ?? {};
    const idx = VOICE_PARTS[index].questions.findIndex((q) => map[q.id] === undefined);
    return idx === -1 ? null : idx;
  }, []);

  /** Next question; roll into the following part at the end of this one. */
  const goNext = useCallback(() => {
    if (qIdx < part.questions.length - 1) {
      goTo(partIdx, qIdx + 1);
      return;
    }
    if (partIdx < VOICE_PARTS.length - 1) {
      goTo(partIdx + 1, 0);
      return;
    }
    stopEverything();
    setPhase("done");
  }, [qIdx, part, partIdx, goTo, stopEverything]);

  /** Record an answer, save it, and advance. */
  const confirmAnswer = useCallback(
    (answer: ParsedAnswer) => {
      const index = partIdx;
      const next = { ...(answersRef.current[index] ?? {}), [question.id]: answer };
      answersRef.current = { ...answersRef.current, [index]: next };
      setAnswers(answersRef.current);
      void autoSave(index);
      goNext();
    },
    [partIdx, question, autoSave, goNext],
  );

  /** Skip = leave this question unanswered and move to the NEXT QUESTION. */
  const skipQuestion = useCallback(() => {
    goNext();
  }, [goNext]);

  const handleClose = useCallback(() => {
    stopEverything();
    onClose();
  }, [stopEverything, onClose]);

  if (!open) return null;

  const currentSaveState = saveState[partIdx] ?? "idle";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-black/55"
        onClick={handleClose}
        aria-hidden="true"
      />
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-label="Voice profile setup"
        className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      >
        <div
          className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
          style={{ maxHeight: "min(90dvh, 700px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="px-4 py-3"
            style={{
              borderBottom: `1px solid ${GOLD_BORDER}`,
              background: `linear-gradient(135deg, ${GOLD_TINT} 0%, transparent 70%)`,
            }}
          >
            <div className="flex items-start gap-2.5">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: GOLD_TINT }}
              >
                <Mic className="h-4 w-4" strokeWidth={2} style={{ color: GOLD }} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-foreground">Set up by voice</h2>
                <p className="text-[11px] text-muted-foreground">
                  {totalAnswered === 0
                    ? "Answer in any order — every answer saves on its own"
                    : `${totalAnswered} answered · saved as you go`}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="-m-1.5 p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Four section tabs — switchable at any time. */}
            <div className="mt-2.5 grid grid-cols-4 gap-1">
              {VOICE_PARTS.map((p, i) => {
                const done = Object.keys(answers[i] ?? {}).length;
                const total = p.questions.length;
                const active = i === partIdx && phase !== "done";
                const complete = done === total;
                return (
                  <button
                    key={p.sectionIndex}
                    type="button"
                    onClick={() => openPart(i)}
                    aria-pressed={active}
                    title={p.title}
                    className="rounded-lg px-1 py-1 text-left transition-colors"
                    style={{
                      backgroundColor: active ? GOLD_TINT : "transparent",
                      border: `1px solid ${active ? GOLD_BORDER : "transparent"}`,
                    }}
                  >
                    <div
                      className="h-1 rounded-full"
                      style={{
                        backgroundColor: complete
                          ? GOLD
                          : done > 0
                            ? "rgba(212,168,104,0.45)"
                            : "hsl(var(--muted))",
                      }}
                    />
                    <p
                      className="mt-1 truncate text-[9.5px] font-semibold leading-tight"
                      style={{ color: active ? GOLD : "hsl(var(--muted-foreground))" }}
                    >
                      {i + 1}. {p.title.replace(/^(Your|What are you trying to) /i, "")}
                    </p>
                    <p className="text-[9px] leading-tight text-muted-foreground/70 tabular-nums">
                      {done}/{total}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {showSummary ? (
              /* Everything answered in this section, with a way to change any of it. */
              <>
                <div className="mb-3">
                  <p className="text-[15px] font-semibold leading-snug text-foreground">
                    {part.title}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                    {Object.keys(partAnswers).length === part.questions.length
                      ? "All answered and saved. Tap any answer to change it."
                      : `${Object.keys(partAnswers).length} of ${part.questions.length} answered. Tap any row to answer or change it.`}
                  </p>
                </div>

                {currentSaveState === "error" && (
                  <div className="mb-2.5 flex items-start gap-1.5 text-[11px]">
                    <AlertCircle className="mt-[1px] h-3 w-3 shrink-0 text-destructive" />
                    <span className="text-muted-foreground">
                      Not saved — {saveError}{" "}
                      <button
                        type="button"
                        onClick={() => void autoSave(partIdx)}
                        className="font-semibold text-foreground underline underline-offset-2"
                      >
                        Retry
                      </button>
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  {part.questions.map((q, i) => {
                    const answer = partAnswers[q.id];
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => goTo(partIdx, i)}
                        className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.995]"
                        style={{
                          backgroundColor: answer ? GOLD_TINT_SOFT : "hsl(var(--muted) / 0.4)",
                          border: `1px solid ${answer ? GOLD_BORDER : "hsl(var(--border))"}`,
                        }}
                      >
                        <span
                          className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                          style={{
                            backgroundColor: answer ? GOLD : "transparent",
                            border: `1.5px solid ${answer ? GOLD : "hsl(var(--border))"}`,
                            color: answer ? GOLD_ON : "hsl(var(--muted-foreground))",
                          }}
                        >
                          {answer ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] leading-snug text-muted-foreground">
                            {q.prompt}
                          </span>
                          <span
                            className="mt-1 block text-[13.5px] font-semibold leading-snug"
                            style={{
                              color: answer ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground) / 0.7)",
                            }}
                          >
                            {answer ? answer.display : "Not answered"}
                          </span>
                        </span>
                        <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex gap-2">
                  {firstUnansweredIn(partIdx) !== null ? (
                    <button
                      type="button"
                      onClick={() => goTo(partIdx, firstUnansweredIn(partIdx)!)}
                      className="flex-1 rounded-xl py-2.5 text-[12.5px] font-bold"
                      style={{ backgroundColor: GOLD, color: GOLD_ON }}
                    >
                      Answer the rest
                    </button>
                  ) : partIdx < VOICE_PARTS.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => openPart(partIdx + 1)}
                      className="flex-1 rounded-xl py-2.5 text-[12.5px] font-bold"
                      style={{ backgroundColor: GOLD, color: GOLD_ON }}
                    >
                      Next section
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 rounded-xl py-2.5 text-[12.5px] font-bold"
                      style={{ backgroundColor: GOLD, color: GOLD_ON }}
                    >
                      Done
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => goTo(partIdx, 0)}
                    className="rounded-xl bg-muted/60 px-3 py-2.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Redo section
                  </button>
                </div>
              </>
            ) : phase === "done" ? (
              <div className="py-6 text-center">
                <div
                  className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ backgroundColor: GOLD_TINT }}
                >
                  <Check className="h-6 w-6" style={{ color: GOLD }} />
                </div>
                <p className="text-[15px] font-semibold text-foreground">
                  {totalAnswered > 0 ? "Saved as you went" : "Nothing answered yet"}
                </p>
                <p className="mx-auto mt-1.5 max-w-[36ch] text-[12px] leading-relaxed text-muted-foreground">
                  {totalAnswered > 0
                    ? "Every answer you gave is already on your profile. Anything you skipped is still waiting in Complete profile — or pick a section above to come back to it."
                    : "Pick a section above to start, or close and use the Complete profile form instead."}
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-4 rounded-xl px-4 py-2.5 text-[13px] font-bold"
                  style={{ backgroundColor: GOLD, color: GOLD_ON }}
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Save status for the section being answered. */}
                {currentSaveState !== "idle" && (
                  <div className="mb-2.5 flex items-start gap-1.5 text-[11px]">
                    {currentSaveState === "saving" && (
                      <>
                        <Loader2 className="mt-[1px] h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground">Saving…</span>
                      </>
                    )}
                    {currentSaveState === "saved" && (
                      <>
                        <Check className="mt-[1px] h-3 w-3 shrink-0" style={{ color: GOLD }} />
                        <span className="text-muted-foreground">Saved to your profile</span>
                      </>
                    )}
                    {currentSaveState === "error" && (
                      <>
                        <AlertCircle className="mt-[1px] h-3 w-3 shrink-0 text-destructive" />
                        <span className="text-muted-foreground">
                          Not saved — {saveError}{" "}
                          <button
                            type="button"
                            onClick={() => void autoSave(partIdx)}
                            className="font-semibold text-foreground underline underline-offset-2"
                          >
                            Retry
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* The question, highlighted word by word as it's read out. */}
                <div className="mb-1 flex items-center gap-1.5">
                  <Volume2
                    className={`h-3.5 w-3.5 ${phase === "asking" ? "animate-pulse" : ""}`}
                    style={{ color: GOLD }}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>
                    {part.title} · {qIdx + 1} of {part.questions.length}
                  </span>
                </div>
                <p className="text-[16px] font-semibold leading-snug text-foreground">
                  {promptWords.map((w, i) => (
                    <span
                      key={`${w}-${i}`}
                      className="transition-colors duration-150"
                      style={{
                        color:
                          phase === "asking" && i >= spokenWords
                            ? "hsl(var(--muted-foreground) / 0.45)"
                            : "hsl(var(--foreground))",
                      }}
                    >
                      {w}{" "}
                    </span>
                  ))}
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">{question.hint}</p>

                {/* Already answered on a previous pass — say so, don't silently overwrite. */}
                {answeredHere && !parsed && (
                  <p className="mt-2 text-[11px]" style={{ color: GOLD }}>
                    Answered: {answeredHere.display} — answer again to change it.
                  </p>
                )}

                {/* Options, one per line — tap instead of speaking, or speak and
                    watch the row you named light up. Every question with options
                    shows them; a short list is exactly the one worth tapping. */}
                {question.options && (
                  <div className="mt-3 space-y-1.5">
                    {question.options.map((opt, i) => {
                      const label = question.optionLabels?.[i] ?? opt;
                      const detail = question.optionLabels ? opt : null;
                      const isMulti = question.kind === "multi";
                      const selected = isMulti
                        ? multiPicks.includes(opt)
                        : parsed?.value === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => pickOption(i)}
                          aria-pressed={selected}
                          className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all active:scale-[0.995]"
                          style={{
                            backgroundColor: selected ? GOLD_TINT : "hsl(var(--muted) / 0.4)",
                            border: `1px solid ${selected ? GOLD_BORDER : "hsl(var(--border))"}`,
                          }}
                        >
                          <span
                            className="mt-[1px] flex h-[18px] w-[18px] shrink-0 items-center justify-center text-[10px] font-bold transition-colors"
                            style={{
                              // Checkbox for multi-select, radio for one-of.
                              borderRadius: isMulti ? 5 : 9999,
                              backgroundColor: selected ? GOLD : "transparent",
                              border: `1.5px solid ${selected ? GOLD : "hsl(var(--border))"}`,
                              color: selected ? GOLD_ON : "hsl(var(--muted-foreground))",
                            }}
                          >
                            {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13.5px] font-semibold leading-snug text-foreground">
                              {label}
                            </span>
                            {detail && (
                              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                                {detail}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {question.kind === "multi" && (
                      <p className="px-1 pt-0.5 text-[10.5px] text-muted-foreground/70">
                        Pick as many as apply — tap again to remove.
                      </p>
                    )}
                  </div>
                )}

                {/* The creature reacts to your actual voice; what it heard reads
                    underneath it as you speak. */}
                <div className="mt-4 flex flex-col items-center">
                  <VoiceBlob
                    level={micLevel}
                    pulse={speechPulse}
                    listening={phase === "listening"}
                    speaking={phase === "asking"}
                  />
                  <p
                    className="min-h-[46px] px-2 text-center text-[15px] leading-relaxed text-foreground"
                    aria-live="polite"
                  >
                    {transcript || (
                      <span className="text-muted-foreground/60">
                        {phase === "asking"
                          ? "Listening starts when the question finishes…"
                          : "Speak your answer, or tap an option above"}
                      </span>
                    )}
                    {phase === "listening" && (
                      <span
                        className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] animate-pulse"
                        style={{ backgroundColor: GOLD }}
                      />
                    )}
                  </p>
                </div>

                {/* What we understood — always shown back before it counts. */}
                {phase === "confirming" && parsed && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">We understood:</p>
                    <div
                      className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                      style={{ backgroundColor: GOLD_TINT, border: `1px solid ${GOLD_BORDER}` }}
                    >
                      <Check className="h-4 w-4 shrink-0" style={{ color: GOLD }} />
                      <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-foreground">
                        {parsed.display}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => confirmAnswer(parsed)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12.5px] font-bold"
                        style={{ backgroundColor: GOLD, color: GOLD_ON }}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Save &amp; next
                      </button>
                      <button
                        type="button"
                        onClick={askQuestion}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {phase === "confirming" && unparsed && (
                  <div className="mt-3">
                    <p className="text-[12px] leading-relaxed text-muted-foreground">
                      {voiceUnavailable
                        ? "This browser can't do speech recognition. Chrome or Edge can — or tap an option above."
                        : transcript
                          ? "That didn't quite land. Say it again, or tap an option above."
                          : "Nothing came through. Check your mic and try again."}
                    </p>
                    <button
                      type="button"
                      onClick={askQuestion}
                      className="mt-2 w-full rounded-xl py-2.5 text-[12.5px] font-bold"
                      style={{ backgroundColor: GOLD, color: GOLD_ON }}
                    >
                      Ask again
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={skipQuestion}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 text-[11.5px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <SkipForward className="h-3 w-3" />
                  {qIdx < part.questions.length - 1
                    ? "Skip to next question"
                    : partIdx < VOICE_PARTS.length - 1
                      ? `Skip to ${VOICE_PARTS[partIdx + 1].title.toLowerCase()}`
                      : "Skip and finish"}
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default VoiceProfileInterview;
