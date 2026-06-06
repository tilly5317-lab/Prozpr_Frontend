import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2, ShieldCheck, AlertCircle, Upload, CheckCircle2 } from "lucide-react";
import {
  getRebalancingReadiness,
  saveRebalancingInputs,
  runRebalancing,
  type RebalancingReadiness,
  type RebalancingReadinessField,
  type RebalancingInputValues,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

/**
 * Locks the /invest page until everything the rebalancing engine needs is in
 * place — modelled on the goal-planning CashflowGate. While locked it renders a
 * blurred overlay with an "Unlock" card; the form asks only for what's missing
 * (today: date of birth) and, when the user has no mutual-fund holdings, points
 * them at the connect-portfolio flow instead (holdings can't be typed in).
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

const RebalanceGate = ({ onReady, editSignal }: RebalanceGateProps) => {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<RebalancingReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRebalancingReadiness();
      setReadiness(res);
      if (res.ready) onReady?.();
    } catch {
      // Fail safe to LOCKED so we never reveal a page backed by placeholder data.
      setReadiness({ ready: false, missing: [], fields: [], has_holdings: false });
    } finally {
      setLoading(false);
    }
  }, [onReady]);

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

  const ready = !!readiness?.ready;
  const showLockOverlay = loading || generating || !ready;
  const missingCount = readiness
    ? readiness.fields.filter((f) => !f.optional && !f.present).length +
      (readiness.has_holdings ? 0 : 1)
    : 0;
  const needsHoldings = !!readiness && !readiness.has_holdings;

  return (
    <>
      {/* Blurred lock overlay — stops above the bottom nav and sits below it. */}
      {showLockOverlay && (
        <div className="fixed inset-x-0 top-0 bottom-16 z-40 flex items-center justify-center px-6 backdrop-blur-md bg-background/70">
          {loading || generating ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">
                {generating ? "Generating your rebalancing plan…" : "Checking your plan…"}
              </span>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[#D4A868]/35 bg-card/55 p-6 text-center shadow-2xl backdrop-blur-xl"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -top-16 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-[#D4A868]/25 blur-3xl"
              />
              <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4A868]/40 bg-[#D4A868]/10">
                <Lock className="h-6 w-6 text-[#D4A868]" strokeWidth={2} />
              </div>
              <h2 className="relative mt-4 text-lg font-semibold text-foreground">Rebalancing is locked</h2>
              <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
                To plan your trades on your real numbers, we need a few details
                {missingCount > 0 ? (
                  <> — <span className="font-semibold text-[#D4A868]">{missingCount} still missing</span>.</>
                ) : (
                  "."
                )}{" "}
                Nothing is estimated or guessed.
              </p>
              <button
                type="button"
                onClick={openForm}
                className="relative mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#D4A868]/60 bg-[#D4A868] text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(212,168,104,0.7)] transition-opacity hover:opacity-90"
              >
                <ShieldCheck className="h-4 w-4" />
                Unlock rebalancing
              </button>
            </motion.div>
          )}
        </div>
      )}

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
                        Rebalancing plans trades against your real holdings. Upload your
                        latest CAMS statement, then come back to generate your plan.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate("/cams-upload")}
                        className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-input bg-background text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <Upload className="h-4 w-4" />
                        Upload your CAMS statement
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3.5 py-3">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Holdings connected
                      </span>
                      <button
                        type="button"
                        onClick={() => navigate("/cams-upload")}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4A868] hover:underline"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload latest CAMS
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
    </>
  );
};

export default RebalanceGate;
