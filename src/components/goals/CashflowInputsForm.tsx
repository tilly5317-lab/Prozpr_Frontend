import { useCallback, useEffect, useMemo, useState } from "react";
import { Lock, Loader2, ShieldCheck, AlertCircle, Sparkles } from "lucide-react";
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
import { MARGINAL_TAX_RATE_OPTIONS } from "@/lib/taxRates";
import {
  trackDetailedOnboardingSectionCompleted,
  trackDetailedOnboardingSectionStarted,
} from "@/lib/detailedOnboardingAnalytics";

/**
 * The cashflow-inputs form: every input the goal-planning engine needs, shown
 * grouped and editable inline. Extracted from CashflowGate so it can render
 * anywhere (the goal page's side panel, the gate's modal) while writing back to
 * the same canonical profile fields — goal planning and profile/complete stay
 * in sync.
 *
 * The one exception is the current portfolio corpus: it is sourced from the
 * user's CAMS upload, so it stays read-only here with a prompt to upload a new
 * CAMS statement to change it. The field list is driven entirely by the backend
 * `/cashflow/readiness` response, so the questions stay consistent with what
 * the engine consumes.
 */
interface CashflowInputsFormProps {
  /**
   * Called after a successful save with the fresh readiness flag (true → the
   * engine now has everything it needs and a recompute has been kicked off).
   */
  onSaved?: (ready: boolean) => void;
  /**
   * Target year of the user's Retirement goal, when one exists. The engine
   * derives the planned retirement age from that goal (its year − birth year),
   * so the retirement-age input becomes read-only with an explainer — moving
   * the goal is the way to change it.
   */
  retirementGoalYear?: number | null;
}

/** Fields owned by another flow: the portfolio corpus comes from CAMS. */
const LOCKED_KEYS = new Set(["current_portfolio_corpus"]);

/** Frontend label/help overrides so the wording matches profile/complete. */
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

const CashflowInputsForm = ({ onSaved, retirementGoalYear }: CashflowInputsFormProps) => {
  const [readiness, setReadiness] = useState<CashflowReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Total portfolio value — shows "Current portfolio corpus" at today's NAV.
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
  const [corpusKind, setCorpusKind] = useState<"present" | "future" | null>(null);
  const [corpusInflation, setCorpusInflation] = useState("");
  const PROZPR_INFLATION = 6;

  // Detailed-onboarding funnel: the "Your cashflow inputs" step becomes active
  // whenever the form mounts.
  useEffect(() => {
    trackDetailedOnboardingSectionStarted("goal_planning");
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [readinessRes, portfolioRes, onboardingRes] = await Promise.allSettled([
        getCashflowReadiness(),
        getMyPortfolio(),
        getOnboardingProfile(),
      ]);
      if (!active) return;
      const portfolio =
        portfolioRes.status === "fulfilled" ? (portfolioRes.value.total_value ?? null) : null;
      setPortfolioValue(portfolio);
      const cash =
        onboardingRes.status === "fulfilled"
          ? { value: onboardingRes.value.financial_assets ?? null, loaded: true }
          : { value: null, loaded: false };
      setCashAssets(cash);
      if (readinessRes.status === "fulfilled") {
        const res = readinessRes.value;
        setReadiness(res);
        // Seed the editable values from the readiness snapshot.
        const seed: Record<string, string> = {};
        for (const f of res.fields) {
          if (f.key === "current_portfolio_corpus") {
            // Always show the LIVE portfolio value (today's NAV) so the corpus
            // tracks daily; fall back to the stored CAMS figure only when there
            // is no live portfolio value yet.
            seed[f.key] =
              portfolio != null && portfolio > 0
                ? String(Math.round(portfolio))
                : f.value != null
                  ? String(f.value)
                  : "";
          } else if (f.key === "financial_assets" && cash.loaded) {
            // Cash-only figure from the profile, never the readiness aggregate
            // that also includes "other assets".
            seed[f.key] = cash.value != null ? String(Math.round(cash.value)) : "";
          } else if (f.value != null) {
            seed[f.key] = String(f.value);
          } else {
            seed[f.key] = "";
          }
        }
        setValues(seed);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

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
  // canonical profile home (the same fields profile/complete uses). The
  // CAMS-sourced corpus (LOCKED_KEYS) is never written here.
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
      // Detailed-onboarding funnel: genuine success (validation passed + saved).
      trackDetailedOnboardingSectionCompleted("goal_planning");
      // Keep our cash-only snapshot in step with what we just wrote, so the
      // form keeps showing the edited figure (not the stale fetch from mount).
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
      onSaved?.(!!res.ready);
    } catch {
      toast({
        title: "Couldn't save",
        description: "Please check your inputs and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [readiness, values, onSaved, corpusKind, corpusInflation, yearsToRetirement]);

  const renderEditableField = (f: CashflowReadinessField) => {
    const err = errors[f.key];
    const showMissing = !f.present && !f.optional;

    // Retirement age stays editable even with a Retirement goal on the
    // timeline — the projection runs to the LATER of this age (60 if blank)
    // and the last goal, so the goal can only extend the horizon. A hint
    // explains that interplay.
    if (f.key === "retirement_age" && retirementGoalYear != null) {
      return (
        <div key={f.key}>
          <label className="flex items-center justify-between text-xs font-medium text-foreground/90">
            <span>
              {f.label}
              {f.unit ? (
                <span className="ml-1 font-normal text-muted-foreground">({f.unit})</span>
              ) : null}
            </span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            step="1"
            value={values[f.key] ?? ""}
            onChange={(e) => setVal(f.key, e.target.value)}
            className={`${inputClass} mt-1.5 ${err ? "border-destructive ring-1 ring-destructive" : ""}`}
          />
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
            Kept in sync with your Retirement goal ({retirementGoalYear}): saving a new
            age here moves that goal, and moving the goal updates this age.
          </p>
          {err && <p className="mt-1 text-[11px] font-medium text-destructive">{err}</p>}
        </div>
      );
    }

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
                  className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 text-center text-[11px] font-medium transition-colors ${
                    active
                      ? "border-[#D4A868]/60 bg-[#D4A868]/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                  <span className="font-normal text-muted-foreground/70">
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
                className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-[#D4A868]/40 bg-[#D4A868]/[0.06] px-2.5 py-1 text-[11px] font-medium text-[#D4A868] transition-colors hover:bg-[#D4A868]/10"
              >
                <Sparkles className="h-3 w-3" /> Prozpr suggests {PROZPR_INFLATION}%
              </button>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">
                We&apos;ll discount this back to today&apos;s money over your {yearsToRetirement()} year
                {yearsToRetirement() === 1 ? "" : "s"} to retirement.
              </p>
            </div>
          )}
          {f.help && !err && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">{f.help}</p>
          )}
          {err && <p className="mt-1 text-[11px] font-medium text-destructive">{err}</p>}
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
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
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
        ) : f.key === "effective_tax_rate" ? (
          // Marginal tax rate — same slab dropdown as /profile/complete. Writes
          // the same canonical field; stored value is a whole percent ("20"),
          // converted to a fraction by saveInputs on the way out.
          <select
            value={values[f.key] ?? ""}
            onChange={(e) => setVal(f.key, e.target.value)}
            className={`mt-1.5 w-full appearance-none rounded-xl border bg-card px-3.5 py-3 text-[15px] text-foreground outline-none transition-colors ${
              err
                ? "border-destructive ring-2 ring-destructive/40"
                : "border-border focus:border-accent focus:ring-2 focus:ring-accent/15"
            }`}
          >
            <option value="">Select your slab</option>
            {MARGINAL_TAX_RATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">{f.help}</p>
        )}
        {err && <p className="mt-1 text-[11px] font-medium text-destructive">{err}</p>}
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
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
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
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
        Update your CAMS to change this number.
      </p>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading your inputs…</span>
      </div>
    );
  }

  if (!readiness) {
    return (
      <p className="py-8 text-center text-xs text-muted-foreground">
        Couldn&apos;t load your cashflow inputs. Please try again.
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">
        Everything below is editable and syncs to your financial profile. Your current
        portfolio corpus is set from your CAMS upload — upload a new statement to change it.
      </p>

      <div className="mt-4 space-y-5">
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
    </div>
  );
};

export default CashflowInputsForm;
