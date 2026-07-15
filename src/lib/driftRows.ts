/**
 * Asset-class drift rows for the "Current vs target" chart — shared by the
 * rebalancing page and the SIP tab so both read the same data shape.
 *
 * Buckets group the engine's asset_subgroups into three asset classes
 * (Equity / Debt / Others). The asset_class is computed by the backend
 * (scheme_classification.asset_class_for_subgroup) and shipped on each
 * subgroup_summary / breakdown row, so there is no client-side classification.
 */
import type {
  PortfolioDetail,
  RebalancingAssetClassBreakdown,
  RebalancingSubgroupSummary,
} from "@/lib/api";

export type Bucket = "equity" | "debt" | "others";

export const BUCKET_ORDER: Bucket[] = ["equity", "debt", "others"];
export const BUCKET_META: Record<Bucket, { label: string; color: string }> = {
  equity: { label: "Equity", color: "#2563EB" },
  debt: { label: "Debt", color: "hsl(188 52% 41%)" },
  others: { label: "Others", color: "hsl(38 64% 47%)" },
};

// Normalize the backend's canonical asset_class ("Equity" / "Debt" / "Others")
// to our internal lowercase Bucket key. Unknown / null → "others".
export function toBucket(assetClass: string | null | undefined): Bucket {
  const v = (assetClass ?? "").toLowerCase();
  if (v === "equity" || v === "debt" || v === "others") return v;
  return "others";
}

export type DriftRow = {
  key: Bucket;
  label: string;
  color: string;
  current: number; // %
  target: number; // %
  currentInr: number; // ₹ held today
  targetInr: number; // ₹ the plan targets
  amountText: string;
};

function compactINR(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "+";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${sign}₹${Math.round(a / 1e3)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/* Shared formatter: turn per-bucket current/target ₹ into rendered DriftRows
   (percentages + overweight/underweight caption). */
function formatDriftRows(agg: Record<Bucket, { current: number; target: number }>): DriftRow[] {
  const totalCur = BUCKET_ORDER.reduce((sum, b) => sum + agg[b].current, 0);
  const totalTgt = BUCKET_ORDER.reduce((sum, b) => sum + agg[b].target, 0);

  return BUCKET_ORDER.filter((b) => agg[b].current > 0 || agg[b].target > 0).map((b) => {
    const currentPct = totalCur > 0 ? (agg[b].current / totalCur) * 100 : 0;
    const targetPct = totalTgt > 0 ? (agg[b].target / totalTgt) * 100 : 0;
    const drift = currentPct - targetPct;
    // Signed by the action the plan takes: overweight → selling, underweight → buying.
    const diffInr = agg[b].target - agg[b].current;
    const amountText =
      Math.abs(drift) < 0.5
        ? "On target"
        : `${Math.abs(drift).toFixed(0)}% ${drift > 0 ? "overweight" : "underweight"} · ${compactINR(diffInr)}`;
    return {
      key: b,
      label: BUCKET_META[b].label,
      color: BUCKET_META[b].color,
      current: Math.round(currentPct),
      target: Math.round(targetPct),
      currentInr: agg[b].current,
      targetInr: agg[b].target,
      amountText,
    };
  });
}

/* Roll subgroup summaries (+ live holdings for untouched classes) into DriftRows. */
export function buildDriftRows(
  subs: RebalancingSubgroupSummary[],
  holdings: PortfolioDetail["holdings"] = [],
): DriftRow[] {
  if (!subs.length && !holdings.length) return [];
  const agg: Record<Bucket, { current: number; target: number; inSubs: boolean }> = {
    equity: { current: 0, target: 0, inSubs: false },
    debt: { current: 0, target: 0, inSubs: false },
    others: { current: 0, target: 0, inSubs: false },
  };
  for (const s of subs) {
    const b = toBucket(s.asset_class);
    agg[b].current += s.current_holding_inr || 0;
    // "Target" = where THIS PLAN lands (suggested_final_holding_inr), not the
    // unconstrained goal ideal, so the bars stay consistent with the trades.
    agg[b].target += s.suggested_final_holding_inr || 0;
    agg[b].inSubs = true;
  }
  // Include asset classes the run didn't touch, filled from the live portfolio
  // with target = current so they read "On target".
  const heldByBucket: Record<Bucket, number> = { equity: 0, debt: 0, others: 0 };
  for (const h of holdings) heldByBucket[toBucket(h.asset_class)] += h.current_value || 0;
  for (const b of BUCKET_ORDER) {
    if (!agg[b].inSubs && heldByBucket[b] > 0) {
      agg[b].current = heldByBucket[b];
      agg[b].target = heldByBucket[b];
    }
  }
  return formatDriftRows(agg);
}

/* SIP tab: the recommended monthly allocation split across Equity / Debt /
   Others, from the SIP's own per-fund buys. Asset class comes from the
   rebalancing subgroup→class map (backend classification); the amounts are the
   SIP's. Returns [] when the class map is unavailable so callers hide the chart
   rather than mis-bucket everything as Others. Rows carry only the target
   (current* = 0) — the SIP chart shows a single Target bar. */
export function buildSipTargetRows(
  buys: { asset_subgroup: string; monthly_amount_inr: number }[],
  subgroupSummaries: { asset_subgroup: string; asset_class: string }[] = [],
): DriftRow[] {
  if (!buys.length || !subgroupSummaries.length) return [];
  const classBySubgroup = new Map<string, string>();
  for (const s of subgroupSummaries) classBySubgroup.set(s.asset_subgroup, s.asset_class);
  const agg: Record<Bucket, number> = { equity: 0, debt: 0, others: 0 };
  for (const b of buys) {
    agg[toBucket(classBySubgroup.get(b.asset_subgroup))] += b.monthly_amount_inr || 0;
  }
  const total = BUCKET_ORDER.reduce((sum, b) => sum + agg[b], 0);
  if (total <= 0) return [];
  return BUCKET_ORDER.filter((b) => agg[b] > 0).map((b) => {
    const pct = Math.round((agg[b] / total) * 100);
    return {
      key: b,
      label: BUCKET_META[b].label,
      color: BUCKET_META[b].color,
      current: 0,
      target: pct,
      currentInr: 0,
      targetInr: agg[b],
      amountText: `${pct}% · ${compactINR(agg[b])}/mo`,
    };
  });
}

/* Lump-sum tab: the recommended one-time deployment split across Equity / Debt /
   Others, from the plan's own alignment rows (each already carries the backend
   asset_class, so there is no client-side classification and no rebalancing-run
   fetch needed). Rows carry only the target (current* = 0) — a single Target bar,
   mirroring the SIP tab's Proposed Target. Returns [] when there are no rows so
   callers hide the chart. */
export function buildLumpSumTargetRows(
  alignmentRows: { asset_class: string; deploy_inr: number }[],
): DriftRow[] {
  if (!alignmentRows.length) return [];
  const agg: Record<Bucket, number> = { equity: 0, debt: 0, others: 0 };
  for (const r of alignmentRows) {
    agg[toBucket(r.asset_class)] += r.deploy_inr || 0;
  }
  const total = BUCKET_ORDER.reduce((sum, b) => sum + agg[b], 0);
  if (total <= 0) return [];
  return BUCKET_ORDER.filter((b) => agg[b] > 0).map((b) => {
    const pct = Math.round((agg[b] / total) * 100);
    return {
      key: b,
      label: BUCKET_META[b].label,
      color: BUCKET_META[b].color,
      current: 0,
      target: pct,
      currentInr: 0,
      targetInr: agg[b],
      amountText: `${pct}% · ${compactINR(agg[b])}`,
    };
  });
}

/* Preferred path: render the backend's multi-asset-aware breakdown directly. */
export function driftRowsFromBreakdown(breakdown: RebalancingAssetClassBreakdown): DriftRow[] {
  const agg: Record<Bucket, { current: number; target: number }> = {
    equity: { current: 0, target: 0 },
    debt: { current: 0, target: 0 },
    others: { current: 0, target: 0 },
  };
  for (const row of breakdown.rows) {
    const b = toBucket(row.asset_class);
    agg[b].current += row.current_inr || 0;
    agg[b].target += row.target_inr || 0;
  }
  return formatDriftRows(agg);
}
