import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, QrCode } from "lucide-react";

/**
 * Where MF Central sends the investor once the QR download completes.
 *
 * This route has to exist and has to be cheap: it is the `redirectUrl` baked
 * into the encrypted consent payload, so MFC lands the browser here regardless
 * of which of their three integration modes ran.
 *
 * Two arrivals are possible and they need different handling:
 *
 * * **Popup / iframe** — the flow is still alive in the opener, which is
 *   listening for MFC's `mfc-cas-complete` message. There is nothing to do but
 *   close, and closing is what tells the user the round-trip finished.
 * * **Standalone redirect** — this tab IS the flow now; the original one is
 *   gone or was navigated away. Send them back to the import screen, where the
 *   QR upload step is waiting and the request row is still on the server.
 *
 * The status query params MFC appends are informational only. The statement is
 * fetched with the QR image, never with a reqId from a URL, so nothing here is
 * trusted enough to act on beyond choosing which of the two messages to show.
 */
const MfcCasCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [isPopup, setIsPopup] = useState(false);

  const status = params.get("status");
  const failed = status != null && status !== "success";

  useEffect(() => {
    const opened = typeof window !== "undefined" && window.opener != null;
    setIsPopup(opened);
    if (opened) {
      // Give MFC's own postMessage a moment to reach the opener before this
      // window disappears — closing first would drop it.
      const timer = window.setTimeout(() => window.close(), 1200);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => navigate("/mfc-cas", { replace: true }), 1600);
    return () => window.clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="mobile-container flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      {failed ? (
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      ) : (
        <CheckCircle2 className="h-8 w-8 text-wealth-green" />
      )}

      <h1 className="mt-4 text-base font-semibold text-foreground">
        {failed ? "MF Central couldn't finish" : "Back from MF Central"}
      </h1>

      <p className="mt-2 max-w-xs text-[12px] leading-relaxed text-muted-foreground">
        {failed
          ? params.get("message") ??
            "The consent didn't complete. Start the import again from Prozpr."
          : isPopup
            ? "You can close this window — we're picking up where you left off."
            : "Taking you back to finish the import."}
      </p>

      {!isPopup && !failed && (
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-3">
          <QrCode className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-left text-[11px] leading-relaxed text-muted-foreground">
            Have the QR code image ready — uploading it is the last step.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate("/mfc-cas", { replace: true })}
        className="mt-6 rounded-xl bg-foreground px-6 py-2.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
      >
        Continue the import
      </button>
    </div>
  );
};

export default MfcCasCallback;
