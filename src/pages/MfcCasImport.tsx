import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, History, Loader2 } from "lucide-react";
import MfcCasFlow, { type MfcStep } from "@/components/mfc/MfcCasFlow";
import {
  listMfcRequests,
  type MfcImportResponse,
  type MfcRequestItem,
} from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

/**
 * Import holdings straight from MF Central.
 *
 * The destination for the consent flow, reachable from the CAMS import screen
 * and directly at /mfc-cas. A successful import returns the user wherever they
 * came from (`?from=profile`, `?from=onboarding`), but not immediately: the
 * statement view is the point of the screen, so they leave on their own.
 *
 * The history section below is a deliberate part of the product, not debug
 * output. MFC's flow has a gap no UI can close — we cannot tell an abandoned
 * consent from one still in progress — so showing the attempts is how a user
 * makes sense of "I did that already, didn't I?".
 */
const MfcCasImport = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get("from");

  const [step, setStep] = useState<MfcStep>("intro");
  const [imported, setImported] = useState(false);

  const backTo =
    from === "profile" ? "/profile" : from === "onboarding" ? "/cams-upload" : "/portfolio";

  const handleImported = (_res: MfcImportResponse) => {
    setImported(true);
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
            : "CAMS and KFintech hand us your holdings and transaction history directly, with your consent. No statement to generate, no password, no PDF."}
        </p>

        <MfcCasFlow
          onImported={handleImported}
          onStepChange={setStep}
          onFallback={() => navigate(`/cams-upload${from ? `?from=${from}` : ""}`)}
        />

        {step === "intro" && <RequestHistory />}

        {step === "done" && imported && (
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="mt-6 w-full rounded-xl bg-foreground py-3.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
          >
            Done
          </button>
        )}
      </motion.div>
    </div>
  );
};

// --------------------------------------------------------------------------- history

const STATUS_LABELS: Record<string, string> = {
  initiated: "Started — not completed here",
  imported: "Imported",
  failed: "Failed",
};

const RequestHistory = () => {
  const [rows, setRows] = useState<MfcRequestItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listMfcRequests(10)
      .then((res) => {
        if (!cancelled) setRows(res.requests);
      })
      .catch(() => {
        // A missing history is not worth an error on an import screen.
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) {
    return (
      <div className="mt-8 flex items-center gap-2 text-[12px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading previous attempts…
      </div>
    );
  }
  if (rows.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        Previous MF Central requests
      </h2>
      <div className="mt-2.5 space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-foreground">
                {STATUS_LABELS[r.status] ?? r.status}
                {r.cas_variant ? ` · ${r.cas_variant}` : ""}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {new Date(r.created_at).toLocaleString("en-IN")}
                {r.req_id ? ` · ${r.req_id}` : ""}
              </p>
              {r.error && (
                <p className="mt-1 text-[11px] leading-relaxed text-destructive">
                  {r.error}
                </p>
              )}
            </div>
            {r.total_value_inr != null && r.total_value_inr > 0 && (
              <p className="shrink-0 text-[12px] font-medium text-foreground">
                {formatInrCompact(r.total_value_inr)}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        A request stays &quot;started&quot; until a QR code is uploaded here —
        MF Central gives us no way to tell an abandoned consent from one still in
        progress.
      </p>
    </div>
  );
};

export default MfcCasImport;
