import { useEffect, useRef, useState } from "react";

import { round1 } from "@/lib/investment-preferences";

// The customer can paste or hold a key down, so anything can land in the
// field in one event. Truncating rather than rejecting matters: a field that
// stops responding to a keystroke reads as broken, not as validating.
function sanitiseDigits(raw: string): string {
  // A sign, a letter, or an exponent character (Number("1e3") is 1000, not
  // the "13" a customer pressed) must not survive to reach `finish`.
  let s = raw.replace(/[^0-9.]/g, "");
  // A second decimal point makes the string an illegal number outright, so
  // drop the extra dots rather than let one keystroke void the whole field.
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  // One decimal place is this screen's whole unit of precision. Truncating
  // here — not rounding later in `finish` — is what keeps "18.44" from ever
  // appearing on screen, even for the one frame before a commit.
  return dot !== -1 && s.length > dot + 2 ? s.slice(0, dot + 2) : s;
}

/**
 * A percentage the customer can tap to type over.
 *
 * It rests as a tinted pill rather than bare text, which does three jobs at
 * once: it says the figure is editable, it makes the customer's OWN number the
 * brightest thing on a row that carries three, and it grows a 46×16 target to
 * something a thumb can hit (spec §7.1).
 *
 * The field clamps to `max` on every keystroke, so an over-budget figure is
 * never displayable. That is the whole point: a value rejected at commit and
 * replaced in the same frame is indistinguishable from the app ignoring you.
 *
 * `select-none` also suppresses iOS's selection callout. `touch-manipulation`
 * and `-webkit-touch-callout` are not needed: this app's viewport already
 * disables double-tap zoom, and neither appears anywhere else in `src/`.
 *
 * The caller still owns the rebalance — this only reports a number in range.
 */
export default function EditableFigure({
  value,
  max,
  label,
  onCommit,
  className,
}: {
  value: number;
  max: number;
  label: string;
  onCommit: (v: number) => void;
  className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const restRef = useRef<HTMLButtonElement>(null);
  const byKey = useRef(false);

  // A keyboard user who commits or cancels would otherwise be dropped on
  // <body>: the input unmounts and the button replacing it comes back
  // unfocused. Only the KEY paths — restoring focus after a blur would drag it
  // back from whatever the customer had just tapped.
  useEffect(() => {
    if (draft === null && byKey.current) {
      byKey.current = false;
      restRef.current?.focus();
    }
  }, [draft]);

  const finish = (commit: boolean) => {
    if (draft === null) return;
    const n = round1(Number(draft));
    // An unchanged value must not commit: it would engage the customer's own
    // distribution — turning "engine decides" into a pin — with no edit.
    if (commit && draft.trim() !== "" && Number.isFinite(n) && n !== value) onCommit(n);
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        // type="number" brings spinners and a locale-dependent separator into a
        // 46px cell; the parse in `finish` is the only validation needed.
        type="text"
        inputMode="decimal"
        aria-label={`${label} share`}
        value={draft}
        onChange={(e) => {
          const sanitised = sanitiseDigits(e.target.value);
          const n = Number(sanitised);
          // String(max), not toFixed(1): "25.0" plus another keystroke is
          // "25.00", which is not > 25 and would slip a second decimal past.
          setDraft(Number.isFinite(n) && n > max ? String(max) : sanitised);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== "Escape") return;
          e.preventDefault();
          byKey.current = true;
          finish(e.key === "Enter");
        }}
        className={`rounded bg-muted px-1 text-right font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50 ${className}`}
      />
    );
  }

  return (
    <button
      ref={restRef}
      type="button"
      aria-label={`${label} share`}
      title="Tap to type a value"
      onClick={() => setDraft(value.toFixed(1))}
      className={`select-none rounded bg-foreground/[0.04] px-1 py-1 text-right font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A868]/50 ${className}`}
    >
      {`${value.toFixed(1)}%`}
    </button>
  );
}
