import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Loader2, ShieldCheck, AlertCircle } from "lucide-react";
import {
  getCashflowReadiness,
  saveCashflowInputs,
  computeCashflow,
  getMyPortfolio,
  getOnboardingProfile,
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
 * Every input is shown directly (nothing hidden behind an expander) and is
 * editable inline, writing back to the same canonical profile fields so goal
 * planning and profile/complete stay in sync. (Cash = the "Cash and financial
 * assets" figure only; "Other assets" live in their own store and are
 * deliberately excluded.)
 *
 * The one exception is the current portfolio corpus: it is sourced from the
 * user's CAMS upload, so it stays read-only here with a prompt to upload a new
 * CAMS statement to change it.
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

/**
 * Fields that stay read-only here because they're owned by another flow. The
 * portfolio corpus comes from the user's CAMS upload, so it's changed by
 * uploading a new statement — not edited inline. Everything else is editable.
 */
const LOCKED_KEYS = new Set(["current_portfolio_corpus"]);

/**
 * Frontend label/help overrides for specific readiness fields, so the wording
 * matches profile/complete exactly. "Cash and financial assets" is cash + market
 * holdings only — it deliberately excludes the separate "other assets" (gold,
 * unlisted shares, etc.), which live in their own store and never roll into this
 * figure. The two screens write the same canonical field, so editing one syncs
 * the other.
 */
const FIELD_OVERRIDES: Record<string, { label?: string; help?: string }> = {
  financial_assets: {
    label: "Cash and financial assets",
    help: "Cash, mutual funds, stocks, ETFs, bonds and similar holdings. Excludes other assets like gold or unlisted shares.",
  },
};

const withFieldOverrides = (f: CashflowReadinessField): CashflowReadinessField => {
  const o = FIELD_OVERRIDES[f.key];
  return o ? { ...f, label: o.label ?? f.label, help: o.help ?? f.help } : f;
};

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
  const [readiness, setReadiness] = useState<CashflowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Total portfolio value, used to show "Current portfolio corpus" when the
  // user hasn't entered one yet (sourced from CAMS / the portfolio page).
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  // The canonical "Cash and financial assets" figure (cash + market holdings
  // only) straight from the profile — the same field profile/complete writes.
  // We seed the financial_assets input from this rather than the readiness
  // value, because the engine's readiness figure folds in "other assets" and we
  // must show/sync the cash-only number. `loaded` distinguishes "fetched, none
  // set" (→ blank) from "fetch failed" (→ fall back to the readiness value).
  const [cashAssets, setCashAssets] = useState<{ value: number | null; loaded: boolean }>({
    value: null,
    loaded: false,
  });

  useEffect(() => {
    let active = true;
    getMyPortfolio()
      .then((p) => { if (active) setPortfolioValue(p.total_value ?? null); })
      .catch(() => { /* no portfolio yet — field just stays blank */ });
    getOnboardingProfile()
      .then((p) => { if (active) setCashAssets({ value: p.financial_assets ?? null, loaded: true }); })
      .catch(() => { /* keep loaded:false so we fall back to the readiness value */ });
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
      if (f.key === "financial_assets" && cashAssets.loaded) {
        // Cash-only figure from the profile, never the readiness aggregate that
        // also includes "other assets".
        seed[f.key] = cashAssets.value != null ? String(Math.round(cashAssets.value)) : "";
      } else if (f.value != null) {
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
  }, [readiness, portfolioValue, cashAssets]);

  // Open the panel when the parent bumps editSignal (Settings button). Skip the
  // initial mount (editSignal === undefined / 0) so it only reacts to clicks.
  useEffect(() => {
    if (editSignal && readiness) openForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignal]);

  // Every input is shown, grouped by the backend's grouping. All are editable
  // except the CAMS-sourced corpus (see LOCKED_KEYS).
  const allGrouped = useMemo(
    () => (readiness ? groupFields(readiness.fields) : []),
    [readiness],
  );

  const setVal = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  // Save every editable input and re-run the projection. Readiness field keys
  // line up with CashflowInputValues by design, so each value is written to its
  // canonical profile home (the same fields profile/complete uses) — keeping the
  // two screens in sync. The CAMS-sourced corpus (LOCKED_KEYS) is never written
  // here; it changes only via a new CAMS upload.
  const saveInputs = useCallback(async () => {
    if (!readiness) return;
    const nextErrors: Record<string, string> = {};
    const out: Record<string, number | string> = {};
    for (const f of readiness.fields) {
      if (LOCKED_KEYS.has(f.key)) continue;
      const raw = (values[f.key] ?? "").trim();
      if (raw === "") {
        if (!f.optional) nextErrors[f.key] = "Required";
        continue;
      }
      if (f.kind === "date") {
        out[f.key] = raw;
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
        // The engine stores tax as a fraction (0.22), the form collects a percent.
        out[f.key] = n / 100;
      } else {
        // money / int — whole units.
        out[f.key] = Math.round(n);
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    const wasReady = !!readiness.ready;
    setSaving(true);
    try {
      await saveCashflowInputs(out as CashflowInputValues);
      // Keep our cash-only snapshot in step with what we just wrote, so reopening
      // the panel shows the edited figure (not the stale fetch from mount).
      if (typeof out.financial_assets === "number") {
        setCashAssets({ value: out.financial_assets, loaded: true });
      }
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
        {f.kind === "date" ? (
          <input
            type="date"
            value={values[f.key] ?? ""}
            onChange={(e) => setVal(f.key, e.target.value)}
            className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
          />
        ) : (
          <input
            type="number"
            inputMode={f.kind === "percent" ? "decimal" : "numeric"}
            step={f.kind === "percent" ? "0.5" : "1"}
            value={values[f.key] ?? ""}
            onChange={(e) => setVal(f.key, e.target.value)}
            className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
          />
        )}
        {f.help && !err && (
          <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">{f.help}</p>
        )}
        {err && <p className="mt-1 text-[10.5px] font-medium text-destructive">{err}</p>}
      </div>
    );
  };

  // The CAMS-sourced corpus: read-only, with a prompt to upload a new CAMS
  // statement (the only way to change it).
  const renderLockedField = (f: CashflowReadinessField) => (
    <div key={f.key}>
      <label className="flex items-center justify-between text-xs font-medium text-foreground/90">
        <span>
          {f.label}
          {f.unit ? (
            <span className="ml-1 font-normal text-muted-foreground">({f.unit})</span>
          ) : null}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
          <Lock className="h-3 w-3" /> From CAMS
        </span>
      </label>
      <input
        type="text"
        readOnly
        disabled
        value={displayValue(f, values[f.key] ?? "")}
        className={`${readonlyInputClass} mt-1.5`}
      />
      <p className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground/80">
        Update your CAMS to change this number.
      </p>
    </div>
  );

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

      {/* Inputs panel — opened from the lock card or the Settings button. Every
          input is shown and editable except the CAMS-sourced portfolio corpus. */}
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
                  Everything below is editable and syncs to your financial profile.
                  Your current portfolio corpus is set from your CAMS upload — upload a
                  new statement to change it.
                </p>

                {/* All inputs, grouped and shown directly. Everything is editable
                    except the CAMS-sourced corpus. */}
                <div className="mt-5 space-y-5">
                  {allGrouped.map(([group, fields]) => (
                    <div key={group}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group}
                      </p>
                      <div className="mt-2 space-y-3.5">
                        {fields.map((raw) => {
                          const f = withFieldOverrides(raw);
                          return LOCKED_KEYS.has(f.key) ? renderLockedField(f) : renderEditableField(f);
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveInputs()}
                  className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#D4A868]/60 bg-[#D4A868] text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(212,168,104,0.7)] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {saving ? "Saving…" : "Save changes"}
                </button>

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
