import { Bug } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import ReportIssueDialog from "@/components/ReportIssueDialog";

/**
 * Floating "report an issue" trigger, visible on every page for signed-in
 * users so a bug can be reported from wherever it was spotted. Deliberately
 * small and muted to stay out of the way.
 *
 * Its anchor is chosen per route so it never sits on top of a page's own
 * controls. The default slot is bottom-right above the nav; pages that
 * already use that corner (or fill the bottom edge) get an override that
 * parks the button in free space instead. Each option is a full literal
 * string so Tailwind's class scanner still emits the utilities.
 */
const DEFAULT_POSITION = "bottom-20 right-3";

const positionForPath = (pathname: string): string => {
  // Chat: the composer (input + mic/send + suggestion chips) fills the whole
  // bottom edge, so the bug button collides with the send button there.
  // The chat header's right side is empty, so tuck it top-right — below the
  // slim beta banner.
  if (pathname === "/chat") return "top-16 right-3";

  // Goals timeline: the gold "add a goal" + FAB owns the bottom-right corner,
  // so move the bug button to the opposite (bottom-left) corner. The cards
  // view (/goal-planner/cards) has no floating add button, so it keeps the
  // default.
  if (pathname === "/goal-planner" || pathname.startsWith("/goal-planner/timeline"))
    return "bottom-20 left-3";

  // Execute / rebalancing: a full-width allocation footer sits just above the
  // nav (so the default bottom-right overlaps it) and a mic FAB sits on the
  // right, so use the free bottom-left, lifted clear of the footer.
  if (pathname === "/execute" || pathname === "/excecute" || pathname === "/rebalancing")
    return "bottom-32 left-3";

  return DEFAULT_POSITION;
};

const ReportIssueFab = () => {
  const { authenticated } = useAuth();
  const { pathname } = useLocation();
  if (!authenticated) return null;

  return (
    <ReportIssueDialog>
      <button
        type="button"
        aria-label="Report an issue"
        className={`fixed ${positionForPath(pathname)} z-[90] flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-destructive`}
      >
        <Bug className="h-4 w-4" />
      </button>
    </ReportIssueDialog>
  );
};

export default ReportIssueFab;
