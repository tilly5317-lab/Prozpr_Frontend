import { useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info, TrendingUp } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  getMfFundInvestorDetail,
  type MfFundInvestorDetailResponse,
  type MfNavChartPoint,
} from "@/lib/api";

function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function fmtNav(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function fmtAlloc(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

/** Return figures only — compact, no background tint on cards. */
function returnColorClass(raw: number | null | undefined): string {
  if (raw == null || Number.isNaN(raw)) return "text-foreground";
  if (raw >= 0) return "text-[hsl(var(--wealth-green))]";
  return "text-destructive";
}

function NavLineChart({ points }: { points: MfNavChartPoint[] }) {
  const uid = useId().replace(/:/g, "");
  if (points.length < 2) {
    return (
      <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border px-3 text-center">
        <p className="text-xs text-muted-foreground">
          Not enough NAV history to draw performance. Run NAV sync for this scheme.
        </p>
      </div>
    );
  }
  const vals = points.map((p) => p.nav);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max === min ? 1 : max - min;
  const up = vals[vals.length - 1] >= vals[0];
  const stroke = up ? "hsl(var(--wealth-green))" : "hsl(var(--destructive))";
  const fillStop = up ? "hsl(var(--wealth-green))" : "hsl(var(--destructive))";
  const w = 320;
  const h = 112;
  const pad = 8;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * innerW;
    const y = pad + innerH - ((p.nav - min) / span) * innerH;
    return `${x},${y}`;
  });
  const fillId = `navFill-${uid}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-28 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillStop} stopOpacity="0.35" />
          <stop offset="100%" stopColor={fillStop} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(" ")}
      />
      <polyline
        fill={`url(#${fillId})`}
        stroke="none"
        points={`${pad},${h - pad} ${coords.join(" ")} ${w - pad},${h - pad}`}
      />
    </svg>
  );
}

function MetricCard({
  label,
  raw,
  sub,
}: {
  label: string;
  raw: number | null | undefined;
  sub?: string;
}) {
  const display = fmtPct(raw);
  const tone = returnColorClass(raw);
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-lg font-semibold tabular-nums tracking-tight ${tone}`}>{display}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const MfFundDetail = () => {
  const { fundId } = useParams<{ fundId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<MfFundInvestorDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fundId) {
      setError("Missing fund id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMfFundInvestorDetail(fundId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load fund");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fundId]);

  const nav = data?.returns_from_nav;
  const metaR = data?.returns_from_metadata;

  return (
    <div className="mobile-container min-h-screen bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom,8px)+12px)]">
      <div className="flex items-center gap-3 px-5 pb-3 pt-12">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-lg font-bold leading-snug text-foreground">
            {data?.scheme_name ?? "Fund details"}
          </h1>
          {data && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {data.amc_name} · {data.sub_category ?? data.category}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-5 px-5 pb-8">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        )}

        {!loading && data && (
          <>
            <div className="flex flex-wrap gap-2">
              {data.risk_rating_sebi && (
                <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {data.risk_rating_sebi}
                </span>
              )}
              <span className="rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-foreground">
                {data.plan_type} · {data.option_type}
              </span>
              {data.isin && (
                <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
                  <span className="text-muted-foreground/80">ISIN</span>{" "}
                  <span className="font-mono text-foreground/90">{data.isin}</span>
                </span>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                <div>
                  <p className="text-xs font-semibold text-foreground">NAV trend</p>
                  <p className="text-[10px] text-muted-foreground">Based on stored daily NAV (approx. last 2 years)</p>
                </div>
              </div>
              <div className="px-2 pt-2">
                <NavLineChart points={data.nav_chart} />
              </div>
              <div className="flex items-center justify-between px-4 pb-3 pt-1">
                <span className="text-[10px] text-muted-foreground">
                  {nav?.nav_row_count?.toLocaleString("en-IN") ?? 0} NAV rows
                </span>
                <span className="text-[10px] text-muted-foreground">
                  As of {fmtDate(nav?.latest_nav_date ?? undefined)}
                </span>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Returns from NAV
              </h2>
              <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Rolling windows from your latest published NAV. Multi-year figures use CAGR where noted; 1Y is absolute
                point-to-point.
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <MetricCard label="1Y" raw={nav?.return_1y_abs_pct} sub="Absolute" />
                <MetricCard label="3Y CAGR" raw={nav?.return_3y_cagr_pct} />
                <MetricCard label="5Y CAGR" raw={nav?.return_5y_cagr_pct} />
                <MetricCard label="10Y CAGR" raw={nav?.return_10y_cagr_pct} />
                <MetricCard label="Since inception" raw={nav?.return_inception_cagr_pct} sub="CAGR" />
                <MetricCard label="Inception (total)" raw={nav?.return_inception_abs_pct} sub="Point-to-point" />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                <p className="text-xs font-semibold text-foreground">Catalog returns (reference)</p>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Headline numbers from the fund master table — useful when NAV history is still backfilling.
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <CatalogRet label="1Y" raw={metaR?.returns_1y_pct} />
                <CatalogRet label="3Y" raw={metaR?.returns_3y_pct} />
                <CatalogRet label="5Y" raw={metaR?.returns_5y_pct} />
                <CatalogRet label="10Y" raw={metaR?.returns_10y_pct} />
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Fund snapshot
              </h2>
              <div className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm">
                <Row label="Latest NAV" value={fmtNav(nav?.latest_nav ?? undefined)} />
                <Row label="Scheme code" value={data.scheme_code} />
                <Row label="First NAV in DB" value={fmtDate(nav?.first_nav_date ?? undefined)} />
                <Row
                  label="Expense (direct / regular)"
                  value={
                    data.direct_plan_fees != null || data.regular_plan_fees != null
                      ? `${data.direct_plan_fees != null ? `${data.direct_plan_fees}%` : "—"} / ${
                          data.regular_plan_fees != null ? `${data.regular_plan_fees}%` : "—"
                        }`
                      : "—"
                  }
                />
                <Row
                  label="Exit load"
                  value={
                    data.exit_load_percent != null
                      ? `${data.exit_load_percent}%${data.exit_load_months != null ? ` · ${data.exit_load_months} mo` : ""}`
                      : "—"
                  }
                />
                <Row
                  label="Equity mix (L/M/S)"
                  value={
                    [data.large_cap_equity_pct, data.mid_cap_equity_pct, data.small_cap_equity_pct].some((x) => x != null)
                      ? `${fmtAlloc(data.large_cap_equity_pct)} / ${fmtAlloc(data.mid_cap_equity_pct)} / ${fmtAlloc(
                          data.small_cap_equity_pct,
                        )}`
                      : "—"
                  }
                />
                <Row
                  label="Debt / Others"
                  value={
                    data.debt_pct != null || data.others_pct != null
                      ? `${fmtAlloc(data.debt_pct)} / ${fmtAlloc(data.others_pct)}`
                      : "—"
                  }
                />
              </div>
            </div>

            {data.disclaimers.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Notes</p>
                <ul className="list-inside list-disc space-y-1">
                  {data.disclaimers.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] leading-relaxed text-muted-foreground/80">
              Past performance does not guarantee future results. NAV-based returns depend on data coverage and may differ
              from AMC-published factsheets.
            </p>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function CatalogRet({ label, raw }: { label: string; raw: number | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-semibold tabular-nums tracking-tight ${returnColorClass(raw)}`}>{fmtPct(raw)}</p>
    </div>
  );
}

export default MfFundDetail;
