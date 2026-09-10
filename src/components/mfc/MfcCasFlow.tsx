import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  FolderSearch,
  Lock,
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
  verifyMfcOtp,
  type MfcConfig,
  type MfcImportResponse,
  type MfcStartResponse,
  type UserInfo,
} from "@/lib/api";
import {
  ScanCancelled,
  chooseDownloadsDirectory,
  ensureReadPermission,
  forgetRememberedDirectory,
  isDirectoryScanSupported,
  loadRememberedDirectory,
  scanWithRetry,
  type DirectoryHandle,
  type ScanCandidate,
} from "@/lib/downloadScan";
import { toast } from "@/hooks/use-toast";
import { useEnterSubmit } from "@/hooks/useEnterSubmit";
import MfcStatementView from "./MfcStatementView";

/**
 * MF Central consent import — the replacement for generate → email → download →
 * upload of a password-protected CAS PDF.
 *
 * Four steps, but only three are ours:
 *
 *   intro    explain what is about to happen and what they will be asked for
 *   otp      OUR screen, for the code MFC sent. Rendered only where the server
 *            can actually check it (`config.otp_capture === "app"`, which today
 *            means the local mock) — MFC's live API has no OTP endpoint, their
 *            hosted page owns that step, and a box that accepts a code it
 *            cannot verify is worse than no box. Skipped entirely otherwise.
 *   consent  MFC's own site, in a pop-up — Summary/Detailed and the QR
 *            download. We cannot see inside it: MFC exposes no progress API, so
 *            the step ends on their postMessage or on the user telling us.
 *            `integration_mode=iframe` embeds it instead; pop-up is default.
 *   qr       the QR image reaches us. Preferably by reading it straight out of
 *            the Downloads folder; by file picker when that is not possible.
 *   done     everything MFC returned, rendered
 *
 * The QR is single-use. A failed exchange is a dead end for that consent, so
 * nothing here retries automatically and the error copy says to start over
 * rather than "try again". The same property is why the Downloads scan is
 * bounded by when THIS request started — handing back the QR from a previous
 * consent would burn a call and produce an error the user cannot act on.
 */

export type MfcStep = "intro" | "otp" | "consent" | "qr" | "done";

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
  /** When /start returned. The floor for "downloaded during THIS consent". */
  const [startedAt, setStartedAt] = useState(0);

  // Our OTP screen. Six single-character boxes rather than one field: it is the
  // shape people expect from a code, and it lets paste-of-six and
  // type-one-at-a-time both land correctly.
  const [otpDigits, setOtpDigits] = useState<string[]>(() => Array(6).fill(""));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const [qrFileName, setQrFileName] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [result, setResult] = useState<MfcImportResponse | null>(null);

  // Downloads-folder pickup. `scanSupported` is Chromium-only; everywhere else
  // the file input below is the whole story, and none of this renders.
  const [scanSupported] = useState(isDirectoryScanSupported);
  const [folderRemembered, setFolderRemembered] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [candidates, setCandidates] = useState<ScanCandidate[] | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** The folder held images, all older than this request — so offering to look
   * past the cutoff is worth a button rather than a mystery. */
  const [scanTooOld, setScanTooOld] = useState(false);
  // A ref, not state: the click handler must reach it without an await, or the
  // user activation showDirectoryPicker needs is already spent.
  const dirRef = useRef<DirectoryHandle | null>(null);

  // The frame is someone else's page over the network; until it paints, the
  // card is a blank rectangle that reads as broken. Reset per request, since
  // the frame is torn down and rebuilt only when `request` changes.
  const [frameLoaded, setFrameLoaded] = useState(false);

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

  // The remembered Downloads grant, read on mount so the "I've downloaded it"
  // click can be synchronous up to the picker. Read-only and prompt-free.
  useEffect(() => {
    if (!scanSupported) return;
    let cancelled = false;
    loadRememberedDirectory().then((remembered) => {
      if (cancelled || !remembered) return;
      dirRef.current = remembered.handle;
      setFolderRemembered(remembered.granted);
    });
    return () => {
      cancelled = true;
    };
  }, [scanSupported]);


  // `mfc_origin` is a BASE URL, not an origin — in mock mode it carries the
  // `/mfc-mock` path. `event.origin` never does, so comparing them raw silently
  // drops every postMessage the mock sends and the consent step never advances.
  const mfcOrigin = (() => {
    if (!config?.mfc_origin) return null;
    try {
      return new URL(config.mfc_origin).origin;
    } catch {
      return config.mfc_origin;
    }
  })();

  const mode = config?.integration_mode ?? "popup";
  // Our OTP screen exists only where a code can be checked — see the note on
  // MfcConfig.otp_capture. On "mfc" this is false, the step never renders, and
  // their hosted page collects the code as it always has.
  const captureOtpHere = config?.otp_capture === "app";
  const otpValue = otpDigits.join("");

  // The account's PAN wins when there is one; ours is only accepted when there
  // is not (the backend enforces the same rule, and rejects a contradiction).
  const panOnFile = me?.pan_set === true;
  const panValue = pan.trim().toUpperCase();
  const panReady = panOnFile || PAN_RE.test(panValue);
  const contactReady =
    !useOtherContact ||
    /\d{10}/.test(contactMobile.replace(/\D/g, "")) ||
    EMAIL_RE.test(contactEmail.trim());
  // `config` gates the CTA rather than the whole screen: `mode` decides how
  // MFC is opened, so starting before the probe lands would pick the wrong one.
  const canStart = panReady && contactReady && !starting && config !== null;

  /**
   * Hand the investor over to MFC, in whichever container this deployment uses.
   *
   * Split out because it now has two callers: straight after /start when MFC
   * collects the OTP, and after OUR OTP screen clears when we do.
   */
  const openConsentWindow = useCallback(
    (redirectUrl: string) => {
      if (mode === "redirect") {
        // Whole-tab handover. MFC returns the browser to MFC_REDIRECT_URL,
        // which lands on /mfc-cas/callback and routes back here.
        window.location.href = redirectUrl;
        return;
      }
      if (mode !== "popup") return; // iframe mode renders it inline instead.

      // Opened from inside a click handler's async continuation, which some
      // browsers treat as un-gestured. If it is blocked we fall back to the
      // explicit link on the consent step rather than failing the flow.
      popupRef.current = window.open(
        redirectUrl,
        "mfc-cas",
        "width=520,height=760",
      );
      if (!popupRef.current) {
        toast({
          title: "Pop-up blocked",
          description: "Use the button on the next screen to open MF Central.",
        });
      }
    },
    [mode],
  );

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
      setFrameLoaded(false);
      // The floor for the Downloads scan. Set from the client clock because the
      // file timestamps it is compared against come from the same clock.
      setStartedAt(Date.now());
      setOtpDigits(Array(6).fill(""));
      setOtpError(null);

      // MFC sends the OTP the moment the request is registered, so our screen
      // comes BEFORE their page opens — otherwise their OTP box and ours would
      // be on screen at once, asking for the same code.
      if (captureOtpHere) {
        setStep("otp");
        return;
      }

      setStep("consent");
      openConsentWindow(res.redirect_url);
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
  }, [
    starting,
    captureOtpHere,
    openConsentWindow,
    panOnFile,
    panValue,
    useOtherContact,
    contactMobile,
    contactEmail,
  ]);

  /** Write one box and move on. Pasting six digits into any box fills them all. */
  const setOtpAt = useCallback((index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }
    setOtpDigits((prev) => {
      const next = [...prev];
      // One char typed, or a whole code pasted — both spread from here.
      for (let i = 0; i < digits.length && index + i < next.length; i += 1) {
        next[index + i] = digits[i];
      }
      return next;
    });
    const landed = Math.min(index + digits.length, 5);
    otpRefs.current[landed]?.focus();
  }, []);

  const handleOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
        // Backspace on an empty box steps back and clears — the behaviour every
        // OTP field has, and its absence is immediately noticeable.
        e.preventDefault();
        setOtpDigits((prev) => {
          const next = [...prev];
          next[index - 1] = "";
          return next;
        });
        otpRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowLeft" && index > 0) {
        otpRefs.current[index - 1]?.focus();
      } else if (e.key === "ArrowRight" && index < 5) {
        otpRefs.current[index + 1]?.focus();
      }
    },
    [otpDigits],
  );

  /**
   * Check the code, then hand over to MFC.
   *
   * The window opens only after a verified code, which is the whole point of
   * owning this screen: the investor deals with one OTP prompt, ours, and MFC's
   * page picks up at the statement choice.
   */
  const handleVerifyOtp = useCallback(async () => {
    if (verifyingOtp || otpValue.length < 6 || !request) return;
    setVerifyingOtp(true);
    setOtpError(null);
    try {
      const res = await verifyMfcOtp({
        otp: otpValue,
        request_id: request.request_id,
        req_id: request.req_id,
      });
      if (!res.verified) {
        setOtpError(res.message);
        setOtpDigits(Array(6).fill(""));
        otpRefs.current[0]?.focus();
        return;
      }
      setStep("consent");
      openConsentWindow(request.redirect_url);
    } catch (err: unknown) {
      setOtpError(
        err instanceof BackendOfflineError
          ? "Backend is unreachable. Please try again in a moment."
          : err instanceof Error
            ? err.message
            : "Could not check that code.",
      );
    } finally {
      setVerifyingOtp(false);
    }
  }, [verifyingOtp, otpValue, request, openConsentWindow]);

  /**
   * Exchange QR bytes for the statement. The one place that spends a consent.
   *
   * Takes base64 rather than a File because the QR now reaches us three ways:
   * MFC's own `mfc-cas-download` message (no disk at all), a file read out of
   * the Downloads folder, and the manual picker.
   */
  const redeemQr = useCallback(
    async (base64: string, label: string) => {
      if (validating) return;
      setQrError(null);
      setQrFileName(label);
      setValidating(true);
      try {
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

  const handleQrFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_QR_BYTES) {
        setQrError(
          "That file is far bigger than MF Central's QR image. Upload the PNG they gave you rather than a photo of the screen.",
        );
        return;
      }
      await redeemQr(await readAsBase64(file), file.name);
    },
    [redeemQr],
  );

  /**
   * Look through the granted folder for the QR that was just downloaded.
   *
   * Auto-redeems only when the answer is unambiguous — exactly one file whose
   * name looks like a CAS QR. Anything else is offered as a short list, because
   * the QR is single-use and redeeming the wrong image spends the consent.
   */
  const runScan = useCallback(
    async (dir: DirectoryHandle, ignoreTime = false) => {
      setScanning(true);
      setScanNote(null);
      setCandidates(null);
      try {
        // A few seconds of slack: `startedAt` is when /start returned, and a
        // clock that ticks between that and the file write should not cost us
        // the match. Far too small a window to reach a previous consent's QR.
        const since = ignoreTime ? 0 : Math.max(0, startedAt - 5000);
        const report = await scanWithRetry(dir, { since });

        if (report.candidates.length) {
          const likely = report.candidates.filter((c) => c.likely);
          // Never auto-redeem a time-unfiltered result: without the cutoff, the
          // newest matching name could be a previous consent's spent QR.
          if (!ignoreTime && likely.length === 1) {
            await handleQrFile(likely[0].file);
            return;
          }
          setCandidates(report.candidates);
          return;
        }

        // Say what was actually seen. "Nothing turned up" alone gives the user
        // no way to tell a wrong folder from a download that never happened.
        setScanTooOld(!ignoreTime && report.newestSeen != null);
        if (!report.readable) {
          setScanNote("That folder could not be read. Choose the file yourself.");
        } else if (report.imagesSeen === 0) {
          setScanNote(
            "That folder has no images in it at all — it is probably not where your browser saves downloads. Pick the folder again, or choose the file yourself.",
          );
        } else if (report.newestSeen) {
          const when = new Date(report.newestSeen.lastModified).toLocaleTimeString(
            "en-IN",
          );
          setScanNote(
            `Looked at ${report.imagesSeen} image${report.imagesSeen === 1 ? "" : "s"}; the newest is "${report.newestSeen.name}" from ${when}, which predates this request. If MF Central's download did not run, go back and press Download again.`,
          );
        } else {
          setScanNote(
            "Nothing new turned up in that folder. Choose the file yourself.",
          );
        }
      } finally {
        setScanning(false);
      }
    },
    [startedAt, handleQrFile],
  );

  /**
   * "I've downloaded the QR" — the moment we try to spare the user the upload.
   *
   * `chooseDownloadsDirectory` is the browser's own permission prompt and needs
   * transient activation, so it has to be the first await on this path. That is
   * why the remembered handle lives in a ref rather than state.
   *
   * Every failure lands on the same place: the QR step with its file picker.
   * The scan is an accelerator, never a gate.
   */
  const handleDownloadedClick = useCallback(async () => {
    if (!scanSupported) {
      setStep("qr");
      return;
    }
    let dir = dirRef.current;
    try {
      if (dir && !(await ensureReadPermission(dir))) dir = null;
      if (!dir) dir = await chooseDownloadsDirectory();
    } catch (err: unknown) {
      dirRef.current = null;
      setFolderRemembered(false);
      setStep("qr");
      // Cancelling the picker is a choice, not a fault — say nothing.
      setScanNote(err instanceof ScanCancelled ? null : (err as Error).message);
      return;
    }
    dirRef.current = dir;
    setFolderRemembered(true);
    setStep("qr");
    await runScan(dir);
  }, [scanSupported, runScan]);

  /** "Look again" on the QR step, and the no-gesture path after MFC's own
   * postMessage — only usable once a grant is already in hand. */
  const rescan = useCallback(
    async (ignoreTime = false) => {
      const dir = dirRef.current;
      if (!dir) return;
      if (!(await ensureReadPermission(dir))) {
        setFolderRemembered(false);
        return;
      }
      await runScan(dir, ignoreTime);
    },
    [runScan],
  );

  /**
   * Enter fires whatever the current step's highlighted button is.
   *
   * Deliberately nothing on the QR step while a chooser is up: picking the
   * wrong image spends an API call and files a failed attempt, so that one
   * stays an explicit click. Keystrokes inside the consent frame never reach
   * here at all — it is cross-origin, so MFC's own OTP box keeps its Enter.
   */
  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  useEnterSubmit(() => void handleStart(), step === "intro" && canStart);
  useEnterSubmit(
    () => void handleVerifyOtp(),
    step === "otp" && otpValue.length === 6 && !verifyingOtp,
  );
  useEnterSubmit(() => void handleDownloadedClick(), step === "consent");
  useEnterSubmit(
    openFilePicker,
    step === "qr" && !scanning && !validating && !candidates?.length,
  );

  const stopScanning = useCallback(async () => {
    dirRef.current = null;
    setFolderRemembered(false);
    setCandidates(null);
    setScanNote(null);
    setScanTooOld(false);
    await forgetRememberedDirectory();
  }, []);

  /**
   * MFC's consent app posts back when the investor finishes, in iframe and
   * popup modes alike. Validating the origin matters: without it any page the
   * user has open could push us into the QR step with a forged reqId.
   *
   * This only advances the UI — the QR still has to reach us separately,
   * because the message carries a reqId, not the image.
   */
  useEffect(() => {
    if ((step !== "consent" && step !== "qr") || !mfcOrigin) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== mfcOrigin) return;
      const payload = event.data as
        | {
            type?: string;
            data?: {
              status?: string;
              message?: string;
              base64?: string;
              filename?: string;
            };
          }
        | undefined;

      // The QR itself, handed over directly. MFC documents this message for
      // hosts that cannot take a file download; when it arrives there is no
      // download to find, no folder to read and nothing to ask the user for,
      // which is why it is tried before everything else.
      if (payload?.type === "mfc-cas-download") {
        const base64 = payload.data?.base64;
        if (!base64) return;
        popupRef.current?.close();
        setStep("qr");
        void redeemQr(base64, payload.data?.filename ?? "cas-request-qr.png");
        return;
      }

      if (payload?.type !== "mfc-cas-complete") return;

      if (payload.data?.status === "success") {
        // Already redeeming from an `mfc-cas-download` that arrived first —
        // completion is then just noise, and re-entering the QR step would
        // restart a scan for a file we no longer need.
        if (validating || result) return;
        setStep("qr");
        // No user gesture here, so this can only use a grant already held —
        // which is the common case on a second import, and turns MFC's own
        // "done" button into the last click of the whole flow.
        if (folderRemembered && dirRef.current) {
          void rescan();
        } else {
          toast({
            title: "Consent recorded",
            description: "Now hand us the QR code MF Central gave you.",
          });
        }
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
  }, [step, mfcOrigin, folderRemembered, rescan, redeemQr, validating, result]);
  const restart = () => {
    setRequest(null);
    setResult(null);
    setQrError(null);
    setQrFileName(null);
    setCandidates(null);
    setScanNote(null);
    setStartedAt(0);
    setOtpDigits(Array(6).fill(""));
    setOtpError(null);
    setStep("intro");
  };

  // ------------------------------------------------------------------ gating

  if (configError) {
    return <Notice tone="error" title="MF Central" body={configError} />;
  }
  // No "checking availability" screen. This is the only import path, so the
  // intro renders straight away and the probe just decides whether the CTA is
  // live yet (`canStart`) — a spinner in front of static copy is a stall the
  // user reads as slowness, not as caution.
  if (config && !config.enabled) {
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
      <StepRail step={step} withOtp={captureOtpHere} />

      {config?.environment === "mock" && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
          <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Local mock.</span> No
            MF Central credentials are configured, so this server is serving
            sample holdings. The flow is real; the portfolio it builds is not.
          </p>
        </div>
      )}

      {/* Rendered OUTSIDE AnimatePresence and hidden rather than unmounted.
          `redirect_url` is single-use: if the step transition tore this frame
          down, coming back would reload a consumed consent and the investor
          would have to redo the OTP for no reason. `display:none` keeps the
          document — and MFC's session inside it — alive.

          The instruction line lives in here too, above the frame, so the screen
          reads top to bottom as one thing: what to do, the thing to do it in,
          then the button. Left in the animated pane it would have rendered
          BELOW the frame it describes. */}
      {mode === "iframe" && request && step !== "done" && (
        <div className={step === "consent" ? "mt-4" : "hidden"}>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {!captureOtpHere && (
              <>
                OTP sent to{" "}
                <strong className="text-foreground">
                  {request.otp_destination}
                </strong>
                .{" "}
              </>
            )}
            Choose <strong className="text-foreground">Detailed</strong>, then
            download the QR.
          </p>

          <div className="relative mt-3 overflow-hidden rounded-2xl border border-border bg-background">
            {/* A chrome bar, because the frame below is someone else's site and
                an unlabelled box asking for an OTP is exactly what a phishing
                page looks like. Naming the origin is the honest stand-in for
                the address bar this frame does not have — and it carries the
                escape hatch, since a cross-origin frame that refuses to load
                gives us nothing to detect. */}
            <div className="flex items-center gap-2 border-b border-border bg-secondary/40 px-3 py-2">
              <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {mfcOrigin?.replace(/^https?:\/\//, "") ?? "MF Central"}
              </span>
              <a
                href={request.redirect_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in a new tab"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <iframe
              src={request.redirect_url}
              title="MF Central consent"
              onLoad={() => setFrameLoaded(true)}
              className="w-full border-0 bg-white"
              style={{ height: "min(68vh, 600px)" }}
              /* MFC derives the postMessage targetOrigin from document.referrer,
                 falling back to the redirectUrl origin. Ours differs from that
                 in every deployment, so the referrer has to survive — "origin"
                 is the minimum their guide accepts and the least we can leak. */
              referrerPolicy="origin"
              allow="clipboard-write"
            />

            {!frameLoaded && (
              <div className="absolute inset-x-0 bottom-0 top-[33px] flex flex-col items-center justify-center gap-2 bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="text-[12px] text-muted-foreground">
                  Opening MF Central…
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {step === "intro" && (
          <motion.div key="intro" {...stepMotion} className="mt-4">
            <div className="space-y-2.5">
              <IntroPoint icon={Smartphone} title="Verify with an OTP">
                Sent to the contact registered with your funds.
              </IntroPoint>
              <IntroPoint icon={ShieldCheck} title="Your consent, this statement only">
                We never see your MF Central login.
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
                  {pan && !PAN_RE.test(panValue) && (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      Five letters, four digits, one letter.
                    </span>
                  )}
                </label>
              )}

              {!useOtherContact ? (
                <button
                  type="button"
                  onClick={() => setUseOtherContact(true)}
                  className="text-left text-[11px] leading-relaxed text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                >
                  OTP goes to{" "}
                  {me?.mobile ? `+${me.country_code} ${me.mobile}` : "your registered contact"}.
                  Use another?
                </button>
              ) : (
                <div className="space-y-2.5 border-t border-border pt-3">
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    The contact registered with your{" "}
                    <strong className="text-foreground">fund houses</strong>. One,
                    not both.
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
                    Use my account contact
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

          </motion.div>
        )}

        {step === "otp" && request && (
          <motion.div key="otp" {...stepMotion} className="mt-4">
            <div className="flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary">
                <Smartphone className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>

            <h3 className="mt-3 text-center text-[15px] font-semibold text-foreground">
              Enter the code
            </h3>
            <p className="mt-1 text-center text-[12px] leading-relaxed text-muted-foreground">
              MF Central sent a 6-digit code to{" "}
              <strong className="text-foreground">{request.otp_destination}</strong>
            </p>

            <div className="mt-5 flex justify-center gap-2">
              {otpDigits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  value={digit}
                  onChange={(e) => setOtpAt(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                  disabled={verifyingOtp}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  aria-label={`Digit ${i + 1}`}
                  // Not maxLength=1: a pasted six-digit code has to reach
                  // onChange whole for setOtpAt to spread it across the boxes.
                  maxLength={6}
                  className={`h-12 w-11 rounded-xl border bg-background text-center font-mono text-[18px] text-foreground outline-none transition-colors focus:border-primary ${
                    otpError ? "border-destructive/50" : "border-border"
                  }`}
                />
              ))}
            </div>

            {otpError && (
              <p className="mt-3 text-center text-[12px] text-destructive">
                {otpError}
              </p>
            )}

            {/* No SMS exists in a local run, so the code has to come from
                somewhere. `mock_otp` is null against real credentials, which is
                the only thing keeping this off a real investor's screen. */}
            {request.mock_otp && (
              <button
                type="button"
                onClick={() => {
                  setOtpDigits(String(request.mock_otp).slice(0, 6).split(""));
                  setOtpError(null);
                }}
                className="mt-4 flex w-full items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5 text-left transition-colors hover:bg-amber-500/10"
              >
                <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">Local mock.</span>{" "}
                  No SMS is sent — the code is{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {request.mock_otp}
                  </span>
                  . Tap to fill it in.
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleVerifyOtp()}
              disabled={otpValue.length < 6 || verifyingOtp}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98] disabled:opacity-40"
            >
              {verifyingOtp ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  Verify and continue
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              Next you will choose{" "}
              <strong className="text-foreground">Detailed</strong> on MF
              Central&apos;s page and download your QR code.
            </p>

            <button
              type="button"
              onClick={restart}
              className="mt-2 w-full text-center text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
            >
              Didn&apos;t get a code? Start again
            </button>
          </motion.div>
        )}

        {step === "consent" && request && (
          <motion.div
            key="consent"
            {...stepMotion}
            className={mode === "iframe" ? "" : "mt-4"}
          >
            {/* In iframe mode this line is rendered above the frame instead. */}
            {mode !== "iframe" && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                {captureOtpHere
                  ? "MF Central is open in a new window."
                  : `OTP sent to ${request.otp_destination}.`}{" "}
                Choose <strong className="text-foreground">Detailed</strong>,
                then download the QR.
              </p>
            )}

            {mode !== "iframe" && (
              <a
                href={request.redirect_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/40"
              >
                <ExternalLink className="h-4 w-4" />
                Open MF Central
              </a>
            )}

            <button
              type="button"
              onClick={() => void handleDownloadedClick()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3.5 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
            >
              {scanSupported ? <FolderSearch className="h-4 w-4" /> : null}
              I&apos;ve downloaded the QR code
              {scanSupported ? null : <ArrowRight className="h-4 w-4" />}
            </button>

            {scanSupported && !folderRemembered && (
              <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                Your browser will ask for your Downloads folder. We only read
                images saved since this request started.
              </p>
            )}
          </motion.div>
        )}

        {step === "qr" && (
          <motion.div key="qr" {...stepMotion} className="mt-4">
            {!scanning && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                The QR is single-use and tied to this request.
              </p>
            )}

            {scanning && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-4">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <p className="text-[12px] text-muted-foreground">
                  Looking for the QR in your Downloads folder…
                </p>
              </div>
            )}

            {/* More than one plausible file, so we ask rather than guess: a
                wrong redemption spends the consent and cannot be undone. */}
            {!scanning && candidates && candidates.length > 0 && !validating && (
              <div className="mt-4">
                <p className="text-[12px] font-medium text-foreground">
                  {candidates.length === 1
                    ? "Is this the QR code?"
                    : "Which of these is the QR code?"}
                </p>
                <div className="mt-2 space-y-1.5">
                  {candidates.map((c) => (
                    <button
                      key={`${c.name}-${c.lastModified}`}
                      type="button"
                      onClick={() => void handleQrFile(c.file)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary"
                    >
                      <QrCode className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] text-foreground">
                          {c.name}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          Saved {new Date(c.lastModified).toLocaleTimeString("en-IN")}
                        </span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!scanning && scanNote && !qrError && (
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                {scanNote}
              </p>
            )}

            {!scanning && scanTooOld && !qrError && (
              <button
                type="button"
                onClick={() => void rescan(true)}
                className="mt-2 w-full rounded-xl border border-border py-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-accent/40"
              >
                Show every image in that folder
              </button>
            )}

            {!scanning && !validating && folderRemembered && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void rescan()}
                  className="flex items-center gap-1.5 text-[12px] text-foreground transition-colors hover:text-primary"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Look again
                </button>
                <button
                  type="button"
                  onClick={() => void stopScanning()}
                  className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                >
                  Stop reading that folder
                </button>
              </div>
            )}

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
                    Fetching your statement…
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Up to a minute for a long history.
                  </p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6 text-primary" />
                  <p className="text-[13px] font-medium text-foreground">
                    {qrFileName ?? "Choose the QR code image"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    PNG or JPG
                    {scanSupported && candidates?.length ? " — or pick it yourself" : ""}
                  </p>
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
  { key: "intro", label: "Details" },
  { key: "otp", label: "Verify" },
  { key: "consent", label: "Consent" },
  { key: "qr", label: "QR code" },
];

/** The OTP rung is dropped where MFC's own page collects the code. */
const StepRail = ({ step, withOtp }: { step: MfcStep; withOtp: boolean }) => {
  const rail = withOtp ? RAIL : RAIL.filter((s) => s.key !== "otp");
  const index = step === "done" ? rail.length : rail.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-1.5">
      {rail.map((s, i) => {
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
            {i < rail.length - 1 && (
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
