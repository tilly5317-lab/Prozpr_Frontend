import { AlertCircle, Check, Info } from "lucide-react";

import PercentStepper from "@/components/invest/PercentStepper";
import type { ClassMix, ScreenSubcategory } from "@/lib/api";
import {
  CLASS_COLOR,
  classRows,
  classWord,
  matchesProzpr,
  shortLabel,
  type Cls,
  type Resolved,
  type RowValues,
} from "@/lib/investment-preferences";

/**
 * One asset class divided across its categories, inside its dropdown. Unlike
 * the class mix, these steppers move only their own number, so the total can
 * stop adding up — the total leads the group, where the customer is looking
 * while they step, and says by how much.
 *
 * The multi-asset line is the fund's part of this class: set in the fund's own
 * group, so here it only informs. Commodity has only gold, which is simply
 * whatever the fund leaves.
 */
export default function ClassCategoriesPanel({
  cls,
  mix,
  res,
  cats,
  rows,
  today,
  onEdit,
  onUseProzpr,
}: {
  cls: Cls;
  mix: ClassMix;
  res: Resolved;
  cats: ScreenSubcategory[];
  /** The class's categories as shown — including edits that don't add up yet. */
  rows: RowValues;
  today: RowValues | null;
  onEdit: (id: string, v: number) => void;
  onUseProzpr: () => void;
}) {
  const list = classRows(cats, cls);
  const part = res.parts[cls];
  const left = res.remainder[cls];
  const total = part + list.reduce((s, r) => s + (rows[r.id] ?? 0), 0);
  const addsUp = total === mix[cls];
  const matches = matchesProzpr(rows, res.prozprRows, list);
  const goldOnly = cls === "others";

  return (
    <div>
      {/* A status, so a screen reader hears the total change. */}
      <div
        role="status"
        data-testid="class-total"
        className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px]"
      >
        <span className="text-muted-foreground">{`Total ${classWord(cls)}`}</span>
        {addsUp ? (
          <span className="inline-flex items-center gap-1 font-semibold text-wealth-green">
            <Check className="h-3.5 w-3.5" />
            {`${mix[cls]}%`}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-right font-semibold text-[hsl(var(--warning))]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {`${total}% of ${mix[cls]}% · ${total < mix[cls] ? "add" : "remove"} ${Math.abs(mix[cls] - total)}%`}
          </span>
        )}
      </div>

      {part > 0 ? (
        <div data-testid="fund-part" className="mt-3 flex min-h-[44px] items-center gap-3 border-b border-border pb-3">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" />
              Multi-asset funds
            </span>
            <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
              {`From your ${res.multiAsset}% in multi-asset funds`}
            </span>
          </span>
          <span className="ml-auto text-[13px] font-semibold tabular-nums text-foreground">{`${part}%`}</span>
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {list.map((r, i) => (
          <div key={r.id} data-testid={`row-${r.id}`} className="flex items-center gap-3">
            <div className="min-w-0">
              {/* Long names wrap rather than truncate: the 44px stepper
                  leaves a narrow column, and a clipped name is a guess. */}
              <div className="flex items-start gap-2 text-[13px] font-semibold leading-snug text-foreground">
                {/* The class colour, lighter down the list, so rows read as one family. */}
                <span
                  className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    background: CLASS_COLOR[cls],
                    opacity: list.length <= 1 ? 1 : 1 - (i / (list.length - 1)) * 0.6,
                  }}
                />
                {shortLabel(r)}
              </div>
              <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">
                {`${today ? `Today ${today[r.id] ?? 0}% · ` : ""}Prozpr ${res.prozprRows[r.id]}%`}
              </p>
            </div>
            {goldOnly ? (
              <span className="ml-auto text-[13px] font-semibold tabular-nums text-foreground">
                {`${rows[r.id] ?? 0}%`}
              </span>
            ) : (
              <PercentStepper
                value={rows[r.id] ?? 0}
                max={left}
                label={shortLabel(r)}
                onChange={(v) => onEdit(r.id, v)}
              />
            )}
          </div>
        ))}
      </div>

      {goldOnly ? (
        <p className="mt-3 flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {"Gold is the only commodity we offer right now. To hold more or less, change Commodity in your asset mix above."}
        </p>
      ) : (
        // Sits close under the rows; the ::after pad keeps a 44px target.
        <button
          type="button"
          onClick={onUseProzpr}
          disabled={matches}
          className="relative mt-3 text-[13px] font-semibold text-[hsl(var(--accent))] underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] disabled:no-underline disabled:opacity-40"
        >
          {"Use Prozpr's recommendation"}
        </button>
      )}
    </div>
  );
}
