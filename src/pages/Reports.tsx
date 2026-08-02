/**
 * Reports landing (`/reports`) — the two statements that used to be bare PDF
 * links on the Profile page, now rendered as filterable HTML under two sub-tabs
 * (`?tab=holdings|gains`, so a tab is linkable and survives back/forward).
 *
 * Two things live at page level rather than inside a statement:
 *   • the reporting PERIOD (annual — a financial year), so switching tabs keeps
 *     the same period, and
 *   • the DOWNLOAD control, which sits beside the title; the active statement
 *     publishes its export via `onExportChange` so the button always exports
 *     exactly the rows on screen.
 *
 * The portfolio loads up front (the default tab needs it); the transaction
 * ledger — which can be thousands of rows — is fetched lazily the first time the
 * capital-gains tab is opened.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarRange } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import CapitalGainsStatement from "@/components/reports/CapitalGainsStatement";
import HoldingsStatement from "@/components/reports/HoldingsStatement";
import { GOLD, HeaderDownload, type ExportHandle } from "@/components/reports/ReportUi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BackendOfflineError,
  getAllMfTransactions,
  getMyPortfolio,
  type PortfolioDetail,
} from "@/lib/api";
import {
  computeRealisedGains,
  recentFinancialYears,
  type RealisedGainRow,
} from "@/lib/capitalGains";

type TabKey = "holdings" | "gains";

const TABS: { key: TabKey; label: string }[] = [
  { key: "holdings", label: "Holdings" },
  { key: "gains", label: "Capital gains" },
];

/** Reporting period is annual for now — full financial years, or all of them. */
const PERIOD_OPTIONS = [
  { value: "ALL", label: "All years" },
  ...recentFinancialYears(6).map((fy) => ({ value: fy, label: fy })),
];

function errorText(e: unknown, fallback: string): string {
  if (e instanceof BackendOfflineError) return "Backend unreachable — try again in a moment.";
  return e instanceof Error ? e.message : fallback;
}

export default function Reports() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabKey = searchParams.get("tab") === "gains" ? "gains" : "holdings";

  const [period, setPeriod] = useState("ALL");
  const [exportHandle, setExportHandle] = useState<ExportHandle | null>(null);

  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  const [gainRows, setGainRows] = useState<RealisedGainRow[] | null>(null);
  const [gainsLoading, setGainsLoading] = useState(false);
  const [gainsError, setGainsError] = useState<string | null>(null);
  /** Guards the lazy ledger fetch against a second run on tab toggling. */
  const gainsRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await getMyPortfolio();
        if (!cancelled) setPortfolio(p);
      } catch (e) {
        if (!cancelled) setPortfolioError(errorText(e, "Could not load your portfolio."));
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** scheme_code → asset_class; a holding's `ticker_symbol` IS the AMFI code. */
  const assetClassByScheme = useMemo(() => {
    const map: Record<string, string> = {};
    for (const h of portfolio?.holdings ?? []) {
      if (h.ticker_symbol && h.asset_class) map[h.ticker_symbol] = h.asset_class;
    }
    return map;
  }, [portfolio]);

  const loadGains = useCallback(async () => {
    gainsRequested.current = true;
    setGainsLoading(true);
    setGainsError(null);
    try {
      const txns = await getAllMfTransactions();
      setGainRows(computeRealisedGains(txns, assetClassByScheme));
    } catch (e) {
      setGainRows([]);
      setGainsError(errorText(e, "Could not load your transaction history."));
    } finally {
      setGainsLoading(false);
    }
  }, [assetClassByScheme]);

  useEffect(() => {
    // Wait for the portfolio so gains are classified with the backend's asset
    // classes rather than falling back to the name heuristic on first paint.
    if (tab !== "gains" || gainsRequested.current || portfolioLoading) return;
    void loadGains();
  }, [tab, portfolioLoading, loadGains]);

  const selectTab = (key: TabKey) => {
    // The outgoing statement's export no longer applies — drop it so the header
    // can't fire a stale download between the switch and the new registration.
    setExportHandle(null);
    setSearchParams(key === "holdings" ? {} : { tab: key }, { replace: true });
  };

  return (
    <div className="mobile-container flex min-h-screen flex-col bg-background pb-24">
      <div className="flex items-center gap-2 px-5 pt-10 pb-3">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="-ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-secondary"
          aria-label="Back to profile"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <h1 className="min-w-0 flex-1 text-lg font-semibold text-foreground">Reports</h1>
        <HeaderDownload handle={exportHandle} />
      </div>

      {/* Reporting period — annual for now; applies to whichever tab is open. */}
      <div className="px-5 pb-2.5">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
          <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Period
          </span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-7 flex-1 border-0 bg-transparent px-1 text-[12px] font-semibold shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[11.5px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sub-tabs — same sliding gold pill as the Invest section's toggle. */}
      <div className="px-5 pb-3">
        <div className="relative flex rounded-full border border-[#D4A868]/25 bg-card p-0.5">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                className="relative z-10 flex-1 rounded-full py-1.5 text-[12.5px] font-semibold"
              >
                {active && (
                  <motion.span
                    layoutId="reports-toggle-pill"
                    className="absolute inset-0 -z-10 rounded-full shadow-sm"
                    style={{ backgroundColor: GOLD }}
                    transition={{ type: "spring", stiffness: 280, damping: 14, mass: 1.1 }}
                  />
                )}
                <span
                  className={`relative transition-colors duration-200 ${active ? "" : "text-muted-foreground"}`}
                  style={active ? { color: "#1a1206" } : undefined}
                >
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5">
        {tab === "holdings" ? (
          <HoldingsStatement
            portfolio={portfolio}
            loading={portfolioLoading}
            error={portfolioError}
            period={period}
            onExportChange={setExportHandle}
          />
        ) : (
          <CapitalGainsStatement
            rows={gainRows ?? []}
            loading={portfolioLoading || gainsLoading || gainRows === null}
            error={gainsError}
            period={period}
            onExportChange={setExportHandle}
          />
        )}
      </div>

      <BottomNav />
    </div>
  );
}
