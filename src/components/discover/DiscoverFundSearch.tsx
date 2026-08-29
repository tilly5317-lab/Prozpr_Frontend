import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, ArrowDownRight, Loader2, Search, TrendingUp, X } from "lucide-react";

import { useMfFundsPaged } from "@/hooks/use-mf-funds-paged";
import type { MfFundMetadataListItem } from "@/lib/api";

/** Inline results are a shortlist, not a browser — the full list is one tap away. */
const INLINE_LIMIT = 6;

const fmtPct = (n: number | null | undefined): string =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

/**
 * Fund search that resolves in place on the Portfolio dashboard — type a name,
 * AMC or keyword and the matches appear right under the field, so finding a
 * fund costs no navigation. Tapping a result goes straight to that fund's
 * detail page; "See all" hands the same query to the full list.
 *
 * Deliberately capped at {@link INLINE_LIMIT} rows with no infinite scroll: the
 * dashboard is a long page already, and a search that grows without bound would
 * bury everything under it.
 */
export function DiscoverFundSearch({ cardBorder }: { cardBorder: React.CSSProperties }) {
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const feed = useMfFundsPaged(null);

  // 250ms debounce — same as the full list, fast enough to feel live without
  // firing a request per keystroke.
  useEffect(() => {
    const h = window.setTimeout(() => setQuery(input.trim()), 250);
    return () => window.clearTimeout(h);
  }, [input]);

  useEffect(() => {
    // A cleared box cancels any in-flight request rather than firing a new one.
    feed.reset(query.length === 0 ? null : { q: query });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const open = query.length > 0;
  const rows = feed.items.slice(0, INLINE_LIMIT);
  // Results for the PREVIOUS query stay on screen while the next one loads, so
  // the panel doesn't flash empty on every keystroke.
  const showEmpty = open && !feed.loading && rows.length === 0;

  const openFund = (fund: MfFundMetadataListItem) =>
    navigate(`/discovery/mf/${encodeURIComponent(fund.scheme_code)}`);

  return (
    <div className="mb-2">
      <div
        className="flex items-center gap-2 rounded-[14px] bg-card px-3 py-2.5"
        style={cardBorder}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search funds by name, AMC or keyword…"
          aria-label="Search mutual funds"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {feed.loading && open && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground/60" />
        )}
        {input.length > 0 && (
          <button
            type="button"
            onClick={() => setInput("")}
            aria-label="Clear search"
            className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 overflow-hidden rounded-[14px] bg-card" style={cardBorder}>
              {showEmpty ? (
                <p className="px-3 py-4 text-center text-[11.5px] text-muted-foreground">
                  {feed.error ?? `No funds match “${query}”.`}
                </p>
              ) : (
                <>
                  <div className="divide-y divide-border">
                    {rows.map((fund) => {
                      const r1 = fund.returns_1y_pct;
                      const positive = r1 == null || r1 >= 0;
                      return (
                        <button
                          key={fund.id}
                          type="button"
                          onClick={() => openFund(fund)}
                          className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
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
                            <span className="block truncate text-[12px] font-semibold text-foreground">
                              {fund.scheme_name}
                            </span>
                            <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
                              {fund.amc_name} · {fund.sub_category ?? fund.category}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-0.5">
                            {positive ? (
                              <ArrowUpRight className="h-3 w-3 text-[hsl(var(--wealth-green))]" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 text-destructive" />
                            )}
                            <span
                              className={`text-[11.5px] font-semibold tabular-nums ${
                                positive ? "text-[hsl(var(--wealth-green))]" : "text-destructive"
                              }`}
                            >
                              {fmtPct(r1)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Hand the same query to the full list when there's more than
                      the shortlist shows. */}
                  {feed.total > rows.length && (
                    <button
                      type="button"
                      onClick={() => navigate(`/discovery/mf?q=${encodeURIComponent(query)}`)}
                      className="w-full border-t border-border px-3 py-2.5 text-center text-[11.5px] font-semibold text-foreground transition-colors hover:bg-muted/40"
                    >
                      See all {feed.total} results →
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default DiscoverFundSearch;
