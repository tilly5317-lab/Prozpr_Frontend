import { useMemo, useState } from "react";

import type { FundNavPoint } from "@/components/fund/FundScreenUi";
import {
  CAT_COLOR,
  CompareReadout,
  FUND_COLOR,
  SectionShell,
  Seg,
  ToneChip,
  ToneLegend,
} from "@/components/fund/FundAnalysisUi";
import { FundReturnsHero, FundSnapshot } from "@/components/fund/FundOverview";
import FundUnrealisedTax from "@/components/fund/FundUnrealisedTax";
import { Term } from "@/components/fund/InfoTip";
import FundDisclaimer from "@/components/fund/FundDisclaimer";
import FundHoldings from "@/components/fund/FundHoldings";
import FundManagers from "@/components/fund/FundManagers";
import { snapshotRows } from "@/lib/fundSnapshot";
import {
  PERIODS,
  type CategoryProfile,
  type FundProfile,
  type Period,
  TONE_COLOR,
  TONE_LABEL,
  categoryProfile,
  fundProfile,
  ord,
  pctInRange,
  quarterLabels,
  type ReturnRange,
  toneColor,
} from "@/lib/fundCategory";
import { RATIOS, type RatioSpec } from "@/lib/fundRatios";
import type { MfFundInvestorDetailResponse } from "@/lib/api";

/* ════════════════════════════════════════════════════════════════════════════
   Charts. All are hand-drawn SVG on a fixed viewBox so they scale to any
   width without a charting dependency, and use theme tokens for anything
   structural (grid lines, axis text) so they hold up in dark mode.
   ══════════════════════════════════════════════════════════════════════════ */

const GRID = "hsl(var(--border))";
const AXIS = "hsl(var(--muted-foreground))";

/** Section 5 — one ratio, the fund plotted inside the category range. */
function RatioRow({
  r,
  fund,
  cat,
  open,
  onToggle,
}: {
  r: RatioSpec;
  fund: FundProfile;
  cat: CategoryProfile;
  open: boolean;
  onToggle: () => void;
}) {
  const [avg, min, max] = cat.ratios[r.k];
  const v = fund.ratios[r.k];
  const suf = r.suf ?? "";

  /* The fund's figure and the category's are both printed above the track. When
     the two values sit close together the labels collide, so the window is
     zoomed in around them until there is room — the axis labels below report
     whatever range ended up drawn, so the narrowing is never silent.

     Zoom is floored at a fifth of the category range: past that the track stops
     saying anything useful about where the fund sits, and the labels stack
     instead. */
  const MIN_SEP_PCT = 34;
  const MIN_ZOOM = 0.2;
  const fullSpan = max - min || 1;
  const gap = Math.abs(v - avg);

  let lo = min;
  let hi = max;
  const wanted = gap > 0 ? gap / (MIN_SEP_PCT / 100) : fullSpan;
  const target = Math.max(wanted, fullSpan * MIN_ZOOM);
  if (target < fullSpan) {
    const mid = (v + avg) / 2;
    lo = mid - target / 2;
    hi = mid + target / 2;
    // Keep the window inside the real category range, shifting rather than
    // clipping so it stays the width we asked for.
    if (lo < min) {
      hi += min - lo;
      lo = min;
    }
    if (hi > max) {
      lo -= hi - max;
      hi = max;
    }
    lo = Math.max(lo, min);
    hi = Math.min(hi, max);
  }

  const span = hi - lo || 1;
  const pos = (x: number) => Math.max(4, Math.min(96, ((x - lo) / span) * 100));
  // Even zoomed to the floor the two can be inseparable; then they stack.
  const stacked = Math.abs(pos(v) - pos(avg)) < MIN_SEP_PCT * 0.6;
  const p = pctInRange(v, min, max, r.hi, avg);
  const tone = toneColor(p);
  const fmt = (x: number) => `${x.toFixed(r.d)}${suf}`;
  const x = pos(v);

  return (
    <div className="border-t border-border/60 py-3 first:border-t-0">
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left">
        {/* Label and direction share the header — the value itself is printed
            above its marker on the track, so it isn't stated twice. */}
        <div className="flex items-baseline justify-between gap-3">
          {/* The ratio key doubles as the glossary key — they were named to match. */}
          <Term term={r.k} className="text-[12.5px] font-semibold text-foreground">
            {r.label}
          </Term>
          <span className="shrink-0 text-[10.5px] text-muted-foreground/70">
            {r.hi ? "higher is better" : "lower is better"}
          </span>
        </div>

        <div className={`relative mx-1 mt-3 ${stacked ? "h-[46px]" : "h-[32px]"}`}>
          {/* Both figures sit above the line and share a weight — colour alone
              separates the fund from the category it's measured against. */}
          <span
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold tabular-nums"
            style={{ left: `${x}%`, color: tone }}
          >
            {fmt(v)}
          </span>
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-bold tabular-nums text-muted-foreground"
            style={{ left: `${pos(avg)}%`, top: stacked ? 14 : 0 }}
          >
            cat {fmt(avg)}
          </span>
          <div
            className="absolute inset-x-0 border-t border-dashed border-border"
            style={{ top: stacked ? 38 : 24 }}
          />
          <span
            className="absolute h-[15px] w-[3.5px] -translate-x-1/2 rounded-full bg-muted-foreground/60"
            style={{ left: `${pos(avg)}%`, top: stacked ? 31 : 17 }}
            aria-hidden="true"
          />
          {/* The fund — in its verdict colour, so it reads louder. */}
          <span
            className="absolute h-[15px] w-[3.5px] -translate-x-1/2 rounded-full"
            style={{ left: `${x}%`, top: stacked ? 31 : 17, backgroundColor: tone }}
            aria-hidden="true"
          />
        </div>
        <div className="mx-1 flex justify-between text-[9.5px] tabular-nums text-muted-foreground/70">
          <span>{fmt(lo)}</span>
          <span>{fmt(hi)}</span>
        </div>
      </button>

      {open && (
        <p className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {r.help}
        </p>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   The screen
   ══════════════════════════════════════════════════════════════════════════ */

const fmtPct = (n: number, d = 1) => `${n >= 0 ? "" : ""}${n.toFixed(d)}%`;

export interface FundAnalysisProps {
  schemeCode: string;
  history: FundNavPoint[];
  categoryName: string;
  assetClass: string | null;
  /** Computed by the page via `useFundProfiles`, so the header export matches. */
  cat: CategoryProfile;
  fund: FundProfile;
  amc: string | null;
  schemeName: string;
  isin: string | null;
  planType: string | null;
  optionType: string | null;
  navLatest: number | null;
  navDate: string | null;
  /** The user's own ledger for this scheme — drives "Your investment". */
  transactions: import("@/lib/api").MfHoldingTransactionItem[];
  /** False when `transactions` is a stand-in rather than the user's own. */
  hasRealTransactions: boolean;
  /** For the workbook's tax sheet; null when the user doesn't hold the fund. */
  unrealisedTax: import("@/lib/unrealisedTax").UnrealisedTax | null;
  /** Metadata record, when it loaded — supplies the real fee and mix figures. */
  facts: MfFundInvestorDetailResponse | null;
}

/**
 * Full category-relative analysis of one fund: returns, basics, four
 * performance views, valuation & risk, and holdings.
 *
 * ⚠️ Percentiles, ranks, quartiles, category ranges, sector and credit
 * breakdowns, and the valuation ratios are GENERATED — Prozpr has no peer
 * aggregates, holdings data or per-fund benchmark. See `lib/fundCategory.ts`.
 * NAV-derived figures (yearly returns, rolling returns, drawdown, Sharpe,
 * Sortino, mean return) and the metadata fields (expense, exit load, plan,
 * option, cap mix) are real.
 */
export function FundAnalysis({
  schemeCode,
  history,
  categoryName,
  assetClass,
  cat,
  fund,
  amc,
  schemeName,
  isin,
  planType,
  optionType,
  navLatest,
  navDate,
  transactions,
  hasRealTransactions,
  unrealisedTax,
  facts,
}: FundAnalysisProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [ratioOpen, setRatioOpen] = useState<string | null>(null);
  const [retRange, setRetRange] = useState<ReturnRange>("3Y");

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const expenseRatio = facts?.direct_plan_fees ?? facts?.regular_plan_fees ?? null;
  const exitLoad =
    facts?.exit_load_percent != null && facts.exit_load_percent > 0
      ? `${facts.exit_load_percent}%${facts.exit_load_months ? ` within ${facts.exit_load_months} months` : ""}`
      : facts
        ? "Nil"
        : null;

  // Section numbers follow what actually renders — "Your investment" is absent
  // for a fund the user doesn't hold, and a visible gap would read as a bug.
  const hasTax = unrealisedTax != null && !unrealisedTax.empty;
  let seq = 1;
  const nSnapshot = seq++;
  const nInvestment = hasTax ? seq++ : null;
  const nValuation = seq++;
  const nHoldings = seq++;
  const nWhoRuns = seq++;

  // Asset mix. The cap split and debt/others come from metadata, so equity is
  // whatever is left rather than a second guess at the same number.
  const debtPct = facts?.debt_pct ?? 0;
  const othersPct = facts?.others_pct ?? 0;
  const equityPct = Math.max(0, 100 - debtPct - othersPct);

  const snapshot = useMemo(
    () =>
      snapshotRows({
        fund,
        cat,
        history,
        seed: schemeCode,
        expenseRatio,
        riskLabel: facts?.risk_rating_sebi ?? null,
        exitLoadPct: facts?.exit_load_percent ?? null,
        exitLoadMonths: facts?.exit_load_months ?? null,
        categoryName,
      }),
    [fund, cat, history, schemeCode, expenseRatio, facts, categoryName],
  );

  /* ── Section 1 data ── */
  return (
    <div className="space-y-3">
      {/* Cumulative growth against an index fund and the category average. */}
      <FundReturnsHero
        history={history}
        seed={schemeCode}
        categoryName={cat.name}
        range={retRange}
        onRange={setRetRange}
      />

      {/* 1 · Snapshot — the handful of figures that decide most of the verdict. */}
      {snapshot.length > 0 && <FundSnapshot rows={snapshot} n={nSnapshot} />}

      {/* 2 · Your investment — what selling today would cost in tax. Entirely
          real, from the user's own ledger; absent when they don't hold it. */}
      <FundUnrealisedTax
        n={nInvestment ?? undefined}
        transactions={transactions}
        hasRealTransactions={hasRealTransactions}
        nav={navLatest}
        navDate={navDate}
        assetClass={assetClass}
        exitLoadPct={facts?.exit_load_percent ?? null}
        exitLoadMonths={facts?.exit_load_months ?? null}
      />

      {/* ── 4 · Valuation & risk ─────────────────────────────────── */}
      <SectionShell
        n={nValuation}
        title="Valuation & risk"
        term="sharpe"
        sub={`Each number, and where it falls in the ${cat.name} range`}
        open={!!open.valuation}
        onToggle={() => toggle("valuation")}
      >
        <p className="mb-1 text-[11px] text-muted-foreground">
          Tap any row for what the number means.
        </p>
        {RATIOS.map((r) => (
          <RatioRow
            key={r.k}
            r={r}
            fund={fund}
            cat={cat}
            open={ratioOpen === r.k}
            onToggle={() => setRatioOpen(ratioOpen === r.k ? null : r.k)}
          />
        ))}
        <ToneLegend />
      </SectionShell>

      {/* ── 5 · What the fund holds ──────────────────────────────── */}
      <SectionShell
        n={nHoldings}
        title="What the fund holds"
        term="mcap"
        sub="Asset mix, company size, sectors and the top holdings"
        open={!!open.holdings}
        onToggle={() => toggle("holdings")}
      >
        <FundHoldings
          seed={schemeCode}
          fund={fund}
          cat={cat}
          equityPct={equityPct}
          debtPct={debtPct}
          othersPct={othersPct}
        />
      </SectionShell>

      {/* ── 6 · Who runs it ────────────────────────────────────── */}
      <SectionShell
        n={nWhoRuns}
        title="Who runs it"
        term="pmtenure"
        sub="Managers, strategy, philosophy and the AMC behind the fund"
        open={!!open.who}
        onToggle={() => toggle("who")}
      >
        <FundManagers
          seed={schemeCode}
          amcName={amc ?? cat.name}
          managerTenureYears={fund.managerTenureYears}
        />
      </SectionShell>

      <FundDisclaimer asOf={navDate} />
    </div>
  );
}

export default FundAnalysis;
