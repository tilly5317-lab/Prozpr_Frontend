import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import {
  getCashflowReadiness,
  saveCashflowInputs,
  computeCashflow,
  getMyPortfolio,
  type CashflowReadiness,
  type CashflowReadinessField,
  type CashflowInputValues,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

/**
 * Locks the goal-planning page until every input the cashflow engine needs is
 * supplied. While locked it renders a blurred full-screen overlay with an
 * "Unlock" card; clicking it opens a form pre-filled with whatever we already
 * have and asks only for what's missing. Nothing is sent to the engine until
 * it's complete — the projection never runs on placeholder numbers.
 *
 * The field list is driven entirely by the backend `/cashflow/readiness`
 * response, so the questions stay consistent with what the engine actually
 * consumes.
 */
interface CashflowGateProps {
  /** Called once readiness flips to true (initially or after the user fills the form). */
  onReady?: () => void;
  /**
   * Bump this number (e.g. from a "Settings" button) to open the inputs form on
   * demand — lets the user view/edit their cashflow inputs even when unlocked.
   */
  editSignal?: number;
}

const inputClass =
  "w-full min-h-[46px] rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const PFP_NUMERIC_KEYS = new Set([
  "annual_income",
  "monthly_household_expense",
  "financial_assets",
  "financial_liabilities_excl_mortgage",
  "starting_monthly_investment",
  "current_portfolio_corpus",
]);

/** Show numeric inputs with thousands separators (Indian grouping), e.g. 12,34,567. */
function formatWithCommas(raw: string): string {
  if (!raw) return "";
  const dot = raw.indexOf(".");
  const intStr = dot >= 0 ? raw.slice(0, dot) : raw;
  const decStr = dot >= 0 ? raw.slice(dot + 1) : null;
  const intGrouped = intStr === "" ? "" : Number(intStr).toLocaleString("en-IN");
  if (decStr === null) return intGrouped;
  return `${intGrouped === "" ? "0" : intGrouped}.${decStr}`;
}

function groupFields(fields: CashflowReadinessField[]): [string, CashflowReadinessField[]][] {
  const order: string[] = [];
  const map = new Map<string, CashflowReadinessField[]>();
  for (const f of fields) {
    if (!map.has(f.group)) {
      map.set(f.group, []);
      order.push(f.group);
    }
    map.get(f.group)!.push(f);
  }
  return order.map((g) => [g, map.get(g)!]);
}

const CashflowGate = ({ onReady, editSignal }: CashflowGateProps) => {
  const [readiness, setReadiness] = useState<CashflowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Total portfolio value, used to prefill "Current portfolio corpus" when the
  // user hasn't entered one yet (sourced from CAMS / the portfolio page).
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getMyPortfolio()
      .then((p) => { if (active) setPortfolioValue(p.total_value ?? null); })
      .catch(() => { /* no portfolio yet — field just stays blank */ });
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCashflowReadiness();
      setReadiness(res);
      if (res.ready) onReady?.();
    } catch {
      // If readiness can't be fetched, fail safe to LOCKED so we never reveal a
      // page backed by placeholder data.
      setReadiness({ ready: false, missing: [], fields: [] });
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
      if (f.value != null) {
        seed[f.key] = String(f.value);
      } else if (f.key === "current_portfolio_corpus" && portfolioValue != null) {
        // Prefill the MF portfolio corpus from the live portfolio value.
        seed[f.key] = String(Math.round(portfolioValue));
      } else {
        seed[f.key] = "";
      }
    }
    setValues(seed);
    setErrors({});
    setFormOpen(true);
  }, [readiness, portfolioValue]);

  // Open the form when the parent bumps editSignal (Settings button). Skip the
  // initial mount (editSignal === undefined / 0) so it only reacts to clicks.
  useEffect(() => {
    if (editSignal && readiness) openForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  const grouped = useMemo(
    () =>
      readiness ? groupFields(readiness.fields) : [],
    [readiness],
  );

  const setVal = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const validateAndBuild = useCallback((): CashflowInputValues | null => {
    if (!readiness) return null;
    const nextErrors: Record<string, string> = {};
    const out: CashflowInputValues = {};

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
        out.date_of_birth = raw;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        nextErrors[f.key] = "Enter a valid number";
        continue;
      }
      if (f.kind === "percent") {
        if (n > 100) {
          nextErrors[f.key] = "Must be 0–100";
          continue;
        }
        out.effective_tax_rate = n / 100;
      } else if (f.kind === "int") {
        if (f.key === "assumed_lifespan_years") out.assumed_lifespan_years = Math.round(n);
        else if (f.key === "retirement_age") out.retirement_age = Math.round(n);
      } else if (PFP_NUMERIC_KEYS.has(f.key)) {
        (out as Record<string, number>)[f.key] = n;
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
        description: "Fill in every required field to unlock goal planning.",
        variant: "destructive",
      });
      return;
    }
    const wasReady = !!readiness?.ready;
    setSaving(true);
    try {
      await saveCashflowInputs(payload);
      const res = await getCashflowReadiness();
      setReadiness(res);
      if (res.ready) {
        setFormOpen(false);
        toast({
          title: wasReady ? "Inputs updated" : "Goal planning unlocked",
          description: "Rebuilding your projection…",
        });
        // Recompute so the page reflects the just-saved numbers (the profile
        // edits also marked the previous run stale on the backend).
        computeCashflow().catch(() => {});
        onReady?.();
      } else {
        toast({
          title: "Almost there",
          description: "A few inputs are still missing.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Couldn't save",
        description: "Please check your inputs and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [validateAndBuild, onReady]);

  const ready = !!readiness?.ready;
  // Lock overlay only while locked or still checking. When ready, render nothing
  // here — but the form (below) can still be opened on demand for editing.
  const showLockOverlay = loading || !ready;

  const missingCount = readiness
    ? readiness.fields.filter((f) => !f.optional && !f.present).length
    : 0;

  return (
    <>
      {/* Blurred lock overlay over the page — stops above the bottom nav
          (bottom-16) and sits below it (z-40 < nav z-50) so the nav stays
          sharp and tappable. */}
      {showLockOverlay && (
      <div className="fixed inset-x-0 top-0 bottom-16 z-40 flex items-center justify-center px-6 backdrop-blur-md bg-background/70">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Checking your goal plan…</span>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[#D4A868]/35 bg-card/55 p-6 text-center shadow-2xl backdrop-blur-xl"
          >
            {/* Soft golden glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-16 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-[#D4A868]/25 blur-3xl"
            />
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D4A868]/40 bg-[#D4A868]/10">
              <Lock className="h-6 w-6 text-[#D4A868]" strokeWidth={2} />
            </div>
            <h2 className="relative mt-4 text-lg font-semibold text-foreground">Goal planning is locked</h2>
            <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
              To project your cashflow on your real numbers, we need a few details
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
              Unlock goal planning
            </button>
          </motion.div>
        )}
      </div>
      )}

      {/* Inputs form — used both to unlock (locked) and to edit (Settings). */}
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
                  {ready ? "Edit your cashflow inputs" : "Complete your cashflow inputs"}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  These are the exact figures the goal-planning engine uses. Pre-filled
                  with your current values — update any of them and save to re-run the projection.
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
                            {f.kind === "date" ? (
                              <input
                                type="date"
                                value={values[f.key] ?? ""}
                                onChange={(e) => setVal(f.key, e.target.value)}
                                className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
                              />
                            ) : f.kind === "percent" ? (
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.5"
                                value={values[f.key] ?? ""}
                                onChange={(e) => setVal(f.key, e.target.value)}
                                className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
                              />
                            ) : (
                              // Money / count fields — text input so we can show thousands separators.
                              <input
                                type="text"
                                inputMode="numeric"
                                value={formatWithCommas(values[f.key] ?? "")}
                                onChange={(e) => setVal(f.key, e.target.value.replace(/[^\d.]/g, ""))}
                                className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
                              />
                            )}
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

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void submit()}
                  className="mt-7 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-[#D4A868]/60 bg-[#D4A868] text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(212,168,104,0.7)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {saving ? "Saving…" : ready ? "Save changes" : "Save & unlock"}
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

export default CashflowGate;
