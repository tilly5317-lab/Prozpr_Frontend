import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { setCamsSkipped, type CamsPdfImportResponse } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useOnboardingStep } from "@/hooks/useOnboardingStep";
import { camsImportedThisSession, useCamsMissing } from "@/hooks/useCamsMissing";
import CamsImportFlow, { type CamsImportStep } from "@/components/onboarding/CamsImportFlow";

/**
 * Dedicated first-step page (right after account setup): guided CAMS import —
 * we request the CAS statement straight to the user's email (with a password
 * they choose), they upload the received PDF, and we build their portfolio.
 * A successful import continues automatically to About You (the old
 * link-accounts confirmation page was removed); the profile "Update Holdings"
 * entry point returns to /profile. Users whose statement is already imported
 * (e.g. resuming onboarding) get a Continue shortcut instead of being forced
 * to re-upload.
 *
 * CAMS is NOT compulsory, but deferring is deliberately not a peer of the two
 * import paths: the flow hides it behind a quiet link plus a confirmation of
 * what stays empty, because as an equal third card most users took it by
 * reflex. Confirming records the choice on the backend and carries on to About
 * You; every surface that needs holdings then shows an in-page upload prompt
 * rather than a block.
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
  const { refresh: refreshAuth } = useAuth();
  const cams = useCamsMissing();
  const alreadyImported = cams.hasCams === true || camsImportedThisSession();
  // Mirrors the flow's current step so the page heading can celebrate success
  // instead of still reading "Import your mutual funds" on the done screen.
  const [flowStep, setFlowStep] = useState<CamsImportStep>("request");
  const imported = flowStep === "done";
  const [skipping, setSkipping] = useState(false);

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

  /**
   * "I'll do this later". The choice is persisted (users.cams_skipped_at) so the
   * backend-driven resume resolver won't drop the user back here on their next
   * visit, then onboarding carries on to About You. A failed write is not worth
   * trapping anyone on this screen — we continue and let the next visit re-ask.
   */
  const handleSkip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      await setCamsSkipped(true);
      await refreshAuth();
    } catch {
      /* best-effort — proceeding matters more than recording the choice */
    }
    markDoneFlags();
    completeStep({ skipped: true });
    toast({
      title: "No problem — you can add it later",
      description:
        "Your portfolio, rebalancing and net-worth history stay empty until you add a statement. We'll offer the upload wherever it's needed.",
    });
    navigate(fromProfile ? "/profile" : "/about-you");
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
          {imported ? "Mutual funds imported successfully" : "Import your mutual funds"}
        </h1>
        <p className="mb-6 text-xs leading-relaxed text-muted-foreground">
          {imported
            ? "We've read your folios, holdings and transactions and built your portfolio. You're all set to continue."
            : "Upload your CAMS/KFintech Consolidated Account Statement, or have a fresh one mailed to you — we read your folios, holdings and transactions and build your portfolio from it."}
        </p>

        {/* Resuming users with a statement already imported can continue without
            re-uploading (a fresh upload below still works and replaces the data). */}
        {!fromProfile && alreadyImported && !imported && (
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

        <CamsImportFlow
          onImported={handleImported}
          onStepChange={setFlowStep}
          fillHeight
          // Onboarding offers the third option; the profile entry point already
          // has its own Cancel below, so deferring there would be a duplicate.
          onSkip={fromProfile ? undefined : () => void handleSkip()}
          skipping={skipping}
        />

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
