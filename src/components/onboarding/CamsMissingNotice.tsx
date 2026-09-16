import { UploadCloud } from "lucide-react";

/**
 * The app's one "we don't have your portfolio yet" prompt.
 *
 * Two rules, learned the hard way:
 *
 *  1. **Never block and never auto-open.** It renders inside the page, in the
 *     space it explains, and the import opens only when the user taps it.
 *  2. **One per screen.** Every surface that needs holdings is empty for the
 *     same single reason, so repeating the ask beside each empty section reads
 *     as nagging. The portfolio page shows it once (in the NAV-history slot) and
 *     the allocation card below just renders a dimmed placeholder; the invest
 *     and SIP pages carry no banner at all — the rebalancing page states what's
 *     missing in its own "not ready yet" panel, and chat attaches a CTA to the
 *     reply that needed the data.
 *
 * It is sized for a small fixed slot (the chart frame), which is the only place
 * it currently appears. Adding a second host is a design decision, not a
 * drop-in — check rule 2 first.
 */
export interface CamsMissingNoticeProps {
  /** Opens the CAMS import — owned by the host surface. */
  onAdd: () => void;
  title?: string;
  description?: string;
  ctaLabel?: string;
  className?: string;
}

const GOLD = "#D4A868";

const CamsMissingNotice = ({
  onAdd,
  title = "See your portfolio history",
  description = "Add your CAMS statement — we'll build this from your real holdings.",
  ctaLabel = "Add CAMS statement",
  className = "",
}: CamsMissingNoticeProps) => (
  <div
    className={`flex h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center ${className}`}
  >
    <UploadCloud className="h-6 w-6" style={{ color: GOLD }} />
    <p className="text-[12px] font-medium text-foreground">{title}</p>
    <p className="text-[11px] leading-snug text-muted-foreground">{description}</p>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onAdd();
      }}
      className="mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
      style={{ backgroundColor: GOLD }}
    >
      <UploadCloud className="h-3.5 w-3.5" />
      {ctaLabel}
    </button>
  </div>
);

export default CamsMissingNotice;
