import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Search, ShoppingCart } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { searchMfFunds, type MfFundMetadataListItem } from "@/lib/api";
import { formatMoneyInput } from "@/lib/utils";
import { KycBanner, useFpStatus } from "@/components/invest/KycGate";

/**
 * Lumpsum — the third tab of the Invest section (`/invest/lumpsum`). Pick any
 * fund (metadata search) and a one-time amount, then review and place the
 * order on the order-summary page. Gated by the KYC mark until the one-time
 * check passes.
 */
const LumpsumPlanner = () => {
  const navigate = useNavigate();
  const { loading: fpLoading, ready } = useFpStatus();

  const [amount, setAmount] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MfFundMetadataListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MfFundMetadataListItem | null>(null);

  const parsed = Number(amount.replace(/,/g, ""));
  const valid = Number.isFinite(parsed) && parsed > 0 && selected != null;

  // Debounced fund search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      searchMfFunds({ q, active_only: true, limit: 8 })
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [query]);

  const review = () => {
    if (!valid || !selected) return;
    navigate("/order-summary?type=lumpsum", {
      state: {
        scheme_code: selected.isin || selected.scheme_code,
        scheme_name: selected.scheme_name,
        amount: parsed,
      },
    });
  };

  return (
    <div className="mobile-container min-h-screen bg-background pb-24">
      <div className="px-5 pt-2">
        <p className="mb-3 text-[11px] leading-snug text-muted-foreground">
          Invest a one-time amount into any fund. Pick the fund, set the amount,
          and review your order before placing it.
        </p>

        <KycBanner hidden={fpLoading || ready} />

        <div className="mb-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5 text-[hsl(var(--wealth-navy))]" />
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">One-time investment</p>
          </div>

          {/* Amount */}
          <div className="mt-3 flex items-center rounded-xl border border-border bg-background px-3">
            <span className="text-sm font-medium text-muted-foreground">₹</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(formatMoneyInput(e.target.value))}
              placeholder="50,000"
              className="w-full bg-transparent px-2 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Fund picker */}
          {selected ? (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[#D4A868]/40 bg-[#D4A868]/10 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-foreground">{selected.scheme_name}</p>
                <p className="truncate text-[10px] text-muted-foreground">{selected.amc_name}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelected(null); setQuery(""); }}
                className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[10.5px] font-semibold text-foreground transition-colors hover:bg-muted/50"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="mt-3 flex items-center rounded-xl border border-border bg-background px-3">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search a fund (min 3 letters)"
                  className="w-full bg-transparent px-2 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                />
                {searching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
              </div>
              {results.length > 0 && (
                <div className="mt-2 space-y-1">
                  {results.map((f) => (
                    <button
                      key={f.scheme_code}
                      type="button"
                      onClick={() => setSelected(f)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-foreground">{f.scheme_name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{f.amc_name}</p>
                      </div>
                      <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={review}
            disabled={!valid || !ready}
            className="mt-4 flex w-full items-center justify-center rounded-full py-2.5 text-[12.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "hsl(var(--wealth-navy))" }}
          >
            Review order
          </button>
          {!ready && !fpLoading && (
            <p className="mt-2 text-center text-[10px] leading-snug text-muted-foreground">
              Complete KYC above to place orders.
            </p>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default LumpsumPlanner;
