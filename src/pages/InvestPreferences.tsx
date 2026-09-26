import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import BottomNav from "@/components/BottomNav";
import AssetMixBar from "@/components/invest/AssetMixBar";
import PreferenceScopeNotice, { type CarveOutKey } from "@/components/invest/PreferenceScopeNotice";
import SubcategoryPins from "@/components/invest/SubcategoryPins";
import {
  getInvestmentPreferences,
  saveInvestmentPreferences,
  type ClassMix,
  type ScreenSubcategory,
} from "@/lib/api";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  CLASSES,
  fromCurrentHoldings,
  fromSavedPins,
  isEngaged,
  lookThroughMix,
  normalise,
  recommendedMix,
  recommendedValues,
  roundMix,
  sameMix,
  samePins,
  toSavePins,
  type RowValues,
} from "@/lib/investment-preferences";

const FALLBACK: ClassMix = { equity: 60, debt: 35, others: 5 }; // pre-load only; render gates on "loaded"

/** Height of the app-wide BottomNav the sticky footer sits above. */
const BOTTOM_NAV_H = 72;
/** The footer is now a fixed two-button row — h-11 buttons inside py-3. */
const FOOTER_H = 68;

// Derived, not restated: CLASS_COLOR calls itself the single source app-wide,
// and a hand-copied legend is what makes that claim quietly false.
const LEGEND = CLASSES.map((c) => ({ c: CLASS_COLOR[c], label: CLASS_LABEL[c] }));

/**
 * Standing investment-preferences screen (`/invest/preferences`). The customer
 * sets an exact Equity / Debt / Commodity split on a draggable bar (against
 * Prozpr's bar) plus a complete subcategory distribution — all as a share of
 * total. Saving persists it and refreshes the customer's plans (backend eager
 * refresh).
 *
 * The composition root: it owns `mix` and `values`. Both are kept on the bar by
 * `normalise` at the two places a class budget can move — the bar itself and
 * the multi-asset slider — which is why the screen has no validity state, no
 * save gate beyond "something changed", and no error copy.
 */
export default function InvestPreferences() {
  const [load, setLoad] = useState<"loading" | "error" | "loaded">("loading");
  const [mix, setMix] = useState<ClassMix>(FALLBACK);
  const [values, setValues] = useState<RowValues>({});
  const [initialMix, setInitialMix] = useState<ClassMix>(FALLBACK);
  const [initialValues, setInitialValues] = useState<RowValues>({});
  const [rec, setRec] = useState<ClassMix>(FALLBACK);
  const [subs, setSubs] = useState<ScreenSubcategory[]>([]);
  const [carveOuts, setCarveOuts] = useState<CarveOutKey[]>([]);
  const [today, setToday] = useState<RowValues | null>(null);
  const [excludedPct, setExcludedPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [openCats, setOpenCats] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad("loading");
    getInvestmentPreferences()
      .then((data) => {
        if (cancelled) return;
        // The reference bar is the look-through of the catalog's own rows, not
        // the engine's separate class figure — that is what lets Reset to
        // Prozpr land balanced instead of overdrawing its own recommendation.
        const recMix = recommendedMix(data.subcategories);
        const startMix = data.saved?.class_mix ? roundMix(data.saved.class_mix) : recMix;
        const saved = fromSavedPins(data.saved?.pins ?? [], data.subcategories);
        // A saved distribution was stored against the bar of the day; a later
        // catalog or rounding change can leave it a tenth off. Put it back on
        // the bar before anyone looks at it.
        const startValues = isEngaged(saved) ? normalise(startMix, saved, data.subcategories) : saved;
        setMix(startMix);
        setInitialMix(startMix);
        setValues(startValues);
        setInitialValues(startValues);
        setRec(recMix);
        setSubs(data.subcategories);
        setCarveOuts(data.carve_outs_at_risk ?? []);
        // Absent, null and empty all read the same: the backend does not send
        // this yet, and a customer holding nothing has no today either (D8).
        // A payload that is present but every figure in it 0 is the same state
        // again, not a fourth one: `lookThroughMix` reads a set of zeros as
        // 0 equity / 0 debt / 100 Commodity, since Commodity is its derived
        // residual — a set of zeros cannot be drawn as a distribution, so
        // `holdings.length` is the wrong question. Whether ANY figure is
        // positive is the right one (spec §3.1).
        const holdings = data.current?.holdings ?? [];
        const todayValues = fromCurrentHoldings(holdings, data.subcategories);
        const hasToday = Object.values(todayValues).some((v) => (v ?? 0) > 0);
        setToday(hasToday ? todayValues : null);
        setExcludedPct(data.current?.excluded_pct ?? 0);
        setLoad("loaded");
      })
      .catch(() => {
        if (!cancelled) setLoad("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  const engaged = isEngaged(values);
  // Until the customer touches a category they are shown Prozpr's shape, fitted
  // to whatever bar they have set. Looking is not choosing: `values` stays blank
  // so an untouched screen still saves an empty payload — "engine decides".
  const effective = engaged ? values : normalise(mix, recommendedValues(subs), subs);

  // Dragging the bar moves every class budget under the distribution. Rescale it
  // to match, so a saved preference can never be off its own split.
  const changeMix = (m: ClassMix) => {
    setMix(m);
    if (engaged) setValues(normalise(m, values, subs));
  };

  const dirty =
    !sameMix(mix, initialMix) ||
    !samePins(toSavePins(values, subs), toSavePins(initialValues, subs));
  const canSave = dirty && !saving;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const resp = await saveInvestmentPreferences({
        class_mix: mix,
        pins: toSavePins(values, subs),
      });
      if (resp.blocked) toast.error(resp.blocked);
      else if (resp.no_op) toast("No changes to save");
      else {
        toast.success("Saved — your plans were refreshed");
        refetch();
      }
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [mix, values, subs, refetch]);

  return (
    <div
      className="mobile-container bg-background min-h-screen"
      style={{ paddingBottom: FOOTER_H + BOTTOM_NAV_H + 16 }}
    >
      <div className="px-5 pt-4">
        <h1 className="font-display text-[28px] leading-tight text-foreground">Decide your own Asset Class Mix</h1>
      </div>

      {load === "loading" ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your preferences…
        </div>
      ) : load === "error" ? (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-muted-foreground">
          <p>Couldn&rsquo;t load your preferences.</p>
          <button
            type="button"
            onClick={refetch}
            className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/40"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <section className="mx-5 mt-4 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-[15px] font-semibold text-foreground">Set your asset mix</h2>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {LEGEND.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: l.c }} />
                  {l.label}
                </span>
              ))}
            </div>

            <p className="mb-2 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground">
              Your preference
            </p>
            <AssetMixBar mode="interactive" mix={mix} onChange={changeMix} />
            {/* Directly under the bar it describes: with three bars in the card
                it otherwise reads as a note about the today bar. */}
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {"Drag the gold handles to set your split — it always totals 100%."}
            </p>

            <p className="mb-2 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground">
              Prozpr recommends
            </p>
            <AssetMixBar mode="reference" mix={rec} />

            {today ? (
              <>
                <p className="mb-2 mt-4 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-foreground">
                  Where you are today
                </p>
                <AssetMixBar mode="reference" mix={lookThroughMix(today, subs)} />
                {/* The rescale is the surprising part, not the omission: these
                    figures were inflated to fill the gap the excluded holdings left (spec §3.4). */}
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
                  {excludedPct > 0
                    ? `Excludes the ${excludedPct.toFixed(0)}% you hold outside the categories you set here, such as ELSS and direct stocks. The rest is scaled to 100%.`
                    : "Across the categories you set here."}
                </p>
              </>
            ) : null}
          </section>

          {/* Most customers are happy with our categories, so the detail stays
              folded away until someone asks for it. */}
          <section className="mx-5 mt-4 rounded-2xl border border-border bg-card p-4">
            {/* The heading wraps the button (the standard accordion pattern):
                a heading cannot sit inside a button, which takes phrasing
                content only, so this is how the section gets a real h2. */}
            <h2>
              <button
                type="button"
                onClick={() => setOpenCats((o) => !o)}
                aria-expanded={openCats}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-foreground">
                    Set your categories
                  </span>
                </span>
                <ChevronDown
                  className={`ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                    openCats ? "rotate-180" : ""
                  }`}
                />
              </button>
            </h2>

            {openCats ? (
              <>
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  {"Drag a divider to shift share between categories — or tap a number to type it."}
                </p>
                <SubcategoryPins mix={mix} values={effective} subcategories={subs} today={today} onChange={setValues} />
              </>
            ) : null}
          </section>

          {/* Context, not live status — so it scrolls with the page. */}
          <PreferenceScopeNotice keys={carveOuts} />

          {/* Sticky action bar, sitting directly above BottomNav so Save is
              always in view while the page scrolls. */}
          <div
            className="fixed inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl"
            style={{ bottom: BOTTOM_NAV_H }}
          >
            <div className="mx-auto flex max-w-md gap-2.5 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setMix(rec);
                  setValues({});
                }}
                className="h-11 flex-1 rounded-xl border border-input text-[13.5px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Reset to Prozpr
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void handleSave()}
                className="h-11 flex-1 rounded-xl bg-[#D4A868] text-[13.5px] font-semibold text-[#191307] transition-[filter] hover:brightness-[1.04] disabled:opacity-40"
              >
                {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save preferences"}
              </button>
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
