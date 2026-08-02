/**
 * Portfolio Holdings Statement — the HTML rendering of
 * `/statements/portfolio-holdings-statement.pdf`, driven by the live portfolio.
 *
 * Invested is derived as `quantity × average_cost` (the portfolio API exposes no
 * cost total), so a holding missing either field shows "—" for invested/gain
 * rather than a misleading zero, and is excluded from the totals' cost base.
 *
 * Note on `period`: holdings are a CURRENT snapshot — the portfolio API has no
 * as-of-date parameter — so the page's reporting period only stamps the export,
 * it cannot filter rows. The table says so, rather than pretending otherwise.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  formatINRCompact,
  formatNav1,
  formatPct1,
  formatUnits,
} from "@/components/fund/FundScreenUi";
import {
  FilterSelect,
  GainCell,
  StatTile,
  StatementNotice,
  TableShell,
  Td,
  Th,
  todayLabel,
  type ExportHandle,
} from "@/components/reports/ReportUi";
import { exportHoldingsXls, type HoldingsExportRow } from "@/lib/export-xls";
import type { PortfolioDetail } from "@/lib/api";

type Holding = PortfolioDetail["holdings"][number];
type SortKey = "value" | "gain" | "name";

const SORT_OPTIONS = [
  { value: "value", label: "Current value" },
  { value: "gain", label: "Gain %" },
  { value: "name", label: "Name (A–Z)" },
];

/** Title-cases the raw `instrument_type` ("mutual_fund" → "Mutual Fund"). */
function labelInstrumentType(t: string | null | undefined): string {
  if (!t) return "—";
  return t
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

interface Derived {
  h: Holding;
  invested: number | null;
  gain: number | null;
  gainPct: number | null;
}

function derive(h: Holding): Derived {
  const invested =
    h.quantity != null && h.average_cost != null ? h.quantity * h.average_cost : null;
  const gain = invested != null ? h.current_value - invested : null;
  const gainPct = invested != null && invested > 0 ? ((h.current_value - invested) / invested) * 100 : null;
  return { h, invested, gain, gainPct };
}

export default function HoldingsStatement({
  portfolio,
  loading,
  error,
  period,
  onExportChange,
}: {
  portfolio: PortfolioDetail | null;
  loading: boolean;
  error: string | null;
  /** Reporting period from the page header — stamped on the export only. */
  period: string;
  onExportChange: (handle: ExportHandle | null) => void;
}) {
  const [assetClass, setAssetClass] = useState("ALL");
  const [instrumentType, setInstrumentType] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [query, setQuery] = useState("");

  const holdings = useMemo(() => portfolio?.holdings ?? [], [portfolio]);

  const assetClassOptions = useMemo(() => {
    const set = [...new Set(holdings.map((h) => h.asset_class).filter(Boolean))] as string[];
    return [{ value: "ALL", label: "All classes" }, ...set.sort().map((c) => ({ value: c, label: c }))];
  }, [holdings]);

  const instrumentTypeOptions = useMemo(() => {
    const set = [...new Set(holdings.map((h) => h.instrument_type).filter(Boolean))];
    return [
      { value: "ALL", label: "All types" },
      ...set.sort().map((t) => ({ value: t, label: labelInstrumentType(t) })),
    ];
  }, [holdings]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = holdings.filter((h) => {
      if (assetClass !== "ALL" && h.asset_class !== assetClass) return false;
      if (instrumentType !== "ALL" && h.instrument_type !== instrumentType) return false;
      if (q) {
        const hay = `${h.instrument_name} ${h.ticker_symbol ?? ""} ${h.sub_category ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const derived = filtered.map(derive);
    derived.sort((a, b) => {
      if (sortKey === "name") return a.h.instrument_name.localeCompare(b.h.instrument_name);
      if (sortKey === "gain") return (b.gainPct ?? -Infinity) - (a.gainPct ?? -Infinity);
      return b.h.current_value - a.h.current_value;
    });
    return derived;
  }, [holdings, assetClass, instrumentType, query, sortKey]);

  const totals = useMemo(() => {
    // Cost base counts only holdings that HAVE a cost, so the gain % stays honest
    // when part of the book is missing `average_cost`.
    let value = 0;
    let invested = 0;
    let investedCoverage = 0;
    for (const r of rows) {
      value += r.h.current_value;
      if (r.invested != null) {
        invested += r.invested;
        investedCoverage += r.h.current_value;
      }
    }
    const gain = invested > 0 ? investedCoverage - invested : null;
    return {
      value,
      invested: invested > 0 ? invested : null,
      gain,
      gainPct: invested > 0 && gain != null ? (gain / invested) * 100 : null,
    };
  }, [rows]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(period === "ALL" ? "Current positions" : `${period} · current positions`);
    parts.push(assetClass === "ALL" ? "All asset classes" : assetClass);
    parts.push(instrumentType === "ALL" ? "All instrument types" : labelInstrumentType(instrumentType));
    if (query.trim()) parts.push(`search "${query.trim()}"`);
    return parts.join(" · ");
  }, [period, assetClass, instrumentType, query]);

  const downloadExcel = useCallback(() => {
    if (rows.length === 0) {
      toast.error("Nothing to export — no holdings match these filters.");
      return;
    }
    const exportRows: HoldingsExportRow[] = rows.map((r) => ({
      name: r.h.instrument_name,
      assetClass: r.h.asset_class ?? "—",
      subCategory: r.h.sub_category ?? "—",
      instrumentType: labelInstrumentType(r.h.instrument_type),
      schemeCode: r.h.ticker_symbol ?? "—",
      units: r.h.quantity,
      avgCost: r.h.average_cost,
      currentPrice: r.h.current_price,
      invested: r.invested,
      currentValue: r.h.current_value,
      gain: r.gain,
      gainPct: r.gainPct,
      weightPct: r.h.allocation_percentage,
    }));
    exportHoldingsXls(exportRows, { generatedOn: todayLabel(), filterSummary });
    toast.success("Holdings statement downloaded.");
  }, [rows, filterSummary]);

  // Publish the export to the page header, which owns the download button.
  const noRows = rows.length === 0;
  useEffect(() => {
    onExportChange({
      onExcel: downloadExcel,
      pdfHref: "/statements/portfolio-holdings-statement.pdf",
      disabled: noRows,
    });
  }, [onExportChange, downloadExcel, noRows]);

  if (loading) {
    return <StatementNotice>Loading your holdings…</StatementNotice>;
  }
  if (error) {
    return <StatementNotice>{error}</StatementNotice>;
  }
  if (holdings.length === 0) {
    return (
      <StatementNotice>
        No holdings yet. Upload your CAMS / KFintech statement to populate this report.
      </StatementNotice>
    );
  }

  return (
    <div className="space-y-3">
      {period !== "ALL" && (
        <p className="px-1 text-[10.5px] leading-relaxed text-muted-foreground/70">
          Holdings show your current positions — there is no historical snapshot to filter, so{" "}
          {period} stamps the export rather than changing the rows below.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Current value" value={formatINRCompact(totals.value)} />
        <StatTile
          label="Invested"
          value={totals.invested != null ? formatINRCompact(totals.invested) : "—"}
        />
        <StatTile
          label="Unrealised gain"
          value={totals.gain != null ? formatINRCompact(totals.gain) : "—"}
          tone={totals.gain == null ? "neutral" : totals.gain >= 0 ? "positive" : "negative"}
        />
        <StatTile label="Holdings" value={String(rows.length)} />
      </div>

      {/* Filters */}
      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
        <div className="flex gap-2">
          <FilterSelect
            label="Asset class"
            value={assetClass}
            options={assetClassOptions}
            onChange={setAssetClass}
          />
          <FilterSelect
            label="Instrument"
            value={instrumentType}
            options={instrumentTypeOptions}
            onChange={setInstrumentType}
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Search
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Fund name or scheme code"
                className="h-8 pl-7 text-[11.5px]"
              />
            </div>
          </div>
          <FilterSelect
            label="Sort by"
            value={sortKey}
            options={SORT_OPTIONS}
            onChange={(v) => setSortKey(v as SortKey)}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <StatementNotice>No holdings match these filters.</StatementNotice>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <Th>Fund / Instrument</Th>
              <Th>Asset class</Th>
              <Th align="right">Units</Th>
              <Th align="right">Avg cost</Th>
              <Th align="right">NAV / Price</Th>
              <Th align="right">Invested</Th>
              <Th align="right">Value</Th>
              <Th align="right">Gain</Th>
              <Th align="right">Weight</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.h.id}>
                <Td className="max-w-[220px]">
                  <span className="block truncate font-medium text-foreground" title={r.h.instrument_name}>
                    {r.h.instrument_name}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {r.h.sub_category || labelInstrumentType(r.h.instrument_type)}
                    {r.h.ticker_symbol ? ` · ${r.h.ticker_symbol}` : ""}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">{r.h.asset_class ?? "—"}</Td>
                <Td align="right">{r.h.quantity != null ? formatUnits(r.h.quantity) : "—"}</Td>
                <Td align="right">{r.h.average_cost != null ? formatNav1(r.h.average_cost) : "—"}</Td>
                <Td align="right">{r.h.current_price != null ? formatNav1(r.h.current_price) : "—"}</Td>
                <Td align="right">{r.invested != null ? formatINRCompact(r.invested) : "—"}</Td>
                <Td align="right" className="font-medium">
                  {formatINRCompact(r.h.current_value)}
                </Td>
                <Td align="right">
                  <GainCell
                    value={r.gain}
                    text={r.gain != null ? `${formatINRCompact(r.gain)} (${formatPct1(r.gainPct)})` : "—"}
                  />
                </Td>
                <Td align="right" className="text-muted-foreground">
                  {r.h.allocation_percentage != null ? `${r.h.allocation_percentage.toFixed(1)}%` : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-secondary/40">
              <Td className="font-semibold">Total</Td>
              <Td />
              <Td align="right" />
              <Td align="right" />
              <Td align="right" />
              <Td align="right" className="font-semibold">
                {totals.invested != null ? formatINRCompact(totals.invested) : "—"}
              </Td>
              <Td align="right" className="font-semibold">
                {formatINRCompact(totals.value)}
              </Td>
              <Td align="right" className="font-semibold">
                <GainCell
                  value={totals.gain}
                  text={
                    totals.gain != null
                      ? `${formatINRCompact(totals.gain)} (${formatPct1(totals.gainPct)})`
                      : "—"
                  }
                />
              </Td>
              <Td align="right" />
            </tr>
          </tfoot>
        </TableShell>
      )}

    </div>
  );
}
