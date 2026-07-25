import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { type CamsPdfImportResponse } from "@/lib/api";
import { useOnboardingStep } from "@/hooks/useOnboardingStep";
import { camsImportedThisSession, useCamsMissing } from "@/hooks/useCamsMissing";
import CamsImportFlow from "@/components/onboarding/CamsImportFlow";

/**
 * Dedicated first-step page (right after account setup): guided CAMS import —
 * we request the CAS statement straight to the user's email (with a password
 * they choose), they upload the received PDF, and we build their portfolio.
 * A successful import continues automatically to About You (the old
 * link-accounts confirmation page was removed); the profile "Update Holdings"
 * entry point returns to /profile. Users whose statement is already imported
 * (e.g. resuming onboarding) get a Continue shortcut instead of being forced
 * to re-upload.
 */
const CamsUpload = () => {
  const navigate = useNavigate();
  // Opened from Profile ("Update Holdings") → return there instead of
  // continuing the onboarding flow.
  const [searchParams] = useSearchParams();
  const fromProfile = searchParams.get("from") === "profile";
  // Track as an onboarding step only during first-run onboarding — not when the
  // page is reused from Profile → "Update Holdings".
  const { completeStep } = useOnboardingStep("cams_upload", { enabled: !fromProfile });
  const cams = useCamsMissing();
  const alreadyImported = cams.hasCams === true || camsImportedThisSession();

  const markDoneFlags = () => {
    try {
      // Legacy flag from the removed link-accounts page — resume/options
      // screens still read it, so keep it in sync.
      if (!fromProfile) sessionStorage.setItem("completedLinkAccounts", "true");
    } catch {
      /* ignore */
    }
  };

  const handleImported = (res: CamsPdfImportResponse) => {
    markDoneFlags();
    completeStep({ schemes: res.schemes, folios: res.folios });
    navigate(fromProfile ? "/profile" : "/about-you");
  };

  const handleContinueExisting = () => {
    markDoneFlags();
    completeStep({ already_imported: true });
    navigate("/about-you");
  };

  return (
    <div className="mobile-container flex min-h-screen flex-col bg-background px-6 pb-6 pt-12">
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-1 flex-col"
      >
        <h1 className="mb-2 text-lg font-semibold text-foreground">
          Import your mutual funds
        </h1>
        <p className="mb-6 text-xs leading-relaxed text-muted-foreground">
          We&apos;ll fetch your CAMS/KFintech Consolidated Account Statement straight to
          your email — then read your folios, holdings and transactions to build your
          portfolio.
        </p>

        {/* Resuming users with a statement already imported can continue without
            re-uploading (a fresh upload below still works and replaces the data). */}
        {!fromProfile && alreadyImported && (
          <div className="mb-5 rounded-xl border border-wealth-green/30 bg-wealth-green/5 px-3.5 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-wealth-green" />
              <p className="text-[13px] font-medium text-foreground">
                Your statement is already imported
              </p>
            </div>
            <button
              type="button"
              onClick={handleContinueExisting}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground py-2.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Or import a fresh statement below — it replaces the current one.
            </p>
          </div>
        )}

        <CamsImportFlow onImported={handleImported} fillHeight />

        {/* CAMS is compulsory during onboarding — only the profile "Update
            Holdings" entry point may cancel without importing. */}
        {fromProfile && (
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="mt-6 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel — back to profile
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default CamsUpload;
