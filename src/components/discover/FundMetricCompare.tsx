import { useMemo, useState } from "react";

import type { FundNavPoint } from "@/components/fund/FundScreenUi";
import { RISK_FREE_PCT, computeFundRiskMetrics } from "@/lib/fundMetrics";
import { InfoTip, Term } from "@/components/fund/InfoTip";

/** One fund in the comparison, with the colour it already carries elsewhere. */
export interface MetricCompareFund {
  key: string;
  /** Short label for the expanded breakdown. */
  short: string;
  color: string;
  history: FundNavPoint[];
}

/** A metric every compared fund is scored on. */
interface MetricSpec {
  key: string;
  /** Glossary key for the (i). Matches `key` for every metric so far. */
  term?: string;
  label: string;
  /** Which direction reads as better — never obvious for a ratio. */
  better: "high" | "low";
  decimals: number;
  suffix?: string;
  /** Plain-English meaning, shown when the row is expanded. */
  help: string;
  pick: (m: ReturnType<typeof computeFundRiskMetrics>) => number | null;
}

const METRICS: MetricSpec[] = [
  {
    key: "ret",
    term: "mean3",
    label: "Mean return",
    better: "high",
    decimals: 1,
    suffix: "%",
    help: "The rate the NAV compounded at over this window. It is the average outcome, not the path — the drawdown below shows what that path actually felt like.",
    pick: (m) => m.annualisedReturnPct,
  },
  {
    key: "vol",
    term: "volatility",
    label: "Volatility",
    better: "low",
    decimals: 1,
    suffix: "%",
    help: "How much the NAV swings around, per year. A higher number means bigger moves in both directions — it says nothing about which way.",
    pick: (m) => m.volatilityPct,
  },
  {
    key: "mdd",
    term: "mdd",
    label: "Max drawdown",
    better: "high", // -14% beats -34%, so a larger (less negative) number is better
    decimals: 1,
    suffix: "%",
    help: "The worst peak-to-bottom fall in this window. This is the number that tells you whether you could have held on through it.",
    pick: (m) => m.maxDrawdown?.pct ?? null,
  },
  {
    key: "sharpe",
    term: "sharpe",
    label: "Sharpe ratio",
    better: "high",
    decimals: 2,
    help: `Return earned above a risk-free ${RISK_FREE_PCT}% a year, per unit of volatility. Above 1 is generally considered good. The risk-free rate is an assumption, roughly the Indian 10-year government bond.`,
    pick: (m) => m.sharpe,
  },
  {
    key: "sortino",
    term: "sortino",
    label: "Sortino ratio",
    better: "high",
    decimals: 2,
    help: "Like Sharpe, but only counts the falls. A much higher Sortino than Sharpe means the fund's volatility was mostly to the upside.",
    pick: (m) => m.sortino,
  },
];

const WINDOWS = [
  { label: "1Y", years: 1 },
  { label: "3Y", years: 3 },
  { label: "5Y", years: 5 },
] as const;

/* The "leads on this metric" marker. Hex, not hsl(), because the chip below
   tints it by appending a hex alpha — that concatenation silently produces
   invalid CSS against an hsl() string and the tint just vanishes. Deliberately neither green nor red: on
   this page those two already mean "good" and "bad" against the category, and
   reusing green here would blur two different claims — "best of the funds you
   picked" is not the same as "good". Amber-gold reads as a rosette instead. */
const LEAD = "#C08A2E";

/**
 * One metric across every compared fund: the values, and a track placing each
 * fund between the best and worst of the set.
 *
 * The range is the COMPARED FUNDS, not the category — Prozpr has no peer
 * aggregates, so "category average" would be invented. The caption says so
 * plainly rather than letting the reader assume a category benchmark.
 */
function MetricRow({
  spec,
  rows,
  open,
  onToggle,
}: {
  spec: MetricSpec;
  rows: { fund: MetricCompareFund; value: number | null }[];
  open: boolean;
  onToggle: () => void;
}) {
  const values = rows.map((r) => r.value).filter((v): v is number => v != null);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const span = max - min;
  // With one fund, or several identical ones, there's no spread to plot —
  // everything sits mid-track rather than pinning arbitrarily to an edge.
  const pos = (v: number) => (span <= 0 ? 50 : ((v - min) / span) * 100);

  const best = spec.better === "high" ? max : min;
  const fmt = (v: number) => `${v.toFixed(spec.decimals)}${spec.suffix ?? ""}`;

  return (
    <div className="border-t border-border/60 py-3 first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left">
        <div className="flex items-baseline justify-between gap-3">
          <Term term={spec.term} className="text-[12.5px] font-semibold text-foreground">
            {spec.label}
          </Term>
          <span className="flex shrink-0 items-baseline gap-2">
            {rows.map((r) => (
              <span
                key={r.fund.key}
                className="text-[11.5px] font-bold tabular-nums"
                style={{ color: r.value == null ? "hsl(var(--muted-foreground))" : r.fund.color }}
              >
                {r.value == null ? "—" : fmt(r.value)}
              </span>
            ))}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground/70">
          {spec.better === "high" ? "higher is better" : "lower is better"}
        </div>

        <div className="relative mx-1 mt-2 h-7">
          <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-muted" />
          {/* Mean of the compared funds — the only honest centre marker here. */}
          {span > 0 && (
            <div
              className="absolute top-1.5 h-4 border-l border-dashed border-muted-foreground/40"
              style={{ left: `${pos(mean)}%` }}
              aria-hidden="true"
            />
          )}
          {rows.map((r) =>
            r.value == null ? null : (
              <span
                key={r.fund.key}
                className="absolute top-1.5 block h-3 w-3 -translate-x-1/2 rounded-full border-2 border-card"
                style={{
                  left: `${Math.max(2, Math.min(98, pos(r.value)))}%`,
                  backgroundColor: r.fund.color,
                  // A ring marks whichever fund leads on this metric.
                  boxShadow: r.value === best ? `0 0 0 2px ${LEAD}` : "none",
                }}
              />
            ),
          )}
        </div>
        <div className="mx-1 flex justify-between text-[9.5px] text-muted-foreground/70">
          <span>{fmt(min)}</span>
          {span > 0 && <span className="text-muted-foreground">avg {fmt(mean)}</span>}
          <span>{fmt(max)}</span>
        </div>
      </button>

      {open && (
        <div className="mt-2.5 rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">{spec.help}</p>
          {rows.map((r) => (
            <div key={r.fund.key} className="flex items-center justify-between gap-2 py-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: r.fund.color }}
                />
                <span className="truncate text-[11.5px] text-foreground">{r.fund.short}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[12px] font-bold tabular-nums text-foreground">
                  {r.value == null ? "—" : fmt(r.value)}
                </span>
                {r.value != null && r.value === best && values.length > 1 && (
                  <span
                    className="rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
                    style={{ backgroundColor: `${LEAD}26`, color: LEAD }}
                  >
                    Best here
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Risk and consistency across the compared funds, every figure derived from
 * each fund's own NAV series.
 *
 * Absent by necessity: P/E, P/B, P/S and dividend yield need the funds'
 * holdings, and alpha, tracking error and information ratio need a benchmark
 * series. Prozpr's API carries neither, and a number invented here would look
 * exactly as authoritative as a real one.
 */
export function FundMetricCompare({ funds }: { funds: MetricCompareFund[] }) {
  const [win, setWin] = useState<string>("3Y");
  const [openRow, setOpenRow] = useState<string | null>(null);

  const years = WINDOWS.find((w) => w.label === win)?.years ?? 3;

  const metrics = useMemo(
    () =>
      funds.map((f) => ({
        fund: f,
        m: computeFundRiskMetrics(f.history, years),
      })),
    [funds, years],
  );

  const anyData = metrics.some((x) => x.m.sufficient);

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
          Valuation &amp; risk
          <InfoTip term="sharpe" />
        </p>
        <p className="text-[10.5px] text-muted-foreground">from NAV history</p>
      </div>
      <p className="mt-0.5 mb-3 text-[11px] leading-snug text-muted-foreground">
        Each fund's number, and where it sits against the others here. Tap any row for what it means.
      </p>

      {/* Same pill treatment as the growth chart's range control further up the
          page — two window pickers on one screen should not look like two
          different kinds of control. */}
      <div className="flex flex-wrap gap-1.5">
        {WINDOWS.map((w) => {
          const active = win === w.label;
          return (
            <button
              key={w.label}
              type="button"
              onClick={() => setWin(w.label)}
              aria-pressed={active}
              className={`rounded-full px-3 py-1 text-[11.5px] font-semibold tabular-nums transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      {!anyData ? (
        <p className="mt-3 text-[11.5px] leading-snug text-muted-foreground">
          Not enough NAV history for a {win} view across these funds.
        </p>
      ) : (
        <div className="mt-2">
          {METRICS.map((spec) => (
            <MetricRow
              key={spec.key}
              spec={spec}
              rows={metrics.map(({ fund, m }) => ({ fund, value: spec.pick(m) }))}
              open={openRow === spec.key}
              onToggle={() => setOpenRow((v) => (v === spec.key ? null : spec.key))}
            />
          ))}
        </div>
      )}

      <p className="mt-3 border-t border-border/60 pt-2.5 text-[10.5px] leading-snug text-muted-foreground/80">
        The track spans the best and worst of the funds you're comparing — not the whole category, so
        a fund at the right-hand end leads this group, not its peers. Past performance does not
        predict future returns.
      </p>
    </section>
  );
}

export default FundMetricCompare;
