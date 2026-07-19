import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Shield,
  UploadCloud,
} from "lucide-react";
import {
  uploadCamsStatement,
  BackendOfflineError,
  type CamsPdfImportResponse,
} from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useOnboardingStep } from "@/hooks/useOnboardingStep";
import CamsStatementGuide from "@/components/onboarding/CamsStatementGuide";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/**
 * Dedicated first-step page (right after account setup): upload a CAMS / KFintech
 * Consolidated Account Statement PDF so we can read folios, holdings & transactions.
 * On success or skip the user continues to the (now CAMS-only) link-accounts page.
 */
const CamsUpload = () => {
  const navigate = useNavigate();
  // Opened from Profile ("Update Holdings") → return there instead of continuing
  // the onboarding flow to link-accounts.
  const [searchParams] = useSearchParams();
  const fromProfile = searchParams.get("from") === "profile";
  const exitRoute = fromProfile ? "/profile" : "/link-accounts";
  // Track as an onboarding step only during first-run onboarding — not when the
  // page is reused from Profile → "Update Holdings".
  const { completeStep } = useOnboardingStep("cams_upload", { enabled: !fromProfile });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<CamsPdfImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = (f: File | null) => {
    setError(null);
    setResult(null);
    if (!f) {
      setFile(null);
      return;
    }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setError("Please choose a PDF (the CAMS / KFintech Consolidated Account Statement).");
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
      setError("Enter the password you set on the CAMS form while generating the statement.");
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
    <div className="mobile-container flex flex-col bg-background px-6 pb-6 pt-12 min-h-screen">
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.35 }}
        className="flex-1 flex flex-col"
      >
        <h1 className="text-xl font-semibold text-foreground mb-2">
          Upload your mutual fund statement
        </h1>
        <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
          Add your CAMS or KFintech Consolidated Account Statement (CAS) as a PDF. We&apos;ll
          read your folios, holdings and transactions to build your portfolio.
        </p>

        {!done && (
          <>
            <div className="mb-4">
              <CamsStatementGuide />
            </div>

            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                2
              </span>
              <p className="text-sm font-medium text-foreground">Upload the statement you received</p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card px-3.5 py-4 text-left transition-colors hover:bg-accent/40 disabled:opacity-60"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                {file ? (
                  <FileText className="h-5 w-5 text-foreground" />
                ) : (
                  <UploadCloud className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {file ? file.name : "Choose CAMS / KFintech CAS PDF"}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {file ? `${(file.size / 1024).toFixed(0)} KB · tap to change file` : "PDF only · up to 20 MB"}
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

            <div className="mt-4">
              <label htmlFor="cas-password" className="text-[11px] font-medium text-muted-foreground">
                Statement password
              </label>
              <div className="relative mt-1">
                <input
                  id="cas-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="off"
                  placeholder="The password you set while generating the statement"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={uploading}
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 pr-11 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-60 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={uploading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                This is only used to open the PDF on our server — it is never stored.
              </p>
            </div>

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
            {result?.status === "FAILED" && result.normalize_error && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">
                Parsed {result.schemes} scheme(s), but importing transactions failed:{" "}
                {result.normalize_error}
              </p>
            )}
          </>
        )}

        {done && result && (
          <div className="flex items-center gap-2 rounded-xl border border-wealth-green/30 bg-wealth-green/5 px-3.5 py-3">
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
        )}

        <div className="mt-auto flex items-center justify-center gap-1.5 pt-8">
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            The PDF is processed on our server and the password discarded after parsing.
          </span>
        </div>
      </motion.div>

      {done ? (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          type="button"
          onClick={() => {
            completeStep({
              schemes: result?.schemes,
              folios: result?.folios,
            });
            navigate(exitRoute);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98]"
        >
          {fromProfile ? "Done — back to profile" : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </motion.button>
      ) : (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          type="button"
          onClick={() => void handleUpload()}
          disabled={uploading || !file}
          className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold text-primary-foreground tracking-wide transition-all active:scale-[0.98] disabled:opacity-90 disabled:pointer-events-none"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading statement…
            </>
          ) : (
            <>
              Upload &amp; import
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </motion.button>
      )}

      {/* CAMS is compulsory during onboarding — only the profile "Update
          Holdings" entry point may cancel without importing. */}
      {fromProfile && (
        <button
          type="button"
          onClick={() => navigate(exitRoute)}
          disabled={uploading}
          className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          Cancel — back to profile
        </button>
      )}
    </div>
  );
};

export default CamsUpload;
