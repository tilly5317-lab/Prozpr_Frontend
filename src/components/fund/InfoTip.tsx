import { useEffect, useRef, useState, type ReactNode } from "react";

import { GLOSSARY } from "@/lib/fundGlossary";

/**
 * The (i) beside a financial term. Hover on desktop, tap on mobile.
 *
 * Shows what the term means and — the part that actually helps — what a higher
 * or lower value does to the reader.
 *
 * ## The flicker
 *
 * An earlier version rendered a full-screen click-outside layer for every open
 * tip. On hover that layer landed directly under the cursor, so the browser
 * fired `mouseleave` on the icon → the tip closed → the layer unmounted →
 * `mouseenter` fired → the tip opened again, forever.
 *
 * Two rules prevent it:
 *   1. The dismiss layer renders ONLY for a tip opened by click/tap.
 *   2. A hover tip is `pointer-events: none`, so it can never take the hover
 *      off the icon that opened it.
 *
 * Tips also close on scroll and resize, since the panel is fixed-positioned and
 * would otherwise drift away from its icon.
 */
export function InfoTip({
  term,
  size = 13,
  note,
}: {
  term: string;
  size?: number;
  /** Extra line, e.g. the data date — so a metric carries one icon, not two. */
  note?: string;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  /** `pinned` = opened by click/tap and stays until dismissed. */
  const [box, setBox] = useState<{
    left: number;
    w: number;
    pinned: boolean;
    top: number | null;
    bottom: number | null;
  } | null>(null);

  useEffect(() => {
    if (!box) return;
    const off = () => setBox(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [box]);

  const g = GLOSSARY[term];
  if (!g) return null;

  const place = (pinned: boolean) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(258, window.innerWidth - 20);
    const left = Math.max(10, Math.min(window.innerWidth - w - 10, r.left + r.width / 2 - w / 2));
    // Flip above the icon when there isn't room below.
    const below = window.innerHeight - r.bottom > 190;
    setBox({
      left,
      w,
      pinned,
      top: below ? r.bottom + 8 : null,
      bottom: below ? null : window.innerHeight - r.top + 8,
    });
  };

  const hide = () => setBox(null);
  const pinned = !!box?.pinned;

  return (
    <span className="inline-flex align-middle">
      <button
        ref={ref}
        type="button"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse" && !pinned) place(false);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && !pinned) hide();
        }}
        onFocus={() => {
          if (!pinned) place(false);
        }}
        onBlur={() => {
          if (!pinned) hide();
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (pinned) hide();
          else place(true);
        }}
        aria-label={`What is ${g.t}?`}
        className={`shrink-0 rounded-full border leading-none transition-colors ${
          box
            ? "border-[hsl(var(--wealth-blue))] bg-[hsl(var(--wealth-blue))] text-white"
            : "border-border text-muted-foreground hover:border-[hsl(var(--wealth-blue))] hover:text-[hsl(var(--wealth-blue))]"
        }`}
        style={{ width: size, height: size, fontSize: size - 4, fontWeight: 700, padding: 0 }}
      >
        i
      </button>

      {box && (
        <>
          {/* Only a pinned tip gets a dismiss layer — see the note above. */}
          {pinned && (
            <span
              onClick={(e) => {
                e.stopPropagation();
                hide();
              }}
              className="fixed inset-0 z-[60]"
            />
          )}
          <span
            role="tooltip"
            className="fixed z-[61] block rounded-xl border border-border bg-card p-3 text-left shadow-xl"
            style={{
              left: box.left,
              top: box.top ?? undefined,
              bottom: box.bottom ?? undefined,
              width: box.w,
              pointerEvents: pinned ? "auto" : "none",
            }}
          >
            <span className="mb-1.5 block text-[12px] font-semibold text-[hsl(var(--wealth-blue))]">
              {g.t}
            </span>
            <span className="block text-[11px] leading-relaxed text-muted-foreground">{g.what}</span>
            <span className="mt-2 block border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground">
              <b className="font-semibold text-foreground">What it means for you · </b>
              {g.impact}
            </span>
            {note && (
              <span className="mt-1.5 block text-[9.5px] text-muted-foreground/70">{note}</span>
            )}
          </span>
        </>
      )}
    </span>
  );
}

/** A label with its (i) — the usual way to attach the glossary to text. */
export function Term({
  children,
  term,
  className,
  size,
  note,
}: {
  children: ReactNode;
  term?: string;
  className?: string;
  size?: number;
  note?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {children}
      {term && <InfoTip term={term} size={size} note={note} />}
    </span>
  );
}

export default InfoTip;
