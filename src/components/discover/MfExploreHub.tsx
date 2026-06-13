import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, GitCompare, Layers, Search } from "lucide-react";

import BottomNav from "@/components/BottomNav";

export interface MfExploreHubProps {
  onBack: () => void;
}

/**
 * Mutual-fund discovery landing — entry points into the searchable
 * `/discovery/mf` list: browse all funds, or compare & rank them.
 */
export function MfExploreHub({ onBack }: MfExploreHubProps) {
  const navigate = useNavigate();

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
          <p className="text-xs text-muted-foreground">Browse and compare the full fund universe</p>
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
        {/* All funds */}
        <div className="mb-6 px-5">
          <motion.button
            type="button"
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

      <BottomNav />
    </div>
  );
}
