import { useEffect, useState } from "react";
import {
  Banknote,
  Building2,
  Bus,
  Coins,
  Cpu,
  Factory,
  Globe2,
  HeartPulse,
  Landmark,
  LineChart,
  Pill,
  ShieldHalf,
  ShoppingBasket,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { searchMfFunds, type MfFundMetadataSearchParams } from "@/lib/api";

/**
 * One browsable group of funds. `filter` is passed straight to the search
 * endpoint, so a group is only ever as real as the query behind it.
 */
export interface FundGroup {
  key: string;
  label: string;
  /** Plain-English gloss — the theme name alone doesn't say what you'd own. */
  blurb: string;
  icon: LucideIcon;
  /** Tailwind classes for the circular icon chip — one tint per theme. */
  tint: string;
  filter: Omit<MfFundMetadataSearchParams, "limit" | "offset">;
  /** Funds actually matching, from the endpoint. Null until probed. */
  count?: number | null;
}

/* Sector and thematic funds, matched by keyword against scheme names.
 *
 * These are candidates, not claims: each is probed against the search endpoint
 * on mount and only rendered if it actually returns funds — so a theme no AMC
 * offers here simply disappears rather than becoming a tile that opens an empty
 * list. That also means this list can be generous: adding a speculative theme
 * costs nothing if it doesn't exist.
 *
 * Keyword matching is deliberately broad (`Pharma` catches "Pharma & Healthcare"
 * funds). It searches scheme names, so it finds sector funds without needing a
 * sector field the search endpoint doesn't have. */
const THEME_CANDIDATES: Omit<FundGroup, "count">[] = [
  {
    key: "tech",
    label: "Technology",
    blurb: "IT services, software and digital",
    icon: Cpu,
    tint: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    filter: { q: "Technology" },
  },
  {
    key: "banking",
    label: "Financial Services",
    blurb: "Banks, insurers and lenders",
    icon: Landmark,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    filter: { q: "Banking" },
  },
  {
    key: "pharma",
    label: "Pharma",
    blurb: "Drugmakers and healthcare",
    icon: Pill,
    tint: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    filter: { q: "Pharma" },
  },
  {
    key: "defence",
    label: "Defence",
    blurb: "Defence and aerospace makers",
    icon: ShieldHalf,
    tint: "bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    filter: { q: "Defence" },
  },
  {
    key: "infra",
    label: "Infrastructure",
    blurb: "Roads, ports, power and building",
    icon: Building2,
    tint: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    filter: { q: "Infrastructure" },
  },
  {
    key: "energy",
    label: "Energy",
    blurb: "Oil, gas and renewables",
    icon: Zap,
    tint: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300",
    filter: { q: "Energy" },
  },
  {
    key: "consumption",
    label: "Consumption",
    blurb: "What Indian households buy",
    icon: ShoppingBasket,
    tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    filter: { q: "Consumption" },
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    blurb: "Factories and industrial goods",
    icon: Factory,
    tint: "bg-stone-200 text-stone-700 dark:bg-stone-800/60 dark:text-stone-300",
    filter: { q: "Manufacturing" },
  },
  {
    key: "auto",
    label: "Auto",
    blurb: "Carmakers and parts suppliers",
    icon: Bus,
    tint: "bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300",
    filter: { q: "Auto" },
  },
  {
    key: "psu",
    label: "PSU",
    blurb: "State-owned companies",
    icon: Landmark,
    tint: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    filter: { q: "PSU" },
  },
  {
    key: "healthcare",
    label: "Healthcare",
    blurb: "Hospitals, devices and diagnostics",
    icon: HeartPulse,
    tint: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
    filter: { q: "Healthcare" },
  },
  {
    key: "global",
    label: "Global",
    blurb: "Companies listed outside India",
    icon: Globe2,
    tint: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    filter: { q: "Global" },
  },
];

const ASSET_CANDIDATES: Omit<FundGroup, "count">[] = [
  {
    key: "ac-equity",
    label: "Equity",
    blurb: "Shares — growth over long horizons",
    icon: LineChart,
    tint: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    filter: { asset_class: "Equity" },
  },
  {
    key: "ac-debt",
    label: "Debt",
    blurb: "Bonds — steadier, lower returns",
    icon: Banknote,
    tint: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    filter: { asset_class: "Debt" },
  },
  {
    key: "ac-others",
    label: "Others",
    blurb: "Gold, hybrid and everything else",
    icon: Coins,
    tint: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    filter: { asset_class: "Others" },
  },
];

/** Turn a group's filter into the query string `/discovery/mf` reads. */
export function groupHref(g: FundGroup): string {
  const q = new URLSearchParams();
  if (g.filter.q) q.set("q", g.filter.q);
  if (g.filter.sub_category) q.set("sub_category", g.filter.sub_category);
  if (g.filter.asset_class) q.set("asset_class", g.filter.asset_class);
  if (g.filter.category) q.set("category", g.filter.category);
  q.set("title", g.label);
  return `/discovery/mf?${q.toString()}`;
}

/**
 * Probe every candidate for its real fund count, keeping only those that exist,
 * ordered by how many funds each theme actually has.
 *
 * `limit: 1` because only `total` is wanted — the rows are thrown away. Probes
 * run concurrently and failures drop the group rather than surfacing an error:
 * this is a browse aid, not the page's primary content.
 */
export function useFundGroups(kind: "theme" | "asset"): {
  groups: FundGroup[];
  loading: boolean;
} {
  const [groups, setGroups] = useState<FundGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const candidates = kind === "theme" ? THEME_CANDIDATES : ASSET_CANDIDATES;
    setLoading(true);

    void Promise.all(
      candidates.map(async (c) => {
        try {
          const res = await searchMfFunds({ ...c.filter, limit: 1, offset: 0 });
          return { ...c, count: res.total };
        } catch {
          return { ...c, count: null };
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const live = rows.filter((r) => (r.count ?? 0) > 0);
      // Themes with the most funds first — the ones a user can actually act on.
      if (kind === "theme") live.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
      setGroups(live);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [kind]);

  return { groups, loading };
}
