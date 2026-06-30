/**
 * Tiny pub/sub so the global "Report an issue" dialog can be opened imperatively
 * — e.g. from a toast action button, which lives outside the React tree.
 *
 * Mount <GlobalReportIssueDialog /> once (App), then call openReportIssue()
 * from anywhere.
 */
import type { IssueSource } from "@/lib/api";

export interface ReportIssuePrefill {
  /** Pre-select where the issue happened. */
  source?: IssueSource;
  /** Pre-fill the description (we auto-attach technical context for our-end errors). */
  description?: string;
}

type Listener = (prefill: ReportIssuePrefill) => void;

const listeners = new Set<Listener>();

/** Open the global Report-an-issue dialog, optionally pre-filled. */
export function openReportIssue(prefill: ReportIssuePrefill = {}): void {
  listeners.forEach((listener) => listener(prefill));
}

/** Subscribe the mounted dialog to open requests. Returns an unsubscribe fn. */
export function subscribeReportIssue(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
