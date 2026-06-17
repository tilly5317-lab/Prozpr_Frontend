import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Star } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import {
  filterNavByRange,
  formatNav,
  formatPct,
  NavChart,
  pctReturnForRange,
  ProzprRatingCard,
  RangePills,
  type FundNavPoint,
  type NavRange,
} from "@/components/fund/FundScreenUi";
import { getTradeById, type Trade } from "@/lib/rebalanceTrades";

const NAV_UP_COLOR = "hsl(164 54% 40%)";
const NAV_DOWN_COLOR = "hsl(0 84% 50%)";

const riskBadgeClass = (r: Trade["fund"]["risk"]): string =>
  r === "Low"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
    : r === "High"
      ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseAmount(s: string): number | null {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Synthesize a weekly NAV history from cumulative 1Y/3Y/5Y returns so the
 * Discover-style NAV chart + range pills render realistically from the mock
 * trade data (which only carries summary returns, not a daily NAV series).
 */
function buildNavHistory(
  currentNav: number,
  cumPct: { y1: number; y3: number; y5: number },
): FundNavPoint[] {
  const anchors = [
    { weeksAgo: 260, nav: currentNav / (1 + cumPct.y5 / 100) },
    { weeksAgo: 156, nav: currentNav / (1 + cumPct.y3 / 100) },
    { weeksAgo: 52, nav: currentNav / (1 + cumPct.y1 / 100) },
    { weeksAgo: 0, nav: currentNav },
  ].sort((a, b) => b.weeksAgo - a.weeksAgo);

  const today = new Date();
  const dayMs = 86_400_000;
  const out: FundNavPoint[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const span = a.weeksAgo - b.weeksAgo;
    for (let k = 0; k < span; k++) {
      const t = k / span;
      const nav = a.nav * Math.pow(b.nav / a.nav, t);
      const weeksAgo = a.weeksAgo - k;
      const wob = 1 + Math.sin(weeksAgo * 0.7) * 0.01 + Math.cos(weeksAgo * 1.9) * 0.006;
      const d = new Date(today.getTime() - weeksAgo * 7 * dayMs);
      out.push({ date: isoDate(d), nav: Math.round(nav * wob * 10000) / 10000 });
    }
  }
  out.push({ date: isoDate(today), nav: currentNav });
  return out;
}

/** Full-page trade detail — Discover fund-detail UX + the rebalance rationale. */
export default function RebalanceTradeDetail() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const navigate = useNavigate();
  const trade = tradeId ? getTradeById(tradeId) : undefined;
  const [range, setRange] = useState<NavRange>("1Y");

  const nav = useMemo(() => {
    if (!trade) return null;
    const f = trade.fund;
    const base = parseAmount(f.nav) ?? 100;
    const cum = { y1: f.series[1]?.fund ?? 0, y3: f.series[2]?.fund ?? 0, y5: f.series[3]?.fund ?? 0 };
    const benchCum = {
      y1: f.series[1]?.benchmark ?? 0,
      y3: f.series[2]?.benchmark ?? 0,
      y5: f.series[3]?.benchmark ?? 0,
    };
    return { base, cum, fundHist: buildNavHistory(base, cum), benchHist: buildNavHistory(base, benchCum) };
  }, [trade]);

  const ranged = useMemo(() => (nav ? filterNavByRange(nav.fundHist, range) : []), [nav, range]);
  const rangedBench = useMemo(() => (nav ? filterNavByRange(nav.benchHist, range) : []), [nav, range]);

  if (!trade || !nav) {
    return (
      <div className="mobile-container min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background">
          <div className="flex items-center gap-2 px-4 pb-3 pt-10">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-[15px] font-semibold text-foreground">Trade not found</h1>
          </div>
        </header>
        <div className="px-4 pt-6">
          <p className="text-[13px] text-muted-foreground">This proposed trade is no longer available.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => navigate("/rebalance-explanation")}>
            Back to rebalancing
          </Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const f = trade.fund;
  const first = ranged[0]?.nav ?? 0;
  const last = ranged[ranged.length - 1]?.nav ?? nav.base;
  const isUp = last >= first;
  const rangeReturn = first > 0 ? ((last - first) / first) * 100 : 0;
  const trailing = [
    { label: "1M", value: pctReturnForRange(nav.fundHist, "1M") },
    { label: "3M", value: pctReturnForRange(nav.fundHist, "3M") },
    { label: "1Y", value: nav.cum.y1 },
    { label: "3Y", value: nav.cum.y3 },
  ];

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
            <div className="flex items-center gap-1.5">
              {trade.type === "BUY" ? (
                <ArrowDownLeft className="h-3.5 w-3.5" style={{ color: NAV_UP_COLOR }} />
              ) : (
                <ArrowUpRight className="h-3.5 w-3.5" style={{ color: NAV_DOWN_COLOR }} />
              )}
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                style={{
                  backgroundColor:
                    trade.type === "SELL" ? "hsl(0 84% 50% / 0.12)" : "hsl(164 54% 40% / 0.12)",
                  color: trade.type === "SELL" ? NAV_DOWN_COLOR : NAV_UP_COLOR,
                }}
              >
                {trade.type}
              </span>
              <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                trade details
              </span>
            </div>
            <h1 className="mt-0.5 text-[15px] font-semibold leading-tight text-foreground">{f.name}</h1>
          </div>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        <div>
          <p className="text-[11px] text-muted-foreground">
            {f.amc} · {f.category} · {f.benchmark}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskBadgeClass(f.risk)}`}>
              Risk · {f.risk}
            </span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className="h-3 w-3"
                  style={{ color: "#D4A868", fill: n <= f.stars ? "#D4A868" : "transparent" }}
                />
              ))}
            </div>
          </div>
        </div>

        <ProzprRatingCard />

        {/* Why this trade — existing rebalance rationale, kept as-is */}
        <section className="rounded-2xl border border-border/70 bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-foreground">Why this trade</p>
            <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
              {trade.type === "SELL" ? "Sell" : "Buy"} {trade.amount}
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{f.rationale}</p>
          <p className="mt-1.5 text-[11px] text-muted-foreground/70">{trade.subtitle}</p>
        </section>

        {/* NAV chart — Discover fund-detail UX */}
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
              <p className="text-[10px] text-muted-foreground">{range} change</p>
              <p
                className="text-[13px] font-semibold tabular-nums"
                style={{ color: isUp ? NAV_UP_COLOR : NAV_DOWN_COLOR }}
              >
                {formatPct(rangeReturn)}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <NavChart points={ranged} isUp={isUp} benchmarkPoints={rangedBench} />
          </div>
          <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: isUp ? NAV_UP_COLOR : NAV_DOWN_COLOR }} />
              Fund
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-0 w-3.5 border-t border-dashed" style={{ borderColor: "#D4A868" }} />
              {f.benchmark}
            </span>
          </div>
          <RangePills range={range} onRange={setRange} />
        </section>

        {/* Trailing returns */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-[12px] font-semibold text-foreground">Trailing NAV returns</p>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {trailing.map(({ label, value }) => {
              const positive = value != null && value >= 0;
              return (
                <div key={label} className="rounded-lg bg-muted/30 px-1.5 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p
                    className="mt-0.5 text-[11.5px] font-semibold tabular-nums"
                    style={{
                      color: value == null ? "hsl(var(--muted-foreground))" : positive ? NAV_UP_COLOR : NAV_DOWN_COLOR,
                    }}
                  >
                    {formatPct(value)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Fund profile */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-[12px] font-semibold text-foreground">Fund profile</p>
          <dl className="mt-3 space-y-2 text-[12px]">
            {[
              { dt: "AMC", dd: f.amc },
              { dt: "Category", dd: f.category },
              { dt: "Benchmark", dd: f.benchmark },
              { dt: "Expense ratio", dd: f.expenseRatio },
              { dt: "AUM", dd: f.aum },
              { dt: "Latest NAV", dd: f.nav },
            ].map((row) => (
              <div key={row.dt} className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{row.dt}</dt>
                <dd className="font-semibold text-foreground">{row.dd}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
