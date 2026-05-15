import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, Loader2, TrendingUp } from "lucide-react";
import type { MfFundMetadataListItem } from "@/lib/api";

interface MfFundListProps {
  items: MfFundMetadataListItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  total: number;
  emptyText?: string;
  onLoadMore: () => void;
  onSelect: (fund: MfFundMetadataListItem) => void;
  /** Index from the end at which the sentinel is rendered (default 5). */
  sentinelOffsetFromEnd?: number;
}

const fmtPct = (n: number | null | undefined): string => {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};

const riskBadge = (rating: string | null): string => {
  const v = (rating ?? "").toLowerCase();
  if (v.includes("low")) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
  if (v.includes("high") || v.includes("very")) return "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400";
  if (v) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-secondary text-muted-foreground";
};

/**
 * Paginated MF list backed by `/mf/fund-metadata/search`.
 *
 * Infinite scroll math: an `IntersectionObserver` sentinel is rendered
 * `sentinelOffsetFromEnd` rows before the last item. As soon as the sentinel
 * scrolls into the viewport, `onLoadMore()` fires — so the next 20 rows are
 * fetched while several earlier rows are still on screen, eliminating the
 * "blank end" flash users normally see when they hit the bottom.
 */
export function MfFundList({
  items,
  loading,
  loadingMore,
  error,
  hasMore,
  total,
  emptyText = "No funds match your filters.",
  onLoadMore,
  onSelect,
  sentinelOffsetFromEnd = 5,
}: MfFundListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onLoadMore();
            break;
          }
        }
      },
      { rootMargin: "200px 0px 200px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, items.length]);

  const sentinelIndex = Math.max(0, items.length - sentinelOffsetFromEnd);

  if (loading && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="space-y-2 px-1 py-6 text-center">
        <p className="text-xs text-muted-foreground">{emptyText}</p>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((fund, idx) => {
        const r1 = fund.returns_1y_pct;
        const positive = r1 == null || r1 >= 0;
        return (
          <div key={fund.id} className="relative">
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => onSelect(fund)}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-3 text-left transition-all hover:shadow-sm active:scale-[0.99]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <TrendingUp className="h-4 w-4 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground">{fund.scheme_name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-[10px] text-muted-foreground">
                      {fund.amc_name} · {fund.sub_category ?? fund.category}
                    </span>
                    {fund.risk_rating_sebi && (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${riskBadge(fund.risk_rating_sebi)}`}>
                        {fund.risk_rating_sebi}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="ml-2 flex shrink-0 items-center gap-1">
                {positive ? (
                  <ArrowUpRight className="h-3 w-3 text-[hsl(var(--wealth-green))]" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs font-semibold ${positive ? "text-[hsl(var(--wealth-green))]" : "text-destructive"}`}>
                  {fmtPct(r1)}
                </span>
              </div>
            </motion.button>
            {hasMore && idx === sentinelIndex && (
              <div ref={sentinelRef} aria-hidden className="pointer-events-none absolute inset-x-0 h-1" />
            )}
          </div>
        );
      })}

      {loadingMore && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <p className="pt-1 text-center text-[10px] text-muted-foreground/70">
          {total} {total === 1 ? "fund" : "funds"} · end of list
        </p>
      )}

      {error && items.length > 0 && (
        <p className="pt-1 text-center text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}

export type { MfFundMetadataListItem } from "@/lib/api";
