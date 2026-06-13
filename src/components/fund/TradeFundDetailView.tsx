import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";

import {
  filterNavByRange,
  formatDate,
  formatNav1,
  formatPct1,
  NavChart,
  navPointsFromApi,
  pctReturnForRange,
  ProzprRatingCard,
  RangePills,
  StatBlock,
  type NavRange,
} from "@/components/fund/FundScreenUi";
import {
  getMfHoldingDetail,
  searchMfFunds,
  type MfHoldingDetailResponse,
} from "@/lib/api";

const NAV_UP_COLOR = "hsl(160 50% 38%)";
const NAV_DOWN_COLOR = "hsl(0 84% 50%)";

const tradePillClass = (type: "BUY" | "SELL"): string =>
  type === "SELL"
    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";

export type TradeFundDetailProps = {
  /** BUY / SELL action of the proposed trade. */
  type: "BUY" | "SELL";
  /** Recommended fund name (used as fallback + search term). */
  name: string;
  /** Already-formatted trade amount, e.g. "₹45,000". */
  amount: string;
  /** Short reason headline shown under "Why this trade". */
  subtitle?: string;
  /** Sub-category / category label from the rebalancing trade. */
  category: string;
  /** Human bucket label, e.g. "Equity". */
  bucketLabel: string;
  /** Full rationale — the existing "why suggest this trade" copy, kept verbatim. */
  rationale: string;
  /** ISIN used to resolve the fund's real NAV history / returns. */
  isin?: string | null;
};

/**
 * Resolve a recommended fund to its scheme code so we can pull the same
 * NAV-history / returns payload the holdings & Discover fund-detail pages use.
 * Tries the ISIN first (exact match), then falls back to a name search.
 */
async function resolveSchemeCode(
  isin: string | null | undefined,
  name: string,
): Promise<string | null> {
  const wantIsin = isin?.trim().toUpperCase() ?? "";
  if (wantIsin) {
    const res = await searchMfFunds({ q: isin!.trim(), limit: 5 }).catch(() => null);
    const hit = res?.items.find((i) => (i.isin ?? "").toUpperCase() === wantIsin);
    if (hit) return hit.scheme_code;
  }
  if (name.trim()) {
    const res = await searchMfFunds({ q: name.trim(), limit: 10 }).catch(() => null);
    if (res?.items.length) {
      const byIsin = wantIsin
        ? res.items.find((i) => (i.isin ?? "").toUpperCase() === wantIsin)
        : null;
      return (byIsin ?? res.items[0]).scheme_code;
    }
  }
  return null;
}

/**
 * Renders the Portfolio → Holdings → Fund-detail layout for a *proposed*
 * rebalance trade: identical header / rating / NAV chart / trailing-returns
 * cards (fed by the fund's real NAV data), with the holding & transactions
 * sections swapped for the trade rationale ("Why this trade") and a "This
 * trade" action card. Returns a stack of sections; the parent supplies the
 * page/modal chrome and horizontal padding.
 */
export default function TradeFundDetailView({
  type,
  name,
  amount,
  subtitle,
  category,
  bucketLabel,
  rationale,
  isin,
}: TradeFundDetailProps) {
  const [range, setRange] = useState<NavRange>("1Y");
  const [data, setData] = useState<MfHoldingDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const schemeCode = await resolveSchemeCode(isin, name);
      if (!schemeCode) {
        setData(null);
        return;
      }
      setData(await getMfHoldingDetail(schemeCode));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isin, name]);

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

  const trailingItems = useMemo(
    () => [
      { label: "1M", value: pctReturnForRange(history, "1M") },
      { label: "3M", value: pctReturnForRange(history, "3M") },
      { label: "1Y", value: data?.nav_return_1y_pct ?? pctReturnForRange(history, "1Y") },
      { label: "3Y", value: data?.nav_return_3y_pct ?? pctReturnForRange(history, "3Y") },
    ],
    [history, data?.nav_return_1y_pct, data?.nav_return_3y_pct],
  );

  const hasChart = history.length >= 2;
  const subCategory = data?.sub_category ?? category;

  return (
    <div className="space-y-3">
      {/* Header — mirrors the fund-detail page's title block. */}
      <div>
        <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">Mutual fund</p>
        <h1 className="text-[15px] font-semibold leading-tight text-foreground">
          {data?.scheme_name ?? name}
        </h1>
        {(data?.amc_name || subCategory) && (
          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
            {[data?.amc_name, subCategory].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ${tradePillClass(type)}`}
          >
            {type}
          </span>
          <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
            {bucketLabel.toUpperCase()}
          </span>
          {(data?.category || category) && (
            <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
              {(data?.category ?? category).toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <ProzprRatingCard />

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-[220px] rounded-2xl bg-muted" />
          <div className="h-28 rounded-2xl bg-muted" />
        </div>
      ) : (
        <>
          {/* NAV chart — identical to the fund-detail page. */}
          {hasChart ? (
            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">NAV / unit</p>
                  <p
                    className="mt-0.5 text-[18px] font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    ₹{formatNav1(last)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">{range} change</p>
                  <p
                    className="text-[13px] font-semibold tabular-nums"
                    style={{ color: isUp ? NAV_UP_COLOR : NAV_DOWN_COLOR }}
                  >
                    {formatPct1(rangeReturn)}
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <NavChart points={rangedHistory} isUp={isUp} />
              </div>
              <RangePills range={range} onRange={setRange} />
            </section>
          ) : (
            <section className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">NAV / unit</p>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                Live NAV history isn't available for this fund yet.
              </p>
            </section>
          )}

          {/* Trailing NAV returns — identical to the fund-detail page. */}
          {hasChart && (
            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-[12px] font-semibold text-foreground">Trailing NAV returns</p>
              <p className="mt-0.5 text-[10.5px] text-muted-foreground">
                Total return on the NAV through {latestNavDate ? formatDate(latestNavDate) : "—"}.
              </p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {trailingItems.map(({ label, value }) => {
                  const positive = value != null && value >= 0;
                  return (
                    <div key={label} className="rounded-lg bg-muted/30 px-1.5 py-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p
                        className="mt-0.5 text-[11.5px] font-semibold tabular-nums"
                        style={{
                          color:
                            value == null
                              ? "hsl(var(--muted-foreground))"
                              : positive
                                ? NAV_UP_COLOR
                                : NAV_DOWN_COLOR,
                        }}
                      >
                        {formatPct1(value)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Why this trade — existing rebalance rationale, kept verbatim. */}
          <section className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-semibold text-foreground">Why this trade</p>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
                {type === "SELL" ? "Sell" : "Buy"} {amount}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{rationale}</p>
            {subtitle && <p className="mt-1.5 text-[11px] text-muted-foreground/70">{subtitle}</p>}
          </section>

          {/* This trade — replaces the holding/transactions sections. */}
          <section className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[12px] font-semibold text-foreground">This trade</p>
            </div>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">
              Proposed by Prozpr to glide your {bucketLabel.toLowerCase()} sleeve back to target.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatBlock
                label="Action"
                value={type}
                valueColor={type === "SELL" ? NAV_DOWN_COLOR : NAV_UP_COLOR}
              />
              <StatBlock label="Amount" value={amount} />
              <StatBlock label="Bucket" value={bucketLabel} />
              <StatBlock label="Sub-category" value={subCategory || "—"} />
            </div>
          </section>

          {/* Fund profile — identical to the fund-detail page. */}
          <section className="rounded-2xl border border-border/70 bg-card p-4">
            <p className="text-[12px] font-semibold text-foreground">Fund profile</p>
            <dl className="mt-3 space-y-2 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">ISIN</dt>
                <dd
                  className="font-semibold tabular-nums text-foreground"
                  style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                >
                  {data?.isin ?? isin ?? "—"}
                </dd>
              </div>
              {data?.scheme_code && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Scheme code</dt>
                  <dd
                    className="font-semibold tabular-nums text-foreground"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
                  >
                    {data.scheme_code}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Category</dt>
                <dd className="font-semibold text-foreground">
                  {[data?.category ?? category, data?.sub_category]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
              {(data?.plan_type || data?.option_type) && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-semibold text-foreground">
                    {[data?.plan_type, data?.option_type].filter(Boolean).join(" · ") || "—"}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </>
      )}
    </div>
  );
}
