import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import BottomNav from "@/components/BottomNav";
import AssetMixBar from "@/components/invest/AssetMixBar";
import SubcategoryPins from "@/components/invest/SubcategoryPins";
import {
  getInvestmentPreferences,
  saveInvestmentPreferences,
  type ClassMix,
  type ScreenSubcategory,
  type SubcategoryPin,
} from "@/lib/api";
import { pinsValid, roundMix, sameMix, samePins } from "@/lib/investment-preferences";

const FALLBACK: ClassMix = { equity: 60, debt: 35, others: 5 }; // pre-load only; render gates on "loaded"

const LEGEND: { c: string; label: string }[] = [
  { c: "hsl(var(--bucket-equity))", label: "Equity" },
  { c: "hsl(var(--bucket-debt))", label: "Debt" },
  { c: "hsl(var(--wealth-amber))", label: "Commodity" },
];

/**
 * Standing investment-preferences screen (`/invest/preferences`). The customer
 * sets an exact Equity / Debt / Commodity split on a draggable bar (against
 * Prozpr's bar) plus optional subcategory pins — all as a share of total.
 * Saving persists it and refreshes the customer's plans (backend eager refresh).
 */
export default function InvestPreferences() {
  const [load, setLoad] = useState<"loading" | "error" | "loaded">("loading");
  const [mix, setMix] = useState<ClassMix>(FALLBACK);
  const [pins, setPins] = useState<SubcategoryPin[]>([]);
  const [initialMix, setInitialMix] = useState<ClassMix>(FALLBACK);
  const [initialPins, setInitialPins] = useState<SubcategoryPin[]>([]);
  const [rec, setRec] = useState<ClassMix>(FALLBACK);
  const [subs, setSubs] = useState<ScreenSubcategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad("loading");
    getInvestmentPreferences()
      .then((data) => {
        if (cancelled) return;
        const recMix = roundMix(data.recommendation.class_mix); // engine returns floats
        const startMix = data.saved?.class_mix ?? recMix;
        const startPins = data.saved?.pins ?? [];
        setMix(startMix);
        setInitialMix(startMix);
        setPins(startPins);
        setInitialPins(startPins);
        setRec(recMix);
        setSubs(data.subcategories);
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
  const subById: Record<string, ScreenSubcategory> = Object.fromEntries(subs.map((s) => [s.id, s]));
  const dirty = !sameMix(mix, initialMix) || !samePins(pins, initialPins);
  const valid = pinsValid(mix, pins, subById);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const resp = await saveInvestmentPreferences({ class_mix: mix, pins });
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
  }, [mix, pins, refetch]);

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
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
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Fine-tune &middot; optional</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              {"Pin a specific category — like large-cap or gold — to an exact share of your total. Anything you don't pin, our engine fills."}
            </p>
            <SubcategoryPins mix={mix} pins={pins} subcategories={subs} onChange={setPins} />
          </section>

          <div className="mx-5 mt-5 flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMix(rec);
                setPins([]);
              }}
              className="h-11 flex-1 rounded-xl border border-input text-[13.5px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset to Prozpr
            </button>
            <button
              type="button"
              disabled={!dirty || !valid || saving}
              onClick={() => void handleSave()}
              className="h-11 flex-1 rounded-xl bg-[#D4A868] text-[13.5px] font-semibold text-[#191307] transition-[filter] hover:brightness-[1.04] disabled:opacity-40"
            >
              {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save preferences"}
            </button>
          </div>
        </>
      )}

      <BottomNav />
    </div>
  );
}
