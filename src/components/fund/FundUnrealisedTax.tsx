import { useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";

import { formatDate, formatINRPaisa } from "@/components/fund/FundScreenUi";
import { InfoTip, Term } from "@/components/fund/InfoTip";
import type { GainAssetType } from "@/lib/capitalGains";
import {
  computeHoldingSummary,
  computeUnrealisedTax,
  type TermBlock,
} from "@/lib/unrealisedTax";
import type { MfHoldingTransactionItem } from "@/lib/api";

/** ₹ with Indian grouping, no paisa — the register these figures read in. */
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
/** Signed for the "less" lines, which are always subtractions. */
const less = (n: number) => `− ${inr(n)}`;

/** One line of the working. `strong` marks a subtotal. */
function Line({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border/50 px-3.5 py-2 first:border-t-0">
      <span
        className={`text-[12px] ${
          strong ? "font-semibold text-foreground" : muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {label}
      </span>
      <span
        className={`shrink-0 tabular-nums ${
          strong ? "text-[12.5px] font-bold text-foreground" : "text-[12px] text-muted-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** The long-term or short-term working, ending in the tax on that slice. */
function TermCard({ block, note }: { block: TermBlock; note: string }) {
  const isLong = block.term === "LONG";
  const title = isLong ? "Long term" : "Short term";
  const gainLabel = isLong ? "Long term gains" : "Short term gains";
  const taxLabel = isLong ? "Unrealised long term tax" : "Unrealised short term tax";

  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <Term
        term={isLong ? "ltcg" : "stcg"}
        className="border-b border-border/60 bg-muted/30 px-3.5 py-2 text-[12px] font-semibold text-foreground"
      >
        {title}
      </Term>

      <Line label="Current value" value={inr(block.currentValue)} strong />
      <Line
        label="Exit load"
        value={block.exitLoad > 0 ? less(block.exitLoad) : "₹0"}
        muted
      />
      <Line label="Amount realised" value={inr(block.amountRealised)} strong />
      <Line label="Less: investment value" value={less(block.investmentValue)} muted />
      <Line
        label={gainLabel}
        value={`${block.gains < 0 ? "− " : ""}${inr(block.gains)}`}
        strong
      />
      {isLong && (
        <Line label="Less: annual exemption" value={less(block.exemption)} muted />
      )}
      <Line label={`Taxable ${title.toLowerCase()} gains`} value={inr(block.taxable)} strong />

      {/* The answer — tinted so it reads as the outcome of the working above. */}
      <div className="flex items-baseline justify-between gap-3 border-t border-border/60 bg-primary/[0.07] px-3.5 py-2.5">
        <span className="text-[12px] font-semibold text-foreground">
          {taxLabel}{" "}
          <span className="font-normal text-muted-foreground">@ {block.ratePct}%</span>
        </span>
        <span className="shrink-0 text-[13px] font-bold tabular-nums text-primary">
          {inr(block.tax)}
        </span>
      </div>

      <p className="border-t border-border/50 px-3.5 py-2 text-[10.5px] leading-snug text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

const UP = "hsl(151 55% 38%)";
const DOWN = "hsl(4 70% 50%)";

/** One of the four headline tiles. */
function StatTile({
  label,
  value,
  tone,
  term,
}: {
  label: string;
  value: string;
  tone?: string;
  term?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
      <Term term={term} className="text-[10px] text-muted-foreground">
        {label}
      </Term>
      <p
        className="mt-0.5 text-[15px] font-bold tabular-nums"
        style={{ color: tone ?? "hsl(var(--foreground))" }}
      >
        {value}
      </p>
    </div>
  );
}

/** One row of the holding detail list. */
function DetailRow({ label, value, term }: { label: string; value: string; term?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-border/50 py-2">
      <Term term={term} className="text-[12px] text-muted-foreground">
        {label}
      </Term>
      <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/**
 * "If you sold this holding today, what would the tax be?"
 *
 * Every figure here is real — it works off the user's own transaction ledger
 * and the latest NAV, FIFO-matched and split by holding period using the same
 * rules and rates as the realised capital-gains statement.
 *
 * Renders nothing when the user doesn't hold the fund; there is no tax question
 * to answer, and an all-zero card would just be noise on a discovery page.
 */
export function FundUnrealisedTax({
  transactions,
  nav,
  navDate,
  assetClass,
  exitLoadPct,
  exitLoadMonths,
  onViewTransactions,
  hasRealTransactions = true,
  n,
}: {
  transactions: MfHoldingTransactionItem[];
  nav: number | null;
  navDate: string | null;
  assetClass: string | null;
  exitLoadPct: number | null;
  exitLoadMonths: number | null;
  onViewTransactions?: () => void;
  /** False when the ledger above is a stand-in rather than the user's own. */
  hasRealTransactions?: boolean;
  /** Position in the numbered section sequence. */
  n?: number;
}) {
  const [open, setOpen] = useState(true);

  const assetType: GainAssetType =
    (assetClass ?? "").trim().toLowerCase() === "equity" ? "EQUITY" : "NON_EQUITY";

  const tax = useMemo(
    () =>
      computeUnrealisedTax(transactions, {
        nav,
        navDate,
        assetType,
        exitLoadPct,
        exitLoadMonths,
      }),
    [transactions, nav, navDate, assetType, exitLoadPct, exitLoadMonths],
  );

  const summary = useMemo(
    () => computeHoldingSummary(transactions, { nav, assetType }),
    [transactions, nav, assetType],
  );

  if (tax.empty || summary.empty) return null;

  // Split bar: what went in versus what the market added. A loss has no gains
  // slice to draw, so the bar fills with cost and the label carries the sign.
  const investedShare =
    summary.currentValue > 0
      ? Math.min(100, (summary.investedValue / summary.currentValue) * 100)
      : 100;

  const ltNote =
    assetType === "EQUITY"
      ? "Units held over 12 months. Gains up to ₹1,25,000 in a year are exempt; the rest is taxed at 12.5%."
      : "Units held long enough to qualify. Gains up to ₹1,25,000 in a year are exempt; the rest is taxed at 12.5%.";
  const stNote =
    assetType === "EQUITY"
      ? "Units held 12 months or less, taxed at 20% with no exemption."
      : "Units that don't yet qualify for the long-term rate, taxed at 20% with no exemption.";

  return (
    <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full px-4 pb-3 pt-3.5 text-left"
      >
        <div className="flex items-start gap-2.5">
          {n != null && (
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10.5px] font-bold text-muted-foreground">
              {n}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold leading-tight text-foreground">
              Your investment
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              What you put in, what it is worth, and what tax it would attract today
            </p>
          </div>
          <span className="shrink-0 text-right">
            <span className="block text-[13px] font-bold tabular-nums text-foreground">
              {inr(summary.currentValue)}
            </span>
            <span
              className="block text-[10px] font-semibold tabular-nums"
              style={{ color: summary.gains >= 0 ? UP : DOWN }}
            >
              {summary.gains >= 0 ? "+" : "−"}
              {inr(summary.gains)}
            </span>
          </span>
          <svg
            width="14"
            height="9"
            viewBox="0 0 12 8"
            className={`mt-1.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M1 1.5L6 6.5l5-5"
              fill="none"
              stroke="currentColor"
              className="text-muted-foreground"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {open && (
        <div className="space-y-2.5 px-4 pb-4">
          {/* What it's worth, what it cost, and the return on it. */}
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Current value" value={inr(summary.currentValue)} />
            <StatTile label="Investment value" value={inr(summary.investedValue)} />
            <StatTile
              label="Total capital gains"
              value={`${summary.gains >= 0 ? "+ " : "− "}${inr(summary.gains)}`}
              tone={summary.gains >= 0 ? UP : DOWN}
            />
            <StatTile
              term="xirr"
              label="XIRR"
              value={summary.xirr == null ? "—" : `${(summary.xirr * 100).toFixed(1)}%`}
              tone={
                summary.xirr == null ? undefined : summary.xirr >= 0 ? UP : DOWN
              }
            />
          </div>

          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">
              <span
                style={{ width: `${investedShare}%`, backgroundColor: "hsl(217 91% 58%)" }}
              />
              {summary.gains > 0 && (
                <span style={{ width: `${100 - investedShare}%`, backgroundColor: UP }} />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>Invested {investedShare.toFixed(0)}%</span>
              <span style={{ color: summary.gains >= 0 ? UP : DOWN }}>
                {summary.gains >= 0
                  ? `Gains ${(100 - investedShare).toFixed(0)}%`
                  : `Loss ${Math.abs(summary.gainsPct).toFixed(0)}%`}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-0.5 text-[12px] font-semibold text-foreground">Holding detail</p>
            <DetailRow
              term="units"
              label="Units"
              value={summary.units.toLocaleString("en-IN", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })}
            />
            <DetailRow term="avgnav" label="Average NAV" value={formatINRPaisa(summary.averageNav)} />
            {summary.firstInvestmentDate && (
              <DetailRow
                label="First investment date"
                value={formatDate(summary.firstInvestmentDate)}
              />
            )}
            {summary.lastInvestmentDate && (
              <DetailRow
                label="Last investment date"
                value={formatDate(summary.lastInvestmentDate)}
              />
            )}
          </div>

          <div className="pt-1">
            <p className="text-[12px] font-semibold text-foreground">
              Tax liability if you redeem today
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              Unrealised — nothing is owed until you actually redeem.
            </p>
          </div>

          {tax.long && <TermCard block={tax.long} note={ltNote} />}
          {tax.short && <TermCard block={tax.short} note={stNote} />}

          <div className="flex items-baseline justify-between gap-3 rounded-xl border border-border/70 px-3.5 py-2.5">
            <span className="text-[12.5px] font-semibold text-foreground">
              Total unrealised tax
            </span>
            <span className="shrink-0 text-[14px] font-bold tabular-nums text-primary">
              {inr(tax.totalTax)}
            </span>
          </div>

          {onViewTransactions && (
            <button
              type="button"
              onClick={onViewTransactions}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-muted/50"
            >
              View transactions
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Sits at the end of the working, where a reader who has just read a
              holding they don't recognise will look for the explanation. */}
          {!hasRealTransactions && (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2.5"
              style={{
                backgroundColor: "hsl(var(--muted) / 0.45)",
                border: "1px solid hsl(var(--border) / 0.6)",
              }}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-[11.5px] leading-snug text-muted-foreground">
                You have no recorded transactions in this scheme.
              </p>
            </div>
          )}

          <p className="px-1 text-[10px] leading-snug text-muted-foreground/80">
            Indicative. Lots are matched oldest-first, valued at the NAV of{" "}
            {tax.navDate ?? "the latest available date"} ({formatINRPaisa(tax.navUsed)}). The
            ₹1,25,000 long-term allowance is applied in full here — it is a yearly limit shared
            across all your equity holdings, so using it elsewhere reduces what's left for this one.
          </p>
        </div>
      )}
    </section>
  );
}

export default FundUnrealisedTax;
