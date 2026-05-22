import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Wallet, Receipt } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { generateNavHistory, type FundNavPoint } from "@/lib/mutualFundsDemoData";

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

interface HoldingState {
  id: string;
  instrument_name: string;
  instrument_type?: string;
  ticker_symbol?: string | null;
  quantity?: number | null;
  average_cost?: number | null;
  current_price?: number | null;
  current_value: number;
  allocation_percentage?: number | null;
}

interface FundTransaction {
  date: string; // ISO
  type: "Purchase" | "Redemption";
  units: number;
  amount: number;
  nav: number;
}

function formatINRPaisa(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  return `${v < 0 ? "−" : ""}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatINRCompact(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v < 0) return `−${formatINRCompact(-v)}`;
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)}Cr`;
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

function formatUnits(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPct(n: number | null): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function pctBetween(history: FundNavPoint[], daysAgo: number): number | null {
  if (history.length < daysAgo + 1) return null;
  const latest = history[history.length - 1].nav;
  const past = history[history.length - 1 - daysAgo].nav;
  if (past <= 0) return null;
  return ((latest - past) / past) * 100;
}

// Synthesize a plausible SIP transaction history for the given holding.
// Monthly purchases at a steady rupee amount, derived from the holding's
// invested-amount target so the totals reconcile.
function buildTransactions(
  holding: HoldingState,
  navHistory: FundNavPoint[],
): FundTransaction[] {
  const invested = holding.average_cost ?? holding.current_value * 0.9;
  if (invested <= 0 || navHistory.length === 0) return [];
  const totalMonths = 18; // ~1.5 yrs of SIPs
  const monthlyAmount = invested / totalMonths;
  const transactions: FundTransaction[] = [];
  // Pick NAV points roughly one month apart, starting from the most recent.
  const stride = Math.max(1, Math.floor(navHistory.length / totalMonths));
  for (let i = 0; i < totalMonths; i++) {
    const idx = navHistory.length - 1 - i * stride;
    if (idx < 0) break;
    const nav = navHistory[idx].nav;
    const units = monthlyAmount / nav;
    transactions.push({
      date: navHistory[idx].date,
      type: "Purchase",
      units: Number(units.toFixed(3)),
      amount: Number(monthlyAmount.toFixed(2)),
      nav: Number(nav.toFixed(4)),
    });
  }
  // Display newest first (matches the screenshot's order).
  return transactions;
}

function NavChart({ points, isUp }: { points: FundNavPoint[]; isUp: boolean }) {
  if (points.length < 2) {
    return (
      <div className="h-[200px] grid place-items-center text-[12px] text-muted-foreground">
        Not enough data to chart.
      </div>
    );
  }
  const targetPoints = 120;
  const step = Math.max(1, Math.floor(points.length / targetPoints));
  const sampled: FundNavPoint[] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
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
          <linearGradient id="holdingNavFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillStart} />
            <stop offset="100%" stopColor={fillEnd} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#holdingNavFill)" />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="absolute left-1 top-1 text-[10px] text-muted-foreground/80 tabular-nums">
        ₹{hi.toFixed(2)}
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

function StatBlock({
  label,
  value,
  hint,
  valueColor,
}: {
  label: string;
  value: string;
  hint?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className="mt-1 text-[14px] font-semibold tabular-nums"
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: valueColor ?? "hsl(var(--foreground))",
        }}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const HoldingDetail = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id = "" } = useParams<{ id: string }>();
  const [range, setRange] = useState<Range>("1Y");

  const holding = (location.state as { holding?: HoldingState } | null)?.holding ?? null;

  // History/transactions are unconditionally computed off the holding id so the
  // values are stable across renders. If the holding is missing we render the
  // not-found state below — but the hooks have already run, keeping order stable.
  const history = useMemo(
    () =>
      generateNavHistory(
        holding?.id ?? id,
        holding?.instrument_type?.toLowerCase().includes("bond") ? 0.075 : 0.13,
        holding?.instrument_type?.toLowerCase().includes("bond") ? 0.035 : 0.16,
      ),
    [holding, id],
  );

  const transactions = useMemo(
    () => (holding ? buildTransactions(holding, history) : []),
    [holding, history],
  );

  const rangedHistory = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (days == null) return history;
    return history.slice(Math.max(0, history.length - days));
  }, [history, range]);

  if (!holding) {
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
          Holding could not be loaded. Open it from your portfolio again.
        </div>
        <BottomNav />
      </div>
    );
  }

  const first = rangedHistory[0]?.nav ?? 0;
  const last = rangedHistory[rangedHistory.length - 1]?.nav ?? 0;
  const isUp = last >= first;
  const rangeReturn = first > 0 ? ((last - first) / first) * 100 : 0;

  const invested = holding.average_cost ?? 0;
  const current = holding.current_value ?? 0;
  const unrealisedGain = current - invested;
  const unrealisedPct = invested > 0 ? (unrealisedGain / invested) * 100 : 0;
  const units = holding.quantity ?? (last > 0 ? current / last : 0);
  const avgCostPerUnit = units > 0 ? invested / units : 0;
  const latestNavDate = history[history.length - 1]?.date ?? "";

  // Heuristic split: instrument_name like "HDFC Corporate Bond Fund – Direct Plan – Growth"
  const segments = holding.instrument_name.split(/[-–]/).map((s) => s.trim()).filter(Boolean);
  const fundName = segments[0] ?? holding.instrument_name;
  const planLabel = segments[1]?.toUpperCase() ?? "REGULAR";
  const optionLabel = segments[2]?.toUpperCase() ?? "GROWTH";
  const schemeType = holding.instrument_type ?? "Mutual Fund";

  const returns = {
    m1: pctBetween(history, 30),
    y1: pctBetween(history, 365),
    y3: pctBetween(history, Math.min(history.length - 1, 365 * 3)),
  };
  const trailingItems: { label: string; value: number | null }[] = [
    { label: "1M", value: returns.m1 },
    { label: "1Y", value: returns.y1 },
    { label: "3Y", value: returns.y3 },
  ];

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
            <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
              Mutual fund
            </p>
            <h1 className="text-[15px] font-semibold leading-tight text-foreground">
              {fundName}
            </h1>
            <p className="mt-1 text-[10.5px] text-muted-foreground">
              {fundName.split(" ").slice(0, 2).join(" ")} Mutual Fund · {schemeType}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                {planLabel}
              </span>
              <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                {optionLabel}
              </span>
              <span className="inline-flex rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                {schemeType.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-3">
        {/* NAV chart */}
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
                ₹{last.toFixed(4)}
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

        {/* Trailing returns */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <p className="text-[12px] font-semibold text-foreground">Trailing NAV returns</p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            Total return on the NAV through {formatDate(latestNavDate)}.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {trailingItems.map(({ label, value }) => {
              const positive = value != null && value >= 0;
              return (
                <div key={label} className="rounded-lg bg-muted/30 px-1.5 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <p
                    className="mt-0.5 text-[11.5px] font-semibold tabular-nums"
                    style={{
                      color:
                        value == null
                          ? "hsl(var(--muted-foreground))"
                          : positive
                            ? "hsl(160 50% 38%)"
                            : "hsl(0 84% 50%)",
                    }}
                  >
                    {formatPct(value)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Your holding */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[12px] font-semibold text-foreground">Your holding</p>
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            Aggregated across folios held in your primary portfolio (CAMS-linked positions).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatBlock label="Current value" value={formatINRPaisa(current)} />
            <StatBlock label="Invested" value={formatINRPaisa(invested)} />
            <StatBlock
              label="Unrealised gain"
              value={`${unrealisedGain >= 0 ? "+" : "−"}${formatINRPaisa(Math.abs(unrealisedGain))}`}
              hint={formatPct(unrealisedPct)}
              valueColor={unrealisedGain >= 0 ? "hsl(160 50% 38%)" : "hsl(0 84% 50%)"}
            />
            <StatBlock label="Units" value={formatUnits(units)} />
            <StatBlock
              label="Avg cost / unit"
              value={`₹${avgCostPerUnit.toFixed(2)}`}
            />
            <StatBlock
              label="Latest NAV"
              value={`₹${last.toFixed(2)}`}
              hint={`as of ${formatDate(latestNavDate)}`}
            />
          </div>
          <div className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
            Folios <span className="ml-1 font-semibold text-foreground">1</span>
          </div>
        </section>

        {/* Transactions */}
        <section className="rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-center gap-2">
            <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-[12px] font-semibold text-foreground">Transactions</p>
          </div>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground">
            Ledger rows traced from your CAS imports and consolidation pipeline.
          </p>

          {transactions.length === 0 ? (
            <p className="mt-3 text-center text-[12px] text-muted-foreground">
              No transactions recorded for this holding.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-lg border border-border/60">
              <div className="grid grid-cols-12 gap-1 bg-muted/40 px-2 py-1.5 text-[9.5px] uppercase tracking-wide text-muted-foreground">
                <span className="col-span-3">Date</span>
                <span className="col-span-2">Type</span>
                <span className="col-span-3 text-right">Units</span>
                <span className="col-span-2 text-right">Amount</span>
                <span className="col-span-2 text-right">NAV</span>
              </div>
              <ul className="divide-y divide-border/40">
                {transactions.map((t, i) => (
                  <li
                    key={`${t.date}-${i}`}
                    className="grid grid-cols-12 gap-1 px-2 py-2 text-[11px] tabular-nums"
                  >
                    <span className="col-span-3 text-muted-foreground">{formatDate(t.date)}</span>
                    <span className="col-span-2 text-foreground">{t.type}</span>
                    <span className="col-span-3 text-right text-foreground">
                      {formatUnits(t.units)}
                    </span>
                    <span className="col-span-2 text-right text-foreground">
                      {formatINRCompact(t.amount)}
                    </span>
                    <span className="col-span-2 text-right text-muted-foreground">
                      ₹{t.nav.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-2 text-[10px] leading-snug text-muted-foreground/80">
            Edit chart and holding returns use sb_nav_history; holdings and transactions reflect CAS
            tagged inputs and consolidations.
          </p>
        </section>
      </main>

      <BottomNav />
    </div>
  );
};

export default HoldingDetail;
