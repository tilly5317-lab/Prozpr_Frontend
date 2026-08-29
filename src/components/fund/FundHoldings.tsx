import { useMemo, useState } from "react";

import { Seg } from "@/components/fund/FundAnalysisUi";
import { CREDIT_TIERS, type CategoryProfile, type FundProfile, topHoldings } from "@/lib/fundCategory";

/** Asset-class colours, matching the allocation bar used on the dashboard. */
const EQUITY = "hsl(217 91% 58%)";
const DEBT = "hsl(268 60% 62%)";
const OTHERS = "hsl(38 74% 52%)";
/** The category comparison bar sits behind the fund's own. */
const CAT_BAR = "hsl(var(--muted-foreground) / 0.35)";

const HOLDINGS_PREVIEW = 8;

/**
 * One allocation line: the fund's bar over the category's, value on the right.
 *
 * Both bars share a scale so the two are directly comparable; the category bar
 * is greyed and thinner so it reads as the backdrop, not a second claim.
 */
function AllocBar({
  label,
  value,
  catValue,
  max,
}: {
  label: string;
  value: number;
  catValue?: number;
  max: number;
}) {
  const w = (v: number) => `${Math.max(0.5, (v / max) * 100)}%`;
  return (
    <div className="grid grid-cols-[96px_1fr_38px] items-center gap-2 border-t border-border/50 py-2">
      <span className="text-[11px] leading-tight text-muted-foreground">{label}</span>
      <div className="grid gap-[3px]">
        <div className="h-[7px] overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full" style={{ width: w(value), backgroundColor: EQUITY }} />
        </div>
        {catValue != null && (
          <div className="h-[5px] overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full rounded-full"
              style={{ width: w(catValue), backgroundColor: CAT_BAR }}
            />
          </div>
        )}
      </div>
      <span className="text-right text-[11.5px] font-semibold tabular-nums text-foreground">
        {value.toFixed(1)}
      </span>
    </div>
  );
}

/**
 * What the fund holds — the asset mix, then company size, sectors and the names
 * themselves.
 *
 * ⚠️ The equity/debt/others split and the cap mix come from scheme metadata and
 * are REAL. Sector weights, credit quality and every individual holding are
 * GENERATED — Prozpr has no holdings feed. See `lib/fundCategory.ts`.
 */
export function FundHoldings({
  seed,
  fund,
  cat,
  equityPct,
  debtPct,
  othersPct,
}: {
  seed: string;
  fund: FundProfile;
  cat: CategoryProfile;
  equityPct: number;
  debtPct: number;
  othersPct: number;
}) {
  const [tab, setTab] = useState("Equity");
  const [showAll, setShowAll] = useState(false);

  const holdings = useMemo(() => topHoldings(seed), [seed]);
  const shown = showAll ? holdings : holdings.slice(0, HOLDINGS_PREVIEW);
  const topWeight = holdings.reduce((s, h) => s + h.weight, 0);
  const maxHolding = holdings[0]?.weight ?? 1;

  const mix = [
    { label: "Equity", pct: equityPct, color: EQUITY },
    { label: "Debt", pct: debtPct, color: DEBT },
    { label: "Others", pct: othersPct, color: OTHERS },
  ].filter((m) => m.pct > 0);

  const sectorMax = Math.max(
    ...Object.keys(cat.sectors).map((s) => Math.max(fund.sectors[s] ?? 0, cat.sectors[s])),
    1,
  );

  return (
    <div>
      {/* Asset mix — the one-line answer to "what is this fund made of". */}
      <p className="text-[11.5px] font-semibold text-foreground">Indian asset allocation</p>
      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-muted">
        {mix.map((m) => (
          <span key={m.label} style={{ width: `${m.pct}%`, backgroundColor: m.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {mix.map((m) => (
          <span
            key={m.label}
            className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: m.color }} />
            {m.label} {m.pct.toFixed(1)}%
          </span>
        ))}
      </div>

      <div className="mt-3">
        <Seg options={["Equity", "Debt", "Others"]} value={tab} onChange={setTab} />
      </div>

      {tab === "Equity" && (
        <>
          <p className="mt-4 text-[11.5px] font-semibold text-foreground">Market cap</p>
          <p className="mb-1 text-[10px] text-muted-foreground">
            % of portfolio, Indian market definition · grey bar is the {cat.name} average
          </p>
          {(
            [
              ["Large cap", fund.mcap.large, cat.mcap.large],
              ["Mid cap", fund.mcap.mid, cat.mcap.mid],
              ["Small cap", fund.mcap.small, cat.mcap.small],
            ] as [string, number, number][]
          ).map(([label, v, c]) => (
            <AllocBar key={label} label={label} value={v} catValue={c} max={100} />
          ))}

          <p className="mt-4 text-[11.5px] font-semibold text-foreground">Sector allocation</p>
          <p className="mb-1 text-[10px] text-muted-foreground">Equity sectors, net % of equity</p>
          {Object.keys(cat.sectors).map((s) => (
            <AllocBar
              key={s}
              label={s}
              value={fund.sectors[s] ?? 0}
              catValue={cat.sectors[s]}
              max={sectorMax}
            />
          ))}

          <p className="mt-4 text-[11.5px] font-semibold text-foreground">
            Top {holdings.length} holdings
          </p>
          <p className="mb-2 text-[10px] text-muted-foreground">
            {topWeight.toFixed(1)}% of the portfolio sits in these {holdings.length} names
          </p>
          <div className="overflow-hidden rounded-xl border border-border/60">
            {shown.map((h) => (
              <div
                key={h.name}
                className="flex items-center gap-2 border-t border-border/50 px-2.5 py-2 first:border-t-0"
              >
                <span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                  {h.rank}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">
                  {h.name}
                </span>
                <span className="hidden max-w-[92px] shrink-0 truncate text-[10px] text-muted-foreground/70 sm:block">
                  {h.sector}
                </span>
                <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(h.weight / maxHolding) * 100}%`, backgroundColor: EQUITY }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-foreground">
                  {h.weight.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          {holdings.length > HOLDINGS_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 w-full rounded-xl border border-border bg-card py-2.5 text-[12px] font-semibold text-primary transition-colors hover:bg-muted/50"
            >
              {showAll ? "Show fewer holdings" : `Show all ${holdings.length} holdings`}
            </button>
          )}
        </>
      )}

      {tab === "Debt" && (
        <>
          <p className="mt-4 text-[11.5px] font-semibold text-foreground">Credit quality</p>
          <p className="mb-1 text-[10px] text-muted-foreground">
            % of debt holdings · AAA is the safest rating
          </p>
          {CREDIT_TIERS.map((t) => (
            <AllocBar
              key={t}
              label={t}
              value={fund.debt[t] ?? 0}
              catValue={cat.debt[t]}
              max={100}
            />
          ))}
          <p className="mt-2.5 text-[10.5px] leading-snug text-muted-foreground/80">
            Lower-rated bonds pay more but are likelier to default. A fund reaching for yield here is
            taking risk you may not see in its returns until something breaks.
          </p>
        </>
      )}

      {tab === "Others" && (
        <>
          <p className="mt-4 text-[11.5px] font-semibold text-foreground">Everything else</p>
          <p className="mb-1 text-[10px] text-muted-foreground">% of the portfolio</p>
          {["Cash", "Derivatives", "REITs"].map((o) => (
            <AllocBar key={o} label={o} value={fund.others[o] ?? 0} max={6} />
          ))}
          <p className="mt-2.5 text-[10.5px] leading-snug text-muted-foreground/80">
            A large cash pile means the manager is waiting for better prices — it cushions falls but
            drags on returns when markets rise.
          </p>
        </>
      )}
    </div>
  );
}

export default FundHoldings;
