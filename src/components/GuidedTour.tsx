import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

/**
 * One stop on the tour. `anchor` is matched against `[data-tour="<anchor>"]`, so
 * the target element opts in by tagging itself rather than the tour reaching in
 * with a brittle CSS path.
 *
 * Omit `anchor` for a centred card with no spotlight — an intro or sign-off
 * step that isn't about one control. Anchorless steps skip the element lookup
 * entirely, so they paint on the first frame instead of waiting.
 *
 * `before` runs before the step is measured — use it to put the UI into the
 * state where the target actually exists (open a panel, switch a tab). The tour
 * then waits for the element to appear, so an animated panel doesn't get
 * measured mid-slide.
 */
export interface TourStep {
  anchor?: string;
  title: string;
  body: string;
  before?: () => void;
}

/** How long to keep looking for a step's element before giving up on it. */
const ANCHOR_TIMEOUT_MS = 1200;
/** Breathing room between the spotlight edge and the element it reveals. */
const SPOTLIGHT_PAD = 8;
/** Gap between the spotlight and the tooltip card. */
const CARD_GAP = 12;
const CARD_WIDTH = 300;
/** Keep the card clear of the viewport edges on small screens. */
const VIEWPORT_MARGIN = 12;

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Resolve a step's element, retrying until it exists — `before` may have just
 * triggered an animated mount. Resolves null if it never turns up, which the
 * caller renders as a centred card with no spotlight rather than a dead step.
 */
function waitForAnchor(anchor: string, signal: AbortSignal): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (signal.aborted) return resolve(null);
      const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
      // offsetParent is null while an ancestor is display:none — treat that as
      // "not ready yet" so we don't measure a zero rect during a transition.
      if (el && (el.offsetParent !== null || el.getClientRects().length > 0)) return resolve(el);
      if (performance.now() - started > ANCHOR_TIMEOUT_MS) return resolve(null);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * A first-run coach-mark walkthrough: dims the page, cuts a hole around one
 * element at a time and explains it, with the usual back / next / skip.
 *
 * Controlled — the caller decides when it opens (typically once, gated on
 * localStorage) and what happens on finish.
 */
export default function GuidedTour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  /** Measured card height, so placement fits the copy instead of guessing. */
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(0);

  const step: TourStep | undefined = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  // Restart from the top each time the tour is opened.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const measure = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  // Resolve + measure the current step. `before` fires first so the target has
  // a chance to mount; the abort guard stops a slow lookup from landing after
  // the user has already moved on.
  useEffect(() => {
    if (!open || !step) return;
    const controller = new AbortController();
    elRef.current = null;
    setRect(null);
    step.before?.();
    // Anchorless steps are centred by definition — no lookup, no scroll, no
    // wait, so the very first card is on screen the frame the tour opens.
    if (!step.anchor) return () => controller.abort();
    void waitForAnchor(step.anchor, controller.signal).then((el) => {
      if (controller.signal.aborted) return;
      elRef.current = el;
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      // Let the smooth scroll settle before measuring, else the hole lands
      // where the element used to be.
      window.setTimeout(() => {
        if (!controller.signal.aborted) measure();
      }, 260);
    });
    return () => controller.abort();
  }, [open, step, measure]);

  // Re-measure the card whenever its content or placement could have changed.
  useLayoutEffect(() => {
    if (!open) return;
    const h = cardRef.current?.offsetHeight ?? 0;
    if (h && h !== cardH) setCardH(h);
  }, [open, index, rect, cardH]);

  // Keep the hole glued to the element through scrolls and rotations.
  useLayoutEffect(() => {
    if (!open || !rect) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, rect, measure]);

  const next = useCallback(() => {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  }, [isLast, onClose]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, next, back]);

  if (!step) return null;

  /* Card sits under the spotlight when there's room, otherwise above it. With
     no rect (anchor never appeared) it centres and the step reads as a plain
     explainer — degraded, but never a blank overlay. */
  const cardStyle: React.CSSProperties = (() => {
    const width = Math.min(CARD_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    if (!rect) {
      return {
        width,
        left: (window.innerWidth - width) / 2,
        top: "50%",
        transform: "translateY(-50%)",
      };
    }
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    /* Placement uses the card's measured height, not a guess — steps whose copy
       runs long (the present/future-value explanation) are several times taller
       than the shortest ones, and a fixed estimate puts those off-screen. On the
       first paint of a step `cardH` is still 0, so fall back to an estimate and
       let the layout effect correct it a frame later. */
    const h = cardH || 190;
    const below = rect.top + rect.height + SPOTLIGHT_PAD + CARD_GAP;
    const top =
      below + h + VIEWPORT_MARGIN <= window.innerHeight
        ? below
        : // Prefer above; clamp so a card taller than the gap can't run off
          // either edge — it sits over the target rather than out of view.
          Math.max(
            VIEWPORT_MARGIN,
            Math.min(
              rect.top - SPOTLIGHT_PAD - CARD_GAP - h,
              window.innerHeight - h - VIEWPORT_MARGIN,
            ),
          );
    return { width, left, top };
  })();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Guide">
          {/* Dim + spotlight in one node: an enormous spread shadow paints
              everything outside the hole, so the element underneath stays
              crisp and there are no seams between four separate panels. */}
          {rect ? (
            <motion.div
              initial={false}
              animate={{
                top: rect.top - SPOTLIGHT_PAD,
                left: rect.left - SPOTLIGHT_PAD,
                width: rect.width + SPOTLIGHT_PAD * 2,
                height: rect.height + SPOTLIGHT_PAD * 2,
              }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-none absolute rounded-xl"
              style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.62)", outline: "2px solid #D4A868" }}
            />
          ) : (
            <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.62)" }} />
          )}

          {/* Swallows taps on the dimmed area so the page can't be poked
              mid-tour; the card above it stays interactive. */}
          <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

          <motion.div
            key={index}
            ref={cardRef}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl"
            style={{ maxHeight: `calc(100dvh - ${VIEWPORT_MARGIN * 2}px)`, ...cardStyle }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "#D4A868" }}
                >
                  Step {index + 1} of {steps.length}
                </p>
                <h3 className="mt-1 text-[14px] font-semibold text-foreground">{step.title}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-m-1.5 shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                aria-label="Skip guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">{step.body}</p>

            <div className="mt-3 flex items-center gap-2">
              <div className="flex flex-1 gap-1" aria-hidden="true">
                {steps.map((s, i) => (
                  <span
                    key={s.anchor ?? `step-${i}`}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{
                      backgroundColor: i <= index ? "#D4A868" : "hsl(var(--border))",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={back}
                disabled={isFirst}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors enabled:hover:text-foreground disabled:opacity-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <button
                type="button"
                onClick={next}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold text-white transition-transform active:scale-95"
                style={{
                  backgroundColor: "#D4A868",
                  boxShadow: "0 2px 8px rgba(212,168,104,0.45)",
                }}
              >
                {isLast ? "Got it" : "Next"}
                {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
