import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Coins,
  Flame,
  GitCompare,
  Landmark,
  Layers,
  LineChart,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import BottomNav from "@/components/BottomNav";
import {
  listDiscoveryHouseView,
  listDiscoveryTrending,
  type DiscoveryFund,
} from "@/lib/api";

/* ── Collection tiles (Groww/Zerodha-style squared cards) ──
 *
 * Each tile deep-links into the existing all-funds list (`/discovery/mf`),
 * which now reads `q` / `sort` / `collection` / `title` query params:
 *   • category tiles → `q` free-text filter (server-backed search)
 *   • "Highest performing" → `sort=perf` (client-side 1Y ranking, approximate)
 *   • "Most bought" → `collection=most-bought` (placeholder — needs backend)
 */
interface Collection {
  key: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  to: string;
  iconBg: string;
  iconText: string;
  badge?: string;
}

const COLLECTIONS: Collection[] = [
  {
    key: "perf",
    title: "Highest performing",
    subtitle: "Best 1Y returns",
    icon: TrendingUp,
    to: "/discovery/mf?sort=perf&title=Highest+performing",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconText: "text-emerald-700 dark:text-emerald-300",
  },
  {
    key: "bought",
    title: "Most bought",
    subtitle: "Popular on Prozpr",
    icon: Flame,
    to: "/discovery/mf?collection=most-bought&title=Most+bought",
    iconBg: "bg-orange-100 dark:bg-orange-900/40",
    iconText: "text-orange-600 dark:text-orange-300",
    badge: "Soon",
  },
  {
    key: "large",
    title: "Large cap",
    subtitle: "Stable blue-chips",
    icon: Landmark,
    to: "/discovery/mf?q=Large+Cap&title=Large+Cap+Funds",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconText: "text-blue-700 dark:text-blue-300",
  },
  {
    key: "mid",
    title: "Mid cap",
    subtitle: "Growth picks",
    icon: LineChart,
    to: "/discovery/mf?q=Mid+Cap&title=Mid+Cap+Funds",
    iconBg: "bg-violet-100 dark:bg-violet-900/40",
    iconText: "text-violet-700 dark:text-violet-300",
  },
  {
    key: "small",
    title: "Small cap",
    subtitle: "High risk · reward",
    icon: Sparkles,
    to: "/discovery/mf?q=Small+Cap&title=Small+Cap+Funds",
    iconBg: "bg-pink-100 dark:bg-pink-900/40",
    iconText: "text-pink-600 dark:text-pink-300",
  },
  {
    key: "elss",
    title: "ELSS · Tax saving",
    subtitle: "Save under 80C",
    icon: ShieldCheck,
    to: "/discovery/mf?q=ELSS&title=ELSS+Tax+Saving+Funds",
    iconBg: "bg-teal-100 dark:bg-teal-900/40",
    iconText: "text-teal-700 dark:text-teal-300",
  },
  {
    key: "flexi",
    title: "Flexi cap",
    subtitle: "Go-anywhere equity",
    icon: Layers,
    to: "/discovery/mf?q=Flexi+Cap&title=Flexi+Cap+Funds",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconText: "text-amber-700 dark:text-amber-300",
  },
  {
    key: "index",
    title: "Index funds",
    subtitle: "Low-cost passive",
    icon: Coins,
    to: "/discovery/mf?q=Index&title=Index+Funds",
    iconBg: "bg-slate-200 dark:bg-slate-800/50",
    iconText: "text-slate-600 dark:text-slate-300",
  },
];

const fmtRet = (n: number | null | undefined): string => {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};

export interface MfExploreHubProps {
  onBack: () => void;
}

/**
 * Mutual-fund discovery landing — a curated hub of collection tiles that
 * deep-link into the searchable `/discovery/mf` list. Mirrors how Groww and
 * Zerodha Coin surface funds: a hero "top picks" banner, then squared
 * collection cards, then a catch-all "explore all funds" entry.
 */
export function MfExploreHub({ onBack }: MfExploreHubProps) {
  const navigate = useNavigate();
  const [topPicks, setTopPicks] = useState<DiscoveryFund[]>([]);

  // Hero preview pulls the house-view ("our top picks"), falling back to
  // trending. Failure is silent — the hero still renders without rows.
  useEffect(() => {
    let cancelled = false;
    const loadTrending = () =>
      listDiscoveryTrending()
        .then((t) => !cancelled && setTopPicks(t.slice(0, 3)))
        .catch(() => {});
    listDiscoveryHouseView()
      .then((hv) => {
        if (cancelled) return;
        if (hv.length) setTopPicks(hv.slice(0, 3));
        else void loadTrending();
      })
      .catch(() => void loadTrending());
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mobile-container min-h-screen bg-background pb-[calc(3.5rem+env(safe-area-inset-bottom,8px)+12px)]">
      <div className="flex items-center gap-3 px-5 pb-3 pt-12">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full bg-secondary p-1.5 transition-colors hover:bg-muted"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <div>
          <h1 className="mb-0.5 text-xl font-bold text-foreground">Explore mutual funds</h1>
          <p className="text-xs text-muted-foreground">Curated collections, picked for you</p>
        </div>
      </div>

      {/* Search shortcut → all-funds list */}
      <div className="mb-5 px-5">
        <button
          type="button"
          onClick={() => navigate("/discovery/mf")}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-secondary/40"
        >
          <Search className="h-4 w-4 text-muted-foreground/50" />
          <span className="flex-1 text-sm text-muted-foreground/60">
            Search funds by name, AMC, or scheme code…
          </span>
        </button>
      </div>

      <div className="pb-24">
        {/* Hero — Top rated funds in Prozpr */}
        <div className="mb-6 px-5">
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => navigate("/discovery/mf?sort=perf&title=Top+rated+funds+in+Prozpr")}
            className="w-full overflow-hidden rounded-2xl border border-border/40 text-left transition-opacity hover:opacity-95"
          >
            <div className="bg-[#1B3A6B] px-5 pb-5 pt-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-[hsl(40,55%,70%)]" fill="currentColor" />
                <p className="text-[9px] font-semibold uppercase tracking-widest text-white/60">
                  Prozpr picks
                </p>
              </div>
              <h3 className="mb-1 text-lg font-bold leading-snug text-white">
                Top rated funds in Prozpr
              </h3>
              <p className="text-[11px] leading-relaxed text-white/60">
                Hand-picked, research-backed funds our team is backing this quarter.
              </p>
            </div>

            <div className="bg-card">
              {topPicks.length > 0 ? (
                topPicks.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 border-t border-border/40 px-4 py-3 first:border-t-0"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <TrendingUp className="h-4 w-4 text-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-foreground">{f.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {f.category ?? "Mutual fund"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-[hsl(var(--wealth-green))]">
                      {fmtRet(f.return_1y)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="border-t border-border/40 px-4 py-3.5 text-[11px] text-muted-foreground">
                  Curated top picks, updated regularly.
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border/40 px-4 py-3">
                <span className="text-[11px] font-semibold text-foreground">View top rated funds</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </motion.button>
        </div>

        {/* Compare & rank funds */}
        <div className="mb-6 px-5">
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            onClick={() => navigate("/discovery/compare")}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:shadow-sm active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
              <GitCompare className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-foreground">Compare &amp; rank funds</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Overlay performance and rank funds against Prozpr picks
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </motion.button>
        </div>

        {/* Collections grid */}
        <div className="mb-5 px-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Collections
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {COLLECTIONS.map((c, i) => (
              <motion.button
                key={c.key}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => navigate(c.to)}
                className="relative flex flex-col items-start rounded-2xl border border-border/60 bg-card p-3.5 text-left transition-all hover:shadow-sm active:scale-[0.98]"
              >
                <div
                  className={`mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl ${c.iconBg} ${c.iconText}`}
                >
                  <c.icon className="h-5 w-5" />
                </div>
                <div className="flex w-full items-center justify-between gap-1">
                  <p className="text-xs font-bold leading-tight text-foreground">{c.title}</p>
                  {c.badge && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      {c.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{c.subtitle}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Explore all funds — catch-all */}
        <div className="px-5">
          <button
            type="button"
            onClick={() => navigate("/discovery/mf")}
            className="flex w-full items-center justify-between rounded-xl border border-dashed border-border/70 bg-card px-4 py-3.5 text-left transition-colors hover:bg-secondary/40"
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <ArrowUpRight className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">Explore all funds</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Full MF universe with search and filters
                </p>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
