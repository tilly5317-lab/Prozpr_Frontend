import { useEffect, useRef } from "react";

/**
 * Screen-level Enter-key shortcut: pressing Enter anywhere fires the screen's
 * primary (highlighted) action — the same button the user would tap.
 *
 * Safety rules:
 *  - Skips when the event was already handled (`defaultPrevented`) — inputs
 *    with their own Enter behaviour (e.g. "add custom goal") call
 *    `preventDefault()` and win.
 *  - Skips native activation targets (button / link / select / textarea /
 *    contenteditable) so Enter keeps its built-in meaning there.
 *  - Skips while a dialog is open above the page.
 *  - `enabled` gates the shortcut per step/screen; the action itself should
 *    still guard on its own validity (disabled state) — this hook mirrors a
 *    click, it doesn't bypass checks.
 */
export function useEnterSubmit(action: () => void, enabled = true): void {
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "BUTTON" || tag === "A" || tag === "SELECT" || tag === "TEXTAREA") return;
        if (target.isContentEditable) return;
        if (target.closest('[role="dialog"], [data-no-enter-submit]')) return;
      }
      e.preventDefault();
      actionRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
