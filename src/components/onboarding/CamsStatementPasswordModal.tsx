import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  uploadCamsStatement,
  BackendOfflineError,
  type CamsPdfImportResponse,
} from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

interface CamsStatementPasswordModalProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onSuccess?: (result: CamsPdfImportResponse) => void;
  /** After a successful import, when the user taps Continue. */
  onImportedContinue?: () => void;
}

const CamsStatementPasswordModal = ({
  open,
  file,
  onClose,
  onSuccess,
  onImportedContinue,
}: CamsStatementPasswordModalProps) => {
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CamsPdfImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setUploading(false);
      setResult(null);
      setError(null);
    }
  }, [open]);

  const handleExtract = async () => {
    if (!file) return;
    if (!password.trim()) {
      setError("Enter the password you set when generating the statement (often your PAN in capitals).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await uploadCamsStatement(file, password.trim());
      setResult(res);
      if (res.status === "FAILED") {
        toast({
          title: "Statement read, but couldn't be imported",
          description: res.normalize_error ?? "Normalization failed. Please try again.",
          variant: "destructive",
        });
      } else {
        try {
          sessionStorage.setItem("camsStatementImported", "true");
        } catch {
          /* ignore */
        }
        toast({
          title: "Statement imported",
          description: `${res.schemes} scheme(s) across ${res.folios} folio(s) — portfolio updated.`,
        });
        onSuccess?.(res);
      }
    } catch (e: unknown) {
      const msg =
        e instanceof BackendOfflineError
          ? "Cannot reach the server. Check that the backend is running."
          : e instanceof Error
            ? e.message
            : "Upload failed.";
      setError(msg);
      toast({ title: "Could not import the statement", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const done = result != null && result.status !== "FAILED";

  return (
    <AnimatePresence>
      {open && file && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !uploading && onClose()}
        >
          <motion.div
            className="relative bg-card shadow-xl"
            style={{
              width: "88%",
              maxWidth: 340,
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
              onClick={() => !uploading && onClose()}
              className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-opacity hover:text-foreground"
              disabled={uploading}
            >
              <X className="h-4 w-4" />
            </button>

            {!done && (
              <>
                <h2 className="font-medium text-foreground" style={{ fontSize: 17 }}>
                  Statement password
                </h2>
                <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 4 }}>
                  Enter the password for{" "}
                  <span className="font-medium text-foreground break-all">{file.name}</span> so we can
                  extract your folios and holdings from this CAMS / KFintech CAS PDF.
                </p>

                <div className="mt-4">
                  <label htmlFor="welcome-cas-password" className="text-[11px] font-medium text-muted-foreground">
                    PDF password
                  </label>
                  <input
                    id="welcome-cas-password"
                    type="password"
                    autoComplete="off"
                    placeholder="Usually your PAN in CAPITALS"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={uploading}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    Used only to decrypt the PDF on the server — not stored.
                  </p>
                </div>

                {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
                {result?.status === "FAILED" && result.normalize_error && (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                    {result.normalize_error}
                  </p>
                )}

                <Button
                  className="mt-4 w-full"
                  size="lg"
                  onClick={() => void handleExtract()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Extracting data…
                    </>
                  ) : (
                    "Extract data"
                  )}
                </Button>
              </>
            )}

            {done && result && (
              <div className="mt-1">
                <div className="flex items-center gap-2 rounded-lg border border-wealth-green/30 bg-wealth-green/5 px-3.5 py-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-wealth-green" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">Imported successfully</p>
                    <p className="text-[11px] text-muted-foreground">
                      {result.schemes} scheme(s) · {result.folios} folio(s) ·{" "}
                      {result.mf_transactions_inserted} new transaction(s)
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Portfolio value: {formatInrCompact(result.total_value_inr)}
                    </p>
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  size="lg"
                  onClick={() => {
                    onImportedContinue?.();
                    onClose();
                  }}
                >
                  Continue
                </Button>
              </div>
            )}

            <p className="text-center text-muted-foreground" style={{ fontSize: 11, marginTop: 12 }}>
              🔒 The PDF is processed on our server and the password is discarded after parsing.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CamsStatementPasswordModal;
