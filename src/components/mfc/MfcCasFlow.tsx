import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UploadCloud,
} from "lucide-react";
import {
  BackendOfflineError,
  getMe,
  getMfcConfig,
  startMfcCasRequest,
  validateMfcQr,
  type MfcConfig,
  type MfcImportResponse,
  type MfcStartResponse,
  type UserInfo,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import MfcStatementView from "./MfcStatementView";

/**
 * MF Central consent import — the replacement for generate → email → download →
 * upload of a password-protected CAS PDF.
 *
 * Four steps, but only three are ours:
 *
 *   intro    explain what is about to happen and what they will be asked for
 *   consent  MFC's site, in a popup — OTP, Summary/Detailed, QR download.
 *            We cannot see inside this; MFC exposes no progress API, so the
 *            step ends either on their postMessage or on the user telling us.
 *   qr       they upload the QR image; we exchange it for the statement
 *   done     everything MFC returned, rendered
 *
 * The QR is single-use. A failed exchange is a dead end for that consent, so
 * nothing here retries automatically and the error copy says to start over
 * rather than "try again".
 */

export type MfcStep = "intro" | "consent" | "qr" | "done";

interface Props {
  /** Fired once the statement is imported and the portfolio rebuilt. */
  onImported?: (result: MfcImportResponse) => void;
  /** Lets a host swap its heading as the flow advances. */
  onStepChange?: (step: MfcStep) => void;
  /** Shown as a quiet link on the intro step — usually "use the PDF upload". */
  onFallback?: () => void;
  fallbackLabel?: string;
}

const MAX_QR_BYTES = 5 * 1024 * 1024;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

const MfcCasFlow = ({
  onImported,
  onStepChange,
  onFallback,
  fallbackLabel = "Use the CAS PDF upload instead",
}: Props) => {
  const [config, setConfig] = useState<MfcConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [me, setMe] = useState<UserInfo | null>(null);

  // MFC keys the statement on the PAN, so the backend only accepts a
  // body-supplied one when the account has none — asking for it here is the
  // difference between starting the flow and a 400 that reads like a bug.
  const [pan, setPan] = useState("");
  // The contact registered with the FUND HOUSES, which routinely differs from
  // the Prozpr login. Left collapsed: the account's own is right often enough
  // that surfacing two more fields by default would cost every user a decision
  // most of them do not need to make.
  const [useOtherContact, setUseOtherContact] = useState(false);
  const [contactMobile, setContactMobile] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [step, setStep] = useState<MfcStep>("intro");
  const [starting, setStarting] = useState(false);
  const [request, setRequest] = useState<MfcStartResponse | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const [qrFileName, setQrFileName] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [result, setResult] = useState<MfcImportResponse | null>(null);

  const popupRef = useRef<Window | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  useEffect(() => {
    let cancelled = false;
    getMfcConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setConfigError(
          err instanceof BackendOfflineError
            ? "Backend is unreachable."
            : "Could not check whether MF Central import is available.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Whether a PAN is on file decides if this flow can start at all, so it is
  // read up front rather than discovered by a failed /start.
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((u) => {
        if (!cancelled) setMe(u);
      })
      .catch(() => {
        // Non-fatal: without this we simply ask for the PAN, and the backend
        // still refuses one that contradicts the account's.
        if (!cancelled) setMe(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * MFC's consent app posts back when the investor finishes, in iframe and
   * popup modes alike. Validating the origin matters: without it any page the
   * user has open could push us into the QR step with a forged reqId.
   *
   * This only advances the UI — the QR still has to be uploaded, because the
   * message carries a reqId, not the image.
   */
  useEffect(() => {
    if (step !== "consent" || !config?.mfc_origin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== config.mfc_origin) return;
      const payload = event.data as
        | { type?: string; data?: { status?: string; message?: string } }
        | undefined;
      if (payload?.type !== "mfc-cas-complete") return;

      if (payload.data?.status === "success") {
        setStep("qr");
        toast({
          title: "Consent recorded",
          description: "Now upload the QR code MF Central gave you.",
        });
      } else {
        setQrError(
          payload.data?.message ??
            "MF Central reported an error during consent. Please start again.",
        );
        setStep("qr");
      }
      popupRef.current?.close();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [step, config?.mfc_origin]);

  // The account's PAN wins when there is one; ours is only accepted when there
  // is not (the backend enforces the same rule, and rejects a contradiction).
  const panOnFile = me?.pan_set === true;
  const panValue = pan.trim().toUpperCase();
  const panReady = panOnFile || PAN_RE.test(panValue);
  const contactReady =
    !useOtherContact ||
    /\d{10}/.test(contactMobile.replace(/\D/g, "")) ||
    EMAIL_RE.test(contactEmail.trim());
  const canStart = panReady && contactReady && !starting;

  const handleStart = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const mobile = useOtherContact ? contactMobile.trim() : "";
      const email = useOtherContact ? contactEmail.trim() : "";
      const res = await startMfcCasRequest({
        pan_no: panOnFile ? null : panValue,
        // Exactly one, never both — MFC documents passing both as a rejection,
        // and mobile is preferred because the OTP is an SMS.
        mobile: mobile || null,
        email: mobile ? null : email || null,
      });
      setRequest(res);
      setStep("consent");
      // Opened from inside the click handler's async continuation, which some
      // browsers treat as un-gestured. If it is blocked we fall back to the
      // explicit link on the consent step rather than failing the flow.
      popupRef.current = window.open(
        res.redirect_url,
        "mfc-cas",
        "width=520,height=760",
      );
      if (!popupRef.current) {
        toast({
          title: "Pop-up blocked",
          description: "Use the button on the next screen to open MF Central.",
        });
      }
    } catch (err: unknown) {
      setStartError(
        err instanceof BackendOfflineError
          ? "Backend is unreachable. Please try again in a moment."
          : err instanceof Error
            ? err.message
            : "Could not start the MF Central request.",
      );
    } finally {
      setStarting(false);
    }
  }, [starting, panOnFile, panValue, useOtherContact, contactMobile, contactEmail]);

  const handleQrFile = useCallback(
    async (file: File) => {
      if (validating) return;
      setQrError(null);
      if (file.size > MAX_QR_BYTES) {
        setQrError(
          "That file is far bigger than MF Central's QR image. Upload the PNG they gave you rather than a photo of the screen.",
        );
        return;
      }
      setQrFileName(file.name);
      setValidating(true);
      try {
        const base64 = await readAsBase64(file);
        const res = await validateMfcQr({
          qr_code: base64,
          request_id: request?.request_id ?? null,
          req_id: request?.req_id ?? null,
        });
        setResult(res);
        setStep("done");
        if (res.ingest) onImported?.(res);
      } catch (err: unknown) {
        setQrError(
          err instanceof BackendOfflineError
            ? "Backend is unreachable. Please try again in a moment."
            : err instanceof Error
              ? err.message
              : "Could not read that QR code.",
        );
      } finally {
        setValidating(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [validating, request, onImported],
  );

  const restart = () => {
    setRequest(null);
    setResult(null);
    setQrError(null);
    setQrFileName(null);
    setStep("intro");
  };

  // ------------------------------------------------------------------ gating

  if (configError) {
    return <Notice tone="error" title="MF Central" body={configError} />;
  }
  if (!config) {
    return (
      <div className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking MF Central availability…
      </div>
    );
  }
  if (!config.enabled) {
    return (
      <div className="space-y-3">
        <Notice
          tone="warn"
          title="MF Central isn't configured on this server"
          body="The MFC_* credentials are not set, so the consent flow can't run here. Use the CAS PDF upload instead."
        />
        {onFallback && (
          <button
            type="button"
            onClick={onFallback}
            className="w-full rounded-xl bg-foreground py-3 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
          >
            {fallbackLabel}
          </button>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ steps

  const stepMotion = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
    transition: { duration: 0.2 },
  };

  return (
    <div className="flex flex-col">
      <StepRail step={step} />

      {config.environment === "mock" && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Local mock.</span> No
            MF Central credentials are configured, so this server is serving
            sample holdings. The flow is real; the portfolio it builds is not.
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === "intro" && (
          <motion.div key="intro" {...stepMotion} className="mt-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              MF Central is run by CAMS and KFintech — the two registrars that
              service every mutual fund in India. With your consent they hand us
              your holdings and full transaction history directly, so there is no
              statement to generate, no password to remember, and no PDF to find
              in your inbox.
            </p>

            <div className="mt-4 space-y-2.5">
              <IntroPoint icon={Smartphone} title="You verify with an OTP">
                MF Central sends it to the mobile or email registered with your
                funds — not necessarily the one you use here.
              </IntroPoint>
              <IntroPoint icon={QrCode} title="Choose Detailed, download the QR">
                The QR is how your statement is handed back. Summary works too,
                but it carries no transaction history, so we cannot build returns
                or a net-worth chart from it.
              </IntroPoint>
              <IntroPoint icon={ShieldCheck} title="Nothing is shared without you">
                We never see your MF Central credentials. The consent is yours,
                it is per-request, and it covers this statement only.
              </IntroPoint>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4">
              {panOnFile ? (
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Statement will be requested for
                  </p>
                  <p className="mt-0.5 font-mono text-[13px] text-foreground">
                    {me?.pan_masked ?? "your PAN"}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    MF Central keys the statement on your PAN, so it can only be
                    the one on your account.
                  </p>
                </div>
              ) : (
                <label className="block">
                  <span className="text-[12px] font-medium text-foreground">
                    Your PAN
                  </span>
                  <input
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={10}
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[13px] uppercase tracking-wide text-foreground outline-none transition-colors focus:border-primary"
                  />
                  <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                    {pan && !PAN_RE.test(panValue)
                      ? "That doesn't look like a PAN — five letters, four digits, one letter."
                      : "MF Central assembles the statement from your PAN. It's saved to your profile once the statement imports."}
                  </span>
                </label>
              )}

              {!useOtherContact ? (
                <button
                  type="button"
                  onClick={() => setUseOtherContact(true)}
                  className="text-left text-[11px] leading-relaxed text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                >
                  The OTP goes to {me?.mobile ? `+${me.country_code} ${me.mobile}` : "your registered contact"}.
                  Use a different mobile or email?
                </button>
              ) : (
                <div className="space-y-2.5 border-t border-border pt-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Enter the mobile or email registered with your{" "}
                    <strong className="text-foreground">fund houses</strong> — MF
                    Central sends the OTP there. Fill one, not both.
                  </p>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={contactMobile}
                    onChange={(e) => setContactMobile(e.target.value)}
                    placeholder="Mobile (10 digits)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-primary"
                  />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    disabled={contactMobile.trim().length > 0}
                    placeholder="…or email"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground outline-none transition-colors focus:border-primary disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setUseOtherContact(false);
                      setContactMobile("");
                      setContactEmail("");
                    }}
                    className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                  >
                    Use my account contact instead
                  </button>
                </div>
              )}
            </div>

            {startError && (
              <div className="mt-4">
                <Notice tone="error" title="Couldn't start" body={startError} />
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={!canStart}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98] disabled:opacity-40"
            >
              {starting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Contacting MF Central…
                </>
              ) : (
                <>
                  Continue to MF Central
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            {onFallback && (
              <button
                type="button"
                onClick={onFallback}
                className="mt-3 w-full text-center text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {fallbackLabel}
              </button>
            )}
          </motion.div>
        )}

        {step === "consent" && request && (
          <motion.div key="consent" {...stepMotion} className="mt-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {request.message}
            </p>

            <ol className="mt-4 space-y-2.5">
              <Instruction n={1}>
                Enter the OTP MF Central just sent to{" "}
                <strong className="text-foreground">
                  {request.otp_destination}
                </strong>
                .
              </Instruction>
              <Instruction n={2}>
                Choose <strong className="text-foreground">Detailed</strong> when
                asked which statement you want.
              </Instruction>
              <Instruction n={3}>
                Download the QR code image they show you.
              </Instruction>
              <Instruction n={4}>
                Come back here and upload it — that is what unlocks the data.
              </Instruction>
            </ol>

            <a
              href={request.redirect_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/40"
            >
              <ExternalLink className="h-4 w-4" />
              Open MF Central
            </a>

            <button
              type="button"
              onClick={() => setStep("qr")}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
            >
              I&apos;ve downloaded the QR code
              <ArrowRight className="h-4 w-4" />
            </button>

            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Request {request.req_id} for PAN {request.pan_masked}
            </p>
          </motion.div>
        )}

        {step === "qr" && (
          <motion.div key="qr" {...stepMotion} className="mt-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Upload the QR code image MF Central gave you. It is single-use and
              tied to the request you just made.
            </p>

            <label
              className={`mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                validating
                  ? "border-border bg-secondary/40"
                  : "border-primary/40 bg-primary/5 hover:border-primary"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                disabled={validating}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleQrFile(file);
                }}
              />
              {validating ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-[13px] font-medium text-foreground">
                    Fetching your statement from MF Central…
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    A long history can take up to a minute.
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6 text-primary" />
                  <p className="text-[13px] font-medium text-foreground">
                    {qrFileName ?? "Choose the QR code image"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">PNG or JPG</p>
                </>
              )}
            </label>

            {qrError && (
              <div className="mt-4">
                <Notice tone="error" title="That didn't work" body={qrError} />
                <button
                  type="button"
                  onClick={restart}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/40"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Start again
                </button>
              </div>
            )}

            {!qrError && !validating && (
              <button
                type="button"
                onClick={() => setStep("consent")}
                className="mt-4 w-full text-center text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Back — I still need to get the QR
              </button>
            )}
          </motion.div>
        )}

        {step === "done" && result && (
          <motion.div key="done" {...stepMotion} className="mt-4">
            {result.ingest ? (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-wealth-green/30 bg-wealth-green/5 px-3.5 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-wealth-green" />
                <p className="text-[12px] leading-relaxed text-foreground">
                  {result.message}
                </p>
              </div>
            ) : (
              <div className="mb-4">
                <Notice
                  tone="warn"
                  title="Fetched, but not imported"
                  body={
                    result.rejection ??
                    "This statement can't be used to rebuild your portfolio."
                  }
                />
                <button
                  type="button"
                  onClick={restart}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again with the Detailed statement
                </button>
              </div>
            )}

            <MfcStatementView data={result.data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --------------------------------------------------------------------------- bits

const RAIL: { key: MfcStep; label: string }[] = [
  { key: "intro", label: "Consent" },
  { key: "consent", label: "Verify" },
  { key: "qr", label: "QR code" },
];

const StepRail = ({ step }: { step: MfcStep }) => {
  const index = step === "done" ? RAIL.length : RAIL.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-1.5">
      {RAIL.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <div key={s.key} className="flex flex-1 items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  done
                    ? "bg-wealth-green text-white"
                    : active
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={`text-[11px] ${
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < RAIL.length - 1 && (
              <div
                className={`h-px flex-1 ${done ? "bg-wealth-green/50" : "bg-border"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

const IntroPoint = ({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof QrCode;
  title: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-start gap-2.5">
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
    </div>
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  </div>
);

const Instruction = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5">
    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-foreground">
      {n}
    </span>
    <span className="text-[12px] leading-relaxed text-muted-foreground">
      {children}
    </span>
  </li>
);

const Notice = ({
  tone,
  title,
  body,
}: {
  tone: "error" | "warn";
  title: string;
  body: string;
}) => (
  <div
    className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
      tone === "error"
        ? "border-destructive/30 bg-destructive/5"
        : "border-amber-500/30 bg-amber-500/5"
    }`}
  >
    <AlertTriangle
      className={`mt-0.5 h-4 w-4 shrink-0 ${
        tone === "error" ? "text-destructive" : "text-amber-600"
      }`}
    />
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  </div>
);

/** Strip the `data:image/png;base64,` prefix — the API wants the bare payload,
 * though the backend tolerates either. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      const comma = url.indexOf(",");
      resolve(comma >= 0 ? url.slice(comma + 1) : url);
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

export default MfcCasFlow;
