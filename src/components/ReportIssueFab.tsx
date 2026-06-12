import { Bug } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import ReportIssueDialog from "@/components/ReportIssueDialog";

/**
 * Floating "report an issue" trigger, visible on every page for signed-in
 * users so a bug can be reported from wherever it was spotted. Sits above
 * the bottom nav, deliberately small and muted to stay out of the way.
 */
const ReportIssueFab = () => {
  const { authenticated } = useAuth();
  if (!authenticated) return null;

  return (
    <ReportIssueDialog>
      <button
        type="button"
        aria-label="Report an issue"
        className="fixed bottom-20 right-3 z-[90] flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-destructive"
      >
        <Bug className="h-4 w-4" />
      </button>
    </ReportIssueDialog>
  );
};

export default ReportIssueFab;
