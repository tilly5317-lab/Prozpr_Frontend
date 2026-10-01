import { useEffect, useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ListFilter, Loader2, Minus, Plus, RotateCcw } from "lucide-react";
import {
  blendedRate,
  clampClassReturn,
  clampEquityPct,
  DEBT_RETURN,
  equityBand,
  EQUITY_STEP,
  RETURN_INPUT_MAX,
  RETURN_INPUT_MIN,
  RETURN_INPUT_STEP,
  type AssetMix,
} from "@/lib/goalAssetMix";

/** The page's gold. Not the `accent` token, which is blue app-wide. */
const GOLD = "#D4A868";
const LABEL_GREY = "#8A8275";

/** Pill fill/text per equity band — the page's own gold, red and green. */
const BAND_TONE: Record<string, { rgb: string }> = {
  low: { rgb: "100, 116, 139" },
  base: { rgb: "212, 168, 104" },
  high: { rgb: "16, 185, 129" },
};

const SIP_STEP = 1_000;
const SIP_MIN = 1_000;
const SIP_MAX = 200_000;

type StatId = "mix" | "sip" | "returns" | "priority";

/** Expand/collapse, matching the timeline rows' accordion feel. */
const REVEAL = { duration: 0.25, ease: [0.16, 1, 0.3, 1] as const };

interface Props {
  /** The SIP what-if value shown in the stat row and edited by the stepper. */
  sip: number;
  onSipChange: (next: number) => void;
  /** The SIP the engine's current plan ran on — null until a plan loads. */
  planSip: number | null;
  onApplySip: () => void;
  applyingSip: boolean;
  /** The engine's own affordable monthly SIP — drives the capped warning. */
  affordableMonthly: number | null;
  /** Affordable SIP to suggest, falling back to the profile before a plan runs. */
  suggestedMonthly: number | null;
  /** True when the engine capped the SIP to what the cashflow allows. */
  sipCapped: boolean;
  /** "…reaches 3 of your goals" — what the plan's SIP actually buys. */
  landingLine: ReactNode;
  /** Goals beyond the projection's reach, so not counted in the line above. */
  landingUnknown: number;
  mix: AssetMix;
  onMixChange: (next: AssetMix) => void;
  formatMoney: (v: number) => string;
  /**
   * The goal-priority chips. Passed in rather than rebuilt here so their colours
   * stay with the rest of the page's priority styling; the filter icon only
   * appears when there is something to show.
   */
  priorityEditor?: ReactNode;
  /**
   * Opens one stat's editor from outside — the guided tour uses it so the step
   * about changing assumptions shows an editor rather than just the numbers.
   * Setting it back to null leaves whatever is open alone.
   */
  openStatOverride?: "mix" | "sip" | "returns" | null;
}

/**
 * The goal plan's three levers, as three numbers.
 *
 * At rest this is the whole control: asset mix, SIP and return, each a value
 * with a dashed rule under it. Tapping one opens its editor directly below;
 * at most one is open, and every edit applies immediately — there is no save.
 */
export default function GoalPlanStats({
  sip,
  onSipChange,
  planSip,
  onApplySip,
  applyingSip,
  affordableMonthly,
  suggestedMonthly,
  sipCapped,
  landingLine,
  landingUnknown,
  mix,
  onMixChange,
  formatMoney,
  priorityEditor,
  openStatOverride,
}: Props) {
  const [openStat, setOpenStat] = useState<StatId | null>(null);

  useEffect(() => {
    if (openStatOverride) setOpenStat(openStatOverride);
  }, [openStatOverride]);
  const panelId = useId();

  const equityPct = clampEquityPct(mix.equityPct);
  const debtPct = 100 - equityPct;

  const toggle = (id: StatId) => setOpenStat((prev) => (prev === id ? null : id));

  const stats: {
    id: StatId;
    label: string;
    /** Shown in place of `label` while this stat's editor is open. */
    openLabel?: string;
    value: string;
    gold?: boolean;
  }[] = [
    { id: "mix", label: "Equity/Debt", value: `${equityPct} / ${debtPct}` },
    { id: "sip", label: "SIP", value: formatMoney(sip) },
    {
      id: "returns",
      // The value is the blend, not the equity call — it's the rate the
      // projection runs on, so the stat and the chart agree. The short label
      // keeps the row calm; opening the editor spells out what it is.
      label: "Return",
      openLabel: "Blended return",
      value: `${blendedRate(mix)}%`,
      gold: true,
    },
  ];

  return (
    <div className="px-[2px] py-[10px]" data-tour="monthly-sip">
      {/* One rule under the whole row rather than walls between the stats — the
          three numbers read as a set, and the line doubles as the seam the
          editor opens out of. */}
      <div className="grid grid-cols-3 gap-2.5 border-b border-border pb-2.5">
        {stats.map((stat, i) => {
          const active = openStat === stat.id;
          const last = i === stats.length - 1;
          const statButton = (
            <button
              type="button"
              onClick={() => toggle(stat.id)}
              aria-expanded={active}
              aria-controls={panelId}
              // justify-end, not centre: "Blended returns" takes two lines at
              // phone width, and the values still have to line up across the
              // three cells.
              className="flex min-h-[44px] min-w-0 flex-1 flex-col justify-end gap-[3px] text-left transition-transform active:scale-[0.98]"
            >
              {/* The chevron is the quiet "this opens" cue — it turns up when
                  the editor is out, so it reads as a state, not decoration. */}
              <span
                className="flex items-center gap-1 text-[12px] font-medium leading-[1.25] tracking-[0.2px]"
                style={{ color: LABEL_GREY }}
              >
                <span className="min-w-0">
                  {active && stat.openLabel ? stat.openLabel : stat.label}
                </span>
                <ChevronDown
                  className={`h-3 w-3 shrink-0 opacity-70 transition-transform ${
                    active ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                />
              </span>
              <span
                className={`self-start whitespace-nowrap pb-[2px] text-[19px] font-semibold leading-[1.1] tabular-nums ${
                  active || stat.gold ? "" : "text-foreground"
                }`}
                style={{
                  // Only the open stat is underlined. The dashed rule that used
                  // to sit under every number was the "tappable" hint before the
                  // chevrons arrived, and reads as noise alongside them.
                  borderBottom: active ? `1px solid ${GOLD}` : "1px solid transparent",
                  ...(active || stat.gold ? { color: GOLD } : {}),
                }}
              >
                {stat.value}
              </span>
            </button>
          );

          // The priority filter rides in the last cell rather than taking a row
          // of its own. A sibling of the stat button, never nested in it.
          const filterOpen = openStat === "priority";
          return (
            <div key={stat.id} className="flex items-end gap-1.5">
              {statButton}
              {last && priorityEditor && (
                <button
                  type="button"
                  onClick={() => toggle("priority")}
                  aria-expanded={filterOpen}
                  aria-controls={panelId}
                  aria-label="Filter goals by priority"
                  title="Filter goals by priority"
                  className="mb-[2px] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform active:scale-[0.98]"
                  style={
                    filterOpen
                      ? { backgroundColor: `${GOLD}26`, color: GOLD }
                      : { color: LABEL_GREY }
                  }
                >
                  <ListFilter className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {openStat !== null && (
          <motion.div
            key={openStat}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={REVEAL}
            style={{ overflow: "hidden" }}
          >
            <div
              id={panelId}
              role="region"
              aria-label={
                openStat === "mix"
                  ? "Equity and debt split"
                  : openStat === "sip"
                    ? "Monthly SIP"
                    : openStat === "priority"
                      ? "Goal priority"
                      : "Return assumptions"
              }
              // No surface of its own: the editor sits on the page, so the rule
              // above is the only thing separating it from the stats.
              className="mt-3"
            >
              {openStat === "mix" && (
                <AssetMixEditor
                  equityPct={equityPct}
                  onChange={(next) => onMixChange({ ...mix, equityPct: next })}
                />
              )}

              {openStat === "sip" && (
                <SipEditor
                  sip={sip}
                  onSipChange={onSipChange}
                  planSip={planSip}
                  onApplySip={onApplySip}
                  applyingSip={applyingSip}
                  affordableMonthly={affordableMonthly}
                  suggestedMonthly={suggestedMonthly}
                  sipCapped={sipCapped}
                  landingLine={landingLine}
                  landingUnknown={landingUnknown}
                  formatMoney={formatMoney}
                />
              )}

              {openStat === "returns" && (
                <div className="space-y-2">
                  <Stepper
                    label="Equity"
                    badge={<BandPill rate={mix.equityReturn} />}
                    value={`${clampClassReturn(mix.equityReturn)}% p.a.`}
                    onStep={(dir) =>
                      onMixChange({
                        ...mix,
                        equityReturn: clampClassReturn(
                          mix.equityReturn + dir * RETURN_INPUT_STEP,
                        ),
                      })
                    }
                    canDown={mix.equityReturn > RETURN_INPUT_MIN}
                    canUp={mix.equityReturn < RETURN_INPUT_MAX}
                  />
                  {/* Debt is fixed. Shown so the blend can be read off the
                      panel rather than taken on trust. */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">Debt</span>
                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                      {DEBT_RETURN}% p.a. assumed
                    </span>
                  </div>

                </div>
              )}

              {openStat === "priority" && priorityEditor}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One 30px track: drag the split, debt is whatever equity leaves behind. */
function AssetMixEditor({
  equityPct,
  onChange,
}: {
  equityPct: number;
  onChange: (next: number) => void;
}) {
  return (
    <div>
      <div
        className="mb-1.5 flex items-center justify-between text-[11px]"
        style={{ color: LABEL_GREY }}
      >
        <span className="tabular-nums">{equityPct}% equity</span>
        <span className="tabular-nums">{100 - equityPct}% debt</span>
      </div>
      {/* The bar is 8px; the row around it stays 30px so the thumb still has a
          real touch target. Drawing those separately keeps the gold a slim rule
          rather than a slab. */}
      <div className="relative flex h-[30px] items-center">
        <div className="absolute inset-x-0 h-[8px] overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width] duration-150"
            style={{ width: `${equityPct}%`, backgroundColor: GOLD }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={EQUITY_STEP}
          value={equityPct}
          onChange={(e) => onChange(clampEquityPct(Number(e.target.value)))}
          aria-label="Equity share of the portfolio"
          className="mix-range absolute inset-0 h-[30px] w-full cursor-pointer appearance-none bg-transparent"
        />
      </div>
    </div>
  );
}

function SipEditor({
  sip,
  onSipChange,
  planSip,
  onApplySip,
  applyingSip,
  affordableMonthly,
  suggestedMonthly,
  sipCapped,
  landingLine,
  landingUnknown,
  formatMoney,
}: Pick<
  Props,
  | "sip"
  | "onSipChange"
  | "planSip"
  | "onApplySip"
  | "applyingSip"
  | "affordableMonthly"
  | "suggestedMonthly"
  | "sipCapped"
  | "landingLine"
  | "landingUnknown"
  | "formatMoney"
>) {
  const dirty = planSip != null && sip !== planSip;
  const canUse =
    !sipCapped &&
    suggestedMonthly != null &&
    suggestedMonthly > 0 &&
    Math.round(suggestedMonthly) !== sip;

  return (
    <div className="space-y-2">
      <Stepper
        label="Monthly SIP"
        value={`${formatMoney(sip)}/mo`}
        onStep={(dir) => onSipChange(Math.min(SIP_MAX, Math.max(SIP_MIN, sip + dir * SIP_STEP)))}
        canDown={sip > SIP_MIN}
        canUp={sip < SIP_MAX}
      />

      <p className="text-[11px] text-muted-foreground tabular-nums">
        {formatMoney(sip * 12)}/yr
        {!sipCapped && suggestedMonthly != null && suggestedMonthly > 0 && (
          <>
            {" "}· you can invest up to{" "}
            <span className="font-semibold text-foreground">
              {formatMoney(suggestedMonthly)}/mo
            </span>{" "}
            from your cashflow
          </>
        )}
      </p>

      {/* What that number buys, straight from the ENGINE's plan — so it stays
          attached to the SIP the projection actually ran on. */}
      {landingLine && (
        <div className="border-t border-border/50 pt-2">
          <p className="text-[11.5px] leading-snug text-foreground">
            {planSip != null && (
              <span className="text-muted-foreground">
                If you invest{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  ₹{planSip.toLocaleString("en-IN")}
                </span>
                /mo ·{" "}
              </span>
            )}
            {landingLine}
          </p>
          {landingUnknown > 0 && (
            <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/70">
              {landingUnknown === 1 ? "One goal falls" : `${landingUnknown} goals fall`} beyond
              what the projection reaches, so {landingUnknown === 1 ? "it is" : "they are"} not
              counted here.
            </p>
          )}
          {dirty && (
            <p className="mt-0.5 text-[10.5px] leading-snug" style={{ color: GOLD }}>
              Apply to plan to see this at ₹{sip.toLocaleString("en-IN")}/mo.
            </p>
          )}
        </div>
      )}

      {(dirty || canUse) && (
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={onApplySip}
              disabled={applyingSip}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: GOLD }}
              title="Save this SIP and recompute your cashflow plan"
            >
              {applyingSip ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {applyingSip ? "Updating…" : "Apply to plan"}
            </button>
          )}
          {dirty && planSip != null && (
            <button
              type="button"
              onClick={() => onSipChange(planSip)}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform hover:text-foreground active:scale-[0.98]"
              aria-label="Reset to the SIP your plan ran on"
              title="Reset to the SIP your plan ran on"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
          {canUse && suggestedMonthly != null && (
            <button
              type="button"
              onClick={() => onSipChange(Math.round(suggestedMonthly))}
              className="inline-flex h-7 shrink-0 items-center rounded-full border px-2 text-[10px] font-semibold"
              style={{ borderColor: `${GOLD}80`, color: GOLD }}
              title="Set your SIP to what your cashflow allows"
            >
              Use {formatMoney(suggestedMonthly)}
            </button>
          )}
        </div>
      )}

      {sipCapped && affordableMonthly != null && (
        <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          You can invest about {formatMoney(affordableMonthly)}/mo from your income (after tax,
          expenses &amp; EMIs). A higher SIP is capped to that — it won't grow your corpus
          further, since the plan never invests more than you can save.
        </p>
      )}
    </div>
  );
}

/** What an equity return assumption reads as, next to the number itself. */
function BandPill({ rate }: { rate: number }) {
  const band = equityBand(rate);
  const { rgb } = BAND_TONE[band.tone];
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-[0.5px]"
      style={{
        backgroundColor: `rgba(${rgb}, 0.14)`,
        color: `rgb(${rgb})`,
        border: `1px solid rgba(${rgb}, 0.4)`,
      }}
    >
      {band.label}
    </span>
  );
}

/** Label on the left, −/value/+ on the right. */
function Stepper({
  label,
  badge,
  value,
  onStep,
  canDown,
  canUp,
}: {
  label: string;
  /** Optional chip shown beside the label — wraps below on a narrow panel. */
  badge?: ReactNode;
  value: string;
  onStep: (direction: -1 | 1) => void;
  canDown: boolean;
  canUp: boolean;
}) {
  const btn =
    "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {badge}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onStep(-1)}
          disabled={!canDown}
          className={btn}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-[68px] text-center text-sm font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onStep(1)}
          disabled={!canUp}
          className={btn}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
