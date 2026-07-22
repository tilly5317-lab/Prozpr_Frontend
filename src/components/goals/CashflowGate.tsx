import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck, AlertCircle, Sparkles, X } from "lucide-react";
import {
  getCashflowReadiness,
  type CashflowReadiness,
  type CashflowReadinessField,
} from "@/lib/api";
import CashflowInputsForm from "@/components/goals/CashflowInputsForm";

/**
 * Never blocks the page. Checks cashflow readiness and, when inputs are
 * missing, shows a dismissible "add a few details" prompt; when they're present
 * it calls `onReady` so the host loads the real projection.
 *
 * The inputs form itself lives in `CashflowInputsForm`. Hosts that render the
 * form elsewhere (e.g. the goal page's side panel) pass `onOpenInputs` and the
 * gate delegates every open request (prompt CTA, editSignal, autoOpenInputs)
 * to it; without that prop the gate opens its own modal around the form.
 */
interface CashflowGateProps {
  /** Called once readiness flips to true (initially or after the user fills the form). */
  onReady?: () => void;
  /**
   * Bump this number (e.g. from a "Settings" button) to open the inputs form on
   * demand — lets the user review/adjust their cashflow inputs even when unlocked.
   */
  editSignal?: number;
  /**
   * When true, open the inputs form automatically as soon as readiness loads
   * (used when arriving from the "What are you trying to achieve?" card so the
   * user lands straight on the input form). Fires once.
   */
  autoOpenInputs?: boolean;
  /**
   * Called after the user successfully saves the cashflow inputs (not on initial
   * load). Lets a host page react — e.g. return the user to the profile-setup
   * flow they came from. Distinct from `onReady`, which also fires on mount.
   * Only fires for the gate's OWN modal — hosts using `onOpenInputs` wire the
   * save callback on their embedded form instead.
   */
  onInputsSaved?: () => void;
  /**
   * When provided, the gate never opens its own modal — every "open the inputs
   * form" request is delegated here (the host renders the form, e.g. in a side
   * panel).
   */
  onOpenInputs?: () => void;
}

const CashflowGate = ({
  onReady,
  editSignal,
  autoOpenInputs,
  onInputsSaved,
  onOpenInputs,
}: CashflowGateProps) => {
  const [readiness, setReadiness] = useState<CashflowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  // The missing-inputs prompt is a dismissible hint, never a blocker — the user
  // can close it and keep using the (example/blank) page. Once dismissed it stays
  // hidden for this visit; it re-surfaces on the next page mount if still missing.
  const [promptDismissed, setPromptDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCashflowReadiness();
      setReadiness(res);
      if (res.ready) onReady?.();
    } catch {
      // If readiness can't be fetched, treat as not-ready so the prompt can't
      // claim a projection exists.
      setReadiness({ ready: false, missing: [], fields: [] });
    } finally {
      setLoading(false);
    }
  }, [onReady]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = useCallback(() => {
    if (onOpenInputs) {
      onOpenInputs();
      return;
    }
    setFormOpen(true);
  }, [onOpenInputs]);

  // Open the form when the parent bumps editSignal (Settings button). Skip the
  // initial mount (editSignal === undefined / 0) so it only reacts to clicks.
  useEffect(() => {
    if (editSignal) openForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  // Auto-open the inputs form once readiness has loaded (e.g. arriving from the
  // "What are you trying to achieve?" card). Fires a single time.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenInputs && readiness && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      openForm();
    }
  }, [autoOpenInputs, readiness, openForm]);

  // Required inputs the engine still needs to run a real projection — drives the
  // dismissible prompt. Optional fields (missing = 0) never appear here.
  const missingFields = useMemo(
    () =>
      readiness
        ? readiness.fields.filter((f: CashflowReadinessField) => !f.present && !f.optional)
        : [],
    [readiness],
  );

  // Show the dismissible "add a few details" prompt only when the plan isn't
  // ready, there's actually something missing, the user hasn't dismissed it, and
  // no other panel is open. It never blocks the page.
  const showPrompt =
    !loading && !formOpen && !promptDismissed && !!readiness && !readiness.ready && missingFields.length > 0;

  return (
    <>
      {/* While we're still checking readiness, show a brief, non-blocking
          "checking" pill; the page underneath stays fully usable. */}
      {loading && (
        <div className="pointer-events-none fixed inset-x-0 top-[68px] z-40 flex justify-center px-6">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 shadow-sm backdrop-blur-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Checking your goal plan…</span>
          </div>
        </div>
      )}

      {/* Dismissible "add a few details" prompt — lists the inputs the projection
          still needs. Centred over a dimmed, blurred backdrop so it stands out
          from the example page behind it; the user can open the inputs form, or
          click the backdrop / "Maybe later" to dismiss and keep exploring. */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setPromptDismissed(true)}
            className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[#D4A868]/35 bg-card/95 p-4 shadow-2xl backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => setPromptDismissed(true)}
                aria-label="Dismiss"
                className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 pr-7">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D4A868]/12 text-[#D4A868]">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <h3 className="text-sm font-semibold text-foreground">
                  See your real numbers
                </h3>
              </div>
              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                You&apos;re viewing an example. Add a few details and your projection runs
                on your real figures:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {missingFields.map((f) => (
                  <span
                    key={f.key}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    <AlertCircle className="h-3 w-3" /> {f.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPromptDismissed(true);
                    openForm();
                  }}
                  className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#D4A868]/60 bg-[#D4A868] text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Add details
                </button>
                <button
                  type="button"
                  onClick={() => setPromptDismissed(true)}
                  className="min-h-[40px] rounded-xl px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fallback modal for hosts that don't render the form themselves. */}
      <AnimatePresence>
        {formOpen && !onOpenInputs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px] px-4"
            onClick={() => setFormOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[#D4A868]/25 bg-card/95 shadow-2xl backdrop-blur-xl"
            >
              <div className="px-5 pt-5 pb-6">
                <h3 className="text-lg font-semibold text-foreground">
                  Your cashflow inputs
                </h3>
                <div className="mt-1">
                  <CashflowInputsForm
                    onSaved={(ready) => {
                      void load();
                      if (ready) {
                        setFormOpen(false);
                        onReady?.();
                      }
                      onInputsSaved?.();
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="mt-3 w-full min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default CashflowGate;
