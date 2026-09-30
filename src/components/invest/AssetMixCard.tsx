import { AlertCircle, Check } from "lucide-react";

import FigureTable, { FigureRow } from "@/components/invest/FigureTable";
import PercentStepper from "@/components/invest/PercentStepper";
import type { ClassMix } from "@/lib/api";
import { CLASS_COLOR, CLASS_LABEL, CLASSES } from "@/lib/investment-preferences";

/**
 * The customer's Equity / Debt / Commodity split: the total, then a row per
 * class with today's and Prozpr's figures beside its stepper. Each stepper
 * moves only its own class — nothing is scaled to make room, so the customer
 * can land on exactly the split they mean — which lets the total be off. It
 * leads the card and says by how much; Save waits until it is 100.
 */
export default function AssetMixCard({
  mix,
  rec,
  today,
  onChange,
}: {
  mix: ClassMix;
  rec: ClassMix;
  /** Null when there are no holdings to show. */
  today: ClassMix | null;
  onChange: (m: ClassMix) => void;
}) {
  const total = CLASSES.reduce((s, c) => s + mix[c], 0);

  return (
    <section className="mx-5 mt-4 rounded-2xl border border-border bg-card p-4">
      {/* A status, so a screen reader hears the total move with every step. */}
      <div
        role="status"
        data-testid="mix-total"
        className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px]"
      >
        <span className="text-muted-foreground">Total</span>
        {total === 100 ? (
          <span className="inline-flex items-center gap-1 font-semibold text-wealth-green">
            <Check className="h-3.5 w-3.5" />
            100%
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-right font-semibold text-[hsl(var(--warning))]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {`${total}% of 100% · ${total < 100 ? "add" : "remove"} ${Math.abs(100 - total)}%`}
          </span>
        )}
      </div>

      <FigureTable showToday={today !== null} className="mt-3">
        {CLASSES.map((c) => (
          <FigureRow
            key={c}
            testId={`mix-row-${c}`}
            name={
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CLASS_COLOR[c] }} />
                {CLASS_LABEL[c]}
              </div>
            }
            today={today ? today[c] : null}
            prozpr={rec[c]}
            you={
              <PercentStepper
                value={mix[c]}
                max={100}
                label={CLASS_LABEL[c]}
                onChange={(v) => onChange({ ...mix, [c]: v })}
              />
            }
          />
        ))}
      </FigureTable>
    </section>
  );
}
