import { useState } from "react";

import type { ClassMix, ScreenSubcategory, SubcategoryPin } from "@/lib/api";
import { CLASS_COLOR, CLASS_LABEL, CLASSES, classRoom, pinnedInClass, type Cls } from "@/lib/investment-preferences";

/**
 * Fine-tune section: pin specific categories to an exact share of total. Rows
 * show your % vs Prozpr's; a per-class guardrail tracks the room left; the
 * add-flow offers only settable categories with room, grouped by class. All
 * ids/labels/classes come from the backend catalog (`subcategories`).
 */
export default function SubcategoryPins({
  mix,
  pins,
  subcategories,
  onChange,
}: {
  mix: ClassMix;
  pins: SubcategoryPin[];
  subcategories: ScreenSubcategory[];
  onChange: (pins: SubcategoryPin[]) => void;
}) {
  const subById: Record<string, ScreenSubcategory> = Object.fromEntries(
    subcategories.map((s) => [s.id, s]),
  );
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState("");
  const [pctStr, setPctStr] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const pinnedIds = new Set(pins.map((p) => p.subgroup));
  const available = subcategories.filter(
    (s) => !pinnedIds.has(s.id) && classRoom(mix, pins, subById, s.class) > 0,
  );

  const seed = (s: ScreenSubcategory | undefined) => {
    if (!s) return;
    const room = classRoom(mix, pins, subById, s.class);
    setPctStr(String(Math.max(1, Math.min(s.recommended_pct_of_total || 10, room))));
  };
  const openAdd = () => {
    const first = available[0];
    setSel(first?.id ?? "");
    seed(first);
    setErr(null);
    setAdding(true);
  };
  const onSelChange = (id: string) => {
    setSel(id);
    setErr(null);
    seed(subById[id]);
  };
  const confirmAdd = () => {
    const s = subById[sel];
    if (!s) return;
    const v = Math.round(Number(pctStr) || 0);
    const room = classRoom(mix, pins, subById, s.class);
    if (v <= 0) return setErr("Enter a share above 0%.");
    if (v > room) return setErr(`That's more than ${CLASS_LABEL[s.class]} holds right now (${room}% left).`);
    onChange([...pins, { subgroup: sel, pct_of_total: v }]);
    setAdding(false);
  };

  return (
    <section className="mt-2">
      {pins.map((p) => {
        const s = subById[p.subgroup];
        return (
          <div key={p.subgroup} className="flex items-center gap-3 border-t border-border py-3.5">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium text-foreground">{s?.label ?? p.subgroup}</div>
              <div className="mt-0.5 text-[10.5px] tracking-wide text-muted-foreground">
                inside {CLASS_LABEL[(s?.class ?? "others") as Cls]}
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="font-display text-[20px] leading-none text-foreground">
                {p.pct_of_total}
                <span className="text-[12px] text-muted-foreground">%</span>
              </div>
              {s ? (
                <div className="mt-1 text-[10px] tabular-nums text-muted-foreground">
                  Prozpr {s.recommended_pct_of_total}%
                </div>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={`Remove ${s?.label ?? p.subgroup}`}
              onClick={() => onChange(pins.filter((x) => x.subgroup !== p.subgroup))}
              className="pl-1 text-[16px] leading-none text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          </div>
        );
      })}

      {CLASSES.map((c) => {
        const pinned = pinnedInClass(pins, subById, c);
        if (pinned <= 0) return null;
        const left = mix[c] - pinned;
        return (
          <div key={c} className="flex items-start gap-2 border-t border-border py-3 text-[11.5px] text-muted-foreground">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: CLASS_COLOR[c] }} />
            <span>
              Pinned inside {CLASS_LABEL[c]}: {pinned}% of {mix[c]}% &mdash;{" "}
              {left >= 0 ? (
                <span className="text-[hsl(var(--wealth-green))]">{left}% left for our picks</span>
              ) : (
                <span className="text-destructive">over by {-left}% &mdash; trim a pin or raise {CLASS_LABEL[c]}</span>
              )}
            </span>
          </div>
        );
      })}

      {!adding ? (
        <button
          type="button"
          onClick={openAdd}
          disabled={available.length === 0}
          className="mt-3.5 text-[12.5px] font-semibold text-[#D4A868] hover:brightness-110 disabled:opacity-40"
        >
          + Add a category preference
        </button>
      ) : (
        <div className="mt-3.5 flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Category
            </span>
            <select
              value={sel}
              onChange={(e) => onSelChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-[13.5px] text-foreground"
            >
              {CLASSES.map((c) => {
                const opts = available.filter((s) => s.class === c);
                if (opts.length === 0) return null;
                return (
                  <optgroup key={c} label={CLASS_LABEL[c]}>
                    {opts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Your share of total portfolio
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="number"
                min={1}
                max={100}
                value={pctStr}
                onChange={(e) => setPctStr(e.target.value)}
                className="w-[84px] rounded-lg border border-input bg-background px-2.5 py-2 text-right text-[13.5px] tabular-nums text-foreground"
              />
              <span className="text-[13px] text-muted-foreground">%</span>
              {sel && subById[sel] ? (
                <span className="text-[11.5px] text-muted-foreground">
                  <span className="text-[#D4A868]">Prozpr {subById[sel].recommended_pct_of_total}%</span> &middot; up to{" "}
                  <b className="text-foreground">{classRoom(mix, pins, subById, subById[sel].class)}%</b> inside{" "}
                  {CLASS_LABEL[subById[sel].class]}
                </span>
              ) : null}
            </div>
            {err ? <div className="mt-1 text-[11.5px] text-destructive">{err}</div> : null}
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-9 rounded-lg bg-secondary px-4 text-[12.5px] font-semibold text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAdd}
              className="h-9 rounded-lg bg-[#D4A868] px-4 text-[12.5px] font-semibold text-[#191307]"
            >
              Add pin
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
