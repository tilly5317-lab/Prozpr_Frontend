import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, TrendingUp, TrendingDown, Activity, AlertTriangle, Loader2 } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { getMyPortfolio, type PortfolioDetail } from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

/** One fund/line in the form guide, with its return vs cost basis. */
interface FormItem {
  id: string;
  name: string;
  subtitle: string | null;
  value: number;
  gainPct: number;
}

type TierKey = "in-form" | "on-track" | "off-track" | "out-of-form";

interface TierDef {
  key: TierKey;
  label: string;
  blurb: string;
  /** Inline styles keep this independent of the Tailwind theme tokens. */
  ring: string;
  bg: string;
  accent: string;
  Icon: typeof TrendingUp;
}

// Green → amber → red ladder, mirroring the "form guide" reference.
const TIERS: TierDef[] = [
  { key: "in-form", label: "In-form", blurb: "Performing great — keep compounding", ring: "#0f8a5f", bg: "rgba(15,138,95,0.08)", accent: "#0f8a5f", Icon: TrendingUp },
  { key: "on-track", label: "On-track", blurb: "Performing well — stay invested", ring: "#3B8F6E", bg: "rgba(59,143,110,0.07)", accent: "#3B8F6E", Icon: Activity },
  { key: "off-track", label: "Off-track", blurb: "Lagging — watch closely before adding more", ring: "#C8902F", bg: "rgba(200,144,47,0.09)", accent: "#B07E22", Icon: TrendingDown },
  { key: "out-of-form", label: "Out-of-form", blurb: "Consider trimming or exiting on the next rebalance", ring: "#C24C3A", bg: "rgba(194,76,58,0.09)", accent: "#C24C3A", Icon: AlertTriangle },
];

function classify(gainPct: number): TierKey {
  if (gainPct >= 15) return "in-form";
  if (gainPct >= 5) return "on-track";
  if (gainPct >= -10) return "off-track";
  return "out-of-form";
}

/* ── Portfolio health score ─────────────────────────────────────────────
   Transparent 0–100 composite of three checks:
   - Performance (50%): value-weighted tier quality (in-form 100 … out-of-form 10)
   - Concentration (25%): penalises a single position dominating the portfolio
   - Diversification (25%): rewards holding a reasonable number of funds       */

const TIER_QUALITY: Record<TierKey, number> = {
  "in-form": 100,
  "on-track": 75,
  "off-track": 40,
  "out-of-form": 10,
};

interface HealthComponent {
  label: string;
  score: number; // 0–100
  note: string;
}

interface HealthScore {
  score: number; // 0–100
  band: { label: string; color: string };
  components: HealthComponent[];
}

function healthBand(score: number): { label: string; color: string } {
  if (score >= 75) return { label: "Strong", color: "#0f8a5f" };
  if (score >= 55) return { label: "Good", color: "#3B8F6E" };
  if (score >= 35) return { label: "Needs work", color: "#B07E22" };
  return { label: "At risk", color: "#C24C3A" };
}

function computeHealth(items: FormItem[]): HealthScore | null {
  const total = items.reduce((s, it) => s + it.value, 0);
  if (items.length === 0 || total <= 0) return null;

  // Performance — value-weighted average of tier quality.
  const perf = Math.round(
    items.reduce((s, it) => s + TIER_QUALITY[classify(it.gainPct)] * it.value, 0) / total,
  );

  // Concentration — full marks while the largest position ≤ 20%, zero at ≥ 60%.
  const maxW = Math.max(...items.map((it) => it.value / total)) * 100;
  const conc = Math.round(Math.min(100, Math.max(0, ((60 - maxW) / 40) * 100)));

  // Diversification — full marks at 8+ funds.
  const div = Math.round(Math.min(100, (items.length / 8) * 100));

  const score = Math.round(perf * 0.5 + conc * 0.25 + div * 0.25);
  return {
    score,
    band: healthBand(score),
    components: [
      { label: "Performance", score: perf, note: "Value-weighted form of your funds" },
      { label: "Concentration", score: conc, note: `Largest position is ${maxW.toFixed(0)}% of portfolio` },
      { label: "Diversification", score: div, note: `${items.length} fund${items.length === 1 ? "" : "s"} held` },
    ],
  };
}

/** Total invested (cost basis): per-unit avg × qty, else avg treated as aggregate. */
function costBasis(quantity: number | null, averageCost: number | null): number | null {
  if (averageCost == null || averageCost <= 0) return null;
  if (quantity != null && quantity > 0) return quantity * averageCost;
  if (quantity == null) return averageCost;
  return null;
}

function plainName(raw: string): string {
  return raw
    .replace(/\s*·\s*Folio.*$/i, "")
    .replace(/\s*[-–]\s*(Direct|Regular)\s+Plan\b.*$/i, "")
    .replace(/\s+Growth(?:\s+Option)?$/i, "")
    .trim() || raw;
}

const DEMO_ITEMS: FormItem[] = [
  { id: "d1", name: "Parag Parikh Flexi Cap", subtitle: "Flexi Cap", value: 480000, gainPct: 21.4 },
  { id: "d2", name: "ICICI Pru Nifty 50 ETF", subtitle: "Large Cap", value: 360000, gainPct: 12.8 },
  { id: "d3", name: "SBI Gold ETF", subtitle: "Gold", value: 160000, gainPct: 6.2 },
  { id: "d4", name: "HDFC Corporate Bond", subtitle: "Corporate Bond", value: 280000, gainPct: 1.9 },
  { id: "d5", name: "Quant Small Cap", subtitle: "Small Cap", value: 140000, gainPct: -13.6 },
];

/** Build the form-guide items, preferring fund-level returns, then asset-class roll-ups. */
function buildItems(portfolio: PortfolioDetail | null): { items: FormItem[]; isDemo: boolean } {
  if (!portfolio || portfolio.total_value <= 0) return { items: DEMO_ITEMS, isDemo: true };

  // 1) Fund-level: only holdings whose return we can actually compute.
  const fromHoldings: FormItem[] = [];
  for (const h of portfolio.holdings) {
    const basis = costBasis(h.quantity, h.average_cost);
    if (basis == null || basis <= 0) continue;
    fromHoldings.push({
      id: h.id,
      name: plainName(h.instrument_name),
      subtitle: h.sub_category ?? h.asset_class ?? null,
      value: h.current_value,
      gainPct: ((h.current_value - basis) / basis) * 100,
    });
  }
  if (fromHoldings.length > 0) return { items: fromHoldings, isDemo: false };

  // 2) Fall back to asset-class roll-ups carrying a performance figure.
  const fromAllocations: FormItem[] = portfolio.allocations
    .filter((a) => a.performance_percentage != null && Number.isFinite(a.performance_percentage))
    .map((a) => ({
      id: a.id,
      name: a.asset_class,
      subtitle: "Asset class",
      value: a.amount,
      gainPct: a.performance_percentage as number,
    }));
  if (fromAllocations.length > 0) return { items: fromAllocations, isDemo: false };

  return { items: DEMO_ITEMS, isDemo: true };
}

const Invest = () => {
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<PortfolioDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMyPortfolio()
      .then((p) => !cancelled && setPortfolio(p))
      .catch(() => { /* fall back to demo items */ })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const { items, isDemo } = useMemo(() => buildItems(portfolio), [portfolio]);

  const grouped = useMemo(() => {
    const map: Record<TierKey, FormItem[]> = { "in-form": [], "on-track": [], "off-track": [], "out-of-form": [] };
    for (const it of items) map[classify(it.gainPct)].push(it);
    for (const k of Object.keys(map) as TierKey[]) map[k].sort((a, b) => b.gainPct - a.gainPct);
    return map;
  }, [items]);

  const doingWell = grouped["in-form"].length + grouped["on-track"].length;
  const needsAttention = grouped["off-track"].length + grouped["out-of-form"].length;
  const health = useMemo(() => computeHealth(items), [items]);

  return (
    <div className="mobile-container bg-background min-h-screen pb-24">
      <div className="px-5 pt-10 pb-2">
        <h1 className="text-lg font-semibold text-foreground">Invest</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          See what's in-form and what needs trimming before you rebalance.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 pt-24 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Reading your portfolio…</span>
        </div>
      ) : (
        <div className="px-5 pt-2">
          {/* Portfolio health — overall 0–100 rating with its three components */}
          {health && (
            <div className="mb-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-4">
                {/* Score ring */}
                <div className="relative h-20 w-20 shrink-0">
                  <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke={health.band.color}
                      strokeWidth="7"
                      strokeLinecap="round"
                      strokeDasharray={`${(health.score / 100) * 2 * Math.PI * 34} ${2 * Math.PI * 34}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xl font-bold leading-none text-foreground">{health.score}</span>
                    <span className="text-[9px] text-muted-foreground">/ 100</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Portfolio health</p>
                  <p className="text-base font-bold" style={{ color: health.band.color }}>
                    {health.band.label}
                  </p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">
                    Blends fund form, concentration and diversification. Indicative, not advice.
                  </p>
                </div>
              </div>

              {/* Component bars */}
              <div className="mt-3 space-y-2">
                {health.components.map((c) => (
                  <div key={c.label}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] font-medium text-foreground">{c.label}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{c.score}/100</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.score}%`, backgroundColor: healthBand(c.score).color }}
                      />
                    </div>
                    <p className="mt-0.5 text-[9.5px] text-muted-foreground/80">{c.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Snapshot strip */}
          <div className="flex gap-2.5">
            <div className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Doing well</p>
              <p className="text-lg font-bold" style={{ color: "#0f8a5f" }}>{doingWell}</p>
            </div>
            <div className="flex-1 rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Needs attention</p>
              <p className="text-lg font-bold" style={{ color: "#C24C3A" }}>{needsAttention}</p>
            </div>
          </div>

          {isDemo && (
            <p className="mt-2 text-[10px] text-muted-foreground">
              Sample funds — add holdings or import a statement to see your own form guide.
            </p>
          )}

          {/* Tiered form guide */}
          <div className="mt-4 space-y-2.5">
            {TIERS.map((tier) => {
              const rows = grouped[tier.key];
              if (rows.length === 0) return null;
              return (
                <div
                  key={tier.key}
                  className="rounded-2xl border p-3.5"
                  style={{ borderColor: `${tier.ring}55`, backgroundColor: tier.bg }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${tier.accent}1f`, color: tier.accent }}
                    >
                      <tier.Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-foreground">{tier.label}</p>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: `${tier.accent}1f`, color: tier.accent }}
                        >
                          {rows.length}
                        </span>
                      </div>
                      <p className="text-[10.5px] leading-tight text-muted-foreground">{tier.blurb}</p>
                    </div>
                  </div>

                  <div className="mt-2.5 space-y-1.5">
                    {rows.map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-card/70 px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-foreground">{row.name}</p>
                          {row.subtitle && (
                            <p className="truncate text-[10px] text-muted-foreground">{row.subtitle}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className="text-[12px] font-semibold tabular-nums"
                            style={{ color: row.gainPct >= 0 ? "#0f8a5f" : "#C24C3A" }}
                          >
                            {row.gainPct >= 0 ? "+" : ""}{row.gainPct.toFixed(1)}%
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {formatInrCompact(row.value)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action — route trimming / rebalancing into the existing plan flow */}
          <button
            onClick={() => navigate("/rebalance-explanation")}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
          >
            {needsAttention > 0 ? "Review & rebalance" : "Review & Execute"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default Invest;
