import type { ReactNode } from "react";

/** Height of the app-wide BottomNav the footer sits above. */
const BOTTOM_NAV_H = 72;
/** A fixed two-button row — h-11 buttons inside py-3. */
const FOOTER_H = 68;
/** Room a page leaves at its foot so the footer never covers its content. */
export const FOOTER_CLEARANCE = FOOTER_H + BOTTOM_NAV_H + 16;
/** Extra room while the footer shows a note above its buttons. */
export const FOOTER_NOTE_CLEARANCE = 28;

/** `describedBy` names an element that says why a disabled action is waiting. */
type Action = { label: ReactNode; onClick: () => void; disabled?: boolean; describedBy?: string };

/**
 * The preferences screens' sticky action bar, directly above BottomNav so its
 * buttons stay in view while the page scrolls: a secondary action on the left,
 * the primary (gold) one on the right. `note` is one line above the buttons —
 * the place to say why an action is waiting, right where it is tapped.
 */
export default function PreferencesFooter({
  secondary,
  primary,
  note,
}: {
  secondary: Action;
  primary: Action;
  note?: { id: string; text: string };
}) {
  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl"
      style={{ bottom: BOTTOM_NAV_H }}
    >
      {note ? (
        <p id={note.id} className="mx-auto max-w-md px-5 pt-2.5 text-[12px] font-semibold leading-snug text-[hsl(var(--warning))]">
          {note.text}
        </p>
      ) : null}
      <div className="mx-auto flex max-w-md gap-2.5 px-5 py-3">
        <button
          type="button"
          disabled={secondary.disabled}
          onClick={secondary.onClick}
          className="h-11 flex-1 rounded-xl border border-input px-2 text-[13.5px] font-semibold leading-tight text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          {secondary.label}
        </button>
        <button
          type="button"
          disabled={primary.disabled}
          aria-describedby={primary.describedBy}
          onClick={primary.onClick}
          className="h-11 flex-1 rounded-xl bg-[#D4A868] px-2 text-[13.5px] font-semibold leading-tight text-[#191307] transition-[filter] hover:brightness-[1.04] disabled:opacity-40"
        >
          {primary.label}
        </button>
      </div>
    </div>
  );
}
