/**
 * One front door for showing errors to the user.
 *
 * `toastApiError` guarantees:
 *  - the message is always short and kind (never a JSON blob / status code),
 *  - when the failure is on our side, a "Report bug" button is attached that
 *    opens the report dialog pre-filled with the technical detail.
 *
 * Use it everywhere we used to write `toast.error(err.message)`.
 */
import { toast } from "sonner";
import {
  getErrorDetail,
  getFriendlyErrorMessage,
  isReportableError,
} from "@/lib/errors";
import { openReportIssue, type ReportIssuePrefill } from "@/lib/reportIssue";
import type { IssueSource } from "@/lib/api";

export interface ToastApiErrorOptions {
  /** Friendly fallback when we can't derive a clean message from the error. */
  fallback?: string;
  /** Where the issue happened — pre-selects the report dialog's source. */
  source?: IssueSource;
  /** Never show the "Report bug" action, even for our-end errors. */
  hideReport?: boolean;
}

/** Build a pre-filled, technical-context-carrying description for a bug report. */
export function buildReportPrefill(
  err: unknown,
  friendly: string,
  source?: IssueSource,
): ReportIssuePrefill {
  const where = typeof window !== "undefined" ? window.location.pathname : "";
  const description = [
    `I ran into an error: ${friendly}`,
    "",
    "— please add anything else you were doing —",
    "",
    `(Auto-attached: ${getErrorDetail(err)}${where ? ` @ ${where}` : ""})`,
  ].join("\n");
  return { source, description };
}

/**
 * Show a user-friendly error toast. Adds a "Report bug" action for our-end
 * failures. Returns the friendly message in case the caller also wants it.
 */
export function toastApiError(err: unknown, options: ToastApiErrorOptions = {}): string {
  const { fallback, source, hideReport } = options;
  const message = getFriendlyErrorMessage(err, fallback);

  if (!hideReport && isReportableError(err)) {
    toast.error(message, {
      action: {
        label: "Report bug",
        onClick: () => openReportIssue(buildReportPrefill(err, message, source)),
      },
    });
  } else {
    toast.error(message);
  }
  return message;
}
