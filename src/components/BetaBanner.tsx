import { useState } from "react";
import { Info, X } from "lucide-react";

/**
 * Beta / test-mode banner.
 *
 * The product is live for testing but every recommendation and transaction is
 * simulated — nothing touches real money. This thin, dismissible bar sits at the
 * top of every page to make that unmistakable (cf. Stripe / PayPal test mode).
 *
 * Dismissal is remembered for the browser session so it doesn't nag on every
 * navigation, but returns on a fresh session.
 */
const DISMISS_KEY = "betaBannerDismissed";

const BetaBanner = () => {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "true",
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[100] flex items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs leading-snug text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
    >
      <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">
        <span className="font-semibold">Beta mode.</span> The app is in testing —
        all recommendations and transactions are simulated. No real-world
        transactions are being processed.
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss beta notice"
        className="shrink-0 rounded p-1 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/50 dark:hover:text-amber-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};

export default BetaBanner;
