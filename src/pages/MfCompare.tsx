import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Loader2, Plus, Search, Sparkles, Star, X } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import { CompareChart, type CompareSeries } from "@/components/discover/CompareChart";
import {
  filterNavByRange,
  navPointsFromApi,
  RangePills,
  type FundNavPoint,
  type NavRange,
} from "@/components/fund/FundScreenUi";
import {
  getMfHoldingDetail,
  listDiscoveryTrending,
  searchMfFunds,
  type MfFundMetadataListItem,
} from "@/lib/api";

const MAX_FUNDS = 4;

/* Distinct, light/dark-safe colours — one per added fund. */
const FUND_COLORS = [
  "hsl(217 91% 58%)", // blue
  "hsl(160 60% 40%)", // green
  "hsl(35 92% 52%)", // amber
  "hsl(280 65% 60%)", // violet
];

interface CompareFund {
  schemeCode: string;
  color: string;
  isProzprPick: boolean;
  loading: boolean;
  error: string | null;
  name: string;
  amc: string | null;
  category: string | null;
  subCategory: string | null;
  latestNav: number | null;
  navHistory: FundNavPoint[];
  ret6m: number | null;
  retYtd: number | null;
  ret1y: number | null;
  ret3y: number | null;
  ret5y: number | null;
}

type CriterionKey =
  | "ret1y"
  | "ret3y"
  | "ret5y"
  | "ret6m"
  | "retYtd"
  | "category";

interface Criterion {
  key: CriterionKey;
  label: string;
  /** Which direction is "better" for ranking; null = not ranked. */
  better: "high" | "low" | null;
  /** Numeric value used for ranking (range-aware metrics get filtered points). */
  value: (f: CompareFund, ranged: FundNavPoint[]) => number | null;
  /** Display string. */
  render: (f: CompareFund, ranged: FundNavPoint[]) => string;
}

const fmtPctVal = (n: number | null): string =>
  n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const CRITERIA: Criterion[] = [
  { key: "ret1y", label: "1Y return", better: "high", value: (f) => f.ret1y, render: (f) => fmtPctVal(f.ret1y) },
  { key: "ret3y", label: "3Y return", better: "high", value: (f) => f.ret3y, render: (f) => fmtPctVal(f.ret3y) },
  { key: "ret5y", label: "5Y return", better: "high", value: (f) => f.ret5y, render: (f) => fmtPctVal(f.ret5y) },
  { key: "ret6m", label: "6M return", better: "high", value: (f) => f.ret6m, render: (f) => fmtPctVal(f.ret6m) },
  { key: "retYtd", label: "YTD return", better: "high", value: (f) => f.retYtd, render: (f) => fmtPctVal(f.retYtd) },
  {
    key: "category",
    label: "Fund type",
    better: null,
    value: () => null,
    render: (f) => [f.category, f.subCategory].filter(Boolean).join(" · ") || "—",
  },
];

const DEFAULT_CRITERIA: CriterionKey[] = ["ret1y", "ret3y", "ret5y"];

export default function MfCompare() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [funds, setFunds] = useState<CompareFund[]>([]);
  const [range, setRange] = useState<NavRange>("1Y");
  const [selected, setSelected] = useState<Set<CriterionKey>>(new Set(DEFAULT_CRITERIA));
  const [pickerOpen, setPickerOpen] = useState(false);
  const seededRef = useRef(false);

  const nextColor = useCallback(
    (current: CompareFund[]): string =>
      FUND_COLORS.find((c) => !current.some((f) => f.color === c)) ?? FUND_COLORS[0]!,
    [],
  );

  const loadFund = useCallback(
    async (schemeCode: string, meta?: MfFundMetadataListItem, isPick = false) => {
      const code = schemeCode.trim();
      if (!code) return;
      let skip = false;
      setFunds((prev) => {
        if (prev.some((f) => f.schemeCode === code) || prev.length >= MAX_FUNDS) {
          skip = true;
          return prev;
        }
        return [
          ...prev,
          {
            schemeCode: code,
            color: nextColor(prev),
            isProzprPick: isPick,
            loading: true,
            error: null,
            name: meta?.scheme_name ?? code,
            amc: meta?.amc_name ?? null,
            category: meta?.category ?? null,
            subCategory: meta?.sub_category ?? null,
            latestNav: null,
            navHistory: [],
            ret6m: null,
            retYtd: null,
            ret1y: meta?.returns_1y_pct ?? null,
            ret3y: meta?.returns_3y_pct ?? null,
            ret5y: meta?.returns_5y_pct ?? null,
          },
        ];
      });
      if (skip) return;

      try {
        const d = await getMfHoldingDetail(code);
        setFunds((prev) =>
          prev.map((f) =>
            f.schemeCode === code
              ? {
                  ...f,
                  loading: false,
                  name: d.scheme_name ?? f.name,
                  amc: d.amc_name ?? f.amc,
                  category: d.category ?? f.category,
                  subCategory: d.sub_category ?? f.subCategory,
                  latestNav: d.latest_nav,
                  navHistory: navPointsFromApi(d.nav_history),
                  ret6m: d.nav_return_6m_pct,
                  retYtd: d.nav_return_ytd_pct,
                  ret1y: d.nav_return_1y_pct ?? f.ret1y,
                  ret3y: d.nav_return_3y_pct ?? f.ret3y,
                  ret5y: d.nav_return_5y_pct ?? f.ret5y,
                }
              : f,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load fund.";
        setFunds((prev) =>
          prev.map((f) => (f.schemeCode === code ? { ...f, loading: false, error: msg } : f)),
        );
      }
    },
    [nextColor],
  );

  // Preseed from ?codes=152076,118989 (used by the fund detail "Compare" button).
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const codes = (searchParams.get("codes") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, MAX_FUNDS);
    codes.forEach((code) => {
      // Best-effort meta enrichment (risk/category) via search by code.
      searchMfFunds({ q: code, limit: 1 })
        .then((res) => {
          const hit = res.items.find((i) => i.scheme_code === code) ?? res.items[0];
          void loadFund(code, hit);
        })
        .catch(() => void loadFund(code));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeFund = (code: string) =>
    setFunds((prev) => prev.filter((f) => f.schemeCode !== code));

  const toggleCriterion = (key: CriterionKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rangedByCode = useMemo(() => {
    const m = new Map<string, FundNavPoint[]>();
    for (const f of funds) m.set(f.schemeCode, filterNavByRange(f.navHistory, range));
    return m;
  }, [funds, range]);

  const series: CompareSeries[] = useMemo(
    () =>
      funds
        .map((f) => ({
          id: f.schemeCode,
          name: f.name,
          color: f.color,
          points: rangedByCode.get(f.schemeCode) ?? [],
        }))
        .filter((s) => s.points.length >= 2),
    [funds, rangedByCode],
  );

  const activeCriteria = CRITERIA.filter((c) => selected.has(c.key));

  // Best fund per ranked criterion (used for highlight + per-fund "wins" tally).
  const bestByCriterion = useMemo(() => {
    const m = new Map<CriterionKey, Set<string>>();
    for (const c of activeCriteria) {
      if (!c.better) continue;
      let best: number | null = null;
      const vals = funds.map((f) => ({
        code: f.schemeCode,
        v: c.value(f, rangedByCode.get(f.schemeCode) ?? []),
      }));
      for (const { v } of vals) {
        if (v == null) continue;
        if (best == null) best = v;
        else best = c.better === "high" ? Math.max(best, v) : Math.min(best, v);
      }
      if (best == null) continue;
      const winners = new Set(vals.filter((x) => x.v != null && x.v === best).map((x) => x.code));
      m.set(c.key, winners);
    }
    return m;
  }, [activeCriteria, funds, rangedByCode]);

  const winsByFund = useMemo(() => {
    const m = new Map<string, number>();
    for (const winners of bestByCriterion.values())
      for (const code of winners) m.set(code, (m.get(code) ?? 0) + 1);
    return m;
  }, [bestByCriterion]);

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
            <h1 className="text-[17px] font-semibold leading-tight text-foreground">Compare &amp; rank funds</h1>
            <p className="text-[11px] text-muted-foreground">
              Overlay performance and rank up to {MAX_FUNDS} funds side by side
            </p>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 pt-4">
        {/* Added funds + add button */}
        <section>
          <div className="flex flex-wrap gap-2">
            {funds.map((f) => (
              <span
                key={f.schemeCode}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card py-1 pl-2 pr-1 text-[11px]"
                style={{ borderColor: f.color }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                <span className="truncate font-semibold text-foreground" style={{ maxWidth: "9rem" }}>
                  {f.loading ? "Loading…" : f.name}
                </span>
                {f.isProzprPick && <Star className="h-3 w-3 shrink-0 text-[#D4A868]" fill="#D4A868" />}
                <button
                  type="button"
                  onClick={() => removeFund(f.schemeCode)}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {funds.length < MAX_FUNDS && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary/40"
              >
                <Plus className="h-3.5 w-3.5" /> Add fund
              </button>
            )}
          </div>
          {funds.some((f) => f.error) && (
            <p className="mt-2 text-[11px] text-destructive">
              Some funds could not be loaded. Remove and try another.
            </p>
          )}
        </section>

        {funds.length === 0 ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card px-4 py-10 text-center transition-colors hover:bg-secondary/30"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <Plus className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-foreground">Add funds to compare</p>
            <p className="max-w-[15rem] text-[11px] text-muted-foreground">
              Search the MF universe or quick-add Prozpr suggested funds, then compare growth and key
              metrics.
            </p>
          </button>
        ) : (
          <>
            {/* Overlaid growth chart */}
            <section className="rounded-2xl border border-border/70 bg-card p-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-[12px] font-semibold text-foreground">Growth of ₹100</p>
                <p className="text-[10px] text-muted-foreground">Rebased · {range}</p>
              </div>
              <CompareChart series={series} />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {funds.map((f) => (
                  <span key={f.schemeCode} className="inline-flex items-center gap-1.5 text-[10.5px]">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: f.color }} />
                    <span className="max-w-[10rem] truncate text-muted-foreground">{f.name}</span>
                  </span>
                ))}
              </div>
              <RangePills range={range} onRange={setRange} />
            </section>

            {/* Criteria selector */}
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Comparison criteria
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CRITERIA.map((c) => {
                  const on = selected.has(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleCriterion(c.key)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        on
                          ? "bg-foreground text-background"
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      }`}
                      aria-pressed={on}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Side-by-side comparison table */}
            <section className="overflow-hidden rounded-2xl border border-border/70 bg-card">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="sticky left-0 z-10 bg-card px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Metric
                      </th>
                      {funds.map((f) => {
                        const wins = winsByFund.get(f.schemeCode) ?? 0;
                        return (
                          <th
                            key={f.schemeCode}
                            className="min-w-[7.5rem] px-3 py-2.5 align-top"
                            style={{ borderTop: `2px solid ${f.color}` }}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: f.color }} />
                              <span className="truncate text-[11px] font-bold text-foreground">{f.name}</span>
                              {f.isProzprPick && <Star className="h-3 w-3 shrink-0 text-[#D4A868]" fill="#D4A868" />}
                            </div>
                            <p className="mt-0.5 truncate text-[9.5px] text-muted-foreground">{f.amc ?? "—"}</p>
                            {wins > 0 && (
                              <span className="mt-1 inline-block rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                Best on {wins}
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {activeCriteria.map((c) => {
                      const winners = bestByCriterion.get(c.key);
                      return (
                        <tr key={c.key} className="border-b border-border/40 last:border-0">
                          <td className="sticky left-0 z-10 bg-card px-3 py-2.5 text-[11px] font-medium text-muted-foreground">
                            {c.label}
                          </td>
                          {funds.map((f) => {
                            const ranged = rangedByCode.get(f.schemeCode) ?? [];
                            const isWinner = winners?.has(f.schemeCode) ?? false;
                            return (
                              <td key={f.schemeCode} className="px-3 py-2.5">
                                <span
                                  className={`inline-flex items-center gap-1 text-[12px] tabular-nums ${
                                    isWinner ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-foreground"
                                  }`}
                                >
                                  {f.loading ? "…" : c.render(f, ranged)}
                                  {isWinner && <Check className="h-3 w-3" />}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-border/50 px-3 py-2 text-[10px] leading-snug text-muted-foreground/80">
                <Check className="mr-0.5 inline h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                marks the best fund per metric. Returns are trailing figures from fund data. Past
                performance isn&apos;t a forecast.
              </p>
            </section>
          </>
        )}
      </main>

      <FundPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existing={funds.map((f) => f.schemeCode)}
        onAdd={(item) => loadFund(item.scheme_code, item)}
        onAddPick={(code, meta) => loadFund(code, meta, true)}
        full={funds.length >= MAX_FUNDS}
      />

      <BottomNav />
    </div>
  );
}

/* ── Fund picker bottom-sheet ── */
function FundPicker({
  open,
  onClose,
  existing,
  onAdd,
  onAddPick,
  full,
}: {
  open: boolean;
  onClose: () => void;
  existing: string[];
  onAdd: (item: MfFundMetadataListItem) => void;
  onAddPick: (code: string, meta?: MfFundMetadataListItem) => void;
  full: boolean;
}) {
  const [input, setInput] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<MfFundMetadataListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);

  useEffect(() => {
    const h = window.setTimeout(() => setDebounced(input.trim()), 250);
    return () => window.clearTimeout(h);
  }, [input]);

  useEffect(() => {
    if (!open) return;
    if (debounced.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchMfFunds({ q: debounced, limit: 15 })
      .then((res) => !cancelled && setResults(res.items))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  // Prozpr suggested funds — names from the discovery/trending feed.
  useEffect(() => {
    if (!open || picks.length) return;
    listDiscoveryTrending()
      .then((t) => setPicks(t.slice(0, 6).map((f) => f.name)))
      .catch(() => {});
  }, [open, picks.length]);

  const addPick = async (name: string) => {
    setResolving(name);
    try {
      const res = await searchMfFunds({ q: name, limit: 1 });
      const hit = res.items[0];
      if (hit) onAddPick(hit.scheme_code, hit);
    } catch {
      /* ignore — best effort */
    } finally {
      setResolving(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[82vh] w-full max-w-md flex-col rounded-2xl bg-card shadow-xl"
          >
            <div className="px-5 pt-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Add a fund</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-secondary p-1.5 hover:bg-muted"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {full ? (
                <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  You can compare up to {MAX_FUNDS} funds. Remove one to add another.
                </p>
              ) : (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
                  <Search className="h-4 w-4 text-muted-foreground/50" />
                  <input
                    autoFocus
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Search name, AMC, scheme code…"
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/60" />}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
              {!full && debounced.length === 0 && (
                <div className="mb-2">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-[#D4A868]" /> Prozpr suggested
                  </p>
                  <div className="space-y-1.5">
                    {picks.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">Loading suggestions…</p>
                    )}
                    {picks.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => void addPick(name)}
                        disabled={resolving === name}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border/60 bg-background p-3 text-left hover:bg-secondary/40 disabled:opacity-60"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Star className="h-3.5 w-3.5 shrink-0 text-[#D4A868]" fill="#D4A868" />
                          <span className="truncate text-xs font-semibold text-foreground">{name}</span>
                        </span>
                        {resolving === name ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!full &&
                results.map((item) => {
                  const added = existing.includes(item.scheme_code);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={added}
                      onClick={() => {
                        onAdd(item);
                        onClose();
                      }}
                      className="flex w-full items-center justify-between gap-2 border-b border-border/40 py-2.5 text-left last:border-0 disabled:opacity-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-foreground">
                          {item.scheme_name}
                        </span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {item.amc_name} · {item.sub_category ?? item.category}
                        </span>
                      </span>
                      {added ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}

              {!full && debounced.length > 0 && !loading && results.length === 0 && (
                <p className="py-6 text-center text-[12px] text-muted-foreground">
                  No funds match “{debounced}”.
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
