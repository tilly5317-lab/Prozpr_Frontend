import { motion } from "framer-motion";
import { ArrowLeft, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BottomNav from "@/components/BottomNav";

/**
 * A locked feature's placeholder.
 *
 * Mounted in place of the real page's element rather than rendered from inside
 * it, so the locked screen's own code never runs — no data fetches, no writes,
 * no half-loaded UI behind a banner. The page component itself is left in the
 * tree untouched (same approach as the Zoom team-call integration), so turning
 * a feature back on is a one-line route change rather than a revert.
 */
const ComingSoon = ({
  title,
  blurb,
  backTo = "/profile",
}: {
  title: string;
  /** What it will do, in the user's terms — not "under construction". */
  blurb: string;
  backTo?: string;
}) => {
  const navigate = useNavigate();

  return (
    <div className="mobile-container bg-background pb-20 min-h-screen">
      <div className="px-5 pt-10 pb-4 flex items-center gap-3">
        <button
          onClick={() => navigate(backTo)}
          aria-label="Back"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="px-5"
      >
        <div className="wealth-card !p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">Coming soon</p>
          <p className="mx-auto mt-1.5 max-w-[38ch] text-[12px] leading-relaxed text-muted-foreground">
            {blurb}
          </p>
          <button
            onClick={() => navigate(backTo)}
            className="mt-4 rounded-xl bg-foreground px-4 py-2.5 text-[12px] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Go back
          </button>
        </div>
      </motion.div>

      <BottomNav />
    </div>
  );
};

export default ComingSoon;
