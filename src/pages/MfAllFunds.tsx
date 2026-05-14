import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { MfFundList } from "@/components/discover/MfFundList";
import { useMfFundsPaged } from "@/hooks/use-mf-funds-paged";
import type { MfFundMetadataListItem } from "@/lib/api";

/**
 * Full-screen MF universe browser (replaces the old “Explore all” bottom sheet).
 * Selecting a row opens `/discovery/mf/:fundId` with NAV-based detail.
 */
const MfAllFunds = () => {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const feed = useMfFundsPaged(null);

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

  const onSelect = (fund: MfFundMetadataListItem) => {
    navigate(`/discovery/mf/${fund.id}`);
  };

  return (
    <div className="mobile-container min-h-screen bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom,8px)+12px)]">
      <div className="flex items-center gap-3 px-5 pb-3 pt-12">
        <button
          type="button"
          onClick={() => navigate("/discovery")}
          className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-muted"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="mb-0.5 text-xl font-bold text-foreground">All mutual funds</h1>
          <p className="text-xs text-muted-foreground">
            {feed.loading && feed.items.length === 0 ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading universe…
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

      <div className="mb-4 px-5">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground/50" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, AMC, code, ISIN…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="rounded-full p-1 text-muted-foreground/50 hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="px-5">
        <MfFundList
          items={feed.items}
          loading={feed.loading}
          loadingMore={feed.loadingMore}
          error={feed.error}
          hasMore={feed.hasMore}
          total={feed.total}
          emptyText={debouncedQuery ? `No funds match “${debouncedQuery}”.` : "No funds available right now."}
          onLoadMore={feed.loadMore}
          onSelect={onSelect}
        />
      </div>

      <BottomNav />
    </div>
  );
};

export default MfAllFunds;
