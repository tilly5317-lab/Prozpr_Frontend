import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Info, Loader2, MoreHorizontal, Search, TrendingUp } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import { useMfFundsPaged } from "@/hooks/use-mf-funds-paged";
import type { MfFundMetadataListItem } from "@/lib/api";

function FundRow({ fund, onOpen }: { fund: MfFundMetadataListItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus-visible:bg-muted/40"
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          border: "1px solid rgba(212, 168, 104, 0.45)",
          backgroundColor: "rgba(212, 168, 104, 0.08)",
          color: "#D4A868",
        }}
      >
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">
          {fund.scheme_name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {fund.amc_name} · {fund.sub_category ?? fund.category}
        </span>
      </span>
      <span className="shrink-0 text-muted-foreground/60" aria-hidden="true">
        <MoreHorizontal className="h-4 w-4" />
      </span>
    </button>
  );
}

/** All MF schemes — upcoming list UI with `/mf/fund-metadata/search` pagination. */
const MfAllFunds = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Optional collection deep-link params set by the Explore hub. They preset a
  // search/sort/title but never block the default "all funds" behaviour.
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const sortMode = searchParams.get("sort"); // "perf" | null
  const collection = searchParams.get("collection"); // "most-bought" | null
  const presetTitle = searchParams.get("title")?.trim() || null;

  const [searchInput, setSearchInput] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const feed = useMfFundsPaged(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // "Highest performing" / "Top rated" tiles sort by 1Y return. This ranks
  // only the funds already loaded — an approximation until the search API
  // supports server-side sorting (see note banner below).
  const displayItems = useMemo(() => {
    if (sortMode !== "perf") return feed.items;
    return [...feed.items].sort(
      (a, b) => (b.returns_1y_pct ?? -Infinity) - (a.returns_1y_pct ?? -Infinity),
    );
  }, [feed.items, sortMode]);

  const heading =
    presetTitle ??
    (collection === "most-bought"
      ? "Most bought"
      : sortMode === "perf"
        ? "Highest performing"
        : "All mutual funds");

  const approxNote =
    collection === "most-bought"
      ? "Popularity-based ranking is coming soon — showing all funds for now."
      : sortMode === "perf"
        ? "Ranked by 1Y return across loaded funds. Scroll to load more for a wider ranking."
        : null;

  useEffect(() => {
    const h = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 250);
    return () => window.clearTimeout(h);
  }, [searchInput]);

  useEffect(() => {
    if (debouncedQuery.length === 0) {
      feed.reset({});
      return;
    }
    feed.reset({ q: debouncedQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !feed.hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) feed.loadMore();
      },
      { rootMargin: "200px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.loadMore, feed.items.length]);

  const onSelect = (fund: MfFundMetadataListItem) => {
    navigate(`/discovery/mf/${encodeURIComponent(fund.scheme_code)}`);
  };

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
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold leading-tight text-foreground">{heading}</h1>
            <p className="text-[11px] text-muted-foreground">
              {feed.loading && feed.items.length === 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </span>
              ) : (
                <>
                  {feed.total.toLocaleString("en-IN")} schemes
                  {debouncedQuery ? ` matching “${debouncedQuery}”` : ""}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="px-4 pb-3">
          <label
            htmlFor="mf-fund-search"
            className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            <input
              id="mf-fund-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, AMC, code, ISIN..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </label>
        </div>
      </header>

      {approxNote && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-border/50 bg-secondary/40 px-3 py-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{approxNote}</p>
        </div>
      )}

      {feed.error && feed.items.length === 0 && (
        <p className="px-5 py-6 text-center text-[13px] text-destructive">{feed.error}</p>
      )}

      {feed.loading && feed.items.length === 0 && !feed.error && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <ul className="divide-y divide-border/40">
        {displayItems.map((f) => (
          <li key={f.id}>
            <FundRow fund={f} onOpen={() => onSelect(f)} />
          </li>
        ))}
      </ul>

      {!feed.loading && feed.items.length === 0 && !feed.error && (
        <div className="px-5 py-10 text-center">
          <p className="text-[13px] text-muted-foreground">
            {debouncedQuery ? `No schemes match “${debouncedQuery}”.` : "No funds available right now."}
          </p>
        </div>
      )}

      <div ref={sentinelRef} className="h-4" aria-hidden="true" />
      {feed.loadingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default MfAllFunds;
