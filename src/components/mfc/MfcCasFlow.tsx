import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  FolderCheck,
  FolderPlus,
  FolderSearch,
  Lock,
  Loader2,
  MonitorSmartphone,
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
  QR_ARCHIVE_FOLDER,
  ScanCancelled,
  archiveQrCopy,
  chooseDownloadsDirectory,
  ensureArchiveFolder,
  ensurePermission,
  ensureReadPermission,
  forgetRememberedDirectory,
  isDirectoryScanSupported,
  loadRememberedDirectory,
  scanWithRetry,
  watchForNewQr,
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
 *   consent  MFC's own site, embedded in ours (`integration_mode=iframe`,
 *            the default since 2026-09-29 — a second window read as leaving
 *            the app). Summary/Detailed and the QR download happen in there.
 *            We cannot see inside it: MFC exposes no progress API, so the step
 *            ends on their postMessage, on the QR landing in the watched
 *            Downloads folder, or on the user telling us. `popup` still works.
 *   qr       the QR image reaches us. Preferably picked up by itself from the
 *            Downloads folder the user granted once (and copied into our
 *            `Prozpr MF Central QRs` folder there); by file picker otherwise.
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
  // When a PAN is on file we show it masked and request against it by default;
  // this opens an input to send the request under a DIFFERENT PAN instead
  // (a family PAN, or a UAT test PAN against the sandbox).
  const [useDifferentPan, setUseDifferentPan] = useState(false);
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
  // MFC generates the CAS asynchronously; validateQRCode can answer "still
  // generating" for the same (unconsumed) QR. We keep the QR bytes so the user
  // can retry without re-downloading, and `pendingNote` drives that UI.
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const lastQrRef = useRef<{ base64: string; label: string } | null>(null);

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
  // Auto-pickup. A grant held from a previous visit lets the consent step watch
  // the folder with no click at all. `folderKnown` is "a handle exists but has
  // lapsed to prompt" — worth a one-click re-allow rather than a full pick.
  const [folderKnown, setFolderKnown] = useState(false);
  const [folderWritable, setFolderWritable] = useState(false);
  const [watching, setWatching] = useState(false);
  const watchingRef = useRef(false);
  /** Where the last QR copy went (relative to the granted folder), for the UI. */
  const [archivedTo, setArchivedTo] = useState<string | null>(null);
  // QRs already handed to redeemQr, so a watcher restart after a failure looks
  // for a NEWER file instead of re-spending the one that just failed.
  const seenQrRef = useRef<Set<string>>(new Set());
  // Serialises redemption across the watcher, MFC's postMessage and a manual
  // pick: `validating` is state and lags a tick, which was a real double-spend
  // window for a single-use QR.
  const redeemingRef = useRef(false);
  // A ref, not state: the click handler must reach it without an await, or the
  // user activation showDirectoryPicker needs is already spent.
  const dirRef = useRef<DirectoryHandle | null>(null);

  // The frame is someone else's page over the network; until it paints, the
  // card is a blank rectangle that reads as broken. Reset per request, since
  // the frame is torn down and rebuilt only when `request` changes.
  const [frameLoaded, setFrameLoaded] = useState(false);

  const popupRef = useRef<Window | null>(null);
  // Poll handle for watching whether the investor closed the MFC window before
  // finishing — the one signal we get without a postMessage.
  const popupWatchRef = useRef<number | null>(null);
  const [popupClosed, setPopupClosed] = useState(false);
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
      setFolderKnown(true);
      setFolderRemembered(remembered.granted);
      setFolderWritable(remembered.writable);
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

  // MFC's own guides name three different consent hosts (cas-oauth.,
  // cas., mfc-cas-uat.mfcentral.com) and the completion postMessage can arrive
  // from any of them, so pinning a single configured origin silently drops real
  // messages. Trust the configured origin (this covers the mock's localhost)
  // OR any mfcentral.com host — only MFC controls that domain, so the guarantee
  // the origin check exists to give is intact.
  const isTrustedMfcOrigin = useCallback(
    (origin: string) => {
      if (mfcOrigin && origin === mfcOrigin) return true;
      try {
        const host = new URL(origin).hostname.toLowerCase();
        return host === "mfcentral.com" || host.endsWith(".mfcentral.com");
      } catch {
        return false;
      }
    },
    [mfcOrigin],
  );

  const mode = config?.integration_mode ?? "popup";
  // Our OTP screen exists only where a code can be checked — see the note on
  // MfcConfig.otp_capture. On "mfc" this is false, the step never renders, and
  // their hosted page collects the code as it always has.
  const captureOtpHere = config?.otp_capture === "app";
  const otpValue = otpDigits.join("");

  // The account's PAN is used by default when one is on file; the "use a
  // different PAN" toggle sends the typed one instead. With no PAN on file the
  // input is the only source, so it is always shown.
  const panOnFile = me?.pan_set === true;
  // MFC's sandbox fixtures — null everywhere except a non-production box
  // pointed at UAT with the PAN override on, so this card cannot reach a real
  // investor's screen.
  const testData = config?.test_data ?? null;
  const panValue = pan.trim().toUpperCase();
  const usingTypedPan = !panOnFile || useDifferentPan;
  const panReady = usingTypedPan ? PAN_RE.test(panValue) : true;
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
  /** Poll the consent pop-up so a window the investor closes early flips the
   * consent step into its "closed — reopen" state instead of waiting forever
   * for a postMessage that can no longer come. */
  const watchPopup = useCallback(() => {
    if (popupWatchRef.current) window.clearInterval(popupWatchRef.current);
    popupWatchRef.current = window.setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        window.clearInterval(popupWatchRef.current!);
        popupWatchRef.current = null;
        setPopupClosed(true);
      }
    }, 800);
  }, []);

  const openConsentWindow = useCallback(
    (redirectUrl: string) => {
      if (mode === "redirect") {
        // Whole-tab handover. MFC returns the browser to MFC_REDIRECT_URL,
        // which lands on /mfc-cas/callback and routes back here.
        window.location.href = redirectUrl;
        return;
      }
      if (mode !== "popup") return; // iframe mode renders it inline instead.

      setPopupClosed(false);
      // Reuse the blank window opened synchronously on the click (see
      // handleStart) — a browser treats navigating a window it already gave us
      // as gestured, where a fresh window.open in an async continuation is the
      // thing pop-up blockers stop. Only open cold if that pre-open did not run
      // (the OTP-first mock path, or a reopen from the consent screen's button,
      // both of which are themselves inside a live click).
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.location.href = redirectUrl;
      } else {
        popupRef.current = window.open(
          redirectUrl,
          "mfc-cas",
          "width=520,height=760",
        );
      }
      if (!popupRef.current) {
        setPopupClosed(true);
        toast({
          title: "Pop-up blocked",
          description: "Use the button on the consent screen to open MF Central.",
        });
        return;
      }
      popupRef.current.focus?.();
      watchPopup();
    },
    [mode, watchPopup],
  );

  const handleStart = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setStartError(null);

    // Open the pop-up NOW, inside the click, so the browser sees a gestured
    // window.open and lets it through — then park it on a tiny holding page
    // until /start returns and openConsentWindow navigates it to MFC. Skipped
    // when our own OTP screen comes first (the mock): there the window is
    // opened later from the Verify click, which is its own gesture, and a
    // window sitting open behind the OTP box would only confuse.
    if (mode === "popup" && !captureOtpHere) {
      popupRef.current = window.open("about:blank", "mfc-cas", "width=520,height=760");
      if (popupRef.current) {
        try {
          popupRef.current.document.write(
            '<!doctype html><meta charset="utf-8"><title>MF Central</title>' +
              '<body style="font:15px/1.5 system-ui,sans-serif;display:grid;' +
              'place-items:center;height:100vh;margin:0;color:#475569;' +
              'background:#fff">Connecting to MF Central…</body>',
          );
        } catch {
          // Cross-origin once navigated; the holding page is a nicety only.
        }
      }
    }

    try {
      const mobile = useOtherContact ? contactMobile.trim() : "";
      const email = useOtherContact ? contactEmail.trim() : "";
      const res = await startMfcCasRequest({
        // Send the typed PAN whenever the input is in play — either no PAN is on
        // file, or the user chose "use a different PAN". Null means "use my
        // account's PAN", which the backend resolves.
        pan_no: usingTypedPan ? panValue : null,
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
      // The holding-page pop-up was opened before the call; if the call failed
      // there is nothing to navigate it to, so close it rather than leave a
      // blank window stranded.
      popupRef.current?.close();
      popupRef.current = null;
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
    mode,
    captureOtpHere,
    openConsentWindow,
    usingTypedPan,
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
      if (validating || redeemingRef.current) return;
      redeemingRef.current = true;
      setQrError(null);
      setPendingNote(null);
      setQrFileName(label);
      setValidating(true);
      // Remember the QR so a "still generating" answer can be retried without
      // asking the user to fetch it again — it is not consumed in that state.
      lastQrRef.current = { base64, label };
      try {
        const res = await validateMfcQr({
          qr_code: base64,
          request_id: request?.request_id ?? null,
          req_id: request?.req_id ?? null,
        });
        if (res.pending) {
          // MFC is still assembling the statement. Stay on the QR step and let
          // the user retry the same QR in a moment — not a failure, not done.
          setPendingNote(res.pending);
          return;
        }
        setResult(res);
        setStep("done");
        // The statement is in — the consent window (if any is still open) has
        // nothing left to do, and the close watch would keep polling it.
        if (popupWatchRef.current) {
          window.clearInterval(popupWatchRef.current);
          popupWatchRef.current = null;
        }
        popupRef.current?.close();
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
        redeemingRef.current = false;
        setValidating(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [validating, request, onImported],
  );

  const handleQrFile = useCallback(
    async (file: File) => {
      seenQrRef.current.add(qrKey(file));
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
   * Keep a copy of a QR that came from the watched folder in our own
   * sub-folder there. Best-effort and independent of the import: the QR is
   * worth keeping whether or not this exchange succeeds, and a failed copy
   * must never cost the import.
   */
  const archiveFromFolder = useCallback(
    async (file: File) => {
      const dir = dirRef.current;
      if (!dir || !folderWritable) return;
      const path = await archiveQrCopy(dir, file);
      if (path) setArchivedTo(path);
    },
    [folderWritable],
  );

  /** A file found in the granted folder: archive it, then redeem it. */
  const redeemFolderFile = useCallback(
    async (file: File) => {
      void archiveFromFolder(file);
      await handleQrFile(file);
    },
    [archiveFromFolder, handleQrFile],
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
            await redeemFolderFile(likely[0].file);
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
    [startedAt, redeemFolderFile],
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
    setFolderKnown(true);
    setFolderRemembered(true);
    void ensureArchiveFolder(dir).then((ok) => setFolderWritable(ok));
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
   * One-time setup from the intro: pick the Downloads folder (readwrite) and
   * create our archive folder in it right away, so the user can see where the
   * QRs will go before the first one arrives. The grant is remembered, so every
   * later import watches the folder with no click at all.
   */
  const setupAutoPickup = useCallback(async () => {
    let dir: DirectoryHandle;
    try {
      dir = await chooseDownloadsDirectory();
    } catch (err: unknown) {
      // Cancelling the picker is a choice, not a fault — say nothing.
      if (!(err instanceof ScanCancelled)) {
        toast({
          title: "Couldn't set up auto-pickup",
          description: (err as Error).message,
        });
      }
      return;
    }
    dirRef.current = dir;
    setFolderKnown(true);
    setFolderRemembered(true);
    const writable = await ensureArchiveFolder(dir);
    setFolderWritable(writable);
    toast({
      title: "Automatic QR pickup is on",
      description: writable
        ? `Your QR codes will be imported by themselves and copied to ${QR_ARCHIVE_FOLDER}.`
        : "Your QR codes will be imported by themselves.",
    });
  }, []);

  /** A remembered grant that lapsed to "ask": one click restores it. Tries
   * for the archive-capable grant first and settles for read-only. */
  const reallowFolder = useCallback(async () => {
    const dir = dirRef.current;
    if (!dir) return;
    if (await ensurePermission(dir, "readwrite")) {
      setFolderRemembered(true);
      setFolderWritable(true);
      void ensureArchiveFolder(dir);
      return;
    }
    if (await ensurePermission(dir, "read")) {
      setFolderRemembered(true);
      setFolderWritable(false);
    }
  }, []);

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
    setFolderKnown(false);
    setFolderWritable(false);
    setArchivedTo(null);
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
    if (step !== "consent" && step !== "qr") return;
    const stopWatch = () => {
      if (popupWatchRef.current) {
        window.clearInterval(popupWatchRef.current);
        popupWatchRef.current = null;
      }
      setPopupClosed(false);
    };
    const onMessage = (event: MessageEvent) => {
      if (!isTrustedMfcOrigin(event.origin)) return;
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
        stopWatch();
        popupRef.current?.close();
        setStep("qr");
        void redeemQr(base64, payload.data?.filename ?? "cas-request-qr.png");
        return;
      }

      if (payload?.type !== "mfc-cas-complete") return;

      stopWatch();
      if (payload.data?.status === "success") {
        // Already redeeming from an `mfc-cas-download` that arrived first —
        // completion is then just noise, and re-entering the QR step would
        // restart a scan for a file we no longer need.
        if (validating || result) return;
        setStep("qr");
        // No user gesture here, so this can only use a grant already held —
        // which is the common case on a second import, and turns MFC's own
        // "done" button into the last click of the whole flow.
        if (watchingRef.current) {
          // The folder watch is already running and redeems the download the
          // moment it lands; a parallel scan here would race it for the same
          // single-use QR.
        } else if (folderRemembered && dirRef.current) {
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
  }, [
    step,
    isTrustedMfcOrigin,
    folderRemembered,
    rescan,
    redeemQr,
    validating,
    result,
  ]);
  /**
   * Auto-pickup. From the moment MFC's page is open, watch the granted folder
   * for the QR and redeem it the instant it lands — no button, no chooser.
   * This is what makes the in-app (iframe) flow finish on its own: in a frame
   * MFC posts only "complete", never the image, and the download is the only
   * way the QR reaches us. Paused while a redemption is in flight, once the
   * statement is in, and on any state that needs the user first.
   */
  useEffect(() => {
    const dir = dirRef.current;
    if (!request || !startedAt || !folderRemembered || !dir) return;
    if (step !== "consent" && step !== "qr") return;
    if (validating || result || pendingNote || qrError || candidates?.length) return;

    const ctrl = new AbortController();
    setWatching(true);
    watchingRef.current = true;
    void watchForNewQr(dir, {
      // The same slack runScan allows: `startedAt` is when /start returned,
      // and a clock tick between that and the write must not cost the match.
      since: Math.max(0, startedAt - 5000),
      signal: ctrl.signal,
      ignore: (c) => seenQrRef.current.has(qrKey(c.file)),
    })
      .then((hit) => {
        if (ctrl.signal.aborted || !hit) return;
        setCandidates(null);
        setScanNote(null);
        setStep("qr");
        return redeemFolderFile(hit.file);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setWatching(false);
          watchingRef.current = false;
        }
      });
    return () => {
      ctrl.abort();
      setWatching(false);
      watchingRef.current = false;
    };
  }, [
    step,
    request,
    startedAt,
    folderRemembered,
    validating,
    result,
    pendingNote,
    qrError,
    candidates,
    redeemFolderFile,
  ]);

  const restart = () => {
    setArchivedTo(null);
    if (popupWatchRef.current) {
      window.clearInterval(popupWatchRef.current);
      popupWatchRef.current = null;
    }
    popupRef.current?.close();
    popupRef.current = null;
    setPopupClosed(false);
    setRequest(null);
    setResult(null);
    setQrError(null);
    setQrFileName(null);
    setCandidates(null);
    setScanNote(null);
    setStartedAt(0);
    setOtpDigits(Array(6).fill(""));
    setOtpError(null);
    setUseDifferentPan(false);
    setPan("");
    setPendingNote(null);
    lastQrRef.current = null;
    setStep("intro");
  };

  // The pop-up watch is a bare interval; a mid-flow unmount (navigating away)
  // would otherwise leave it ticking against a window that is gone.
  useEffect(
    () => () => {
      if (popupWatchRef.current) window.clearInterval(popupWatchRef.current);
    },
    [],
  );

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
              style={{ height: "min(72vh, 660px)" }}
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
              {panOnFile && !useDifferentPan ? (
                <div>
                  <p className="text-[11px] text-muted-foreground">
                    Statement will be requested for
                  </p>
                  <p className="mt-0.5 font-mono text-[13px] text-foreground">
                    {me?.pan_masked ?? "your PAN"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setUseDifferentPan(true)}
                    className="mt-1.5 text-left text-[11px] leading-relaxed text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                  >
                    Use a different PAN
                  </button>
                </div>
              ) : (
                <label className="block">
                  <span className="text-[12px] font-medium text-foreground">
                    {panOnFile ? "Request for a different PAN" : "Your PAN"}
                  </span>
                  <input
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    maxLength={10}
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    autoFocus={panOnFile}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-[13px] uppercase tracking-wide text-foreground outline-none transition-colors focus:border-primary"
                  />
                  {pan && !PAN_RE.test(panValue) && (
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      Five letters, four digits, one letter.
                    </span>
                  )}
                  {panOnFile && (
                    <button
                      type="button"
                      onClick={() => {
                        setUseDifferentPan(false);
                        setPan("");
                      }}
                      className="mt-1.5 text-left text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                    >
                      Use my account PAN ({me?.pan_masked ?? "on file"})
                    </button>
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

            {/* Local testing against MF Central's UAT sandbox. It answers only
                its own eight PANs, each paired with one test contact, and a
                real account carries a real PAN — so this fills the fields above
                for THIS request only. Nothing on the account changes, and the
                backend only honours it off production with the override on. */}
            {testData && (
              <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-start gap-2.5">
                  <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-foreground">
                      MF Central UAT test data
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      The sandbox answers only its own PANs, each with its test
                      contact. Pick one to fill the request above — for this
                      request only; your account keeps its own PAN.
                    </p>
                    <select
                      value={
                        usingTypedPan && testData.pans.includes(panValue) ? panValue : ""
                      }
                      onChange={(e) => {
                        const chosen = e.target.value;
                        if (!chosen) return;
                        setUseDifferentPan(true);
                        setPan(chosen);
                        setUseOtherContact(true);
                        setContactMobile(testData.mobile);
                        setContactEmail("");
                      }}
                      className="mt-2.5 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] text-foreground outline-none transition-colors focus:border-primary"
                    >
                      <option value="">Choose a test PAN…</option>
                      {testData.pans.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    {usingTypedPan && testData.pans.includes(panValue) && (
                      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                        OTP on MF Central&apos;s page will be{" "}
                        <span className="font-mono font-semibold text-foreground">
                          00{panValue.slice(5, 9)}
                        </span>
                        , sent to +91 {testData.mobile}.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUseOtherContact(true);
                          setContactMobile("");
                          setContactEmail(testData.email);
                        }}
                        className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                      >
                        Use the test email instead ({testData.email})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUseDifferentPan(false);
                          setPan("");
                          setUseOtherContact(false);
                          setContactMobile("");
                          setContactEmail("");
                        }}
                        className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                      >
                        Back to my own details
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Auto-pickup. Chromium desktop only (the folder API), and the
                thing that turns the in-app flow into one click: with the grant
                held, the consent step watches Downloads and imports the QR the
                moment MF Central saves it, keeping a copy in our own folder. */}
            {scanSupported && (
              <div className="mt-3 rounded-2xl border border-border bg-card p-4">
                {folderRemembered ? (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-wealth-green/10">
                      <FolderCheck className="h-3.5 w-3.5 text-wealth-green" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground">
                        Automatic QR pickup is on
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {folderWritable
                          ? `The QR is imported the moment MF Central saves it, and a copy is kept in ${QR_ARCHIVE_FOLDER} inside your Downloads folder.`
                          : "The QR is imported the moment MF Central saves it."}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        {!folderWritable && (
                          <button
                            type="button"
                            onClick={() => void reallowFolder()}
                            className="text-[11px] text-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-primary"
                          >
                            Also keep copies in {QR_ARCHIVE_FOLDER}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void setupAutoPickup()}
                          className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                        >
                          Change folder
                        </button>
                        <button
                          type="button"
                          onClick={() => void stopScanning()}
                          className="text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground"
                        >
                          Turn off
                        </button>
                      </div>
                    </div>
                  </div>
                ) : folderKnown ? (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <FolderSearch className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground">
                        Automatic QR pickup needs your permission again
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        Your browser forgot the folder grant between visits. One
                        click restores it.
                      </p>
                      <button
                        type="button"
                        onClick={() => void reallowFolder()}
                        className="mt-2 rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-all active:scale-[0.98]"
                      >
                        Allow again
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground">
                        Set up automatic QR pickup
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        Choose your Downloads folder once. Prozpr creates a{" "}
                        <span className="font-medium text-foreground">
                          {QR_ARCHIVE_FOLDER}
                        </span>{" "}
                        folder there, and every QR MF Central saves is imported
                        by itself and copied into it — no upload step.
                      </p>
                      <button
                        type="button"
                        onClick={() => void setupAutoPickup()}
                        className="mt-2 flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-all active:scale-[0.98]"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                        Choose Downloads folder
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Skip the pop-up entirely and hand over a QR the investor already
                downloaded (from a consent they started earlier, or one that got
                interrupted). validateQRCode needs a reqId, and the backend falls
                back to this user's most recent request when the frontend has
                none — so this works even after the tab that ran /start is gone.
                No PAN/contact needed here: the QR carries the consent. */}
            <div className="mt-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                or
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={() => {
                setQrError(null);
                setPendingNote(null);
                setStep("qr");
              }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/40"
            >
              <UploadCloud className="h-4 w-4" />
              I already have my QR code — upload it
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
            {/* In iframe mode MFC's page is embedded above (outside
                AnimatePresence); this pane is only the popup/redirect story. */}
            {mode !== "iframe" && (
              <>
                {/* A live status card. OTP, Summary/Detailed and the QR download
                    all happen on MFC's own page, which we cannot see into — so
                    the honest state is "waiting", and the statement returns on
                    MFC's postMessage with no upload needed in the happy path.
                    The pulsing dot is the visible promise that we are still
                    listening; it stops when the window is closed. */}
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                      <MonitorSmartphone className="h-4 w-4 text-foreground" />
                      {!popupClosed && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">
                        {popupClosed
                          ? "MF Central window closed"
                          : "Finish in the MF Central window"}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                        {popupClosed
                          ? "Reopen it to finish — or upload the QR if you already have it."
                          : "Your statement comes back here automatically when you're done."}
                      </p>
                    </div>
                  </div>

                  <ol className="mt-3.5 space-y-2 border-t border-border pt-3.5">
                    {!captureOtpHere && (
                      <ConsentTask>
                        Enter the OTP MF Central sent to{" "}
                        <strong className="text-foreground">
                          {request.otp_destination}
                        </strong>
                      </ConsentTask>
                    )}
                    <ConsentTask>
                      Choose the{" "}
                      <strong className="text-foreground">Detailed</strong>{" "}
                      statement
                    </ConsentTask>
                    <ConsentTask>
                      <strong className="text-foreground">Download</strong> the
                      QR code
                    </ConsentTask>
                  </ol>
                </div>

                <button
                  type="button"
                  onClick={() => openConsentWindow(request.redirect_url)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background py-3 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/40"
                >
                  <ExternalLink className="h-4 w-4" />
                  {popupClosed ? "Reopen MF Central" : "Reopen the window"}
                </button>

              </>
            )}

            {/* Auto-pickup status, in both containers. Under the embedded page
                this is the honest answer to "what happens after I press
                Download": the folder is watched, the QR is redeemed the moment
                it lands, and a copy goes to our archive folder. Without a grant
                it offers the one-click setup instead. */}
            {scanSupported && (
              <div
                className={`${mode === "iframe" ? "mt-3" : "mt-4"} rounded-xl border border-border bg-card px-3.5 py-3`}
              >
                {watching ? (
                  <div className="flex items-start gap-2.5">
                    <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                    </span>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Watching your Downloads folder.
                      </span>{" "}
                      Press <strong className="text-foreground">Download</strong>{" "}
                      on MF Central&apos;s page and the QR is imported by itself
                      {folderWritable
                        ? `, with a copy saved to ${QR_ARCHIVE_FOLDER}.`
                        : "."}
                    </p>
                  </div>
                ) : folderKnown && !folderRemembered ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Automatic pickup needs your Downloads folder again.
                    </p>
                    <button
                      type="button"
                      onClick={() => void reallowFolder()}
                      className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-all active:scale-[0.98]"
                    >
                      Allow
                    </button>
                  </div>
                ) : !folderRemembered ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Choose your Downloads folder once and the QR is imported by
                      itself.
                    </p>
                    <button
                      type="button"
                      onClick={() => void setupAutoPickup()}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background transition-all active:scale-[0.98]"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      Set up
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {/* Fallback path. MFC returns the QR to us over postMessage in
                popup mode, but if that is blocked — or the browser saved the
                QR to disk and no folder is watched — the investor hands it
                over here. This is also the whole story in redirect mode and on
                non-Chromium browsers, where no automatic hand-back exists. */}
            <div className="mt-4 rounded-xl border border-dashed border-border p-3">
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {watching
                  ? "Downloaded it and nothing happened?"
                  : "Didn't come back on its own?"}
              </p>
              <button
                type="button"
                onClick={() => void handleDownloadedClick()}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-foreground py-2.5 text-[12px] font-semibold text-background transition-all active:scale-[0.98]"
              >
                {scanSupported ? (
                  <FolderSearch className="h-3.5 w-3.5" />
                ) : (
                  <UploadCloud className="h-3.5 w-3.5" />
                )}
                I&apos;ve downloaded the QR code
              </button>
              {scanSupported && !folderRemembered && (
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  Your browser will ask for your Downloads folder. We only read
                  images saved since this request started.
                </p>
              )}
            </div>
          </motion.div>
        )}

        {step === "qr" && (
          <motion.div key="qr" {...stepMotion} className="mt-4">
            {!scanning && !pendingNote && (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                The QR is single-use and tied to this request.
              </p>
            )}

            {/* MFC is still building the statement. The same QR is still valid,
                so this is a wait-and-retry, not a failure — no "start again". */}
            {pendingNote && !validating && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-3">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-foreground">
                    MF Central is still generating your statement
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {pendingNote} Your QR is still valid — no need to download it
                    again.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const q = lastQrRef.current;
                      if (q) void redeemQr(q.base64, q.label);
                    }}
                    disabled={!lastQrRef.current}
                    className="mt-2.5 flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-[12px] font-semibold text-background transition-all active:scale-[0.98] disabled:opacity-40"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Try the QR again
                  </button>
                </div>
              </div>
            )}

            {scanning && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-4">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                <p className="text-[12px] text-muted-foreground">
                  Looking for the QR in your Downloads folder…
                </p>
              </div>
            )}

            {!scanning && !validating && watching && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                <p className="text-[12px] text-muted-foreground">
                  Watching your Downloads folder for the QR…
                </p>
              </div>
            )}

            {archivedTo && !qrError && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FolderCheck className="h-3.5 w-3.5 shrink-0 text-wealth-green" />
                Copy saved to {archivedTo}
              </p>
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
                      onClick={() => void redeemFolderFile(c.file)}
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
                {/* The most common cause of a validate failure is an expired or
                    already-used QR — they are short-lived — so the recovery is a
                    fresh consent, uploaded promptly, not another go at this one. */}
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  MF Central QR codes expire quickly and can be used once. If it
                  has been more than a few minutes, start again and upload the
                  new QR straight away.
                </p>
                <button
                  type="button"
                  onClick={restart}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-foreground py-3 text-[13px] font-semibold text-background transition-all active:scale-[0.98]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Start a fresh request
                </button>
              </div>
            )}

            {!qrError && !validating && (
              <button
                type="button"
                // Direct-upload arrivals never ran the consent step (no
                // `request`), so send them back to the start rather than a pane
                // that would render blank.
                onClick={() => setStep(request ? "consent" : "intro")}
                className="mt-4 w-full text-center text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {request ? "Back — I still need to get the QR" : "Back"}
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

            {archivedTo && (
              <p className="mb-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <FolderCheck className="h-3.5 w-3.5 shrink-0 text-wealth-green" />
                QR copy saved to {archivedTo}
              </p>
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

/** One line of the "what to do on MF Central's page" checklist shown while the
 * consent window is open. A plain bullet, not a numbered step of our own rail —
 * these happen on their site, in their order, and we only describe them. */
const ConsentTask = ({ children }: { children: React.ReactNode }) => (
  <li className="flex items-start gap-2.5">
    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
    <span className="text-[11px] leading-relaxed text-muted-foreground">
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

/** Identity of a folder file across scans: Chrome reuses `cas-request-qr.png`
 * with a `(n)` suffix, so the name alone is not enough. */
function qrKey(file: File): string {
  return `${file.name}:${file.lastModified}:${file.size}`;
}

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
