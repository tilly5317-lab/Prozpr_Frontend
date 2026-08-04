import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { type CamsPdfImportResponse } from "@/lib/api";
import CamsImportFlow, { type CamsImportStep } from "@/components/onboarding/CamsImportFlow";

interface CamsUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful ingest (portfolio + linked accounts changed). */
  onUploaded?: (result: CamsPdfImportResponse) => void;
  /**
   * Kept for API compatibility — the backend now always rebuilds the portfolio
   * from scratch on every statement import.
   */
  replaceExisting?: boolean;
}

/**
 * Modal host for the guided CAMS import flow (request statement by email →
 * check inbox → upload PDF → imported). Used from the portfolio dashboard and
 * the invest/rebalancing gate; the dedicated onboarding page hosts the same
 * flow full-page (see pages/CamsUpload.tsx).
 */
const CamsUploadModal = ({
  open,
  onClose,
  onUploaded,
  replaceExisting = false,
}: CamsUploadModalProps) => {
  // Remount the flow (fresh state) each time the modal opens.
  const [flowKey, setFlowKey] = useState(0);
  const [busy, setBusy] = useState(false);
  // Mirrors the flow's step so the modal heading celebrates on success.
  const [flowStep, setFlowStep] = useState<CamsImportStep>("request");
  const imported = flowStep === "done";

  useEffect(() => {
    if (open) {
      setFlowKey((k) => k + 1);
      setFlowStep("request");
    } else setBusy(false);
  }, [open]);

  const tryClose = () => {
    if (!busy) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={tryClose}
        >
          <motion.div
            className="relative bg-card shadow-xl"
            style={{
              width: "90%",
              maxWidth: 400,
              maxHeight: "90vh",
              overflowY: "auto",
              borderRadius: 16,
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
          >
            <button
              type="button"
              onClick={tryClose}
              className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-opacity hover:text-foreground"
              disabled={busy}
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="font-medium text-foreground" style={{ fontSize: 17 }}>
              {imported ? "Mutual funds imported successfully" : "Import your mutual funds"}
            </h2>
            <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>
              {imported
                ? "We've read your folios, holdings and transactions and updated your portfolio."
                : "Get your CAMS/KFintech statement by email and import your folios, holdings and transactions in minutes."}
            </p>

            <CamsImportFlow
              key={flowKey}
              compact
              replaceExisting={replaceExisting}
              onBusyChange={setBusy}
              onStepChange={setFlowStep}
              onImported={(result) => {
                onUploaded?.(result);
                onClose();
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CamsUploadModal;
