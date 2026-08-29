import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, GitCompare } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import {
  filterNavByRange,
  formatDate,
  formatNav,
  formatPct,
  NAV_RANGES_YTD,
  NavChart,
  navPointsFromApi,
  ProzprRatingCard,
  RangePills,
  type NavRange,
} from "@/components/fund/FundScreenUi";
import { Button } from "@/components/ui/button";
import FundAnalysis from "@/components/fund/FundAnalysis";
import { computeUnrealisedTax } from "@/lib/unrealisedTax";
import { demoLedger } from "@/lib/demoLedger";
import { exportFundAnalysisXls } from "@/lib/fundExport";
import { RATIOS } from "@/lib/fundRatios";
import { useFundProfiles } from "@/hooks/use-fund-profiles";
import {
  getMfFundInvestorDetail,
  getMfHoldingDetail,
  type MfFundInvestorDetailResponse,
  type MfHoldingDetailResponse,
} from "@/lib/api";

/** Discover scheme detail — upcoming UI, `/mf/funds/:schemeCode/holding-detail` data. */
export default function MfFundDetail() {
  const { schemeCode: schemeCodeParam } = useParams<{ schemeCode: string }>();
  const navigate = useNavigate();
  const schemeCode = schemeCodeParam ? decodeURIComponent(schemeCodeParam) : "";

  const [range, setRange] = useState<NavRange>("1Y");
  const [data, setData] = useState<MfHoldingDetailResponse | null>(null);
  // Fees and the equity/debt split live on the metadata record, not the holding
  // detail. Best-effort: the sections that need it just hide when it's absent.
  const [facts, setFacts] = useState<MfFundInvestorDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schemeCode.trim()) {
      setError("Missing scheme code.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setFacts(null);
    try {
      const res = await getMfHoldingDetail(schemeCode);
      setData(res);
      // Chained, not parallel: the metadata id comes from the response above.
      if (res.metadata_id) {
        getMfFundInvestorDetail(res.metadata_id)
          .then(setFacts)
          .catch(() => { /* the fee / allocation cards just hide */ });
      }
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load fund details.");
    } finally {
      setLoading(false);
    }
  }, [schemeCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const history = useMemo(
    () => (data?.nav_history?.length ? navPointsFromApi(data.nav_history) : []),
    [data?.nav_history],
  );

  const rangedHistory = useMemo(() => filterNavByRange(history, range), [history, range]);

  const first = rangedHistory[0]?.nav ?? 0;
  const last = rangedHistory[rangedHistory.length - 1]?.nav ?? data?.latest_nav ?? 0;
  const isUp = last >= first;
  const rangeReturn = first > 0 ? ((last - first) / first) * 100 : 0;
  const latestNavDate = data?.latest_nav_date ?? history[history.length - 1]?.date ?? "";

  const hasTransactions = (data?.transactions.length ?? 0) > 0;

  // The ledger "Your investment" works off. Falls back to a FABRICATED holding
  // when the user owns nothing here, so the section can be reviewed on any
  // fund — see lib/demoLedger.ts. Drop the fallback once holdings are live.
  const ledger = useMemo(
    () =>
      hasTransactions ? data!.transactions : demoLedger(schemeCode, history),
    [hasTransactions, data, schemeCode, history],
  );

  const categoryName = data?.sub_category || data?.category || "its category";

  // Held here rather than inside FundAnalysis because the export button lives in
  // the header — both must read exactly the same numbers.
  const { cat, fund } = useFundProfiles({
    schemeCode,
    history,
    categoryName,
    assetClass: data?.asset_class ?? null,
    facts,
  });

  // Computed once and shared by the tax section and the workbook, so the two
  // can never disagree about what selling today would cost.
  const unrealisedTax = useMemo(
    () =>
      data
        ? computeUnrealisedTax(ledger, {
            nav: data.latest_nav,
            navDate: latestNavDate,
            assetType:
              (data.asset_class ?? "").trim().toLowerCase() === "equity"
                ? "EQUITY"
                : "NON_EQUITY",
            exitLoadPct: facts?.exit_load_percent ?? null,
            exitLoadMonths: facts?.exit_load_months ?? null,
          })
        : null,
    [data, ledger, latestNavDate, facts],
  );

  // Where the money sits. Rendered only when the metadata actually carries a
  // split — an all-zero bar would read as "100% cash" rather than "unknown".
  const allocation = useMemo(() => {
    if (!facts) return [];
    const rows = [
      { label: "Large cap", pct: facts.large_cap_equity_pct, color: "hsl(217 79% 51%)" },
      { label: "Mid cap", pct: facts.mid_cap_equity_pct, color: "hsl(217 60% 64%)" },
      { label: "Small cap", pct: facts.small_cap_equity_pct, color: "hsl(217 45% 76%)" },
      { label: "Debt", pct: facts.debt_pct, color: "hsl(188 52% 41%)" },
      { label: "Other / cash", pct: facts.others_pct, color: "hsl(38 64% 47%)" },
    ].filter((r): r is { label: string; pct: number; color: string } => r.pct != null && r.pct > 0);
    return rows.reduce((sum, r) => sum + r.pct, 0) > 0 ? rows : [];
  }, [facts]);

  const expenseRatio = facts?.direct_plan_fees ?? facts?.regular_plan_fees ?? null;
  const exitLoad =
    facts?.exit_load_percent != null && facts.exit_load_percent > 0
      ? `${facts.exit_load_percent}%${
          facts.exit_load_months ? ` if sold within ${facts.exit_load_months} months` : ""
        }`
      : facts
        ? "Nil"
        : null;

  const downloadXls = useCallback(() => {
    if (!data) return;
    exportFundAnalysisXls({
      schemeCode,
      schemeName: data.scheme_name ?? schemeCode,
      amc: data.amc_name,
      isin: data.isin,
      category: cat.name,
      assetClass: data.asset_class,
      planType: data.plan_type,
      optionType: data.option_type,
      riskLabel: facts?.risk_rating_sebi ?? null,
      expenseRatio: facts?.direct_plan_fees ?? facts?.regular_plan_fees ?? null,
      exitLoad:
        facts?.exit_load_percent != null && facts.exit_load_percent > 0
          ? `${facts.exit_load_percent}%${facts.exit_load_months ? ` within ${facts.exit_load_months} months` : ""}`
          : facts
            ? "Nil"
            : null,
      navLatest: data.latest_nav,
      navDate: latestNavDate,
      history,
      fund,
      cat,
      ratioSpecs: RATIOS,
      unrealisedTax,
    });
  }, [data, schemeCode, cat, fund, facts, latestNavDate, history, unrealisedTax]);

  return (
    <div className="mobile-container min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background">
        <div className="flex items-start gap-2 px-4 pb-3 pt-10">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight text-foreground">
              {loading ? "Loading…" : data?.scheme_name ?? schemeCode}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/discovery/compare?codes=${encodeURIComponent(schemeCode)}`)}
            className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary/40"
          >
            <GitCompare className="h-3.5 w-3.5" /> Compare
          </button>
          {/* The full analysis as a workbook — icon only, so it sits beside
              Compare without crowding the scheme name. */}
          <button
            type="button"
            onClick={downloadXls}
            disabled={!data}
            aria-label="Download this analysis as Excel"
            title="Download this analysis (Excel)"
            className="mt-0.5 inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary/40 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-16 rounded-2xl bg-muted" />
            <div className="h-[220px] rounded-2xl bg-muted" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-[13px] text-foreground">{error}</p>
            <Button variant="secondary" size="sm" className="mt-3" type="button" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}

        {!loading && data && (
          <>
            <ProzprRatingCard />

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">NAV / unit</p>
                  <p
                    className="mt-0.5 text-[18px] font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    ₹{formatNav(last)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">{range} change</p>
                  <p
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: isUp ? "hsl(164 54% 40%)" : "hsl(0 84% 50%)" }}
                  >
                    {formatPct(rangeReturn)}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <NavChart points={rangedHistory} isUp={isUp} />
              </div>
              <RangePills range={range} onRange={setRange} ranges={NAV_RANGES_YTD} />
            </section>

            {/* Full category-relative analysis — returns, basics, performance,
                valuation & risk, holdings. NOTE: percentiles, ranks, quartiles,
                category ranges, sectors, credit quality and the valuation
                ratios are GENERATED (see lib/fundCategory.ts) — Prozpr has no
                peer aggregates, holdings feed or per-fund benchmark yet. Must be
                wired to real sources before this page ships. */}
            <FundAnalysis
              schemeCode={schemeCode}
              schemeName={data.scheme_name ?? schemeCode}
              isin={data.isin}
              history={history}
              navLatest={data.latest_nav}
              navDate={latestNavDate}
              transactions={ledger}
              hasRealTransactions={hasTransactions}
              unrealisedTax={unrealisedTax}
              categoryName={categoryName}
              cat={cat}
              fund={fund}
              assetClass={data.asset_class}
              amc={data.amc_name}
              planType={data.plan_type}
              optionType={data.option_type}
              facts={facts}
            />

            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-[12px] font-semibold text-foreground">Fund profile</p>
              <dl className="mt-3 space-y-2 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">ISIN</dt>
                  <dd
                    className="font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {data.isin ?? "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Scheme code</dt>
                  <dd
                    className="font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {data.scheme_code}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="font-semibold text-foreground">
                    {[data.category, data.sub_category].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-semibold text-foreground">
                    {[data.plan_type, data.option_type].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
