import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useEnterSubmit } from "@/hooks/useEnterSubmit";
import {
  getCamsCapabilities,
  getMe,
  requestCamsStatement,
  uploadCamsStatement,
  BackendOfflineError,
  type CamsPdfImportResponse,
} from "@/lib/api";
import { formatInrCompact } from "@/lib/utils";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const RESEND_COOLDOWN_S = 60;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const CAMS_MANUAL_URL =
  "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement";

type Step = "request" | "sent" | "upload" | "done";

/** Ordered rail shown at the top; "done" renders as upload-complete. */
const STEP_RAIL: { key: Exclude<Step, "done">; label: string }[] = [
  { key: "request", label: "Request" },
  { key: "sent", label: "Check email" },
  { key: "upload", label: "Upload" },
];

interface PasswordRule {
  label: string;
  ok: (v: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { label: "8+ characters", ok: (v) => v.length >= 8 },
  { label: "a letter", ok: (v) => /[A-Za-z]/.test(v) },
  { label: "a number", ok: (v) => /\d/.test(v) },
  { label: "a special character", ok: (v) => /[^A-Za-z0-9\s]/.test(v) },
];

const passwordValid = (v: string) =>
  PASSWORD_RULES.every((r) => r.ok(v)) && !/\s/.test(v);

interface CamsImportFlowProps {
  /** Fired when the user taps Continue on the success screen. */
  onImported: (result: CamsPdfImportResponse) => void;
  /** Kept for API compatibility — the backend now always rebuilds from scratch. */
  replaceExisting?: boolean;
  /** Lets a host modal block dismissal while a request/upload is in flight. */
  onBusyChange?: (busy: boolean) => void;
  /** Tighter type scale for the modal host. */
  compact?: boolean;
  /**
   * Full-page hosts: stretch to the available height and pin each step's
   * primary button to the bottom of the screen (the professional mobile
   * pattern the rest of onboarding uses). Modals keep the natural flow.
   */
  fillHeight?: boolean;
}

/**
 * Guided CAMS/KFintech statement import, end to end:
 *
 *  1. Request  — we ask CAMS/KFintech (via the CAS Parser API) to EMAIL the
 *     investor their full-history detailed CAS PDF, protected with a password
 *     they choose right here.
 *  2. Check email — the PDF lands in their inbox within a few minutes.
 *  3. Upload   — they drop the received PDF back here; the password is already
 *     pre-filled from step 1. The backend parses it remotely and rebuilds the
 *     portfolio (holdings + full transaction ledger).
 *
 * Users who already hold a CAS PDF can jump straight to Upload.
 */
const CamsImportFlow = ({
  onImported,
  replaceExisting = false,
  onBusyChange,
  compact = false,
  fillHeight = false,
}: CamsImportFlowProps) => {
  const [step, setStep] = useState<Step>("request");
  // Whether the backend's CAS Parser plan includes statement-by-email. When it
  // doesn't, the flow starts straight at Upload with manual-generation
  // guidance; when the plan is upgraded this lights back up automatically.
  const [mailbackAvailable, setMailbackAvailable] = useState<boolean | null>(null);

  // ── step 1 state ──
  const [email, setEmail] = useState("");
  const [pan, setPan] = useState("");
  const [casPassword, setCasPassword] = useState("");
  const [showCasPassword, setShowCasPassword] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  // ── step 2 state ──
  const [resendIn, setResendIn] = useState(0);

  // ── step 3 state ──
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPassword, setUploadPassword] = useState("");
  const [showUploadPassword, setShowUploadPassword] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── step 4 state ──
  const [result, setResult] = useState<CamsPdfImportResponse | null>(null);

  const busy = requesting || uploading;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Ask the backend which halves of the flow its CAS Parser plan supports.
  useEffect(() => {
    let cancelled = false;
    void getCamsCapabilities()
      .then((caps) => {
        if (cancelled) return;
        setMailbackAvailable(caps.mailback_available);
        // Skip the email-request step entirely on plans without the generator
        // (only if the user hasn't already navigated away from it).
        if (!caps.mailback_available) {
          setStep((s) => (s === "request" ? "upload" : s));
        }
      })
      .catch(() => {
        /* optimistic: keep the full flow; a real request surfaces its own error */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefill the email from the signed-in profile (best-effort).
  useEffect(() => {
    let cancelled = false;
    void getMe()
      .then((me) => {
        if (!cancelled && me.email) setEmail((prev) => prev || me.email!);
      })
      .catch(() => {
        /* profile fetch is a nicety — the field stays editable */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resend countdown tick.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(t);
  }, [resendIn]);

  const emailOk = EMAIL_RE.test(email.trim());
  const panOk = pan.trim() === "" || PAN_RE.test(pan.trim().toUpperCase());
  const casPasswordOk = passwordValid(casPassword);
  const canRequest = emailOk && panOk && casPasswordOk && !requesting;

  const errorMessage = (e: unknown, fallback: string) =>
    e instanceof BackendOfflineError
      ? "Backend unreachable. Try again when the server is online."
      : e instanceof Error
        ? e.message
        : fallback;

  const handleRequest = async () => {
    if (!canRequest) return;
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await requestCamsStatement({
        email: email.trim().toLowerCase(),
        password: casPassword,
        pan_no: pan.trim() ? pan.trim().toUpperCase() : null,
      });
      // Carry the password forward so the upload step is pre-filled.
      setUploadPassword(casPassword);
      setResendIn(RESEND_COOLDOWN_S);
      setStep("sent");
      toast({
        title: "Statement requested",
        description: res.message,
      });
    } catch (e: unknown) {
      const msg = errorMessage(e, "Could not request the statement.");
      setRequestError(msg);
      toast({ title: "Request failed", description: msg, variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  const pickFile = (f: File | null) => {
    setUploadError(null);
    if (!f) {
      setFile(null);
      return;
    }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setUploadError("Please choose a PDF file (the CAS statement from your email).");
      setFile(null);
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setUploadError("That PDF is larger than 20 MB. Request a fresh statement and retry.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadError("Choose the CAS PDF you received by email.");
      return;
    }
    if (!uploadPassword.trim()) {
      setUploadError("Enter the statement password (the one you set when requesting it).");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadCamsStatement(file, uploadPassword.trim(), replaceExisting);
      if (res.status === "FAILED") {
        const msg = res.normalize_error ?? "Normalization failed. Please try again.";
        setUploadError(msg);
        toast({
          title: "Statement read, but couldn't be imported",
          description: msg,
          variant: "destructive",
        });
        return;
      }
      try {
        sessionStorage.setItem("camsStatementImported", "true");
      } catch {
        /* ignore */
      }
      setResult(res);
      setStep("done");
      toast({
        title: "Statement imported",
        description: `${res.schemes} scheme(s) across ${res.folios} folio(s) — portfolio updated.`,
      });
    } catch (e: unknown) {
      const msg = errorMessage(e, "Upload failed.");
      setUploadError(msg);
      toast({ title: "Could not import the statement", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Enter anywhere = the step's primary (highlighted) button.
  useEnterSubmit(() => {
    if (step === "request") void handleRequest();
    else if (step === "sent") setStep("upload");
    else if (step === "upload") void handleUpload();
    else if (step === "done" && result) onImported(result);
  });

  const railIndex = useMemo(() => {
    if (step === "done") return STEP_RAIL.length; // everything complete
    return STEP_RAIL.findIndex((s) => s.key === step);
  }, [step]);

  const h = compact ? "text-[13px]" : "text-sm";
  const sub = compact ? "text-[11px]" : "text-xs";

  const stepMotion = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
    transition: { duration: 0.22 },
  };

  // Full-page hosts stretch each step and pin its CTA block to the bottom of
  // the screen; modal hosts keep the natural document flow.
  const stepShell = fillHeight ? "flex flex-1 flex-col" : "";
  const ctaBlock = fillHeight ? "mt-auto pt-6" : "mt-4";

  return (
    <div className={fillHeight ? "flex flex-1 flex-col" : undefined}>
      {/* ── step rail (hidden when the plan has no statement-by-email — the
             flow is then a single upload screen and a rail would mislead) ── */}
      <div
        className={`mb-4 flex items-center gap-1.5 ${
          mailbackAvailable === false ? "hidden" : ""
        }`}
      >
        {STEP_RAIL.map((s, i) => {
          const isDone = i < railIndex;
          const isActive = i === railIndex;
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                    isDone
                      ? "bg-wealth-green text-white"
                      : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    isActive ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEP_RAIL.length - 1 && (
                <div
                  className={`h-px flex-1 ${isDone ? "bg-wealth-green/50" : "bg-border"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* ─────────────────────────── STEP 1 · REQUEST ─────────────────────────── */}
        {step === "request" && (
          <motion.div key="request" {...stepMotion} className={stepShell}>
            <p className={`${sub} leading-relaxed text-muted-foreground`}>
              We&apos;ll ask CAMS/KFintech to email you your complete mutual fund
              statement (all folios, full history). Choose a password for it below —
              you&apos;ll use the same password when uploading.
            </p>

            <div className="mt-4">
              <label htmlFor="cas-email" className="text-[11px] font-medium text-muted-foreground">
                Email registered with your mutual funds
              </label>
              <div className="relative mt-1">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="cas-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={requesting}
                  className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary disabled:opacity-60"
                />
              </div>
              {email.trim() !== "" && !emailOk && (
                <p className="mt-1 text-[11px] text-destructive">Enter a valid email address.</p>
              )}
            </div>

            <div className="mt-3">
              <label htmlFor="cas-pan" className="text-[11px] font-medium text-muted-foreground">
                PAN <span className="font-normal text-muted-foreground/70">(optional, speeds up matching)</span>
              </label>
              <input
                id="cas-pan"
                type="text"
                autoComplete="off"
                placeholder="ABCDE1234F"
                value={pan}
                maxLength={10}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                disabled={requesting}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm uppercase tracking-wider text-foreground outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground/50 focus:border-primary disabled:opacity-60"
              />
              {!panOk && (
                <p className="mt-1 text-[11px] text-destructive">
                  That doesn&apos;t look like a PAN (format: ABCDE1234F).
                </p>
              )}
            </div>

            <div className="mt-3">
              <label htmlFor="cas-new-password" className="text-[11px] font-medium text-muted-foreground">
                Set a statement password
              </label>
              <div className="relative mt-1">
                <input
                  id="cas-new-password"
                  type={showCasPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="e.g. MyFunds@2026"
                  value={casPassword}
                  onChange={(e) => setCasPassword(e.target.value)}
                  disabled={requesting}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-11 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowCasPassword((v) => !v)}
                  disabled={requesting}
                  aria-label={showCasPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {showCasPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {PASSWORD_RULES.map((r) => {
                  const ok = r.ok(casPassword);
                  return (
                    <span
                      key={r.label}
                      className={`flex items-center gap-1 text-[11px] transition-colors ${
                        ok ? "text-wealth-green" : "text-muted-foreground/70"
                      }`}
                    >
                      <Check className={`h-3 w-3 ${ok ? "" : "opacity-30"}`} />
                      {r.label}
                    </span>
                  );
                })}
              </div>
            </div>

            {requestError && <p className="mt-3 text-xs text-destructive">{requestError}</p>}

            <div className={ctaBlock}>
              <button
                type="button"
                onClick={() => void handleRequest()}
                disabled={!canRequest}
                className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold tracking-wide text-primary-foreground transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              >
                {requesting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Requesting…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Email me my statement
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep("upload")}
                disabled={requesting}
                className="mt-3 flex w-full items-center justify-center gap-1 text-[12px] font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
              >
                Already have your CAS PDF? Upload it directly
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}

        {/* ─────────────────────────── STEP 2 · CHECK EMAIL ─────────────────────────── */}
        {step === "sent" && (
          <motion.div key="sent" {...stepMotion} className={stepShell}>
            <div className="flex flex-col items-center py-4 text-center">
              <motion.div
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <Inbox className="h-7 w-7 text-primary" />
              </motion.div>
              <h3 className={`${h} mt-4 font-semibold text-foreground`}>
                Statement on its way
              </h3>
              <p className={`${sub} mt-1.5 max-w-[300px] leading-relaxed text-muted-foreground`}>
                CAMS/KFintech is emailing your statement to{" "}
                <span className="font-medium text-foreground">{email.trim()}</span>. It
                usually arrives within <span className="font-medium text-foreground">5–10 minutes</span>.
              </p>
            </div>

            <ul className={`${sub} space-y-1.5 rounded-xl bg-muted/40 px-3.5 py-3 text-muted-foreground`}>
              <li>• Look for a mail from CAMS (donotreply@camsonline.com).</li>
              <li>• Check spam/promotions if it doesn&apos;t appear.</li>
              <li>• The PDF opens with the password you just set.</li>
            </ul>

            <div className={ctaBlock}>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold tracking-wide text-primary-foreground transition-all active:scale-[0.98]"
              >
                I&apos;ve received the PDF — upload it
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep("request")}
                  className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Edit details
                </button>
                <button
                  type="button"
                  onClick={() => void handleRequest()}
                  disabled={resendIn > 0 || requesting}
                  className="flex items-center gap-1 text-[12px] font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${requesting ? "animate-spin" : ""}`} />
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend email"}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ─────────────────────────── STEP 3 · UPLOAD ─────────────────────────── */}
        {step === "upload" && (
          <motion.div key="upload" {...stepMotion} className={stepShell}>
            {mailbackAvailable === false ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
                <p className="text-[12px] font-medium text-foreground">
                  1 · Generate your statement on the CAMS website
                </p>
                <p className={`${sub} mt-1 leading-relaxed text-muted-foreground`}>
                  Choose the <span className="font-medium text-foreground">Detailed</span>{" "}
                  statement, the earliest period, all folios, and set a password. The PDF
                  arrives by email in a few minutes — upload it below.
                </p>
                <a
                  href={CAMS_MANUAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Open the CAMS statement page
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <p className={`${sub} leading-relaxed text-muted-foreground`}>
                Upload the CAS PDF from your email — we&apos;ll read your folios, holdings
                and every transaction, then rebuild your portfolio from it.
              </p>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (!uploading) pickFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className="mt-4"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`flex w-full items-center gap-3 rounded-xl border border-dashed px-3.5 py-4 text-left transition-colors disabled:opacity-60 ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-accent/40"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  {file ? (
                    <FileText className="h-5 w-5 text-foreground" />
                  ) : (
                    <UploadCloud className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-foreground">
                    {file ? file.name : "Drop your CAS PDF here, or tap to browse"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {file
                      ? `${(file.size / 1024).toFixed(0)} KB · tap to change file`
                      : "PDF only · up to 20 MB"}
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
              <label htmlFor="cas-upload-password" className="text-[11px] font-medium text-muted-foreground">
                Statement password
              </label>
              <div className="relative mt-1">
                <input
                  id="cas-upload-password"
                  type={showUploadPassword ? "text" : "password"}
                  autoComplete="off"
                  placeholder="The password you set when requesting it"
                  value={uploadPassword}
                  onChange={(e) => setUploadPassword(e.target.value)}
                  disabled={uploading}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 pr-11 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowUploadPassword((v) => !v)}
                  disabled={uploading}
                  aria-label={showUploadPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {showUploadPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                Statements generated on the CAMS website usually use your PAN in capitals.
              </p>
            </div>

            {uploadError && <p className="mt-3 text-xs text-destructive">{uploadError}</p>}

            <div className={ctaBlock}>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={uploading || !file}
              className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold tracking-wide text-primary-foreground transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading your statement…
                </>
              ) : (
                <>
                  Import my portfolio
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <div
              className={`mt-3 flex items-center ${
                mailbackAvailable === false ? "justify-center" : "justify-between"
              }`}
            >
              {mailbackAvailable !== false && (
                <button
                  type="button"
                  onClick={() => setStep("request")}
                  disabled={uploading}
                  className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Request by email instead
                </button>
              )}
              <a
                href={CAMS_MANUAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Generate on CAMS site
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            </div>
          </motion.div>
        )}

        {/* ─────────────────────────── STEP 4 · DONE ─────────────────────────── */}
        {step === "done" && result && (
          <motion.div key="done" {...stepMotion} className={stepShell}>
            <div className="flex flex-col items-center py-3 text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 14, stiffness: 220 }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-wealth-green/10"
              >
                <CheckCircle2 className="h-8 w-8 text-wealth-green" />
              </motion.div>
              <h3 className={`${h} mt-3 font-semibold text-foreground`}>Portfolio imported</h3>
              <p className={`${sub} mt-1 text-muted-foreground`}>
                Portfolio value:{" "}
                <span className="font-semibold text-foreground">
                  {formatInrCompact(result.total_value_inr)}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Funds", value: result.schemes },
                { label: "Folios", value: result.folios },
                { label: "Transactions", value: result.mf_transactions_inserted },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-border bg-card px-2 py-2.5 text-center"
                >
                  <p className="text-base font-semibold text-foreground">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className={ctaBlock}>
              <button
                type="button"
                onClick={() => onImported(result)}
                className="flex w-full items-center justify-center gap-2 rounded-xl wealth-gradient py-3.5 text-[15px] font-semibold tracking-wide text-primary-foreground transition-all active:scale-[0.98]"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
        Parsed securely — the PDF and password are discarded right after parsing.
      </p>
    </div>
  );
};

export default CamsImportFlow;
