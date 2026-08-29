import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, GitCompare, HelpCircle, Layers, Search } from "lucide-react";

import BottomNav from "@/components/BottomNav";
import GuidedTour, { type TourStep } from "@/components/GuidedTour";

/** Marks the first-run discover walkthrough as seen, per browser. */
const DISCOVER_TOUR_SEEN_KEY = "discoverTourSeen";

export interface MfExploreHubProps {
  onBack: () => void;
}

/**
 * Mutual-fund discovery landing — entry points into the searchable
 * `/discovery/mf` list: browse all funds, or compare & rank them.
 */
export function MfExploreHub({ onBack }: MfExploreHubProps) {
  const navigate = useNavigate();

  /* First-run walkthrough of the three ways into the fund universe. Everything
     here renders immediately (no data fetch), so it can fire on mount. */
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISCOVER_TOUR_SEEN_KEY) !== "1") setTourOpen(true);
    } catch {
      /* private mode — just skip the tour rather than breaking the page */
    }
  }, []);

  const closeTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem(DISCOVER_TOUR_SEEN_KEY, "1");
    } catch {
      /* private mode */
    }
  }, []);

  const tourSteps = useMemo<TourStep[]>(
    () => [
      {
        anchor: "discover-search",
        title: "Jump straight to a fund",
        body: "If you already know what you're after, search by fund name, AMC or scheme code and go directly to it.",
      },
      {
        anchor: "discover-all-funds",
        title: "Browse the whole universe",
        body: "Every mutual fund available, with filters to narrow by category, AMC and rating — the place to start when you're exploring rather than looking for one name.",
      },
      {
        anchor: "discover-compare",
        title: "Compare and rank",
        body: "Overlay funds' performance side by side and rank them against Prozpr's own picks, so a fund is judged next to its peers rather than on its own numbers.",
      },
    ],
    [],
  );

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
        <div className="min-w-0 flex-1">
          <h1 className="mb-0.5 text-lg font-semibold text-foreground">Explore mutual funds</h1>
          <p className="text-xs text-muted-foreground">Browse and compare the full fund universe</p>
        </div>
        {/* Replays the first-run walkthrough — it's shown once, and this is the
            only way back to it. */}
        <button
          type="button"
          onClick={() => setTourOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Show the discover guide"
          title="How this page works"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      {/* Search shortcut → all-funds list */}
      <div className="mb-5 px-5">
        <button
          type="button"
          data-tour="discover-search"
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
        {/* All funds */}
        <div className="mb-6 px-5">
          <motion.button
            type="button"
            data-tour="discover-all-funds"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => navigate("/discovery/mf")}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left transition-all hover:shadow-sm active:scale-[0.99]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-foreground">All funds</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Browse the full mutual-fund universe with search and filters
              </p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </motion.button>
        </div>

        {/* Compare & rank funds */}
        <div className="mb-6 px-5">
          <motion.button
            type="button"
            data-tour="discover-compare"
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
      </div>

      {/* First-run walkthrough — search, all funds, compare & rank. */}
      <GuidedTour steps={tourSteps} open={tourOpen} onClose={closeTour} />

      <BottomNav />
    </div>
  );
}
