import { Fragment } from "react";

import FigureTable, { FigureRow } from "@/components/invest/FigureTable";
import InfoPopup, { PopupText } from "@/components/invest/InfoPopup";
import PercentStepper from "@/components/invest/PercentStepper";
import type { ClassMix } from "@/lib/api";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  CLASSES,
  classWord,
  limitingClass,
  type Cls,
  type Resolved,
} from "@/lib/investment-preferences";

/** Why the fund stops where it does, and what to change to go further. */
function limitNote(mix: ClassMix, comp: ClassMix, limit: number, cls: Cls): string {
  const holds = `Each multi-asset fund holds about ${comp[cls]}% ${classWord(cls)}.`;
  const have = `With ${mix[cls]}% ${classWord(cls)} in your mix`;
  const raise = `raise ${CLASS_LABEL[cls]} in your asset mix above.`;
  return limit === 0
    ? `${holds} ${have}, you can't put anything here. To add it, ${raise}`
    : `${holds} ${have}, ${limit}% is the most you can put here. To add more, ${raise}`;
}

/**
 * How much of the portfolio sits in the multi-asset fund, inside its dropdown:
 * the amount first, then what it counts as in each class — each figure in its
 * class's colour. The fund's make-up and its limit are behind an ⓘ: it counts
 * towards all three classes at once, so the most it can hold is set by
 * whichever class runs out first. At that limit + greys out, so one line on
 * the page says so; the ⓘ says which class, why, and what to change.
 */
export default function MultiAssetPanel({
  mix,
  res,
  comp,
  today,
  onChange,
}: {
  mix: ClassMix;
  res: Resolved;
  /** The fund's make-up, as percents. */
  comp: ClassMix;
  /** What the customer holds in the fund today, or null with no holdings. */
  today: number | null;
  /** A new amount, or null to follow Prozpr's recommendation again. */
  onChange: (v: number | null) => void;
}) {
  const own = res.multiAsset !== res.prozprMultiAsset;
  const limiting = limitingClass(mix, comp);
  const atLimit = limiting !== null && res.multiAsset >= res.limit;

  return (
    <div>
      <FigureTable showToday={today !== null}>
        <FigureRow
          name={
            // Wraps beside the Today column, so the dot keeps to the first line.
            <div className="flex items-start gap-2 text-[13px] font-semibold leading-snug text-foreground">
              <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground" />
              Multi-asset funds
            </div>
          }
          today={today}
          prozpr={res.prozprMultiAsset}
          you={
            <PercentStepper
              value={res.multiAsset}
              max={res.limit}
              label="Multi-asset funds"
              onChange={onChange}
            />
          }
        />
      </FigureTable>

      <p data-testid="counts-as" className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {"Counts as "}
        {CLASSES.map((c, i) => (
          <Fragment key={c}>
            {i > 0 ? " · " : null}
            <span data-testid={`counts-as-${c}`} className="font-semibold tabular-nums" style={{ color: CLASS_COLOR[c] }}>
              {`${res.parts[c]}%`}
            </span>
            {` ${classWord(c)}`}
          </Fragment>
        ))}
        <InfoPopup
          label="About multi-asset funds"
          title="Multi-asset funds"
          lead={`One fund with about ${comp.equity}% equity, ${comp.debt}% debt and ${comp.others}% commodity.`}
        >
          <PopupText>
            {limiting === null
              ? "Fits your mix at any amount."
              : atLimit
                ? limitNote(mix, comp, res.limit, limiting)
                : `You can put up to ${res.limit}% here with your current mix.`}
          </PopupText>
        </InfoPopup>
      </p>

      {atLimit ? (
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{"That's the most your mix allows."}</p>
      ) : null}

      {/* Sits close under the text; the ::after pad keeps a 44px target. */}
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={!own}
        className="relative mt-3 text-[13px] font-semibold text-[hsl(var(--accent))] underline underline-offset-2 after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] disabled:no-underline disabled:opacity-40"
      >
        {"Use Prozpr's recommendation"}
      </button>
    </div>
  );
}
