/**
 * Centralised error model + "make it human" helpers.
 *
 * Two rules drive everything here:
 *  1. The user never sees a raw error — no JSON blobs, no "Request failed (500)",
 *     no stack traces. They get one short, kind sentence.
 *  2. When the failure is on *our* side (server down, timeout, unexpected
 *     response) we let them report it instead of leaving them stuck.
 *
 * The raw technical detail is preserved on the error object (`ApiError.raw`) so a
 * bug report can carry it, but it is never rendered directly.
 */

export type ApiErrorKind =
  /** Couldn't reach the backend at all (network down / gateway 502-504). */
  | "offline"
  /** The request was aborted because it took too long. */
  | "timeout"
  /** Backend returned 5xx — our fault, body is not safe/useful to show. */
  | "server"
  /** Backend returned 4xx — usually user- or flow-actionable; message is shown. */
  | "client"
  /** Anything we couldn't classify. */
  | "unknown";

/**
 * Error thrown by the API layer. `message` is always safe to *consider* showing,
 * but prefer {@link getFriendlyErrorMessage} which applies the final polish.
 */
export class ApiError extends Error {
  readonly status?: number;
  readonly kind: ApiErrorKind;
  /** Raw backend payload, kept for diagnostics / bug reports — never shown verbatim. */
  readonly raw?: string;

  constructor(
    message: string,
    opts: { status?: number; kind?: ApiErrorKind; raw?: string } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.kind = opts.kind ?? "unknown";
    this.raw = opts.raw;
    // Keep `instanceof` working after TS/Babel down-levelling.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Backend unreachable. Kept as its own class because many background loaders do
 * `if (err instanceof BackendOfflineError) return;` to stay silent when offline.
 */
export class BackendOfflineError extends ApiError {
  constructor(message = "Backend is not active") {
    super(message, { kind: "offline" });
    this.name = "BackendOfflineError";
    Object.setPrototypeOf(this, BackendOfflineError.prototype);
  }
}

// ── Friendly messages ──────────────────────────────────────────────────────

const GENERIC_FRIENDLY = "Something went wrong on our end. Please try again in a moment.";
const OFFLINE_FRIENDLY = "We're having trouble reaching our servers. Please check your connection and try again.";
const TIMEOUT_FRIENDLY = "This is taking a little longer than usual. Please try again.";

/**
 * Is this string a clean, human sentence we can safely show as-is? Rejects JSON
 * blobs, HTML gateway pages, our own "Request failed (NNN)" placeholder, and
 * anything that smells like a stack trace / runtime exception.
 */
function looksFriendly(message: string): boolean {
  const t = message.trim();
  if (!t) return false;
  if (t.length > 200) return false; // long → almost certainly a dump
  if (/^[[{]/.test(t)) return false; // JSON blob
  if (/^\s*</.test(t)) return false; // HTML
  if (/^request failed \(\d+\)$/i.test(t)) return false; // our placeholder
  if (/traceback|exception|\bat\s+\w+\.\w+|errno|\bstack\b/i.test(t)) return false;
  if (/is not (a function|defined)|cannot read prop/i.test(t)) return false;
  return true;
}

/**
 * Turn any thrown value into one short, kind sentence safe to show the user.
 * @param fallback context-specific friendly message to prefer when we can't
 *                 derive a clean one (e.g. "Couldn't save your goal").
 */
export function getFriendlyErrorMessage(err: unknown, fallback?: string): string {
  const generic = fallback?.trim() || GENERIC_FRIENDLY;

  if (err instanceof BackendOfflineError) return OFFLINE_FRIENDLY;

  if (err instanceof ApiError) {
    switch (err.kind) {
      case "offline":
        return OFFLINE_FRIENDLY;
      case "timeout":
        return TIMEOUT_FRIENDLY;
      case "server":
        return generic; // never surface a 5xx body
      case "client":
        return looksFriendly(err.message) ? err.message : generic;
      default:
        return looksFriendly(err.message) ? err.message : generic;
    }
  }

  if (err instanceof Error) {
    if (/timed out|timeout/i.test(err.message)) return TIMEOUT_FRIENDLY;
    if (/unreachable|failed to fetch|network ?error/i.test(err.message)) return OFFLINE_FRIENDLY;
    return looksFriendly(err.message) ? err.message : generic;
  }

  if (typeof err === "string" && looksFriendly(err)) return err;
  return generic;
}

/**
 * Should we offer a "Report bug" affordance for this error? True when it looks
 * like a problem on our side (server error, offline, timeout, or an unexpected
 * response we couldn't make sense of). False for clean, user-actionable 4xx
 * messages ("Incorrect OTP", "Password must be at least 8 characters", …).
 */
export function isReportableError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.kind !== "client";
  }
  if (err instanceof Error) {
    if (/timed out|timeout|unreachable|failed to fetch|network ?error/i.test(err.message)) {
      return true;
    }
    // A message we can't show cleanly → treat as our-end glitch.
    return !looksFriendly(err.message);
  }
  // Unknown thrown value → assume something broke on our side.
  return true;
}

/** Best-effort raw technical detail for a bug report (never shown in the UI). */
export function getErrorDetail(err: unknown): string {
  if (err instanceof ApiError) {
    const bits = [
      err.status != null ? `status=${err.status}` : null,
      `kind=${err.kind}`,
      err.raw ?? err.message,
    ].filter(Boolean);
    return bits.join(" · ");
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
