import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import {
  getFundByCode,
  getNavHistory,
  type FundNavPoint,
  type FundReturns,
} from "@/lib/mutualFundsDemoData";

type Range = "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "MAX";

const RANGES: Range[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "MAX"];

const RANGE_DAYS: Record<Range, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "2Y": 365 * 2,
  "5Y": 365 * 5,
  MAX: null,
};

const RETURN_KEYS: { label: string; key: keyof FundReturns }[] = [
  { label: "3M", key: "m3" },
  { label: "1Y", key: "y1" },
  { label: "3Y", key: "y3" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatNav(n: number): string {
  return n.toFixed(4);
}

function formatPct(n: number | null): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function NavChart({
  points,
  isUp,
}: {
  points: FundNavPoint[];
  isUp: boolean;
}) {
  if (points.length < 2) {
    return (
      <div className="h-[200px] grid place-items-center text-[12px] text-muted-foreground">
        Not enough data to chart.
      </div>
    );
  }

  // Sample to ~120 points so the path stays smooth on mobile.
  const targetPoints = 120;
  const step = Math.max(1, Math.floor(points.length / targetPoints));
  const sampled: FundNavPoint[] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
  // Always pin the final point so the latest NAV reads correctly.
  if (sampled[sampled.length - 1] !== points[points.length - 1]) {
    sampled.push(points[points.length - 1]);
  }

  const vals = sampled.map((p) => p.nav);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max((max - min) * 0.08, 0.001);
  const lo = min - pad;
  const hi = max + pad;
  const xScale = (i: number) => (i / (sampled.length - 1)) * 100;
  const yScale = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;

  const linePath = sampled
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(2)} ${yScale(p.nav).toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  const stroke = isUp ? "hsl(160 50% 38%)" : "hsl(0 84% 50%)";
  const fillStart = isUp ? "hsl(160 50% 38% / 0.18)" : "hsl(0 84% 50% / 0.18)";
  const fillEnd = isUp ? "hsl(160 50% 38% / 0.02)" : "hsl(0 84% 50% / 0.02)";

  return (
    <div className="relative h-[200px] w-full">
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="navAreaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillStart} />
            <stop offset="100%" stopColor={fillEnd} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#navAreaFill)" />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute left-1 top-1 flex flex-col text-[10px] text-muted-foreground/80 tabular-nums">
        <span>₹{hi.toFixed(2)}</span>
      </div>
      <div className="absolute bottom-1 left-1 text-[10px] text-muted-foreground/80 tabular-nums">
        ₹{lo.toFixed(2)}
      </div>
      <div className="absolute bottom-1 right-1 flex gap-3 text-[10px] text-muted-foreground/80">
        <span>{formatDate(sampled[0].date)}</span>
        <span>{formatDate(sampled[sampled.length - 1].date)}</span>
      </div>
    </div>
  );
}

const DiscoveryFundDetail = () => {
  const navigate = useNavigate();
  const { code = "" } = useParams<{ code: string }>();
  const [range, setRange] = useState<Range>("1Y");

  const fund = getFundByCode(code);

  // History fetched unconditionally so the hook order is stable across the
  // "fund missing" early return below.
  const history = useMemo(() => (fund ? getNavHistory(code) : []), [code, fund]);

  const rangedHistory = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days == null) return history;
    return history.slice(Math.max(0, history.length - days));
  }, [history, range]);

  if (!fund) {
    return (
      <div className="mobile-container min-h-screen bg-background pb-24">
        <header className="px-4 pt-10 pb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        </header>
        <div className="px-5 py-10 text-center text-[13px] text-muted-foreground">
          Scheme {code} could not be found.
        </div>
        <BottomNav />
      </div>
    );
  }

  const first = rangedHistory[0]?.nav ?? 0;
  const last = rangedHistory[rangedHistory.length - 1]?.nav ?? 0;
  const isUp = last >= first;

  const rangeReturn = first > 0 ? ((last - first) / first) * 100 : 0;

  return (
    <div className="mobile-container min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background">
        <div className="flex items-start gap-2 px-4 pt-10 pb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold leading-tight text-foreground">
              {fund.name}
            </h1>
            <p className="mt-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">
              {fund.amc} · {fund.schemeType} · {fund.planType.toUpperCase()} ·{" "}
              {fund.dividendType.toUpperCase()}
            </p>
          </div>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        {/* NAV / unit chart */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                NAV / unit
              </p>
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
                style={{ color: isUp ? "hsl(160 50% 38%)" : "hsl(0 84% 50%)" }}
              >
                {formatPct(rangeReturn)}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <NavChart points={rangedHistory} isUp={isUp} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {RANGES.map((r) => {
              const active = r === range;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1 text-[11.5px] font-semibold tabular-nums transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                  aria-pressed={active}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </section>

        {/* Trailing NAV returns */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-[12px] font-semibold text-foreground">
            Trailing NAV returns
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            Total return on the NAV through {formatDate(history[history.length - 1]?.date ?? "")}.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {RETURN_KEYS.map(({ label, key }) => {
              const v = fund.returns[key];
              const positive = v != null && v >= 0;
              return (
                <div key={label} className="rounded-lg bg-muted/30 px-1.5 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p
                    className="mt-0.5 text-[11.5px] font-semibold tabular-nums"
                    style={{
                      color:
                        v == null
                          ? "hsl(var(--muted-foreground))"
                          : positive
                            ? "hsl(160 50% 38%)"
                            : "hsl(0 84% 50%)",
                    }}
                  >
                    {formatPct(v)}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground/80">
            Trailing returns reflect compounded NAV change over the trailing window —
            useful for comparison but not a forecast of future performance.
          </p>
        </section>

        {/* No transactions */}
        <section
          className="flex items-start gap-2 rounded-2xl px-4 py-3"
          style={{
            backgroundColor: "hsl(var(--muted) / 0.45)",
            border: "1px solid hsl(var(--border) / 0.6)",
          }}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[12px] text-muted-foreground">
            You have no recorded transactions in this scheme.
          </p>
        </section>

        {/* Fund profile */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-[12px] font-semibold text-foreground">Fund profile</p>
          <dl className="mt-3 space-y-2 text-[12px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">ISIN</dt>
              <dd
                className="font-semibold tabular-nums text-foreground"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {fund.isin}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Scheme code</dt>
              <dd
                className="font-semibold tabular-nums text-foreground"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              >
                {fund.code}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="font-semibold text-foreground">
                {fund.schemeType} · {fund.category}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-semibold text-foreground">
                {fund.planType} · {fund.dividendType}
              </dd>
            </div>
          </dl>
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default DiscoveryFundDetail;
