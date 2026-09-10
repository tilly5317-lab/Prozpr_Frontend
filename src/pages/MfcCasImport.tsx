import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import MfcCasFlow, { type MfcStep } from "@/components/mfc/MfcCasFlow";
import { useEnterSubmit } from "@/hooks/useEnterSubmit";
import { useOnboardingStep } from "@/hooks/useOnboardingStep";
import { type MfcImportResponse } from "@/lib/api";

/**
 * Import holdings straight from MF Central.
 *
 * The destination for the consent flow, reachable from the CAMS import screen
 * and directly at /mfc-cas.
 *
 * Back and forward are deliberately different places. "Back" returns where the
 * user came from; the CTA after a successful import goes ONWARD — during
 * onboarding that is About You, the same step the CAS PDF path completes. They
 * were the same route until it became clear that finishing the import and then
 * being returned to the import screen reads as though nothing happened.
 *
 * The move is not automatic. The statement view is the point of this screen —
 * it shows fields nothing else in the app does — so the user leaves when they
 * have looked at it.
 */
const MfcCasImport = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from");
  const fromProfile = from === "profile";
  const inOnboarding = from === "onboarding";

  // The same onboarding step /cams-upload owns: this is that step, reached by
  // the other route. Inert outside first-run onboarding, exactly as there.
  const { completeStep } = useOnboardingStep("cams_upload", {
    enabled: !fromProfile,
  });

  const [step, setStep] = useState<MfcStep>("intro");
  const [imported, setImported] = useState(false);

  /** Where "Back" goes — where they came from. */
  const backTo = fromProfile
    ? "/profile"
    : inOnboarding
      ? "/cams-upload"
      : "/portfolio";

  /** Where the post-import CTA goes — the NEXT thing, never the screen they
   * just completed. Onboarding continues to About You. */
  const forwardTo = fromProfile ? "/profile" : inOnboarding ? "/about-you" : "/portfolio";
  const forwardLabel = fromProfile
    ? "Done"
    : inOnboarding
      ? "Continue"
      : "Go to my portfolio";

  const goForward = () => navigate(forwardTo, { replace: true });
  useEnterSubmit(goForward, step === "done" && imported);

  const handleImported = (res: MfcImportResponse) => {
    setImported(true);
    completeStep({
      source: "mfc",
      schemes: res.ingest?.schemes,
      folios: res.ingest?.folios,
    });
  };

  return (
    <div className="mobile-container flex min-h-screen flex-col bg-background px-6 pb-10 pt-12">
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-1 flex-col"
      >
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="mb-4 flex items-center gap-1.5 self-start text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        <h1 className="mb-2 text-lg font-semibold text-foreground">
          {step === "done"
            ? imported
              ? "Imported from MF Central"
              : "What MF Central sent"
            : "Import from MF Central"}
        </h1>
        <p className="mb-6 text-xs leading-relaxed text-muted-foreground">
          {step === "done"
            ? "Everything the registrars returned for your PAN. Your portfolio, allocation and net-worth history have been rebuilt from it."
            : "Your holdings and full transaction history, straight from CAMS and KFintech. Takes about a minute."}
        </p>

        <MfcCasFlow
          onImported={handleImported}
          onStepChange={setStep}
          onFallback={() => navigate(`/cams-upload${from ? `?from=${from}` : ""}`)}
        />

        {/* `replace` so browser-back from the next step does not return to a
            consumed consent: the QR is single-use, and this screen would show a
            done-state the user can no longer act on. */}
        {step === "done" && imported && (
          <button
            type="button"
            onClick={goForward}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
          >
            {forwardLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </motion.div>
    </div>
  );
};

export default MfcCasImport;
