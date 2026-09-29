import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import BottomNav from "@/components/BottomNav";
import AssetMixCard from "@/components/invest/AssetMixCard";
import CategoriesCard, { type Editor } from "@/components/invest/CategoriesCard";
import ClassCategoriesPanel from "@/components/invest/ClassCategoriesPanel";
import MultiAssetPanel from "@/components/invest/MultiAssetPanel";
import PreferenceScopeNotice from "@/components/invest/PreferenceScopeNotice";
import PreferencesFooter, { FOOTER_CLEARANCE, FOOTER_NOTE_CLEARANCE } from "@/components/invest/PreferencesFooter";
import {
  getInvestmentPreferences,
  saveInvestmentPreferences,
  type ClassMix,
  type SubcategoryPin,
} from "@/lib/api";
import {
  CLASS_LABEL,
  CLASSES,
  classRows,
  followProzprWhereMatching,
  fromCurrentHoldings,
  fromSavedPins,
  lookThroughMix,
  matchesProzpr,
  MULTI_ASSET_ID,
  recommendedMix,
  resolve,
  roundMix,
  sameMix,
  samePins,
  toSavePins,
  type Catalog,
  type Cls,
  type RowValues,
} from "@/lib/investment-preferences";

const FALLBACK: ClassMix = { equity: 60, debt: 35, others: 5 }; // pre-load only; render gates on "loaded"
const NO_CATALOG: Catalog = { cats: [], comp: { equity: 0, debt: 0, others: 0 } }; // pre-load only
const SAVE_NOTE_ID = "save-note";

/**
 * Standing investment-preferences screen (`/invest/preferences`). The customer
 * sets an Equity / Debt / Commodity split, how much sits in the multi-asset
 * fund, and how each class divides across its categories — all as a share of
 * the whole portfolio. "Save Preferences" saves all of it at once and refreshes the
 * customer's plans (backend eager refresh).
 *
 * The composition root: it owns what the customer set (`mix`, `values`) and
 * derives everything shown from it with `resolve` on every render, so moving
 * the mix away and back always comes back exactly. The fund and each class's
 * categories open as dropdowns in the Categories card — one at a time, all on
 * this one screen.
 */
export default function InvestPreferences() {
  const [load, setLoad] = useState<"loading" | "error" | "loaded">("loading");
  const [catalog, setCatalog] = useState<Catalog>(NO_CATALOG);
  const [mix, setMix] = useState<ClassMix>(FALLBACK);
  const [values, setValues] = useState<RowValues>({});
  const [open, setOpen] = useState<Editor | null>(null);
  const [initialMix, setInitialMix] = useState<ClassMix>(FALLBACK);
  const [initialPins, setInitialPins] = useState<SubcategoryPin[]>([]);
  const [today, setToday] = useState<RowValues | null>(null);
  const [excludedPct, setExcludedPct] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad("loading");
    getInvestmentPreferences()
      .then((data) => {
        if (cancelled) return;
        const cat: Catalog = { cats: data.subcategories, comp: data.multi_asset_composition };
        // Prozpr's bar is the look-through of the catalog's own rows, not the
        // engine's separate class figure — so Reset lands exactly on the plan.
        const startMix = data.saved?.class_mix ? roundMix(data.saved.class_mix) : recommendedMix(cat);
        // A class saved on Prozpr's exact numbers follows Prozpr from here on,
        // so a later change to the mix cannot round it a point away.
        const startValues = followProzprWhereMatching(
          startMix, fromSavedPins(data.saved?.pins ?? [], data.subcategories), cat,
        );
        setCatalog(cat);
        setMix(startMix);
        setInitialMix(startMix);
        setValues(startValues);
        setInitialPins(toSavePins(startValues, resolve(startMix, startValues, cat).rows, cat.cats));
        setOpen(null);
        // Absent, null, empty and all-zero all read the same: nothing to show.
        setToday(fromCurrentHoldings(data.current?.holdings ?? [], data.subcategories));
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

  // The screen opens at its top, with focus on its title.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [load]);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  const res = resolve(mix, values, catalog);
  const only = (cls: Cls, rows: RowValues): RowValues =>
    Object.fromEntries(classRows(catalog.cats, cls).map((r) => [r.id, rows[r.id] ?? 0]));
  const sumOf = (cls: Cls, rows: RowValues): number =>
    classRows(catalog.cats, cls).reduce((s, r) => s + (rows[r.id] ?? 0), 0);

  // A group's numbers are stored as entered — nothing is rescaled, now or when
  // the mix or the fund moves — so one that doesn't add up simply shows as
  // `res.unbalanced` and holds Save. Only that group is handed back to Prozpr
  // if it matches: a class with nothing left to divide always "matches", and
  // would lose its split.
  const edit = (cls: Cls, rows: RowValues) =>
    setValues(followProzprWhereMatching(mix, { ...values, ...rows }, catalog, [cls]));

  const unbalanced = res.unbalanced;
  // Each class is set on its own, nothing scaled to make room, so the mix can
  // be mid-way to 100 — and Save waits for it.
  const mixTotal = CLASSES.reduce((s, c) => s + mix[c], 0);
  const pins = toSavePins(values, res.rows, catalog.cats);
  const dirty = !sameMix(mix, initialMix) || !samePins(pins, initialPins);

  // Save says what it is waiting for, right where it is tapped — the asset mix
  // first, as every category is a share of it.
  let note: { id: string; text: string } | undefined;
  const first = unbalanced[0];
  if (mixTotal !== 100) {
    note = {
      id: SAVE_NOTE_ID,
      text: `Your asset mix adds up to ${mixTotal}%. ${mixTotal < 100 ? "Add" : "Remove"} ${Math.abs(100 - mixTotal)}% to save.`,
    };
  } else if (first) {
    const total = res.parts[first] + sumOf(first, res.rows);
    const off = total - mix[first];
    note = {
      id: SAVE_NOTE_ID,
      text: `${CLASS_LABEL[first]} categories add up to ${total}% of ${mix[first]}%. ${off > 0 ? "Remove" : "Add"} ${Math.abs(off)}% to save.`,
    };
  }

  const handleSave = async () => {
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
  };

  const renderPanel = (e: Editor) =>
    e === "multi-asset" ? (
      <MultiAssetPanel
        mix={mix}
        res={res}
        comp={catalog.comp}
        today={today ? (today[MULTI_ASSET_ID] ?? 0) : null}
        onChange={(v) => setValues(followProzprWhereMatching(mix, { ...values, [MULTI_ASSET_ID]: v }, catalog, []))}
      />
    ) : (
      <ClassCategoriesPanel
        cls={e}
        mix={mix}
        res={res}
        cats={catalog.cats}
        rows={res.rows}
        today={today}
        onEdit={(id, v) => edit(e, { ...only(e, res.rows), [id]: v })}
        onUseProzpr={() => edit(e, only(e, res.prozprRows))}
      />
    );

  return (
    <div
      className="mobile-container bg-background min-h-screen"
      style={{ paddingBottom: FOOTER_CLEARANCE + (note ? FOOTER_NOTE_CLEARANCE : 0) }}
    >
      <div className="px-5 pt-2">
        <h1 tabIndex={-1} className="font-display text-[28px] leading-tight text-foreground focus:outline-none">
          Your asset mix
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {"Start from our plan and change only what suits your needs "}
          {/* The ⓘ travels with the last word, never onto a line of its own. */}
          <span className="whitespace-nowrap">
            {"better."}
            {/* No Today bar, nothing for its footnote to qualify. */}
            <PreferenceScopeNotice excludedPct={today ? excludedPct : 0} />
          </span>
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
          <AssetMixCard
            mix={mix}
            rec={recommendedMix(catalog)}
            today={today ? lookThroughMix(today, catalog) : null}
            onChange={setMix}
          />

          <CategoriesCard
            mine={{
              multiAsset: res.multiAsset !== res.prozprMultiAsset,
              equity: !matchesProzpr(res.rows, res.prozprRows, classRows(catalog.cats, "equity")),
              debt: !matchesProzpr(res.rows, res.prozprRows, classRows(catalog.cats, "debt")),
              // Gold is the only commodity today, so this stays Prozpr's until
              // there is more than one to divide between.
              others: !matchesProzpr(res.rows, res.prozprRows, classRows(catalog.cats, "others")),
            }}
            unbalanced={unbalanced}
            open={open}
            onToggle={(e) => setOpen((cur) => (cur === e ? null : e))}
            renderPanel={renderPanel}
          />

          <PreferencesFooter
            note={note}
            secondary={{
              label: "Prozpr Recommendation",
              onClick: () => {
                setMix(recommendedMix(catalog));
                setValues({});
              },
            }}
            primary={{
              label: saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Save Preferences",
              onClick: () => void handleSave(),
              disabled: !dirty || saving || unbalanced.length > 0 || mixTotal !== 100,
              describedBy: note?.id,
            }}
          />
        </>
      )}
      <BottomNav />
    </div>
  );
}
