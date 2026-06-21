import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Loader2, ShieldCheck, AlertCircle, Sparkles, X } from "lucide-react";
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
 * planning and profile/complete stay in sync. ("Cash & debt" and "Equities /
 * shares" are separate canonical fields; "Other assets" live in their own store
 * and are deliberately excluded.)
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
  /**
   * When true, open the inputs form automatically as soon as readiness loads
   * (used when arriving from the "What are you trying to achieve?" card so the
   * user lands straight on the input form). Fires once.
   */
  autoOpenInputs?: boolean;
}

/**
 * Fields that stay read-only here because they're owned by another flow. The
 * portfolio corpus comes from the user's CAMS upload, so it's changed by
 * uploading a new statement — not edited inline. Everything else is editable.
 */
const LOCKED_KEYS = new Set(["current_portfolio_corpus"]);

/**
 * Frontend label/help overrides for specific readiness fields, so the wording
 * matches profile/complete exactly. "Cash & debt" is cash, savings and debt
 * instruments only — equities live in the separate "Equities / shares" field, and
 * "other assets" (gold, unlisted shares, etc.) live in their own store. Each
 * screen writes the same canonical field, so editing one syncs the other.
 */
const FIELD_OVERRIDES: Record<string, { label?: string; help?: string }> = {
  financial_assets: {
    label: "Cash & debt",
    help: "Bank balance, fixed deposits and bonds. Equities are entered separately below; excludes other assets like gold or unlisted shares and your mutual-fund portfolio.",
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

const CashflowGate = ({ onReady, editSignal, autoOpenInputs }: CashflowGateProps) => {
  const [readiness, setReadiness] = useState<CashflowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  // The missing-inputs prompt is a dismissible hint, never a blocker — the user
  // can close it and keep using the (example/blank) page. Once dismissed it stays
  // hidden for this visit; it re-surfaces on the next page mount if still missing.
  const [promptDismissed, setPromptDismissed] = useState(false);
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
  // Retirement-amount entry: whether the figure is in today's money or a future
  // amount (at retirement), plus the inflation rate used to discount a future
  // amount back to a present value. 6% is the standard Prozpr assumption.
  const [corpusKind, setCorpusKind] = useState<"present" | "future">("present");
  const [corpusInflation, setCorpusInflation] = useState("");
  const PROZPR_INFLATION = 6;

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
    // A stored target corpus is a present-value figure; default the toggle to
    // "today's money" so re-opening reflects how it was saved.
    setCorpusKind("present");
    setCorpusInflation("");
    setFormOpen(true);
  }, [readiness, portfolioValue, cashAssets]);

  // Whole years from now until the planned retirement age (DOB + retirement_age
  // from the form values; falls back to the standard age 60). Used to discount a
  // future-dated retirement amount back to today's money.
  const yearsToRetirement = useCallback((): number => {
    const dob = values["date_of_birth"];
    if (!dob) return 0;
    const birth = new Date(dob);
    if (Number.isNaN(birth.getTime())) return 0;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
    const retRaw = Number(values["retirement_age"]);
    const retAge = Number.isFinite(retRaw) && retRaw > 0 ? retRaw : 60;
    return Math.max(0, retAge - age);
  }, [values]);

  // Open the panel when the parent bumps editSignal (Settings button). Skip the
  // initial mount (editSignal === undefined / 0) so it only reacts to clicks.
  useEffect(() => {
    if (editSignal && readiness) openForm();
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

  // Every input is shown, grouped by the backend's grouping. All are editable
  // except the CAMS-sourced corpus (see LOCKED_KEYS).
  const allGrouped = useMemo(
    () => (readiness ? groupFields(readiness.fields) : []),
    [readiness],
  );

  // Required inputs the engine still needs to run a real projection — drives the
  // dismissible prompt. Optional fields (missing = 0) never appear here.
  const missingFields = useMemo(
    () =>
      readiness
        ? readiness.fields
            .filter((f) => !f.present && !f.optional)
            .map((f) => withFieldOverrides(f))
        : [],
    [readiness],
  );

  // Show the dismissible "add a few details" prompt only when the plan isn't
  // ready, there's actually something missing, the user hasn't dismissed it, and
  // no other panel is open. It never blocks the page.
  const showPrompt =
    !loading && !formOpen && !promptDismissed && !!readiness && !readiness.ready && missingFields.length > 0;

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
      if (f.key === "target_corpus") {
        // Retirement amount → always stored as a present-value figure. A future
        // amount is discounted back to today using the chosen inflation rate.
        const amt = Number(raw);
        if (!Number.isFinite(amt) || amt < 0) {
          nextErrors[f.key] = "Enter a valid number";
          continue;
        }
        if (corpusKind === "future") {
          const inflPct = corpusInflation.trim() === "" ? PROZPR_INFLATION : Number(corpusInflation);
          if (!Number.isFinite(inflPct) || inflPct < 0 || inflPct > 50) {
            nextErrors[f.key] = "Inflation must be 0–50%";
            continue;
          }
          out[f.key] = Math.round(amt / Math.pow(1 + inflPct / 100, yearsToRetirement()));
        } else {
          out[f.key] = Math.round(amt);
        }
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
  }, [readiness, values, onReady, corpusKind, corpusInflation, yearsToRetirement]);

  const renderEditableField = (f: CashflowReadinessField) => {
    const err = errors[f.key];
    const showMissing = !f.present && !f.optional;

    // Retirement amount — money input plus a present/future-value toggle and (for
    // future amounts) an inflation rate with the Prozpr suggestion.
    if (f.key === "target_corpus") {
      return (
        <div key={f.key}>
          <label className="block text-xs font-medium text-foreground/90">
            {f.label}
            {f.unit ? <span className="ml-1 font-normal text-muted-foreground">({f.unit})</span> : null}
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={formatWithCommas(values[f.key] ?? "")}
            onChange={(e) => setVal(f.key, e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 5,00,00,000"
            className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
          />
          <div className="mt-2 flex gap-1.5">
            {([
              { id: "present" as const, label: "Today's value" },
              { id: "future" as const, label: "Future value" },
            ]).map((opt) => {
              const active = corpusKind === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCorpusKind(opt.id)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-[#D4A868]/60 bg-[#D4A868]/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                  <span className="ml-1 font-normal text-muted-foreground/70">
                    {opt.id === "present" ? "in today's money" : "amount at retirement"}
                  </span>
                </button>
              );
            })}
          </div>
          {corpusKind === "future" && (
            <div className="mt-2">
              <label className="block text-[11px] font-medium text-muted-foreground">
                Expected inflation (%/yr)
              </label>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={corpusInflation}
                onChange={(e) => setCorpusInflation(e.target.value)}
                placeholder={String(PROZPR_INFLATION)}
                className={`${inputClass} mt-1.5`}
              />
              <button
                type="button"
                onClick={() => setCorpusInflation(String(PROZPR_INFLATION))}
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#D4A868]/40 bg-[#D4A868]/[0.06] px-2.5 py-1 text-[10.5px] font-medium text-[#D4A868] transition-colors hover:bg-[#D4A868]/10"
              >
                <Sparkles className="h-3 w-3" /> Prozpr suggests {PROZPR_INFLATION}%
              </button>
              <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">
                We&apos;ll discount this back to today&apos;s money over your {yearsToRetirement()} year
                {yearsToRetirement() === 1 ? "" : "s"} to retirement.
              </p>
            </div>
          )}
          {f.help && !err && (
            <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">{f.help}</p>
          )}
          {err && <p className="mt-1 text-[10.5px] font-medium text-destructive">{err}</p>}
        </div>
      );
    }

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
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
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
        ) : f.kind === "money" ? (
          // Money fields show live Indian-grouped commas (12,34,567) while the
          // stored value stays digits-only, so saveInputs' Number() parse works.
          <input
            type="text"
            inputMode="numeric"
            value={formatWithCommas(values[f.key] ?? "")}
            onChange={(e) => setVal(f.key, e.target.value.replace(/\D/g, ""))}
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

  return (
    <>
      {/* Goal planning is never locked. While we're still checking readiness,
          show a brief, non-blocking "checking" pill; the page underneath stays
          fully usable (no blur/overlay) and the inputs form opens via Settings /
          auto-open. */}
      {loading && (
        <div className="pointer-events-none fixed inset-x-0 top-[68px] z-40 flex justify-center px-6">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-3 py-1 shadow-sm backdrop-blur-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Checking your goal plan…</span>
          </div>
        </div>
      )}

      {/* Dismissible "add a few details" prompt — lists the inputs the projection
          still needs, but never blocks the page. The user can open the inputs
          form or close the prompt and keep exploring the (example) page. */}
      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 z-[55] mx-auto max-w-md px-4"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 140px)" }}
          >
            <div className="relative overflow-hidden rounded-2xl border border-[#D4A868]/35 bg-card/95 p-4 shadow-2xl backdrop-blur-xl">
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
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground"
                  >
                    <AlertCircle className="h-3 w-3" /> {f.label}
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inputs panel — opened from the Settings button or auto-open. Every
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
