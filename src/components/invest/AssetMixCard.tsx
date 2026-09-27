import { AlertCircle, Check } from "lucide-react";

import MixBar from "@/components/invest/MixBar";
import PercentStepper from "@/components/invest/PercentStepper";
import type { ClassMix } from "@/lib/api";
import { CLASS_COLOR, CLASS_LABEL, CLASSES } from "@/lib/investment-preferences";

/**
 * The customer's Equity / Debt / Commodity split: today, Prozpr and theirs as
 * three thin bars, the total, then a stepper per class. Each stepper moves only
 * its own class — nothing is scaled to make room, so the customer can land on
 * exactly the split they mean — which lets the total be off. It leads the card
 * and says by how much; Save waits until it is 100.
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
      {/* Every figure the bars draw is in the rows below as text. */}
      <div aria-hidden className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-[12px]">
        {today ? (
          <>
            <span className="text-muted-foreground">Today</span>
            <MixBar id="bar-today" mix={today} />
          </>
        ) : null}
        <span className="text-muted-foreground">Prozpr</span>
        <MixBar id="bar-prozpr" mix={rec} />
        <span className="font-semibold text-foreground">You</span>
        <MixBar id="bar-you" mix={mix} showGap />
      </div>

      {/* A status, so a screen reader hears the total move with every step. */}
      <div
        role="status"
        data-testid="mix-total"
        className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2.5 text-[13px]"
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

      <div className="mt-3 space-y-3">
        {CLASSES.map((c) => (
          <div key={c} className="flex items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CLASS_COLOR[c] }} />
                {CLASS_LABEL[c]}
              </div>
              <p className="mt-0.5 text-[11.5px] tabular-nums text-muted-foreground">
                {`${today ? `Today ${today[c].toFixed(0)}% · ` : ""}Prozpr ${rec[c].toFixed(0)}%`}
              </p>
            </div>
            <PercentStepper
              value={mix[c]}
              max={100}
              label={CLASS_LABEL[c]}
              onChange={(v) => onChange({ ...mix, [c]: v })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
