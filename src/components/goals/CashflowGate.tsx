import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2, ShieldCheck, AlertCircle, Pencil, ChevronDown, ChevronUp } from "lucide-react";
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
 * "Unlock" card.
 *
 * Inputs split into two tiers:
 *  - Retirement age + tax rate are quick "what-if" levers, editable right here.
 *  - Everything else is the single source of truth on the user's financial
 *    profile, shown read-only behind a "View other inputs" expander; editing
 *    them routes to the full onboarding so each number lives in exactly one place.
 *
 * The field list is driven entirely by the backend `/cashflow/readiness`
 * response, so the questions stay consistent with what the engine consumes.
 */
interface CashflowGateProps {
  /** Called once readiness flips to true (initially or after the user fills the form). */
  onReady?: () => void;
  /**
   * Bump this number (e.g. from a "Settings" button) to open the inputs panel on
   * demand — lets the user review/adjust their cashflow inputs even when unlocked.
   */
  editSignal?: number;
}

/** Where the user edits the synced inputs (the single source of truth). */
const ONBOARDING_ROUTE = "/profile/complete";

/** Quick levers editable inline here; all other fields are read-only/synced. */
const EDITABLE_KEYS = new Set(["retirement_age", "effective_tax_rate"]);

const inputClass =
  "w-full min-h-[46px] rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const readonlyInputClass =
  "w-full min-h-[46px] rounded-xl border border-input bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground shadow-sm cursor-not-allowed";

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

/** Human-readable read-only value for a field (or an em-dash when not set). */
function displayValue(f: CashflowReadinessField, raw: string): string {
  if (raw == null || raw === "") return "—";
  if (f.kind === "date") return raw;
  if (f.kind === "percent") return `${raw}%`;
  return formatWithCommas(raw);
}

const CashflowGate = ({ onReady, editSignal }: CashflowGateProps) => {
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState<CashflowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Total portfolio value, used to show "Current portfolio corpus" when the
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
        // Show the MF portfolio corpus from the live portfolio value.
        seed[f.key] = String(Math.round(portfolioValue));
      } else {
        seed[f.key] = "";
      }
    }
    setValues(seed);
    setErrors({});
    setFormOpen(true);
  }, [readiness, portfolioValue]);

  // Open the panel when the parent bumps editSignal (Settings button). Skip the
  // initial mount (editSignal === undefined / 0) so it only reacts to clicks.
  useEffect(() => {
    if (editSignal && readiness) openForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  // Retirement age + tax rate are editable here; everything else is read-only
  // and synced from the financial profile (behind the "other inputs" expander).
  const editableFields = useMemo(
    () => (readiness ? readiness.fields.filter((f) => EDITABLE_KEYS.has(f.key)) : []),
    [readiness],
  );
  const otherGrouped = useMemo(
    () => (readiness ? groupFields(readiness.fields.filter((f) => !EDITABLE_KEYS.has(f.key))) : []),
    [readiness],
  );

  const setVal = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const goToOnboarding = useCallback(() => {
    setFormOpen(false);
    navigate(ONBOARDING_ROUTE);
  }, [navigate]);

  // Save just the inline-editable levers (retirement age, tax rate) and re-run
  // the projection. The read-only fields are never written here.
  const saveLevers = useCallback(async () => {
    if (!readiness) return;
    const nextErrors: Record<string, string> = {};
    const out: CashflowInputValues = {};
    for (const f of readiness.fields) {
      if (!EDITABLE_KEYS.has(f.key)) continue;
      const raw = (values[f.key] ?? "").trim();
      if (raw === "") {
        if (!f.optional) nextErrors[f.key] = "Required";
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
      } else if (f.key === "retirement_age") {
        out.retirement_age = Math.round(n);
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    const wasReady = !!readiness.ready;
    setSaving(true);
    try {
      await saveCashflowInputs(out);
      const res = await getCashflowReadiness();
      setReadiness(res);
      toast({
        title: wasReady ? "Inputs updated" : "Goal planning unlocked",
        description: "Rebuilding your projection…",
      });
      // Recompute so the page reflects the just-saved values.
      computeCashflow().catch(() => {});
      if (res.ready) {
        setFormOpen(false);
        onReady?.();
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
  }, [readiness, values, onReady]);

  const renderEditableField = (f: CashflowReadinessField) => {
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
          </span>
          {showMissing && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" /> Needed
            </span>
          )}
        </label>
        <input
          type="number"
          inputMode={f.kind === "percent" ? "decimal" : "numeric"}
          step={f.kind === "percent" ? "0.5" : "1"}
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
  };

  const renderReadonlyField = (f: CashflowReadinessField) => {
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
          type="text"
          readOnly
          disabled
          value={displayValue(f, values[f.key] ?? "")}
          className={`${readonlyInputClass} mt-1.5`}
        />
        {f.help && (
          <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">{f.help}</p>
        )}
      </div>
    );
  };

  const ready = !!readiness?.ready;
  // Lock overlay only while locked or still checking. When ready, render nothing
  // here — but the panel (below) can still be opened on demand for review.
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
              Review &amp; complete
            </button>
          </motion.div>
        )}
      </div>
      )}

      {/* Inputs panel — opened from the lock card or the Settings button.
          Retirement age + tax rate are editable; the rest are read-only and
          edited via the full onboarding (single source of truth). */}
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
                  Your cashflow inputs
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Retirement age and tax rate are quick levers you can change here. Your
                  other inputs are synced from your financial profile — edit those in your
                  full profile so each number lives in one place.
                </p>

                {/* Editable levers */}
                {editableFields.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Adjustable
                    </p>
                    <div className="mt-2 space-y-3.5">
                      {editableFields.map(renderEditableField)}
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveLevers()}
                      className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#D4A868]/60 bg-[#D4A868] text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(212,168,104,0.7)] transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                )}

                {/* Read-only synced inputs, behind an expander */}
                {otherGrouped.length > 0 && (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => setShowOther((v) => !v)}
                      className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs font-semibold text-foreground/90 transition-colors hover:bg-muted/50"
                    >
                      <span>{showOther ? "Hide other inputs" : "View other inputs"}</span>
                      {showOther ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {showOther && (
                      <>
                        {otherGrouped.map(([group, fields]) => (
                          <div key={group} className="mt-4">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {group}
                            </p>
                            <div className="mt-2 space-y-3.5">
                              {fields.map(renderReadonlyField)}
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={goToOnboarding}
                          className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit in full onboarding
                        </button>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                  className="mt-3 w-full min-h-[44px] text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
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
