import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import BottomNav from "@/components/BottomNav";
import AssetMixBar from "@/components/invest/AssetMixBar";
import CarveOutNotice, { type CarveOutKey } from "@/components/invest/CarveOutNotice";
import SubcategoryPins from "@/components/invest/SubcategoryPins";
import {
  getInvestmentPreferences,
  saveInvestmentPreferences,
  type ClassMix,
  type ScreenSubcategory,
} from "@/lib/api";
import {
  CLASS_LABEL,
  CLASSES,
  classStatus,
  distributionValid,
  fromSavedPins,
  isEngaged,
  recommendedMix,
  resetValues,
  roundMix,
  sameMix,
  samePins,
  toSavePins,
  type RowValues,
} from "@/lib/investment-preferences";

const FALLBACK: ClassMix = { equity: 60, debt: 35, others: 5 }; // pre-load only; render gates on "loaded"

/** The disabled Save button points at this element, so the reason a customer
 *  can't save is announced as well as shown. */
const REASON_ID = "save-reason";

/** Height of the app-wide BottomNav the sticky footer sits above. */
const BOTTOM_NAV_H = 72;

const LEGEND: { c: string; label: string }[] = [
  { c: "hsl(var(--bucket-equity))", label: "Equity" },
  { c: "hsl(var(--bucket-debt))", label: "Debt" },
  { c: "hsl(var(--wealth-amber))", label: "Commodity" },
];

/**
 * Standing investment-preferences screen (`/invest/preferences`). The customer
 * sets an exact Equity / Debt / Commodity split on a draggable bar (against
 * Prozpr's bar) plus a complete subcategory distribution — all as a share of
 * total. Saving persists it and refreshes the customer's plans (backend eager
 * refresh).
 *
 * The composition root: it owns `mix` and `values`, and every verdict on the
 * screen is derived from them on each render by the pure module — nothing about
 * balance or validity is stored.
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
  const [saving, setSaving] = useState(false);
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
        const startValues = fromSavedPins(data.saved?.pins ?? [], data.subcategories);
        setMix(startMix);
        setInitialMix(startMix);
        setValues(startValues);
        setInitialValues(startValues);
        setRec(recMix);
        setSubs(data.subcategories);
        setCarveOuts(data.carve_outs_at_risk ?? []);
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

  // The sticky footer's height is not fixed: it grows with the save-reason line
  // and with up to three carve-out bullets. Reserve exactly what it occupies
  // rather than a magic number, so the last rows of the table can never end up
  // underneath it on a short screen.
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerH, setFooterH] = useState(0);
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const measure = () => setFooterH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // Only re-attach when the footer element itself appears; the observer
    // handles every size change after that.
  }, [load]);

  const statuses = CLASSES.map((c) => ({ cls: c, ...classStatus(mix, values, subs, c) }));
  const engaged = isEngaged(values);
  // An untouched (or fully cleared) distribution is valid: it means
  // "engine decides", which is exactly what an empty payload says.
  const valid = !engaged || distributionValid(mix, values, subs);
  const dirty =
    !sameMix(mix, initialMix) ||
    !samePins(toSavePins(values, subs), toSavePins(initialValues, subs));
  const canSave = dirty && valid && !saving;

  // Built from the per-class statuses, never from the sum of the rows:
  // offsetting errors can total exactly 100 while two classes are wrong.
  const reason = engaged
    ? statuses
        .filter((s) => s.state !== "balanced")
        .map(
          (s) =>
            `${CLASS_LABEL[s.cls]} ${Math.abs(s.delta).toFixed(1)}% ${
              s.state === "over" ? "over" : "left"
            }`,
        )
        .join(" · ")
    : "";

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
      style={{ paddingBottom: footerH + BOTTOM_NAV_H + 16 }}
    >
      <div className="px-5 pt-4">
        <h1 className="font-display text-[28px] leading-tight text-foreground">How you want to invest</h1>
        <p className="mt-1.5 max-w-[40ch] text-[12.5px] leading-relaxed text-muted-foreground">
          {"This is the target for your whole portfolio — where you want all your holdings to sit over time. We've suggested a mix for your goals; tweak it to match your own preferences."}
        </p>
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
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
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
            <AssetMixBar mode="interactive" mix={mix} onChange={setMix} />

            <p className="mb-2 mt-4 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
              Prozpr recommends
            </p>
            <AssetMixBar mode="reference" mix={rec} />

            <p className="mt-3.5 text-[11px] leading-relaxed text-muted-foreground">
              {"Drag the gold handles to set your split — it always totals 100%."}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {"New money you invest — as a SIP or a lump sum — goes to the parts of your portfolio that are furthest from this target, so an individual plan's split can look different from these percentages."}
            </p>
          </section>

          <section className="mx-5 mt-4 rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Set your categories</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {"Set the share of your whole portfolio for each category. Anything you leave blank counts as zero. Each class has to add up to the budget shown next to it — the multi-asset fund is counted separately, because it holds all three."}
            </p>
            <SubcategoryPins mix={mix} values={values} subcategories={subs} onChange={setValues} />
          </section>

          {/* Context, not live status — so it scrolls with the page. Pinned in
              the footer it ran to 304px of an 812px screen, more than half the
              viewport, and pushed the table out of view. */}
          <CarveOutNotice keys={carveOuts} />

          {/* Sticky action bar, sitting directly above BottomNav so the verdict
              and the Save button are always in view while the table scrolls. */}
          <div
            ref={footerRef}
            className="fixed inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl"
            style={{ bottom: BOTTOM_NAV_H }}
          >
            <div className="mx-auto max-w-md px-5 py-3">
              {engaged && reason ? (
                <p
                  id={REASON_ID}
                  data-testid={REASON_ID}
                  className="mb-2 text-center text-[11.5px] tabular-nums text-[hsl(var(--wealth-amber))]"
                >
                  {reason}
                </p>
              ) : engaged ? (
                <p className="mb-2 text-center text-[11.5px] tabular-nums text-[hsl(var(--wealth-green))]">
                  100% allocated
                </p>
              ) : null}

              {/* Always visible: what we promise the saved split actually buys.
                  Deliberately quieter than the save-reason line above it. */}
              <p className="mb-2 text-center text-[10.5px] leading-relaxed text-muted-foreground">
                {"This is a directional target. We'll get as close to it as we can; the exact final split can move slightly when we fit real funds."}
              </p>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMix(rec);
                    setValues(resetValues(subs, rec));
                  }}
                  className="h-11 flex-1 rounded-xl border border-input text-[13.5px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Reset to Prozpr
                </button>
                <button
                  type="button"
                  disabled={!canSave}
                  aria-describedby={!canSave && reason ? REASON_ID : undefined}
                  onClick={() => void handleSave()}
                  className="h-11 flex-1 rounded-xl bg-[#D4A868] text-[13.5px] font-semibold text-[#191307] transition-[filter] hover:brightness-[1.04] disabled:opacity-40"
                >
                  {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save preferences"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
