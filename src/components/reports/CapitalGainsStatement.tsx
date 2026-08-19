/**
 * Capital Gains Statement — the HTML rendering of
 * `/statements/capital-gains-statement.pdf`, computed live by FIFO-matching the
 * MF transaction ledger (see `lib/capitalGains.ts` for the matching + the
 * short/long-term rules and their documented limitations).
 *
 * With no redemptions in the ledger there is nothing to compute, so the screen
 * falls back to `DEMO_CAPITAL_GAINS` — the same figures as the shipped PDF —
 * behind a "Sample" badge. Sample and real rows are never mixed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { formatDate, formatNav1, formatUnits } from "@/components/fund/FundScreenUi";
import {
  FilterSelect,
  GainCell,
  ReportFootnote,
  StatTile,
  StatementNotice,
  TableShell,
  Td,
  Th,
  todayLabel,
  type ExportHandle,
} from "@/components/reports/ReportUi";
import { summariseGains, taxHeads, type RealisedGainRow } from "@/lib/capitalGains";
import { DEMO_CAPITAL_GAINS } from "@/lib/demoCapitalGains";
import { exportCapitalGainsXls } from "@/lib/export-xls";

const TERM_OPTIONS = [
  { value: "ALL", label: "Short + long" },
  { value: "SHORT", label: "Short term" },
  { value: "LONG", label: "Long term" },
];

const ASSET_OPTIONS = [
  { value: "ALL", label: "All funds" },
  { value: "EQUITY", label: "Equity-oriented" },
  { value: "NON_EQUITY", label: "Non-equity" },
];

/** Whole rupees with the Indian grouping, e.g. "₹1,25,000". */
function inr(n: number): string {
  const sign = n < 0 ? "−" : "";
  return `${sign}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
}

export default function CapitalGainsStatement({
  rows: liveRows,
  loading,
  error,
  period,
  onExportChange,
}: {
  rows: RealisedGainRow[];
  loading: boolean;
  error: string | null;
  /** Reporting period from the page header — "ALL" or a financial year label. */
  period: string;
  onExportChange: (handle: ExportHandle | null) => void;
}) {
  const [term, setTerm] = useState("ALL");
  const [assetType, setAssetType] = useState("ALL");
  const [query, setQuery] = useState("");

  // Fall back to the sample whenever there is nothing real to show — including
  // when the ledger call failed. A blank screen tells the user nothing; the
  // failure itself is surfaced in the banner instead.
  const isSample = !loading && liveRows.length === 0;
  const allRows = isSample ? DEMO_CAPITAL_GAINS : liveRows;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((r) => {
      if (period !== "ALL" && r.fy !== period) return false;
      if (term !== "ALL" && r.term !== term) return false;
      if (assetType !== "ALL" && r.assetType !== assetType) return false;
      if (q && !`${r.fundName} ${r.schemeCode} ${r.folio} ${r.isin ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [allRows, period, term, assetType, query]);

  const summary = useMemo(() => summariseGains(rows), [rows]);
  // Only the per-head GAIN split is shown; `taxHeads` also carries the
  // exemption/rate/tax fields, which this screen deliberately doesn't display.
  const heads = useMemo(() => taxHeads(summary), [summary]);

  const filterSummary = useMemo(() => {
    const parts = [
      period === "ALL" ? "All financial years" : period,
      term === "ALL" ? "Short + long term" : term === "SHORT" ? "Short term" : "Long term",
      assetType === "ALL"
        ? "All funds"
        : assetType === "EQUITY"
          ? "Equity-oriented"
          : "Non-equity",
    ];
    if (query.trim()) parts.push(`search "${query.trim()}"`);
    if (isSample) parts.push("SAMPLE DATA");
    return parts.join(" · ");
  }, [period, term, assetType, query, isSample]);

  const downloadExcel = useCallback(() => {
    if (rows.length === 0) {
      toast.error("Nothing to export — no realised gains match these filters.");
      return;
    }
    exportCapitalGainsXls(rows, summary, { generatedOn: todayLabel(), filterSummary });
    toast.success("Capital gains statement downloaded.");
  }, [rows, summary, filterSummary]);

  // Publish the export to the page header, which owns the download button.
  const noRows = rows.length === 0;
  useEffect(() => {
    onExportChange({
      onExcel: downloadExcel,
      pdfHref: "/statements/capital-gains-statement.pdf",
      disabled: noRows,
    });
  }, [onExportChange, downloadExcel, noRows]);

  if (loading) {
    return <StatementNotice>Matching your redemptions against purchases…</StatementNotice>;
  }

  return (
    <div className="space-y-3">
      {isSample && error && (
        <div className="rounded-xl border border-dashed border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          We couldn&apos;t load your transaction history ({error}) — showing the example statement
          instead.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* Realised (book) gain leads — it's the number people come for; the
            taxable figure beside it nets off grandfathering relief. */}
        <StatTile
          label="Realised gain"
          value={inr(summary.totalGain)}
          tone={summary.totalGain >= 0 ? "positive" : "negative"}
        />
        <StatTile
          label="Taxable gain"
          value={inr(summary.totalTaxableGain)}
          tone={summary.totalTaxableGain >= 0 ? "positive" : "negative"}
        />
        <StatTile
          label="Long-term gains"
          value={inr(summary.longTermGain)}
          tone={summary.longTermGain >= 0 ? "positive" : "negative"}
        />
        <StatTile
          label="Short-term gains"
          value={inr(summary.shortTermGain)}
          tone={summary.shortTermGain >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Filters — the reporting period lives in the page header. */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex items-end gap-2">
          <FilterSelect label="Term" value={term} options={TERM_OPTIONS} onChange={setTerm} />
          <FilterSelect
            label="Fund type"
            value={assetType}
            options={ASSET_OPTIONS}
            onChange={setAssetType}
          />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Search
          </p>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fund, folio or ISIN"
              className="h-8 pl-7 text-[11.5px]"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Realised transactions
        </p>
        {/* The banner is gone, but sample figures must still not read as the
            user's own — keep a quiet marker on the section itself. */}
        {isSample && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ backgroundColor: "rgba(212,168,104,0.18)", color: "#8a6524" }}
          >
            SAMPLE
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <StatementNotice>No realised gains match these filters.</StatementNotice>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Scheme</Th>
              <Th>Type</Th>
              <Th align="right">Units</Th>
              <Th>Acquired</Th>
              <Th>Sold</Th>
              <Th align="right">Days</Th>
              <Th>Term</Th>
              <Th align="right">Taxable gain</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="max-w-[220px]">
                  <span className="block truncate font-medium text-foreground" title={r.fundName}>
                    {r.fundName}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {r.isin ? `${r.isin} · ` : ""}Folio {r.folio}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{r.txnType}</Td>
                <Td align="right">{formatUnits(r.units)}</Td>
                <Td className="whitespace-nowrap">
                  <span className="block">{formatDate(r.purchaseDate)}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {inr(r.purchaseValue)} · @{formatNav1(r.purchaseNav)}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="block">{formatDate(r.saleDate)}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {inr(r.saleValue)} · @{formatNav1(r.saleNav)}
                  </span>
                </Td>
                <Td align="right" className="text-muted-foreground">
                  {r.holdingDays}
                </Td>
                <Td className="whitespace-nowrap">
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={
                      r.term === "LONG"
                        ? { backgroundColor: "rgba(22,163,74,0.14)", color: "#15803d" }
                        : { backgroundColor: "rgba(220,38,38,0.12)", color: "#b91c1c" }
                    }
                  >
                    {r.term === "LONG" ? "LTCG" : "STCG"}
                  </span>
                </Td>
                <Td align="right" className="font-medium">
                  <GainCell value={r.taxableGain} text={inr(r.taxableGain)} />
                  {r.taxableGain !== r.gain && (
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      book {inr(r.gain)}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-secondary/40">
              <Td className="font-semibold">Total ({summary.rowCount})</Td>
              <Td />
              <Td align="right" />
              <Td align="right" className="whitespace-nowrap font-semibold">
                {inr(summary.costValue)}
              </Td>
              <Td align="right" className="whitespace-nowrap font-semibold">
                {inr(summary.saleValue)}
              </Td>
              <Td align="right" />
              <Td />
              <Td align="right" className="font-semibold">
                <GainCell value={summary.totalTaxableGain} text={inr(summary.totalTaxableGain)} />
              </Td>
            </tr>
          </tfoot>
        </TableShell>
      )}

      {rows.length > 0 && (
        <>
          <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tax summary (indicative)
          </p>
          <TableShell>
            <thead>
              <tr>
                <Th>Head</Th>
                <Th align="right">Gain</Th>
              </tr>
            </thead>
            <tbody>
              {heads.map((h) => (
                <tr key={h.label}>
                  <Td className="whitespace-nowrap font-medium text-foreground">{h.label}</Td>
                  <Td align="right" className="font-medium">
                    <GainCell value={h.gain} text={inr(h.gain)} />
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/40">
                <Td className="whitespace-nowrap font-semibold">Total</Td>
                <Td align="right" className="font-semibold">
                  <GainCell
                    value={summary.totalTaxableGain}
                    text={inr(summary.totalTaxableGain)}
                  />
                </Td>
              </tr>
            </tfoot>
          </TableShell>
        </>
      )}

      <ReportFootnote>
        LTCG on listed equity units held over 12 months; grandfathered NAV as on 31 Jan 2018 applied
        where relevant. Gains are before loss set-off — not tax advice.
      </ReportFootnote>
    </div>
  );
}
