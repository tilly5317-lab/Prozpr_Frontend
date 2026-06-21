import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ShieldCheck, AlertCircle, Upload, CheckCircle2, Sparkles, X } from "lucide-react";
import {
  getRebalancingReadiness,
  saveRebalancingInputs,
  runRebalancing,
  type RebalancingReadiness,
  type RebalancingReadinessField,
  type RebalancingInputValues,
} from "@/lib/api";
import CamsUploadModal from "@/components/onboarding/CamsUploadModal";
import { toast } from "@/hooks/use-toast";

/**
 * Helps the user complete what the rebalancing engine needs — modelled on the
 * goal-planning CashflowGate. It NEVER blocks the page: when something is missing
 * it shows a dismissible prompt listing the missing inputs (today: date of birth
 * and, when there are no mutual-fund holdings, a CAMS upload — holdings can't be
 * typed in). The page behind stays usable and renders an example plan.
 *
 * Once every input is present it saves to the canonical profile table, RUNS the
 * rebalancing engine, then calls `onReady` so the page can load the fresh plan.
 * Nothing is computed on placeholder data.
 *
 * The field list is driven entirely by the backend `/rebalancing/readiness`
 * response so the questions stay consistent with what the engine consumes.
 */
interface RebalanceGateProps {
  /** Called once a rebalancing plan exists (ready on mount, or after unlock). */
  onReady?: () => void;
  /**
   * Fired every time readiness resolves, with whether the plan is ready. Lets the
   * page drop its initial spinner and show the example plan when not ready.
   */
  onResolved?: (ready: boolean) => void;
  /** Bump (e.g. from a "Re-run" button) to open the inputs form on demand. */
  editSignal?: number;
}

const inputClass =
  "w-full min-h-[46px] rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function groupFields(fields: RebalancingReadinessField[]): [string, RebalancingReadinessField[]][] {
  const order: string[] = [];
  const map = new Map<string, RebalancingReadinessField[]>();
  for (const f of fields) {
    if (!map.has(f.group)) {
      map.set(f.group, []);
      order.push(f.group);
    }
    map.get(f.group)!.push(f);
  }
  return order.map((g) => [g, map.get(g)!]);
}

const RebalanceGate = ({ onReady, onResolved, editSignal }: RebalanceGateProps) => {
  const [readiness, setReadiness] = useState<RebalancingReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [camsOpen, setCamsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // The missing-inputs prompt is a dismissible hint, never a blocker. Once
  // dismissed it stays hidden for this visit (re-surfaces on the next mount).
  const [promptDismissed, setPromptDismissed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRebalancingReadiness();
      setReadiness(res);
      onResolved?.(res.ready);
      if (res.ready) onReady?.();
    } catch {
      // On error, treat as not-ready: the page shows an example plan and the
      // prompt offers to add the missing inputs — but it's never blocked.
      setReadiness({ ready: false, missing: [], fields: [], has_holdings: false });
      onResolved?.(false);
    } finally {
      setLoading(false);
    }
  }, [onReady, onResolved]);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = useCallback(() => {
    if (!readiness) return;
    const seed: Record<string, string> = {};
    for (const f of readiness.fields) {
      seed[f.key] = f.value == null ? "" : String(f.value);
    }
    setValues(seed);
    setErrors({});
    setFormOpen(true);
  }, [readiness]);

  // Open the form when the parent bumps editSignal. Skip the initial mount.
  useEffect(() => {
    if (editSignal && readiness) openForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  const grouped = useMemo(
    () => (readiness ? groupFields(readiness.fields) : []),
    [readiness],
  );

  const setVal = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const validateAndBuild = useCallback((): RebalancingInputValues | null => {
    if (!readiness) return null;
    const nextErrors: Record<string, string> = {};
    const out: RebalancingInputValues = {};

    for (const f of readiness.fields) {
      const raw = (values[f.key] ?? "").trim();
      if (raw === "") {
        if (!f.optional) nextErrors[f.key] = "Required";
        continue;
      }
      if (f.kind === "date") {
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          nextErrors[f.key] = "Enter a valid date";
          continue;
        }
        if (f.key === "date_of_birth") out.date_of_birth = raw;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }
    return out;
  }, [readiness, values]);

  const submit = useCallback(async () => {
    const payload = validateAndBuild();
    if (!payload) {
      toast({
        title: "Some fields need attention",
        description: "Fill in every required field to unlock rebalancing.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await saveRebalancingInputs(payload);
      const res = await getRebalancingReadiness();
      setReadiness(res);
      if (!res.ready) {
        // Still blocked — almost always missing holdings (can't be typed in).
        toast({
          title: res.has_holdings ? "Almost there" : "Connect your portfolio",
          description: res.has_holdings
            ? "A few inputs are still missing."
            : "Link your mutual-fund portfolio to generate your plan.",
          variant: "destructive",
        });
        return;
      }
      // Everything the engine needs is present — run it, then reveal the plan.
      setFormOpen(false);
      setGenerating(true);
      toast({ title: "Rebalancing unlocked", description: "Generating your plan…" });
      const result = await runRebalancing();
      if (result.blocking_message) {
        toast({
          title: "Couldn't generate the plan",
          description: result.blocking_message,
          variant: "destructive",
        });
        await load();
        return;
      }
      await load();
    } catch {
      toast({
        title: "Couldn't save",
        description: "Please check your inputs and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
      setGenerating(false);
    }
  }, [validateAndBuild, load]);

  // Open the CAMS popup. Close the inputs form first so the popup isn't hidden
  // behind it (and so the typed-but-unsaved values aren't visually stranded).
  const openCams = useCallback(() => {
    setFormOpen(false);
    setCamsOpen(true);
  }, []);

  // After a CAMS statement is ingested the backend has refreshed the
  // transactions + fund-holding tables. Re-check readiness and regenerate the
  // rebalancing plan against the new holdings — all automatic, no extra taps.
  const handleCamsUploaded = useCallback(async () => {
    setCamsOpen(false);
    try {
      const res = await getRebalancingReadiness();
      setReadiness(res);
      if (!res.ready) {
        // Holdings are in now, but a typed input (e.g. date of birth) is still
        // missing — the lock card will prompt for it.
        toast({
          title: "Holdings updated",
          description: "A few inputs are still needed to generate your plan.",
        });
        return;
      }
      setGenerating(true);
      toast({ title: "Holdings updated", description: "Regenerating your rebalancing plan…" });
      const result = await runRebalancing();
      if (result.blocking_message) {
        toast({
          title: "Couldn't regenerate the plan",
          description: result.blocking_message,
          variant: "destructive",
        });
      }
      await load();
    } catch {
      toast({
        title: "Couldn't refresh your plan",
        description: "Your statement was imported, but regenerating failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }, [load]);

  const ready = !!readiness?.ready;
  const needsHoldings = !!readiness && !readiness.has_holdings;
  // Required inputs still missing — required fields, plus a CAMS upload when
  // there are no holdings to plan against (holdings can't be typed in). Drives the
  // dismissible prompt; it never blocks the page.
  const missingItems = readiness
    ? [
        ...readiness.fields
          .filter((f) => !f.optional && !f.present)
          .map((f) => ({ key: f.key, label: f.label })),
        ...(readiness.has_holdings
          ? []
          : [{ key: "cams", label: "CAMS statement (your holdings)" }]),
      ]
    : [];
  // Show the prompt only when readiness has resolved to not-ready, something is
  // actually missing, the user hasn't dismissed it, and no panel is open.
  const showPrompt =
    !loading &&
    !generating &&
    !formOpen &&
    !camsOpen &&
    !promptDismissed &&
    !ready &&
    missingItems.length > 0;

  return (
    <>
      {/* Non-blocking status pill while checking readiness or (re)generating the
          plan — the page behind stays fully usable, no blur/overlay. */}
      {(loading || generating) && (
        <div className="pointer-events-none fixed inset-x-0 top-[44px] z-40 flex justify-center px-6">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 shadow-sm backdrop-blur-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              {generating ? "Generating your rebalancing plan…" : "Checking your plan…"}
            </span>
          </div>
        </div>
      )}

      {/* Dismissible "complete your inputs" prompt — lists what's missing (e.g.
          date of birth, CAMS) so the engine can run on real numbers. Centred over
          a dimmed, blurred backdrop so it stands out from the example plan behind
          it; clicking the backdrop (or "Maybe later") dismisses it to keep
          exploring. */}
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
                  See your real rebalancing plan
                </h3>
              </div>
              <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                You&apos;re viewing an example. Add a few details and we&apos;ll plan trades
                on your real holdings:
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {missingItems.map((m) => (
                  <span
                    key={m.key}
                    className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-400"
                  >
                    <AlertCircle className="h-3 w-3" /> {m.label}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={openForm}
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

      {/* Inputs form — used both to unlock (locked) and to edit / re-run. */}
      <AnimatePresence>
        {formOpen && readiness && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px] px-4"
            onClick={() => !saving && setFormOpen(false)}
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
                  {ready ? "Edit your rebalancing inputs" : "Complete your rebalancing inputs"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  These are the exact details the rebalancing engine uses to plan
                  your trades. Pre-filled with your current values — update and save
                  to generate a fresh plan.
                </p>

                {grouped.map(([group, fields]) => (
                  <div key={group} className="mt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </p>
                    <div className="mt-2 space-y-3.5">
                      {fields.map((f) => {
                        const err = errors[f.key];
                        const showMissing = !f.present && !f.optional;
                        return (
                          <div key={f.key}>
                            <label className="flex items-center justify-between text-xs font-medium text-foreground/90">
                              <span>
                                {f.label}
                                {f.unit ? (
                                  <span className="ml-1 font-normal text-muted-foreground">({f.unit})</span>
                                ) : null}
                                {f.optional ? (
                                  <span className="ml-1 font-normal text-muted-foreground/70">· optional</span>
                                ) : null}
                              </span>
                              {showMissing && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                  <AlertCircle className="h-3 w-3" /> Needed
                                </span>
                              )}
                            </label>
                            <input
                              type={f.kind === "date" ? "date" : "number"}
                              inputMode={f.kind === "date" ? undefined : "decimal"}
                              step={f.kind === "percent" ? "0.5" : f.kind === "int" ? "1" : "any"}
                              value={values[f.key] ?? ""}
                              onChange={(e) => setVal(f.key, e.target.value)}
                              className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
                            />
                            {f.help && !err && (
                              <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">{f.help}</p>
                            )}
                            {err && <p className="mt-1 text-[10.5px] font-medium text-destructive">{err}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Holdings can't be typed — drive them from a CAMS statement.
                    Shown as a required step when missing, and always available so
                    the user can refresh with their latest CAMS. */}
                <div className="mt-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Your portfolio
                  </p>
                  {needsHoldings ? (
                    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5" /> No mutual-fund holdings found
                      </p>
                      <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">
                        Rebalancing plans trades against your real holdings. Add your
                        latest CAMS statement (with its password) — we&apos;ll extract your
                        transactions &amp; holdings and generate your plan automatically.
                      </p>
                      <button
                        type="button"
                        onClick={openCams}
                        className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-input bg-background text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <Upload className="h-4 w-4" />
                        Add CAMS &amp; extract holdings
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Holdings connected
                      </span>
                      <button
                        type="button"
                        onClick={openCams}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4A868] hover:underline"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Update CAMS
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submit()}
                  className="mt-7 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#D4A868]/60 bg-[#D4A868] text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(212,168,104,0.7)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {saving ? "Saving…" : ready ? "Save & re-run" : "Save & unlock"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                  className="mt-3 w-full min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline CAMS upload — same flow as /cams-upload (file + password →
          extract transactions & holdings), shown as a popup card. On success we
          refresh holdings and regenerate the rebalancing plan automatically. */}
      <CamsUploadModal
        open={camsOpen}
        onClose={() => setCamsOpen(false)}
        onUploaded={() => void handleCamsUploaded()}
        // Rebalancing inputs: a fresh statement fully replaces old CAMS data so the plan
        // is recomputed from the latest holdings/transactions, not merged with stale ones.
        replaceExisting
      />
    </>
  );
};

export default RebalanceGate;
