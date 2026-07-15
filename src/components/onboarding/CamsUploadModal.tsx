import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Loader2, FileText, UploadCloud, CheckCircle2, ChevronDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  uploadCamsStatement,
  BackendOfflineError,
  type CamsPdfImportResponse,
} from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";
import CamsStatementGuide from "@/components/onboarding/CamsStatementGuide";

interface CamsUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful ingest (portfolio + linked accounts changed). */
  onUploaded?: (result: CamsPdfImportResponse) => void;
  /**
   * When true, the new statement REPLACES all prior CAMS data (transactions, holdings,
   * allocations, net-worth history are wiped and recomputed from this upload alone).
   * Used by the rebalancing inputs flow. Defaults to an incremental merge.
   */
  replaceExisting?: boolean;
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const CamsUploadModal = ({ open, onClose, onUploaded, replaceExisting = false }: CamsUploadModalProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CamsPdfImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The "how to generate your statement" guide (same as the /cams-upload page)
  // is expanded by default so first-time users see the steps; collapsible so a
  // returning user re-uploading isn't forced to scroll past it.
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPassword("");
      setUploading(false);
      setResult(null);
      setError(null);
      setShowGuide(true);
    }
  }, [open]);

  const pickFile = (f: File | null) => {
    setError(null);
    setResult(null);
    if (!f) {
      setFile(null);
      return;
    }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Please choose a PDF file (the Consolidated Account Statement from CAMS / KFintech).");
      setFile(null);
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setError("That PDF is larger than 20 MB. Re-download a shorter statement period.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Choose your CAMS / KFintech statement PDF first.");
      return;
    }
    if (!password.trim()) {
      setError("Enter the password you set when generating the statement (often your PAN in capitals).");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const res = await uploadCamsStatement(file, password.trim(), replaceExisting);
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
        onUploaded?.(res);
      }
    } catch (e: unknown) {
      const msg =
        e instanceof BackendOfflineError
          ? "Backend unreachable. Try again when the server is online."
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
      {open && (
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
              width: "90%",
              maxWidth: 380,
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
              onClick={() => !uploading && onClose()}
              className="absolute right-4 top-4 rounded-sm text-muted-foreground transition-opacity hover:text-foreground"
              disabled={uploading}
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="font-medium text-foreground" style={{ fontSize: 17 }}>
              Upload your mutual fund statement
            </h2>
            <p className="text-muted-foreground" style={{ fontSize: 12, marginTop: 4 }}>
              Add a CAMS / KFintech Consolidated Account Statement (CAS) PDF. We&apos;ll read your
              folios, holdings and transactions and update your portfolio.
            </p>
            {replaceExisting && !done && (
              <p
                className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800"
                style={{ fontSize: 11 }}
              >
                This statement replaces your existing one — we&apos;ll rebuild your
                holdings and net-worth history from this upload alone.
              </p>
            )}

            {!done && (
              <>
                {/* Step-by-step instructions for generating the statement —
                    same guide as the dedicated /cams-upload page. Collapsible
                    so a returning user can jump straight to the file picker. */}
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowGuide((v) => !v)}
                    className="flex w-full items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="text-[12px] font-medium text-foreground">
                      How to get your CAMS statement
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-muted-foreground transition-transform ${
                        showGuide ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  {showGuide && (
                    <div className="mt-2">
                      <CamsStatementGuide compact />
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      2
                    </span>
                    <p className="text-[12px] font-medium text-foreground">
                      Upload the statement you received
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-background px-3.5 py-3 text-left transition-colors hover:bg-accent/40 disabled:opacity-60"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      {file ? (
                        <FileText className="h-4 w-4 text-foreground" />
                      ) : (
                        <UploadCloud className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {file ? file.name : "Choose statement PDF"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {file ? `${(file.size / 1024).toFixed(0)} KB` : "CAMS or KFintech CAS · PDF only"}
                      </p>
                    </div>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  />
                </div>

                <div className="mt-3">
                  <label htmlFor="cas-password" className="text-[11px] font-medium text-muted-foreground">
                    Statement password
                  </label>
                  <input
                    id="cas-password"
                    type="password"
                    autoComplete="off"
                    placeholder="Usually your PAN in CAPITALS"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={uploading}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    This is only used to open the PDF — it is never stored.
                  </p>
                </div>

                {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
                {result?.status === "FAILED" && result.normalize_error && (
                  <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                    Parsed {result.schemes} scheme(s), but importing transactions failed:{" "}
                    {result.normalize_error}
                  </p>
                )}

                <Button
                  className="mt-4 w-full"
                  size="lg"
                  onClick={() => void handleUpload()}
                  disabled={uploading || !file}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reading statement…
                    </>
                  ) : (
                    "Upload & import"
                  )}
                </Button>
                <button
                  type="button"
                  className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={() => !uploading && onClose()}
                  disabled={uploading}
                >
                  Cancel
                </button>
              </>
            )}

            {done && result && (
              <div className="mt-4">
                <div className="flex items-center gap-2 rounded-lg border border-wealth-green/30 bg-wealth-green/5 px-3.5 py-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-wealth-green" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">Imported successfully</p>
                    <p className="text-[11px] text-muted-foreground">
                      {result.schemes} scheme(s) · {result.folios} folio(s) ·{" "}
                      {result.mf_transactions_inserted} new transaction(s)
                      {result.mf_transactions_skipped_duplicate > 0
                        ? ` · ${result.mf_transactions_skipped_duplicate} duplicate(s) skipped`
                        : ""}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Portfolio value: {formatInrCompact(result.total_value_inr)}
                    </p>
                  </div>
                </div>
                <Button className="mt-4 w-full" size="lg" onClick={onClose}>
                  Done
                </Button>
              </div>
            )}

            <p className="mt-3 text-center text-muted-foreground" style={{ fontSize: 11 }}>
              🔒 The PDF is processed on our server and the password is discarded after parsing.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CamsUploadModal;
