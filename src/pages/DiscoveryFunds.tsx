import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MoreHorizontal, Search, TrendingUp } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { getAllFunds, searchFunds, type MutualFund } from "@/lib/mutualFundsDemoData";

const PAGE_SIZE = 50;

function FundRow({ fund, onOpen }: { fund: MutualFund; onOpen: () => void }) {
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
          {fund.name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {fund.amc} · {fund.category}
        </span>
      </span>
      <span
        className="shrink-0 text-muted-foreground/60"
        aria-hidden="true"
      >
        <MoreHorizontal className="h-4 w-4" />
      </span>
    </button>
  );
}

const DiscoveryFunds = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const allFunds = useMemo(() => getAllFunds(), []);
  const totalCount = allFunds.length;

  const results = useMemo(() => searchFunds(query), [query]);
  const visible = results.slice(0, visibleCount);

  return (
    <div className="mobile-container min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background">
        <div className="flex items-center gap-2 px-4 pt-10 pb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold leading-tight text-foreground">
              All mutual funds
            </h1>
            <p className="text-[11px] text-muted-foreground">
              {totalCount.toLocaleString("en-IN")} schemes
            </p>
          </div>
        </div>
        <div className="px-4 pb-3">
          <label
            htmlFor="fund-search"
            className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/30 px-3 py-2"
          >
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            <input
              id="fund-search"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Search name, AMC, code, ISIN..."
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </label>
        </div>
      </header>

      <ul className="divide-y divide-border/40">
        {visible.map((f) => (
          <li key={f.code}>
            <FundRow fund={f} onOpen={() => navigate(`/discovery/funds/${f.code}`)} />
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <div className="px-5 py-10 text-center">
          <p className="text-[13px] text-muted-foreground">
            No schemes match "{query}".
          </p>
        </div>
      )}

      {visibleCount < results.length && (
        <div className="flex justify-center px-5 py-4">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            className="rounded-full border border-border/70 bg-card px-4 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted/40"
          >
            Load more · {results.length - visibleCount} left
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  );
};

export default DiscoveryFunds;
